import { createHash } from 'node:crypto';
import { MAIN } from './config.js';
import { holdersOf } from './planner.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const BATCH = 32;
const HELD = 'Split not finished, your files are still all on the main disk.';
const formatBytes = value => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${Math.ceil(value / 1024 ** 2)} MB`;

class Stop extends Error {}

/**
 * Moves encrypted parts between locations. Safety rules, in order of importance:
 * - a copy is recorded in placement.json only after it is durable and its SHA-256 matches the source bytes;
 * - a copy is deleted only after the manifest stops listing it, and only when every target copy of that part
 *   is recorded (and, with Safety backup, re-verified);
 * - nothing on a disconnected location is touched, and the last copy of a part is never removed;
 * - with Safety backup on, no main copy is removed until every planned copy verified and a final
 *   verification pass over all target copies succeeded. Any failure or cancel before that keeps main intact.
 * The caller holds the locked storage folder lease for the whole run, so the engine cannot touch the source.
 *
 * @param {object} options
 * @param {object} options.placement mutable placement.json value
 * @param {Map<string,string[]>} options.targets planned holders per part
 * @param {Map<string,object>} options.adapters location id to adapter
 * @param {Set<string>} options.connected location ids that are reachable now
 * @param {boolean} options.safetyBackup
 * @param {AbortSignal} [options.signal]
 * @param {() => Promise<void>} options.persist writes placement.json atomically
 * @param {object} options.job progress object updated in place
 */
export async function runRebalance({ placement, targets, adapters, connected, safetyBackup, signal, persist, job, sizes = {} }) {
  placement.parts ??= {}; placement.hashes ??= {};
  const label = id => adapters.get(id)?.label || id;
  const setHolders = (part, holders) => {
    const ordered = [...new Set(holders)].sort((a, b) => (a === MAIN ? -1 : b === MAIN ? 1 : a < b ? -1 : 1));
    if (ordered.length === 1 && ordered[0] === MAIN) delete placement.parts[part]; else placement.parts[part] = ordered;
  };
  const touched = [...targets].filter(([part, wanted]) => { const held = holdersOf(placement, part); return wanted.some(id => !held.includes(id)) || held.some(id => !wanted.includes(id)); }).map(([part]) => part).sort();
  Object.assign(job, { phase: 'copying', completedParts: 0, totalParts: touched.length, completedBytes: 0,
    totalBytes: touched.reduce((sum, part) => sum + (sizes[part] ?? 0) * Math.max(1, targets.get(part).filter(id => !holdersOf(placement, part).includes(id)).length), 0),
    currentLocation: null, safetyHeld: false, safetyHeldReason: null, reason: null, message: null, errors: [] });
  const checkCancel = () => { if (signal?.aborted) throw new Stop('The split was cancelled.'); };
  let dirty = 0;
  const persistSoon = async (force = false) => { if (++dirty >= BATCH || force) { dirty = 0; await persist(); } };

  async function readSource(part) {
    // Prefer the main copy; a recorded hash rejects a damaged source copy.
    for (const id of holdersOf(placement, part)) {
      const adapter = adapters.get(id);
      if (!adapter || !connected.has(id)) continue;
      try {
        if (!await adapter.has(part)) continue;
        const bytes = await adapter.read(part, signal), digest = sha256(bytes);
        if (placement.hashes[part] && placement.hashes[part] !== digest) { job.errors.push(`A copy on ${label(id)} is damaged.`); continue; }
        return { bytes, digest };
      } catch (error) { if (signal?.aborted) throw new Stop('The split was cancelled.'); job.errors.push(error.message); }
    }
    throw new Stop(`No readable copy of an encrypted part is connected. Connect ${holdersOf(placement, part).map(label).join(' or ')} and retry.`);
  }

  async function checkRoom() {
    const needed = new Map();
    for (const part of touched) for (const id of targets.get(part)) if (!holdersOf(placement, part).includes(id)) needed.set(id, (needed.get(id) ?? 0) + (sizes[part] ?? 0));
    for (const [id, bytes] of needed) {
      if (!connected.has(id)) throw new Stop(`${label(id)} is not connected.`);
      const free = await adapters.get(id)?.freeBytes?.();
      if (typeof free === 'number' && free < bytes) throw new Stop(`${label(id)} needs ${formatBytes(bytes - free)} more free space.`);
    }
  }

  async function record(id, parts) { for (const part of parts) setHolders(part, [...holdersOf(placement, part), id]); if (parts.length) await persistSoon(); }

  async function copyPhase() {
    job.phase = 'copying';
    const registries = new Set();
    for (const part of touched) {
      checkCancel();
      const wanted = targets.get(part), held = holdersOf(placement, part);
      const add = wanted.filter(id => !held.includes(id));
      if (add.length) {
        const source = await readSource(part);
        placement.hashes[part] ??= source.digest;
        for (const id of add) {
          checkCancel(); job.currentLocation = label(id);
          const adapter = adapters.get(id);
          if (!adapter || !connected.has(id)) throw new Stop(`${label(id)} is not connected.`);
          let result;
          try { result = await adapter.write(part, source.bytes, signal); }
          catch (error) { if (signal?.aborted) throw new Stop('The split was cancelled.'); throw new Stop(`Copying to ${label(id)} failed: ${error.message}`); }
          if (result === 'verified') await record(id, [part]);
          else { registries.add(id); if (result?.committed) await record(id, result.committed); }
          job.completedBytes += source.bytes.length;
        }
      }
      job.completedParts++;
    }
    for (const id of registries) {
      checkCancel(); job.currentLocation = label(id);
      try { await record(id, await adapters.get(id).flush(signal)); }
      catch (error) { throw new Stop(`Uploading to ${label(id)} failed: ${error.message}`); }
    }
    await persistSoon(true);
  }

  async function verifyPhase() {
    job.phase = 'verifying'; job.completedParts = 0;
    for (const part of touched) {
      checkCancel();
      for (const id of targets.get(part)) {
        if (id === MAIN) continue;
        if (!holdersOf(placement, part).includes(id)) throw new Stop(`A copy on ${label(id)} is missing.`);
        if (!connected.has(id)) throw new Stop(`${label(id)} is not connected.`);
        job.currentLocation = label(id);
        let digest = null;
        try { digest = await adapters.get(id).hash(part, signal); } catch (error) { if (signal?.aborted) throw new Stop('The split was cancelled.'); }
        if (digest !== placement.hashes[part]) {
          // Forget the bad copy so a retry writes it again.
          setHolders(part, holdersOf(placement, part).filter(holder => holder !== id)); await persistSoon(true);
          throw new Stop(`A copy on ${label(id)} did not verify.`);
        }
      }
      job.completedParts++;
    }
  }

  async function releasePhase() {
    job.phase = 'releasing'; job.completedParts = 0;
    const queue = [];
    const flush = async () => {
      if (!queue.length) return;
      // The manifest stops listing the old copies first; deletion follows the durable commit.
      const previous = queue.map(item => [item.part, holdersOf(placement, item.part)]);
      for (const item of queue) setHolders(item.part, item.keep);
      dirty = 0;
      try { await persist(); }
      catch (error) { for (const [part, holders] of previous) setHolders(part, holders); queue.length = 0; throw error; }
      for (const item of queue) for (const id of item.remove) {
        try { await adapters.get(id).remove(item.part); } catch (error) { job.errors.push(`An old copy on ${label(id)} could not be removed: ${error.message}`); }
      }
      queue.length = 0;
    };
    for (const part of touched) {
      if (signal?.aborted) { await flush(); throw new Stop('The split was cancelled after some old copies were released. Every file still has a verified copy.'); }
      const wanted = targets.get(part), held = holdersOf(placement, part);
      const remove = held.filter(id => !wanted.includes(id) && connected.has(id));
      if (!remove.length) { job.completedParts++; continue; }
      if (!wanted.every(id => held.includes(id) && connected.has(id))) { job.completedParts++; continue; }
      let ok = true;
      for (const id of wanted) {
        job.currentLocation = label(id);
        try {
          if (safetyBackup) { if (await adapters.get(id).hash(part, signal) !== placement.hashes[part]) ok = false; }
          else if (!await adapters.get(id).has(part)) ok = false;
        } catch { ok = false; }
        if (!ok) break;
      }
      if (!ok) { job.errors.push('A copy changed before its old copy was released; the old copy was kept.'); job.completedParts++; continue; }
      queue.push({ part, remove, keep: held.filter(id => !remove.includes(id)) });
      if (queue.length >= BATCH) await flush();
      job.completedParts++;
    }
    await flush();
  }

  try {
    await checkRoom();
    await copyPhase();
    if (safetyBackup) await verifyPhase();
    await releasePhase();
    Object.assign(job, { phase: 'done', currentLocation: null });
  } catch (error) {
    await persist().catch(() => {});
    if (!(error instanceof Stop)) throw error;
    const beforeRelease = job.phase !== 'releasing';
    Object.assign(job, { phase: safetyBackup && beforeRelease ? 'held' : 'stopped', currentLocation: null, reason: error.message,
      safetyHeld: safetyBackup && beforeRelease, safetyHeldReason: safetyBackup && beforeRelease ? error.message : null,
      message: safetyBackup && beforeRelease ? HELD : error.message });
  }
  return job;
}
