// Base64 toolkit view. Text conversion runs in the renderer with the pure codec; files stream in bounded chunks,
// either through the main process (picked files, written beside the source) or through the renderer (dropped files).
import { encodeBytes, decodeToBytes, toHexView, buildDataUri, parseDataUri, createStreamEncoder, createStreamDecoder, Base64Error, MAX_TEXT_BYTES, base64NameFor, originalNameFrom, sniffType } from '../../../shared/toolbox/base64-codec.js';
import { el, createLabels, saveBlob } from '../toolbox-common.js';

const ENCODINGS = [['utf-8', 'UTF-8'], ['utf-16le', 'UTF-16 LE'], ['windows-1252', 'Windows-1252'], ['iso-8859-1', 'Latin-1']];
const HISTORY_KEY = 'mfe.toolbox.base64.history.v1';

function encodeTextWith(text, encoding) {
  if (encoding === 'utf-16le') { const out = new Uint8Array(text.length * 2); for (let i = 0; i < text.length; i++) { out[i * 2] = text.charCodeAt(i) & 255; out[i * 2 + 1] = text.charCodeAt(i) >> 8; } return out; }
  if (encoding === 'windows-1252' || encoding === 'iso-8859-1') {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); if (c > 255) throw new Base64Error('UNMAPPABLE', `The character at position ${i} cannot be written in ${encoding}.`, i); out[i] = c; }
    return out;
  }
  return new TextEncoder().encode(text);
}

export function mountBase64Tools(root, { api = window.drive, getLanguage = () => 'en', notify = () => {}, storage = globalThis.localStorage } = {}) {
  const labels = createLabels(getLanguage), { tr } = labels;
  root.replaceChildren();
  const view = el('section', { class: 'toolbox-view', 'aria-labelledby': 'b64-title' });
  const title = labels.text(el('h2', { id: 'b64-title' }), 'Base64 toolkit', 'Base64 工具');
  const privacy = labels.text(el('p', { class: 'toolbox-note' }), 'Everything runs on this device. Nothing is uploaded.', '所有處理都喺本機進行，唔會上載任何內容。');

  const options = el('fieldset', { class: 'toolbox-row' });
  const legend = labels.text(el('legend'), 'Options', '選項');
  const variant = el('select', { 'aria-label': '' }); labels.attr(variant, 'aria-label', 'Variant', '格式');
  for (const [value, en, yue] of [['standard', 'Standard (RFC 4648)', '標準 (RFC 4648)'], ['url', 'URL-safe', 'URL 安全'], ['mime', 'MIME (76 columns)', 'MIME（每行 76 字元）']]) { const o = el('option', { value }); labels.text(o, en, yue); variant.append(o); }
  const pad = el('input', { type: 'checkbox', checked: true });
  const padLabel = el('label', {}, [pad, labels.text(el('span'), 'Padding (=)', '補位 (=)')]);
  const lineLength = el('input', { type: 'number', min: 0, max: 1024, value: 0, 'aria-label': '' }); labels.attr(lineLength, 'aria-label', 'Line length (0 = single line)', '每行長度（0 = 單行）');
  const strict = el('input', { type: 'checkbox' });
  const strictLabel = el('label', {}, [strict, labels.text(el('span'), 'Strict decoding', '嚴格解碼')]);
  const encoding = el('select', { 'aria-label': '' }); labels.attr(encoding, 'aria-label', 'Text encoding', '文字編碼');
  for (const [value, name] of ENCODINGS) encoding.append(el('option', { value, text: name }));
  options.append(legend, variant, padLabel, lineLength, strictLabel, encoding);

  const input = el('textarea', { rows: 6, spellcheck: false, 'aria-label': '' }); labels.attr(input, 'aria-label', 'Input', '輸入');
  const output = el('textarea', { rows: 6, spellcheck: false, readOnly: true, 'aria-label': '' }); labels.attr(output, 'aria-label', 'Output', '輸出');
  const status = el('p', { class: 'toolbox-status', role: 'status' });
  const hex = el('pre', { 'aria-label': '', hidden: true }); labels.attr(hex, 'aria-label', 'Hex view of the bytes', '位元組十六進位檢視');

  const button = (en, yue, onclick, primary = false) => { const b = el('button', { type: 'button', class: `toolbox-button${primary ? ' primary' : ''}`, onclick }); labels.text(b, en, yue); return b; };
  let bytesOfResult = null, undoStack = [], redoStack = [], job = null;
  const setStatus = (en, yue, level = 'info') => { status.textContent = tr(en, yue); status.dataset.level = level; };
  const fail = error => { status.textContent = error instanceof Base64Error && error.offset !== null ? `${tr(error.message, error.message)} (${tr('offset', '位置')} ${error.offset})` : error?.message || String(error); status.dataset.level = 'error'; };
  const current = () => ({ input: input.value, output: output.value });
  const checkpoint = () => { undoStack.push(current()); if (undoStack.length > 100) undoStack.shift(); redoStack = []; syncUndo(); };
  const restore = state => { input.value = state.input; output.value = state.output; bytesOfResult = null; hex.hidden = true; };
  const opts = () => ({ variant: variant.value, pad: pad.checked, lineLength: Number(lineLength.value) || undefined });

  const history = [];
  try { history.push(...JSON.parse(storage?.getItem(HISTORY_KEY) || '[]').slice(-50)); } catch { /* ignore */ }
  const historyList = el('ol', { 'aria-label': '' }); labels.attr(historyList, 'aria-label', 'Conversion history (sizes only; no content is stored)', '轉換記錄（只記大小，唔儲存內容）');
  const record = (kind, inBytes, outBytes) => {
    history.push({ time: Date.now(), kind, variant: variant.value, inBytes, outBytes }); if (history.length > 50) history.shift();
    try { storage?.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* storage unavailable */ }
    renderHistory();
  };
  function renderHistory() {
    historyList.replaceChildren(...history.slice().reverse().map(h => el('li', { text: `${new Date(h.time).toLocaleString()} · ${h.kind} · ${h.variant} · ${h.inBytes} B → ${h.outBytes} B` })));
  }

  function encodeText() {
    try {
      const bytes = encodeTextWith(input.value, encoding.value);
      if (bytes.length > MAX_TEXT_BYTES) throw new Base64Error('TOO_LARGE', 'Text is over 8 MiB. Use a file conversion instead.');
      checkpoint(); bytesOfResult = bytes; output.value = encodeBytes(bytes, opts()); hex.hidden = true;
      record('encode', bytes.length, output.value.length); setStatus(`Encoded ${bytes.length} bytes.`, `已編碼 ${bytes.length} 位元組。`);
    } catch (error) { fail(error); }
  }
  function decodeText() {
    try {
      const raw = input.value.trim(); const direct = raw.startsWith('data:') ? parseDataUri(raw).bytes : decodeToBytes(raw, { strict: strict.checked, variant: variant.value });
      checkpoint(); bytesOfResult = direct;
      try { output.value = new TextDecoder(encoding.value, { fatal: true }).decode(direct); }
      catch { output.value = ''; setStatus('Decoded as binary data: the bytes are not valid text. See the hex view.', '已解碼做二進位資料：位元組唔係有效文字，請睇十六進位檢視。'); showHex(); record('decode', raw.length, direct.length); return; }
      record('decode', raw.length, direct.length);
      const type = sniffType(direct); setStatus(`Decoded ${direct.length} bytes (${type.mime}).`, `已解碼 ${direct.length} 位元組（${type.mime}）。`);
    } catch (error) { fail(error); }
  }
  function showHex() {
    const bytes = bytesOfResult ?? (() => { try { return decodeToBytes(input.value, { strict: false }); } catch { return encodeTextWith(input.value, 'utf-8'); } })();
    hex.hidden = false; hex.textContent = toHexView(bytes, { limit: 4096 });
  }
  const mime = el('input', { type: 'text', value: 'text/plain', 'aria-label': '' }); labels.attr(mime, 'aria-label', 'Media type for data: URL', 'data: URL 媒體類型');
  function makeDataUri() { try { const bytes = encodeTextWith(input.value, encoding.value); checkpoint(); output.value = buildDataUri(bytes, mime.value.trim()); record('data-uri', bytes.length, output.value.length); setStatus('Built a data: URL.', '已建立 data: URL。'); } catch (error) { fail(error); } }
  async function copyOutput() { try { await navigator.clipboard.writeText(output.value); setStatus('Copied to the clipboard.', '已複製到剪貼簿。'); } catch { setStatus('The clipboard is unavailable. Select the output and copy it manually.', '剪貼簿唔可用，請手動選取輸出再複製。', 'error'); } }
  async function pasteInput() { try { checkpoint(); input.value = await navigator.clipboard.readText(); } catch { setStatus('The clipboard could not be read. Paste with Ctrl+V instead.', '讀唔到剪貼簿，請改用 Ctrl+V 貼上。', 'error'); } }
  async function saveText() { try { const saved = await saveBlob(api, new Blob([output.value], { type: 'text/plain' }), { name: 'base64.txt', filters: [{ name: 'Text', extensions: ['txt'] }] }); if (saved) setStatus(`Saved ${saved.name}.`, `已儲存 ${saved.name}。`); } catch (error) { fail(error); } }
  async function saveBytes() { if (!bytesOfResult) { setStatus('Decode something first.', '請先解碼內容。', 'error'); return; } try { const type = sniffType(bytesOfResult); const saved = await saveBlob(api, new Blob([bytesOfResult]), { name: `decoded.${type.extension}` }); if (saved) setStatus(`Saved ${saved.name}.`, `已儲存 ${saved.name}。`); } catch (error) { fail(error); } }

  // ----- Files -----
  const progress = el('progress', { max: 100, value: 0, hidden: true, 'aria-label': '' }); labels.attr(progress, 'aria-label', 'Conversion progress', '轉換進度');
  const cancel = button('Cancel', '取消', () => { job?.abort?.(); }); cancel.hidden = true;
  const drop = el('div', { class: 'toolbox-drop', tabIndex: 0, role: 'group', 'aria-label': '' }); labels.attr(drop, 'aria-label', 'Drop a file to convert it', '拖放檔案以轉換');
  const dropText = labels.text(el('p'), 'Drop a file here. A normal file is encoded; a name.ext.base64.txt file is decoded back to its original name.', '將檔案拖放到呢度。普通檔案會編碼；name.ext.base64.txt 會解碼返原本檔名。');
  drop.append(dropText);
  const busy = value => { progress.hidden = !value; cancel.hidden = !value; if (!value) progress.value = 0; };
  const unsubscribe = api?.onFeatureEvent?.('toolbox', event => { if (event?.type === 'progress' && event.total) { progress.hidden = false; progress.value = Math.min(100, Math.round((event.done / event.total) * 100)); } if (event?.type === 'started') job = { abort: () => api.featureRequest('toolbox', 'cancel', { jobId: event.jobId }) }; });

  async function pickAndConvert(action) {
    if (!api?.featureRequest) { setStatus('File conversion needs the desktop application.', '檔案轉換需要桌面程式。', 'error'); return; }
    try {
      const file = await api.featureRequest('toolbox', 'pickInput'); if (!file) return;
      busy(true); setStatus(`Working on ${file.name}…`, `處理緊 ${file.name}…`);
      const result = await api.featureRequest('toolbox', action, { id: file.id, destination: 'beside', options: opts() });
      if (result?.cancelled) { setStatus('Cancelled.', '已取消。'); return; }
      record(action === 'encodeFile' ? 'file-encode' : 'file-decode', file.size, result.bytes);
      setStatus(`Saved ${result.name} beside the original. ${result.verified ? 'SHA-256 round trip verified.' : 'Round trip could not be verified.'}`, `已將 ${result.name} 儲存喺原檔案旁邊。${result.verified ? 'SHA-256 往返驗證成功。' : '往返驗證失敗。'}`, result.verified ? 'info' : 'error');
      notify({ title: tr('Base64 toolkit', 'Base64 工具'), message: result.name, level: 'info' });
    } catch (error) { fail(error); } finally { busy(false); job = null; }
  }

  async function streamDropped(file) {
    const decoding = originalNameFrom(file.name) !== null;
    const controller = new AbortController(); job = controller; busy(true);
    try {
      const name = decoding ? originalNameFrom(file.name) : base64NameFor(file.name);
      const target = api?.featureRequest ? await api.featureRequest('toolbox', 'beginSave', { name }) : null;
      if (!target) { setStatus('No destination chosen.', '未揀儲存位置。'); return; }
      let written = 0; const pieces = [];
      const sink = async data => { if (!data.length) return; const part = typeof data === 'string' ? new TextEncoder().encode(data) : data; await api.toolboxWrite(target.id, part); written += part.length; };
      try {
        const coder = decoding ? createStreamDecoder({ variant: variant.value }) : createStreamEncoder(opts());
        const reader = file.stream().getReader(); let done = 0; const decoder = new TextDecoder('ascii');
        for (;;) {
          controller.signal.throwIfAborted(); const { value, done: finished } = await reader.read(); if (finished) break;
          await sink(decoding ? coder.write(decoder.decode(value, { stream: true })) : coder.write(value)); done += value.length; progress.hidden = false; progress.value = Math.round((done / Math.max(1, file.size)) * 100);
        }
        await sink(coder.finish());
        await api.featureRequest('toolbox', 'finishSave', { id: target.id });
      } catch (error) { await api.featureRequest('toolbox', 'abortSave', { id: target.id }).catch(() => {}); throw error; }
      record(decoding ? 'file-decode' : 'file-encode', file.size, written); setStatus(`Saved ${target.name}.`, `已儲存 ${target.name}。`);
    } catch (error) { if (error?.name === 'AbortError') setStatus('Cancelled.', '已取消。'); else fail(error); } finally { busy(false); job = null; }
  }
  drop.addEventListener('dragover', event => { event.preventDefault(); drop.dataset.active = 'true'; });
  drop.addEventListener('dragleave', () => { drop.dataset.active = 'false'; });
  drop.addEventListener('drop', event => { event.preventDefault(); drop.dataset.active = 'false'; const file = event.dataTransfer?.files?.[0]; if (file) void streamDropped(file); });

  const undo = button('Undo', '還原', () => { const s = undoStack.pop(); if (!s) return; redoStack.push(current()); restore(s); syncUndo(); });
  const redo = button('Redo', '重做', () => { const s = redoStack.pop(); if (!s) return; undoStack.push(current()); restore(s); syncUndo(); });
  function syncUndo() { undo.disabled = !undoStack.length; redo.disabled = !redoStack.length; }

  const actions = el('div', { class: 'toolbox-row' }, [
    button('Encode', '編碼', encodeText, true), button('Decode', '解碼', decodeText, true), button('Hex view', '十六進位檢視', showHex),
    button('Build data: URL', '建立 data: URL', makeDataUri), mime, undo, redo,
  ]);
  const ioActions = el('div', { class: 'toolbox-row' }, [
    button('Paste', '貼上', pasteInput), button('Copy output', '複製輸出', copyOutput), button('Save output as text', '將輸出儲存為文字', saveText),
    button('Save decoded bytes', '儲存解碼後嘅位元組', saveBytes),
    button('Clear', '清除', () => { checkpoint(); input.value = ''; output.value = ''; hex.hidden = true; bytesOfResult = null; }),
  ]);
  const fileActions = el('div', { class: 'toolbox-row' }, [button('Encode a file…', '編碼檔案…', () => pickAndConvert('encodeFile')), button('Decode a file…', '解碼檔案…', () => pickAndConvert('decodeFile')), cancel]);
  const historyTitle = labels.text(el('h3'), 'History', '記錄');
  view.append(title, privacy, options, input, actions, output, ioActions, hex, labels.text(el('h3'), 'Files', '檔案'), fileActions, drop, progress, status, historyTitle, historyList);
  root.append(view); syncUndo(); renderHistory();

  return { refreshLanguage() { labels.refresh(); }, destroy() { unsubscribe?.(); job?.abort?.(); root.replaceChildren(); } };
}
