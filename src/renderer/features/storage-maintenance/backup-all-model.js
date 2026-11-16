export const BACKUP_ALL_METHODS = ['backupAllPlan', 'backupAllStart', 'backupAllStatus', 'backupAllCancel'];
export const BACKUP_SUFFIX = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
const SESSION = /^[A-Za-z0-9-]{1,64}$/;
const STATES = ['queued', 'repository', 'configuring', 'syncing', 'done', 'failed', 'cancelled'];
const PHASES = ['idle', 'running', 'finished', 'cancelled'];
const ERRORS = ['SIGN_IN_REQUIRED', 'REPOSITORY_CREATE_DENIED', 'REPOSITORY_PRIVATE', 'REPOSITORY_NOT_WRITABLE', 'PROVIDER_UNAVAILABLE', 'AUTHENTICATION_REQUIRED', 'CANCELLED', 'BUSY', 'SYNC_FAILED', 'LOCKED', 'INVALID_NAME'];
const REASONS = [null, 'locked', 'no-storage', 'not-folder'];
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';

export function validBackupSuffix(value) { return typeof value === 'string' && value.length >= 1 && value.length <= 100 && BACKUP_SUFFIX.test(value); }

/** Bounded view of the host's drive plan. Unknown shapes throw so the panel shows an honest unavailable state. */
export function backupAllPlan(value) {
  if (!value || !Array.isArray(value.drives) || value.drives.length > 100) throw Error('invalidPlan');
  const seen = new Set();
  return { running: value.running === true, drives: value.drives.map(row => {
    if (!row || typeof row.sessionId !== 'string' || !SESSION.test(row.sessionId) || seen.has(row.sessionId) || !REASONS.includes(row.ineligibleReason ?? null) || typeof row.suffix !== 'string' || row.suffix.length > 100) throw Error('invalidPlan');
    seen.add(row.sessionId);
    const configured = row.configured && typeof row.configured.repository === 'string' ? { repository: text(row.configured.repository, 220), visibility: row.configured.visibility === 'private' ? 'private' : 'public', enabled: row.configured.enabled === true } : null;
    return { sessionId: row.sessionId, name: text(row.name, 80), letter: text(row.letter, 8), locked: row.locked === true, ineligibleReason: row.ineligibleReason ?? null,
      suffix: row.suffix, configured, lastSync: time(row.lastSync), nextSync: time(row.nextSync) };
  }) };
}
export function backupAllStatus(value) {
  if (!value || !PHASES.includes(value.phase) || !Array.isArray(value.drives) || value.drives.length > 100) throw Error('invalidStatus');
  return { phase: value.phase, startedAt: time(value.startedAt), finishedAt: time(value.finishedAt), drives: value.drives.map(row => {
    if (!row || typeof row.sessionId !== 'string' || !SESSION.test(row.sessionId) || !STATES.includes(row.state)) throw Error('invalidStatus');
    const code = row.error && ERRORS.includes(row.error.code) ? row.error.code : row.error ? 'SYNC_FAILED' : null;
    return { sessionId: row.sessionId, name: text(row.name, 80), repository: text(row.repository, 220), visibility: row.visibility === 'private' ? 'private' : 'public', state: row.state, errorCode: code,
      digest: typeof row.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(row.digest) ? row.digest : null, lastSync: time(row.lastSync), nextSync: time(row.nextSync) };
  }) };
}
export const defaultBackupSelection = plan => new Set(plan.drives.filter(row => !row.ineligibleReason).map(row => row.sessionId));
export function backupSummary(status) {
  const total = status.drives.length, done = status.drives.filter(row => row.state === 'done').length;
  const failed = status.drives.filter(row => row.state === 'failed').length, cancelled = status.drives.filter(row => row.state === 'cancelled').length;
  const finished = done + failed + cancelled;
  return { total, done, failed, cancelled, finished, percent: total ? Math.round(finished / total * 100) : 0 };
}
export const fill = (template, values) => String(template).replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? ''));
