import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detailsPaneState } from '../src/renderer/features/storage-maintenance/auto-backup/model.js';
import { SHELL_COPY } from '../src/renderer/features/shell/copy.js';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const base = (drive, extra = {}) => ({ settings: { enabled: true }, signedIn: true, online: true, noticeRequired: false, drives: [{ sessionId: 'main', enabled: true, phase: 'idle', dirty: false, lastBackup: null, progress: null, ...drive }], ...extra });

test('the details pane reflects the automatic backup of this drive instead of "not set up"', () => {
  assert.deepEqual(detailsPaneState(base({ lastBackup: '2026-11-18T11:58:00Z' }), 'main', NOW), { key: 'Backed up {ago}', ago: { key: '{count} min ago', count: 2 }, tone: 'ok' });
  assert.deepEqual(detailsPaneState(base({ phase: 'backing-up', progress: { completedBytes: 25, totalBytes: 100 } }), 'main', NOW), { key: 'Backing up… {percent}%', percent: 25, tone: 'busy' });
  assert.equal(detailsPaneState(base({ phase: 'paused' }), 'main', NOW).key, 'Paused while you use the drive');
  assert.equal(detailsPaneState(base({ phase: 'waiting-connection' }), 'main', NOW).key, 'Waiting for connection');
  assert.equal(detailsPaneState(base({ phase: 'needs-attention' }), 'main', NOW).key, 'Needs attention');
  assert.equal(detailsPaneState(base({ enabled: false }), 'main', NOW).key, 'Automatic backup is off for this drive');
  assert.equal(detailsPaneState(base({}, { settings: { enabled: false } }), 'main', NOW).key, 'Automatic backup off');
  assert.equal(detailsPaneState(base({}, { signedIn: false }), 'main', NOW).key, 'Sign in to back up');
  assert.equal(detailsPaneState(base({}), 'other', NOW), null, 'drives automatic backup does not know keep the older destination text');
});

test('every details pane state has Cantonese wording and the pane links to the backup page', () => {
  for (const key of ['Automatic backup is off for this drive', 'Paused while you use the drive', 'Open Docker Hub backup'])
    assert.ok(SHELL_COPY[key], key);
  const chrome = readFileSync(new URL('../src/renderer/features/shell/workspace-chrome.js', import.meta.url), 'utf8');
  assert.match(chrome, /detailsPaneState\(autoBackupStatus, state\.sessionId\)/);
  assert.match(chrome, /listen\(\$\('inspector-backup-settings'\), 'click', \(\) => hooks\.openView\('storage'\)\)/);
  const html = readFileSync(new URL('../src/renderer/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="inspector-backup-settings"[^>]*>Open Docker Hub backup</);
});
