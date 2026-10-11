import { createScopedSearch } from '../../scoped-search.js';
import { renderMarkdown } from './markdown.js';

function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
export function mountDocumentation(host, { catalog, translate = value => value, onExport, initialId } = {}) {
  if (!catalog || !Array.isArray(catalog.documents)) throw new TypeError('A bundled documentation catalog is required.');
  host.replaceChildren();
  const searchHost = element('div'), navigation = element('nav'), article = element('article'), message = element('p');
  const actions = element('div'), exportButton = element('button', translate('Export article'));
  exportButton.type = 'button'; actions.append(exportButton);
  navigation.setAttribute('aria-label', translate('Documentation articles')); article.tabIndex = -1;
  host.append(searchHost, actions, message, navigation, article);
  let active = catalog.documents.find(row => row.id === initialId) || catalog.documents[0], generation = 0;
  const search = createScopedSearch(searchHost, translate, renderList);
  async function renderList() {
    const request = ++generation;
    const rows = await search.filter(catalog.documents.map(row => ({ ...row, path: `${row.category} ${row.title}\n${row.markdown}` })));
    if (request !== generation) return;
    navigation.replaceChildren();
    for (const row of rows) { const button = element('button', row.title); button.type = 'button'; button.setAttribute('aria-current', String(active?.id === row.id)); button.addEventListener('click', () => open(row.id)); navigation.append(button); }
    message.textContent = rows.length ? '' : translate('No matching articles.');
  }
  function open(id, anchor = '') {
    const row = catalog.documents.find(item => item.id === id); if (!row) return false;
    active = row;
    renderMarkdown(article, row.markdown, { catalog, source: row.source, headings: row.headings, translate, open });
    renderList();
    if (anchor) [...article.querySelectorAll('[id]')].find(node => node.id === anchor)?.scrollIntoView({ block: 'start' });
    else article.scrollTop = 0;
    return true;
  }
  exportButton.addEventListener('click', () => {
    if (!active) return;
    if (onExport) return onExport({ name: `${active.id.split('/').pop()}.md`, text: active.markdown, mime: 'text/markdown' });
    const url = URL.createObjectURL(new Blob([active.markdown], { type: 'text/markdown' })); const link = element('a'); link.href = url; link.download = `${active.id.split('/').pop()}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  if (active) open(active.id); else message.textContent = translate('No bundled documentation is available.');
  return { open, refresh: () => { search.refresh(); if (active) open(active.id); }, destroy: () => { generation++; host.replaceChildren(); } };
}
