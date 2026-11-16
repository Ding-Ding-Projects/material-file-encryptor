import test from 'node:test';
import assert from 'node:assert/strict';

// A minimal DOM: enough structure for the catalog element to render and be inspected without a browser.
class FakeNode {
  constructor(tag) {
    this.localName = tag; this.tagName = tag.toUpperCase(); this.children = []; this.attrs = new Map(); this.listeners = new Map();
    this.dataset = {}; this.className = ''; this.textContent = ''; this.hidden = false; this.open = false;
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) || []), fn]); }
  click() { for (const fn of this.listeners.get('click') || []) fn({}); }
  show() { this.open = true; }
  close() { this.open = false; }
  find(predicate, out = []) { if (predicate(this)) out.push(this); for (const child of this.children) child.find?.(predicate, out); return out; }
}
globalThis.HTMLElement = class extends FakeNode { constructor() { super('x'); } };
globalThis.document = { createElement: tag => new FakeNode(tag), createElementNS: (_, tag) => new FakeNode(tag) };
globalThis.CSSStyleSheet = class { replaceSync() {} };
const defined = new Map();
globalThis.customElements = { get: key => defined.get(key), define: (key, value) => defined.set(key, value) };
globalThis.requestAnimationFrame = fn => fn();

const { buildCatalog, catalogRows, catalogSearchText, destinationsToOpen, groupCatalog, CATALOG_KINDS } = await import('../src/shared/surface/new-tab-catalog-model.js');
const { NewTabCatalog } = await import('../src/shared/surface/new-tab-catalog.js');
const { createSurfaceModel } = await import('../src/shared/surface/model.js');
const { offerRegisteredViews, shouldOpenRegisteredView } = await import('../src/shared/surface/view-registration.js');
const { createMatcher } = await import('../src/shared/surface/model.js');

const labels = () => new Map([
  ['home', { en: 'Home', yue: '首頁' }], ['drive', { en: 'My drive', yue: '我嘅磁碟' }], ['history', { en: 'History', yue: '歷史記錄' }],
  ['converter', { en: 'Converter', yue: '轉換器' }], ['settings', { en: 'Settings', yue: '設定' }], ['personalization', { en: 'Personalization', yue: '個人化' }],
]);
const commands = [
  { id: 'vault:create', label: { en: 'Create a drive', yue: '建立磁碟' }, run() {} },
  { id: 'settings:theme', label: { en: 'Appearance', yue: '外觀' }, control: { type: 'select' } },
  { id: 'control:drive:7', label: 'A control inside a page' },
  { id: 'view:drive', label: 'Duplicate' },
  { id: 'tab:new', label: 'Duplicate new tab' },
  { id: 'file:export', label: { en: 'Export copy', yue: '匯出副本' }, disabled: true },
];
const management = [{ label: { en: 'Restore closed tab', yue: '還原已關閉分頁' }, disabled: true, run() {} }];

test('the catalog lists destinations, tools, settings pages and menu options once each, in both languages', () => {
  const entries = buildCatalog({ labels: labels(), state: { tabs: [{ id: 'drive' }] }, commands, management });
  const byLabel = Object.fromEntries(entries.map(entry => [entry.label.en, entry]));
  assert.equal(byLabel.Home.kind, 'page');
  assert.equal(byLabel['My drive'].kind, 'page');
  assert.equal(byLabel['My drive'].open, true);
  assert.equal(byLabel.History.open, false);
  assert.equal(byLabel.Converter.kind, 'tool');
  assert.equal(byLabel.Settings.kind, 'setting');
  assert.equal(byLabel.Personalization.kind, 'setting');
  assert.equal(byLabel.Appearance.kind, 'setting');
  assert.equal(byLabel['Create a drive'].kind, 'menu');
  assert.equal(byLabel['Export copy'].disabled, true);
  assert.equal(byLabel['Restore closed tab'].kind, 'menu');
  for (const hidden of ['Duplicate', 'Duplicate new tab', 'A control inside a page']) assert.equal(byLabel[hidden], undefined, hidden);
  assert.equal(new Set(entries.map(entry => entry.key)).size, entries.length, 'every key is unique');
  assert.ok(entries.every(entry => entry.label.en && entry.label.yue && CATALOG_KINDS.includes(entry.kind) && entry.icon));
  assert.ok(entries.filter(entry => entry.destination).every(entry => entry.description?.en && entry.description?.yue), 'every destination explains itself');
});

test('groups appear in a fixed order and empty groups are dropped', () => {
  const entries = buildCatalog({ labels: labels(), commands, management });
  assert.deepEqual(groupCatalog(entries).map(group => group.kind), ['page', 'tool', 'setting', 'menu']);
  assert.deepEqual(groupCatalog(entries.filter(entry => entry.kind === 'tool')).map(group => group.kind), ['tool']);
  assert.deepEqual(groupCatalog([]), []);
});

test('search text covers both languages and the group, so plain text and regex match either language', () => {
  const entries = buildCatalog({ labels: labels(), commands, management });
  const converter = entries.find(entry => entry.label.en === 'Converter');
  const text = catalogSearchText(converter);
  assert.match(text, /Converter/); assert.match(text, /轉換器/); assert.match(text, /Tools/); assert.match(text, /工具/);
  const rows = catalogRows(entries);
  const plain = createMatcher('轉換', { regex: false });
  assert.deepEqual(rows.filter(row => plain.test(row.text)).map(row => row.id), [converter.key]);
  const regex = createMatcher('^convert|轉換器', { regex: true });
  assert.deepEqual(rows.filter(row => regex.test(row.text)).map(row => row.id), [converter.key]);
});

test('Open every tab targets every listed destination except Home', () => {
  const ids = destinationsToOpen(buildCatalog({ labels: labels(), commands, management }));
  assert.deepEqual(ids.sort(), ['converter', 'drive', 'history', 'personalization', 'settings']);
});

function disk() { const values = new Map(); return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }; }
const views = [{ id: 'drive', label: 'Drive' }, { id: 'history', label: 'History' }, { id: 'converter', label: 'Converter' }, { id: 'settings', label: 'Settings' }];

test('first install opens every destination by default and keeps the original tab selected', () => {
  const storage = disk(), model = createSurfaceModel({ storage, tabs: [views[0]] });
  const opened = offerRegisteredViews(model, views);
  assert.deepEqual(opened, ['history', 'converter', 'settings']);
  assert.deepEqual(model.getState().tabs.map(tab => tab.id), ['drive', 'history', 'converter', 'settings']);
  assert.equal(model.getState().activeTabId, 'drive');
  assert.deepEqual(model.getState().offeredTabIds.sort(), ['converter', 'drive', 'history', 'settings']);
});

test('a later load opens only destinations added by an update, and a closed tab stays closed', () => {
  const storage = disk(), first = createSurfaceModel({ storage, tabs: [views[0]] });
  offerRegisteredViews(first, views);
  first.closeTab('converter');
  const restored = createSurfaceModel({ storage, tabs: [views[0]] });
  assert.deepEqual(offerRegisteredViews(restored, views), [], 'nothing new, and the closed tab is not reopened');
  assert.equal(restored.getState().tabs.some(tab => tab.id === 'converter'), false);
  const updated = [...views, { id: 'updates', label: 'Updates' }];
  assert.deepEqual(offerRegisteredViews(restored, updated), ['updates']);
  assert.equal(restored.getState().activeTabId, 'drive');
  // The offer is remembered across another restart, so a tab the person closes after the update stays closed too.
  restored.closeTab('updates');
  const again = createSurfaceModel({ storage, tabs: [views[0]] });
  assert.deepEqual(offerRegisteredViews(again, updated), []);
});

test('a saved state from before offers were recorded offers everything once and then settles', () => {
  const storage = disk();
  const legacy = { version: 1, tabs: [{ id: 'drive', label: 'Drive', group: '', pinned: false }], activeTabId: 'drive', closedTabs: [{ id: 'history', label: 'History', group: '', pinned: false }], closedTabIds: ['history'], groups: [], notifications: [], notificationFormat: 2 };
  storage.setItem('surface-state', JSON.stringify(legacy));
  const model = createSurfaceModel({ storage, tabs: [views[0]] });
  assert.deepEqual(model.getState().offeredTabIds, []);
  assert.equal(shouldOpenRegisteredView({ tabs: [], closedTabs: [] }, 'x'), false, 'a plain state without an offered list keeps the old rule');
  assert.deepEqual(offerRegisteredViews(model, views), ['converter', 'settings'], 'the closed tab stays closed');
  assert.deepEqual(offerRegisteredViews(createSurfaceModel({ storage, tabs: [views[0]] }), views), []);
});

test('the model rejects an invalid offered list from storage without losing the tabs', () => {
  const storage = disk();
  storage.setItem('surface-state', JSON.stringify({ version: 1, tabs: [{ id: 'drive', label: 'Drive' }], offeredTabIds: [5, '', null, 'drive', 'x'.repeat(200)] }));
  const model = createSurfaceModel({ storage, tabs: [views[0]] });
  assert.deepEqual(model.getState().offeredTabIds, ['drive']);
  assert.deepEqual(model.markTabsOffered(['drive', 'history', 'history', 7]), ['history']);
});

// ---- the dialog ----
function dialogFixture(entries, filter) {
  const catalog = Object.create(NewTabCatalog.prototype);
  Object.assign(catalog, { shadowRoot: new FakeNode('shadow'), entries: [], generation: 0, language: 'en' });
  catalog.style = () => {};
  catalog.t = (en, yue) => (catalog.language === 'yue' ? yue : en);
  // Replace only the embedded search control so no worker is needed; its filter keeps the real contract.
  const search = new FakeNode('mfe-search');
  search.filter = filter || (async rows => rows);
  const opened = [], all = [];
  catalog.configure({ language: 'en', entries, onChoose: entry => opened.push(entry.key), onOpenAll: () => all.push(1) });
  catalog.refresh = async () => {};
  catalog.render();
  delete catalog.refresh;
  catalog.search = search; search.addEventListener('search-change', () => catalog.refresh());
  return { catalog, search, opened, all };
}
const items = catalog => catalog.list.find(node => node.localName === 'md-list-item');

test('the dialog renders every group with icon, name, description and an opened badge', async () => {
  const entries = buildCatalog({ labels: labels(), state: { tabs: [{ id: 'drive' }] }, commands, management });
  const { catalog } = dialogFixture(entries);
  await catalog.refresh();
  assert.equal(catalog.list.children.filter(node => node.localName === 'h3').length, 4);
  const rows = items(catalog);
  assert.equal(rows.length, entries.length);
  const drive = rows.find(node => node.getAttribute('data-entry') === 'destination:drive');
  assert.match(drive.getAttribute('aria-label'), /My drive, Opened/);
  assert.ok(drive.find(node => node.localName === 'svg' || node.localName === 'path' || node.attrs.get('slot') === 'start').length);
  assert.match(catalog.count.textContent, new RegExp(`${entries.length} of ${entries.length}`));
});

test('filtering narrows the list, an empty result says so, and a superseded search changes nothing', async () => {
  const entries = buildCatalog({ labels: labels(), commands, management });
  const pending = []; let call = 0;
  const { catalog } = dialogFixture(entries, rows => new Promise(resolve => pending.push([++call, rows, resolve])));
  const first = catalog.refresh(), second = catalog.refresh();
  // The older search answers last with a broad result: it must be ignored.
  pending[1][2](pending[1][1].filter(row => /Converter/.test(row.text)));
  await second;
  pending[0][2](pending[0][1]);
  await first;
  assert.deepEqual(items(catalog).map(node => node.getAttribute('data-entry')), ['destination:converter']);
  const none = catalog.refresh();
  pending[2][2]([]);
  await none;
  assert.equal(items(catalog).length, 0);
  assert.equal(catalog.count.textContent, 'Nothing matches your search.');
  const superseded = catalog.refresh();
  pending[3][2](null);
  await superseded;
  assert.equal(catalog.count.textContent, 'Nothing matches your search.', 'a null (superseded) search leaves the list alone');
});

test('choosing an entry closes the dialog and reports it once; a disabled entry does nothing; Open every tab refreshes', async () => {
  const entries = buildCatalog({ labels: labels(), commands, management });
  const { catalog, opened, all } = dialogFixture(entries);
  catalog.dialog.open = true;
  await catalog.refresh();
  const row = key => items(catalog).find(node => node.getAttribute('data-entry') === key);
  row('destination:history').click();
  assert.deepEqual(opened, ['destination:history']);
  assert.equal(catalog.dialog.open, false);
  row('command:file:export').click();
  assert.deepEqual(opened, ['destination:history'], 'a disabled menu option is inert');
  const openAll = catalog.dialog.find(node => node.localName === 'md-text-button' && /Open every tab/.test(node.textContent))[0];
  openAll.click();
  assert.equal(all.length, 1);
});

test('the dialog labels itself in the active language and the Cantonese copy is complete', async () => {
  const entries = buildCatalog({ labels: labels(), commands, management });
  const { catalog } = dialogFixture(entries);
  catalog.language = 'yue'; catalog.refresh = async () => {}; catalog.render(); delete catalog.refresh; catalog.search = new FakeNode('mfe-search'); catalog.search.filter = async rows => rows;
  await catalog.refresh();
  assert.equal(catalog.dialog.getAttribute('aria-label'), '新分頁目錄');
  const headings = catalog.list.children.filter(node => node.localName === 'h3').map(node => node.textContent);
  assert.deepEqual(headings, ['頁面', '工具', '設定頁面同選項', '選單選項同分頁操作']);
  assert.match(items(catalog)[0].find(node => node.attrs.get('slot') === 'headline')[0].textContent, /首頁/);
});
