import { createRegistryStorage } from './registry-storage.js';

/**
 * Reads one verified snapshot's identity for the repository catalogue. The registry client checks
 * every digest and the snapshot structure, so a repository cannot make this report a false drive.
 * authorize(repository, signal) must return pull-only request headers.
 */
export function createHubRegistryReader({ authorize, fetcher = fetch, createStorage = createRegistryStorage } = {}) {
  if (typeof authorize !== 'function') throw Error('Invalid Docker Hub registry reader.');
  const clients = new Map();
  function client(repository, visibility) {
    const key = `${repository}\n${visibility}`;
    if (!clients.has(key)) {
      if (clients.size > 400) clients.clear();
      clients.set(key, createStorage({ destination: { repository, visibility }, authorize: (name, signal) => authorize(name, signal), fetcher }));
    }
    return clients.get(key);
  }
  return {
    async snapshotInfo({ repository, visibility, digest }, signal) {
      const revision = await client(repository, visibility === 'private' ? 'private' : 'public').readRevision(digest, signal);
      const { snapshot } = revision;
      return { vaultId: snapshot.vaultId, deviceId: snapshot.deviceId, driveName: revision.driveName ?? null, fileCount: snapshot.files.length, bytes: snapshot.files.reduce((sum, file) => sum + file.size, 0) };
    },
    forget() { clients.clear(); },
  };
}
