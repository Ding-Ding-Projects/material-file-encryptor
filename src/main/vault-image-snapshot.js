import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseStrictJson } from '../shared/personal-vocabulary.js';

const CONFIG_FIELDS = ['Format', 'VaultId', 'Kind', 'Iterations', 'Salt', 'WrappedKey', 'KeyCheck'];
const MANIFEST_FIELDS = ['schemaVersion', 'kind', 'createdAt', 'files', 'vaultId', 'format'];
const OBJECT = /^(parts|commits|activity)\/([a-fA-F0-9]{32}|[a-fA-F0-9]{64})\.mfe$/;
const CONFIG_BYTES = 16384;
const METADATA_BYTES = 32 * 1024 ** 2;
const PART_BYTES = 1024 ** 3;
const RECORD_BYTES = 89999964;
const DEFAULT_LIMITS = Object.freeze({ files: 100000, bytes: 100 * 1024 ** 3, objectBytes: PART_BYTES });
const DOCKERFILE = 'FROM scratch\nCOPY vault/ /vault/\nCOPY manifest.json /manifest.json\n';
const MAGIC = Buffer.from('MFE1');
const CHANGED = 'Encrypted storage changed during snapshot. Retry after synchronization finishes.';
const PREPARED_CHANGED = 'The prepared image snapshot changed. Prepare it again.';
const stable = stat => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs, stat.nlink, stat.mode].join(':');
const identity = stat => [stat.dev, stat.ino].join(':');
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const validPath = value => typeof value === 'string' && (value === 'vault.json' || OBJECT.exec(value)?.[0] === value);

async function physical(filename, allowMissing = false) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename) || filename.includes('\0') ||
      filename.split(/[\\/]/).some(part => part === '.' || part === '..')) throw Error('Vault folder aliases are not supported.');
  const absolute = path.resolve(filename);
  let cursor = absolute;
  for (;;) {
    let stat;
    try { stat = await fs.lstat(cursor); }
    catch (error) { if (!allowMissing || error.code !== 'ENOENT') throw error; }
    if (stat) {
      if (stat.isSymbolicLink()) throw Error('Linked vault folders and files are not supported.');
      if (!samePath(cursor, await fs.realpath(cursor))) throw Error('Vault folder aliases are not supported.');
    }
    const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
  return absolute;
}
function within(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function limitsFor(overrides) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) ||
      Object.keys(overrides).some(key => !Object.hasOwn(DEFAULT_LIMITS, key))) throw Error('Invalid vault snapshot limits.');
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  for (const [key, value] of Object.entries(limits))
    if (!Number.isSafeInteger(value) || value < 1 || value > DEFAULT_LIMITS[key]) throw Error('Invalid vault snapshot limits.');
  return limits;
}
function decode(value, bytes) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw Error('Invalid encrypted vault configuration.');
  const buffer = Buffer.from(value, 'base64');
  if (buffer.length !== bytes || buffer.toString('base64') !== value) throw Error('Invalid encrypted vault configuration.');
  return buffer;
}
function envelope(bytes, length) {
  if (!bytes.subarray(0, 4).equals(MAGIC) || bytes.readInt32LE(4) !== length || bytes.length !== length + 36)
    throw Error('Invalid encrypted vault configuration.');
}
/** Structural validation only. Authenticity is checked by the native vault engine when unlocking. */
export function inspectVaultConfiguration(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > CONFIG_BYTES) throw Error('Vault configuration exceeds its limit.');
  let value;
  try { value = parseStrictJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), CONFIG_BYTES); }
  catch { throw Error('Invalid encrypted vault configuration.'); }
  if (!exact(value, CONFIG_FIELDS) || ![1, 2, 3].includes(value.Format) ||
      typeof value.VaultId !== 'string' || ![32, 64].includes(value.VaultId.length) || !/^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{64})$/.test(value.VaultId) ||
      !['password', 'keyfile'].includes(value.Kind) || !Number.isInteger(value.Iterations) || value.Iterations < 600000 || value.Iterations > 5000000)
    throw Error('The selected folder is not a recognized encrypted vault.');
  decode(value.Salt, 32);
  envelope(decode(value.WrappedKey, 68), 32);
  envelope(decode(value.KeyCheck, value.VaultId.length + 36), value.VaultId.length);
  return { vaultId: value.VaultId, format: value.Format };
}
function objectLimit(relative, limits) {
  if (relative === 'vault.json') return CONFIG_BYTES;
  if (!relative.startsWith('parts/')) return Math.min(limits.objectBytes, METADATA_BYTES + 36);
  return Math.min(limits.objectBytes, OBJECT.exec(relative)[2].length === 64 ? 90000000 : PART_BYTES);
}
async function inventory(root, limits, signal) {
  await physical(root);
  if (!(await fs.lstat(root)).isDirectory()) throw Error('Select an encrypted storage folder.');
  const files = [], names = new Set(); let bytes = 0;
  const add = relative => {
    if (names.has(relative.toLowerCase())) throw Error('Vault object path aliases are not supported.');
    names.add(relative.toLowerCase()); files.push(relative);
    if (files.length > limits.files) throw Error('Vault image file count exceeds its limit.');
  };
  for await (const entry of await fs.opendir(root)) {
    signal?.throwIfAborted();
    if (entry.name === 'vault.json' && entry.isFile()) add('vault.json');
    else if (['parts', 'commits', 'activity'].includes(entry.name) && entry.isDirectory()) {
      const folder = path.join(root, entry.name); await physical(folder);
      for await (const object of await fs.opendir(folder)) {
        signal?.throwIfAborted();
        const relative = `${entry.name}/${object.name}`;
        if (!object.isFile() || !validPath(relative)) throw Error('Unexpected content exists in the encrypted storage folder. Nothing was packaged.');
        add(relative);
      }
    } else throw Error('Unexpected content exists in the encrypted storage folder. Nothing was packaged.');
  }
  if (!files.includes('vault.json')) throw Error('Select an encrypted storage folder, not a mounted drive or cache.');
  const rows = [];
  for (const relative of files.sort()) {
    signal?.throwIfAborted();
    const filename = path.join(root, relative); await physical(filename);
    const stat = await fs.lstat(filename, { bigint: true });
    if (!stat.isFile() || stat.nlink !== 1n || stat.size > BigInt(objectLimit(relative, limits))) throw Error('Unsupported encrypted vault object.');
    bytes += Number(stat.size); if (bytes > limits.bytes) throw Error('Vault image size exceeds its limit.');
    rows.push({ path: relative, bytes: Number(stat.size), identity: stable(stat) });
  }
  return rows;
}
async function readExactly(handle, buffer, offset, signal) {
  let read = 0;
  while (read < buffer.length) {
    signal?.throwIfAborted();
    const { bytesRead } = await handle.read(buffer, read, buffer.length - read, offset + read);
    if (!Number.isInteger(bytesRead) || bytesRead < 1 || bytesRead > buffer.length - read) throw Error(CHANGED);
    read += bytesRead;
  }
}
async function inspectRecords(handle, relative, size, signal) {
  if (relative === 'vault.json') {
    const bytes = Buffer.alloc(size); await readExactly(handle, bytes, 0, signal);
    return inspectVaultConfiguration(bytes);
  }
  const metadata = !relative.startsWith('parts/'), contentAddressed = !metadata && OBJECT.exec(relative)[2].length === 64;
  const header = Buffer.alloc(8); let offset = 0, records = 0;
  while (offset < size) {
    if (size - offset < 36) throw Error('An object is not in the supported encrypted record format.');
    await readExactly(handle, header, offset, signal);
    const length = header.readInt32LE(4);
    if (!header.subarray(0, 4).equals(MAGIC) || length < 0 || length > (metadata ? METADATA_BYTES : RECORD_BYTES) || offset + length + 36 > size)
      throw Error('An object is not in the supported encrypted record format.');
    offset += length + 36; records++;
    if ((metadata || contentAddressed) && records > 1) throw Error('Invalid encrypted single-record object.');
  }
  if (!records) throw Error('Empty encrypted object.');
}
async function openRow(root, row) {
  const filename = path.join(root, row.path); await physical(filename);
  const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || stat.nlink !== 1n || stable(stat) !== row.identity) throw Error(CHANGED);
    return handle;
  } catch (error) { await handle.close(); throw error; }
}
async function hashHandle(handle, size, signal, output) {
  const hash = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024); let offset = 0;
  try {
    while (offset < size) {
      signal?.throwIfAborted();
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, size - offset), offset);
      if (!Number.isInteger(bytesRead) || bytesRead < 1 || bytesRead > Math.min(buffer.length, size - offset)) throw Error(CHANGED);
      hash.update(buffer.subarray(0, bytesRead));
      if (output) {
        let written = 0;
        while (written < bytesRead) {
          signal?.throwIfAborted();
          const { bytesWritten } = await output.write(buffer, written, bytesRead - written, offset + written);
          if (!Number.isInteger(bytesWritten) || bytesWritten < 1 || bytesWritten > bytesRead - written) throw Error('Could not write the complete encrypted snapshot.');
          written += bytesWritten;
        }
      }
      offset += bytesRead;
    }
    return hash.digest('hex');
  } finally { buffer.fill(0); }
}
function checkContentAddress(relative, sha256) {
  const match = OBJECT.exec(relative);
  if (match?.[1] === 'parts' && match[2].length === 64 && match[2].toLowerCase() !== sha256)
    throw Error('An encrypted content-addressed object has an invalid hash.');
}
async function verifyRows(root, rows, expected, signal, inspect = false) {
  let configuration;
  for (let index = 0; index < rows.length; index++) {
    signal?.throwIfAborted();
    const row = rows[index], file = expected[index];
    if (!file || row.path !== file.path || row.bytes !== file.bytes) throw Error(PREPARED_CHANGED);
    const handle = await openRow(root, row);
    try {
      if (inspect) configuration = (await inspectRecords(handle, row.path, row.bytes, signal)) || configuration;
      const digest = await hashHandle(handle, row.bytes, signal);
      if (digest !== file.sha256 || stable(await handle.stat({ bigint: true })) !== row.identity) throw Error(PREPARED_CHANGED);
      checkContentAddress(row.path, digest);
    } finally { await handle.close(); }
  }
  return configuration;
}
async function cleanOwned(directory, ownedIdentity) {
  try {
    await physical(directory);
    const stat = await fs.lstat(directory, { bigint: true });
    if (stat.isDirectory() && identity(stat) === ownedIdentity) await fs.rm(directory, { recursive: true, force: true });
  } catch (error) { if (error.code !== 'ENOENT') return; }
}
/** Caller must hold a native locked-source lease for the complete copy. No credentials or decryption are used here. */
export async function createVaultImageSnapshot({ source, workRoot, limits: overrides = {}, signal }) {
  signal?.throwIfAborted();
  const limits = limitsFor(overrides);
  source = await physical(source); workRoot = await physical(workRoot, true);
  if (within(source, workRoot) || within(workRoot, source)) throw Error('Snapshot work and encrypted storage folders must be separate and non-overlapping.');
  const rows = await inventory(source, limits, signal);
  await fs.mkdir(workRoot, { recursive: true, mode: 0o700 }); await physical(workRoot);
  const directory = await fs.mkdtemp(path.join(workRoot, 'vault-image-'));
  const ownedIdentity = identity(await fs.lstat(directory, { bigint: true }));
  const vault = path.join(directory, 'vault');
  const manifest = { schemaVersion: 1, kind: 'encrypted-vault-storage', createdAt: new Date().toISOString(), files: [] };
  try {
    await physical(directory); await fs.mkdir(vault, { mode: 0o700 });
    for (const row of rows) {
      signal?.throwIfAborted();
      const handle = await openRow(source, row);
      try {
        const configuration = await inspectRecords(handle, row.path, row.bytes, signal);
        if (configuration) Object.assign(manifest, configuration);
        const target = path.join(vault, row.path); await physical(path.dirname(target), true);
        await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 }); await physical(path.dirname(target));
        const output = await fs.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
        let digest;
        try { digest = await hashHandle(handle, row.bytes, signal, output); await output.sync(); }
        finally { await output.close(); }
        if (stable(await handle.stat({ bigint: true })) !== row.identity) throw Error(CHANGED);
        checkContentAddress(row.path, digest);
        manifest.files.push(Object.freeze({ path: row.path, bytes: row.bytes, sha256: digest }));
      } finally { await handle.close(); }
    }
    if (JSON.stringify(await inventory(source, limits, signal)) !== JSON.stringify(rows)) throw Error(CHANGED);
    await verifyRows(source, rows, manifest.files, signal);
    if (JSON.stringify(await inventory(source, limits, signal)) !== JSON.stringify(rows)) throw Error(CHANGED);
    Object.freeze(manifest.files); Object.freeze(manifest);
    await physical(directory);
    await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await fs.writeFile(path.join(directory, 'Dockerfile'), DOCKERFILE, { flag: 'wx', mode: 0o600 });
    const snapshot = Object.freeze({ directory, manifest, fileCount: rows.length, totalBytes: rows.reduce((total, row) => total + row.bytes, 0) });
    await verifyVaultImageSnapshot(snapshot, { signal });
    return snapshot;
  } catch (error) { await cleanOwned(directory, ownedIdentity); throw error; }
}
function validateManifest(snapshot) {
  const manifest = snapshot?.manifest;
  if (!exact(manifest, MANIFEST_FIELDS) || manifest.schemaVersion !== 1 || manifest.kind !== 'encrypted-vault-storage' ||
      typeof manifest.createdAt !== 'string' || manifest.createdAt.length !== 24 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(manifest.createdAt) ||
      !Number.isFinite(Date.parse(manifest.createdAt)) || ![1, 2, 3].includes(manifest.format) ||
      typeof manifest.vaultId !== 'string' || ![32, 64].includes(manifest.vaultId.length) || !/^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{64})$/.test(manifest.vaultId) ||
      !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > DEFAULT_LIMITS.files)
    throw Error('Invalid prepared image manifest.');
  const names = new Set(); let bytes = 0;
  for (const file of manifest.files) {
    if (!exact(file, ['path', 'bytes', 'sha256']) || !validPath(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 ||
        file.bytes > objectLimit(file.path, DEFAULT_LIMITS) || typeof file.sha256 !== 'string' || file.sha256.length !== 64 || !/^[a-f0-9]{64}$/.test(file.sha256) || names.has(file.path.toLowerCase()))
      throw Error('Invalid prepared image manifest.');
    names.add(file.path.toLowerCase()); bytes += file.bytes;
  }
  if (!names.has('vault.json') || bytes > DEFAULT_LIMITS.bytes || snapshot.fileCount !== names.size || snapshot.totalBytes !== bytes)
    throw Error('Invalid prepared image manifest.');
}
async function exactControlFile(directory, name, expected, signal) {
  const filename = path.join(directory, name); await physical(filename);
  const stat = await fs.lstat(filename, { bigint: true });
  if (!stat.isFile() || stat.nlink !== 1n || stat.size !== BigInt(Buffer.byteLength(expected))) throw Error(PREPARED_CHANGED);
  const row = { path: name, identity: stable(stat) }, handle = await openRow(directory, row);
  try {
    const bytes = Buffer.alloc(Number(stat.size)); await readExactly(handle, bytes, 0, signal);
    if (!bytes.equals(Buffer.from(expected)) || stable(await handle.stat({ bigint: true })) !== row.identity) throw Error(PREPARED_CHANGED);
  } finally { await handle.close(); }
}
export async function verifyVaultImageSnapshot(snapshot, { signal } = {}) {
  signal?.throwIfAborted(); validateManifest(snapshot);
  await physical(snapshot.directory);
  const expectedNames = ['Dockerfile', 'manifest.json', 'vault'].sort().join('|');
  if ((await fs.readdir(snapshot.directory)).sort().join('|') !== expectedNames) throw Error('Unexpected content exists in the prepared image context.');
  await exactControlFile(snapshot.directory, 'Dockerfile', DOCKERFILE, signal);
  await exactControlFile(snapshot.directory, 'manifest.json', JSON.stringify(snapshot.manifest, null, 2) + '\n', signal);
  const root = path.join(snapshot.directory, 'vault'), rows = await inventory(root, DEFAULT_LIMITS, signal);
  if (rows.length !== snapshot.manifest.files.length) throw Error(PREPARED_CHANGED);
  const configuration = await verifyRows(root, rows, snapshot.manifest.files, signal, true);
  if (configuration?.vaultId !== snapshot.manifest.vaultId || configuration?.format !== snapshot.manifest.format ||
      JSON.stringify(await inventory(root, DEFAULT_LIMITS, signal)) !== JSON.stringify(rows)) throw Error(PREPARED_CHANGED);
  await exactControlFile(snapshot.directory, 'Dockerfile', DOCKERFILE, signal);
  await exactControlFile(snapshot.directory, 'manifest.json', JSON.stringify(snapshot.manifest, null, 2) + '\n', signal);
  if ((await fs.readdir(snapshot.directory)).sort().join('|') !== expectedNames) throw Error(PREPARED_CHANGED);
}

/** Re-open only an allowlisted snapshot file and validate the exact bytes consumed by the build stream. */
export async function* readVaultImageSnapshotFile(directory, file, { signal } = {}) {
  if (!exact(file, ['path', 'bytes', 'sha256']) || !validPath(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 ||
      file.bytes > objectLimit(file.path, DEFAULT_LIMITS) || typeof file.sha256 !== 'string' || file.sha256.length !== 64 || !/^[a-f0-9]{64}$/.test(file.sha256))
    throw Error('Invalid prepared image manifest.');
  signal?.throwIfAborted();
  const root = path.join(directory, 'vault'), filename = path.join(root, file.path);
  await physical(filename);
  const stat = await fs.lstat(filename, { bigint: true });
  if (!stat.isFile() || stat.nlink !== 1n || stat.size !== BigInt(file.bytes)) throw Error(PREPARED_CHANGED);
  const row = { path: file.path, bytes: file.bytes, identity: stable(stat) }, handle = await openRow(root, row);
  const hash = createHash('sha256'); let offset = 0;
  try {
    while (offset < row.bytes) {
      signal?.throwIfAborted();
      const bytes = Buffer.alloc(Math.min(65536, row.bytes - offset));
      await readExactly(handle, bytes, offset, signal); hash.update(bytes); offset += bytes.length;
      yield bytes;
    }
    signal?.throwIfAborted();
    if (hash.digest('hex') !== file.sha256 || stable(await handle.stat({ bigint: true })) !== row.identity) throw Error(PREPARED_CHANGED);
    await physical(filename);
    if (stable(await fs.lstat(filename, { bigint: true })) !== row.identity) throw Error(PREPARED_CHANGED);
  } finally { await handle.close(); }
}
