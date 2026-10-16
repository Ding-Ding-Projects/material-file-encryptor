import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// A minimal DOM: enough structure for the surface elements to render and be inspected without a browser.
class FakeNode {
  constructor(tag) {
    this.localName = tag; this.tagName = tag.toUpperCase(); this.children = []; this.attrs = new Map(); this.listeners = new Map();
    this.dataset = {}; this.className = ''; this.textContent = ''; this.hidden = false; this.focused = false;
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) || []), fn]); }
  dispatch(type, event = {}) { event.preventDefault = () => { event.prevented = true; }; for (const fn of this.listeners.get(type) || []) fn(event); }
  focus() { this.focused = true; globalThis.__focus = this; }
  find(predicate, out = []) { if (predicate(this)) out.push(this); for (const child of this.children) child.find?.(predicate, out); return out; }
}
globalThis.HTMLElement = class extends FakeNode { constructor() { super('x'); } };
globalThis.document = {
  createElement: tag => new FakeNode(tag),
  createElementNS: (_, tag) => new FakeNode(tag)
};
globalThis.CSSStyleSheet = class { replaceSync(css) { this.css = css; } };
const defined = new Map();
globalThis.customElements = {get: key => defined.get(key), define: (key, value) => defined.set(key, value)};

const {HomeGrid, HOME_CATALOG, homeEntries, isNewTabShortcut, moveHomeFocus, HOME_ID} = await import('../src/shared/surface/home.js');
const {WorkspaceShell} = await import('../src/shared/surface/workspace-shell.js');
const {createSurfaceModel} = await import('../src/shared/surface/model.js');

const labelMap = () => new Map([
  ['home', {en: 'Home', yue: '首頁'}], ['drive', {en: 'My drive', yue: '我嘅磁碟'}], ['converter', {en: 'Converter', yue: '轉換器'}],
  ['settings', {en: 'Settings', yue: '設定'}], ['server-manager', {en: 'Server preparation', yue: '伺服器準備'}], ['custom-tool', {en: 'Custom tool', yue: '自訂工具'}]
]);
function shellFixture() {
  const values = new Map(), storage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)};
  const model = createSurfaceModel({storage, tabs: [{id: 'drive', label: 'My drive'}]});
  const shell = Object.assign(Object.create(WorkspaceShell.prototype), {model, labels: labelMap(), language: 'en', selected: new Set(), newButton: {name: 'new-tab-button'}, render() {}, onActivate(id) { this.activated = id; }, onContext(value) { this.opened = value; }});
  return {model, shell};
}
function gridFixture(language = 'en') {
  const grid = Object.create(HomeGrid.prototype);
  grid.shadowRoot = new FakeNode('shadow'); grid.style = css => { grid.css = css; grid.shadowRoot.children = []; };
  const opened = [];
  const state = {tabs: [{id: 'drive'}]};
  grid.configure({entries: homeEntries(labelMap(), state), language, onOpen: entry => opened.push(entry.id)});
  return {grid, opened};
}

test('Home lists every destination in catalogue order, never itself, and flags the open ones', () => {
  const entries = homeEntries(labelMap(), {tabs: [{id: 'drive'}]});
  assert.deepEqual(entries.map(entry => entry.id), ['drive', 'converter', 'server-manager', 'settings', 'custom-tool']);
  assert.equal(entries.find(entry => entry.id === 'drive').open, true);
  assert.equal(entries.find(entry => entry.id === 'converter').open, false);
  assert.ok(!entries.some(entry => entry.id === HOME_ID));
  assert.ok(entries.every(entry => entry.description.en && entry.description.yue));
  assert.equal(entries.at(-1).icon, 'apps', 'an unknown destination falls back to the generic glyph');
});

test('every catalogue destination has distinct English and real Cantonese descriptions', () => {
  for (const [id, copy] of HOME_CATALOG) {
    assert.ok(copy.en.endsWith('.') && copy.yue.endsWith('。'), id);
    assert.notEqual(copy.en, copy.yue, id);
    assert.match(copy.yue, /[一-鿿]/, id);
  }
});

test('the Home grid renders one named, described card per destination', () => {
  const {grid} = gridFixture();
  const cards = grid.shadowRoot.find(node => node.className === 'card');
  assert.equal(cards.length, 5);
  assert.equal(cards[0].getAttribute('aria-label'), 'My drive, Open');
  assert.equal(cards[0].getAttribute('aria-description'), HOME_CATALOG.find(row => row[0] === 'drive')[1].en);
  assert.equal(cards[1].getAttribute('aria-label'), 'Converter');
  assert.equal(grid.shadowRoot.find(node => node.className === 'grid')[0].getAttribute('aria-labelledby'), 'home-heading');
  assert.equal(cards[0].find(node => node.className === 'name')[0].textContent, 'My drive');
});

test('Home copy follows the language mode', () => {
  const yue = gridFixture('yue').grid.shadowRoot.find(node => node.className === 'card');
  assert.equal(yue[1].find(node => node.className === 'name')[0].textContent, '轉換器');
  const both = gridFixture('bilingual').grid.shadowRoot.find(node => node.className === 'card');
  assert.equal(both[1].find(node => node.className === 'name')[0].textContent, 'Converter · 轉換器');
  assert.match(both[1].find(node => node.className === 'desc')[0].textContent, / · /);
});

test('choosing a card asks the owner to open that destination', () => {
  const {grid, opened} = gridFixture();
  grid.shadowRoot.find(node => node.className === 'card')[2].dispatch('click');
  assert.deepEqual(opened, ['server-manager']);
});

test('arrow keys, Home and End move focus across the cards and wrap nowhere', () => {
  assert.equal(moveHomeFocus(0, 'ArrowRight', 3, 7), 1);
  assert.equal(moveHomeFocus(6, 'ArrowRight', 3, 7), 6);
  assert.equal(moveHomeFocus(4, 'ArrowDown', 3, 7), 6);
  assert.equal(moveHomeFocus(1, 'ArrowUp', 3, 7), 0);
  assert.equal(moveHomeFocus(3, 'Home', 3, 7), 0);
  assert.equal(moveHomeFocus(3, 'End', 3, 7), 6);
  assert.equal(moveHomeFocus(3, 'a', 3, 7), -1);
  const {grid} = gridFixture();
  const cards = grid.shadowRoot.find(node => node.className === 'card');
  const event = {key: 'ArrowRight'};
  cards[0].dispatch('keydown', event);
  assert.equal(cards[1].focused, true);
  assert.equal(event.prevented, true);
  const modified = {key: 'ArrowRight', ctrlKey: true};
  cards[1].focused = false; cards[1].dispatch('keydown', modified);
  assert.equal(cards[1].focused, false, 'modified arrows stay available to the platform');
});

test('the Home grid animates its cards with shared motion tokens and drops motion when reduced', () => {
  const {grid} = gridFixture();
  assert.match(grid.css, /animation:mfe-home-card-in var\(--md-sys-motion-duration-medium2/);
  assert.match(grid.css, /transition:border-color var\(--md-sys-motion-duration-short4/);
  assert.match(grid.css, /@media\(prefers-reduced-motion:reduce\)\{\.card\{animation:none;transition:none\}\.card::before\{transition:none\}\}/);
  assert.match(grid.css, /\.card:hover::before\{opacity:\.08\}/);
});

test('Home opens or focuses its tab from the Home button', () => {
  const {model, shell} = shellFixture();
  assert.equal(shell.openHome(), true);
  assert.equal(model.getState().activeTabId, 'home');
  assert.equal(shell.activated, 'home');
  model.activateTab('drive');
  shell.openHome();
  assert.equal(model.getState().tabs.filter(tab => tab.id === 'home').length, 1, 'a second press focuses rather than duplicating');
});

test('the new-tab menu is a searchable mini home anchored to the New tab button', () => {
  const {model, shell} = shellFixture();
  shell.openNewTab();
  const menu = shell.opened;
  assert.equal(menu.anchor, shell.newButton, 'the menu anchors to the button so closing restores focus there');
  assert.equal(menu.target, shell);
  const names = menu.items.map(item => item.label.en);
  assert.deepEqual(names.slice(0, 6), ['Home', 'My drive', 'Converter', 'Server preparation', 'Settings', 'Custom tool']);
  assert.ok(menu.items.slice(0, 6).every(item => item.description?.en && item.description?.yue));
  assert.ok(names.includes('Restore closed tab') && names.includes('Manage groups'), 'the former All tabs management stays reachable');
  menu.items.find(item => item.label.en === 'Converter').run();
  assert.equal(model.getState().activeTabId, 'converter');
  assert.equal(model.getState().tabs.some(tab => tab.id === 'converter'), true);
});

test('the new-tab menu opens Home from its first entry and reopens closed work', () => {
  const {model, shell} = shellFixture();
  shell.openNewTab(); shell.opened.items[0].run();
  assert.equal(model.getState().activeTabId, 'home');
  model.closeTab('home');
  shell.openNewTab('anchor', 'event');
  assert.equal(shell.opened.anchor, 'anchor');
  assert.equal(shell.opened.event, 'event');
  assert.equal(shell.opened.items.find(item => item.label.en === 'Restore closed tab').disabled, false);
});

test('Control or Command T opens the mini home; Shift keeps restoring a closed tab', () => {
  assert.equal(isNewTabShortcut({ctrlKey: true, key: 't'}), true);
  assert.equal(isNewTabShortcut({metaKey: true, key: 'T'}), true);
  assert.equal(isNewTabShortcut({ctrlKey: true, shiftKey: true, key: 'T'}), false);
  assert.equal(isNewTabShortcut({ctrlKey: true, altKey: true, key: 't'}), false);
  assert.equal(isNewTabShortcut({key: 't'}), false);
});

test('the foundation wires Ctrl+T, the Home view and focus handling', async () => {
  const source = await fs.readFile('src/renderer/features/shell/index.js', 'utf8');
  assert.match(source, /else if\(isNewTabShortcut\(event\)\)\{event\.preventDefault\(\);shell\.openNewTab\(shell\.newButton\);\}/);
  assert.match(source, /views\.set\(HOME_ID,/);
  assert.match(source, /if\(id===HOME_ID\)homeGrid\.focusFirst\?\.\(\)/);
  assert.match(source, /id:'tab:new'/);
});

test('the shell menu restores focus: Escape and outside click close it onto its anchor', async () => {
  const menu = await fs.readFile('src/shared/surface/context-menu.js', 'utf8');
  assert.match(menu, /event\.key==='Escape'\)\{event\.preventDefault\(\);event\.stopImmediatePropagation\(\);this\.close\('escape'\)/);
  assert.match(menu, /pointerdown',e=>\{if\(!e\.composedPath\(\)\.includes\(this\)\)this\.close\('outside'\)/);
  assert.match(menu, /const focus=this\.anchor\?\.isConnected\?this\.anchor/);
  assert.match(menu, /slot:'supporting-text'/);
});

test('the tab strip drops All tabs for Home and New tab, and hides scroll arrows until tabs overflow', async () => {
  const source = await fs.readFile('src/shared/surface/workspace-shell.js', 'utf8');
  assert.doesNotMatch(source, /class:'all'/);
  assert.match(source, /class:'new-tab'/);
  assert.match(source, /class:'home-button'/);
  assert.match(source, /this\.previous\.hidden=!overflowing/);
  assert.match(source, /'aria-haspopup':'menu','aria-keyshortcuts':'Control\+T'/);
  const {shell} = shellFixture();
  const edge = {scrollWidth: 300, clientWidth: 300, scrollLeft: 0};
  shell.tabsHost = edge; shell.previous = {}; shell.next = {};
  shell.updateOverflow();
  assert.equal(shell.previous.hidden, true);
  assert.equal(shell.next.hidden, true);
  Object.assign(edge, {scrollWidth: 900});
  shell.updateOverflow();
  assert.equal(shell.previous.hidden, false);
  assert.equal(shell.next.hidden, false);
});

test('Home and the mini home honour reduced motion in the renderer styles', async () => {
  const css = await fs.readFile('src/renderer/modern.css', 'utf8');
  assert.match(css, /\.home-view:not\(\[hidden\]\)\{animation:md-fade-through-in var\(--md-sys-motion-duration-medium2\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.home-view:not\(\[hidden\]\)\{animation:none\}\}/);
});

test('the new-tab menu offers an explicit Quit action in both languages when the shell is given one', () => {
  const {shell} = shellFixture();
  shell.openNewTab();
  assert.ok(!shell.opened.items.some(item => item.label.en === 'Quit Material File Encryptor'), 'no Quit without an owner callback');
  let quits = 0;
  shell.onQuit = () => { quits++; };
  shell.openNewTab();
  const quit = shell.opened.items.find(item => item.label.en === 'Quit Material File Encryptor');
  assert.ok(quit, 'the mini home lists Quit');
  assert.match(quit.label.yue, /結束/);
  assert.equal(quit.shortcut, 'Ctrl+Q');
  assert.ok(quit.description.en && quit.description.yue);
  quit.run();
  assert.equal(quits, 1);
});

test('Quit is reachable from the Help and Settings menus, the command palette and Ctrl+Q, and the stylesheet wraps the Availability cell', async () => {
  const navigation = await fs.readFile('src/renderer/features/shell/navigation.js', 'utf8');
  assert.match(navigation, /\(id==='help'\|\|id==='settings'\)&&typeof this\.onQuit==='function'/);
  assert.match(navigation, /rail\.configure\(\{labels,language,onActivate:activate,onQuit\}\)/);
  const app = await fs.readFile('src/renderer/app.js', 'utf8');
  assert.match(app, /id:'application:quit',label:\{en:'Quit application',yue:'結束程式'\},shortcut:'Control\+q',run:\(\)=>quitApplication\(\)/);
  assert.match(app, /onQuit:\(\)=>quitApplication\(\)/);
  assert.match(app, /function quitApplication\(\) \{ return api\.quit \? api\.quit\(\) : api\.windowControl\('close'\); \}/);
  const shellSource = await fs.readFile('src/renderer/features/shell/index.js', 'utf8');
  assert.match(shellSource, /shell\.configure\(\{[^}]*onQuit\}\)/);
  const main = await fs.readFile('src/main/main.js', 'utf8');
  assert.match(main, /label:'Quit',click:\(\)=>void quit\(\)/, 'the tray menu keeps Quit');
  assert.match(main, /hideWindow: \(\) => \{ window\.hide\(\); void trayNotice\.maybeShow\(\); \}/);
  const css = await fs.readFile('src/renderer/modern.css', 'utf8');
  assert.match(css, /#file-list>tr>td\.availability\{white-space:normal;overflow:visible;text-overflow:clip/);
});
