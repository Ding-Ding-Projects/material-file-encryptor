import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRegistrySyncService } from '../src/main/registry-sync-service.js';
import { DEFAULT_REGISTRY_SCHEDULE } from '../src/main/registry-schedule.js';
import { validateRequest } from '../src/main/validation.js';

function record(size = 32, fill = 0x54) { const b = Buffer.alloc(size + 36, fill); b.write('MFE1'); b.writeInt32LE(size, 4); return b; }
async function fixture(t, extra = {}) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'registry-service-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), work = path.join(root, 'work'); await fs.mkdir(source);
  const configuration = { Format: 3, VaultId: 'a'.repeat(32), Kind: 'password', Iterations: 600000,
    Salt: Buffer.alloc(32).toString('base64'), WrappedKey: record().toString('base64'), KeyCheck: record().toString('base64') };
  await fs.writeFile(path.join(source, 'vault.json'), JSON.stringify(configuration));
  const requests = [], options = { root: work, contexts: id => id === undefined ? [['main', {}]] : ({ storageDir: source, transport: 'folder' }),
    nativeRequest: async (method, params, id) => { requests.push({ method, params, id }); return method === 'beginSnapshot' ? { leaseId: 'lease', storageDir: source } : method === 'releaseSnapshot' ? { released: true } : {}; },
    chooseRestore: async () => root, testDestination: { endpoint: 'http://127.0.0.1:15221', testOnly: true }, ...extra };
  return { root, source, work, options, requests, service: createRegistrySyncService(options) };
}
const configuration = (schedule = DEFAULT_REGISTRY_SCHEDULE) => ({ repository: 'test/vault', schedule });
test('configuration persists disabled schedules without starting a native or registry action', async t => {
  const f = await fixture(t);
  const value = await f.service.configure('main', configuration());
  assert.equal(value.configured, true); assert.equal(value.nextDue, null); assert.equal(f.requests.length, 0);
  const restarted = createRegistrySyncService(f.options); assert.deepEqual((await restarted.status('main')).configuration, configuration());
});
test('renderer validation excludes endpoint, paths, credentials and invalid schedules', () => {
  assert.deepEqual(validateRequest('configureRegistryStorage', configuration()), configuration());
  for (const patch of [{ endpoint: 'http://127.0.0.1' }, { password: 'synthetic' }, { repository: '../vault' }, { schedule: { ...DEFAULT_REGISTRY_SCHEDULE, intervalMinutes: 1 } }])
    assert.throws(() => validateRequest('configureRegistryStorage', { ...configuration(), ...patch }));
  assert.throws(() => validateRequest('restoreRegistrySnapshot', { digest: '../object' }));
  assert.deepEqual(validateRequest('restoreRegistrySnapshot', { digest: 'sha256:' + 'a'.repeat(64) }), { digest: 'sha256:' + 'a'.repeat(64) });
});
test('a fresh computer can configure and list restore storage before selecting its first vault', async t => {
  const f = await fixture(t, { contexts: id => id === undefined ? [['main', {}]] : { transport: 'folder' }, storageFactory: () => ({ list: async () => [] }) });
  assert.equal((await f.service.configure('main', configuration())).source, '');
  assert.deepEqual(await f.service.list('main'), []);
  await assert.rejects(f.service.sync('main'), /folder-backed/);
  await assert.rejects(f.service.configure('main', configuration({ ...DEFAULT_REGISTRY_SCHEDULE, enabled: true })), /Restore or select/);
});
test('background registration failure remains explicit after saved configuration', async t => {
  const f = await fixture(t, { backgroundRegistration: async () => { throw Error('synthetic unavailable'); } });
  await assert.rejects(f.service.configure('main', configuration()), /registration is incomplete/);
  assert.equal((await f.service.status('main')).configured, true);
  assert.match((await f.service.status('main')).lastError, /registration is incomplete/);
});
test('failed native preparation leaves retryable incomplete state without publication', async t => {
  let uploads = 0;
  const f = await fixture(t, { storageFactory: () => ({ list: async () => [], publish: async () => { uploads++; } }), nativeRequest: async () => { throw Error('synthetic-native-failure'); } });
  await f.service.configure('main', configuration()); await assert.rejects(f.service.sync('main'), /incomplete/);
  const state = await f.service.status('main'); assert.equal(state.state, 'incomplete'); assert.equal(uploads, 0); assert.equal(f.service.pending, false);
  assert.ok(await fs.stat(path.join(f.source, 'vault.json')));
});
test('one operation is active and cancellation is scoped to its owning session', async t => {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { storageFactory: () => ({ list: async signal => { enter(); await wait; signal.throwIfAborted(); return []; } }) });
  await f.service.configure('main', configuration());
  const running = f.service.sync('main'); const rejected = assert.rejects(running, /incomplete/); await entered;
  await assert.rejects(f.service.sync('main'), /current registry operation/);
  await assert.rejects(f.service.cancel('other'), /another vault/);
  assert.deepEqual(await f.service.cancel('main'), { cancelling: true }); release(); await rejected;
  assert.equal((await f.service.status('main')).state, 'cancelled');
});
test('scheduled failures use configured retry time and disabled schedules never run', async t => {
  let clock = 0, calls = 0;
  const f = await fixture(t, { now: () => clock, storageFactory: () => ({ list: async () => { calls++; throw Error('offline'); } }) });
  await f.service.configure('main', configuration()); clock = 999999; await f.service.tick(); assert.equal(calls, 0);
  await f.service.configure('main', configuration({ ...DEFAULT_REGISTRY_SCHEDULE, enabled: true, intervalMinutes: 5, retryMinutes: 10 }));
  clock += 300000; await f.service.tick(); assert.equal(calls, 1); assert.equal((await f.service.status('main')).nextDue, clock + 600000);
});
test('unconfigured main and unrelated transports cannot starve a configured secondary schedule', async t => {
  let clock = 0, calls = 0;
  const f = await fixture(t, { now: () => clock, storageFactory: () => ({ list: async () => { calls++; throw Error('offline'); } }) });
  f.options.contexts = id => id === undefined ? [['main', {}], ['private', {}], ['secondary', {}]] :
    id === 'main' ? {} : id === 'private' ? { storageDir: f.source, transport: 'privateGit' } : { storageDir: f.source, transport: 'folder' };
  const service = createRegistrySyncService(f.options);
  await service.configure('secondary', configuration({ ...DEFAULT_REGISTRY_SCHEDULE, enabled: true, intervalMinutes: 5 }));
  clock = 300000; await service.tick(); assert.equal(calls, 1);
});
test('a failed native release retains ownership and blocks new work until explicit recovery', async t => {
  let releases = 0;
  const f = await fixture(t, { storageFactory: () => ({ list: async () => [] }) });
  f.options.nativeRequest = async method => {
    if (method === 'beginSnapshot') return { leaseId: 'owned', storageDir: f.source };
    if (method === 'releaseSnapshot' && ++releases === 1) throw Error('synthetic release failure');
    return { released: true };
  };
  const service = createRegistrySyncService(f.options); await service.configure('main', configuration());
  await assert.rejects(service.sync('main'), /incomplete/);
  assert.equal(service.pending, true); assert.equal((await service.status('main')).state, 'native-release-unverified');
  assert.throws(() => service.close(), /still pending/);
  await service.cancel('main'); assert.equal(service.pending, false); assert.equal(releases, 2);
});
test('real registry service publication, unchanged-skip and fresh-folder restoration', { skip: !process.env.MFE_TEST_REGISTRY }, async t => {
  const f = await fixture(t, { testDestination: { endpoint: process.env.MFE_TEST_REGISTRY, testOnly: true } });
  await f.service.configure('main', { ...configuration(), repository: `test/service-${Date.now()}` });
  const first = await f.service.sync('main'); assert.equal(first.verified, true); assert.equal(first.published, true);
  const second = await f.service.sync('main'); assert.equal(second.published, false); assert.equal(second.digest, first.digest);
  const restored = await f.service.restore('main', first.digest); assert.equal(restored.restored, true); assert.equal(restored.requiresUnlock, true);
  assert.deepEqual(await fs.readFile(path.join(restored.destination, 'vault.json')), await fs.readFile(path.join(f.source, 'vault.json')));
  assert.ok(f.requests.some(r => r.method === 'releaseSnapshot'));
});
