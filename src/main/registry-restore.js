import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { createVaultImageSnapshot } from './vault-image-snapshot.js';
import { physical, createFile } from './registry-sync-service.js';

const FAILED = 'The snapshot could not be restored. Nothing was kept.';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * Downloads one verified snapshot and writes it into an empty storage folder. The snapshot is staged,
 * checked structurally and by content address, and only then copied, with vault.json last so an
 * interrupted copy never looks like a complete drive. The folder is the caller's to clean up on failure.
 */
export async function restoreSnapshotToFolder({ client, digest, storageDir, workRoot, signal, onProgress = () => {} }) {
  await physical(storageDir);
  if ((await fs.readdir(storageDir)).length) throw Error('The restore folder must be empty.');
  await fs.mkdir(workRoot, { recursive: true, mode: 0o700 });
  const staging = await fs.mkdtemp(path.join(workRoot, 'incoming-'));
  try {
    let files = 0, bytes = 0;
    const revision = await client.download(digest, async (name, content) => {
      signal?.throwIfAborted(); await createFile(staging, name, content);
      files++; bytes += content.length; onProgress({ completedFiles: files, completedBytes: bytes });
    }, signal);
    const verified = await createVaultImageSnapshot({ source: staging, workRoot: path.join(workRoot, 'validation'), signal });
    try { if (verified.manifest.vaultId !== revision.snapshot.vaultId) throw Error(FAILED); }
    finally { await fs.rm(verified.directory, { recursive: true }); }
    const ordered = [...revision.snapshot.files].sort((a, b) => Number(a.path === 'vault.json') - Number(b.path === 'vault.json'));
    for (const entry of ordered) {
      signal?.throwIfAborted();
      const content = await fs.readFile(path.join(staging, entry.path));
      if (`sha256:${hash(content)}` !== entry.digest) throw Error(FAILED);
      await createFile(storageDir, entry.path, content);
    }
    return { vaultId: revision.snapshot.vaultId, driveName: revision.driveName ?? null, files, bytes };
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}

export const restoreFolderName = () => `restored-vault-${randomUUID().slice(0, 8)}`;
