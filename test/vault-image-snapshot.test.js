import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { createVaultImageSnapshot, inspectVaultConfiguration, verifyVaultImageSnapshot } from '../src/main/vault-image-snapshot.js';

// These are offline, deliberately unauthenticated synthetic records, not real vaults or keys.
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const partName = `parts/${'a'.repeat(32)}.mfe`;
const commitName = `commits/${'b'.repeat(32)}.mfe`;
const activityName = `activity/${'c'.repeat(32)}.mfe`;
const dockerfile = 'FROM scratch\nCOPY vault/ /vault/\nCOPY manifest.json /manifest.json\n';
function record(length = 32, fill = 0x94) {
  const value = Buffer.alloc(length + 36, fill); value.write('MFE1'); value.writeInt32LE(length, 4); return value;
}
function configuration(overrides = {}) {
  return { Format: 3, VaultId: 'd'.repeat(32), Kind: 'password', Iterations: 600000,
    Salt: Buffer.alloc(32, 0x91).toString('base64'), WrappedKey: record().toString('base64'), KeyCheck: record().toString('base64'), ...overrides };
}
const configBytes = value => Buffer.from(JSON.stringify(value));
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'vault-image-offline-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source'), workRoot = path.join(directory, 'prepared');
  await fs.mkdir(source);
  for (const folder of ['parts', 'commits', 'activity']) await fs.mkdir(path.join(source, folder));
  const addressed = record(17), addressedName = `parts/${digest(addressed)}.mfe`;
  const files = new Map([
    ['vault.json', configBytes(configuration())], [partName, Buffer.concat([record(51), record(23)])],
    [commitName, record(29)], [activityName, record(19)], [addressedName, addressed],
  ]);
  for (const [name, bytes] of files) await fs.writeFile(path.join(source, name), bytes);
  return { directory, source, workRoot, files, addressedName,
    prepare: options => createVaultImageSnapshot({ source, workRoot, ...options }) };
}
async function emptyWork(f) {
  assert.deepEqual(await fs.readdir(f.workRoot).catch(error => { if (error.code === 'ENOENT') return []; throw error; }), []);
}
async function replaceFile(filename, bytes) { await fs.unlink(filename); await fs.writeFile(filename, bytes); }
async function rewriteManifest(snapshot, edit) {
  const changed = structuredClone(snapshot); edit(changed);
  await fs.writeFile(path.join(changed.directory, 'manifest.json'), JSON.stringify(changed.manifest, null, 2) + '\n');
  return changed;
}
function patchOpen(t, change) {
  const open = fs.open.bind(fs);
  t.mock.method(fs, 'open', async (filename, flags, ...rest) => {
    const handle = await open(filename, flags, ...rest);
    await change(handle, String(filename), flags); return handle;
  });
}

test('configuration retains only the exact native restoration fields and valid record envelopes', () => {
  for (const Format of [1, 2, 3]) for (const Kind of ['password', 'keyfile']) {
    assert.deepEqual(inspectVaultConfiguration(configBytes(configuration({ Format, Kind }))), { vaultId: 'd'.repeat(32), format: Format });
  }
  const VaultId = 'f'.repeat(64);
  assert.deepEqual(inspectVaultConfiguration(configBytes(configuration({ VaultId, KeyCheck: record(64).toString('base64'), Iterations: 5000000 }))), { vaultId: VaultId, format: 3 });
});

test('configuration rejects extra/raw-key fields, invalid types, malformed base64 and envelopes', () => {
  const cases = [
    { RawKey: 'SYNTHETIC RAW KEY' }, { Password: 'SYNTHETIC PASSWORD' }, { KeyFile: 'private.key' }, { Filename: 'plaintext.txt' },
    { VaultId: 'a'.repeat(32) + '\n', KeyCheck: record(33).toString('base64') }, { Format: 4 }, { Format: '3' }, { VaultId: '../vault' }, { VaultId: 123 }, { VaultId: 'a'.repeat(33) },
    { Kind: 'raw' }, { Iterations: 599999 }, { Iterations: 5000001 }, { Iterations: 600000.5 }, { Iterations: '600000' },
    { Salt: Buffer.alloc(31).toString('base64') }, { Salt: configuration().Salt + '\n' }, { Salt: configuration().Salt.replace(/=$/, '') },
    { WrappedKey: Buffer.alloc(68).toString('base64') }, { KeyCheck: Buffer.alloc(68).toString('base64') },
    { WrappedKey: record(31).toString('base64') }, { KeyCheck: record(33).toString('base64') },
  ];
  for (const changes of cases) assert.throws(() => inspectVaultConfiguration(configBytes(configuration(changes))), undefined, JSON.stringify(changes));
  const missing = configuration(); delete missing.Salt;
  for (const value of [missing, [], null, 'not a vault', 123]) assert.throws(() => inspectVaultConfiguration(configBytes(value)));
  const malformed = record(); malformed.writeInt32LE(31, 4);
  assert.throws(() => inspectVaultConfiguration(configBytes(configuration({ WrappedKey: malformed.toString('base64') }))));
  malformed.writeInt32LE(32, 4); malformed[0] |= 0x80;
  assert.throws(() => inspectVaultConfiguration(configBytes(configuration({ WrappedKey: malformed.toString('base64') }))));
  assert.throws(() => inspectVaultConfiguration(Buffer.alloc(16385)), /limit/);
});

test('configuration uses strict duplicate-key and UTF-8 parsing before any bytes can be copied', () => {
  const good = JSON.stringify(configuration());
  for (const prefix of ['"WrappedKey":"SYNTHETIC RAW KEY",', '"Salt":"private information",', '"S\\u0061lt":"private information",'])
    assert.throws(() => inspectVaultConfiguration(Buffer.from('{' + prefix + good.slice(1))), /Invalid encrypted vault/);
  for (const source of ['\ufeff' + good, good + '\0', good + '{}', '{"__proto__":{},' + good.slice(1), '{"constructor":{},' + good.slice(1)])
    assert.throws(() => inspectVaultConfiguration(Buffer.from(source)));
  assert.throws(() => inspectVaultConfiguration(Buffer.concat([Buffer.from('{"\xc3', 'latin1'), Buffer.from(good.slice(2))])));
});

test('snapshot copies only recognized storage, checks exact bytes and emits a data-only scratch image context', async t => {
  const f = await fixture(t), snapshot = await f.prepare({ limits: { files: 5 } });
  assert.equal(snapshot.fileCount, f.files.size);
  assert.equal(snapshot.totalBytes, [...f.files.values()].reduce((sum, bytes) => sum + bytes.length, 0));
  assert.equal(snapshot.manifest.vaultId, configuration().VaultId);
  assert.equal(snapshot.manifest.format, 3);
  assert.equal(snapshot.manifest.kind, 'encrypted-vault-storage');
  assert.deepEqual(await fs.readdir(snapshot.directory).then(names => names.sort()), ['Dockerfile', 'manifest.json', 'vault']);
  assert.equal(await fs.readFile(path.join(snapshot.directory, 'Dockerfile'), 'utf8'), dockerfile);
  assert.equal(await fs.readFile(path.join(snapshot.directory, 'manifest.json'), 'utf8'), JSON.stringify(snapshot.manifest, null, 2) + '\n');
  assert.deepEqual(snapshot.manifest.files.map(file => file.path), [...f.files.keys()].sort());
  for (const file of snapshot.manifest.files) {
    assert.deepEqual(await fs.readFile(path.join(snapshot.directory, 'vault', file.path)), f.files.get(file.path));
    assert.equal(file.bytes, f.files.get(file.path).length); assert.equal(file.sha256, digest(f.files.get(file.path)));
  }
  assert.equal(JSON.stringify(snapshot.manifest).includes(f.source), false);
  assert.equal(Object.isFrozen(snapshot), true); assert.equal(Object.isFrozen(snapshot.manifest.files[0]), true);
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(snapshot.directory)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(path.join(snapshot.directory, 'vault', 'vault.json'))).mode & 0o777, 0o600);
  }
  await verifyVaultImageSnapshot(snapshot);
});

test('empty initialized vaults are supported without inventing objects or runtime commands', async t => {
  const f = await fixture(t);
  for (const filename of f.files.keys()) if (filename !== 'vault.json') await fs.unlink(path.join(f.source, filename));
  const snapshot = await f.prepare(); assert.equal(snapshot.fileCount, 1); await verifyVaultImageSnapshot(snapshot);
});

test('unexpected storage entries, plaintext, caches, missing config and case aliases are rejected', async t => {
  const cases = [
    ['unrelated root file', f => fs.writeFile(path.join(f.source, 'private-key.txt'), 'SYNTHETIC PRIVATE DATA')],
    ['cache journal', f => fs.writeFile(path.join(f.source, 'journal.mfe'), record())],
    ['git history', f => fs.mkdir(path.join(f.source, '.git'))],
    ['arbitrary object name', f => fs.writeFile(path.join(f.source, 'parts', 'notes.txt'), 'SYNTHETIC PLAINTEXT')],
    ['nested object folder', f => fs.mkdir(path.join(f.source, 'parts', 'nested'))],
    ['missing configuration', f => fs.unlink(path.join(f.source, 'vault.json'))],
    ['wrong object suffix', f => fs.writeFile(path.join(f.source, 'commits', 'e'.repeat(32) + '.MFE'), record())],
  ];
  if (process.platform !== 'win32') cases.push(['trailing-newline path', f => fs.writeFile(path.join(f.source, partName + '\n'), record())]);
  if (process.platform !== 'win32') cases.push(['case alias', f => fs.writeFile(path.join(f.source, partName.toUpperCase().replace('PARTS/', 'parts/').replace('.MFE', '.mfe')), record())]);
  for (const [name, edit] of cases) await t.test(name, async t => {
    const f = await fixture(t); await edit(f); await assert.rejects(f.prepare()); await emptyWork(f);
  });
});

test('storage links and ancestor aliases are rejected rather than followed', async t => {
  const cases = [
    ['object hard link', async f => { await fs.link(path.join(f.source, partName), path.join(f.directory, 'outside-object')); }],
    ['configuration hard link', async f => { await fs.link(path.join(f.source, 'vault.json'), path.join(f.directory, 'outside-config')); }],
    ['object symlink', async f => { const filename = path.join(f.source, partName); await fs.rename(filename, path.join(f.directory, 'outside')); await fs.symlink(path.join(f.directory, 'outside'), filename); }],
    ['folder symlink', async f => { const filename = path.join(f.source, 'parts'); await fs.rename(filename, path.join(f.directory, 'outside')); await fs.symlink(path.join(f.directory, 'outside'), filename, 'dir'); }],
    ['source symlink', async f => { const linked = path.join(f.directory, 'source-link'); await fs.symlink(f.source, linked, 'dir'); return { source: linked }; }],
    ['ancestor symlink', async f => { const linked = path.join(f.directory, 'ancestor-link'); await fs.symlink(f.directory, linked, 'dir'); return { source: path.join(linked, 'source') }; }],
    ['work folder symlink', async f => { const outside = path.join(f.directory, 'outside'); await fs.mkdir(outside); await fs.symlink(outside, f.workRoot, 'dir'); }],
    ['lexical parent alias', async f => ({ source: f.source + path.sep + '..' + path.sep + 'source' })],
  ];
  for (const [name, edit] of cases) await t.test(name, async t => {
    const f = await fixture(t); const options = await edit(f); await assert.rejects(f.prepare(options)); await emptyWork(f);
  });
});

test('snapshot workspace cannot overlap the source and malformed resource limits fail closed', async t => {
  const f = await fixture(t);
  for (const workRoot of [f.source, path.join(f.source, 'nested-work'), f.directory]) await assert.rejects(f.prepare({ workRoot }), /non-overlapping/);
  for (const limits of [{ files: 0 }, { bytes: -1 }, { objectBytes: 1.2 }, { files: Infinity }, { bytes: Number.MAX_SAFE_INTEGER }, { extra: 1 }, null, []])
    await assert.rejects(f.prepare({ limits }), /limits/);
  await assert.rejects(f.prepare({ limits: { files: 4 } }), /file count/);
  await assert.rejects(f.prepare({ limits: { bytes: 1 } }), /size/);
  await assert.rejects(f.prepare({ limits: { objectBytes: 36 } }), /object/);
  await emptyWork(f);
});

test('record framing rejects plaintext, high-bit magic, impossible lengths and trailing data', async t => {
  const highBit = record(); highBit[0] |= 0x80;
  const negative = record(); negative.writeInt32LE(-1, 4);
  const oversized = record(); oversized.writeInt32LE(10000, 4);
  const cases = [Buffer.from('SYNTHETIC PLAINTEXT DO NOT PACKAGE'), Buffer.alloc(0), Buffer.from('MFE1'), highBit, negative, oversized,
    Buffer.concat([record(), Buffer.from('SYNTHETIC TRAILING DATA')]), record().subarray(0, 35), record().subarray(0, 67)];
  for (const [index, bytes] of cases.entries()) await t.test(`invalid record ${index + 1}`, async t => {
    const f = await fixture(t); await fs.writeFile(path.join(f.source, partName), bytes);
    await assert.rejects(f.prepare()); await emptyWork(f);
  });
});

test('native metadata and content-addressed parts require one record and applicable size/hash bounds', async t => {
  for (const name of [commitName, activityName]) await t.test(`single-record ${name.split('/')[0]}`, async t => {
    const f = await fixture(t); await fs.writeFile(path.join(f.source, name), Buffer.concat([record(), record()]));
    await assert.rejects(f.prepare(), /single-record/); await emptyWork(f);
  });
  await t.test('content-addressed part with two records', async t => {
    const f = await fixture(t), bytes = Buffer.concat([record(), record()]);
    await fs.unlink(path.join(f.source, f.addressedName)); await fs.writeFile(path.join(f.source, 'parts', digest(bytes) + '.mfe'), bytes);
    await assert.rejects(f.prepare(), /single-record/); await emptyWork(f);
  });
  await t.test('content-addressed part with a mismatched hash', async t => {
    const f = await fixture(t); await fs.writeFile(path.join(f.source, f.addressedName), record(17, 0x95));
    await assert.rejects(f.prepare(), /invalid hash/); await emptyWork(f);
  });
  for (const [name, bytes] of [[commitName, 32 * 1024 ** 2 + 37], [fillerPath(), 1024 ** 3 + 1]]) await t.test(`oversize ${name.split('/')[0]}`, async t => {
    const f = await fixture(t), filename = path.join(f.source, name);
    const handle = await fs.open(filename, 'w'); await handle.truncate(bytes); await handle.close();
    await assert.rejects(f.prepare(), /Unsupported encrypted vault object/); await emptyWork(f);
  });
  await t.test('packed record exceeds the native record payload cap', async t => {
    const f = await fixture(t), handle = await fs.open(path.join(f.source, partName), 'w'), header = record(0);
    header.writeInt32LE(89999965, 4); await handle.write(header); await handle.truncate(89999965 + 36); await handle.close();
    await assert.rejects(f.prepare(), /supported encrypted record/); await emptyWork(f);
  });
});
function fillerPath() { return `parts/${'e'.repeat(32)}.mfe`; }

test('partial reads and writes are completed and resulting hashes describe the actual output', async t => {
  const f = await fixture(t); let partialWrites = 0, partialReads = 0;
  patchOpen(t, async (handle, filename, flags) => {
    if (typeof flags === 'number' && (flags & constants.O_WRONLY)) {
      const write = handle.write.bind(handle);
      t.mock.method(handle, 'write', async (buffer, offset, length, position) => { partialWrites++; return write(buffer, offset, Math.min(length, 7), position); });
    } else if (filename.startsWith(f.directory + path.sep)) {
      const read = handle.read.bind(handle);
      t.mock.method(handle, 'read', async (buffer, offset, length, position) => { partialReads++; return read(buffer, offset, Math.min(length, 5), position); });
    }
  });
  const snapshot = await f.prepare(); assert.ok(partialWrites > 10); assert.ok(partialReads > 10);
  await verifyVaultImageSnapshot(snapshot);
  for (const [name, bytes] of f.files) assert.deepEqual(await fs.readFile(path.join(snapshot.directory, 'vault', name)), bytes);
});

test('zero-progress writes and source changes fail without leaving a prepared context', async t => {
  await t.test('zero-progress output', async t => {
    const f = await fixture(t);
    patchOpen(t, async (handle, filename, flags) => {
      if (typeof flags === 'number' && (flags & constants.O_WRONLY)) t.mock.method(handle, 'write', async () => ({ bytesWritten: 0 }));
    });
    await assert.rejects(f.prepare(), /complete encrypted snapshot/); await emptyWork(f);
  });
  await t.test('source changed during copy', async t => {
    const f = await fixture(t); let mutated = false;
    patchOpen(t, async (handle, filename, flags) => {
      if (typeof flags === 'number' && (flags & constants.O_WRONLY) && !mutated) {
        const write = handle.write.bind(handle);
        t.mock.method(handle, 'write', async (...args) => {
          const result = await write(...args);
          if (!mutated) { mutated = true; await fs.appendFile(path.join(f.source, activityName), Buffer.from('unrecognized data')); }
          return result;
        });
      }
    });
    await assert.rejects(f.prepare(), /changed/); await emptyWork(f);
  });
  await t.test('new unrecognized source entry during copy', async t => {
    const f = await fixture(t); let mutated = false;
    patchOpen(t, async (handle, filename, flags) => {
      if (typeof flags === 'number' && (flags & constants.O_WRONLY) && !mutated) {
        mutated = true; await fs.writeFile(path.join(f.source, 'plaintext.txt'), 'SYNTHETIC PLAINTEXT');
      }
    });
    await assert.rejects(f.prepare(), /Unexpected content/); await emptyWork(f);
  });
});

test('cancellation is honored before enumeration and during copying with safe cleanup', async t => {
  const f = await fixture(t), before = new AbortController(); before.abort();
  await assert.rejects(f.prepare({ signal: before.signal }), { name: 'AbortError' }); await emptyWork(f);
  const during = new AbortController();
  patchOpen(t, async (handle, filename, flags) => {
    if (typeof flags === 'number' && (flags & constants.O_WRONLY)) {
      const write = handle.write.bind(handle);
      t.mock.method(handle, 'write', async (...args) => { const result = await write(...args); during.abort(); return result; });
    }
  });
  await assert.rejects(f.prepare({ signal: during.signal }), { name: 'AbortError' }); await emptyWork(f);
});

test('cleanup does not delete a replacement directory that the snapshot does not own', async t => {
  const f = await fixture(t); let replaced;
  patchOpen(t, async (handle, filename, flags) => {
    if (typeof flags === 'number' && (flags & constants.O_WRONLY) && !replaced) {
      const snapshotDirectory = path.dirname(path.dirname(path.dirname(filename)));
      assert.equal(path.dirname(snapshotDirectory), f.workRoot);
      replaced = snapshotDirectory;
      await fs.rename(snapshotDirectory, snapshotDirectory + '-moved'); await fs.mkdir(snapshotDirectory);
      await fs.writeFile(path.join(snapshotDirectory, 'unrelated-sentinel'), 'KEEP SYNTHETIC DATA');
      t.mock.method(handle, 'write', async () => { throw Error('synthetic interrupted copy'); });
    }
  });
  await assert.rejects(f.prepare(), /synthetic interrupted copy/);
  assert.equal(await fs.readFile(path.join(replaced, 'unrelated-sentinel'), 'utf8'), 'KEEP SYNTHETIC DATA');
});

test('verification rejects added, removed, replaced and modified context content', async t => {
  const cases = [
    ['unrelated context file', (f, s) => fs.writeFile(path.join(s.directory, '.dockerignore'), '*')],
    ['unrelated vault file', (f, s) => fs.writeFile(path.join(s.directory, 'vault', 'plain.txt'), 'SYNTHETIC PLAINTEXT')],
    ['changed ciphertext', (f, s) => fs.writeFile(path.join(s.directory, 'vault', partName), record())],
    ['same-size ciphertext change', async (f, s) => { const bytes = Buffer.from(f.files.get(partName)); bytes[bytes.length - 1] ^= 1; await fs.writeFile(path.join(s.directory, 'vault', partName), bytes); }],
    ['missing object', (f, s) => fs.unlink(path.join(s.directory, 'vault', partName))],
    ['same-count replacement object', (f, s) => fs.rename(path.join(s.directory, 'vault', partName), path.join(s.directory, 'vault', fillerPath()))],
    ['runtime Docker instruction', (f, s) => fs.appendFile(path.join(s.directory, 'Dockerfile'), 'RUN echo unsafe\n')],
    ['altered manifest', (f, s) => fs.appendFile(path.join(s.directory, 'manifest.json'), '\n')],
  ];
  for (const [name, edit] of cases) await t.test(name, async t => {
    const f = await fixture(t), snapshot = await f.prepare(); await edit(f, snapshot); await assert.rejects(verifyVaultImageSnapshot(snapshot));
  });
});

test('verification rejects links even if linked bytes are identical', async t => {
  for (const name of ['Dockerfile', 'manifest.json', `vault/${partName}`]) for (const kind of ['symlink', 'hardlink']) await t.test(`${kind} ${name.split('/')[0]}`, async t => {
    const f = await fixture(t), snapshot = await f.prepare(), filename = path.join(snapshot.directory, name), outside = path.join(f.directory, 'outside');
    if (kind === 'symlink') { await fs.rename(filename, outside); await fs.symlink(outside, filename); }
    else await fs.link(filename, outside);
    await assert.rejects(verifyVaultImageSnapshot(snapshot));
  });
  await t.test('vault directory symlink', async t => {
    const f = await fixture(t), snapshot = await f.prepare(), filename = path.join(snapshot.directory, 'vault'), outside = path.join(f.directory, 'outside');
    await fs.rename(filename, outside); await fs.symlink(outside, filename, 'dir'); await assert.rejects(verifyVaultImageSnapshot(snapshot));
  });
});

test('verification validates manifest structure, safe paths, uniqueness, byte totals and vault identity', async t => {
  const edits = [
    ['path traversal', s => { s.manifest.files[0].path = '../../outside'; }],
    ['trailing-newline path', s => { s.manifest.files[0].path += '\n'; }],
    ['absolute path', s => { s.manifest.files[0].path = '/etc/passwd'; }],
    ['Windows alternate stream', s => { s.manifest.files[0].path = 'vault.json:private'; }],
    ['backslash alias', s => { s.manifest.files[0].path = partName.replace('/', '\\'); }],
    ['duplicate path', s => { s.manifest.files[1] = { ...s.manifest.files[0] }; }],
    ['unknown manifest field', s => { s.manifest.rawKey = 'SYNTHETIC RAW KEY'; }],
    ['unknown file field', s => { s.manifest.files[0].plaintext = 'SYNTHETIC PRIVATE DATA'; }],
    ['wrong count', s => { s.fileCount--; }], ['wrong bytes', s => { s.totalBytes++; }],
    ['invalid file size', s => { s.manifest.files[0].bytes = -1; }],
    ['trailing-newline digest', s => { s.manifest.files[0].sha256 += '\n'; }],
    ['invalid digest', s => { s.manifest.files[0].sha256 = 'a'.repeat(65); }],
    ['wrong vault identity', s => { s.manifest.vaultId = 'e'.repeat(32); }],
    ['wrong storage format', s => { s.manifest.format = 1; }],
    ['invalid timestamp', s => { s.manifest.createdAt = 'not a timestamp'; }],
    ['unsorted inventory', s => { s.manifest.files.reverse(); }],
  ];
  for (const [name, edit] of edits) await t.test(name, async t => {
    const f = await fixture(t), snapshot = await f.prepare(), changed = await rewriteManifest(snapshot, edit);
    await assert.rejects(verifyVaultImageSnapshot(changed));
  });
});

test('verification still inspects record/configuration structure when presented matching replacement hashes', async t => {
  for (const [name, bytes] of [[partName, Buffer.from('SYNTHETIC PLAINTEXT')], ['vault.json', configBytes(configuration({ RawKey: 'SYNTHETIC RAW KEY' }))]]) await t.test(name.split('/')[0], async t => {
    const f = await fixture(t), snapshot = await f.prepare(); await replaceFile(path.join(snapshot.directory, 'vault', name), bytes);
    const changed = await rewriteManifest(snapshot, s => {
      const file = s.manifest.files.find(file => file.path === name); s.totalBytes += bytes.length - file.bytes;
      file.bytes = bytes.length; file.sha256 = digest(bytes);
    });
    await assert.rejects(verifyVaultImageSnapshot(changed));
  });
});


test('large packed records use correct offsets across bounded copy buffers', async t => {
  const f = await fixture(t), bytes = Buffer.concat([record(2 * 1024 ** 2 + 17), record(43)]);
  await fs.writeFile(path.join(f.source, partName), bytes);
  const snapshot = await f.prepare();
  assert.deepEqual(await fs.readFile(path.join(snapshot.directory, 'vault', partName)), bytes);
  assert.equal(snapshot.manifest.files.find(file => file.path === partName).sha256, digest(bytes));
});

test('short source reads and output corruption cannot produce a successful snapshot', async t => {
  await t.test('source read stops unexpectedly', async t => {
    const f = await fixture(t);
    patchOpen(t, async (handle, filename) => {
      if (filename === path.join(f.source, activityName)) t.mock.method(handle, 'read', async () => ({ bytesRead: 0 }));
    });
    await assert.rejects(f.prepare(), /changed/); await emptyWork(f);
  });
  await t.test('output bytes differ despite a complete reported write', async t => {
    const f = await fixture(t);
    patchOpen(t, async (handle, filename, flags) => {
      if (typeof flags === 'number' && (flags & constants.O_WRONLY)) {
        const write = handle.write.bind(handle);
        t.mock.method(handle, 'write', async (buffer, offset, length, position) => {
          const corrupted = Buffer.from(buffer); corrupted[offset + length - 1] ^= 1;
          return write(corrupted, offset, length, position);
        });
      }
    });
    await assert.rejects(f.prepare()); await emptyWork(f);
  });
});
