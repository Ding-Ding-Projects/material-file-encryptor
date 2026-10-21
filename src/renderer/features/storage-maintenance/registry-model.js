export const REGISTRY_METHODS = ['registryStorageStatus', 'configureRegistryStorage', 'syncRegistryStorage', 'listRegistrySnapshots', 'restoreRegistrySnapshot', 'cancelRegistryStorage'];
export const DEFAULT_SCHEDULE = Object.freeze({ enabled: false, mode: 'interval', intervalMinutes: 60, days: [0, 1, 2, 3, 4, 5, 6], times: ['02:00'], timeZone: 'UTC', missed: 'run-once', retryMinutes: 15, background: false });
export const DIGEST = /^sha256:[a-f0-9]{64}$/;
const REPOSITORY = /^(?:docker\.io\/)?[a-z0-9][a-z0-9_-]{1,38}\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
export function registrySource(state) { return String(state?.storageDir || ''); }
export function registryDraft(configuration) {
  const schedule = { ...DEFAULT_SCHEDULE, ...configuration?.schedule };
  return { ...schedule, repository: configuration?.repository || '', visibility: configuration ? configuration.visibility ?? 'private' : 'public', days: [...schedule.days], times: schedule.times.join(', ') };
}
export function registryConfiguration(draft) {
  const invalid = field => { const error = new Error(`invalid_${field}`); error.field = field; throw error; };
  const repository = String(draft.repository || '').trim();
  if (repository.length > 220 || !REPOSITORY.test(repository)) invalid('repository');
  if(!['public','private'].includes(draft.visibility))invalid('visibility');
  if (!['interval', 'calendar'].includes(draft.mode)) invalid('mode');
  const intervalMinutes = Number(draft.intervalMinutes), retryMinutes = Number(draft.retryMinutes);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 10080) invalid('intervalMinutes');
  if (!Number.isInteger(retryMinutes) || retryMinutes < 5 || retryMinutes > 1440) invalid('retryMinutes');
  const days = [...new Set(draft.days)];
  if (!days.length || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) invalid('days');
  const times = [...new Set(String(draft.times).split(',').map(value => value.trim()))];
  if (!times.length || times.length > 48 || times.some(value => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))) invalid('times');
  const timeZone = String(draft.timeZone || '').trim();
  try { if (!timeZone || timeZone.length > 100) throw Error(); new Intl.DateTimeFormat('en', { timeZone }); } catch { invalid('timeZone'); }
  if (!['run-once', 'skip'].includes(draft.missed)) invalid('missed');
  return { repository: repository.replace(/^docker\.io\//, ''), visibility:draft.visibility, schedule: { enabled: Boolean(draft.enabled), mode: draft.mode, intervalMinutes, days, times, timeZone, missed: draft.missed, retryMinutes, background: Boolean(draft.background) } };
}
export function registryBusy(status) {
  return Boolean(status && !['idle', 'ready', 'completed', 'verified', 'incomplete', 'cancelled', 'failed', 'error', 'unverified', 'disabled', 'unconfigured'].includes(status.state));
}
export function registrySnapshots(value) {
  if (!Array.isArray(value) || value.length > 1000) throw Error('invalidSnapshots');
  const seen = new Set();
  return value.map(row => {
    if (!row || !DIGEST.test(row.digest) || seen.has(row.digest) || typeof row.tag !== 'string' || row.tag.length > 256 ||
      !row.snapshot || typeof row.snapshot.vaultId !== 'string' || row.snapshot.vaultId.length > 128 ||
      typeof row.snapshot.deviceId !== 'string' || row.snapshot.deviceId.length > 128 ||
      !Array.isArray(row.snapshot.parents) || row.snapshot.parents.length > 1000 || row.snapshot.parents.some(value => !DIGEST.test(value)) ||
      !Number.isSafeInteger(row.snapshot.fileCount) || row.snapshot.fileCount < 0) throw Error('invalidSnapshots');
    seen.add(row.digest);
    return { digest: row.digest, tag: row.tag, snapshot: { vaultId: row.snapshot.vaultId, deviceId: row.snapshot.deviceId, parents: [...row.snapshot.parents], fileCount: row.snapshot.fileCount } };
  });
}
