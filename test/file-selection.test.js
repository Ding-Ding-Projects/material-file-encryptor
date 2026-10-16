import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bulkAvailability, createFileSelection, runForEach} from '../src/renderer/file-selection.js';

const ordered = ['a', 'b', 'c', 'd', 'e'];

test('toggle builds a multi-selection and keeps list order', () => {
  const selection = createFileSelection();
  selection.toggle('c'); selection.toggle('a');
  assert.deepEqual(selection.list(ordered), ['a', 'c']);
  assert.equal(selection.size, 2);
  assert.equal(selection.primary, 'a');
  selection.toggle('a', false);
  assert.deepEqual(selection.list(ordered), ['c']);
  assert.equal(selection.primary, 'c');
});

test('a plain click selects one entry and Shift selects the range from the anchor', () => {
  const selection = createFileSelection();
  selection.only('b');
  selection.range(ordered, 'd');
  assert.deepEqual(selection.list(ordered), ['b', 'c', 'd']);
  selection.range(ordered, 'a');
  assert.deepEqual(selection.list(ordered), ['a', 'b']);
  selection.only('e');
  assert.deepEqual(selection.list(ordered), ['e']);
});

test('additive ranges keep the earlier selection', () => {
  const selection = createFileSelection();
  selection.only('a');
  selection.toggle('e');
  selection.range(ordered, 'c', {additive: true});
  assert.deepEqual(selection.list(ordered), ['a', 'c', 'd', 'e']);
});

test('select all, coverage, prune and clear', () => {
  const selection = createFileSelection();
  assert.equal(selection.coverage(ordered), 'none');
  selection.toggle('b');
  assert.equal(selection.coverage(ordered), 'some');
  selection.selectAll(ordered);
  assert.equal(selection.coverage(ordered), 'all');
  selection.prune(['a', 'b']);
  assert.deepEqual(selection.list(ordered), ['a', 'b']);
  assert.ok(selection.primary === 'a' || selection.primary === 'b');
  selection.clear();
  assert.equal(selection.size, 0);
  assert.equal(selection.primary, null);
  assert.equal(selection.coverage([]), 'none');
});

test('bulk actions follow what the selected files allow', () => {
  const files = [{id: 'a', offline: false}, {id: 'b', offline: true}];
  const ready = {busy: false, unlocked: true, mounted: true};
  assert.deepEqual(bulkAvailability(files, ready), {open: false, export: true, keepOffline: true, releaseOffline: true, delete: true});
  assert.equal(bulkAvailability([files[0]], ready).open, true);
  assert.equal(bulkAvailability([files[0]], ready).releaseOffline, false);
  assert.equal(bulkAvailability([files[1]], ready).keepOffline, false);
  assert.ok(Object.values(bulkAvailability(files, {...ready, busy: true})).every(value => value === false));
  assert.ok(Object.values(bulkAvailability([], ready)).every(value => value === false));
  const unmounted = bulkAvailability(files, {busy: false, unlocked: true, mounted: false});
  assert.equal(unmounted.export, false);
  assert.equal(unmounted.delete, false);
  assert.equal(unmounted.keepOffline, true);
});

test('runForEach continues past a failure and then reports one summary', async () => {
  const done = [];
  await assert.rejects(runForEach(['a', 'b', 'c'], async item => { if (item === 'b') throw new Error('locked'); done.push(item); }), error => {
    assert.match(error.message, /1 of 3/);
    assert.match(error.message, /locked/);
    assert.equal(error.done, 2);
    return true;
  });
  assert.deepEqual(done, ['a', 'c']);
  assert.equal(await runForEach(['x'], async () => {}), 1);
});

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('delete is destructive and requires the two-key super confirmation before any call', () => {
  const app = read('../src/renderer/app.js');
  const handler = /listen\('delete-button','click',async \(\) => \{([\s\S]*?)\n\}\);/.exec(app)[1];
  assert.ok(handler.indexOf('requestSuperConfirmation(') >= 0);
  assert.ok(handler.indexOf('requestSuperConfirmation(') < handler.indexOf('api.deleteFile'));
  assert.match(handler, /if \(!confirmation\.confirmed\) return;/);
  assert.equal((app.match(/api\.deleteFile\(/g) || []).length, 1);
});

test('the file table uses Material checkboxes with a select-all header and a delete action', () => {
  const html = read('../src/renderer/index.html');
  assert.match(html, /<md-checkbox id="select-all-files"/);
  assert.match(html, /id="delete-button"/);
  const app = read('../src/renderer/app.js');
  assert.doesNotMatch(app, /select\.type = 'radio'/);
  assert.match(app, /fileSelection\.range\(/);
  assert.match(app, /event\.key\.toLowerCase\(\) === 'a'/);
});

test('the main process deletes only through the mounted drive and exports into a confirmed folder', () => {
  const main = read('../src/main/main.js');
  assert.match(main, /params\.action === 'delete'\) return perform\('delete'/);
  assert.match(main, /fs\.rm\(mountedPath\(entry\.path\)/);
  assert.match(main, /selectedExportFolders\.has\(path\.dirname\(params\.destination/);
  const validation = read('../src/main/validation.js');
  assert.match(validation, /'releaseOffline', 'delete'\]/);
  assert.match(read('../src/main/preload.cjs'), /deleteFile: id => invoke\('fileAction', \{ id, action: 'delete' \}\)/);
});
