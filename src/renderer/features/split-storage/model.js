// Pure helpers for the Split storage page: bounded normalization of the host status, share arithmetic and the
// configuration that is sent back to the host. Nothing here touches the DOM, so it is tested without a browser.

export const SPLIT_METHODS = Object.freeze(['splitStorageStatus', 'chooseSplitFolder', 'saveSplitStorage', 'previewSplitStorage', 'applySplitStorage', 'cancelSplitStorage', 'disableSplitStorage', 'verifySplitStorage']);
export const PHASES = Object.freeze(['copying', 'verifying', 'releasing']);
const KINDS = ['folder', 'registry'];
const MAX_LOCATIONS = 16, MAX_RULES = 64, MAX_PATHS = 50;
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const nonNegative = value => Math.max(0, num(value));

export const newId = () => 'loc-' + Math.random().toString(36).slice(2, 10);

export function formatBytes(value) {
  let amount = nonNegative(value);
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit++; }
  return `${unit === 0 || amount >= 100 ? Math.round(amount) : amount.toFixed(1)} ${units[unit]}`;
}

/** Bounded view of the host status. A value that is not an object throws so the page can show an honest unavailable state. */
export function normalizeSplitStatus(raw) {
  if (!raw || typeof raw !== 'object') throw Error('invalidStatus');
  const locations = (Array.isArray(raw.locations) ? raw.locations : []).slice(0, MAX_LOCATIONS).map(row => ({
    id: text(row?.id, 64), role: row?.role === 'mirror' ? 'mirror' : 'share', kind: KINDS.includes(row?.kind) ? row.kind : 'folder', label: text(row?.label, 80),
    path: text(row?.path, 400), repository: text(row?.repository, 220), weight: Math.max(0, num(row?.weight, 1)),
    capacityBytes: nonNegative(row?.capacityBytes), enabled: row?.enabled !== false, connected: row?.connected !== false,
    removable: row?.removable === true, freeBytes: row?.freeBytes === null || row?.freeBytes === undefined || !Number.isFinite(Number(row.freeBytes)) ? null : nonNegative(row.freeBytes),
    storedBytes: nonNegative(row?.storedBytes), storedParts: Math.floor(nonNegative(row?.storedParts)), lastError: text(row?.lastError, 300),
    sameDisk: row?.sameDisk === true, lastUpdated: typeof row?.lastUpdated === 'string' && Number.isFinite(Date.parse(row.lastUpdated)) ? row.lastUpdated : null,
    upToDate: row?.upToDate !== false, behindParts: Math.floor(nonNegative(row?.behindParts)), behindBytes: nonNegative(row?.behindBytes)
  })).filter(row => row.id);
  const plan = raw.plan && typeof raw.plan === 'object' ? raw.plan : {};
  const job = raw.job && typeof raw.job === 'object' ? {
    phase: text(raw.job.phase, 24), completedParts: Math.floor(nonNegative(raw.job.completedParts)), totalParts: Math.floor(nonNegative(raw.job.totalParts)),
    completedBytes: nonNegative(raw.job.completedBytes), totalBytes: nonNegative(raw.job.totalBytes), currentLocation: text(raw.job.currentLocation, 80)
  } : null;
  return {
    supported: raw.supported !== false, enabled: raw.enabled === true, copies: Math.max(1, Math.floor(num(raw.copies, 1))),
    // A configuration without the field reads as on: the safe choice is the default.
    safetyBackup: raw.safetyBackup !== false, safetyHeld: raw.job?.safetyHeld === true || raw.safetyHeld === true,
    heldReason: text(raw.safetyHeldReason ?? raw.heldReason ?? raw.job?.safetyHeldReason ?? raw.job?.heldReason ?? raw.job?.error, 400),
    locations,
    rules: (Array.isArray(raw.rules) ? raw.rules : []).slice(0, MAX_RULES).map(rule => ({ match: text(rule?.match, 200), location: text(rule?.location, 64) || 'spread' })),
    totals: { parts: Math.floor(nonNegative(raw.totals?.parts)), bytes: nonNegative(raw.totals?.bytes) },
    plan: { pending: plan.pending === true, movesPending: Math.floor(nonNegative(plan.movesPending)), bytesToMove: nonNegative(plan.bytesToMove),
      unavailableFiles: (Array.isArray(plan.unavailableFiles) ? plan.unavailableFiles : []).slice(0, MAX_PATHS).map(item => text(String(item), 400)),
      unavailableCount: Math.floor(nonNegative(plan.unavailableCount ?? (Array.isArray(plan.unavailableFiles) ? plan.unavailableFiles.length : 0))) },
    job
  };
}

/** Share of each enabled location as a percentage with one decimal. Disabled locations get 0. */
export function sharePercents(locations) {
  const active = locations.filter(row => row.role !== 'mirror' && row.enabled && Number(row.weight) > 0);
  const sum = active.reduce((total, row) => total + Number(row.weight), 0);
  return new Map(locations.map(row => [row.id, row.role !== 'mirror' && row.enabled && sum > 0 && Number(row.weight) > 0 ? Math.round(Number(row.weight) / sum * 1000) / 10 : 0]));
}

/** With a single copy, every location that holds a share is needed to open the files stored on it. */
export function copiesWarning(copies, locations) {
  return Number(copies) <= 1 && locations.filter(row => row.role !== 'mirror' && row.enabled && Number(row.weight) > 0).length > 1;
}

const REPOSITORY = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;

/** First problem in a draft as a copy key, or null. The host validates again, this only avoids a pointless round trip. */
export function draftProblem(draft) {
  const active = draft.locations.filter(row => row.role !== 'mirror' && row.enabled);
  if (draft.enabled && !active.length) return 'problemNoLocation';
  for (const row of draft.locations) {
    const mirror = row.role === 'mirror';
    if (!mirror && (!(Number(row.weight) > 0) || !Number.isFinite(Number(row.weight)))) return 'problemWeight';
    if (row.kind === 'folder' && row.id !== 'main' && !String(row.path).trim()) return 'problemPath';
    if (row.kind === 'registry' && !REPOSITORY.test(String(row.repository).trim().toLowerCase())) return 'problemRepository';
    if (!mirror && !(Number(row.capacityBytes) >= 0)) return 'problemCapacity';
  }
  if (!(Number(draft.copies) >= 1) || Number(draft.copies) > Math.max(1, active.length)) return 'problemCopies';
  const ids = new Set(draft.locations.filter(row => row.role !== 'mirror').map(row => row.id));
  for (const rule of draft.rules) if (!String(rule.match).trim() || (rule.location !== 'spread' && !ids.has(rule.location))) return 'problemRule';
  return null;
}

/** The configuration object sent to saveSplitStorage and previewSplitStorage. */
export function buildConfig(draft) {
  return {
    enabled: draft.enabled === true, copies: Math.max(1, Math.floor(num(draft.copies, 1))), safetyBackup: draft.safetyBackup !== false,
    locations: draft.locations.map(row => ({
      id: row.id, role: row.role === 'mirror' ? 'mirror' : 'share', kind: row.kind, label: String(row.label).trim().slice(0, 80), weight: row.role === 'mirror' ? 1 : Number(row.weight), capacityBytes: row.role === 'mirror' ? 0 : Math.max(0, Math.floor(num(row.capacityBytes))), enabled: row.enabled !== false,
      ...(row.kind === 'registry' ? { repository: String(row.repository).trim().toLowerCase() } : { path: String(row.path).trim() })
    })),
    rules: draft.rules.map(rule => ({ match: String(rule.match).trim(), location: rule.location }))
  };
}

/** Editable draft taken from a normalized status. The main location always exists. */
export function draftFromStatus(status) {
  const locations = status.locations.map(row => ({ ...row }));
  if (!locations.some(row => row.id === 'main')) locations.unshift({ id: 'main', role: 'share', kind: 'folder', label: '', path: '', repository: '', weight: 1, capacityBytes: 0, enabled: true, connected: true, removable: false, freeBytes: null, storedBytes: 0, storedParts: 0, lastError: '' });
  return { enabled: status.enabled, copies: status.copies, safetyBackup: status.safetyBackup, locations, rules: status.rules.map(rule => ({ ...rule })) };
}

export function jobPercent(job) {
  if (!job) return 0;
  if (job.totalBytes > 0) return Math.min(100, Math.round(job.completedBytes / job.totalBytes * 100));
  return job.totalParts > 0 ? Math.min(100, Math.round(job.completedParts / job.totalParts * 100)) : 0;
}
export const fill = (template, values) => String(template).replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? ''));

/** Local date and time as YYYY-MM-DD HH:mm. Empty when the value is not a date. */
export function formatTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const two = number => String(number).padStart(2, '0');
  return date.getFullYear() + '-' + two(date.getMonth() + 1) + '-' + two(date.getDate()) + ' ' + two(date.getHours()) + ':' + two(date.getMinutes());
}
