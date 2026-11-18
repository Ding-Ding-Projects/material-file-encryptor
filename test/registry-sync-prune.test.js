import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRegistrySyncService } from '../src/main/registry-sync-service.js';
import { createRegistryStorage } from '../src/main/registry-storage.js';
import { DEFAULT_REGISTRY_SCHEDULE } from '../src/main/registry-schedule.js';
import { createFakeRegistry } from './helpers/fake-hub-registry.js';

function record(size = 32, fill = 0x54) { const b = Buffer.alloc(size + 36, fill); b.write('MFE1'); b.writeInt32LE(size, 4); return b; }
async function fixture(t, registry, extra = {}) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'registry-prune-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), work = path.join(root, 'work'); await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'vault.json'), JSON.stringify({ Format: 3, VaultId: 'a'.repeat(32), Kind: 'password', Iterations: 600000,
    Salt: Buffer.alloc(32).toString('base64'), WrappedKey: record().toString('base64'), KeyCheck: record().toString('base64') }));
  let clock = Date.parse('2026-11-16T08:00:00Z');
  const options = { root: work, contexts: id => id === undefined ? [['main', {}]] : ({ storageDir: source, transport: 'folder' }),
    nativeRequest: async method => method === 'beginSnapshot' ? { leaseId: 'lease', storageDir: source } : method === 'releaseSnapshot' ? { released: true } : {},
    chooseRestore: async () => root, testDestination: registry.destination, now: () => clock,
    storageFactory: value => createRegistryStorage({ ...value, fetcher: registry.fetcher }), ...extra };
  const service = createRegistrySyncService(options);
  await service.configure('main', { repository: registry.destination.repository, visibility: 'public', schedule: DEFAULT_REGISTRY_SCHEDULE });
  return { source, service, advance: ms => { clock += ms; }, options };
}
// Each backup changes the drive's content so a new snapshot is published.
// Each backup adds one encrypted part, so a new snapshot is published.
const touch = async (source, n) => { await fs.mkdir(path.join(source, 'parts'), { recursive: true }); await fs.writeFile(path.join(source, 'parts', `${n.toString(16).padStart(32, '0')}.mfe`), record(32, 0x40 + n)); };

test('every verified backup prunes this drive to its retention rules and reports the counts', async t => {
  const registry = createFakeRegistry('test/material-file-encryptor-storage');
  const f = await fixture(t, registry, { retention: () => ({ keepLatest: 3, keepDaily: 0, keepWeekly: 0 }) });
  let last;
  for (let n = 0; n < 6; n++) { await touch(f.source, n); f.advance(3600000); last = await f.service.sync('main'); }
  assert.equal(last.published, true);
  assert.equal(registry.tags.size, 3, 'only the 3 newest snapshots stay');
  assert.ok(registry.tags.has(last.tag), 'the newest verified snapshot is kept');
  const status = await f.service.status('main');
  assert.equal(status.lastPrune.state, 'done'); assert.equal(status.lastPrune.pruned, 1); assert.equal(status.lastPrune.kept, 3);
  assert.equal(status.tagCount, 3); assert.equal(status.snapshotCount, 3);
  assert.equal(last.prune.pruned, 1);
});

test('a failed prune never fails the backup and is retried after the next one', async t => {
  const registry = createFakeRegistry('test/material-file-encryptor-storage');
  let refuse = true;
  const fetcher = async (input, options = {}) => refuse && options.method === 'DELETE' ? new Response('', { status: 503 }) : registry.fetcher(input, options);
  const f = await fixture(t, registry, { retention: () => ({ keepLatest: 2, keepDaily: 0, keepWeekly: 0 }), storageFactory: value => createRegistryStorage({ ...value, fetcher }) });
  for (let n = 0; n < 4; n++) { await touch(f.source, n); f.advance(3600000); const result = await f.service.sync('main'); assert.equal(result.verified, true); }
  let status = await f.service.status('main');
  assert.equal(status.state, 'verified'); assert.equal(status.lastError, null);
  assert.equal(status.lastPrune.state, 'partial'); assert.equal(registry.tags.size, 4);
  refuse = false; f.advance(3600000);
  await f.service.sync('main');
  status = await f.service.status('main');
  assert.equal(status.lastPrune.pruned, 2); assert.equal(registry.tags.size, 2);
});

test('prune now applies the rules without a new backup, and needs a verified backup first', async t => {
  const registry = createFakeRegistry('test/material-file-encryptor-storage');
  let policy = { keepLatest: 10, keepDaily: 0, keepWeekly: 0 };
  const f = await fixture(t, registry, { retention: () => policy });
  await assert.rejects(f.service.pruneNow('main'), /Back up this drive once/);
  for (let n = 0; n < 5; n++) { await touch(f.source, n); f.advance(3600000); await f.service.sync('main'); }
  assert.equal(registry.tags.size, 5);
  policy = { keepLatest: 1, keepDaily: 0, keepWeekly: 0 };
  const outcome = await f.service.pruneNow('main');
  assert.equal(outcome.pruned, 4); assert.equal(registry.tags.size, 1);
});
