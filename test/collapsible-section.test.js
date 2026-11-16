import test from 'node:test';
import assert from 'node:assert/strict';
import {createCollapsibleSection, renderStatistics, activeFilterText, COLLAPSE_COPY} from '../src/shared/surface/collapsible-section.js';
import {infoIconDom} from './helpers/info-icon-dom.js';

const memory = () => { const values = new Map(); return {values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)}; };

test('a collapsible section announces its state, toggles from the keyboard-activated click and remembers the choice', () => {
  const {doc} = infoIconDom(), storage = memory();
  const section = createCollapsibleSection({doc, id: 'history-filters', title: 'Search and filters', storage, open: true});
  assert.equal(section.toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(section.toggle.getAttribute('aria-controls'), 'collapse-body-history-filters');
  assert.equal(section.body.getAttribute('id'), 'collapse-body-history-filters');
  assert.equal(section.body.hidden, false);
  section.toggle.click();
  assert.equal(section.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(section.body.hidden, true);
  assert.equal(storage.getItem('mfe.collapse.history-filters'), 'closed');
  // A new instance, standing in for a restart, starts closed because the choice was stored.
  const again = createCollapsibleSection({doc, id: 'history-filters', title: 'Search and filters', storage, open: true});
  assert.equal(again.open, false);
  assert.equal(again.body.hidden, true);
});

test('statistics start closed by default and a stored open choice wins over the default', () => {
  const {doc} = infoIconDom(), storage = memory();
  const stats = createCollapsibleSection({doc, id: 'stats', title: 'Statistics', storage, open: false});
  assert.equal(stats.open, false);
  stats.toggle.click();
  assert.equal(createCollapsibleSection({doc, id: 'stats', title: 'Statistics', storage, open: false}).open, true);
});

test('a collapsed section never hides an active filter without saying so', () => {
  const {doc} = infoIconDom();
  const section = createCollapsibleSection({doc, id: 'recycle-filters', title: 'Search and filters', storage: memory(), open: true});
  section.setActive(activeFilterText('Filter active', 3, 12));
  assert.equal(section.active.hidden, true, 'open sections show the filter itself, so no extra line');
  section.toggle.click();
  assert.equal(section.active.hidden, false);
  assert.equal(section.active.textContent, 'Filter active: 3 / 12');
  assert.equal(section.active.getAttribute('role'), 'status');
  section.setActive(activeFilterText('Filter active', 12, 12));
  assert.equal(section.active.hidden, true, 'nothing is excluded, so nothing is disclosed');
});

test('a broken storage never prevents toggling', () => {
  const {doc} = infoIconDom();
  const storage = {getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }};
  const section = createCollapsibleSection({doc, id: 'x', title: 'X', storage, open: false});
  assert.equal(section.open, false);
  section.toggle.click();
  assert.equal(section.open, true);
});

test('statistics render as a definition list and every label has a Cantonese pair', () => {
  const {doc} = infoIconDom();
  const host = doc.createElement('div');
  const list = renderStatistics(doc, host, [['Entries', 4], ['Shown', 2]]);
  assert.equal(list.children.length, 4);
  assert.equal(list.children[1].textContent, '4');
  for (const label of ['Search and filters', 'Statistics', 'Filter active', 'Entries', 'Shown', 'Total size', 'Available', 'Unavailable', 'Categories']) assert.ok(COLLAPSE_COPY[label], label);
});

test('the desktop wires history, Recycle Bin, changelog and documentation through the shared section', async () => {
  const {readFile} = await import('node:fs/promises');
  const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
  const app = await read('src/renderer/app.js');
  for (const kind of ['history', 'recycle']) assert.ok(app.includes(`'desktop-'+kind+'-filters'`) && app.includes(`'desktop-'+kind+'-statistics'`));
  assert.match(app, /updateArchiveStatistics\(kind,rows\)/);
  for (const [file, id] of [['src/renderer/features/documentation/changelog.js', 'desktop-changelog'], ['src/renderer/features/documentation/index.js', 'desktop-documentation']]) {
    const source = await read(file);
    assert.ok(source.includes(`'${id}-filters'`) && source.includes(`'${id}-statistics'`), file);
  }
});
