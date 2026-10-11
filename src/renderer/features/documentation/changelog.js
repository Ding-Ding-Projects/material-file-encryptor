import { createScopedSearch } from '../../scoped-search.js';

export function filterChanges(entries, { from = '', to = '', category = '' } = {}) {
  return entries.filter(entry => (!from || (entry.date && entry.date >= from)) && (!to || (entry.date && entry.date <= to)) && (!category || entry.category === category));
}
export function mountChangelog(host, { entries = [], translate = value => value, onExport } = {}) {
  host.replaceChildren(); let generation = 0, selected = [];
  const searchHost = document.createElement('div'), controls = document.createElement('div'), content = document.createElement('div');
  const date = label => { const wrap = document.createElement('label'), input = document.createElement('input'); wrap.textContent = translate(label); input.type = 'date'; wrap.append(input); controls.append(wrap); return input; };
  const from = date('From date'), to = date('To date');
  const category = document.createElement('select'); category.setAttribute('aria-label', translate('Category'));
  for (const value of ['', ...new Set(entries.map(row => row.category).filter(Boolean))]) { const option = document.createElement('option'); option.value = value; option.textContent = value || translate('All categories'); category.append(option); }
  const exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.textContent = translate('Export filtered changes');
  controls.append(category, exportButton); host.append(searchHost, controls, content);
  const search = createScopedSearch(searchHost, translate, render);
  async function render() {
    const request = ++generation;
    const filtered = filterChanges(entries, { from: from.value, to: to.value, category: category.value });
    const rows = await search.filter(filtered.map((row, index) => ({ ...row, id: String(index), path: `${row.title}\n${row.markdown}` })));
    if (request !== generation) return;
    selected = rows; content.replaceChildren();
    if (!rows.length) { const empty = document.createElement('p'); empty.textContent = translate('No matching changes.'); content.append(empty); }
    for (const row of rows) { const section = document.createElement('section'), heading = document.createElement('h3'), body = document.createElement('pre'); heading.textContent = row.title; body.textContent = row.markdown; section.append(heading, body); content.append(section); }
    exportButton.disabled = !rows.length;
  }
  for (const control of [from, to, category]) control.addEventListener('change', render);
  exportButton.addEventListener('click', () => {
    const data = { name: 'changelog.md', mime: 'text/markdown', text: selected.map(row => `## ${row.title}\n${row.markdown}`).join('\n') };
    if (onExport) return onExport(data);
    const url = URL.createObjectURL(new Blob([data.text], { type: data.mime })); const link = document.createElement('a'); link.href = url; link.download = data.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  render(); return { refresh: render, destroy() { generation++; host.replaceChildren(); } };
}
