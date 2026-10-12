import {control} from '../../../shared/surface/controls.js';
import { createScopedSearch } from '../../scoped-search.js';
import { renderMarkdown } from './markdown.js';

function element(tag, text, className) { const node = control(tag, tag === 'button' ? {type:'button'} : {}); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
export function mountDocumentation(host, { catalog, translate = value => value, onExport, initialId } = {}) {
  if (!catalog || !Array.isArray(catalog.documents)) throw new TypeError('A bundled documentation catalog is required.');
  host.replaceChildren();
  const searchHost = element('div'), navigation = element('nav'), article = element('article'), message = element('p');
  const actions = element('div'), exportButton = element('button', translate('Export article'));
  exportButton.type = 'button'; actions.append(exportButton);
  navigation.setAttribute('aria-label', translate('Documentation articles')); article.tabIndex = -1;
  const workspace = element('div'); workspace.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px;min-height:0;max-height:65dvh;overflow:auto';
  navigation.style.cssText = 'display:flex;flex-direction:column;min-width:0;overflow:auto'; article.style.cssText = 'min-width:0;overflow:auto;overflow-wrap:anywhere';
  workspace.append(navigation, article); host.append(searchHost, actions, message, workspace);
  let disposed = false;
  let active = catalog.documents.find(row => row.id === initialId) || catalog.documents[0], generation = 0;
  const search = createScopedSearch(searchHost, translate, renderList);
  async function renderList() {
    const request = ++generation;
    const rows = await search.filter(catalog.documents.map(row => ({ ...row, path: `${row.category} ${row.title}\n${row.markdown}` })));
    if (disposed || request !== generation) return;
    navigation.replaceChildren();
    for (const row of rows) { const button = element('button', row.title); button.type = 'button'; button.setAttribute('aria-current', String(active?.id === row.id)); button.addEventListener('click', () => open(row.id)); navigation.append(button); }
    message.textContent = rows.length ? '' : translate('No matching articles.');
  }
  function open(id, anchor = '') {
    if (disposed) return false;
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
  return { open, refresh: () => { search.refresh(); if (active) open(active.id); }, destroy: () => { disposed = true; generation++; search.destroy?.(); host.replaceChildren(); } };
}
