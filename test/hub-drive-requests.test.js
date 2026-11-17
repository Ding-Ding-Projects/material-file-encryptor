import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRegistryStorage } from '../src/main/registry-storage.js';
import { createHubCatalog } from '../src/main/hub-catalog.js';
import { createHubRegistryReader } from '../src/main/hub-registry-reader.js';
import { createHubDriveRequests, HUB_DRIVE_METHODS } from '../src/main/hub-drive-requests.js';
import { createDriveLocations } from '../src/main/drive-locations.js';
import { createFakeRegistry } from './helpers/fake-hub-registry.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const record = (size = 32, fill = 0x54) => { const b = Buffer.alloc(size + 36, fill); b.write('MFE1'); b.writeInt32LE(size, 4); return b; };
const vaultJson = id => Buffer.from(JSON.stringify({ Format: 3, VaultId: id, Kind: 'password', Iterations: 600000, Salt: Buffer.alloc(32).toString('base64'), WrappedKey: record().toString('base64'), KeyCheck: record().toString('base64') }));
const vaultA = 'a'.repeat(32), vaultB = 'b'.repeat(32);

async function world(t) {
  const base = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'hub-drive-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const registry = createFakeRegistry('pat/mfe-storage');
  const published = [];
  for (const [vaultId, deviceId, name] of [[vaultA, '1'.repeat(32), 'Work files'], [vaultA, '1'.repeat(32), 'Work files'], [vaultB, '2'.repeat(32), null]]) {
    const storage = createRegistryStorage({ destination: registry.destination, fetcher: registry.fetcher });
    const bytes = vaultJson(vaultId);
    published.push(await storage.publish({ vaultId, deviceId, driveName: name, files: [{ path: 'vault.json', bytes: bytes.length, sha256: sha(bytes) }], readFile: async () => bytes }));
  }
  const hub = { async get(request) {
    const url = new URL(request, 'https://hub.docker.com');
    if (url.pathname === '/v2/repositories/namespaces') return { namespaces: ['pat'] };
    if (url.pathname === '/v2/namespaces/pat/repositories') return { results: [{ name: 'mfe-storage', is_private: false, last_updated: '2026-11-17T10:00:00Z' }], next: null };
    if (url.pathname === '/v2/namespaces/pat/repositories/mfe-storage/tags') return { results: [...registry.tags].map(([name, digest], index) => ({ name, digest, last_updated: `2026-11-${10 + index}T10:00:00Z`, full_size: 300 })), next: null };
    throw Error('unexpected ' + request);
  } };
  const reader = createHubRegistryReader({ authorize: async () => ({}), createStorage: options => createRegistryStorage({ ...options, destination: registry.destination, fetcher: registry.fetcher }) });
  const catalog = createHubCatalog({ hub, reader, account: async () => 'pat' });
  catalog.start(); await catalog.settled();
  const locations = createDriveLocations({ root: path.join(base, 'Drives'), restrict: async () => true });
  const dialogs = [];
  const docker = { registryPullAuthorization: async () => ({}), ensurePublicRepository: async repository => ({ repository, created: false, visibility: 'public' }) };
  const requests = createHubDriveRequests({ locations, catalog, docker, workRoot: path.join(base, 'work'), chooseParent: async () => { dialogs.push('folder'); return path.join(base, 'Chosen'); },
    createStorage: options => createRegistryStorage({ ...options, destination: registry.destination, fetcher: registry.fetcher }) });
  await fs.mkdir(path.join(base, 'Chosen'));
  return { base, registry, catalog, locations, requests, dialogs, published };
}

test('the catalogue finds two drives in one repository through the real registry client', async t => {
  const { catalog } = await world(t);
  const row = catalog.snapshot().repositories[0];
  assert.equal(row.scan, 'done');
  assert.deepEqual(row.drives.map(drive => [drive.id, drive.name, drive.snapshots]).sort(), [[vaultA, 'Work files', 2], [vaultB, null, 1]]);
});

test('restoring into the automatic location never opens a folder dialog and stays inside the data area', async t => {
  const { requests, catalog, locations, dialogs, base } = await world(t);
  const drive = catalog.snapshot().repositories[0].drives.find(item => item.id === vaultA);
  const status = await requests('hubRestoreSnapshot', { repository: 'pat/mfe-storage', digest: drive.latest.digest, location: 'automatic' });
  assert.equal(status.state, 'done');
  assert.deepEqual(dialogs, []);
  const { storageDir, cacheDir, vaultId, driveName } = status.result;
  assert.equal(vaultId, vaultA); assert.equal(driveName, 'Work files');
  assert.ok(locations.owns(storageDir) && locations.owns(cacheDir) && storageDir.startsWith(base));
  assert.equal(JSON.parse(await fs.readFile(path.join(storageDir, 'vault.json'), 'utf8')).VaultId, vaultA);
  assert.deepEqual(await fs.readdir(path.join(base, 'work', 'validation')).catch(() => []), [], 'validation leftovers are removed');
  const second = await requests('hubRestoreSnapshot', { repository: 'pat/mfe-storage', digest: drive.latest.digest, location: 'automatic' });
  assert.notEqual(second.result.storageDir, storageDir, 'each restore gets its own folder');
});

test('the advanced option restores into a folder the user chose and keeps the cache automatic', async t => {
  const { requests, catalog, locations, dialogs, base } = await world(t);
  const drive = catalog.snapshot().repositories[0].drives.find(item => item.id === vaultB);
  const status = await requests('hubRestoreSnapshot', { repository: 'pat/mfe-storage', digest: drive.latest.digest, location: 'choose' });
  assert.deepEqual(dialogs, ['folder']);
  assert.ok(status.result.storageDir.startsWith(path.join(base, 'Chosen', 'restored-vault-')));
  assert.ok(locations.owns(status.result.cacheDir));
  assert.equal(locations.owns(status.result.storageDir), false);
});

test('a cancelled folder choice restores nothing and leaves no folders', async t => {
  const { requests, catalog, locations } = await world(t);
  const drive = catalog.snapshot().repositories[0].drives[0];
  const cancelling = createHubDriveRequests({ locations, catalog, docker: { registryPullAuthorization: async () => ({}) }, workRoot: path.join(locations.root, '..', 'work'), chooseParent: async () => null });
  const status = await cancelling('hubRestoreSnapshot', { repository: 'pat/mfe-storage', digest: drive.latest.digest, location: 'choose' });
  assert.equal(status.state, 'cancelled');
  assert.deepEqual(await fs.readdir(locations.root).catch(() => []), []);
  void requests;
});

test('a snapshot the catalogue never found is refused before any download', async t => {
  const { requests, registry } = await world(t);
  registry.requests.length = 0;
  await assert.rejects(requests('hubRestoreSnapshot', { repository: 'pat/mfe-storage', digest: 'sha256:' + '9'.repeat(64), location: 'automatic' }), { code: 'NOT_FOUND' });
  await assert.rejects(requests('hubRestoreSnapshot', { repository: 'pat/other', digest: 'sha256:' + '9'.repeat(64), location: 'automatic' }), { code: 'NOT_FOUND' });
  await assert.rejects(requests('hubRestoreSnapshot', { repository: '../evil', digest: 'nope', location: 'automatic' }), { code: 'INVALID_NAME' });
  await assert.rejects(requests('hubRestoreSnapshot', { repository: 'pat/mfe-storage', digest: 'sha256:' + '9'.repeat(64), location: '/tmp' }), { code: 'INVALID_NAME' });
  assert.equal(registry.requests.length, 0);
});

test('a failed download removes the folders it created', async t => {
  const { requests, catalog, locations, registry } = await world(t);
  const drive = catalog.snapshot().repositories[0].drives[0];
  for (const key of [...registry.blobs.keys()]) registry.blobs.delete(key);
  const status = await requests('hubRestoreSnapshot', { repository: 'pat/mfe-storage', digest: drive.latest.digest, location: 'automatic' });
  assert.equal(status.state, 'failed'); assert.equal(status.error.code, 'RESTORE_FAILED');
  assert.deepEqual(await fs.readdir(locations.root), []);
});

test('new drive folders are allocated by the host and an unused allocation can be discarded', async t => {
  const { requests, locations } = await world(t);
  const folders = await requests('hubDriveFolders');
  assert.ok(locations.owns(folders.storageDir) && locations.owns(folders.cacheDir));
  assert.deepEqual(Object.keys(folders).sort(), ['cacheDir', 'driveId', 'ownerOnly', 'storageDir']);
  assert.deepEqual(await requests('hubDriveFoldersDiscard', { driveId: folders.driveId }), { discarded: true });
  await assert.rejects(fs.stat(folders.storageDir), { code: 'ENOENT' });
});

test('the repository is created public through the existing service and only for valid names', async t => {
  const { requests } = await world(t);
  assert.deepEqual(await requests('hubEnsureRepository', { repository: 'pat/material-file-encryptor-storage' }), { repository: 'pat/material-file-encryptor-storage', created: false, visibility: 'public' });
  await assert.rejects(requests('hubEnsureRepository', { repository: 'Pat/Bad Name' }), { code: 'INVALID_NAME' });
  assert.equal(HUB_DRIVE_METHODS.has('hubRestoreSnapshot'), true);
});

test('a drive backed up in this session appears in the next listing without a forced refresh', async t => {
  const { requests, catalog, registry } = await world(t);
  assert.equal((await requests('hubCatalogStart', {})).repositories[0].drives.length, 2, 'the finished scan is served from the cache');
  const storage = createRegistryStorage({ destination: registry.destination, fetcher: registry.fetcher });
  const bytes = vaultJson('c'.repeat(32));
  await storage.publish({ vaultId: 'c'.repeat(32), deviceId: '3'.repeat(32), driveName: 'Brand new', files: [{ path: 'vault.json', bytes: bytes.length, sha256: sha(bytes) }], readFile: async () => bytes });
  assert.equal((await requests('hubCatalogStart', {})).repositories[0].drives.length, 2, 'still cached until something says it changed');
  catalog.invalidate();
  await requests('hubCatalogStart', {}); const rescanned = await catalog.settled();
  assert.equal(rescanned.repositories[0].drives.length, 3);
  assert.ok(rescanned.repositories[0].drives.some(drive => drive.name === 'Brand new'));
});

test('creating a repository also invalidates the cached listing', async t => {
  const { requests } = await world(t);
  await requests('hubCatalogStart', {});
  const before = (await requests('hubCatalogStatus', {})).startedAt;
  await requests('hubEnsureRepository', { repository: 'pat/material-file-encryptor-storage' });
  await new Promise(resolve => setTimeout(resolve, 5));
  await requests('hubCatalogStart', {});
  assert.notEqual((await requests('hubCatalogStatus', {})).startedAt, before, 'a new scan started');
});

test('Show folder opens only a folder this session allocated or restored', async t => {
  const { catalog, locations, base } = await world(t);
  const opened = [];
  const requests = createHubDriveRequests({ locations, catalog, docker: { registryPullAuthorization: async () => ({}) }, workRoot: path.join(base, 'work'), chooseParent: async () => null, openFolder: async folder => { opened.push(folder); } });
  const folders = await requests('hubDriveFolders');
  assert.deepEqual(await requests('hubShowFolder', { driveId: folders.driveId }), { shown: true });
  assert.deepEqual(opened, [folders.storageDir]);
  await assert.rejects(requests('hubShowFolder', { driveId: 'ffffffffffffffff' }), { code: 'NOT_FOUND' });
  await assert.rejects(requests('hubShowFolder', { driveId: '../escape' }), { code: 'INVALID_NAME' });
});
