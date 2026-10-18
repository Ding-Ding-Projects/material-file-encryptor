import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createVaultImageSnapshot } from '../src/main/vault-image-snapshot.js';
import { createVaultImageBuildContext } from '../src/main/vault-image-context.js';

// Synthetic, unauthenticated framing only. No real credentials, Docker process or network are used.
const objectPath = `parts/${'a'.repeat(32)}.mfe`;
const fixedDockerfile = 'FROM scratch\nCOPY vault/ /vault/\nCOPY manifest.json /manifest.json\n';
function record(length) {
  const bytes = Buffer.alloc(length + 36, 0x91); bytes.write('MFE1'); bytes.writeInt32LE(length, 4); return bytes;
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'vault-image-context-offline-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'); await fs.mkdir(source); await fs.mkdir(path.join(source, 'parts'));
  const configuration = { Format: 3, VaultId: 'b'.repeat(32), Kind: 'password', Iterations: 600000,
    Salt: Buffer.alloc(32, 0x92).toString('base64'), WrappedKey: record(32).toString('base64'), KeyCheck: record(32).toString('base64') };
  const files = new Map([['vault.json', Buffer.from(JSON.stringify(configuration))], [objectPath, Buffer.concat([record(150000), record(35)])]]);
  for (const [name, bytes] of files) await fs.writeFile(path.join(source, name), bytes);
  const snapshot = await createVaultImageSnapshot({ source, workRoot: path.join(root, 'work') });
  return { root, files, snapshot, object: path.join(snapshot.directory, 'vault', objectPath) };
}
async function collect(iterable, first = []) {
  const chunks = [...first];
  for await (const bytes of iterable) { assert.ok(Buffer.isBuffer(bytes)); assert.ok(bytes.length <= 65536); chunks.push(bytes); }
  return Buffer.concat(chunks);
}
function tarEntries(bytes) {
  const entries = new Map(); let offset = 0;
  const field = (header, start, length) => header.subarray(start, start + length).toString('ascii').replace(/\0.*$/s, '');
  while (offset < bytes.length) {
    const header = bytes.subarray(offset, offset + 512); assert.equal(header.length, 512);
    if (header.every(byte => byte === 0)) {
      assert.equal(bytes.length - offset, 1024); assert.ok(bytes.subarray(offset).every(byte => byte === 0)); return entries;
    }
    const name = field(header, 0, 100), size = parseInt(field(header, 124, 12), 8), type = field(header, 156, 1);
    const checksum = Buffer.from(header); checksum.fill(0x20, 148, 156);
    assert.equal(parseInt(field(header, 148, 8), 8), checksum.reduce((total, byte) => total + byte, 0));
    assert.equal(field(header, 257, 6), 'ustar'); assert.equal(field(header, 263, 2), '00');
    assert.ok(['0', '5'].includes(type)); assert.equal(field(header, 157, 100), '');
    for (const [start, length] of [[108, 8], [116, 8], [136, 12]]) assert.equal(parseInt(field(header, start, length), 8), 0);
    assert.equal(field(header, 265, 32), ''); assert.equal(field(header, 297, 32), '');
    assert.equal(parseInt(field(header, 100, 8), 8), type === '5' ? 0o700 : 0o600);
    assert.equal(entries.has(name), false); const payload = bytes.subarray(offset + 512, offset + 512 + size); assert.equal(payload.length, size);
    entries.set(name, { type, payload });
    const padding = (512 - size % 512) % 512;
    assert.ok(bytes.subarray(offset + 512 + size, offset + 512 + size + padding).every(byte => byte === 0));
    offset += 512 + size + padding;
  }
  assert.fail('Missing complete archive terminator.');
}

test('explicit build context is valid bounded ustar containing only fixed metadata and approved ciphertext', async t => {
  const f = await fixture(t), bytes = await collect(createVaultImageBuildContext(f.snapshot)), entries = tarEntries(bytes);
  assert.deepEqual([...entries.keys()], ['Dockerfile', 'manifest.json', 'vault/', 'vault/parts/', `vault/${objectPath}`, 'vault/vault.json']);
  assert.equal(entries.get('Dockerfile').payload.toString(), fixedDockerfile);
  assert.equal(entries.get('manifest.json').payload.toString(), JSON.stringify(f.snapshot.manifest, null, 2) + '\n');
  for (const file of f.snapshot.manifest.files) {
    const actual = entries.get(`vault/${file.path}`).payload;
    assert.deepEqual(actual, f.files.get(file.path));
    assert.equal(createHash('sha256').update(actual).digest('hex'), file.sha256);
  }
  assert.equal(bytes.includes(Buffer.from(f.root)), false);
});

test('unrecognized content present before streaming is refused', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.snapshot.directory, 'unrelated-key'), 'SYNTHETIC RAW KEY');
  await assert.rejects(collect(createVaultImageBuildContext(f.snapshot)), /Unexpected content/);
});

test('files and executable build instructions injected after validation are never consumed', async t => {
  const f = await fixture(t), iterator = createVaultImageBuildContext(f.snapshot)[Symbol.asyncIterator](), first = await iterator.next();
  const marker = 'SYNTHETIC DO NOT INCLUDE';
  await fs.writeFile(path.join(f.snapshot.directory, 'vault', 'private-key.txt'), marker);
  await fs.writeFile(path.join(f.snapshot.directory, 'Dockerfile'), 'FROM attacker/image\nRUN echo ' + marker + '\n');
  await fs.writeFile(path.join(f.snapshot.directory, 'manifest.json'), marker);
  const bytes = await collect(iterator, [first.value]), entries = tarEntries(bytes);
  assert.equal(bytes.includes(Buffer.from(marker)), false);
  assert.equal(entries.has('vault/private-key.txt'), false);
  assert.equal(entries.get('Dockerfile').payload.toString(), fixedDockerfile);
  assert.equal(entries.get('manifest.json').payload.toString(), JSON.stringify(f.snapshot.manifest, null, 2) + '\n');
});

test('caller mutation cannot extend the manifest after the iterator captures its authority', async t => {
  const f = await fixture(t), input = structuredClone(f.snapshot), iterator = createVaultImageBuildContext(input)[Symbol.asyncIterator]();
  const first = await iterator.next();
  input.manifest.files.push({ path: '../../unrelated', bytes: 1, sha256: 'e'.repeat(64) }); input.directory = f.root;
  const entries = tarEntries(await collect(iterator, [first.value]));
  assert.deepEqual([...entries.keys()].filter(name => name.startsWith('vault/') && !name.endsWith('/')), [`vault/${objectPath}`, 'vault/vault.json']);
});

test('changed objects, links and replacement paths fail the stream before final archive termination', async t => {
  const cases = [
    ['same-size mutation', async f => { const bytes = await fs.readFile(f.object); bytes[bytes.length - 1] ^= 1; await fs.writeFile(f.object, bytes); }],
    ['size mutation', f => fs.appendFile(f.object, 'SYNTHETIC PLAINTEXT')],
    ['missing object', f => fs.unlink(f.object)],
    ['hard link', f => fs.link(f.object, path.join(f.root, 'outside'))],
    ['symlink', async f => { const outside = path.join(f.root, 'outside'); await fs.rename(f.object, outside); await fs.symlink(outside, f.object); }],
    ['parent symlink', async f => { const folder = path.dirname(f.object), outside = path.join(f.root, 'outside'); await fs.rename(folder, outside); await fs.symlink(outside, folder, 'dir'); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async t => {
    const f = await fixture(t), iterator = createVaultImageBuildContext(f.snapshot)[Symbol.asyncIterator](), first = await iterator.next();
    await mutate(f); await assert.rejects(collect(iterator, [first.value]));
  });
});

test('a write during object streaming is detected even after an earlier chunk was consumed', async t => {
  const f = await fixture(t), iterator = createVaultImageBuildContext(f.snapshot)[Symbol.asyncIterator]();
  let payloadNext = false, changed = false;
  await assert.rejects(async () => {
    for await (const bytes of iterator) {
      if (payloadNext && !changed) {
        assert.equal(bytes.length, 65536); const handle = await fs.open(f.object, 'r+');
        try { await handle.write(Buffer.from([0x87]), 0, 1, 120000); } finally { await handle.close(); }
        changed = true;
      }
      if (bytes.length === 512 && bytes.subarray(0, 100).toString().replace(/\0.*$/s, '') === `vault/${objectPath}`) payloadNext = true;
    }
  }, /changed/);
  assert.equal(changed, true);
});

test('cancellation stops the stream before further chunks and early consumer exit closes object handles', async t => {
  const f = await fixture(t), aborted = new AbortController(); aborted.abort();
  await assert.rejects(collect(createVaultImageBuildContext(f.snapshot, { signal: aborted.signal })), { name: 'AbortError' });
  const during = new AbortController(), iterator = createVaultImageBuildContext(f.snapshot, { signal: during.signal })[Symbol.asyncIterator]();
  await iterator.next(); during.abort(); await assert.rejects(iterator.next(), { name: 'AbortError' });
  const early = createVaultImageBuildContext(f.snapshot)[Symbol.asyncIterator](); await early.next();
  const original = fs.open.bind(fs); let opened = 0, closed = 0;
  t.mock.method(fs, 'open', async (filename, ...args) => {
    const handle = await original(filename, ...args);
    if (filename === f.object) {
      opened++; const close = handle.close.bind(handle);
      t.mock.method(handle, 'close', async () => { closed++; return close(); });
    }
    return handle;
  });
  let payloadNext = false;
  for await (const bytes of early) {
    if (payloadNext) break;
    if (bytes.length === 512 && bytes.subarray(0, 100).toString().replace(/\0.*$/s, '') === `vault/${objectPath}`) payloadNext = true;
  }
  assert.equal(opened, 1); assert.equal(closed, 1);
});
