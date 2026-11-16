// Search panels. Each owns one mfe-search control, which brings its own adjacent regex builder, worker-bounded matching and state.
import {pick} from './i18n.js';
const MAX_RESULTS = 30;
async function createSearch(host, label, id) {
 await customElements.whenDefined('mfe-search');
 const search = document.createElement('mfe-search');
 search.setAttribute('label', label);
 search.setAttribute('data-site-search', id);
 host.replaceChildren(search);
 return search;
}
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
function matcherFor(search) {
 if (!search.query) return null;
 try {
  if (search.regex) return new RegExp(search.query, [...new Set((search.flags || 'iu').replace('g', '') + 'g')].join(''));
  return new RegExp(search.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
 } catch { return null; }
}
/** Builds a short snippet around the first match, with the match marked. Bounded input, so bounded work. */
export function snippet(text, matcher) {
 if (!matcher) return escapeHtml(text.slice(0, 140));
 matcher.lastIndex = 0;
 const match = matcher.exec(text);
 if (!match) return escapeHtml(text.slice(0, 140));
 const start = Math.max(0, match.index - 50), end = Math.min(text.length, match.index + match[0].length + 90);
 const before = text.slice(start, match.index), hit = text.slice(match.index, match.index + (match[0].length || 1)), after = text.slice(match.index + (match[0].length || 1), end);
 return (start ? '…' : '') + escapeHtml(before) + '<mark>' + escapeHtml(hit) + '</mark>' + escapeHtml(after) + (end < text.length ? '…' : '');
}
let indexPromise = null;
const loadIndex = url => indexPromise ||= fetch(url, {credentials: 'omit'}).then(response => { if (!response.ok) throw new Error('Search index unavailable'); return response.json(); });

async function mountAll(panel) {
 const host = panel.querySelector('[data-search-host]'), status = panel.querySelector('[data-search-status]'), list = panel.querySelector('[data-search-results]');
 const search = await createSearch(host, pick('Search all documentation', '搜尋全部文件'), 'all');
 let ticket = 0;
 search.addEventListener('search-change', async () => {
  const mine = ++ticket;
  if (!search.query) { list.replaceChildren(); status.textContent = ''; return; }
  status.textContent = pick('Searching…', '搜尋中…');
  let index;
  try { index = await loadIndex(panel.dataset.index); } catch { status.textContent = pick('The search index could not be loaded.', '未能載入搜尋索引。'); return; }
  const items = index.items;
  const result = await search.filter(items.map((item, i) => ({id: String(i), text: `${item.t} ${item.h.join(' ')} ${item.x}`})), {reportOutcome: true});
  if (mine !== ticket || !result.rows) return;
  const matcher = matcherFor(search);
  const shown = result.rows.slice(0, MAX_RESULTS);
  list.replaceChildren(...shown.map((row, order) => {
   const item = items[Number(row.id)], li = document.createElement('li');
   li.className = 'search-result'; li.style.setProperty('--i', String(order));
   const base = panel.dataset.index.replace(/search-index\.json$/, '');
   li.innerHTML = `<a href="${escapeHtml(base + item.u)}"><strong>${escapeHtml(item.t)}</strong><span>${escapeHtml(item.c)} · ${snippet(`${item.h.join(' · ')} ${item.x}`, matcher)}</span></a>`;
   return li;
  }));
  status.textContent = result.outcome === 'failed' || result.outcome === 'unavailable'
   ? pick('The expression could not be used. Check the pattern and flags.', '表達式用唔到，請檢查模式同旗標。')
   : result.rows.length ? pick(`${result.rows.length} articles match${result.rows.length > MAX_RESULTS ? `, showing the first ${MAX_RESULTS}` : ''}.`, `${result.rows.length} 篇文章符合${result.rows.length > MAX_RESULTS ? `，顯示頭 ${MAX_RESULTS} 篇` : ''}。`)
   : pick('No articles match this search.', '搵唔到符合嘅文章。');
 });
}
/** Filters existing DOM rows through an mfe-search. visible(ids) is called with the set of matching row ids. */
export async function mountRowSearch(panel, {label, id, rows, apply}) {
 const host = panel.querySelector('[data-search-host]'), status = panel.querySelector('[data-search-status]');
 const search = await createSearch(host, label, id);
 let ticket = 0;
 const run = async () => {
  const mine = ++ticket, data = rows();
  const result = search.query ? await search.filter(data.map(row => ({id: row.id, text: row.text})), {reportOutcome: true}) : {rows: data, outcome: 'ready'};
  if (mine !== ticket || !result.rows) return;
  apply(new Set(result.rows.map(row => row.id)), {outcome: result.outcome, query: search.query});
  if (status) status.textContent = result.outcome === 'failed' || result.outcome === 'unavailable' ? pick('The expression could not be used.', '表達式用唔到。') : '';
 };
 search.addEventListener('search-change', run);
 return {search, run};
}
export function mountSearchPanels() {
 for (const panel of document.querySelectorAll('[data-site-search-all]')) mountAll(panel).catch(() => {});
}
