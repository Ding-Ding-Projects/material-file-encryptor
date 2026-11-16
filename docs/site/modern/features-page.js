// Features page behaviour: status and group filters combined with a searchable regex-capable query.
import {mountRowSearch} from './search.js';
import {pick} from './i18n.js';
import {setPressed} from './dom.js';
export async function mountFeaturesPage() {
 const list = document.getElementById('feature-list');
 if (!list) return;
 const cards = [...list.children].map((node, index) => ({id: String(index), node, text: node.dataset.text}));
 const filters = {status: new Set(), group: new Set()};
 let matching = null;
 const count = document.getElementById('feature-count');
 const apply = () => {
  let shown = 0;
  for (const card of cards) {
   const ok = (!matching || matching.has(card.id)) && (!filters.status.size || filters.status.has(card.node.dataset.status)) && (!filters.group.size || filters.group.has(card.node.dataset.group));
   card.node.hidden = !ok; if (ok) shown++;
  }
  count.textContent = pick(`${shown} of ${cards.length} features shown.`, `顯示 ${shown} / ${cards.length} 項功能。`);
 };
 for (const [attribute, set] of [['data-filter-status', filters.status], ['data-filter-group', filters.group]]) {
  for (const chip of document.querySelectorAll(`[${attribute}]`)) chip.addEventListener('click', () => {
   const value = chip.getAttribute(attribute), on = !set.has(value);
   on ? set.add(value) : set.delete(value);
   setPressed(chip, on); apply();
  });
 }
 apply();
 await mountRowSearch(document.querySelector('[data-site-search-rows]'), {label: pick('Search features', '搜尋功能'), id: 'features', rows: () => cards.map(({id, text}) => ({id, text})), apply: (ids, {query}) => { matching = query ? ids : null; apply(); }});
}
