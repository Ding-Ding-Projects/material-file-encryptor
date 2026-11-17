import fs from 'node:fs/promises';
import path from 'node:path';
import { createRegistryStorage } from './registry-storage.js';
import { restoreSnapshotToFolder, restoreFolderName } from './registry-restore.js';

export const HUB_DRIVE_METHODS = new Set(['hubDriveFolders', 'hubDriveFoldersDiscard', 'hubCatalogStart', 'hubCatalogStatus', 'hubCatalogCancel', 'hubEnsureRepository', 'hubRestoreSnapshot', 'hubRestoreStatus', 'hubRestoreCancel']);
const REPOSITORY = /^[a-z0-9][a-z0-9_-]{1,38}\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const fail = (code, message) => { const error = Error(message); error.code = code; return error; };
const SAFE = new Set(['SIGN_IN_REQUIRED', 'REPOSITORY_CREATE_DENIED', 'REPOSITORY_PRIVATE', 'REPOSITORY_NOT_WRITABLE', 'PROVIDER_UNAVAILABLE', 'AUTHENTICATION_REQUIRED']);

/**
 * Main-process requests for Docker Hub drives. No path or registry address is accepted from the
 * renderer: folders are allocated here, and a snapshot can only be restored when the catalogue
 * has itself found it in a repository the signed-in account can read.
 *   chooseParent()  the existing native folder chooser (already validated), or null when cancelled.
 */
export function createHubDriveRequests({ locations, catalog, docker, workRoot, chooseParent, createStorage = createRegistryStorage }) {
  let restore = null;
  const restoreStatus = () => ({ state: restore?.state ?? 'idle', completedFiles: restore?.completedFiles ?? 0, completedBytes: restore?.completedBytes ?? 0, result: restore?.result ?? null, error: restore?.error ?? null });

  function findRevision(repositoryName, digest) {
    const repository = catalog.snapshot().repositories.find(item => item.id === repositoryName);
    const drive = repository?.drives.find(item => item.revisions.some(revision => revision.digest === digest));
    if (!repository || !drive) throw fail('NOT_FOUND', 'That snapshot was not found in the scanned repositories. Refresh the list and choose it again.');
    return { repository, drive };
  }

  async function runRestore(job, { repository, drive }, location) {
    const client = createStorage({ destination: { repository: repository.id, visibility: repository.visibility }, authorize: (name, signal) => docker.registryPullAuthorization(name, signal) });
    let allocation = null, storageDir = null, created = null;
    try {
      if (location === 'choose') {
        const parent = await chooseParent();
        if (!parent) { job.state = 'cancelled'; return; }
        allocation = await locations.allocate({ withStorage: false });
        storageDir = path.join(parent, restoreFolderName());
        await fs.mkdir(storageDir, { mode: 0o700 }); created = storageDir;
      } else { allocation = await locations.allocate(); storageDir = allocation.storageDir; }
      job.state = 'downloading';
      const outcome = await restoreSnapshotToFolder({ client, digest: job.digest, storageDir, workRoot, signal: job.controller.signal,
        onProgress: progress => Object.assign(job, progress) });
      if (outcome.vaultId !== drive.id) throw fail('MISMATCH', 'The restored snapshot does not belong to the drive you chose.');
      job.state = 'done';
      job.result = { driveId: allocation.driveId, storageDir, cacheDir: allocation.cacheDir, vaultId: outcome.vaultId, driveName: outcome.driveName ?? drive.name ?? null, repository: repository.id, visibility: repository.visibility, ownerOnly: allocation.ownerOnly };
    } catch (error) {
      job.state = job.controller.signal.aborted ? 'cancelled' : 'failed';
      job.error = { code: SAFE.has(error?.code) || error?.code === 'NOT_FOUND' || error?.code === 'MISMATCH' ? error.code : 'RESTORE_FAILED' };
      // Everything created for this attempt is ours and was never opened as a drive, so it is removed.
      if (created) await fs.rm(created, { recursive: true, force: true }).catch(() => {});
      if (allocation) await fs.rm(allocation.directory, { recursive: true, force: true }).catch(() => {});
    }
  }

  return async function hubDriveRequest(method, params = {}) {
    if (method === 'hubDriveFolders') { const folders = await locations.allocate(); return { driveId: folders.driveId, storageDir: folders.storageDir, cacheDir: folders.cacheDir, ownerOnly: folders.ownerOnly }; }
    if (method === 'hubDriveFoldersDiscard') return { discarded: await locations.discardEmpty(params.driveId) };
    if (method === 'hubCatalogStart') return catalog.start({ force: params.force === true });
    if (method === 'hubCatalogStatus') return catalog.snapshot();
    if (method === 'hubCatalogCancel') return catalog.cancel();
    if (method === 'hubEnsureRepository') {
      if (!REPOSITORY.test(params.repository)) throw fail('INVALID_NAME', 'Repository names use lowercase letters, digits, dashes, dots and underscores.');
      try { return await docker.ensurePublicRepository(params.repository); }
      catch (error) { throw fail(SAFE.has(error?.code) ? error.code : 'PROVIDER_UNAVAILABLE', SAFE.has(error?.code) ? error.message : 'Docker Hub could not prepare the repository. Check the connection and try again.'); }
    }
    if (method === 'hubRestoreStatus') return restoreStatus();
    if (method === 'hubRestoreCancel') { restore?.controller.abort(); return restoreStatus(); }
    if (method === 'hubRestoreSnapshot') {
      if (restore && ['downloading', 'starting'].includes(restore.state)) throw fail('BUSY', 'A restore is already running.');
      if (!REPOSITORY.test(params.repository) || !DIGEST.test(params.digest) || !['automatic', 'choose'].includes(params.location)) throw fail('INVALID_NAME', 'Invalid restore request.');
      const found = findRevision(params.repository, params.digest);
      restore = { state: 'starting', digest: params.digest, controller: new AbortController(), completedFiles: 0, completedBytes: 0, result: null, error: null };
      const job = restore; job.done = runRestore(job, found, params.location);
      await job.done;
      return restoreStatus();
    }
    throw fail('UNSUPPORTED', 'Unsupported Docker Hub drive request.');
  };
}
