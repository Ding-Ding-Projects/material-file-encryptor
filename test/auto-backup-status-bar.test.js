import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { statusBarState } from '../src/renderer/features/storage-maintenance/auto-backup/model.js';
import { SHELL_COPY } from '../src/renderer/features/shell/copy.js';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const base = (drive, extra = {}) => ({ settings: { enabled: true }, signedIn: true, online: true, noticeRequired: false, drives: [{ sessionId: 'main', enabled: true, phase: 'idle', dirty: false, lastBackup: null, progress: null, ...drive }], ...extra });

test('the status bar names the automatic backup state of the selected drive', () => {
  assert.deepEqual(statusBarState(base({ lastBackup: '2026-11-18T11:58:00Z' }), 'main', NOW), { key: 'Backed up {ago}', ago: { key: '{count} min ago', count: 2 }, tone: 'ok' });
  assert.deepEqual(statusBarState(base({ phase: 'backing-up', progress: { completedBytes: 40, totalBytes: 100 } }), 'main', NOW), { key: 'Backing up… {percent}%', percent: 40, tone: 'busy' });
  assert.equal(statusBarState(base({ phase: 'backing-up' }), 'main', NOW).key, 'Backing up…');
  assert.equal(statusBarState(base({ phase: 'waiting-connection' }), 'main', NOW).key, 'Waiting for connection');
  assert.equal(statusBarState(base({}, { online: false }), 'main', NOW).key, 'Waiting for connection');
  assert.equal(statusBarState(base({ phase: 'paused' }), 'main', NOW).key, 'Paused');
  assert.equal(statusBarState(base({ phase: 'needs-attention' }), 'main', NOW).key, 'Needs attention');
  assert.equal(statusBarState(base({ enabled: false }), 'main', NOW).key, 'Automatic backup off');
  assert.equal(statusBarState(base({}, { settings: { enabled: false } }), 'main', NOW).key, 'Automatic backup off');
  assert.equal(statusBarState(base({}, { noticeRequired: true }), 'main', NOW).key, 'Automatic backup off');
  assert.equal(statusBarState(base({}, { signedIn: false }), 'main', NOW).key, 'Sign in to back up');
  assert.equal(statusBarState(base({ dirty: true }), 'main', NOW).key, 'Changes waiting');
  assert.equal(statusBarState(base({}), 'main', NOW).key, 'Waiting for the first backup');
});

test('drives automatic backup does not cover keep their own storage wording', () => {
  assert.equal(statusBarState(null, 'main', NOW), null);
  assert.equal(statusBarState(base({ phase: 'unavailable' }), 'main', NOW), null);
  assert.equal(statusBarState(base({}), 'other', NOW), null);
});

test('every status bar state has Cantonese wording and the old sync wording no longer leads', () => {
  for (const key of ['Backed up {ago}', 'Backing up… {percent}%', 'Paused', 'Waiting for connection', 'Needs attention', 'Automatic backup off', 'Sign in to back up', 'Changes waiting', 'Waiting for the first backup', 'just now', '{count} min ago', '{count} h ago'])
    assert.ok(SHELL_COPY[key], key);
  const chrome = readFileSync(new URL('../src/renderer/features/shell/workspace-chrome.js', import.meta.url), 'utf8');
  assert.match(chrome, /set\('status-sync', backup \? backupLine\(backup\) :/);
  assert.match(readFileSync(new URL('../src/renderer/app.js', import.meta.url), 'utf8'), /autoBackupStatus:api\?\.autoBackupStatus\?\(\)=>api\.autoBackupStatus\(\):null/);
});

test('Back up all now backs up through automatic backup and the one-off tools only open before it is ready', () => {
  const page = readFileSync(new URL('../src/renderer/features/storage-maintenance/hub-overview.js', import.meta.url), 'utf8');
  assert.match(page, /backupAll\.addEventListener\('click', \(\) => void backUpAll\(\)\)/);
  const body = page.slice(page.indexOf('async function backUpAll()'), page.indexOf('function render()'));
  assert.match(body, /services\.autoBackupNow\(drive\.sessionId\)/);
  assert.match(body, /noticeRequired[^\n]*onBackupAll\(\)/);
  const copy = readFileSync(new URL('../src/renderer/features/storage-maintenance/backup-all-copy.js', import.meta.url), 'utf8');
  assert.doesNotMatch(copy, /Each drive becomes its own repository, and an hourly sync/);
});
