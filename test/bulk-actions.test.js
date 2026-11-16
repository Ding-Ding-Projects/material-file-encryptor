import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBulkSelection, runBulk, summarizeBulk, selectionStatus, mountBulkBar, bulkLabels, BULK_LABELS, BULK_COPY} from '../src/shared/surface/bulk-actions.js';
import {infoIconDom} from './helpers/info-icon-dom.js';

const ordered = ['a', 'b', 'c', 'd', 'e'];

test('click, Ctrl+click and Shift+click range select over the shown order', () => {
  const selection = createBulkSelection();
  selection.click(ordered, 'b', {checked: true});
  selection.click(ordered, 'd', {shift: true});
  assert.deepEqual(selection.list(ordered), ['b', 'c', 'd']);
  selection.click(ordered, 'c', {checked: false});
  assert.deepEqual(selection.list(ordered), ['b', 'd']);
  assert.equal(selection.coverage(ordered), 'some');
});

test('select all reaches only what is shown, invert flips it, and prune drops what a filter hid', () => {
  const selection = createBulkSelection();
  selection.selectAll(['a', 'b']);
  assert.deepEqual(selection.ids(), ['a', 'b']);
  selection.invert(['a', 'b', 'c']);
  assert.deepEqual(selection.ids(), ['c']);
  selection.selectAll(['a', 'b']);
  selection.prune(['a', 'c']);
  assert.deepEqual(selection.ids().sort(), ['a', 'c']);
  assert.equal(selection.coverage(['a', 'c']), 'all');
  assert.equal(selection.coverage([]), 'none');
  selection.clear();
  assert.equal(selection.size, 0);
});

test('a bulk run continues past a failure and reports done, skipped and failed items with reasons', async () => {
  const result = await runBulk(['x', 'main', 'y', 'z'], async id => { if (id === 'y') throw Error('disk busy'); }, {skip: id => id === 'main' ? 'the main item cannot be removed' : null});
  assert.deepEqual(result.done, ['x', 'z']);
  assert.deepEqual(result.skipped, [{item: 'main', reason: 'the main item cannot be removed'}]);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].message, /disk busy/);
  const sentence = summarizeBulk(result, {noun: 'vaults'});
  assert.match(sentence, /^2 \/ 4 vaults/);
  assert.match(sentence, /Skipped: main \(the main item cannot be removed\)/);
  assert.match(sentence, /Failed: y \(disk busy\)/);
  assert.match(summarizeBulk(await runBulk(['p'], async () => {}), {noun: 'vaults'}), /All selected items were processed\. 1 \/ 1 vaults\./);
});

test('a cancelled run skips what has not started and never throws for an item', async () => {
  const controller = new AbortController();
  const result = await runBulk(['a', 'b', 'c'], async id => { if (id === 'a') controller.abort(); }, {signal: controller.signal});
  assert.deepEqual(result.done, ['a']);
  assert.deepEqual(result.skipped.map(row => row.item), ['b', 'c']);
});

test('the status line names the exact count and scope', () => {
  assert.equal(selectionStatus(3, 12, {noun: 'versions'}), '3 / 12 versions');
  assert.equal(selectionStatus(0, 12, {noun: 'versions'}), 'Nothing selected (12 versions)');
});

test('the toolbar is a labelled toolbar, enables actions only with a selection and shows the batch size', async () => {
  const {doc} = infoIconDom();
  const host = doc.createElement('div'), selection = createBulkSelection();
  let shown = ['a', 'b', 'c'], ran = 0;
  const bar = mountBulkBar({doc, host, labels: bulkLabels(en => en), noun: 'items', selection, getShown: () => shown, actions: [{label: 'Export selected', run: async () => { ran++; }}]});
  assert.equal(bar.bar.getAttribute('role'), 'toolbar');
  assert.equal(bar.status.getAttribute('aria-live'), 'polite');
  const [status, selectShown, invert, clear, exportSelected] = bar.bar.children;
  assert.equal(status.textContent, 'Nothing selected (3 items)');
  assert.equal(exportSelected.disabled, true);
  assert.equal(clear.disabled, true);
  selectShown.click();
  assert.equal(status.textContent, '3 / 3 items');
  assert.equal(exportSelected.textContent, 'Export selected (3)');
  invert.click();
  assert.equal(status.textContent, 'Nothing selected (3 items)');
  selection.toggle('b', true); bar.refresh();
  exportSelected.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(ran, 1);
  shown = [];
  bar.refresh();
  assert.equal(selectShown.disabled, true, 'nothing shown, nothing to select');
  bar.showReport('Exported selected: 1');
  assert.equal(bar.report.hidden, false);
  bar.showReport('');
  assert.equal(bar.report.hidden, true);
});

test('every label has a Cantonese pair, and the copy map is derived from them', () => {
  for (const [key, [en, yue]] of Object.entries(BULK_LABELS)) { assert.ok(en && yue, key); assert.equal(BULK_COPY[en], yue); }
});

test('the desktop wires history, Recycle Bin, vault sessions and notifications through the shared bulk module', async () => {
  const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
  const app = await read('src/renderer/app.js');
  assert.match(app, /mountBulkBar\(\{doc:document,host:bulkHost/);
  assert.match(app, /bindBulkCheckbox\(check,'history'\)/);
  assert.match(app, /bindBulkCheckbox\(check,'recycle'\)/);
  assert.match(app, /bindBulkCheckbox\(input,'vault'\)/);
  assert.match(app, /runBulk\(ids,id=>api\.removeSession\(id\)/);
  const notifications = await read('src/shared/surface/notification-center.js');
  for (const word of ['Invert selection', 'Clear selection', 'shiftKey']) assert.ok(notifications.includes(word), word);
});
