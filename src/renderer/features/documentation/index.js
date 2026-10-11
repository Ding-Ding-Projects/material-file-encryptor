import { createScopedSearch } from '../../scoped-search.js';

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
  function inline(parent, text) {
    const pattern = /\[([^\]]+)\]\(([^\s)]+)\)/g; let offset = 0;
    for (const match of text.matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(offset, match.index)));
      const link = element('a', match[1]);
      let url; try { url = new URL(match[2], `https://documentation.invalid/${active.source}`); } catch { url = null; }
      if (url?.origin === 'https://documentation.invalid') {
        let pathname; try { pathname = decodeURI(url.pathname); } catch { pathname = ''; }
        const target = catalog.documents.find(row => `/${row.source}` === pathname);
        if (target) { link.href = `#${encodeURIComponent(target.id)}${url.hash}`; link.addEventListener('click', event => { event.preventDefault(); let anchor; try { anchor = decodeURIComponent(url.hash.slice(1)); } catch { anchor = ''; } open(target.id, anchor); }); }
        else { link.removeAttribute('href'); link.title = translate('Linked content is not bundled.'); }
      } else if (url && ['https:', 'http:'].includes(url.protocol)) { link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      parent.append(link); offset = match.index + match[0].length;
    }
    parent.append(document.createTextNode(text.slice(offset)));
  }
  function open(id, anchor = '') {
    const row = catalog.documents.find(item => item.id === id); if (!row) return false;
    active = row; article.replaceChildren(); let fenced = false, code, headingIndex = 0;
    for (const line of row.markdown.split(/\r?\n/)) {
      if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; if (fenced) { code = element('code'); const pre = element('pre'); pre.append(code); article.append(pre); } continue; }
      if (fenced) { code.append(document.createTextNode(`${line}\n`)); continue; }
      const heading = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
      const node = element(heading ? `h${heading[1].length}` : 'p');
      if (heading) node.id = row.headings[headingIndex++]?.anchor || '';
      inline(node, heading ? heading[2] : line); article.append(node);
    }
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
