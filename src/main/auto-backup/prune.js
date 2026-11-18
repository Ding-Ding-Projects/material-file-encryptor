import { selectRetention, DEFAULT_RETENTION } from './retention.js';

const DEVICE = /^mfe-([a-f0-9]{32})-[a-f0-9]{32}$/;

/**
 * Applies the retention rules to one drive's own snapshots after a verified backup.
 *
 * Only snapshots this computer published for this drive are candidates: the tag carries this computer's device id
 * and the snapshot config names this drive's vault. Snapshots of other drives in the same repository, and this
 * drive's snapshots from other computers, are never touched. The newest verified snapshot and every snapshot a
 * restore is reading are always kept. A delete that does not verify is counted as failed and simply tried again
 * after the next backup, because the snapshot is still listed then.
 *
 *   client      a registry client with a delete-scoped token (deleteSnapshot, snapshotGone)
 *   revisions   the drive's listed snapshots: [{ digest, tag, snapshot: { vaultId }, createdAt }]
 *   newest      the digest of the snapshot that was just verified
 *   tagDates    optional Map(tag -> milliseconds) for older snapshots that carry no created annotation
 *   deleteTag   optional fallback that removes a tag left behind after its manifest was deleted
 */
export async function pruneDriveSnapshots({ client, revisions, deviceId, vaultId, newest, policy = DEFAULT_RETENTION, protect = new Set(), isHeld = () => false, tagDates = null, deleteTag = null, timeZone = 'UTC', signal, now = Date.now }) {
  if (!/^[a-f0-9]{32}$/.test(deviceId) || !/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/.test(vaultId)) throw Error('Invalid drive identity.');
  const own = revisions.filter(item => DEVICE.exec(item.tag)?.[1] === deviceId && item.snapshot?.vaultId === vaultId);
  const result = { state: 'done', at: new Date(now()).toISOString(), candidates: own.length, kept: 0, pruned: 0, failed: 0, keep: [], prunedTags: [], failedTags: [] };
  // Without the just-verified snapshot in the list, the list may be stale: nothing is removed this time.
  if (!own.some(item => item.digest === newest)) return { ...result, state: 'skipped', kept: own.length };
  const snapshots = own.map(item => ({ digest: item.digest, tag: item.tag, createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Number.isFinite(tagDates?.get(item.tag)) ? tagDates.get(item.tag) : null }));
  const { keep, prune } = selectRetention({ snapshots, policy, protect: new Set([...protect, newest]), timeZone });
  result.keep = keep.map(({ tag, digest, createdAt, keptAs }) => ({ tag, digest, createdAt: Number.isFinite(createdAt) ? new Date(createdAt).toISOString() : null, keptAs }));
  result.kept = keep.length;
  for (const item of prune) {
    signal?.throwIfAborted();
    // A restore that started after selection still wins.
    if (isHeld(item.digest)) { result.kept++; result.keep.push({ tag: item.tag, digest: item.digest, createdAt: Number.isFinite(item.createdAt) ? new Date(item.createdAt).toISOString() : null, keptAs: ['protected'] }); continue; }
    let outcome = null;
    try {
      outcome = await client.deleteSnapshot({ digest: item.digest, tag: item.tag }, signal);
      if (outcome.digestGone && !outcome.tagGone && deleteTag) {
        try { await deleteTag(item.tag, signal); } catch { /* the readback below decides */ }
        outcome = await client.snapshotGone({ digest: item.digest, tag: item.tag }, signal);
      }
    } catch (error) { if (signal?.aborted) throw error; outcome = null; }
    if (outcome?.removed) { result.pruned++; result.prunedTags.push(item.tag); }
    else { result.failed++; result.failedTags.push(item.tag); }
  }
  if (result.failed) result.state = 'partial';
  return result;
}
