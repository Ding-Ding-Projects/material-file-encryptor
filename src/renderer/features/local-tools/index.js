import {localized, text} from '../../../shared/surface/registry.js';
import {HOME_ICONS, moveHomeFocus} from '../../../shared/surface/home.js';
import {LOCAL_TOOL_LABELS, LOCAL_TOOL_SUMMARIES, LOCAL_TOOL_KEYWORDS, localToolGroups, LOCAL_TOOLS_LABEL} from '../../../shared/surface/local-tools-catalog.js';
import '../../../shared/surface/search.js';

/** A keyboard-operable button made from a div, so its layout is not constrained by a Material button's label slot. */
function pressable(node) {
  node.setAttribute('role', 'button');
  node.tabIndex = 0;
  node.addEventListener('keydown', event => {
    if (event.target !== node || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); node.click(); }
  });
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function glyph(id) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '22'); svg.setAttribute('height', '22');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'currentColor'); path.setAttribute('d', HOME_ICONS[id] || HOME_ICONS.apps);
  svg.append(path);
  return svg;
}

/**
 * The Local tools page: every tool that is not a flagship Home card, grouped by category, with category filters and
 * the shared search control (with its regex builder). All counts come from the tools that are actually registered.
 *   isRegistered(id)   whether a destination exists;   open(id)   opens or focuses that destination;
 *   getLanguage()      'en' | 'yue' | 'bilingual';     subscribeLanguage(listener) returns a disposer.
 */
export function mountLocalTools(host, {isRegistered = () => true, open = () => {}, getLanguage = () => 'en', subscribeLanguage = () => () => {}} = {}) {
  const doc = host.ownerDocument;
  const language = () => getLanguage() || 'en';
  const t = (en, yue) => localized(text(en, yue), language());
  let category = 'all', generation = 0, alive = true;

  const root = doc.createElement('section');
  root.className = 'local-tools';
  root.setAttribute('aria-label', localized(LOCAL_TOOLS_LABEL, language()));
  const header = doc.createElement('header'); header.className = 'local-tools-header';
  const title = doc.createElement('h2'); title.id = 'local-tools-heading';
  const searchHost = doc.createElement('div'); searchHost.className = 'local-tools-search';
  const search = doc.createElement('mfe-search');
  search.setAttribute('scope', 'local-tools');
  search.language = language();
  searchHost.append(search);
  header.append(title, searchHost);
  const layout = doc.createElement('div'); layout.className = 'local-tools-layout';
  const nav = doc.createElement('nav'); nav.className = 'local-tools-categories';
  const body = doc.createElement('div'); body.className = 'local-tools-body';
  const status = doc.createElement('p'); status.className = 'local-tools-status'; status.setAttribute('role', 'status');
  layout.append(nav, body);
  root.append(header, layout, status);
  host.replaceChildren(root);

  let tiles = [];
  const groupsNow = () => localToolGroups(isRegistered);
  const total = () => groupsNow().reduce((sum, group) => sum + group.items.length, 0);

  function render() {
    const groups = groupsNow();
    root.setAttribute('aria-label', localized(LOCAL_TOOLS_LABEL, language()));
    title.textContent = localized(LOCAL_TOOLS_LABEL, language());
    search.setAttribute('label', t('Search tools', '搜尋工具'));
    search.language = language();
    search.setLanguage?.(language());
    if (category !== 'all' && !groups.some(group => group.id === category)) category = 'all';
    nav.setAttribute('aria-label', t('Tool categories', '工具類別'));
    nav.replaceChildren();
    const choices = [{id: 'all', label: text('All', '全部'), count: total()}, ...groups.map(group => ({id: group.id, label: group.label, count: group.items.length}))];
    for (const choice of choices) {
      const button = doc.createElement('div');
      pressable(button); button.className = 'local-tools-category'; button.dataset.category = choice.id;
      button.setAttribute('aria-pressed', String(choice.id === category));
      const name = doc.createElement('span'); name.textContent = localized(choice.label, language());
      const count = doc.createElement('span'); count.className = 'count'; count.textContent = String(choice.count);
      button.append(name, count);
      button.addEventListener('click', () => { category = choice.id; render(); void applyFilter(); });
      nav.append(button);
    }
    body.replaceChildren();
    tiles = [];
    let index = 0;
    for (const group of groups) {
      const section = doc.createElement('section'); section.className = 'local-tools-group'; section.dataset.category = group.id;
      const heading = doc.createElement('h3'); heading.textContent = localized(group.label, language());
      const grid = doc.createElement('ul'); grid.className = 'local-tools-grid';
      for (const id of group.items) {
        const item = doc.createElement('li');
        const tile = doc.createElement('div');
        pressable(tile); tile.className = 'local-tools-tile'; tile.dataset.tool = id; tile.dataset.category = group.id;
        tile.style.setProperty('--i', String(index++));
        const label = LOCAL_TOOL_LABELS[id] || text(id, id), summary = LOCAL_TOOL_SUMMARIES[id] || text('Open this tool.', '打開呢個工具。');
        tile.setAttribute('aria-label', localized(label, language()));
        tile.setAttribute('aria-description', localized(summary, language()));
        const icon = doc.createElement('span'); icon.className = 'icon'; icon.setAttribute('aria-hidden', 'true'); icon.append(glyph(id));
        const copy = doc.createElement('span'); copy.className = 'copy';
        const name = doc.createElement('b'); name.textContent = localized(label, language());
        const detail = doc.createElement('span'); detail.className = 'detail'; detail.textContent = localized(summary, language());
        copy.append(name, detail);
        tile.append(icon, copy);
        tile.addEventListener('click', () => open(id));
        tile.addEventListener('keydown', event => keydown(event, tile));
        item.append(tile); grid.append(item);
        tiles.push({id, tile, item, section, text: [label.en, label.yue, summary.en, summary.yue, LOCAL_TOOL_KEYWORDS[id] || '', group.label.en, group.label.yue].join(' ')});
      }
      section.append(heading, grid);
      body.append(section);
    }
  }

  function visibleTiles() { return tiles.filter(entry => !entry.item.hidden && !entry.section.hidden).map(entry => entry.tile); }
  function columns(list) {
    const first = list[0]?.getBoundingClientRect?.();
    if (!first) return 1;
    return Math.max(1, list.filter(tile => Math.abs(tile.getBoundingClientRect().top - first.top) < 2).length);
  }
  function keydown(event, tile) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const list = visibleTiles();
    const next = moveHomeFocus(list.indexOf(tile), event.key, columns(list), list.length);
    if (next < 0) return;
    event.preventDefault();
    list[next].focus();
  }

  async function applyFilter() {
    const request = ++generation;
    const scoped = tiles.filter(entry => category === 'all' || entry.tile.dataset.category === category);
    let matched = scoped;
    if (search.query) {
      const outcome = await search.filter(scoped.map(entry => ({id: entry.id, text: entry.text})), {reportOutcome: true});
      if (!alive || request !== generation || outcome.outcome === 'superseded') return;
      const ids = new Set((outcome.rows || []).map(row => row.id));
      matched = scoped.filter(entry => ids.has(entry.id));
    }
    const shown = new Set(matched);
    for (const entry of tiles) entry.item.hidden = !shown.has(entry);
    for (const group of body.querySelectorAll('.local-tools-group')) group.hidden = ![...group.querySelectorAll('.local-tools-tile')].some(tile => !tile.closest('li').hidden);
    const count = matched.length;
    status.textContent = count ? t(`Showing ${count} of ${total()} tools`, `顯示 ${total()} 個工具入面嘅 ${count} 個`) : t('No tools match. Change the search or choose another category.', '冇符合嘅工具。請更改搜尋或者揀其他類別。');
  }

  search.addEventListener('search-change', () => { void applyFilter(); });
  render();
  void applyFilter();
  const stop = subscribeLanguage(() => { render(); void applyFilter(); });

  return {
    refresh() { render(); void applyFilter(); },
    focusFirst() { visibleTiles()[0]?.focus(); },
    count: total,
    destroy() { alive = false; generation++; stop?.(); host.replaceChildren(); },
  };
}
