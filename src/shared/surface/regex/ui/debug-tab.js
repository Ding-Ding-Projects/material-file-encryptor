// Debug tab: step through match attempts. This is an attempt-level trace for the JavaScript engine;
// the engine exposes no internal backtracking steps and the tab says so.
import { element } from '../../registry.js';
import { heading, panel, unsupportedFlavorNotice } from './shared.js';

export const id = 'debug';
export const label = ['Debug', '除錯'];

export function mount(ctx) {
  const t = ctx.t;
  const from = element('md-outlined-text-field', { label: t('Start at character position', '由字元位置開始'), type: 'number', value: '0', min: 0 });
  const status = element('p', { role: 'status', 'aria-live': 'polite' });
  const subject = element('pre', { class: 'hl', 'aria-label': t('Test text with the current attempt marked', '標示目前嘗試位置的測試文字') });
  const detail = element('div', { class: 'stack', 'aria-live': 'polite' });
  const limits = element('p', { class: 'muted', text: t('Attempt-level trace: each start position is tried in turn and, for a failed attempt, how many leading elements of the expression still matched is measured. The engine exposes no internal backtracking steps, and real engines may skip positions as an optimization, so this does not reproduce engine internals.', '嘗試層級追蹤：逐個起始位置嘗試，並量度失敗嘗試中表達式開頭有多少部分仍然符合。引擎不提供內部回溯步驟，而且真實引擎可能略過部分位置，所以此追蹤並非引擎內部過程。') });
  const notice = unsupportedFlavorNotice(ctx);
  let trace = null, index = 0, token = 0;

  function show() {
    detail.replaceChildren(); subject.replaceChildren();
    if (!trace) return;
    if (trace.error) { status.textContent = trace.error; status.setAttribute('role', 'alert'); return; }
    status.setAttribute('role', 'status');
    const total = trace.attempts.length;
    if (!total) { status.textContent = t('No attempts to show.', '沒有嘗試可顯示。'); return; }
    index = Math.max(0, Math.min(index, total - 1));
    const a = trace.attempts[index];
    const text = ctx.state.sample;
    status.textContent = t(`Attempt ${index + 1} of ${total}${trace.truncated ? ' (trace capped)' : ''} · position ${a.position} · ${a.matched ? 'matched' : 'failed'} · ${trace.elapsedMs} ms`,
      `第 ${index + 1} / ${total} 次嘗試${trace.truncated ? '（追蹤已達上限）' : ''} · 位置 ${a.position} · ${a.matched ? '符合' : '失敗'} · ${trace.elapsedMs} 毫秒`);
    subject.append(document.createTextNode(text.slice(0, a.position)));
    const mark = document.createElement('mark');
    mark.className = a.matched ? 'm0 sel' : 'fail';
    mark.textContent = a.matched ? text.slice(a.position, a.end) || '‸' : (text[a.position] ?? '‸');
    subject.append(mark, document.createTextNode(text.slice(a.matched ? a.end : a.position + (text[a.position] ? 1 : 0))));
    detail.append(element('p', { text: a.matched ? t(`The whole expression matched ${JSON.stringify(a.text)} from ${a.position} to ${a.end}.`, `整個表達式由 ${a.position} 至 ${a.end} 符合 ${JSON.stringify(a.text)}。`)
      : a.reached === null ? t('The expression cannot match starting at this position.', '表達式無法由此位置開始符合。')
        : t(`${a.reached} of ${a.total} leading elements matched here${a.failedAt ? `; the attempt failed at ${JSON.stringify(a.failedAt)}` : ''}.`, `此處開頭 ${a.total} 個元素中有 ${a.reached} 個符合${a.failedAt ? `；在 ${JSON.stringify(a.failedAt)} 失敗` : ''}。`) }));
  }
  async function refresh() {
    const mine = ++token;
    notice.hidden = ctx.isJs();
    if (!ctx.isJs() || !ctx.pattern) { trace = null; show(); return; }
    const result = await ctx.run('debug', { from: Number(from.value) || 0 });
    if (mine !== token) return;
    trace = result; index = 0; show();
  }
  const step = delta => () => { if (trace?.attempts) { index += delta; show(); } };
  const toMatch = () => { if (!trace?.attempts) return; const next = trace.attempts.findIndex((a, i) => i > index && a.matched); index = next >= 0 ? next : index; show(); };
  from.addEventListener('change', refresh);
  const node = panel(id, [heading(ctx, 'Step through attempts', '逐步檢視嘗試'), notice, limits, from,
    element('div', { class: 'row' }, [
      element('md-outlined-button', { text: t('Previous attempt', '上一次嘗試'), onclick: step(-1) }),
      element('md-outlined-button', { text: t('Next attempt', '下一次嘗試'), onclick: step(1) }),
      element('md-outlined-button', { text: t('Next match', '下一個符合'), onclick: toMatch }),
      element('md-text-button', { text: t('Restart', '重新開始'), onclick: () => { index = 0; show(); } })]),
    status, subject, detail]);
  return { node, refresh };
}
