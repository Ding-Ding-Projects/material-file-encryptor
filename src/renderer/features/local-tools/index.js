import {localized, text} from '../../../shared/surface/registry.js';
import {LOCAL_TOOL_LABELS, LOCAL_TOOL_SUMMARIES, LOCAL_TOOL_KEYWORDS, localToolGroups, LOCAL_TOOLS_LABEL} from '../../../shared/surface/local-tools-catalog.js';
import '../../../shared/surface/search.js';
import {withIcon} from '../../icons.js';

/**
 * The Local tools page as a dense list: a search with its regex builder, a Group by choice (category or name), a
 * table of every registered tool with what it does, and a details pane with Open and Open in new tab. Selecting a row
 * shows its details; Enter, a double click or Open starts the tool. All counts come from the tools that are actually
 * registered; the page claims no status it cannot check.
 *   isRegistered(id)   whether a destination exists;   open(id)   opens or focuses that destination;
 *   openInTab(id)      opens it as a title bar tab (falls back to open);
 *   getLanguage()      'en' | 'yue' | 'bilingual';     subscribeLanguage(listener) returns a disposer.
 */
export function mountLocalTools(host, {isRegistered = () => true, open = () => {}, openInTab = open, getLanguage = () => 'en', subscribeLanguage = () => () => {}} = {}) {
  const doc = host.ownerDocument;
  const language = () => getLanguage() || 'en';
  const t = (en, yue) => localized(text(en, yue), language());
  let grouping = 'category', selected = null, generation = 0, alive = true, matchedIds = null;
  const el = (tag, props = {}, children = []) => { const node = doc.createElement(tag); for (const [key, value] of Object.entries(props)) { if (key === 'text') node.textContent = value; else if (key === 'class') node.className = value; else node.setAttribute(key, value); } node.append(...children); return node; };

  const root = el('section', {class: 'local-tools'});
  const toolbar = el('div', {class: 'v2-toolbar local-tools-toolbar', role: 'toolbar'});
  const search = doc.createElement('mfe-search');
  search.setAttribute('scope', 'local-tools'); search.setAttribute('data-compact', '');
  search.language = language();
  const groupLabel = el('span', {class: 'local-tools-group-label'});
  const groupChoice = el('div', {class: 'segmented', role: 'radiogroup'});
  const openTab = withIcon(el('md-text-button', {id: 'local-tools-open-tab', type: 'button'}), 'open');
  toolbar.append(el('div', {class: 'local-tools-search'}, [search]), groupLabel, groupChoice, openTab);
  const table = el('table', {class: 'local-tools-table'});
  const head = el('thead'), body = el('tbody');
  table.append(head, body);
  const details = el('aside', {class: 'local-tools-details'});
  const status = el('p', {class: 'local-tools-status', role: 'status'});
  root.append(toolbar, el('div', {class: 'local-tools-layout'}, [el('div', {class: 'local-tools-main'}, [table, status]), details]));
  host.replaceChildren(root);

  const groupsNow = () => localToolGroups(isRegistered);
  const total = () => groupsNow().reduce((sum, group) => sum + group.items.length, 0);
  const entries = () => groupsNow().flatMap(group => group.items.map(id => ({id, group, label: LOCAL_TOOL_LABELS[id] || text(id, id), summary: LOCAL_TOOL_SUMMARIES[id] || text('Open this tool.', '打開呢個工具。')})));
  const searchText = entry => [entry.label.en, entry.label.yue, entry.summary.en, entry.summary.yue, LOCAL_TOOL_KEYWORDS[entry.id] || '', entry.group.label.en, entry.group.label.yue].join(' ');

  function renderChrome() {
    root.setAttribute('aria-label', localized(LOCAL_TOOLS_LABEL, language()));
    toolbar.setAttribute('aria-label', t('Local tools commands', '本機工具指令'));
    search.setAttribute('label', t('Search tools', '搜尋工具'));
    search.language = language(); search.setLanguage?.(language());
    groupLabel.textContent = t('Group by', '分組方式');
    groupChoice.setAttribute('aria-label', t('Group by', '分組方式'));
    groupChoice.replaceChildren(...[['category', t('Category', '類別')], ['name', t('Name', '名稱')]].map(([id, label]) => {
      const button = el('button', {type: 'button', role: 'radio', 'aria-checked': String(grouping === id), 'data-grouping': id, text: label});
      button.addEventListener('click', () => { grouping = id; renderChrome(); renderRows(); });
      return button;
    }));
    openTab.replaceChildren(el('span', {text: t('Open in new tab', '喺新分頁開啟')}));
    openTab.disabled = !selected;
    table.setAttribute('aria-label', localized(LOCAL_TOOLS_LABEL, language()));
    head.replaceChildren(el('tr', {}, [el('th', {scope: 'col', text: t('Tool', '工具')}), el('th', {scope: 'col', text: t('What it does', '用途')}), el('th', {scope: 'col', text: t('Category', '類別')})]));
  }
  function row(entry) {
    const tr = el('tr', {class: 'local-tools-row', 'data-tool': entry.id, 'data-category': entry.group.id, tabindex: entry.id === selected ? '0' : '-1', 'aria-selected': String(entry.id === selected)});
    tr.append(el('td', {class: 'name', text: localized(entry.label, language())}), el('td', {class: 'detail', text: localized(entry.summary, language())}), el('td', {class: 'category', text: localized(entry.group.label, language())}));
    tr.addEventListener('click', () => select(entry.id));
    tr.addEventListener('dblclick', () => open(entry.id));
    tr.addEventListener('keydown', event => keydown(event, tr, entry));
    return tr;
  }
  function renderRows() {
    const all = entries().filter(entry => !matchedIds || matchedIds.has(entry.id));
    if (!all.some(entry => entry.id === selected)) selected = all[0]?.id ?? null;
    body.replaceChildren();
    if (grouping === 'category') {
      for (const group of groupsNow()) {
        const items = all.filter(entry => entry.group.id === group.id);
        if (!items.length) continue;
        body.append(el('tr', {class: 'local-tools-group-row', 'data-category': group.id}, [el('th', {scope: 'colgroup', colspan: '3'}, [el('span', {text: localized(group.label, language())}), el('span', {class: 'count', text: String(items.length)})])]));
        for (const entry of items) body.append(row(entry));
      }
    } else {
      for (const entry of [...all].sort((a, b) => localized(a.label, 'en').localeCompare(localized(b.label, 'en')))) body.append(row(entry));
    }
    if (!body.querySelector('[tabindex="0"]')) body.querySelector('.local-tools-row')?.setAttribute('tabindex', '0');
    status.textContent = all.length ? t(`${all.length} of ${total()} tools`, `${total()} 個工具入面嘅 ${all.length} 個`) : t('No tools match. Change the search.', '冇符合嘅工具。請更改搜尋。');
    renderDetails();
  }
  function renderDetails() {
    const entry = entries().find(item => item.id === selected);
    openTab.disabled = !entry;
    if (!entry) { details.replaceChildren(el('p', {class: 'muted', text: t('Select a tool to see what it does.', '揀一個工具就會見到佢嘅用途。')})); return; }
    const openButton = withIcon(el('md-filled-button', {type: 'button', id: 'local-tools-open'}, [el('span', {text: t('Open', '開啟')})]), 'play');
    openButton.addEventListener('click', () => open(entry.id));
    const inTab = withIcon(el('md-outlined-button', {type: 'button'}, [el('span', {text: t('Open in new tab', '喺新分頁開啟')})]), 'open');
    inTab.addEventListener('click', () => openInTab(entry.id));
    details.replaceChildren(el('h2', {text: localized(entry.label, language())}), el('p', {class: 'muted', text: localized(entry.summary, language())}), el('dl', {}, [el('dt', {text: t('Category', '類別')}), el('dd', {text: localized(entry.group.label, language())})]), el('div', {class: 'actions'}, [openButton, inTab]));
  }
  function select(id, focus = false) {
    selected = id;
    for (const tr of body.querySelectorAll('.local-tools-row')) { const on = tr.dataset.tool === id; tr.setAttribute('aria-selected', String(on)); tr.tabIndex = on ? 0 : -1; if (on && focus) tr.focus(); }
    renderDetails();
  }
  function keydown(event, tr, entry) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const rows = [...body.querySelectorAll('.local-tools-row')], index = rows.indexOf(tr);
    const move = {ArrowDown: 1, ArrowUp: -1, Home: -index, End: rows.length - 1 - index}[event.key];
    if (move !== undefined) { event.preventDefault(); const next = rows[Math.max(0, Math.min(rows.length - 1, index + move))]; if (next) select(next.dataset.tool, true); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(entry.id); }
  }
  openTab.addEventListener('click', () => { if (selected) openInTab(selected); });

  async function applyFilter() {
    const request = ++generation;
    if (!search.query) matchedIds = null;
    else {
      const outcome = await search.filter(entries().map(entry => ({id: entry.id, text: searchText(entry)})), {reportOutcome: true});
      if (!alive || request !== generation || outcome.outcome === 'superseded') return;
      matchedIds = new Set((outcome.rows || []).map(item => item.id));
    }
    renderRows();
  }

  search.addEventListener('search-change', () => { void applyFilter(); });
  renderChrome(); renderRows(); void applyFilter();
  const stop = subscribeLanguage(() => { renderChrome(); renderRows(); });

  return {
    refresh() { renderChrome(); void applyFilter(); },
    focusFirst() { (body.querySelector('.local-tools-row[tabindex="0"]') || body.querySelector('.local-tools-row'))?.focus(); },
    count: total,
    destroy() { alive = false; generation++; stop?.(); host.replaceChildren(); },
  };
}
