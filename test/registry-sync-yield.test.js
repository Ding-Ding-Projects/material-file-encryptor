import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createRegistrySyncService, PAUSED } from '../src/main/registry-sync-service.js';
import { DEFAULT_REGISTRY_SCHEDULE } from '../src/main/registry-schedule.js';

function record(size = 32, fill = 0x54) { const b = Buffer.alloc(size + 36, fill); b.write('MFE1'); b.writeInt32LE(size, 4); return b; }
async function fixture(t, extra = {}) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'registry-yield-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'); await fs.mkdir(source);
  const configuration = { Format: 3, VaultId: 'a'.repeat(32), Kind: 'password', Iterations: 600000,
    Salt: Buffer.alloc(32).toString('base64'), WrappedKey: record().toString('base64'), KeyCheck: record().toString('base64') };
  await fs.writeFile(path.join(source, 'vault.json'), JSON.stringify(configuration));
  let clock = 1_000_000;
  const options = { root: path.join(root, 'work'), now: () => clock, contexts: id => id === undefined ? [['main', {}]] : ({ storageDir: source, transport: 'folder' }),
    nativeRequest: async method => method === 'beginSnapshot' ? { leaseId: 'lease', storageDir: source, storageOnly: true } : method === 'releaseSnapshot' ? { released: true } : {},
    chooseRestore: async () => root, testDestination: { endpoint: 'http://127.0.0.1:15221', testOnly: true }, progressPollMs: 20, ...extra };
  const service = createRegistrySyncService(options);
  await service.configure('main', { repository: 'test/vault', visibility: 'private', schedule: DEFAULT_REGISTRY_SCHEDULE });
  return { root, source, options, service, advance: ms => { clock += ms; } };
}

test('using the drive pauses a running backup at a safe point, releases its lease and resumes later', async t => {
  let uploads = 0, releases = 0, holdUpload, resumeUpload;
  const hold = new Promise(resolve => { holdUpload = resolve; });
  const f = await fixture(t, {
    nativeRequest: async method => { if (method === 'releaseSnapshot') { releases++; return { released: true }; } return method === 'beginSnapshot' ? { leaseId: 'lease' + releases, storageDir: f.source, storageOnly: true } : {}; },
    storageFactory: () => ({ list: async () => [], publish: async ({ files, readFile }, signal) => {
      uploads++;
      if (uploads === 1) { holdUpload(); await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); }
      for (const file of files) await readFile(file.path);
      return { digest: 'sha256:' + 'd'.repeat(64), verified: true };
    } }) });
  const running = f.service.sync('main').then(() => null, error => error);
  await hold;
  const started = Date.now();
  assert.deepEqual(await f.service.yieldForDrive(), { yielded: true });
  assert.ok(Date.now() - started < 2000, 'the drive did not wait for the upload');
  const error = await running;
  assert.equal(error.message, PAUSED);
  assert.equal(f.service.pending, false, 'nothing holds the drive after a pause');
  assert.ok(releases >= 1, 'the snapshot lease was released');
  const paused = await f.service.status('main');
  assert.equal(paused.state, 'paused'); assert.equal(paused.lastError, null);
  // Nothing resumes before the pause delay; then the next tick resumes the backup even with the schedule off.
  await f.service.tick(); assert.equal(uploads, 1);
  f.advance(61000); await f.service.tick();
  assert.equal(uploads, 2); assert.equal((await f.service.status('main')).state, 'verified');
});

test('a backup paused before a restart still resumes', async t => {
  const f = await fixture(t, { storageFactory: () => ({ list: async (signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) }) });
  const running = f.service.sync('main').catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 30));
  await f.service.yieldForDrive(); await running;
  const restarted = createRegistrySyncService(f.options);
  assert.equal((await restarted.status('main')).state, 'paused');
});

test('listing or restoring never blocks the drive, and an idle service yields nothing', async t => {
  const f = await fixture(t, { storageFactory: () => ({ list: async () => { await new Promise(resolve => setTimeout(resolve, 100)); return []; } }) });
  assert.deepEqual(await f.service.yieldForDrive(), { yielded: false });
  const listing = f.service.list('main');
  assert.deepEqual(await f.service.yieldForDrive(), { yielded: false });
  assert.deepEqual(await listing, []);
});

test('a backup that cannot release the drive in time says so instead of pretending', async t => {
  const f = await fixture(t, { yieldWaitMs: 100, lateLeaseWaitMs: 2000,
    nativeRequest: async method => method === 'beginSnapshot' ? new Promise(() => {}) : {},
    storageFactory: () => ({ list: async () => [] }) });
  const running = f.service.sync('main').catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 50));
  await assert.rejects(f.service.yieldForDrive(), /still releasing the drive/);
  await running;
});

test('the main process lets the drive be locked, unlocked or mounted during a backup instead of refusing', () => {
  const main = readFileSync(new URL('../src/main/main.js', import.meta.url), 'utf8');
  assert.match(main, /'unlockVault', 'upgradeVault', 'lockVault', 'forceLock', 'unmount', 'mount', 'setPreferences'\]\.includes\(method\)\) await registrySync\.yieldForDrive\(\);/);
  assert.doesNotMatch(main, /Wait for registry synchronization before changing the vault session/);
});
