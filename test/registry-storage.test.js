import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRegistryStorage, registryDestination, validateRegistrySnapshot } from '../src/main/registry-storage.js';
import { DEFAULT_REGISTRY_SCHEDULE, validateRegistrySchedule, nextRegistryRun, registryOccurrence } from '../src/main/registry-schedule.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const destination = { endpoint: 'http://127.0.0.1:15221', repository: 'test/roundtrip', testOnly: true };

test('expected visibility is explicit, defaults to private and reaches each authorization', async () => {
  assert.equal(registryDestination({ repository: 'test/vault' }).visibility, 'private');
  assert.equal(registryDestination({ repository: 'test/vault', visibility: 'public' }).visibility, 'public');
  for (const visibility of [null, 'unknown', false]) assert.throws(() => registryDestination({ repository: 'test/vault', visibility }));
  const calls = [];
  const storage = createRegistryStorage({ destination: { repository: 'test/vault', visibility: 'public' }, authorize: async (...args) => { calls.push(args); throw Error('Denied synthetic authorization'); }, fetcher: async () => { throw Error('Must not fetch'); } });
  await assert.rejects(storage.list()); assert.equal(calls.length, 1); assert.equal(calls[0][0], 'test/vault'); assert.equal(calls[0][2], 'public');
});

test('visibility and permission are rechecked after blob transfer before manifest publication', async () => {
  let authorizations = 0, manifestWrites = 0, blobWrites = 0;
  const blobs = new Map();
  const storage = createRegistryStorage({ destination: { repository: 'test/vault', visibility: 'public' },
    authorize: async (_repository, _signal, visibility) => { assert.equal(visibility, 'public'); if (++authorizations === 2) throw Error('Synthetic destination visibility changed'); return {}; },
    fetcher: async (input, options) => {
      const url = new URL(input);
      if (options.method === 'POST') return new Response('', { status: 202, headers: { Location: '/v2/test/vault/blobs/uploads/owned' } });
      if (options.method === 'PUT' && url.pathname.includes('/blobs/uploads/')) { blobWrites++; blobs.set(url.searchParams.get('digest'), Buffer.from(options.body)); return new Response('', { status: 201 }); }
      if (options.method === 'GET' || !options.method) { const key = url.pathname.split('/blobs/')[1]; return new Response(blobs.get(key)); }
      if (url.pathname.includes('/manifests/')) { manifestWrites++; return new Response('', { status: 201 }); }
      throw Error('Unexpected synthetic registry request');
    } });
  const bytes = Buffer.from('synthetic-ciphertext');
  await assert.rejects(storage.publish({ vaultId: 'a'.repeat(32), deviceId: 'b'.repeat(32), files: [{ path: 'vault.json', bytes: bytes.length, sha256: hash(bytes) }], readFile: async () => bytes }), /visibility changed/);
  assert.equal(authorizations, 2); assert.ok(blobWrites > 0); assert.equal(manifestWrites, 0);
});
test('production destination defaults to the authenticated registry and test capability remains loopback-only', () => {
  assert.equal(registryDestination({ repository: 'owner/vault' }).endpoint, 'https://registry-1.docker.io');
  for (const endpoint of ['http://192.168.1.1:15221', 'https://evil.invalid', 'http://127.0.0.1:15221/path', 'http://user:pass@127.0.0.1:15221', 'http://127.0.0.1:15221/?x=1'])
    assert.throws(() => registryDestination({ ...destination, endpoint }));
  assert.throws(() => registryDestination({ ...destination, testOnly: false }));
  for (const repository of ['../vault', 'owner/vault/extra', 'owner/vault?x', 'OWNER/vault']) assert.throws(() => registryDestination({ ...destination, repository }));
  assert.throws(() => createRegistryStorage({ destination: { repository: 'owner/vault' } }));
});
test('snapshot metadata rejects traversal, duplicate entries and incomplete manifests', () => {
  const snapshot = { schemaVersion: 1, kind: 'encrypted-vault-registry-snapshot', vaultId: 'a'.repeat(32), deviceId: 'b'.repeat(32), parents: [], files: [{ path: 'vault.json', mediaType: 'application/vnd.material-file-encryptor.encrypted-object.v1', digest: 'sha256:' + 'c'.repeat(64), size: 10 }] };
  assert.equal(validateRegistrySnapshot(snapshot), snapshot);
  for (const edit of [x => x.files[0].path = '../vault.json', x => x.files.push({ ...x.files[0] }), x => x.files = [], x => x.parents = ['not-a-digest'], x => x.files[0].size = -1]) {
    const bad = structuredClone(snapshot); edit(bad); assert.throws(() => validateRegistrySnapshot(bad));
  }
});
test('foreign upload locations cannot receive data or authorization', async () => {
  let calls = 0;
  const storage = createRegistryStorage({ destination, fetcher: async () => { calls++; return new Response('', { status: 202, headers: { Location: 'https://evil.invalid/upload' } }); } });
  const bytes = Buffer.from('synthetic');
  await assert.rejects(storage.publish({ vaultId: 'a'.repeat(32), deviceId: 'b'.repeat(32), files: [{ path: 'vault.json', bytes: bytes.length, sha256: hash(bytes) }], readFile: async () => bytes }));
  assert.equal(calls, 1);
});
test('wrong ciphertext cannot start a publication', async () => {
  let calls = 0;
  const storage = createRegistryStorage({ destination, fetcher: async () => { calls++; throw Error('must not request'); } });
  await assert.rejects(storage.publish({ vaultId: 'a'.repeat(32), deviceId: 'b'.repeat(32), files: [{ path: 'vault.json', bytes: 3, sha256: 'a'.repeat(64) }], readFile: async () => Buffer.from('bad') }));
  assert.equal(calls, 0);
});
test('schedule validates calendar, interval and disabled defaults', () => {
  assert.equal(nextRegistryRun(DEFAULT_REGISTRY_SCHEDULE, 0), null);
  assert.equal(nextRegistryRun({ ...DEFAULT_REGISTRY_SCHEDULE, enabled: true }, 0), 3600000);
  const schedule = { ...DEFAULT_REGISTRY_SCHEDULE, enabled: true, mode: 'calendar', days: [1], times: ['02:00'], timeZone: 'America/Toronto' };
  assert.equal(new Date(nextRegistryRun(schedule, Date.parse('2026-10-18T12:00:00Z'))).toISOString(), '2026-10-19T06:00:00.000Z');
  for (const patch of [{ intervalMinutes: 0 }, { timeZone: 'invalid' }, { days: [7] }, { times: ['25:00'] }, { retryMinutes: 1 }, { enabled: 'true' }, { ignored: true }]) assert.throws(() => validateRegistrySchedule({ ...schedule, ...patch }));
});
test('calendar scans actual UTC occurrences through daylight saving transitions', () => {
  const schedule = { ...DEFAULT_REGISTRY_SCHEDULE, enabled: true, mode: 'calendar', days: [0], times: ['02:30'], timeZone: 'America/Toronto' };
  // The nonexistent spring-forward time is skipped, rather than invented.
  assert.equal(new Date(nextRegistryRun(schedule, Date.parse('2026-03-08T05:00:00Z'))).toISOString(), '2026-03-15T06:30:00.000Z');
  assert.equal(new Date(nextRegistryRun(schedule, Date.parse('2027-03-07T08:00:00Z'))).toISOString(), '2027-03-21T06:30:00.000Z');
  const repeated = { ...schedule, times: ['01:30'] };
  const first = Date.parse('2026-11-01T05:30:00Z');
  assert.equal(new Date(nextRegistryRun(repeated, first, registryOccurrence(repeated, first))).toISOString(), '2026-11-08T06:30:00.000Z');
});
test('invalid aggregate metadata is rejected before file reads or registry traffic', async () => {
  let reads = 0, requests = 0;
  const storage = createRegistryStorage({ destination, fetcher: async () => { requests++; throw Error(); } });
  const file = { path: 'vault.json', bytes: 1, sha256: 'a'.repeat(64) };
  for (const patch of [{ vaultId: 'a'.repeat(33) }, { parents: ['bad'] }, { files: [file, file] }, { files: Array(100001).fill(file) }]) {
    await assert.rejects(storage.publish({ vaultId: 'a'.repeat(32), deviceId: 'b'.repeat(32), files: [file], ...patch, readFile: async () => { reads++; return Buffer.from('a'); } }));
  }
  assert.equal(reads, 0); assert.equal(requests, 0);
  for (const maxObjectBytes of [-1, 0, 1.5, 1024 ** 3 + 1]) assert.throws(() => createRegistryStorage({ destination, maxObjectBytes }));
});
test('real registry preserves concurrent heads and verifies downloads', { skip: !process.env.MFE_TEST_REGISTRY }, async () => {
  const storage = createRegistryStorage({ destination: { ...destination, endpoint: process.env.MFE_TEST_REGISTRY, repository: `test/run-${Date.now()}` } });
  async function publish(device, text, parents = []) {
    const bytes = Buffer.from(text);
    return storage.publish({ vaultId: 'a'.repeat(32), deviceId: device.repeat(32), parents, files: [{ path: 'vault.json', bytes: bytes.length, sha256: hash(bytes) }], readFile: async () => bytes });
  }
  const [a, b] = await Promise.all([publish('b', 'synthetic-A'), publish('c', 'synthetic-B')]);
  assert.notEqual(a.digest, b.digest); assert.notEqual(a.tag, b.tag);
  const c = await publish('b', 'synthetic-merged', [a.digest, b.digest]);
  const revisions = await storage.list();
  assert.equal(revisions.length, 3);
  for (const result of [a, b, c]) assert.ok(revisions.some(row => row.digest === result.digest));
  const received = new Map(); await storage.download(c.digest, async (name, bytes) => received.set(name, bytes.toString()));
  assert.equal(received.get('vault.json'), 'synthetic-merged');
  assert.deepEqual((await storage.readRevision(c.digest)).snapshot.parents, [a.digest, b.digest]);
});
