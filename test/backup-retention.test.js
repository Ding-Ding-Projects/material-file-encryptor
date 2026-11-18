import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { selectRetention, validateRetention, DEFAULT_RETENTION, retentionCeiling } from '../src/main/auto-backup/retention.js';
import { pruneDriveSnapshots } from '../src/main/auto-backup/prune.js';
import { createSnapshotReadGuard } from '../src/main/auto-backup/read-guard.js';
import { createTagDates } from '../src/main/auto-backup/tag-dates.js';
import { createRegistryStorage } from '../src/main/registry-storage.js';
import { createFakeRegistry } from './helpers/fake-hub-registry.js';

const HOUR = 3600000, DAY = 24 * HOUR;
const hex = (n, width = 32) => n.toString(16).padStart(width, '0');
const item = (n, createdAt) => ({ tag: `mfe-${'b'.repeat(32)}-${hex(n)}`, digest: `sha256:${hex(n, 64)}`, createdAt });

test('retention rules are validated and the defaults keep at most 25 snapshots', () => {
  assert.deepEqual(validateRetention(DEFAULT_RETENTION), { keepLatest: 10, keepDaily: 7, keepWeekly: 8 });
  assert.equal(retentionCeiling(DEFAULT_RETENTION), 25);
  for (const bad of [null, [], {}, { ...DEFAULT_RETENTION, keepLatest: 0 }, { ...DEFAULT_RETENTION, keepDaily: 1.5 }, { ...DEFAULT_RETENTION, extra: 1 }, { ...DEFAULT_RETENTION, keepWeekly: 500 }])
    assert.throws(() => validateRetention(bad));
});

test('latest, daily and weekly buckets count only days and weeks that hold a snapshot', () => {
  const start = Date.parse('2026-11-16T12:00:00Z');
  // One snapshot every 6 hours for 90 days: the newest is index 0.
  const snapshots = Array.from({ length: 360 }, (_, n) => item(n, start - n * 6 * HOUR));
  const { keep, prune } = selectRetention({ snapshots, policy: DEFAULT_RETENTION });
  assert.ok(keep.length <= 25, `kept ${keep.length}`);
  assert.equal(keep.length + prune.length, 360);
  assert.deepEqual(keep.slice(0, 10).map(x => x.tag), snapshots.slice(0, 10).map(x => x.tag), 'the 10 newest are kept');
  const daily = keep.filter(x => x.keptAs.includes('daily'));
  assert.equal(daily.length, 7);
  assert.equal(new Set(daily.map(x => new Date(x.createdAt).toISOString().slice(0, 10))).size, 7, 'one per calendar day');
  assert.equal(keep.filter(x => x.keptAs.includes('weekly')).length, 8);
  // Everything kept is newer than everything pruned only for the latest rule; weekly keeps reach further back.
  assert.ok(Math.min(...keep.map(x => x.createdAt)) < start - 40 * DAY);
});

test('protected and shared digests are kept, and undated snapshots sort after dated ones', () => {
  const now = Date.parse('2026-11-16T12:00:00Z');
  const dated = Array.from({ length: 5 }, (_, n) => item(n, now - n * HOUR));
  const undated = [item(10, null), item(11, null)];
  const protectedOld = item(12, now - 400 * DAY);
  const twin = { ...item(13, now - 500 * DAY), digest: dated[0].digest };
  const order = selectRetention({ snapshots: [...undated, ...dated], policy: { keepLatest: 6, keepDaily: 0, keepWeekly: 0 } });
  const kept = new Set(order.keep.map(x => x.tag));
  for (const x of dated) assert.ok(kept.has(x.tag));
  assert.ok(kept.has(undated[0].tag), 'the sixth latest slot falls to the first undated snapshot');
  assert.deepEqual(order.prune.map(x => x.tag), [undated[1].tag]);
  const { keep, prune } = selectRetention({ snapshots: [protectedOld, twin, ...dated], policy: { keepLatest: 1, keepDaily: 0, keepWeekly: 0 }, protect: new Set([protectedOld.digest]) });
  assert.deepEqual(keep.find(x => x.tag === protectedOld.tag).keptAs, ['protected']);
  assert.equal(keep.find(x => x.tag === twin.tag).keptAs[0], 'shared', 'a second tag of a kept digest is never removed');
  assert.deepEqual(prune.map(x => x.tag).sort(), dated.slice(1).map(x => x.tag).sort());
});

async function publish(registry, { vaultId, deviceId, createdAt, label }) {
  const storage = createRegistryStorage({ destination: registry.destination, fetcher: registry.fetcher });
  const bytes = Buffer.from(`${label}-${vaultId}-${deviceId}`);
  return storage.publish({ vaultId, deviceId, createdAt, files: [{ path: 'vault.json', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }], readFile: async () => bytes });
}
const VAULT_A = 'a'.repeat(32), VAULT_B = 'e'.repeat(32), THIS_PC = 'b'.repeat(32), OTHER_PC = 'c'.repeat(32), B_PC = 'd'.repeat(32);
async function sharedRepository() {
  const registry = createFakeRegistry('test/material-file-encryptor-storage');
  const start = Date.parse('2026-11-16T12:00:00Z');
  const mine = [];
  for (let n = 0; n < 12; n++) mine.push(await publish(registry, { vaultId: VAULT_A, deviceId: THIS_PC, createdAt: start - n * HOUR, label: `a${n}` }));
  const otherPc = [await publish(registry, { vaultId: VAULT_A, deviceId: OTHER_PC, createdAt: start - 30 * DAY, label: 'o1' }), await publish(registry, { vaultId: VAULT_A, deviceId: OTHER_PC, createdAt: start - 31 * DAY, label: 'o2' })];
  const otherDrive = [];
  for (let n = 0; n < 4; n++) otherDrive.push(await publish(registry, { vaultId: VAULT_B, deviceId: B_PC, createdAt: start - 60 * DAY - n * HOUR, label: `b${n}` }));
  return { registry, mine, otherPc, otherDrive, start };
}

test('pruning removes only this drive\'s own snapshots from this computer and verifies each removal', async () => {
  const { registry, mine, otherPc, otherDrive } = await sharedRepository();
  const client = createRegistryStorage({ destination: registry.destination, fetcher: registry.fetcher });
  const revisions = await client.list(undefined, { vaultId: VAULT_A });
  assert.equal(revisions.tagCount, 18, 'the tag total covers every drive in the repository');
  assert.ok(revisions.every(x => Number.isFinite(x.createdAt)), 'new snapshots carry a created time');
  const result = await pruneDriveSnapshots({ client, revisions, deviceId: THIS_PC, vaultId: VAULT_A, newest: mine[0].digest, policy: { keepLatest: 3, keepDaily: 0, keepWeekly: 0 } });
  assert.equal(result.pruned, 9); assert.equal(result.failed, 0); assert.equal(result.kept, 3); assert.equal(result.state, 'done');
  const tags = new Set(registry.tags.keys());
  for (const x of mine.slice(0, 3)) assert.ok(tags.has(x.tag));
  for (const x of mine.slice(3)) { assert.ok(!tags.has(x.tag)); assert.ok(!registry.manifests.has(x.digest)); }
  for (const x of [...otherPc, ...otherDrive]) assert.ok(tags.has(x.tag), 'another computer\'s and another drive\'s snapshots stay');
  assert.ok(registry.requests.every(line => !line.startsWith('DELETE') || mine.slice(3).some(x => line.endsWith(x.digest))), 'only selected digests are deleted');
  assert.ok(registry.blobs.size > 0, 'layers are left for the registry to collect');
});

test('the newest verified snapshot is never removed, and an unlisted newest stops pruning entirely', async () => {
  const { registry, mine } = await sharedRepository();
  const client = createRegistryStorage({ destination: registry.destination, fetcher: registry.fetcher });
  const revisions = await client.list(undefined, { vaultId: VAULT_A });
  // A "newest" that is actually old is still kept.
  const old = mine.at(-1);
  const result = await pruneDriveSnapshots({ client, revisions, deviceId: THIS_PC, vaultId: VAULT_A, newest: old.digest, policy: { keepLatest: 1, keepDaily: 0, keepWeekly: 0 } });
  assert.ok(registry.tags.has(old.tag)); assert.ok(registry.tags.has(mine[0].tag)); assert.equal(result.pruned, 10);
  const before = registry.tags.size;
  const skipped = await pruneDriveSnapshots({ client, revisions: await client.list(undefined, { vaultId: VAULT_A }), deviceId: THIS_PC, vaultId: VAULT_A, newest: 'sha256:' + 'f'.repeat(64), policy: { keepLatest: 1, keepDaily: 0, keepWeekly: 0 } });
  assert.equal(skipped.state, 'skipped'); assert.equal(registry.tags.size, before);
});

test('a snapshot a restore is reading is kept even when selected', async () => {
  const { registry, mine } = await sharedRepository();
  const client = createRegistryStorage({ destination: registry.destination, fetcher: registry.fetcher });
  const guard = createSnapshotReadGuard();
  const release = guard.hold(registry.destination.repository, mine[5].digest);
  const result = await pruneDriveSnapshots({ client, revisions: await client.list(undefined, { vaultId: VAULT_A }), deviceId: THIS_PC, vaultId: VAULT_A, newest: mine[0].digest,
    policy: { keepLatest: 2, keepDaily: 0, keepWeekly: 0 }, protect: guard.heldDigests(registry.destination.repository), isHeld: digest => guard.isHeld(registry.destination.repository, digest) });
  assert.ok(registry.tags.has(mine[5].tag)); assert.equal(result.pruned, 9);
  release(); assert.equal(guard.isHeld(registry.destination.repository, mine[5].digest), false);
});

test('a refused delete is counted as failed, never throws, and is retried by the next run', async () => {
  const { registry, mine } = await sharedRepository();
  let refuse = true;
  const fetcher = async (input, options = {}) => (refuse && options.method === 'DELETE') ? new Response('', { status: 500 }) : registry.fetcher(input, options);
  const client = createRegistryStorage({ destination: registry.destination, fetcher });
  const policy = { keepLatest: 4, keepDaily: 0, keepWeekly: 0 };
  const first = await pruneDriveSnapshots({ client, revisions: await client.list(undefined, { vaultId: VAULT_A }), deviceId: THIS_PC, vaultId: VAULT_A, newest: mine[0].digest, policy });
  assert.equal(first.pruned, 0); assert.equal(first.failed, 8); assert.equal(first.state, 'partial');
  assert.equal(registry.tags.size, 18);
  refuse = false;
  const second = await pruneDriveSnapshots({ client, revisions: await client.list(undefined, { vaultId: VAULT_A }), deviceId: THIS_PC, vaultId: VAULT_A, newest: mine[0].digest, policy });
  assert.equal(second.pruned, 8); assert.equal(second.failed, 0);
});

test('a tag left behind after its manifest is gone is removed through the fallback and verified', async () => {
  const { registry, mine } = await sharedRepository();
  // A registry that deletes the manifest but keeps serving the tag until the tag itself is removed.
  const lingering = new Map();
  const fetcher = async (input, options = {}) => {
    const url = new URL(input);
    if (options.method === 'DELETE') { const digest = url.pathname.split('/').pop(); for (const [tag, value] of registry.tags) if (value === digest) lingering.set(tag, digest); return registry.fetcher(input, options); }
    const tag = url.pathname.split('/').pop();
    if (lingering.has(tag)) return new Response('{}', { status: 200 });
    return registry.fetcher(input, options);
  };
  const client = createRegistryStorage({ destination: registry.destination, fetcher });
  const removedTags = [];
  const result = await pruneDriveSnapshots({ client, revisions: await client.list(undefined, { vaultId: VAULT_A }), deviceId: THIS_PC, vaultId: VAULT_A, newest: mine[0].digest,
    policy: { keepLatest: 10, keepDaily: 0, keepWeekly: 0 }, deleteTag: async tag => { removedTags.push(tag); lingering.delete(tag); } });
  assert.equal(result.pruned, 2); assert.deepEqual(removedTags.sort(), mine.slice(10).map(x => x.tag).sort());
  // Without the fallback, the same situation is reported as failed rather than claimed.
  const again = await sharedRepository();
  const stuck = new Map();
  const stuckFetcher = async (input, options = {}) => {
    const url = new URL(input);
    if (options.method === 'DELETE') { const digest = url.pathname.split('/').pop(); for (const [tag, value] of again.registry.tags) if (value === digest) stuck.set(tag, digest); return again.registry.fetcher(input, options); }
    if (stuck.has(url.pathname.split('/').pop())) return new Response('{}', { status: 200 });
    return again.registry.fetcher(input, options);
  };
  const stuckClient = createRegistryStorage({ destination: again.registry.destination, fetcher: stuckFetcher });
  const reported = await pruneDriveSnapshots({ client: stuckClient, revisions: await stuckClient.list(undefined, { vaultId: VAULT_A }), deviceId: THIS_PC, vaultId: VAULT_A, newest: again.mine[0].digest, policy: { keepLatest: 10, keepDaily: 0, keepWeekly: 0 } });
  assert.equal(reported.pruned, 0); assert.equal(reported.failed, 2);
});

test('a removed snapshot still shown in the tag list is skipped instead of failing the whole listing', async () => {
  const { registry, mine } = await sharedRepository();
  const stale = mine[3];
  const fetcher = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/tags/list')) return new Response(JSON.stringify({ name: registry.destination.repository, tags: [...new Set([...registry.tags.keys(), stale.tag])].sort() }));
    return registry.fetcher(input, options);
  };
  const client = createRegistryStorage({ destination: registry.destination, fetcher });
  await client.deleteSnapshot({ digest: stale.digest, tag: stale.tag });
  const listed = await client.list(undefined, { vaultId: VAULT_A });
  assert.equal(listed.length, 13); assert.ok(!listed.some(item => item.tag === stale.tag));
});

test('the delete request refuses anything that is not a drive snapshot reference', async () => {
  const registry = createFakeRegistry('test/x');
  const client = createRegistryStorage({ destination: registry.destination, fetcher: registry.fetcher });
  await assert.rejects(client.deleteSnapshot({ digest: 'sha256:' + 'a'.repeat(64), tag: 'share-' + 'a'.repeat(32) }));
  await assert.rejects(client.deleteSnapshot({ digest: '../x', tag: `mfe-${'a'.repeat(32)}-${'b'.repeat(32)}` }));
  assert.equal(registry.requests.length, 0);
});

test('the Docker Hub transport grants backup deletion only outside the shared-files repository and only for snapshot tags', async () => {
  const { createDockerImageTransport } = await import('../src/main/vault-image-docker.js');
  let calls = 0;
  const docker = createDockerImageTransport({ platform: 'linux', fetcher: async () => { calls++; throw Error('no network in this test'); }, run: async () => { throw Error('no docker'); } });
  await assert.rejects(docker.registryBackupDeleteAuthorization('someone/material-file-encryptor-shares'), /shared files page/);
  await assert.rejects(docker.deleteSnapshotTag('someone/material-file-encryptor-storage', 'share-' + 'a'.repeat(32)), /Only drive snapshot tags/);
  await assert.rejects(docker.deleteSnapshotTag('someone/material-file-encryptor-shares', `mfe-${'a'.repeat(32)}-${'b'.repeat(32)}`), /Only drive snapshot tags/);
  await assert.rejects(docker.deleteShareTag('someone/material-file-encryptor-storage', `mfe-${'a'.repeat(32)}-${'b'.repeat(32)}`), /Only shared-file tags/);
  assert.equal(calls, 0);
});

test('older snapshots are dated from the Docker Hub tag list', async () => {
  const pages = [];
  const tagDates = createTagDates(async pathname => {
    pages.push(pathname);
    return pathname.endsWith('page=1') ? { next: 'x', results: [{ name: `mfe-${'a'.repeat(32)}-${'b'.repeat(32)}`, tag_last_pushed: '2026-11-01T10:00:00Z' }, { name: 'latest', last_updated: '2026-11-01T10:00:00Z' }] }
      : { next: null, results: [{ name: `mfe-${'a'.repeat(32)}-${'c'.repeat(32)}`, last_updated: '2026-10-01T10:00:00Z' }] };
  });
  const dates = await tagDates('someone/material-file-encryptor-storage');
  assert.equal(dates.size, 2); assert.equal(dates.get(`mfe-${'a'.repeat(32)}-${'b'.repeat(32)}`), Date.parse('2026-11-01T10:00:00Z'));
  assert.equal(pages.length, 2);
  await assert.rejects(tagDates('../escape'));
});
