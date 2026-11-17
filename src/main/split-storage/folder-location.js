import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { PART, SPLIT_FOLDER, MIRROR_FOLDER } from './config.js';

const MAX_PART_BYTES = 1024 ** 3;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function rejectLinks(filename) {
  for (let cursor = path.resolve(filename); ; cursor = path.dirname(cursor)) {
    let stat;
    try { stat = await fs.lstat(cursor); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat?.isSymbolicLink()) throw Error('Linked folders are not supported for split storage.');
    if (path.dirname(cursor) === cursor) return;
  }
}

/**
 * Stores whole encrypted parts as files in one folder. Every write lands in a temporary file, is fsynced,
 * renamed into place and re-read; the SHA-256 of the re-read bytes must match the source bytes.
 */
export function createFolderParts({ id, label, partsDirectory, root = partsDirectory }) {
  const fileOf = part => { if (!PART.test(part)) throw Error('Invalid encrypted part.'); return path.join(partsDirectory, `${part}.mfe`); };
  return {
    id, kind: 'folder', label, root, partsDirectory,
    async connected() { try { return (await fs.stat(root)).isDirectory(); } catch { return false; } },
    async has(part) { try { return (await fs.lstat(fileOf(part))).isFile(); } catch { return false; } },
    async size(part) { try { return (await fs.lstat(fileOf(part))).size; } catch { return null; } },
    async read(part) {
      const file = fileOf(part); await rejectLinks(file);
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.size > MAX_PART_BYTES) throw Error('Unsupported encrypted part.');
      return fs.readFile(file);
    },
    async hash(part) { return sha256(await this.read(part)); },
    /** Returns 'verified' once the bytes are durable and re-read correctly. */
    async write(part, bytes) {
      const file = fileOf(part);
      await fs.mkdir(partsDirectory, { recursive: true }); await rejectLinks(file);
      const temporary = path.join(partsDirectory, `.${part}.${randomUUID()}.tmp`);
      const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      try {
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        if (sha256(await fs.readFile(temporary)) !== sha256(bytes)) throw Error('The copy did not verify.');
        await fs.rename(temporary, file);
      } finally { await fs.rm(temporary, { force: true }); }
      if (sha256(await fs.readFile(file)) !== sha256(bytes)) throw Error('The copy did not verify.');
      return 'verified';
    },
    async flush() { return []; },
    async remove(part) { await fs.rm(fileOf(part), { force: true }); },
    async list() {
      try { return (await fs.readdir(partsDirectory)).filter(name => name.endsWith('.mfe') && PART.test(name.slice(0, -4))).map(name => name.slice(0, -4)); }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    },
    async freeBytes() {
      for (let cursor = root; ; cursor = path.dirname(cursor)) {
        try { const stat = await fs.statfs(cursor); return Number(stat.bavail) * Number(stat.bsize); }
        catch { if (path.dirname(cursor) === cursor) return null; }
      }
    },
  };
}
export const mainParts = (storageDir, label = 'Main storage') => createFolderParts({ id: 'main', label, partsDirectory: path.join(storageDir, 'parts'), root: storageDir });
export const shareParts = (location, vaultId) => createFolderParts({ id: location.id, label: location.label, root: location.path, partsDirectory: path.join(location.path, SPLIT_FOLDER, vaultId, 'parts') });
export const mirrorParts = (location, vaultId) => createFolderParts({ id: location.id, label: location.label, root: location.path, partsDirectory: path.join(location.path, MIRROR_FOLDER, vaultId, 'parts') });

/** Volume identity for the same-disk note. Windows device numbers are per volume. */
export async function sameVolume(a, b) {
  const device = async target => { for (let cursor = path.resolve(target); ; cursor = path.dirname(cursor)) { try { return (await fs.stat(cursor)).dev; } catch { if (path.dirname(cursor) === cursor) return null; } } };
  const [left, right] = await Promise.all([device(a), device(b)]);
  return left !== null && left === right;
}
