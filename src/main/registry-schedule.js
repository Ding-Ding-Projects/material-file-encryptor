const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
export const DEFAULT_REGISTRY_SCHEDULE = Object.freeze({ enabled: false, mode: 'interval', intervalMinutes: 60,
  days: [0, 1, 2, 3, 4, 5, 6], times: ['02:00'], timeZone: 'UTC', missed: 'run-once', retryMinutes: 15, background: false });
export function validateRegistrySchedule(value) {
  if (!exact(value, Object.keys(DEFAULT_REGISTRY_SCHEDULE)) || typeof value.enabled !== 'boolean' || typeof value.background !== 'boolean' ||
      !['interval', 'calendar'].includes(value.mode) || !['run-once', 'skip'].includes(value.missed) ||
      !Number.isInteger(value.intervalMinutes) || value.intervalMinutes < 5 || value.intervalMinutes > 10080 ||
      !Number.isInteger(value.retryMinutes) || value.retryMinutes < 5 || value.retryMinutes > 1440 ||
      !Array.isArray(value.days) || !value.days.length || value.days.length > 7 || new Set(value.days).size !== value.days.length || value.days.some(day => !Number.isInteger(day) || day < 0 || day > 6) ||
      !Array.isArray(value.times) || !value.times.length || value.times.length > 96 || new Set(value.times).size !== value.times.length || value.times.some(time => typeof time !== 'string' || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) ||
      typeof value.timeZone !== 'string' || value.timeZone.length > 100) throw Error('Invalid registry schedule.');
  try { new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).format(); } catch { throw Error('Invalid schedule time zone.'); }
  return structuredClone(value);
}
/** UTC scanning makes skipped and repeated local times explicit without changing host settings. */
export function nextRegistryRun(schedule, after, consumedOccurrence = null) {
  const value = validateRegistrySchedule(schedule), timestamp = Number(after);
  if (!Number.isFinite(timestamp)) throw Error('Invalid schedule timestamp.');
  if (!value.enabled) return null;
  if (value.mode === 'interval') return timestamp + value.intervalMinutes * 60000;
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: value.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let at = Math.floor(timestamp / 60000) * 60000 + 60000, end = at + 15 * 86400000; at < end; at += 60000) {
    const parts = Object.fromEntries(formatter.formatToParts(at).map(part => [part.type, part.value]));
    const occurrence = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    if (occurrence !== consumedOccurrence && value.days.includes(days.indexOf(parts.weekday)) && value.times.includes(`${parts.hour}:${parts.minute}`)) return at;
  }
  throw Error('No schedule occurrence found.');
}
export function registryOccurrence(schedule, timestamp) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: schedule.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(formatter.formatToParts(timestamp).map(part => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
