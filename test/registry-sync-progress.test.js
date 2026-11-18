import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRegistrySyncService } from '../src/main/registry-sync-service.js';
import { DEFAULT_REGISTRY_SCHEDULE } from '../src/main/registry-schedule.js';
import { progressView, formatBytes, formatDuration, formatTimestamp, SLOW_AFTER_MS } from '../src/renderer/features/storage-maintenance/registry-progress.js';

function record(size = 32, fill = 0x54) { const b = Buffer.alloc(size + 36, fill); b.write('MFE1'); b.writeInt32LE(size, 4); return b; }
async function fixture(t, extra = {}) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'registry-progress-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), work = path.join(root, 'work'); await fs.mkdir(source);
  const configuration = { Format: 3, VaultId: 'a'.repeat(32), Kind: 'password', Iterations: 600000,
    Salt: Buffer.alloc(32).toString('base64'), WrappedKey: record().toString('base64'), KeyCheck: record().toString('base64') };
  await fs.writeFile(path.join(source, 'vault.json'), JSON.stringify(configuration));
  const requests = [];
  const options = { root: work, contexts: id => id === undefined ? [['main', {}]] : ({ storageDir: source, transport: 'folder' }),
    nativeRequest: async (method, params, id) => { requests.push(method); return method === 'beginSnapshot' ? { leaseId: 'lease-' + requests.length, storageDir: source } : method === 'releaseSnapshot' ? { released: true } : {}; },
    chooseRestore: async () => root, testDestination: { endpoint: 'http://127.0.0.1:15221', testOnly: true }, progressPollMs: 20, lateLeaseWaitMs: 2000, ...extra };
  const service = createRegistrySyncService(options);
  await service.configure('main', { repository: 'test/vault', visibility: 'private', schedule: DEFAULT_REGISTRY_SCHEDULE });
  return { root, source, work, options, requests, service };
}
const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('condition not reached'); };

test('a full synchronization walks through named steps with counts, ending verified', async t => {
  const seen = [];
  let service;
  const watch = async () => { const s = await service.status('main'); const key = s.progress ? `${s.state}:${s.progress.step}` : s.state; if (seen.at(-1) !== key) seen.push(key); };
  const f = await fixture(t, { storageFactory: () => ({
    list: async () => { await watch(); return []; },
    publish: async ({ files, readFile, onVerifying }) => {
      for (const file of files) { await readFile(file.path); await watch(); }
      onVerifying(); await watch();
      return { digest: 'sha256:' + 'b'.repeat(64), verified: true };
    } }),
  nativeRequest: async method => { if (service) await watch(); return method === 'beginSnapshot' ? { leaseId: 'l' + Math.random(), storageDir: f.source } : method === 'releaseSnapshot' ? { released: true } : {}; } });
  service = f.service;
  const result = await service.sync('main');
  assert.equal(result.verified, true);
  for (const expected of ['discovering:discovering', 'waiting-drive:waiting-drive', 'applying:applying', 'preparing:preparing', 'uploading:uploading', 'verifying:verifying'])
    assert.ok(seen.includes(expected), `${expected} was shown; saw ${seen.join(', ')}`);
  assert.equal((await service.status('main')).state, 'verified');
});

test('upload progress counts files and bytes against a known total', async t => {
  let snapshotProgress;
  const f = await fixture(t, { storageFactory: () => ({ list: async () => [],
    publish: async ({ files, readFile }) => { for (const file of files) await readFile(file.path); snapshotProgress = (await f.service.status('main')).progress; return { digest: 'sha256:' + 'c'.repeat(64), verified: true }; } }) });
  await f.service.sync('main');
  assert.equal(snapshotProgress.step, 'uploading'); assert.equal(snapshotProgress.completedFiles, snapshotProgress.totalFiles);
  assert.ok(snapshotProgress.totalBytes > 0); assert.equal(snapshotProgress.completedBytes, snapshotProgress.totalBytes);
  assert.ok(Number.isFinite(snapshotProgress.stepStartedAt) && Number.isFinite(snapshotProgress.startedAt));
});

test('native staging counts are shown while the drive prepares its snapshot', async t => {
  let grant, counts = { preparing: true, partsDone: 0, partsTotal: 40, bytesDone: 0, bytesTotal: 4000 };
  const granted = new Promise(resolve => { grant = resolve; });
  const f = await fixture(t, { storageFactory: () => ({ list: async () => [] }),
    nativeRequest: async method => {
      if (method === 'snapshotProgress') return counts;
      if (method === 'beginSnapshot') { await granted; return { leaseId: 'staged', storageDir: f.source }; }
      return method === 'releaseSnapshot' ? { released: true } : {};
    } });
  const running = f.service.sync('main').catch(error => error);
  await until(async () => (await f.service.status('main')).progress?.totalFiles === 40);
  counts = { ...counts, partsDone: 10, bytesDone: 1000 };
  await until(async () => (await f.service.status('main')).progress?.completedFiles === 10);
  const progress = (await f.service.status('main')).progress;
  assert.equal(progress.unit, 'parts'); assert.equal(progress.completedBytes, 1000); assert.equal(progress.totalBytes, 4000);
  grant(); await running;
});

test('cancel while the drive is still staging ends the operation at once and releases a lease that arrives later', async t => {
  let grant; const granted = new Promise(resolve => { grant = resolve; });
  const released = [];
  const f = await fixture(t, { storageFactory: () => ({ list: async () => [] }),
    nativeRequest: async (method, params) => {
      if (method === 'beginSnapshot') { await granted; return { leaseId: 'late-lease', storageDir: f.source }; }
      if (method === 'releaseSnapshot') { released.push(params.leaseId); return { released: true }; }
      return {};
    } });
  const running = f.service.sync('main').then(() => null, error => error);
  await until(async () => (await f.service.status('main')).state === 'waiting-drive');
  const started = Date.now();
  await f.service.cancel('main');
  setTimeout(grant, 300);
  const error = await running;
  assert.ok(error instanceof Error);
  assert.ok(Date.now() - started < 2500, 'cancel finished within seconds');
  assert.deepEqual(released, ['late-lease'], 'the lease granted after cancel was released');
  assert.equal(f.service.pending, false);
  assert.equal((await f.service.status('main')).state, 'cancelled');
});

test('a lease that never arrives after cancel keeps ownership explicit until it is released', async t => {
  let grant; const granted = new Promise(resolve => { grant = resolve; });
  const f = await fixture(t, { lateLeaseWaitMs: 100, storageFactory: () => ({ list: async () => [] }),
    nativeRequest: async method => {
      if (method === 'beginSnapshot') { await granted; return { leaseId: 'slow', storageDir: f.source }; }
      return method === 'releaseSnapshot' ? { released: true } : {};
    } });
  const running = f.service.sync('main').catch(() => {});
  await until(async () => (await f.service.status('main')).state === 'waiting-drive');
  await f.service.cancel('main'); await running;
  assert.equal(f.service.pending, true); assert.equal((await f.service.status('main')).state, 'native-release-unverified');
  grant();
  await until(() => !f.service.pending);
  assert.equal((await f.service.status('main')).state, 'cancelled');
  await assert.rejects(f.service.sync('main'), /incomplete/, 'a new run can start once the late lease was released');
});

test('staging that stops reporting progress is stopped with a plain reason and nothing is uploaded', async t => {
  let uploads = 0;
  const f = await fixture(t, { nativeStallMs: 150, storageFactory: () => ({ list: async () => [], publish: async () => { uploads++; } }),
    nativeRequest: async (method, params) => {
      if (method === 'snapshotProgress') return { preparing: true, partsDone: 3, partsTotal: 9, bytesDone: 30, bytesTotal: 90 };
      if (method === 'beginSnapshot') return new Promise(() => {});
      return method === 'releaseSnapshot' ? { released: true } : {};
    }, lateLeaseWaitMs: 50 });
  await assert.rejects(f.service.sync('main'), /stopped making progress/);
  assert.equal(uploads, 0);
  assert.match((await f.service.status('main')).lastError, /stopped making progress/);
});

test('a drive that never confirms release times out with a plain reason and keeps the lease explicit', async t => {
  const f = await fixture(t, { releaseTimeoutMs: 100, storageFactory: () => ({ list: async () => [] }),
    nativeRequest: async method => method === 'beginSnapshot' ? { leaseId: 'held', storageDir: f.source } : method === 'releaseSnapshot' ? new Promise(() => {}) : {} });
  const started = Date.now();
  await assert.rejects(f.service.sync('main'));
  assert.ok(Date.now() - started < 3000);
  assert.equal((await f.service.status('main')).state, 'native-release-unverified');
});

test('cancel during the native replay stops waiting at once', async t => {
  const f = await fixture(t, { storageFactory: () => ({ list: async () => [] }),
    nativeRequest: async method => {
      if (method === 'sync') return { sync: { running: true, pendingCommits: 4 } };
      if (method === 'statusSummary') return { sync: { running: true, pendingCommits: 3 } };
      return method === 'beginSnapshot' ? { leaseId: 'a', storageDir: f.source } : method === 'releaseSnapshot' ? { released: true } : {};
    } });
  const running = f.service.sync('main').catch(error => error);
  await until(async () => (await f.service.status('main')).progress?.pendingCommits === 3 || (await f.service.status('main')).progress?.pendingCommits === 4);
  assert.equal((await f.service.status('main')).state, 'applying');
  const started = Date.now(); await f.service.cancel('main'); await running;
  assert.ok(Date.now() - started < 2000);
  assert.equal((await f.service.status('main')).state, 'cancelled'); assert.equal(f.service.pending, false);
});

test('the progress view gives a fraction, elapsed time and a slow note after the threshold', () => {
  const now = 1_000_000;
  const view = progressView({ step: 'preparing', phase: 'staging', unit: 'parts', completedFiles: 25, totalFiles: 100, completedBytes: 250, totalBytes: 1000, stepStartedAt: now - 65000, startedAt: now - 125000 }, now);
  assert.equal(view.fraction, 0.25); assert.equal(view.elapsedMs, 65000); assert.equal(view.totalElapsedMs, 125000); assert.equal(view.slow, false);
  const slow = progressView({ step: 'waiting-drive', stepStartedAt: now - SLOW_AFTER_MS['waiting-drive'] }, now);
  assert.equal(slow.slow, true); assert.equal(slow.fraction, null);
  assert.equal(progressView({ step: 'unknown-step' }, now), null);
  assert.equal(progressView(null, now), null);
});

test('sizes, durations and stored times are formatted for people', () => {
  assert.equal(formatBytes(1871), '1.8 KB'); assert.equal(formatBytes(7.0 * 1024 ** 3), '7.0 GB'); assert.equal(formatBytes(512), '512 B');
  assert.equal(formatDuration(65000), '1:05'); assert.equal(formatDuration(3723000), '1:02:03'); assert.equal(formatDuration(-5), '0:00');
  const epoch = 1794964530876;
  const text = formatTimestamp(epoch, 'en');
  assert.ok(text && !text.includes(String(epoch)) && /2026/.test(text), text);
  assert.match(formatTimestamp(epoch, 'zh-HK'), /2026/);
  assert.equal(formatTimestamp(null), null); assert.equal(formatTimestamp('not a time'), null);
  assert.ok(formatTimestamp('2026-11-17T10:00:00.000Z', 'en'));
});
