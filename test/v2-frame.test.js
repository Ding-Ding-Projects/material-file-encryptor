import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSurfaceModel} from '../src/shared/surface/model.js';
import {tooltipPosition, helpTargetFromPath, createHelpMode} from '../src/shared/surface/help-hints.js';

const read = relative => fs.readFile(new URL('../' + relative, import.meta.url), 'utf8');
const memory = () => { const map = new Map(); return {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value))}; };

test('the title bar strip holds only pages opened as tabs, survives a reload and drops a closed page', () => {
  const storage = memory();
  const model = createSurfaceModel({storage, storageKey: 'k', tabs: [{id: 'drive', label: 'Drive'}]});
  model.openTab({id: 'history', label: 'History'});
  model.openTab({id: 'settings', label: 'Settings'});
  assert.deepEqual(model.getState().stripTabIds, [], 'pages opened from the tree are not tabs');
  assert.deepEqual(model.addToStrip(['history', 'missing', 'history']), ['history'], 'unknown and repeated ids are ignored');
  const again = createSurfaceModel({storage, storageKey: 'k', tabs: [{id: 'drive', label: 'Drive'}]});
  assert.deepEqual(again.getState().stripTabIds, ['history']);
  assert.equal(again.removeFromStrip('history'), true);
  assert.deepEqual(again.getState().stripTabIds, []);
  again.addToStrip(['settings']);
  again.closeTab('settings');
  assert.deepEqual(again.getState().stripTabIds, [], 'closing the page removes its tab');
});

test('the workspace shell shows strip tabs only and the catalog adds the page it opens', async () => {
  const shell = await read('src/shared/surface/workspace-shell.js');
  assert.match(shell, /if\(Array\.isArray\(state\.stripTabIds\)&&!strip\.has\(tab\.id\)\)continue;/);
  assert.match(shell, /this\.model\.addToStrip\?\.\(\[entry\.destination\]\)/);
  assert.match(shell, /this\.model\.addToStrip\?\.\(destinationsToOpen\(this\.catalogEntries\(\)\)\)/, 'Open every tab still opens every page as a tab');
});

test('help tooltips stay inside the window and come from the nearest control that declares help', () => {
  const below = tooltipPosition({left: 100, right: 200, top: 10, bottom: 40, width: 100, height: 30}, {width: 200, height: 40}, {width: 1000, height: 800});
  assert.deepEqual(below, {left: 50, top: 46, width: 200});
  const above = tooltipPosition({left: 950, right: 1000, top: 760, bottom: 790, width: 50, height: 30}, {width: 200, height: 40}, {width: 1000, height: 800});
  assert.equal(above.left, 792);
  assert.ok(above.top < 760);
  const control = {nodeType: 1, getAttribute: key => key === 'data-help-text' ? 'Lock drive: lock it.' : null};
  const inner = {nodeType: 1, getAttribute: () => null};
  assert.equal(helpTargetFromPath([inner, control, {nodeType: 9}]), control);
  assert.equal(helpTargetFromPath([inner]), null);
});

test('help mode is remembered and shown on the document root', () => {
  const storage = memory();
  const doc = {documentElement: {dataset: {}}};
  const seen = [];
  const mode = createHelpMode({doc, storage, onChange: on => seen.push(on)});
  assert.equal(mode.on, false);
  assert.equal(doc.documentElement.dataset.helpMode, 'off');
  mode.toggle();
  assert.equal(doc.documentElement.dataset.helpMode, 'on');
  assert.equal(createHelpMode({doc: {documentElement: {dataset: {}}}, storage}).on, true);
  assert.deepEqual(seen, [false, true]);
});

test('context menus put actions on the target first and fold layout and appearance tools behind Customize', async () => {
  const menu = await read('src/shared/surface/context-menu.js');
  assert.ok(menu.includes("const folded=!this.search?.query&&list.some(row=>items[Number(row.id)]?.group==='customize')"), 'folded only while the filter is empty');
  assert.ok(menu.includes("'aria-expanded':String(Boolean(this.customizeOpen))"));
  const layout = await read('src/shared/surface/panel-layout.js');
  assert.equal((layout.match(/group:'customize'/g) || []).length, 3);
  const appearance = await read('src/renderer/features/personalization/appearance.js');
  assert.equal((appearance.match(/group:'customize'/g) || []).length, 2);
});

test('the navigation tree keeps every page one click away, with Settings and Help sub-pages as child rows', async () => {
  const source = await read('src/renderer/features/shell/navigation.js');
  for (const id of ['home', 'drive', 'offline', 'history', 'recycle', 'storage', 'tools', 'settings', 'help']) assert.ok(source.includes(`'${id}'`), id);
  assert.match(source, /for\(const child of GROUPS\[group\]\.slice\(1\)\)if\(this\.hasChild\(child\)\)/);
  assert.match(source, /element\('slot',\{name:'drives'\}\)/, 'drives and their folders are slotted into the tree');
});

test('the version 2 frame loads its stylesheets last and declares density, dark and high contrast tokens', async () => {
  const html = await read('src/renderer/index.html');
  const order = ['features/installation/takeover.css', 'features/shell/v2-frame.css', 'features/shell/drive-list.css'];
  let last = -1;
  for (const href of order) { const at = html.indexOf(href); assert.ok(at > last, href); last = at; }
  const css = await read('src/renderer/features/shell/v2-frame.css');
  for (const selector of [':root[data-theme=dark]', ':root[data-contrast=high]', ':root[data-density=comfortable]', ':root[data-help-mode=on]', '@media (prefers-reduced-motion:reduce)']) assert.ok(css.includes(selector), selector);
  assert.doesNotMatch(css, /url\(\s*['"]?https?:/, 'no network assets');
});

test('help text for a control wrapped in a label goes after the label, never inside it', async () => {
  const {infoIconDom} = await import('./helpers/info-icon-dom.js');
  const {mountInfoIcons, probeHelpHints} = await import('../src/shared/surface/info-icon-mount.js');
  const {DESKTOP_INFO_ICON_INVENTORY} = await import('../src/shared/local-ux/info-icon-desktop.js');
  const {root, doc} = infoIconDom();
  const row = DESKTOP_INFO_ICON_INVENTORY.descriptors.find(item => item.selector === '#startup-setting');
  const label = doc.createElement('label'); root.append(label);
  const control = doc.createElement('md-switch'); control.dataset.sel = row.selector; label.append(control);
  const commands = [];
  const report = mountInfoIcons(root, {inventory: {descriptors: [row]}, presentation: 'hint', registerCommands: rows => { commands.push(...rows); return () => {}; }});
  assert.deepEqual(report.errors, []);
  assert.equal(label.children.length, 1, 'nothing was added inside the label');
  assert.equal(label.nextElementSibling?.dataset?.presentation, 'hint');
  assert.deepEqual(probeHelpHints(root, {inventory: {descriptors: [row]}, commands}), []);
  report.destroy();
  assert.equal(root.children.length, 1);
});
