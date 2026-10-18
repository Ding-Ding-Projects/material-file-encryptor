import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createVaultImageSnapshot, verifyVaultImageSnapshot } from './vault-image-snapshot.js';
import { createDockerImageTransport, imageTarget } from './vault-image-docker.js';

/** Explicit prepare/build/upload workflow. No automatic login, upload or retry. */
export function createVaultImageService({ workRoot, nativeRequest, docker = createDockerImageTransport(), snapshot = createVaultImageSnapshot, verify = verifyVaultImageSnapshot }) {
  const entries = new Map(); let active = null;
  function find(sessionId, previewId) {
    const entry = entries.get(sessionId);
    if (!entry || entry.previewId !== previewId) throw Error('This image preview expired. Prepare it again for the selected vault.');
    return entry;
  }
  function summary(entry) {
    if (!entry) return null;
    return { previewId: entry.previewId, sessionId: entry.sessionId, target: entry.target.reference,
      fileCount: entry.snapshot.fileCount, totalBytes: entry.snapshot.totalBytes, phase: entry.phase,
      vaultId: entry.snapshot.manifest.vaultId, imageId: entry.image?.imageId, receipt: entry.receipt,
      storageOnly: true, excludesPendingCache: true };
  }
  async function exclusive(sessionId, task) {
    if (active) throw Error('Wait for the current image action to finish.');
    active = { sessionId, controller: new AbortController() };
    try { return await task(active.controller.signal); } finally { active = null; }
  }
  async function discard(sessionId) {
    if (active) throw Error('Cancel the image action and wait before discarding it.');
    const entry = entries.get(sessionId);
    if (entry) { await fs.rm(entry.snapshot.directory, { recursive: true, force: true }); entries.delete(sessionId); }
  }
  return {
    status: sessionId => summary(entries.get(sessionId)),
    async prepare(sessionId, reference) {
      const target = imageTarget(reference);
      await discard(sessionId);
      return exclusive(sessionId, async signal => {
        let result, lease;
        try {
          lease = await nativeRequest('beginSnapshot', {}, sessionId);
          result = await snapshot({ source: lease.storageDir, workRoot, signal });
        } finally {
          if (lease) {
            try { await nativeRequest('releaseSnapshot', { leaseId: lease.leaseId }, sessionId); }
            catch (error) { if (result) await fs.rm(result.directory, { recursive: true, force: true }); throw error; }
          }
        }
        if (signal.aborted) { await fs.rm(result.directory, { recursive: true, force: true }); signal.throwIfAborted(); }
        const entry = { previewId: randomUUID(), sessionId, target, snapshot: result, phase: 'prepared' };
        entries.set(sessionId, entry); return summary(entry);
      });
    },
    build(sessionId, previewId) {
      return exclusive(sessionId, async signal => {
        const entry = find(sessionId, previewId);
        if (entry.phase !== 'prepared') throw Error('Prepare a fresh snapshot before building another image.');
        entry.phase = 'building';
        try { await verify(entry.snapshot, { signal }); entry.image = await docker.build(entry.target, entry.snapshot, signal); entry.phase = 'built'; return summary(entry); }
        catch (error) { entry.phase = 'build-unverified'; throw error; }
      });
    },
    upload(sessionId, previewId) {
      return exclusive(sessionId, async signal => {
        const entry = find(sessionId, previewId);
        if (entry.phase !== 'built') throw Error('Build and review an image before uploading. An uncertain upload is never retried automatically.');
        entry.phase = 'uploading';
        try { entry.receipt = await docker.push(entry.target, entry.image, signal); entry.phase = 'uploaded'; return summary(entry); }
        catch (error) { entry.phase = 'upload-unverified'; throw error; }
      });
    },
    discard,
    cancel(sessionId) { if (active && active.sessionId !== sessionId) throw Error('The image action belongs to another vault session.'); active?.controller.abort(); return { cancelling: Boolean(active) }; },
    get pending() { return Boolean(active); },
    async close() { if (active) throw Error('An image action is still running.'); for (const id of entries.keys()) await discard(id); },
  };
}
