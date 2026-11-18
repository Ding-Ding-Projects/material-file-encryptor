import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { groupDrives, driveState, summary, progressPercent, relativeTime, shortId, TAG_WARNING } from '../src/renderer/features/storage-maintenance/auto-backup/model.js';
import { AUTO_BACKUP_COPY } from '../src/renderer/features/storage-maintenance/auto-backup/copy.js';
import { SETTINGS_LAYOUT_COPY } from '../src/renderer/features/settings-layout/copy.js';

const NOW = Date.parse('2026-11-17T10:00:00Z');
const drive = (patch = {}) => ({ sessionId: 's', name: 'Work', enabled: true, phase: 'idle', dirty: false, lastBackup: null, repository: 'someone/material-file-encryptor-storage', visibility: 'public', tagCount: 12, progress: null, ...patch });
const status = (drives, patch = {}) => ({ settings: { enabled: true, idleDelaySeconds: 60 }, signedIn: true, account: 'someone', online: true, noticeRequired: false, running: null, drives, ...patch });

test('drives are grouped by repository with the largest known tag count, and unconfigured drives come last', () => {
  const groups = groupDrives([drive({ sessionId: 'b', repository: 'someone/zeta', tagCount: 3 }), drive({ sessionId: 'n', repository: null, tagCount: null }), drive({ sessionId: 'a', tagCount: 810 }), drive({ sessionId: 'c', tagCount: 805 })]);
  assert.deepEqual(groups.map(group => group.repository), ['someone/material-file-encryptor-storage', 'someone/zeta', null]);
  assert.equal(groups[0].tagCount, 810); assert.equal(groups[0].nearLimit, true, `amber from ${TAG_WARNING}`);
  assert.equal(groups[1].nearLimit, false); assert.equal(groups[2].tagCount, null);
});

test('each drive row names one honest state', () => {
  assert.equal(driveState(drive({ phase: 'unavailable' })).key, 'No encrypted storage');
  assert.equal(driveState(drive({ enabled: false, lastBackup: 'x' })).key, 'Backup off');
  assert.deepEqual(driveState(drive({ phase: 'backing-up', progress: { completedBytes: 40, totalBytes: 100 } })), { key: 'Backing up…', tone: 'busy', percent: 40 });
  assert.equal(driveState(drive({ phase: 'waiting-connection' })).key, 'Waiting for connection');
  assert.equal(driveState(drive({ phase: 'needs-attention' })).tone, 'error');
  assert.equal(driveState(drive({ dirty: true, lastBackup: '2026-11-17T09:00:00Z' })).key, 'Changes waiting');
  assert.equal(driveState(drive({ lastBackup: '2026-11-17T09:00:00Z' })).key, 'Backed up');
  assert.equal(driveState(drive()).key, 'Waiting for the first backup');
});

test('the summary line follows sign-in, the notice, connection, failures and the latest backup', () => {
  assert.equal(summary(null).key, 'Loading the drive list…');
  assert.equal(summary(status([], { signedIn: false })).key, 'Sign in to Docker Hub to back up automatically');
  assert.equal(summary(status([], { noticeRequired: true })).key, 'Read the notice below to turn on automatic backup');
  assert.equal(summary(status([], { settings: { enabled: false } })).key, 'Automatic backup is off');
  assert.equal(summary(status([drive({ phase: 'backing-up', progress: { completedFiles: 1, totalFiles: 4 } })])).percent, 25);
  assert.equal(summary(status([drive()], { online: false })).key, 'Waiting for connection');
  assert.equal(summary(status([drive({ phase: 'needs-attention' })])).key, 'Needs attention');
  const done = summary(status([drive({ lastBackup: '2026-11-17T09:58:00Z' }), drive({ lastBackup: '2026-11-17T08:00:00Z' })]), NOW);
  assert.equal(done.key, 'Backed up {ago}'); assert.deepEqual(done.ago, { key: '{count} min ago', count: 2 });
  assert.equal(summary(status([drive({ enabled: false, phase: 'needs-attention' })])).key, 'Automatic backup is on', 'a drive switched off does not raise attention');
});

test('progress, time and short ids are bounded and never invented', () => {
  assert.equal(progressPercent(null), null); assert.equal(progressPercent({ completedFiles: 3, totalFiles: null }), null); assert.equal(progressPercent({ completedBytes: 200, totalBytes: 100 }), 100);
  assert.deepEqual(relativeTime(null, NOW), { key: 'Never' }); assert.deepEqual(relativeTime('2026-11-17T09:59:40Z', NOW), { key: 'just now' });
  assert.deepEqual(relativeTime('2026-11-17T07:00:00Z', NOW), { key: '{count} h ago', count: 3 }); assert.equal(relativeTime('2026-11-10T07:00:00Z', NOW).key, 'date');
  assert.equal(shortId('abcdef0123'), 'abcdef'); assert.equal(shortId('../x'), ''); assert.equal(shortId(null), '');
});

test('every string the backup page and the Backup settings show has Cantonese wording', async () => {
  const keys = source => [...source.matchAll(/\bL\('((?:[^'\\]|\\.)+)'/g)].map(match => match[1].replace(/\\'/g, '\''));
  const page = await fs.readFile(new URL('../src/renderer/features/storage-maintenance/hub-overview.js', import.meta.url), 'utf8');
  const model = await fs.readFile(new URL('../src/renderer/features/storage-maintenance/auto-backup/model.js', import.meta.url), 'utf8');
  const modelKeys = [...model.matchAll(/key: '([^']+)'/g)].map(match => match[1]);
  for (const key of [...keys(page), ...modelKeys, 'Drive', 'From', 'Last backup', 'Snapshots', 'Status', 'Backup']) assert.ok(AUTO_BACKUP_COPY[key] || key === 'date', `missing page copy: ${key}`);
  const settings = await fs.readFile(new URL('../src/renderer/features/settings-layout/index.js', import.meta.url), 'utf8');
  for (const key of keys(settings)) assert.ok(SETTINGS_LAYOUT_COPY[key], `missing settings copy: ${key}`);
  for (const value of [...Object.values(AUTO_BACKUP_COPY), ...Object.values(SETTINGS_LAYOUT_COPY)]) assert.ok(!value.includes(String.fromCharCode(0x2014)));
});
