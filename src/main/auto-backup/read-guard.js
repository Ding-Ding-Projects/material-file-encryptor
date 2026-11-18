/**
 * Snapshots that a restore is reading right now. Pruning skips every digest held here, so an old snapshot that
 * someone is restoring is never deleted underneath the download. Holds are in memory and end with the restore.
 */
export function createSnapshotReadGuard() {
  const held = new Map();
  const key = (repository, digest) => `${repository}@${digest}`;
  return {
    hold(repository, digest) {
      const name = key(repository, digest);
      held.set(name, (held.get(name) || 0) + 1);
      let released = false;
      return () => {
        if (released) return; released = true;
        const count = (held.get(name) || 1) - 1;
        if (count > 0) held.set(name, count); else held.delete(name);
      };
    },
    isHeld: (repository, digest) => held.has(key(repository, digest)),
    heldDigests(repository) { return new Set([...held.keys()].filter(name => name.startsWith(`${repository}@`)).map(name => name.slice(repository.length + 1))); },
  };
}

/** The one guard shared by every restore path and the pruning in this process. */
export const snapshotReaders = createSnapshotReadGuard();
