import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRegistryStorage } from '../registry-storage.js';
import { PART } from './config.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const BATCH_BYTES = 512 * 1024 ** 2, BATCH_PARTS = 256;

/**
 * Keeps encrypted parts as layers of registry snapshots (the same snapshot format as registry backups).
 * Each flush publishes one snapshot holding the configuration file and the newly written parts, so parts
 * already uploaded are never sent again. objects maps part id to the manifest digest that holds it and is
 * kept in placement.json. Removing a part only drops it from that map: registry layers are immutable and the
 * registry's own retention decides when they disappear.
 */
export function createRegistryParts({ location, vaultId, storageDir, objects, authorize, storageFactory = createRegistryStorage, destination = null, deviceId = null }) {
  const storage = storageFactory({ destination: destination ? { ...destination, repository: location.repository, visibility: location.visibility } : { repository: location.repository, visibility: location.visibility ?? 'public' }, authorize });
  const device = deviceId ?? createHash('sha256').update(`split:${vaultId}:${location.id}`).digest('hex').slice(0, 32);
  const pending = new Map();
  const object = part => { if (!PART.test(part)) throw Error('Invalid encrypted part.'); return `parts/${part}.mfe`; };
  async function publish() {
    if (!pending.size) return [];
    const configuration = await fs.readFile(path.join(storageDir, 'vault.json'));
    const files = [{ path: 'vault.json', bytes: configuration.length, sha256: sha256(configuration) },
      ...[...pending].map(([part, bytes]) => ({ path: object(part), bytes: bytes.length, sha256: sha256(bytes) }))];
    const result = await storage.publish({ vaultId, deviceId: device, parents: [], files,
      readFile: async name => name === 'vault.json' ? configuration : pending.get(name.slice(6, -4)) });
    if (result?.verified !== true) throw Error('Registry storage did not confirm the upload.');
    const committed = [...pending.keys()];
    for (const part of committed) objects[part] = result.digest;
    pending.clear();
    return committed;
  }
  let pendingBytes = 0;
  return {
    id: location.id, kind: 'registry', label: location.label,
    async connected() { return true; },
    async has(part) { return Object.hasOwn(objects, part) || pending.has(part); },
    async size() { return null; },
    async read(part, signal) {
      if (pending.has(part)) return pending.get(part);
      const digest = objects[part]; if (!digest) throw Error(`This file is stored on ${location.label}, which does not hold the requested part.`);
      return Buffer.from(await storage.readObject(digest, object(part), signal));
    },
    async hash(part, signal) { return sha256(await this.read(part, signal)); },
    /** Buffers the part; returns 'pending' until flush publishes and verifies the snapshot. */
    async write(part, bytes) {
      object(part); pending.set(part, Buffer.from(bytes)); pendingBytes += bytes.length;
      if (pending.size >= BATCH_PARTS || pendingBytes >= BATCH_BYTES) { pendingBytes = 0; return { committed: await publish() }; }
      return 'pending';
    },
    async flush() { pendingBytes = 0; return publish(); },
    async remove(part) { delete objects[part]; pending.delete(part); },
    async list() { return Object.keys(objects); },
    async freeBytes() { return null; },
  };
}
