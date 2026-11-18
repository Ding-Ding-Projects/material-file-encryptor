import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isBackupBusyRefusal } from '../src/shared/backup-busy.js';
import { cantonese } from '../src/renderer/i18n.js';

const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('only the native snapshot-in-progress refusals count as a busy backup', () => {
  assert.equal(isBackupBusyRefusal(Error("Error invoking remote method 'vault:request': Error: An encrypted image snapshot is being prepared. Wait for it to finish.")), true);
  assert.equal(isBackupBusyRefusal('Wait for snapshot preparation and cancellation cleanup to settle before releasing its lease.'), true);
  for (const other of ['Unlock the drive before maintaining storage.', 'The selected vault session no longer exists.', '', null, undefined])
    assert.equal(isBackupBusyRefusal(other), false, String(other));
});

test('a busy backup never becomes a red banner, keeps the last file listing and shows Backing up in the status bar', () => {
  const app = source('renderer/app.js');
  const showError = app.slice(app.indexOf('function showError('), app.indexOf('function toast('));
  const busyBranch = showError.slice(showError.indexOf('if (isBackupBusyRefusal(message))'), showError.indexOf('const target'));
  assert.ok(busyBranch.length > 0, 'showError checks for the busy refusal before the banner');
  assert.doesNotMatch(busyBranch, /main-error|notify\(|message:true/, 'no banner, no error notification and no playful suffix');
  assert.match(busyBranch, /factual:true/);
  const listing = app.slice(app.indexOf('async function loadFilePage('), app.indexOf('async function loadFilePage(') + 2400);
  assert.match(listing, /const lastKnown=pagedFiles;/);
  assert.match(listing, /if\(isBackupBusyRefusal\(error\)\)\{if\(!append\)\{pagedFiles=lastKnown;/);
  assert.match(app, /backingUp:\(\)=>Date\.now\(\)<backupBusyUntil/);
  assert.match(source('renderer/features/shell/workspace-chrome.js'), /hooks\.backingUp\?\.\(\) \? t\('Backing up…'\)/);
  assert.equal(cantonese['Backing up…'], '備份中…');
  assert.ok(cantonese['The drive is backing up. Your files are safe; try again in a moment.']);
});
