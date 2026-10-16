import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {chosenExportPath, exportDialogOptions, exportDialogTitle} from '../src/main/export-dialog.js';

test('titles name what is exported', () => {
  assert.equal(exportDialogTitle('notifications.json'), 'Export notification history');
  assert.equal(exportDialogTitle('notifications.csv'), 'Export notification history');
  assert.equal(exportDialogTitle('changelog.md'), 'Export changelog');
  assert.equal(exportDialogTitle('how-it-works.md'), 'Export documentation article');
  assert.equal(exportDialogTitle('other.bin'), 'Export file');
  assert.doesNotMatch(exportDialogTitle('notifications.json'), /original records/i);
});

test('the dialog starts in the last chosen folder with the suggested name and a matching filter', () => {
  const options = exportDialogOptions({name: 'notifications.csv'}, {lastDirectory: path.join('D:', 'reports'), documentsDirectory: path.join('C:', 'docs')});
  assert.equal(options.defaultPath, path.join('D:', 'reports', 'notifications.csv'));
  assert.deepEqual(options.filters[0], {name: 'CSV', extensions: ['csv']});
  assert.equal(options.filters.at(-1).name, 'All files');
  assert.ok(options.properties.includes('showOverwriteConfirmation'));
  assert.equal(exportDialogOptions({name: 'a.json'}, {documentsDirectory: path.join('C:', 'docs')}).defaultPath, path.join('C:', 'docs', 'a.json'));
});

test('the typed path and name are used exactly; only a missing extension is completed', () => {
  const typed = path.join('E:', 'mine', 'my-notes');
  assert.equal(chosenExportPath(typed, 'notifications.json'), typed + '.json');
  const named = path.join('E:', 'mine', 'my-notes.txt');
  assert.equal(chosenExportPath(named, 'notifications.json'), named);
  assert.equal(chosenExportPath(typed, 'noextension'), typed);
});
