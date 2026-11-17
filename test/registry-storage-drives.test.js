import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistryStorage, cleanDriveNameLabel, DRIVE_NAME_ANNOTATION } from '../src/main/registry-storage.js';
import { createFakeRegistry, publishFake } from './helpers/fake-hub-registry.js';

const mine = 'a'.repeat(32), theirs = '0'.repeat(32);
const myDevice = 'b'.repeat(32), otherDevice = '1'.repeat(32), myOtherDevice = 'c'.repeat(32);

test('listing for one drive finds its snapshots from several devices and skips other drives', async () => {
  const registry = createFakeRegistry('test/shared');
  await publishFake(createRegistryStorage, registry, { vaultId: mine, deviceId: myDevice });
  await publishFake(createRegistryStorage, registry, { vaultId: mine, deviceId: myOtherDevice });
  await publishFake(createRegistryStorage, registry, { vaultId: theirs, deviceId: otherDevice, label: 'one' });
  await publishFake(createRegistryStorage, registry, { vaultId: theirs, deviceId: otherDevice, label: 'two' });
  registry.requests.length = 0;
  const storage = createRegistryStorage({ destination: registry.destination, fetcher: registry.fetcher });
  const own = await storage.list(undefined, { vaultId: mine });
  assert.equal(own.length, 2);
  assert.ok(own.every(item => item.snapshot.vaultId === mine));
  // A foreign device is read once: its second tag is skipped without a manifest request.
  const foreignManifests = registry.requests.filter(line => line.includes('/manifests/mfe-' + otherDevice));
  assert.equal(foreignManifests.length, 1);
  assert.equal((await storage.list()).length, 4, 'without a drive id every snapshot is listed');
});

test('an invalid drive id is refused before any request', async () => {
  const registry = createFakeRegistry('test/shared');
  const storage = createRegistryStorage({ destination: registry.destination, fetcher: registry.fetcher });
  await assert.rejects(storage.list(undefined, { vaultId: 'not-a-vault-id' }));
  assert.equal(registry.requests.length, 0);
});

test('the drive name is stored as a manifest annotation and read back, never inside the validated snapshot', async () => {
  const registry = createFakeRegistry('test/named');
  const result = await publishFake(createRegistryStorage, registry, { vaultId: mine, deviceId: myDevice });
  const storage = createRegistryStorage({ destination: registry.destination, fetcher: registry.fetcher });
  assert.equal((await storage.readRevision(result.digest)).driveName, null, 'older snapshots carry no label');
  const named = createRegistryStorage({ destination: registry.destination, fetcher: registry.fetcher });
  const bytes = Buffer.from('named-ciphertext');
  const { createHash } = await import('node:crypto');
  const published = await named.publish({ vaultId: mine, deviceId: myDevice, driveName: ' Work files ', files: [{ path: 'vault.json', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }], readFile: async () => bytes });
  const revision = await storage.readRevision(published.digest);
  assert.equal(revision.driveName, 'Work files');
  const manifest = JSON.parse(registry.manifests.get(published.digest));
  assert.equal(manifest.annotations[DRIVE_NAME_ANNOTATION], 'Work files');
  assert.equal(Object.hasOwn(revision.snapshot, 'driveName'), false);
});

test('a drive name label is bounded and free of control characters', () => {
  assert.equal(cleanDriveNameLabel('Photos'), 'Photos');
  for (const bad of ['', '   ', 'a'.repeat(65), 'x\u0000y', 'a‮b', 5, null, undefined]) assert.equal(cleanDriveNameLabel(bad), null);
});
