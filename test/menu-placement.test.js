import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {placeMenu, menuCorner, MENU_INSET} from '../src/shared/surface/menu-placement.js';
import {HOME_CATALOG, homeEntries} from '../src/shared/surface/home.js';

const rect = (left, top, width = 40, height = 40) => ({left, top, right: left + width, bottom: top + height});

test('the new-tab popover never exceeds the viewport, in a 1280x800 window at 150 percent scale', () => {
  const viewport = {width: 1280 / 1.5, height: 800 / 1.5};
  const placed = placeMenu(rect(780, 8), viewport, {align: 'end'});
  assert.ok(placed.maxHeight <= viewport.height - 2 * MENU_INSET);
  assert.ok(placed.y + placed.maxHeight <= viewport.height - MENU_INSET + 1);
  assert.ok(placed.y >= MENU_INSET);
  assert.equal(placed.flip, false);
});

test('a short anchor-to-bottom space flips the menu above when there is more room there', () => {
  const viewport = {width: 800, height: 600};
  const placed = placeMenu(rect(300, 540), viewport);
  assert.equal(placed.flip, true);
  assert.ok(placed.y - placed.maxHeight >= MENU_INSET - 1);
  assert.equal(menuCorner(placed), 'end-start');
});

test('the menu stays below when the space below is comfortable or larger than above', () => {
  const placed = placeMenu(rect(10, 10), {width: 800, height: 600});
  assert.equal(placed.flip, false);
  assert.equal(menuCorner(placed), 'start-start');
});

test('a height-constrained viewport still bounds the menu and keeps the inset', () => {
  for (const height of [120, 200, 320, 480]) {
    for (const top of [0, height / 2, height - 40]) {
      const placed = placeMenu(rect(100, top), {width: 640, height});
      assert.ok(placed.maxHeight <= Math.max(0, height - 2 * MENU_INSET), `height ${height} top ${top}`);
      const bottom = placed.flip ? placed.y : placed.y + placed.maxHeight;
      const topEdge = placed.flip ? placed.y - placed.maxHeight : placed.y;
      assert.ok(topEdge >= MENU_INSET - 1 && bottom <= height - MENU_INSET + 1, `height ${height} top ${top} -> ${topEdge}..${bottom}`);
    }
  }
});

test('end alignment puts the menu right edge under the anchor right edge and clamps inside the window', () => {
  const viewport = {width: 1000, height: 700};
  const anchor = rect(600, 8);
  const placed = placeMenu(anchor, viewport, {align: 'end'});
  assert.equal(placed.x, anchor.right);
  assert.equal(menuCorner(placed), 'start-end');
  const clamped = placeMenu(rect(990, 8, 40), viewport, {align: 'end'});
  assert.ok(clamped.x <= viewport.width - MENU_INSET);
  const narrow = placeMenu(rect(20, 8), {width: 320, height: 600}, {align: 'end'});
  assert.ok(narrow.x - narrow.maxWidth >= MENU_INSET - 1);
  assert.ok(narrow.maxWidth <= 320 - 2 * MENU_INSET);
});

test('start alignment keeps the menu inside the right edge', () => {
  const placed = placeMenu(rect(900, 8), {width: 1000, height: 700});
  assert.ok(placed.x + placed.maxWidth <= 1000 - MENU_INSET + 1);
});

test('the context menu applies the placement, scrolls the list and pins the search field', async () => {
  const source = await fs.readFile(new URL('../src/shared/surface/context-menu.js', import.meta.url), 'utf8');
  assert.match(source, /placeMenu\(/);
  assert.match(source, /menu\.style\.maxHeight/);
  assert.match(source, /mfe-search\{[^}]*position:sticky/);
  assert.doesNotMatch(source, /hasOverflow:true/, 'overflow must stay scrollable so the list scrolls inside the menu');
  const shell = await fs.readFile(new URL('../src/shared/surface/workspace-shell.js', import.meta.url), 'utf8');
  assert.match(shell, /align:'end',items:\[\s*\{label:HOME_LABEL/);
});

test('every destination has its own English and Cantonese description, never the generic fallback', async () => {
  const app = await fs.readFile(new URL('../src/renderer/app.js', import.meta.url), 'utf8');
  const featureIds = [...app.matchAll(/mountFeature\('([a-z-]+)'/g)].map(match => match[1]);
  const coreIds = ['drive', 'offline', 'history', 'recycle', 'settings', 'help'];
  const ids = [...new Set([...coreIds, ...featureIds])];
  assert.ok(featureIds.includes('browser-pairing'));
  const labels = new Map(ids.map(id => [id, {en: id, yue: id}]));
  const entries = homeEntries(labels, {tabs: []});
  assert.equal(entries.length, ids.length);
  const catalog = new Map(HOME_CATALOG);
  for (const entry of entries) {
    assert.ok(catalog.has(entry.id), `${entry.id} needs a catalogue description`);
    assert.notEqual(entry.description.en, 'Open this section.', entry.id);
    assert.ok(entry.description.en.length > 12 && /[一-鿿]/.test(entry.description.yue), entry.id);
  }
  const pairing = entries.find(entry => entry.id === 'browser-pairing');
  assert.match(pairing.description.en, /browser/i);
});
