import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRegistryStorage } from '../src/main/registry-storage.js';
import { createVaultImageSnapshot } from '../src/main/vault-image-snapshot.js';

// Backup uploads only the encrypted objects that already exist on disk. These tests prove no plaintext
// path can enter the snapshot or the registry manifest. All data is synthetic and offline.
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const record = (length = 32) => { const value = Buffer.alloc(length + 36, 0x94); value.write('MFE1'); value.writeInt32LE(length, 4); return value; };
const configuration = () => Buffer.from(JSON.stringify({ Format: 3, VaultId: 'd'.repeat(32), Kind: 'password', Iterations: 600000,
  Salt: Buffer.alloc(32, 0x91).toString('base64'), WrappedKey: record().toString('base64'), KeyCheck: record().toString('base64') }));
async function storageFolder(t) {
  const directory = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'registry-ciphertext-only-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source'), workRoot = path.join(directory, 'prepared');
  for (const folder of ['parts', 'commits', 'activity']) await fs.mkdir(path.join(source, folder), { recursive: true });
  const files = new Map([['vault.json', configuration()], [`parts/${'a'.repeat(32)}.mfe`, record(51)], [`commits/${'b'.repeat(32)}.mfe`, record(29)], [`activity/${'c'.repeat(32)}.mfe`, record(19)]]);
  for (const [name, bytes] of files) await fs.writeFile(path.join(source, name), bytes);
  return { directory, source, workRoot, files };
}

test('the snapshot lists exactly the on-disk encrypted objects, byte for byte', async t => {
  const f = await storageFolder(t);
  const snapshot = await createVaultImageSnapshot({ source: f.source, workRoot: f.workRoot });
  try {
    const allowed = /^(?:vault\.json|(?:parts|commits|activity)\/(?:[a-f0-9]{32}|[a-f0-9]{64})\.mfe)$/;
    assert.deepEqual(snapshot.manifest.files.map(file => file.path).sort(), [...f.files.keys()].sort());
    for (const file of snapshot.manifest.files) { assert.match(file.path, allowed); assert.equal(file.sha256, hash(f.files.get(file.path))); }
  } finally { await fs.rm(snapshot.directory, { recursive: true }); }
});

test('any plaintext or unexpected path makes the snapshot refuse and leaves no prepared copy', async t => {
  for (const extra of ['notes.txt', 'Documents/secret.docx', 'parts/readable.txt', 'cache/plain.bin']) {
    const f = await storageFolder(t);
    await fs.mkdir(path.dirname(path.join(f.source, extra)), { recursive: true });
    await fs.writeFile(path.join(f.source, extra), 'plaintext that must never be uploaded');
    await assert.rejects(createVaultImageSnapshot({ source: f.source, workRoot: f.workRoot }), /Unexpected content|encrypted storage/, extra);
    assert.deepEqual(await fs.readdir(f.workRoot).catch(() => []), []);
  }
});

const destination = { endpoint: 'http://127.0.0.1:15221', repository: 'test/roundtrip', testOnly: true };
test('publication refuses any path outside the encrypted object grammar before any read or request', async () => {
  let reads = 0, requests = 0;
  const storage = createRegistryStorage({ destination, fetcher: async () => { requests++; throw Error('must not request'); } });
  for (const name of ['notes.txt', 'Documents/secret.docx', '../vault.json', 'parts/readable.txt', `parts/${'a'.repeat(32)}.txt`, `cache/${'a'.repeat(32)}.mfe`]) {
    await assert.rejects(storage.publish({ vaultId: 'a'.repeat(32), deviceId: 'b'.repeat(32),
      files: [{ path: 'vault.json', bytes: 1, sha256: 'a'.repeat(64) }, { path: name, bytes: 1, sha256: 'a'.repeat(64) }],
      readFile: async () => { reads++; return Buffer.from('a'); } }), undefined, name);
  }
  assert.equal(reads, 0); assert.equal(requests, 0);
});

test('every uploaded layer is exactly the object bytes and the snapshot config names only encrypted object paths', async () => {
  const blobs = new Map(); let manifest = null;
  const storage = createRegistryStorage({ destination: { repository: 'test/vault', visibility: 'public' }, authorize: async () => ({}),
    fetcher: async (input, options) => {
      const url = new URL(input);
      if (options.method === 'POST') return new Response('', { status: 202, headers: { Location: '/v2/test/vault/blobs/uploads/owned' } });
      if (options.method === 'PUT' && url.pathname.includes('/blobs/uploads/')) { blobs.set(url.searchParams.get('digest'), Buffer.from(options.body)); return new Response('', { status: 201 }); }
      if (options.method === 'PUT' && url.pathname.includes('/manifests/')) { manifest = Buffer.from(options.body); blobs.set('sha256:' + hash(manifest), manifest); return new Response('', { status: 201 }); }
      if (url.pathname.includes('/manifests/')) return new Response(manifest);
      return new Response(blobs.get(url.pathname.split('/blobs/')[1]));
    } });
  const objects = { 'vault.json': Buffer.from('synthetic-config'), [`parts/${'a'.repeat(32)}.mfe`]: Buffer.from('synthetic-part') };
  await storage.publish({ vaultId: 'a'.repeat(32), deviceId: 'b'.repeat(32), files: Object.entries(objects).map(([name, bytes]) => ({ path: name, bytes: bytes.length, sha256: hash(bytes) })), readFile: async name => objects[name] });
  const uploaded = [...blobs.values()].map(value => value.toString());
  for (const bytes of Object.values(objects)) assert.ok(uploaded.includes(bytes.toString()), 'the exact encrypted bytes are uploaded unchanged');
  const config = JSON.parse(uploaded.find(text => text.includes('encrypted-vault-registry-snapshot')));
  assert.deepEqual(config.files.map(file => file.path).sort(), Object.keys(objects).sort());
  assert.equal(JSON.parse(manifest).layers.length, 2);
});
