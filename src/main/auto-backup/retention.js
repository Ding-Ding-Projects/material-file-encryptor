/**
 * Snapshot retention for one drive. The rules follow the familiar "keep latest, then one per day, then one per
 * week" pattern: each rule counts buckets that actually hold a snapshot, so a drive keeps at most
 * latest + daily + weekly snapshots, and a snapshot kept by several rules is still kept once.
 *
 * Selection is pure: it never talks to a registry. The caller decides which snapshots are candidates (only this
 * drive's own snapshots from this computer) and which must never be removed (the newest verified snapshot and
 * anything a restore is reading).
 */
export const DEFAULT_RETENTION = Object.freeze({ keepLatest: 10, keepDaily: 7, keepWeekly: 8 });
export const RETENTION_LIMITS = Object.freeze({ keepLatest: [1, 100], keepDaily: [0, 60], keepWeekly: [0, 104] });

export function validateRetention(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid snapshot retention.');
  const keys = Object.keys(DEFAULT_RETENTION);
  if (Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) throw Error('Invalid snapshot retention.');
  for (const key of keys) {
    const [min, max] = RETENTION_LIMITS[key];
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) throw Error('Invalid snapshot retention.');
  }
  return { keepLatest: value.keepLatest, keepDaily: value.keepDaily, keepWeekly: value.keepWeekly };
}

/** The most snapshots one drive can keep under a policy. */
export const retentionCeiling = policy => policy.keepLatest + policy.keepDaily + policy.keepWeekly;

function dayKey(time, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
/** ISO week of the local calendar day, so a week always starts on Monday. */
function weekKey(time, timeZone) {
  const [year, month, day] = dayKey(time, timeZone).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return `${date.getUTCFullYear()}-W${String(Math.ceil(((date - first) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

/**
 * snapshots: [{ digest, tag, createdAt }] where createdAt is milliseconds or null when unknown.
 * protect: digests that are always kept. Returns { keep: [{...snapshot, keptAs: [...]}], prune: [...] }.
 * Snapshots without a known time sort after every dated one and are only ever kept by the "latest" rule.
 */
export function selectRetention({ snapshots, policy = DEFAULT_RETENTION, protect = new Set(), timeZone = 'UTC' }) {
  const rules = validateRetention(policy);
  const ordered = [...snapshots].sort((a, b) => {
    const at = Number.isFinite(a.createdAt), bt = Number.isFinite(b.createdAt);
    if (at !== bt) return at ? -1 : 1;
    if (at && b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
    return String(a.tag).localeCompare(String(b.tag));
  });
  const reasons = new Map(ordered.map(item => [item.tag, []]));
  ordered.slice(0, rules.keepLatest).forEach(item => reasons.get(item.tag).push('latest'));
  const bucket = (count, key, reason) => {
    const seen = new Set();
    for (const item of ordered) {
      if (seen.size >= count) break;
      if (!Number.isFinite(item.createdAt)) continue;
      const value = key(item.createdAt, timeZone);
      if (seen.has(value)) continue;
      seen.add(value); reasons.get(item.tag).push(reason);
    }
  };
  bucket(rules.keepDaily, dayKey, 'daily');
  bucket(rules.keepWeekly, weekKey, 'weekly');
  for (const item of ordered) if (protect.has(item.digest) && !reasons.get(item.tag).length) reasons.get(item.tag).push('protected');
  // A digest that any kept snapshot uses is never removed, even through a second tag.
  const keptDigests = new Set(ordered.filter(item => reasons.get(item.tag).length).map(item => item.digest));
  const keep = [], prune = [];
  for (const item of ordered) {
    if (reasons.get(item.tag).length) keep.push({ ...item, keptAs: reasons.get(item.tag) });
    else if (keptDigests.has(item.digest)) keep.push({ ...item, keptAs: ['shared'] });
    else prune.push({ ...item });
  }
  return { keep, prune };
}
