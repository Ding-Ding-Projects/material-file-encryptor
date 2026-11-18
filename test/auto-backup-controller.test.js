import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAutoBackup, RETRY_MINUTES } from '../src/main/auto-backup/controller.js';
import { createAutoBackupSettings, validateAutoBackupPatch, DEFAULT_AUTO_BACKUP } from '../src/main/auto-backup/settings.js';

async function harness(t, { signedIn = true, failures = 0, acknowledged = true, drives = [{ sessionId: 'a', name: 'Work', storageDir: 'C:\\s\\a', transport: 'folder' }, { sessionId: 'b', name: 'Photos', storageDir: 'C:\\s\\b', transport: 'folder' }] } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-backup-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let clock = Date.parse('2026-11-17T10:00:00Z'), online = true, failLeft = failures;
  const rows = {}, calls = { sync: [], ensure: [], configure: [] }, hooks = {};
  const sync = {
    pending: false,
    async status(id) { const row = rows[id]; return { configured: Boolean(row), configuration: row ? { repository: row.repository, visibility: row.visibility, schedule: row.schedule } : null, lastResult: row?.lastResult ?? null, state: 'idle', snapshotCount: row?.count ?? null, tagCount: null, lastPrune: null, deviceId: null }; },
    async configure(id, value) { calls.configure.push([id, value.repository, value.schedule.enabled]); rows[id] = { ...rows[id], ...value }; },
    async sync(id) { calls.sync.push(id); hooks.duringSync?.(); if (failLeft > 0) { failLeft--; throw Error('Registry synchronization is incomplete.'); } rows[id].lastResult = { verifiedAt: new Date(clock).toISOString() }; rows[id].count = (rows[id].count ?? 0) + 1; return { verified: true }; },
  };
  const docker = { inspectRegistrySignIn: async () => signedIn ? { state: 'signed-in', account: 'Someone' } : { state: 'missing' }, ensurePublicRepository: async repository => { calls.ensure.push(repository); } };
  const settings = createAutoBackupSettings({ file: path.join(dir, 'auto-backup.json') });
  if (acknowledged) await settings.update({ noticeAcknowledged: true });
  const auto = createAutoBackup({ sync, docker, drives: () => drives, settings, online: () => online, now: () => clock });
  return { auto, calls, rows, settings, hooks, advance: ms => { clock += ms; }, setOnline: value => { online = value; }, dir };
}

test('settings default to automatic backup on, 1 minute idle, hourly check, back up on lock, and closed-app backup off', async t => {
  assert.equal(DEFAULT_AUTO_BACKUP.enabled, true); assert.equal(DEFAULT_AUTO_BACKUP.idleDelaySeconds, 60); assert.equal(DEFAULT_AUTO_BACKUP.intervalMinutes, 60);
  assert.equal(DEFAULT_AUTO_BACKUP.onLock, true); assert.equal(DEFAULT_AUTO_BACKUP.whileClosed, false); assert.equal(DEFAULT_AUTO_BACKUP.repositoryLayout, 'shared');
  for (const bad of [{}, { enabled: 'yes' }, { idleDelaySeconds: 7 }, { intervalMinutes: 1 }, { repositoryLayout: 'other' }, { retention: { keepLatest: 0, keepDaily: 0, keepWeekly: 0 } }, { unknown: true }])
    assert.throws(() => validateAutoBackupPatch(bad));
  const h = await harness(t, { acknowledged: false });
  const saved = await h.settings.setDrive('b', false);
  assert.equal(saved.drives.b.enabled, false);
  const reread = createAutoBackupSettings({ file: path.join(h.dir, 'auto-backup.json') });
  assert.equal(await reread.driveEnabled('b'), false); assert.equal(await reread.driveEnabled('a'), true);
});

test('nothing is uploaded before sign-in and before the public notice is acknowledged', async t => {
  const out = await harness(t, { signedIn: false });
  await out.auto.tick(); assert.deepEqual(out.calls.sync, []);
  const quiet = await harness(t, { acknowledged: false });
  await quiet.auto.tick(); assert.deepEqual(quiet.calls.sync, []);
  await assert.rejects(quiet.auto.backUpNow('a'), /public repository notice/);
  assert.equal((await quiet.auto.status()).noticeRequired, true);
});

test('a new drive goes to the shared repository, created public, with its own schedule left off', async t => {
  const h = await harness(t);
  await h.auto.tick();
  assert.deepEqual(h.calls.ensure, ['someone/material-file-encryptor-storage']);
  assert.deepEqual(h.calls.configure, [['a', 'someone/material-file-encryptor-storage', false]]);
  assert.deepEqual(h.calls.sync, ['a'], 'one drive per check');
  await h.auto.tick(); assert.deepEqual(h.calls.sync, ['a', 'b']);
  await h.auto.tick(); assert.deepEqual(h.calls.sync, ['a', 'b'], 'nothing is due until the next periodic check');
  h.advance(60 * 60000); await h.auto.tick(); assert.deepEqual(h.calls.sync, ['a', 'b', 'a']);
});

test('one repository per drive is used when the layout asks for it', async t => {
  const h = await harness(t);
  await h.settings.update({ repositoryLayout: 'per-drive' });
  await h.auto.tick();
  assert.deepEqual(h.calls.ensure, ['someone/mfe-work']);
});

test('a change backs up after the idle delay, and a lock with pending changes backs up at once', async t => {
  const h = await harness(t);
  await h.auto.tick(); await h.auto.tick(); h.calls.sync.length = 0;
  await h.auto.noteChange('a');
  h.advance(30000); await h.auto.tick(); assert.deepEqual(h.calls.sync, [], 'still inside the idle delay');
  await h.auto.noteChange('a'); h.advance(45000); await h.auto.tick(); assert.deepEqual(h.calls.sync, [], 'a new change restarts the delay');
  h.advance(16000); await h.auto.tick(); assert.deepEqual(h.calls.sync, ['a']);
  assert.deepEqual(h.auto.pendingChanges(), []);
  await h.auto.noteChange('b'); assert.deepEqual(h.auto.pendingChanges(), ['b']);
  await h.auto.noteLock('b'); await h.auto.tick(); assert.deepEqual(h.calls.sync, ['a', 'b']);
});

test('a drive switched off is never backed up automatically', async t => {
  const h = await harness(t);
  await h.auto.setDrive('a', false);
  await h.auto.tick(); await h.auto.tick();
  assert.deepEqual(h.calls.sync, ['b']);
  const status = await h.auto.status();
  assert.equal(status.drives.find(x => x.sessionId === 'a').phase, 'off');
});

test('failures retry after 1, 5 and 15 minutes, then hourly, and offline drives wait for the connection', async t => {
  assert.deepEqual(RETRY_MINUTES, [1, 5, 15, 60]);
  const h = await harness(t, { failures: 5, drives: [{ sessionId: 'a', name: 'Work', storageDir: 'C:\\s\\a', transport: 'folder' }] });
  await h.auto.tick(); assert.equal(h.calls.sync.length, 1);
  let status = (await h.auto.status()).drives[0]; assert.equal(status.phase, 'needs-attention'); assert.equal(status.failures, 1);
  for (const [minutes, expected] of [[1, 2], [5, 3], [15, 4], [60, 5]]) {
    h.advance(minutes * 60000 - 1000); await h.auto.tick(); assert.equal(h.calls.sync.length, expected - 1, `not before ${minutes} min`);
    h.advance(1000); await h.auto.tick(); assert.equal(h.calls.sync.length, expected, `after ${minutes} min`);
  }
  h.setOnline(false); h.advance(60 * 60000); await h.auto.tick(); assert.equal(h.calls.sync.length, 5, 'no attempt while offline');
  h.setOnline(true); await h.auto.tick(); assert.equal(h.calls.sync.length, 6, 'the hourly retry runs once the connection is back');
  status = (await h.auto.status()).drives[0]; assert.equal(status.phase, 'idle'); assert.equal(status.failures, 0);
});

test('a failure while offline waits for the connection and retries as soon as it returns', async t => {
  const h = await harness(t, { failures: 1, drives: [{ sessionId: 'a', name: 'Work', storageDir: 'C:\\s\\a', transport: 'folder' }] });
  h.hooks.duringSync = () => h.setOnline(false);
  await h.auto.tick();
  assert.equal((await h.auto.status()).drives[0].phase, 'waiting-connection');
  h.hooks.duringSync = null;
  await h.auto.tick(); assert.equal(h.calls.sync.length, 1, 'nothing runs while offline');
  h.setOnline(true); h.advance(1000);
  await h.auto.tick();
  assert.equal(h.calls.sync.length, 2, 'reconnect retries at once instead of waiting out the backoff');
});

test('move to its own repository reconfigures only that drive and queues a backup', async t => {
  const h = await harness(t);
  await h.auto.tick(); h.calls.ensure.length = 0;
  await h.auto.moveToOwnRepository('a');
  assert.deepEqual(h.calls.ensure, ['someone/mfe-work']);
  assert.equal(h.rows.a.repository, 'someone/mfe-work');
  await h.auto.tick(); assert.equal(h.calls.sync.at(-1), 'a');
});

test('closing backs up drives with pending changes, and nothing else', async t => {
  const h = await harness(t);
  await h.auto.tick(); await h.auto.tick(); h.calls.sync.length = 0;
  await h.auto.noteChange('b');
  const result = await h.auto.flush(Date.parse('2026-11-17T11:00:00Z'));
  assert.equal(result.started, 1); assert.deepEqual(h.calls.sync, ['b']);
  await h.settings.update({ onLock: false }); await h.auto.noteChange('a');
  assert.equal((await h.auto.flush(Date.parse('2026-11-17T11:00:00Z'))).started, 0, 'back up on lock off also skips the close');
});

test('renderer requests for automatic backup carry only settings and a session id', async () => {
  const { validateRequest } = await import('../src/main/validation.js');
  assert.deepEqual(validateRequest('autoBackupStatus', {}), {});
  assert.deepEqual(validateRequest('autoBackupUpdate', { idleDelaySeconds: 120 }), { idleDelaySeconds: 120 });
  assert.deepEqual(validateRequest('autoBackupSetDrive', { sessionId: 'abc-1', enabled: false }), { sessionId: 'abc-1', enabled: false });
  assert.deepEqual(validateRequest('autoBackupPrune', { sessionId: 'abc-1' }), { sessionId: 'abc-1' });
  for (const [method, value] of [['autoBackupStatus', { x: 1 }], ['autoBackupUpdate', { repository: 'a/b' }], ['autoBackupSetDrive', { sessionId: '../x', enabled: true }],
    ['autoBackupNow', { sessionId: 'a', repository: 'x/y' }], ['autoBackupMove', {}], ['autoBackupUpdate', { retention: { keepLatest: 1000, keepDaily: 0, keepWeekly: 0 } }]])
    assert.throws(() => validateRequest(method, value), undefined, method);
});
