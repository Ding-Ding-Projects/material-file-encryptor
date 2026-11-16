// Test tab: live match highlighting, match navigation, capture group table, expected-outcome
// cases and bounded benchmark. Execution happens in the owner's worker with a hard time budget.
import { element } from '../../registry.js';
import { buildSegments } from '../highlight.js';
import { heading, panel, renderHighlighted, unsupportedFlavorNotice, copyText } from './shared.js';

export const id = 'test';
export const label = ['Test', '測試'];

export function mount(ctx) {
  const t = ctx.t;
  const summary = element('p', { role: 'status', 'aria-live': 'polite' });
  const highlighted = element('pre', { class: 'hl', tabindex: '0', 'aria-label': t('Test text with matches highlighted', '已標示符合內容的測試文字') });
  const nav = element('div', { class: 'row' });
  const groupTable = element('div', { class: 'stack' });
  const matchList = element('div', { class: 'stack' });
  const caseBox = element('md-outlined-text-field', { type: 'textarea', rows: 3, maxLength: 32768, value: '[]', label: t('Expected outcomes JSON: [{"text":"hello","match":true}]', '預期結果 JSON: [{"text":"hello","match":true}]') });
  const caseOut = element('div', { class: 'stack' });
  const benchOut = element('div', { class: 'stack' });
  let last = null, selected = 0, token = 0;

  function show() {
    summary.replaceChildren(); nav.replaceChildren(); groupTable.replaceChildren(); matchList.replaceChildren();
    if (!last) return;
    if (last.error) { summary.append(element('span', { class: 'alert', role: 'alert', text: last.error })); highlighted.textContent = ctx.state.sample; return; }
    const zero = last.matches.filter(m => m.end === m.index).length;
    summary.textContent = t(`${last.count} match${last.count === 1 ? '' : 'es'}${last.truncated ? ' (first ' + last.matches.length + ' shown)' : ''} · ${last.elapsedMs} ms${zero ? ` · ${zero} zero-width` : ''}`,
      `${last.count} 個符合${last.truncated ? '（只顯示首 ' + last.matches.length + ' 個）' : ''} · ${last.elapsedMs} 毫秒${zero ? ` · ${zero} 個零寬度` : ''}`);
    renderHighlighted(highlighted, buildSegments(ctx.state.sample, last.matches), selected);
    if (!last.matches.length) { matchList.append(element('p', { class: 'muted', text: t('No matches. Highlighting is empty.', '沒有符合內容。') })); return; }
    selected = Math.min(selected, last.matches.length - 1);
    const m = last.matches[selected];
    nav.append(
      element('md-outlined-button', { text: t('Previous match', '上一個符合'), onclick: () => { selected = (selected + last.matches.length - 1) % last.matches.length; show(); } }),
      element('md-outlined-button', { text: t('Next match', '下一個符合'), onclick: () => { selected = (selected + 1) % last.matches.length; show(); } }),
      element('span', { text: t(`Match ${selected + 1} of ${last.matches.length} · line ${m.line}, column ${m.column} · ${JSON.stringify(m.text)}`, `第 ${selected + 1} / ${last.matches.length} 個 · 第 ${m.line} 行第 ${m.column} 列 · ${JSON.stringify(m.text)}`) }),
      element('md-text-button', { text: t('Copy all matches', '複製全部符合'), onclick: () => copyText(ctx, last.matches.map(x => x.text).join('\n')) }));
    if (m.groupDetails.length) {
      groupTable.append(element('h5', { text: t('Capture groups of this match', '此符合的擷取群組') }));
      for (const g of m.groupDetails) groupTable.append(element('p', { class: 'group-row', text: `${g.index}${g.name ? ' (' + g.name + ')' : ''}: ${g.text === null ? t('did not participate', '沒有參與') : `${JSON.stringify(g.text)} [${g.start}-${g.end}]`}` }));
    }
    matchList.append(element('h5', { text: t('All matches', '全部符合') }));
    last.matches.slice(0, 100).forEach((x, i) => matchList.append(element('md-text-button', { text: `${i + 1}. @${x.index} ${JSON.stringify(x.text.slice(0, 60))}`, onclick: () => { selected = i; show(); } })));
  }

  async function refresh() {
    const mine = ++token;
    if (!ctx.isJs()) { summary.textContent = ''; return; }
    if (!ctx.pattern) { last = { matches: [], count: 0, elapsedMs: 0 }; show(); return; }
    let cases = [];
    try { cases = JSON.parse(caseBox.value || '[]'); if (!Array.isArray(cases)) throw Error(); } catch { cases = []; }
    const result = await ctx.run('test', { replacement: ctx.state.replacement, cases });
    if (mine !== token) return;
    last = result; selected = 0; show();
    caseOut.replaceChildren();
    for (const c of result.cases || []) caseOut.append(element('p', { text: t(`Case ${c.index + 1}: ${c.passed ? 'PASS' : 'FAIL'} (expected ${c.expected}, actual ${c.actual})`, `案例 ${c.index + 1}：${c.passed ? '通過' : '失敗'}（預期 ${c.expected}，實際 ${c.actual}）`) }));
  }

  const bench = element('md-outlined-button', { text: t('Benchmark on growing input', '以遞增輸入測試效能'), onclick: async () => {
    benchOut.replaceChildren();
    if (!ctx.isJs()) return;
    const result = await ctx.run('benchmark', { sample: ctx.state.sample.slice(0, 4096) });
    if (result.error) { benchOut.append(element('p', { role: 'alert', class: 'alert', text: result.error })); return; }
    for (const r of result.rows) benchOut.append(element('p', { text: t(`${r.factor}x input (${r.length} chars): ${r.averageMs} ms average over ${r.runs} runs, ${r.matches} matches`, `${r.factor} 倍輸入（${r.length} 字）：${r.runs} 次平均 ${r.averageMs} 毫秒，${r.matches} 個符合`) }));
    benchOut.append(element('p', { class: 'muted', text: t(result.complete ? result.note : 'Stopped at the time budget. ' + result.note, result.complete ? '以此引擎量度牆鐘時間，引擎不提供步數或回溯次數。' : '已達時間上限而停止。引擎不提供步數或回溯次數。') }));
  } });
  caseBox.addEventListener('change', refresh);

  const node = panel(id, [heading(ctx, 'Live test', '即時測試'), unsupportedFlavorNotice(ctx), summary, nav, highlighted, groupTable, matchList,
    heading(ctx, 'Expected outcomes', '預期結果'), caseBox, element('md-outlined-button', { text: t('Run outcome cases', '執行預期結果'), onclick: refresh }), caseOut,
    heading(ctx, 'Benchmark', '效能測試'), bench, benchOut]);
  const notice = node.querySelector('.notice');
  return { node, refresh() { notice.hidden = ctx.isJs(); return refresh(); } };
}
