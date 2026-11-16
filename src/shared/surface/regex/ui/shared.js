// Small helpers shared by the builder tabs. Every tab receives the same context object created in
// index.js; the context belongs to exactly one search field, so tabs never share state across fields.
import { element } from '../../registry.js';

export const h = (ctx, tag, props, children) => element(tag, props, children);

export function heading(ctx, en, yue) { return element('h4', { text: ctx.t(en, yue) }); }

/** Debounce with cancel; used so live testing runs once typing pauses. */
export function debounce(fn, ms) {
  let timer;
  const wrapped = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

/** Message shown by tabs that need to execute a pattern when the selected flavor cannot run here. */
export function unsupportedFlavorNotice(ctx) {
  return element('p', { role: 'status', class: 'notice', text: ctx.t(
    'Not supported here: only the JavaScript flavor can run in this surface. Choose JavaScript to test, or use Flavors and Use to see the converted pattern.',
    '此處不支援：只有 JavaScript 風格可在此執行。請選擇 JavaScript 進行測試，或在「風格」及「程式碼」查看轉換結果。') });
}

export function describeError(ctx, result) {
  return result?.error ? element('p', { role: 'alert', class: 'alert', text: result.error }) : null;
}

export async function copyText(ctx, text, done) {
  try { await navigator.clipboard.writeText(text); ctx.notice(done || ctx.t('Copied.', '已複製。')); }
  catch { ctx.notice(ctx.t('Clipboard unavailable; select the text to copy it.', '剪貼簿無法使用，請選取文字複製。')); }
}

export function downloadText(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  element('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function codeBlock(text) { return element('pre', { class: 'code', text }); }

export function panel(id, children) {
  const node = element('div', { class: 'stack tabpanel', role: 'tabpanel', id: `panel-${id}`, hidden: true }, children);
  return node;
}

/** Appends highlighted segments of `sample` to `host`; the selected match gets an extra class. */
export function renderHighlighted(host, segmentsResult, selectedMatch) {
  host.replaceChildren();
  for (const seg of segmentsResult.segments) {
    if (seg.matchIndex < 0) { host.append(document.createTextNode(seg.text)); continue; }
    const span = document.createElement('mark');
    const classes = ['m' + (seg.matchIndex % 2)];
    if (seg.matchIndex === selectedMatch) classes.push('sel');
    for (const g of seg.groups) classes.push('g' + (g % 6));
    span.className = classes.join(' ');
    span.textContent = seg.text;
    host.append(span);
  }
  // Zero-width matches have no text to colour, so the Test tab lists them in words instead.
  host.dataset.zeroWidth = String(segmentsResult.zeroWidth.length);
}
