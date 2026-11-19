// Sketch board view: pen, marker, eraser, shapes, text, undo/redo, PNG and SVG export, optional save into the unlocked drive.
import {withIcon, iconForLabel} from '../../icons.js';
import { createHistory, restoreHistory, toSvg, constrainPoint, TOOLS } from '../../../shared/toolbox/drawing-history.js';
import { el, createLabels, saveBlob } from '../toolbox-common.js';

const WIDTH = 960, HEIGHT = 600, BACKGROUND = '#ffffff', STORE_KEY = 'mfe.toolbox.drawing.v1';
const TOOL_ICONS = { pen: 'edit', marker: 'edit', eraser: 'close', line: 'minimize', rect: 'maximize', ellipse: 'circle', arrow: 'next', text: 'text' };
const TOOL_LABELS = { pen: ['Pen', '畫筆', 'P'], marker: ['Marker', '螢光筆', 'M'], eraser: ['Eraser', '擦膠', 'E'], line: ['Line', '直線', 'L'], rect: ['Rectangle', '長方形', 'R'], ellipse: ['Ellipse', '橢圓', 'O'], arrow: ['Arrow', '箭咀', 'A'], text: ['Text', '文字', 'T'] };

export function paintShapes(ctx, shapes, scale = 1, background = BACKGROUND) {
  ctx.save(); ctx.scale(scale, scale); ctx.fillStyle = background; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of shapes) {
    ctx.globalAlpha = s.tool === 'marker' ? 0.45 : 1; ctx.lineWidth = s.width; ctx.strokeStyle = s.tool === 'eraser' ? background : s.color; ctx.fillStyle = s.color;
    if (s.points) {
      if (s.points.length === 1) { ctx.beginPath(); ctx.arc(s.points[0][0], s.points[0][1], s.width / 2, 0, Math.PI * 2); ctx.fillStyle = s.tool === 'eraser' ? background : s.color; ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(...s.points[0]); for (const p of s.points.slice(1)) ctx.lineTo(...p); ctx.stroke(); }
    } else if (s.tool === 'line') { ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke(); }
    else if (s.tool === 'rect') { const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2), w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1); if (s.fill) ctx.fillRect(x, y, w, h); else ctx.strokeRect(x, y, w, h); }
    else if (s.tool === 'ellipse') { ctx.beginPath(); ctx.ellipse((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, Math.abs(s.x2 - s.x1) / 2, Math.abs(s.y2 - s.y1) / 2, 0, 0, Math.PI * 2); if (s.fill) ctx.fill(); else ctx.stroke(); }
    else if (s.tool === 'arrow') {
      const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), head = Math.max(10, s.width * 4);
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.x2 - head * Math.cos(angle - 0.45), s.y2 - head * Math.sin(angle - 0.45)); ctx.lineTo(s.x2, s.y2); ctx.lineTo(s.x2 - head * Math.cos(angle + 0.45), s.y2 - head * Math.sin(angle + 0.45)); ctx.stroke();
    } else if (s.tool === 'text') { ctx.font = `${s.size}px sans-serif`; ctx.fillText(s.text, s.x, s.y); }
  }
  ctx.restore();
}

export function mountDrawing(root, { api = window.drive, getLanguage = () => 'en', getDriveLetter = () => null, confirmClear = null, notify = () => {}, storage = globalThis.localStorage } = {}) {
  const labels = createLabels(getLanguage), { tr } = labels;
  root.replaceChildren();
  let history = createHistory();
  try { const saved = storage?.getItem(STORE_KEY); if (saved) history = restoreHistory(saved); } catch { history = createHistory(); }
  const view = el('section', { class: 'toolbox-view', 'aria-labelledby': 'draw-title' });
  const title = labels.text(el('h2', { id: 'draw-title' }), 'Sketch board', '繪圖板');
  const note = labels.text(el('p', { class: 'toolbox-note' }), 'Drawings stay on this device and are kept between sessions. Hold Shift to lock lines to 45 degrees and shapes to squares. Shortcuts apply while the canvas is focused.', '繪圖只存放喺本機，重開程式後仍然保留。按住 Shift 可將直線鎖定 45 度、形狀鎖定為正方。快速鍵喺畫布取得焦點時有效。');

  let tool = 'pen';
  const toolbar = el('div', { class: 'toolbox-row', role: 'radiogroup', 'aria-label': '' }); labels.attr(toolbar, 'aria-label', 'Drawing tools', '繪圖工具');
  const toolButtons = new Map();
  for (const name of TOOLS) {
    const [en, yue, key] = TOOL_LABELS[name];
    const b = el('button', { type: 'button', class: 'toolbox-button', role: 'radio', 'aria-checked': String(name === tool), title: `${en} (${key})` });
    labels.text(b, en, yue); withIcon(b, TOOL_ICONS[name]); b.addEventListener('click', () => selectTool(name)); toolButtons.set(name, b); toolbar.append(b);
  }
  function selectTool(name) { tool = name; for (const [n, b] of toolButtons) b.setAttribute('aria-checked', String(n === name)); textInput.hidden = name !== 'text'; }
  const color = el('input', { type: 'color', value: '#1a1a1a', 'aria-label': '' }); labels.attr(color, 'aria-label', 'Colour', '顏色');
  const width = el('input', { type: 'range', min: 1, max: 40, value: 4, 'aria-label': '' }); labels.attr(width, 'aria-label', 'Stroke width', '線條粗幼');
  const fill = el('input', { type: 'checkbox' }); const fillLabel = el('label', {}, [fill, labels.text(el('span'), 'Fill shapes', '填滿形狀')]);
  const textInput = el('input', { type: 'text', value: 'Text', hidden: true, maxLength: 200, 'aria-label': '' }); labels.attr(textInput, 'aria-label', 'Text to place (click the canvas to place it)', '要放置嘅文字（點擊畫布放置）');
  const canvas = el('canvas', { width: WIDTH, height: HEIGHT, tabIndex: 0, role: 'img', 'aria-label': '' }); labels.attr(canvas, 'aria-label', 'Drawing canvas', '繪圖畫布');
  canvas.className = 'toolbox-canvas';
  const ctx = canvas.getContext('2d');
  const status = el('p', { class: 'toolbox-status', role: 'status' });
  const setStatus = (en, yue, level = 'info') => { status.textContent = tr(en, yue); status.dataset.level = level; };

  let draft = null, drawing = false;
  const redraw = () => { paintShapes(ctx, draft ? [...history.shapes, draft] : history.shapes); undo.disabled = !history.canUndo; redo.disabled = !history.canRedo; clear.disabled = !history.shapes.length; };
  const persist = () => { try { storage?.setItem(STORE_KEY, JSON.stringify(history)); } catch { setStatus('The drawing is too large to keep between sessions. Export it to keep it.', '繪圖太大，唔能保留到下次使用。請匯出保存。', 'error'); } };
  const point = event => { const r = canvas.getBoundingClientRect(); return [(event.clientX - r.left) * WIDTH / r.width, (event.clientY - r.top) * HEIGHT / r.height]; };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return; canvas.focus(); const [x, y] = point(event);
    if (tool === 'text') { const text = textInput.value.trim(); if (text) { history.add({ tool, color: color.value, width: 1, x, y, text, size: Math.max(12, Number(width.value) * 4) }); persist(); redraw(); } return; }
    canvas.setPointerCapture(event.pointerId); drawing = true;
    draft = ['pen', 'marker', 'eraser'].includes(tool) ? { tool, color: color.value, width: tool === 'eraser' ? Number(width.value) * 3 : Number(width.value), points: [[x, y]] } : { tool, color: color.value, width: Number(width.value), x1: x, y1: y, x2: x, y2: y, fill: fill.checked };
    redraw();
  });
  canvas.addEventListener('pointermove', event => {
    if (!drawing || !draft) return; let [x, y] = point(event);
    if (draft.points) { if (draft.points.length < 4000) draft.points.push([x, y]); }
    else { if (event.shiftKey) [x, y] = constrainPoint(draft.x1, draft.y1, x, y, draft.tool); draft.x2 = x; draft.y2 = y; }
    redraw();
  });
  const end = () => { if (!drawing || !draft) return; drawing = false; try { history.add(draft); persist(); } catch (error) { setStatus(error.message, error.message, 'error'); } draft = null; redraw(); };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); (event.shiftKey ? redoNow : undoNow)(); return; }
    if ((event.ctrlKey || event.metaKey) && key === 'y') { event.preventDefault(); redoNow(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const match = Object.entries(TOOL_LABELS).find(([, v]) => v[2].toLowerCase() === key); if (match) { event.preventDefault(); selectTool(match[0]); }
  });

  const button = (en, yue, onclick, primary = false) => { const b = el('button', { type: 'button', class: `toolbox-button${primary ? ' primary' : ''}`, onclick }); labels.text(b, en, yue); withIcon(b, iconForLabel(en)); return b; };
  const undoNow = () => { if (history.undo()) { persist(); redraw(); } }, redoNow = () => { if (history.redo()) { persist(); redraw(); } };
  const undo = button('Undo', '還原', undoNow), redo = button('Redo', '重做', redoNow);
  const clear = button('Clear…', '清除…', async () => {
    const ok = confirmClear ? await confirmClear() : globalThis.confirm?.(tr('Clear the whole drawing? You can still undo it only until you leave this view.', '清除整幅繪圖？離開呢個畫面前仍可還原。'));
    if (ok) { history.clear(); persist(); redraw(); }
  });
  async function exportPng(scale, toDrive) {
    try {
      const out = document.createElement('canvas'); out.width = WIDTH * scale; out.height = HEIGHT * scale; paintShapes(out.getContext('2d'), history.shapes, scale);
      const blob = await new Promise((resolve, reject) => out.toBlob(b => b ? resolve(b) : reject(new Error('The image could not be created.')), 'image/png'));
      const saved = await saveBlob(api, blob, { name: `sketch@${scale}x.png`, filters: [{ name: 'PNG image', extensions: ['png'] }], driveLetter: toDrive ? getDriveLetter() : undefined });
      if (saved) { setStatus(`Saved ${saved.name}.`, `已儲存 ${saved.name}。`); notify({ title: tr('Sketch board', '繪圖板'), message: saved.name, level: 'info' }); }
    } catch (error) { setStatus(error.message, error.message, 'error'); }
  }
  async function exportSvg(toDrive) {
    try { const saved = await saveBlob(api, new Blob([toSvg(history.shapes, { width: WIDTH, height: HEIGHT, background: BACKGROUND })], { type: 'image/svg+xml' }), { name: 'sketch.svg', filters: [{ name: 'SVG image', extensions: ['svg'] }], driveLetter: toDrive ? getDriveLetter() : undefined }); if (saved) setStatus(`Saved ${saved.name}.`, `已儲存 ${saved.name}。`); }
    catch (error) { setStatus(error.message, error.message, 'error'); }
  }
  const scale = el('select', { 'aria-label': '' }); labels.attr(scale, 'aria-label', 'PNG scale', 'PNG 倍數');
  for (const n of [1, 2, 3]) scale.append(el('option', { value: n, text: `${n}×` }));
  const driveSave = button('Save PNG to the drive…', '將 PNG 儲存到磁碟…', () => exportPng(Number(scale.value), true));
  const syncDrive = () => { const letter = getDriveLetter(); driveSave.disabled = !letter; driveSave.title = letter ? '' : tr('Unlock a drive to save into it.', '解鎖磁碟後先可儲存到磁碟。'); };
  const exports = el('div', { class: 'toolbox-row' }, [scale, button('Export PNG…', '匯出 PNG…', () => exportPng(Number(scale.value), false), true), button('Export SVG…', '匯出 SVG…', () => exportSvg(false)), driveSave]);

  view.append(title, note, toolbar, el('div', { class: 'toolbox-row' }, [color, width, fillLabel, textInput, undo, redo, clear]), canvas, exports, status);
  root.append(view); redraw(); syncDrive();
  return { refreshLanguage() { labels.refresh(); syncDrive(); }, refreshDrive: syncDrive, destroy() { root.replaceChildren(); } };
}
