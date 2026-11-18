// Turns the main process progress record into what the storage page shows: the step, its counts,
// a determinate fraction when a total is known, the elapsed time and a note when a step runs long.

// How long each step normally takes before the page says it is taking longer than usual (milliseconds).
export const SLOW_AFTER_MS = Object.freeze({
  discovering: 60000, 'waiting-drive': 60000, downloading: 5 * 60000, applying: 3 * 60000,
  preparing: 10 * 60000, uploading: 15 * 60000, verifying: 2 * 60000, restoring: 10 * 60000,
});
export const STEP_KEYS = Object.freeze(['discovering', 'waiting-drive', 'downloading', 'applying', 'preparing', 'uploading', 'verifying', 'restoring']);
const count = value => Number.isSafeInteger(value) && value >= 0;

export function formatBytes(bytes, locale = 'en') {
  if (!count(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB']; let value = bytes, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)} ${units[unit]}`;
}
export function formatCount(value, locale = 'en') { return count(value) ? new Intl.NumberFormat(locale).format(value) : ''; }
/** Elapsed time as a clock (m:ss or h:mm:ss), which reads the same in every display language. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
/** A local date and time for a stored epoch in milliseconds; null when the value is not a time. */
export function formatTimestamp(value, locale = 'en') {
  const ms = typeof value === 'string' ? Date.parse(value) : value;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));
}

/**
 * progress: { step, phase, unit, completedFiles, totalFiles, completedBytes, totalBytes, stepStartedAt, startedAt, pendingCommits }
 * Returns null when there is no usable step.
 */
export function progressView(progress, nowMs = Date.now()) {
  const step = STEP_KEYS.includes(progress?.step) ? progress.step : null;
  if (!step) return null;
  const unit = ['parts', 'files', 'commits'].includes(progress.unit) ? progress.unit : 'files';
  const done = count(progress.completedFiles) ? progress.completedFiles : null;
  const total = count(progress.totalFiles) && progress.totalFiles > 0 ? progress.totalFiles : null;
  const bytesDone = count(progress.completedBytes) ? progress.completedBytes : null;
  const bytesTotal = count(progress.totalBytes) && progress.totalBytes > 0 ? progress.totalBytes : null;
  let fraction = null;
  if (bytesTotal !== null && bytesDone !== null) fraction = Math.min(1, bytesDone / bytesTotal);
  else if (total !== null && done !== null) fraction = Math.min(1, done / total);
  const started = Number.isFinite(progress.stepStartedAt) ? progress.stepStartedAt : null;
  const elapsedMs = started === null ? null : Math.max(0, nowMs - started);
  const totalElapsedMs = Number.isFinite(progress.startedAt) ? Math.max(0, nowMs - progress.startedAt) : null;
  const slow = elapsedMs !== null && elapsedMs >= SLOW_AFTER_MS[step];
  const phase = ['copying', 'checking', 'checking-copy', 'staging', 'waiting-drive'].includes(progress.phase) ? progress.phase : null;
  return { step, phase, unit, done, total, bytesDone, bytesTotal, fraction, elapsedMs, totalElapsedMs, slow,
    pendingCommits: count(progress.pendingCommits) ? progress.pendingCommits : null };
}
