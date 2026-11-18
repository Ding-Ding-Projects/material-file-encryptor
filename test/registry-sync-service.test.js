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
const configuration = (schedule = DEFAULT_REGISTRY_SCHEDULE) => ({ repository: 'test/vault', visibility: 'private', schedule });

test('a finished synchronization, even a failed one, tells listeners that a repository may have changed', async t => {
  let changes = 0;
  const f = await fixture(t, { onChanged: () => { changes++; } });
  await assert.rejects(f.service.sync('main'));
  assert.equal(changes, 1);
  const broken = await fixture(t, { onChanged: () => { throw Error('listener failure'); } });
  await assert.rejects(broken.service.sync('main'), /Registry synchronization is incomplete|Save a registry destination/);
});

test('legacy saved visibility remains private and explicit public survives reload', async t => {
  const f = await fixture(t); const legacy = configuration(); delete legacy.visibility;
  assert.equal(validateRequest('configureRegistryStorage', legacy).visibility, undefined);
  await f.service.configure('main', validateRequest('configureRegistryStorage', legacy));
  assert.equal((await f.service.status('main')).configuration.visibility, 'public', 'a brand new destination without a stated visibility defaults to public');
  const kept = { ...configuration(), visibility: 'private' }; await f.service.configure('main', kept);
  await f.service.configure('main', validateRequest('configureRegistryStorage', { repository: kept.repository, schedule: kept.schedule }));
  assert.equal((await f.service.status('main')).configuration.visibility, 'private', 'an omitted visibility never flips a saved private destination to public');
  const filename = path.join(f.work, 'registry-sync.json'); const stored = JSON.parse(await fs.readFile(filename, 'utf8'));
  for (const row of Object.values(stored.rows)) { delete row.visibility; row.lastResult = { verified: true }; }
  await fs.writeFile(filename, JSON.stringify(stored)); const reloaded = createRegistrySyncService(f.options);
  assert.equal((await reloaded.status('main')).configuration.visibility, 'private');
  await reloaded.configure('main', { ...configuration(), visibility: 'public' });
  assert.equal((await reloaded.status('main')).lastResult, null);
  const again = createRegistrySyncService(f.options); assert.equal((await again.status('main')).configuration.visibility, 'public');
  for (const visibility of [null, 'unknown', false]) assert.throws(() => validateRequest('configureRegistryStorage', { ...configuration(), visibility }));
});

test('saved visibility reaches each storage client without changing the configured repository', async t => {
  const destinations = []; const f = await fixture(t, { storageFactory: options => { destinations.push(options.destination); return { list: async () => [] }; } });
  await f.service.configure('main', { ...configuration(), visibility: 'public' }); await f.service.list('main');
  assert.equal(destinations[0].visibility, 'public'); assert.equal(destinations[0].repository, 'test/vault');
});
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

test('startup reconciles saved background registration and preserves explicit registration errors',async t=>{
  const enabled=[];const f=await fixture(t,{backgroundRegistration:async value=>enabled.push(value)});
  await f.service.configure('main',configuration({...DEFAULT_REGISTRY_SCHEDULE,enabled:true,background:true}));
  const restarted=createRegistrySyncService(f.options);await restarted.initialize();assert.deepEqual(enabled,[true,true]);
  const unavailable=createRegistrySyncService({...f.options,backgroundRegistration:async()=>{throw Error('unavailable');}});await unavailable.initialize();
  assert.match((await unavailable.status('main')).lastError,/registration is incomplete/);
});

test('calendar retry consumes the original repeated local occurrence',async t=>{
  let clock=Date.parse('2026-11-01T05:00:00Z'),calls=0;
  const f=await fixture(t,{now:()=>clock,storageFactory:()=>({list:async()=>{if(++calls===1)throw Error('offline');return[];},publish:async()=>({verified:true,digest:'sha256:'+'a'.repeat(64)})})});
  await f.service.configure('main',configuration({...DEFAULT_REGISTRY_SCHEDULE,enabled:true,mode:'calendar',days:[0],times:['01:30'],timeZone:'America/Toronto',retryMinutes:10}));
  clock=Date.parse('2026-11-01T05:30:00Z');await f.service.tick();assert.equal((await f.service.status('main')).nextDue,Date.parse('2026-11-01T05:40:00Z'));
  clock=Date.parse('2026-11-01T05:40:00Z');await f.service.tick();assert.equal((await f.service.status('main')).nextDue,Date.parse('2026-11-08T06:30:00Z'));
});

test('synchronization asks the registry only for this drive, so one repository can hold several drives', async t => {
  const seen = [];
  const f = await fixture(t, { storageFactory: () => ({ list: async (_signal, options) => { seen.push(options); throw Error('offline'); } }) });
  await f.service.configure('main', configuration());
  await assert.rejects(f.service.sync('main'));
  assert.deepEqual(seen, [{ vaultId: 'a'.repeat(32), includeFiles: true }]);
});
test('a known plain reason is shown with the generic message and other failures stay generic', async t => {
  const other = { digest: 'sha256:' + 'b'.repeat(64), snapshot: { vaultId: 'c'.repeat(32), fileCount: 1 }, tag: 'mfe-' + 'c'.repeat(32) + '-' + 'd'.repeat(32) };
  const f = await fixture(t, { storageFactory: () => ({ list: async () => [other] }) });
  await f.service.configure('main', configuration());
  await assert.rejects(f.service.sync('main'), /different vault/);
  assert.match((await f.service.status('main')).lastError, /incomplete.*different vault/);
  const g = await fixture(t, { storageFactory: () => ({ list: async () => { throw Error('C:\private\path secret detail'); } }) });
  await g.service.configure('main', configuration());
  await assert.rejects(g.service.sync('main'), error => !/private|secret/.test(error.message));
});

test('the error names the step where synchronization stopped, without private detail', async t => {
  const f = await fixture(t, { storageFactory: () => ({ list: async () => [], publish: async () => { throw Error('C:\private\detail 401'); } }) });
  await f.service.configure('main', configuration());
  await assert.rejects(f.service.sync('main'), error => /stopped while (uploading|preparing the encrypted snapshot)/.test(error.message) && !/private|401/.test(error.message));
});

test('a plain native refusal of the storage lease is shown, but a path-like one is not', async t => {
  const cases = [
    ['Lock the vault and wait for synchronization to stop before preparing an image.', true],
    ['Cannot open C:\\Users\\someone\\vault', false],
    ['Share \\\\server\\vault is busy', false],
    ['Folder /home/someone/vault is busy', false],
  ];
  for (const [message, shown] of cases) {
    const f = await fixture(t, { storageFactory: () => ({ list: async () => [] }), nativeRequest: async method => { if (method === 'beginSnapshot') throw Error(message); return {}; } });
    await f.service.configure('main', configuration());
    await assert.rejects(f.service.sync('main'), error => error.message.includes(message) === shown && !/someone|server/.test(error.message));
  }
});

test('a briefly busy native host is waited for, and a lasting refusal still fails', async t => {
  let refusals = 2; const calls = [];
  const busy = 'Lock the vault and wait for synchronization to stop before preparing an image.';
  const nativeRequest = async method => { calls.push(method); if (method === 'beginSnapshot') { if (refusals-- > 0) throw Error(busy); return { leaseId: 'lease', storageDir: 'unused' }; } return method === 'releaseSnapshot' ? { released: true } : {}; };
  const f = await fixture(t, { leaseRetryMs: 5000, nativeRequest, storageFactory: () => ({ list: async () => [] }) });
  await f.service.configure('main', configuration());
  await assert.rejects(f.service.sync('main'));
  assert.equal(calls.filter(m => m === 'beginSnapshot').length, 3, 'two busy refusals were retried, then the snapshot lease was granted; with nothing to download no admission lease is needed');
  const g = await fixture(t, { leaseRetryMs: 600, nativeRequest: async method => { if (method === 'beginSnapshot') throw Error(busy); return {}; }, storageFactory: () => ({ list: async () => [] }) });
  await g.service.configure('main', configuration());
  await assert.rejects(g.service.sync('main'), /wait for synchronization to stop/);
});
