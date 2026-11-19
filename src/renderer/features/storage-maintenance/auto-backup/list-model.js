/**
 * Pure view model for the Docker Hub backup drive list: which bucket each drive belongs to, the filter chips with live
 * counts, the name search (plain or regular expression), the sort orders and the summary figures. Every value comes from
 * the host's automatic backup status; nothing is invented, and a figure that is not known stays null.
 */
import {driveState, progressPercent, TAG_LIMIT} from './model.js';
import {progressView} from '../registry-progress.js';

export const FILTERS = Object.freeze(['all', 'attention', 'running', 'queued', 'ok']);
export const SORTS = Object.freeze(['attention', 'name', 'last', 'size']);
export const PART_SIZE_MIB = 80;

/** One bucket per drive: running, attention, queued, ok, or off (backup switched off or no encrypted storage). */
export function bucketOf(drive) {
  if (drive.phase === 'unavailable' || !drive.enabled) return 'off';
  if (drive.phase === 'backing-up' || drive.phase === 'paused') return 'running';
  if (drive.phase === 'needs-attention' || drive.phase === 'waiting-connection' || drive.lastError) return 'attention';
  if (drive.queuedBehind || drive.dirty || !drive.lastBackup) return 'queued';
  return 'ok';
}

/** A drive's stored size in bytes when the host reports one, otherwise null. */
export const sizeOf = drive => [drive.storedBytes, drive.sizeBytes, drive.totalBytes].find(value => Number.isFinite(value) && value >= 0) ?? null;

/** Counts for every chip, over the whole list (search does not change them). */
export function filterCounts(drives = []) {
  const counts = {all: drives.length, attention: 0, running: 0, queued: 0, ok: 0};
  for (const drive of drives) { const bucket = bucketOf(drive); if (bucket in counts) counts[bucket]++; }
  return counts;
}

/**
 * Builds the name matcher. Returns {test, error}: with the regular expression switch on, an invalid pattern gives
 * error = true and a matcher that accepts nothing, and never throws.
 */
export function nameMatcher(query, regex) {
  const text = String(query ?? '');
  if (!text) return {test: () => true, error: false};
  if (!regex) { const needle = text.toLowerCase(); return {test: name => String(name ?? '').toLowerCase().includes(needle), error: false}; }
  try { const pattern = new RegExp(text, 'i'); return {test: name => pattern.test(String(name ?? '')), error: false}; }
  catch { return {test: () => false, error: true}; }
}

const byName = (a, b) => String(a.name || a.sessionId).localeCompare(String(b.name || b.sessionId));
const ATTENTION_ORDER = {attention: 0, running: 1, queued: 2, ok: 3, off: 4};
const lastTime = drive => { const time = Date.parse(drive.lastBackup ?? ''); return Number.isFinite(time) ? time : -Infinity; };

export const SORTERS = Object.freeze({
  attention: (a, b) => ATTENTION_ORDER[bucketOf(a)] - ATTENTION_ORDER[bucketOf(b)] || byName(a, b),
  name: byName,
  last: (a, b) => lastTime(b) - lastTime(a) || byName(a, b),
  size: (a, b) => (sizeOf(b) ?? -1) - (sizeOf(a) ?? -1) || byName(a, b)
});

/** The visible list: filter chip, name search, then sort. Returns {rows, error}. */
export function visibleDrives(drives = [], {filter = 'all', query = '', regex = false, sort = 'attention'} = {}) {
  const matcher = nameMatcher(query, regex);
  const order = SORTERS[sort] || SORTERS.attention;
  const rows = drives.filter(drive => (filter === 'all' || bucketOf(drive) === filter) && matcher.test(drive.name || drive.sessionId)).sort(order);
  return {rows, error: matcher.error};
}

/** Summary figures: drive count, up to date, stored bytes (null when no drive reports one) and tag usage when known. */
export function listSummary(drives = []) {
  const sizes = drives.map(sizeOf).filter(value => value !== null);
  const tags = drives.filter(drive => drive.repository && Number.isSafeInteger(drive.tagCount));
  const perRepository = new Map();
  for (const drive of tags) perRepository.set(drive.repository, Math.max(perRepository.get(drive.repository) ?? 0, drive.tagCount));
  return {
    drives: drives.length,
    upToDate: drives.filter(drive => bucketOf(drive) === 'ok').length,
    storedBytes: sizes.length ? sizes.reduce((sum, value) => sum + value, 0) : null,
    tagsUsed: perRepository.size ? [...perRepository.values()].reduce((sum, value) => sum + value, 0) : null,
    tagLimit: perRepository.size * TAG_LIMIT
  };
}

/** The pinned strip's facts for the drive backing up now, or null when nothing runs. */
export function runningStrip(status, now = Date.now()) {
  const drive = status?.drives?.find(item => item.phase === 'backing-up');
  if (!drive) return null;
  const view = progressView(drive.progress, now);
  const percent = view?.percent ?? progressPercent(drive.progress);
  return {
    sessionId: drive.sessionId, name: drive.name || drive.sessionId,
    step: view?.step ?? null, phase: view?.phase ?? null, unit: view?.unit ?? null,
    done: view?.done ?? null, total: view?.total ?? null,
    percent, rate: view?.rate ?? null, remainingMs: view?.remainingMs ?? null
  };
}

/** Avatar letter for a drive row. */
export const avatarLetter = drive => (String(drive.name || drive.sessionId || '?').trim()[0] || '?').toUpperCase();

export {driveState};
