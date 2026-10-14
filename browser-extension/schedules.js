// Dated setting changes for this browser. Each schedule names one setting, one
// allowed value and a moment in UTC; due and overdue schedules are applied in order.

export const schedulesKey = 'mfe-extension-schedules-v1';
export const SCHEDULE_VALUES = Object.freeze({theme: ['system', 'light', 'dark'], language: ['en', 'yue', 'bilingual']});
const LIMIT = 20;

const valid = item => item && typeof item === 'object' && !Array.isArray(item)
  && Object.keys(item).sort().join(',') === 'at,createdAt,field,id,value'
  && typeof item.id === 'string' && /^[0-9a-z]{1,24}$/.test(item.id)
  && Object.hasOwn(SCHEDULE_VALUES, item.field) && SCHEDULE_VALUES[item.field].includes(item.value)
  && !Number.isNaN(Date.parse(item.at)) && !Number.isNaN(Date.parse(item.createdAt));

export function readSchedules(storage) {
  try { const parsed = JSON.parse(storage?.getItem(schedulesKey) || '[]'); return Array.isArray(parsed) ? parsed.filter(valid).slice(0, LIMIT).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)) : []; } catch { return []; }
}
const write = (storage, list) => storage.setItem(schedulesKey, JSON.stringify(list));

/** Adds a schedule; returns {schedule} or {error}. Times in the past and same-minute clashes are refused. */
export function addSchedule(storage, {field, value, at}, now = new Date()) {
  if (!Object.hasOwn(SCHEDULE_VALUES, field) || !SCHEDULE_VALUES[field].includes(value)) return {error: 'Choose a setting and a value.'};
  const when = Date.parse(at);
  if (Number.isNaN(when)) return {error: 'Choose a date and time.'};
  if (when <= now.getTime() + 30000) return {error: 'Choose a time at least one minute from now.'};
  const list = readSchedules(storage);
  if (list.length >= LIMIT) return {error: 'Cancel a scheduled change first; 20 is the limit.'};
  if (list.some(item => item.field === field && Math.floor(Date.parse(item.at) / 60000) === Math.floor(when / 60000))) return {error: 'Another change to this setting is already scheduled for that minute.'};
  const schedule = {id: now.getTime().toString(36) + Math.floor(Math.random() * 1296).toString(36), field, value, at: new Date(when).toISOString(), createdAt: now.toISOString()};
  try { write(storage, [...list, schedule]); } catch { return {error: 'The schedule could not be saved in this browser.'}; }
  return {schedule};
}

export function cancelSchedule(storage, id) {
  const list = readSchedules(storage);
  if (!list.some(item => item.id === id)) return false;
  try { write(storage, list.filter(item => item.id !== id)); return true; } catch { return false; }
}

/** Removes and returns every schedule that is due, oldest first, marking those more than a minute late as overdue. */
export function takeDue(storage, now = new Date()) {
  const list = readSchedules(storage), due = list.filter(item => Date.parse(item.at) <= now.getTime());
  if (!due.length) return [];
  try { write(storage, list.filter(item => !due.includes(item))); } catch { return []; }
  return due.map(item => ({...item, overdue: now.getTime() - Date.parse(item.at) > 60000}));
}

/** Describes the local time zone, so a schedule's time is never ambiguous. */
export function timeZoneLabel(date = new Date()) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  const offset = -date.getTimezoneOffset(), sign = offset >= 0 ? '+' : '-', hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0'), minutes = String(Math.abs(offset) % 60).padStart(2, '0');
  return `${zone} (UTC${sign}${hours}:${minutes})`;
}
