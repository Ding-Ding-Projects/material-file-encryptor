import { createHash } from 'node:crypto';
import { MAIN } from './config.js';

/**
 * Pure placement planner. Each part is assigned with weighted rendezvous hashing over the enabled share
 * locations, so the result depends only on the part id and the location list: adding a location moves
 * only the parts it now wins, and nothing moves between the old locations. Pins from path rules come first.
 * Capacity caps are honoured in part-id order; a part that fits nowhere falls back to the main location.
 */
const TWO_53 = 2 ** 53;
export function rendezvousScore(partId, locationId, weight) {
  if (!(weight > 0)) return -Infinity;
  const digest = createHash('sha256').update(`${locationId}:${partId}`).digest();
  // 53 random bits mapped into the open interval (0, 1).
  const unit = (Number(digest.readBigUInt64BE(0) >> 11n) + 0.5) / TWO_53;
  return weight / -Math.log(unit);
}

/** Share locations ordered by preference for one part. */
export function rankLocations(partId, shares) {
  return shares.map(location => ({ location, score: rendezvousScore(partId, location.id, location.weight) }))
    .filter(item => item.score > -Infinity)
    .sort((a, b) => b.score - a.score || (a.location.id < b.location.id ? -1 : 1))
    .map(item => item.location);
}

/**
 * @param {{ parts: {id:string,size:number}[], locations: object[], copies: number, enabled: boolean, pins?: Record<string,string|null> }} input
 * @returns {{ targets: Map<string,string[]>, bytes: Record<string,number>, overflowParts: number }}
 */
export function planPlacement({ parts, locations, copies = 1, enabled = true, pins = {} }) {
  const targets = new Map(), bytes = {}, used = {};
  for (const location of locations) { bytes[location.id] = 0; used[location.id] = 0; }
  const ordered = [...parts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!enabled) {
    for (const part of ordered) { targets.set(part.id, [MAIN]); bytes[MAIN] = (bytes[MAIN] ?? 0) + part.size; }
    return { targets, bytes, overflowParts: 0 };
  }
  const shares = locations.filter(location => location.role !== 'mirror' && location.enabled !== false);
  const byId = new Map(shares.map(location => [location.id, location]));
  let overflowParts = 0;
  for (const part of ordered) {
    const ranked = rankLocations(part.id, shares);
    const pinned = pins[part.id] && byId.get(pins[part.id]);
    const candidates = pinned ? [pinned, ...ranked.filter(location => location !== pinned)] : ranked;
    const chosen = [];
    for (const location of candidates) {
      if (chosen.length >= copies) break;
      const cap = location.capacityBytes || 0;
      if (cap > 0 && used[location.id] + part.size > cap) continue;
      chosen.push(location.id); used[location.id] += part.size;
    }
    if (chosen.length < copies) {
      overflowParts++;
      // The main location never has a cap, so a part always keeps at least one home.
      if (!chosen.includes(MAIN)) { chosen.push(MAIN); used[MAIN] = (used[MAIN] ?? 0) + part.size; }
    }
    targets.set(part.id, chosen);
    for (const id of chosen) bytes[id] = (bytes[id] ?? 0) + part.size;
  }
  return { targets, bytes, overflowParts };
}

/** Current holders of a part. A part missing from the manifest is held by the main location only. */
export function holdersOf(placement, part) { return placement?.parts?.[part] ?? [MAIN]; }

/** Moves needed to go from the current holdings to the targets. */
export function diffPlan(placement, targets, sizes) {
  let copies = 0, removals = 0, bytesToMove = 0; const touched = [];
  for (const [part, wanted] of targets) {
    const held = holdersOf(placement, part);
    const add = wanted.filter(id => !held.includes(id)), remove = held.filter(id => !wanted.includes(id));
    if (add.length || remove.length) touched.push(part);
    copies += add.length; removals += remove.length; bytesToMove += add.length * (sizes[part] ?? 0);
  }
  return { pending: touched.length > 0, movesPending: touched.length, copiesPending: copies, removalsPending: removals, bytesToMove, parts: touched };
}

/** Parts that cannot be read while the given locations are disconnected (no connected holder and no mirror). */
export function unavailableParts(placement, disconnected, mirrorsConnected = false) {
  if (mirrorsConnected) return [];
  const away = new Set(disconnected);
  return Object.entries(placement?.parts ?? {}).filter(([, held]) => held.length > 0 && held.every(id => away.has(id))).map(([part]) => part);
}
