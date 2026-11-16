import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Minimal DOM, enough for the Home grid to render without a browser.
class FakeNode {
  constructor(tag) {
    this.localName = tag; this.children = []; this.attrs = new Map(); this.listeners = new Map();
    this.dataset = {}; this.className = ''; this.textContent = ''; this.id = '';
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  replaceWith(next) { Object.assign(this, next); }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) || []), fn]); }
  dispatch(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn(event); }
  focus() {}
  find(predicate, out = []) { if (predicate(this)) out.push(this); for (const child of this.children) child.find?.(predicate, out); return out; }
}
globalThis.HTMLElement = class extends FakeNode { constructor() { super('x'); } };
globalThis.document = {createElement: tag => new FakeNode(tag), createElementNS: (_, tag) => new FakeNode(tag)};
globalThis.CSSStyleSheet = class { replaceSync(css) { this.css = css; } };
const defined = new Map();
globalThis.customElements = {get: key => defined.get(key), define: (key, value) => defined.set(key, value)};

const {HomeGrid, FLAGSHIP_CARDS, flagshipEntries, toolsSummary} = await import('../src/shared/surface/home.js');
const {LOCAL_TOOL_CATEGORIES, LOCAL_TOOL_LABELS, LOCAL_TOOL_SUMMARIES, LOCAL_TOOL_KEYWORDS, localToolIds, localToolGroups} = await import('../src/shared/surface/local-tools-catalog.js');

const labels = () => new Map([
  ['drive', {en: 'My drive', yue: '我嘅磁碟'}], ['offline', {en: 'Available offline', yue: '可離線使用'}], ['history', {en: 'History', yue: '歷史記錄'}],
  ['recycle', {en: 'Recycle Bin', yue: '資源回收筒'}], ['storage', {en: 'Docker Hub storage', yue: 'Docker Hub 儲存'}], ['access', {en: 'Local access', yue: '本機存取'}],
  ['tools', {en: 'Local tools', yue: '本機工具'}], ['converter', {en: 'Converter', yue: '轉換工具'}], ['drawing', {en: 'Sketch board', yue: '繪圖板'}], ['dimsum', {en: 'Dim sum', yue: '點心'}],
  ['settings', {en: 'Settings', yue: '設定'}], ['status', {en: 'Status', yue: '狀態'}]
]);
function fixture({language = 'en', recent = null, status = {}, map = labels()} = {}) {
  const grid = Object.create(HomeGrid.prototype);
  grid.shadowRoot = new FakeNode('shadow'); grid.style = css => { grid.css = css; grid.shadowRoot.children = []; };
  const opened = [];
  grid.configure({layout: 'flagship', entries: flagshipEntries(map, {tabs: []}, status), tools: toolsSummary(map), recent, language, onOpen: entry => opened.push(entry.id)});
  return {grid, opened};
}
const byClass = (grid, name) => grid.shadowRoot.find(node => node.className === name);

test('Home shows only the flagship features, in order, and never a settings or tool card', () => {
  const entries = flagshipEntries(labels());
  assert.deepEqual(entries.map(entry => entry.id), ['drive', 'offline', 'history', 'recycle', 'storage', 'access']);
  assert.ok(entries.every(entry => entry.description.en && entry.description.yue && entry.action.en && entry.action.yue));
  for (const [, description, action] of FLAGSHIP_CARDS) {
    assert.ok(description.en.endsWith('.') && description.yue.endsWith('。'));
    assert.ok(/[一-鿿]/.test(description.yue) && /[一-鿿]/.test(action.yue));
  }
  assert.deepEqual(flagshipEntries(new Map([['drive', {en: 'My drive', yue: 'x'}]])).map(entry => entry.id), ['drive'], 'unregistered flagships are not invented');
});

test('the Local tools count is the real number of registered tool destinations', () => {
  assert.equal(toolsSummary(labels()).count, 4);
  assert.equal(toolsSummary(labels()).more, 0);
  const bigger = labels();
  for (const id of ['quicktype', 'base64-tools', 'virtual-disks', 'ollama']) bigger.set(id, {en: id, yue: id});
  assert.equal(toolsSummary(bigger).count, 8);
  assert.equal(toolsSummary(bigger).more, 4);
  assert.equal(toolsSummary(new Map([['drive', {}]])).available, false);
});

test('flagship cards show live status only where data exists, stagger with shared tokens and open on click', () => {
  const {grid, opened} = fixture({status: {drive: {text: {en: 'Mounted', yue: '已掛載'}, tone: 'ok'}}});
  const cards = byClass(grid, 'card big');
  assert.equal(cards.length, 6);
  assert.equal(cards[0].getAttribute('aria-label'), 'My drive, Mounted');
  assert.equal(cards[1].getAttribute('aria-label'), 'Available offline', 'no data, no invented status');
  assert.equal(cards[0].find(node => node.className === 'status')[0].textContent, 'Mounted');
  assert.match(grid.css, /animation-delay:calc\(var\(--i,0\)\*55ms\)/);
  assert.match(grid.css, /:host-context\(\[data-low-stimulation=true\]\) \.card/);
  assert.match(grid.css, /@media\(prefers-reduced-motion:reduce\)\{\.card\{animation:none/);
  cards[4].dispatch('click');
  const strip = byClass(grid, 'strip')[0];
  strip.dispatch('click');
  assert.deepEqual(opened, ['storage', 'tools']);
  assert.match(strip.getAttribute('aria-label'), /Local tools, 4 tools/);
  assert.equal(strip.find(node => node.className === 'desc')[0].textContent, 'Converter, Sketch board, Status, Dim sum');
});

test('Recent activity lists real events and says so honestly when there are none', () => {
  const empty = byClass(fixture({recent: []}).grid, 'recent')[0];
  assert.match(empty.find(node => node.getAttribute('role') === 'status')[0].textContent, /No activity yet/);
  const loading = byClass(fixture({recent: null}).grid, 'recent')[0];
  assert.match(loading.find(node => node.getAttribute('role') === 'status')[0].textContent, /Loading/);
  const {grid} = fixture({recent: [{time: '2026-11-12T13:42:00Z', what: 'Report.pdf', kind: {en: 'Version saved', yue: '已儲存版本'}}]});
  const rows = byClass(grid, 'recent')[0].find(node => node.localName === 'li');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].find(node => node.className === 'what')[0].textContent, 'Report.pdf');
  assert.equal(rows[0].find(node => node.className === 'kind')[0].textContent, 'Version saved');
});

test('flagship Home copy follows the language mode', () => {
  const {grid} = fixture({language: 'yue'});
  assert.equal(byClass(grid, 'card big')[0].find(node => node.className === 'name')[0].textContent, '我嘅磁碟');
  assert.equal(byClass(grid, 'strip')[0].find(node => node.className === 'name')[0].textContent, '本機工具');
});

test('Local tools groups only registered tools, lists every other feature once, and every item is documented', () => {
  const all = LOCAL_TOOL_CATEGORIES.flatMap(category => category.items);
  assert.equal(new Set(all).size, all.length, 'no tool is listed twice');
  for (const flagship of FLAGSHIP_CARDS.map(row => row[0])) assert.ok(!all.includes(flagship), `${flagship} is a flagship card`);
  for (const id of all) {
    assert.ok(LOCAL_TOOL_LABELS[id]?.en && LOCAL_TOOL_LABELS[id]?.yue, id);
    assert.ok(LOCAL_TOOL_SUMMARIES[id]?.en && /[一-鿿]/.test(LOCAL_TOOL_SUMMARIES[id].yue), id);
    assert.ok(LOCAL_TOOL_KEYWORDS[id], id);
  }
  assert.deepEqual(LOCAL_TOOL_CATEGORIES.map(category => category.id), ['files', 'development', 'media', 'system', 'fun']);
  const some = new Set(['converter', 'dimsum']);
  assert.deepEqual(localToolGroups(id => some.has(id)).map(group => [group.id, group.items]), [['files', ['converter']], ['fun', ['dimsum']]]);
  assert.deepEqual(localToolIds(() => true), all);
});

test('the Local tools page and its labels are registered in the workspace', async () => {
  const app = await fs.readFile('src/renderer/app.js', 'utf8');
  assert.match(app, /tools:'Local tools'/);
  assert.match(app, /mountFeature\('tools','Local tools','本機工具'/);
  for (const [id, label] of Object.entries(LOCAL_TOOL_LABELS)) {
    const pattern = new RegExp(`mountFeature\\('${id}','${label.en}','${label.yue}'`);
    assert.match(app, pattern, `${id} label matches its registration`);
  }
  const timing = await fs.readFile('src/renderer/performance-timing.js', 'utf8');
  assert.match(timing, /'dimsum','tools'/);
  const rail = await fs.readFile('src/renderer/features/shell/navigation.js', 'utf8');
  assert.match(rail, /\['tools','Local tools','本機工具'/);
  assert.doesNotMatch(rail, /GROUPS=\{tools:/, 'the rail entry opens the page, not a menu');
  const shell = await fs.readFile('src/renderer/features/shell/index.js', 'utf8');
  assert.match(shell, /layout:'flagship'/);
  assert.match(shell, /if\(id===HOME_ID\)\{renderHome\(\);refreshRecent\(\);\}/);
});
