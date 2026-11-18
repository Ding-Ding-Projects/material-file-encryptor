import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { inventoryVaultStorage, describeStorageObject, openStorageObject, inspectStorageObject, hashStorageObject, checkContentAddress, storagePath } from './vault-image-snapshot.js';

const CHANGED = 'Encrypted storage changed during snapshot. Retry after synchronization finishes.';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * Plans an incremental registry snapshot without copying the whole drive.
 *
 * Encrypted objects (parts, commits, activity) are immutable and the drive never deletes them from its storage
 * folder, so an object the registry already holds under the same path and size is referenced by its registry
 * digest and never read again. Everything else is read once to hash and structurally check it. Only objects that
 * would disappear when the drive releases its snapshot (a native temporary copy) and the mutable vault.json are
 * copied into workRoot; the rest are read in place when they are uploaded and checked against their hash again.
 *
 * stagedRoot: folder holding vault.json and the objects the drive copied (or the locked storage folder itself).
 * stagedIsTemporary: true when stagedRoot is the drive's temporary copy that is removed on release.
 * sourceRoot / sourceParts: parts the drive left in its storage folder instead of copying them.
 * known: Map of path to { size, digest } for objects already on the registry.
 */
export async function planRegistrySnapshot({ stagedRoot, stagedIsTemporary, sourceRoot = null, sourceParts = [], known = new Map(), workRoot, signal, onProgress = null }) {
  signal?.throwIfAborted();
  const rows = (await inventoryVaultStorage(stagedRoot, signal)).map(row => ({ ...row, root: stagedRoot }));
  const names = new Set(rows.map(row => row.path.toLowerCase()));
  if (sourceParts.length) {
    if (!sourceRoot) throw Error(CHANGED);
    for (const relative of sourceParts) {
      signal?.throwIfAborted();
      if (!/^parts\/(?:[a-f0-9]{32}|[a-f0-9]{64})\.mfe$/.test(relative) || names.has(relative.toLowerCase())) throw Error(CHANGED);
      names.add(relative.toLowerCase());
      rows.push({ ...await describeStorageObject(sourceRoot, relative), root: sourceRoot });
    }
  }
  rows.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const reuse = row => row.path !== 'vault.json' && known.get(row.path)?.size === row.bytes && /^sha256:[a-f0-9]{64}$/.test(known.get(row.path).digest);
  const pending = rows.filter(row => !reuse(row));
  const totalFiles = pending.length, totalBytes = pending.reduce((sum, row) => sum + row.bytes, 0);
  const report = (completedFiles, completedBytes) => { try { onProgress?.({ phase: 'checking', completedFiles, totalFiles, completedBytes, totalBytes }); } catch { /* Progress never changes the snapshot. */ } };
  await fs.mkdir(workRoot, { recursive: true, mode: 0o700 });
  const directory = await fs.mkdtemp(path.join(workRoot, 'plan-'));
  const files = [], upload = [], locations = new Map();
  let configuration = null, checkedFiles = 0, checkedBytes = 0;
  try {
    report(0, 0);
    for (const row of rows) {
      signal?.throwIfAborted();
      if (reuse(row)) { files.push({ path: row.path, bytes: row.bytes, sha256: known.get(row.path).digest.slice(7) }); continue; }
      const handle = await openStorageObject(row.root, row);
      let digest, copy = null;
      try {
        configuration = (await inspectStorageObject(handle, row.path, row.bytes, signal)) || configuration;
        if (stagedIsTemporary && row.root === stagedRoot || row.path === 'vault.json') {
          copy = path.join(directory, row.path.replaceAll('/', '_'));
          const output = await fs.open(copy, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
          try { digest = await hashStorageObject(handle, row.bytes, signal, output); await output.sync(); } finally { await output.close(); }
        } else digest = await hashStorageObject(handle, row.bytes, signal);
      } finally { await handle.close(); }
      checkContentAddress(row.path, digest);
      const file = { path: row.path, bytes: row.bytes, sha256: digest };
      files.push(file); upload.push(file);
      locations.set(row.path, copy ? { filename: copy } : { root: row.root, row });
      checkedFiles++; checkedBytes += row.bytes; report(checkedFiles, checkedBytes);
    }
    if (!configuration?.vaultId) throw Error('Select an encrypted storage folder, not a mounted drive or cache.');
  } catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
  const manifest = Object.freeze({ vaultId: configuration.vaultId, format: configuration.format, files: Object.freeze(files.map(Object.freeze)) });
  return {
    manifest, directory, upload: Object.freeze(upload),
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), uploadBytes: upload.reduce((sum, file) => sum + file.bytes, 0),
    reused: new Set(files.filter(file => !upload.includes(file)).map(file => file.path)),
    /** Reads one planned upload and checks it against the hash taken while planning. */
    async read(relative, readSignal) {
      readSignal?.throwIfAborted();
      const file = upload.find(item => item.path === relative), where = locations.get(relative);
      if (!file || !where) throw Error(CHANGED);
      let bytes;
      if (where.filename) bytes = await fs.readFile(await storagePath(where.filename));
      else {
        const handle = await openStorageObject(where.root, where.row);
        try { bytes = Buffer.alloc(file.bytes); let offset = 0; while (offset < bytes.length) { readSignal?.throwIfAborted(); const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset); if (bytesRead < 1) throw Error(CHANGED); offset += bytesRead; } }
        finally { await handle.close(); }
      }
      if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) throw Error(CHANGED);
      return bytes;
    },
    async dispose() { await fs.rm(directory, { recursive: true, force: true }); },
  };
}
