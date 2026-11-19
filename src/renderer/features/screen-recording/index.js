// Screen recording view. The main process lists capture sources, grants exactly the one the user chose and writes
// the WebM chunks to a file picked in a native save dialog. Nothing is uploaded and no preview is kept in memory.
import {withIcon} from '../../icons.js';
import { el, createLabels, formatDuration } from '../toolbox-common.js';

function pickMime() {
  for (const type of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm']) if (globalThis.MediaRecorder?.isTypeSupported?.(type)) return type;
  return '';
}

export function mountScreenRecording(root, { api = window.drive, getLanguage = () => 'en', notify = () => {} } = {}) {
  const labels = createLabels(getLanguage), { tr } = labels;
  root.replaceChildren();
  const view = el('section', { class: 'toolbox-view', 'aria-labelledby': 'rec-title' });
  const title = labels.text(el('h2', { id: 'rec-title' }), 'Screen recording', '螢幕錄影');
  const privacy = labels.text(el('p', { class: 'toolbox-note' }), 'Recordings are written to a file you choose on this computer. Nothing is uploaded. Everything visible in the chosen screen or window is recorded, including private content, so close anything you do not want captured.', '錄影會寫入你揀嘅本機檔案，唔會上載。所揀螢幕或視窗內所有可見內容都會被錄低，包括私人內容，請先關閉唔想被錄到嘅畫面。');
  const unavailable = labels.text(el('p', { class: 'toolbox-status', 'data-level': 'error', hidden: true }), 'Screen recording needs the desktop application and a browser engine that supports MediaRecorder.', '螢幕錄影需要桌面程式，同支援 MediaRecorder 嘅瀏覽器引擎。');
  const grid = el('div', { class: 'toolbox-grid', role: 'radiogroup', 'aria-label': '' }); labels.attr(grid, 'aria-label', 'Screen or window to record', '要錄影嘅螢幕或視窗');
  const refresh = el('button', { type: 'button', class: 'toolbox-button' }); labels.text(refresh, 'Refresh sources', '重新整理來源'); withIcon(refresh, 'refresh');
  const mic = el('input', { type: 'checkbox' });
  const micLabel = el('label', {}, [mic, labels.text(el('span'), 'Include microphone', '包括麥克風')]);
  const ack = el('input', { type: 'checkbox' });
  const ackLabel = el('label', {}, [ack, labels.text(el('span'), 'I understand that everything visible will be recorded.', '我明白所有可見內容都會被錄低。')]);
  const start = el('button', { type: 'button', class: 'toolbox-button primary', disabled: true }); labels.text(start, 'Start recording', '開始錄影'); withIcon(start, 'play');
  const stop = el('button', { type: 'button', class: 'toolbox-button', hidden: true }); labels.text(stop, 'Stop and save', '停止並儲存'); withIcon(stop, 'stop');
  const dot = el('span', { class: 'toolbox-rec-dot', hidden: true, 'aria-hidden': 'true' });
  const timer = el('span', { class: 'toolbox-timer', role: 'timer', 'aria-live': 'off', text: '00:00:00' });
  const status = el('p', { class: 'toolbox-status', role: 'status' });
  const setStatus = (en, yue, level = 'info') => { status.textContent = tr(en, yue); status.dataset.level = level; };

  let selected = null, recorder = null, stream = null, saveId = null, queue = Promise.resolve(), startedAt = 0, tick = 0, disposed = false, sources = [];
  const sync = () => { start.disabled = !selected || !ack.checked || !!recorder || !api?.featureRequest; };
  async function loadSources() {
    if (!api?.featureRequest || !globalThis.MediaRecorder) { unavailable.hidden = false; return; }
    try {
      sources = await api.featureRequest('toolbox', 'recordingSources'); if (disposed) return;
      grid.replaceChildren(...sources.map(source => {
        const card = el('button', { type: 'button', class: 'toolbox-card', role: 'radio', 'aria-checked': String(selected === source.id) });
        const image = source.thumbnail ? el('img', { src: source.thumbnail, alt: '' }) : null;
        card.append(...[image, el('span', { text: `${source.kind === 'screen' ? tr('Screen', '螢幕') : tr('Window', '視窗')}: ${source.name}` })].filter(Boolean));
        card.addEventListener('click', () => { selected = source.id; for (const c of grid.children) c.setAttribute('aria-checked', String(c === card)); sync(); });
        return card;
      }));
      if (!sources.length) setStatus('No screens or windows were found.', '搵唔到螢幕或視窗。', 'error');
    } catch (error) { setStatus(error?.message || 'Sources could not be listed.', '列出來源失敗。', 'error'); }
  }

  async function begin() {
    if (recorder || !selected) return;
    const sourceName = sources.find(s => s.id === selected)?.name || 'recording';
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const target = await api.featureRequest('toolbox', 'beginSave', { name: `recording-${stamp}.webm`, filters: [{ name: 'WebM video', extensions: ['webm'] }] });
      if (!target) { setStatus('No destination chosen. Nothing was recorded.', '未揀儲存位置，冇錄影。'); return; }
      saveId = target.id;
      await api.featureRequest('toolbox', 'recordingArm', { sourceId: selected, microphone: mic.checked });
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (mic.checked) {
        try { const audio = await navigator.mediaDevices.getUserMedia({ audio: true }); for (const track of audio.getAudioTracks()) stream.addTrack(track); }
        catch { setStatus('The microphone was not available, so the recording has no sound.', '用唔到麥克風，所以錄影冇聲音。', 'error'); }
      }
      const mimeType = pickMime();
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = event => { if (event.data?.size) queue = queue.then(async () => api.toolboxWrite(saveId, await event.data.arrayBuffer())).catch(error => { setStatus(error?.message || 'Writing failed.', '寫入失敗。', 'error'); }); };
      recorder.onstop = () => { void finish(); };
      for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => { if (recorder?.state === 'recording') recorder.stop(); });
      recorder.start(1000); startedAt = Date.now();
      tick = setInterval(() => { timer.textContent = formatDuration((Date.now() - startedAt) / 1000); }, 500);
      start.hidden = true; stop.hidden = false; dot.hidden = false; sync(); stop.focus();
      setStatus(`Recording ${sourceName}…`, `正在錄影 ${sourceName}…`);
    } catch (error) {
      await cleanup(true);
      setStatus(error?.name === 'NotAllowedError' ? 'Recording was not allowed.' : error?.message || 'Recording could not start.', error?.name === 'NotAllowedError' ? '錄影未獲允許。' : '錄影無法開始。', 'error');
    }
  }
  async function finish() {
    clearInterval(tick); const id = saveId; saveId = null;
    try {
      await queue; const result = id ? await api.featureRequest('toolbox', 'finishSave', { id }) : null;
      if (result) { setStatus(`Saved ${result.name} (${(result.bytes / 1048576).toFixed(1)} MB).`, `已儲存 ${result.name}（${(result.bytes / 1048576).toFixed(1)} MB）。`); notify({ title: tr('Screen recording', '螢幕錄影'), message: result.name, level: 'info' }); }
    } catch (error) { setStatus(error?.message || 'The recording could not be saved.', '無法儲存錄影。', 'error'); }
    await cleanup(false);
  }
  async function cleanup(abort) {
    clearInterval(tick); if (abort && saveId) { await api.featureRequest('toolbox', 'abortSave', { id: saveId }).catch(() => {}); saveId = null; }
    for (const track of stream?.getTracks?.() || []) track.stop();
    stream = null; recorder = null; await api.featureRequest('toolbox', 'recordingDisarm').catch(() => {});
    start.hidden = false; stop.hidden = true; dot.hidden = true; timer.textContent = '00:00:00'; if (!disposed) sync();
  }
  start.addEventListener('click', () => { void begin(); }); stop.addEventListener('click', () => { if (recorder?.state === 'recording') recorder.stop(); });
  ack.addEventListener('change', sync); refresh.addEventListener('click', () => { void loadSources(); });

  view.append(title, privacy, unavailable, el('div', { class: 'toolbox-row' }, [refresh]), grid, el('div', { class: 'toolbox-row' }, [micLabel, ackLabel]), el('div', { class: 'toolbox-row' }, [start, stop, dot, timer]), status);
  root.append(view); sync(); void loadSources();
  return {
    refreshLanguage() { labels.refresh(); void loadSources(); },
    destroy() { disposed = true; if (recorder?.state === 'recording') recorder.stop(); else void cleanup(true); root.replaceChildren(); },
  };
}
