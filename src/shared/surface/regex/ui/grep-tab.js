// Grep tab: filter a supplied list of text lines (typed, pasted or loaded from a local text file).
// It never reads folders; file and folder grep with replacement is not offered here.
import { element } from '../../registry.js';
import { heading, panel, unsupportedFlavorNotice, copyText } from './shared.js';

export const id = 'grep';
export const label = ['Grep', '搜尋清單'];

const MAX_FILE = 1048576;

export function mount(ctx) {
  const t = ctx.t;
  const lines = element('md-outlined-text-field', { type: 'textarea', rows: 6, maxLength: 200000, label: t('Text list, one entry per line (5000 lines maximum)', '文字清單，每行一項（最多 5000 行）') });
  const invert = element('md-switch', { 'aria-label': t('Show lines that do not match', '顯示不符合的行') });
  const info = element('p', { role: 'status', 'aria-live': 'polite' });
  const results = element('div', { class: 'stack' });
  const notice = unsupportedFlavorNotice(ctx);
  const file = element('input', { type: 'file', hidden: true, accept: 'text/plain,.txt,.log,.csv', onchange: async () => {
    const picked = file.files?.[0];
    file.value = '';
    if (!picked) return;
    if (picked.size > MAX_FILE) { info.textContent = t('The file is larger than 1 MiB.', '檔案超過 1 MiB。'); return; }
    lines.value = (await picked.text()).slice(0, 200000);
    refresh();
  } });
  let token = 0, shown = [];
  async function refresh() {
    const mine = ++token;
    notice.hidden = ctx.isJs();
    results.replaceChildren(); info.textContent = '';
    if (!ctx.isJs() || !ctx.pattern || !lines.value) return;
    const list = lines.value.split(/\r?\n/);
    if (list.length > 5000) { info.textContent = t('Grep is limited to 5000 lines. Remove some lines.', '最多只可搜尋 5000 行，請減少行數。'); return; }
    const result = await ctx.run('grep', { lines: list, invert: invert.selected });
    if (mine !== token) return;
    if (result.error) { info.textContent = result.error; info.setAttribute('role', 'alert'); return; }
    info.setAttribute('role', 'status');
    shown = result.results;
    info.textContent = t(`${result.matchedLines} of ${result.scanned} lines match · ${result.totalMatches} matches in total · ${result.elapsedMs} ms`, `${result.scanned} 行中有 ${result.matchedLines} 行符合 · 共 ${result.totalMatches} 個符合 · ${result.elapsedMs} 毫秒`);
    for (const r of result.results.slice(0, 500)) results.append(element('p', { class: 'group-row', text: `${r.line}: ${r.text.slice(0, 300)}${r.count ? `  [${r.count}]` : ''}` }));
    if (result.results.length > 500) results.append(element('p', { class: 'muted', text: t('Showing the first 500 lines. Use Copy results for the full set.', '只顯示首 500 行，可用「複製結果」取得全部。') }));
  }
  lines.addEventListener('input', refresh);
  invert.addEventListener('change', refresh);
  const node = panel(id, [heading(ctx, 'Grep a text list', '在文字清單搜尋'), notice,
    element('p', { class: 'muted', text: t('Searches only the lines you supply here. Nothing is read from folders and no file is changed.', '只搜尋你在此提供的行，不會讀取資料夾，也不會修改任何檔案。') }),
    lines, element('div', { class: 'row' }, [element('md-outlined-button', { text: t('Load a text file', '載入文字檔'), onclick: () => file.click() }), file,
      element('label', { class: 'row' }, [invert, document.createTextNode(t('Show lines that do not match', '顯示不符合的行'))]),
      element('md-text-button', { text: t('Copy results', '複製結果'), onclick: () => copyText(ctx, shown.map(r => r.text).join('\n')) })]), info, results]);
  return { node, refresh };
}
