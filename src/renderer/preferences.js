export const UNITS = Object.freeze({ KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 });
export function parsePartSize(value, unit) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text) || !Object.hasOwn(UNITS, unit)) throw new Error('Enter a positive number and choose KB, MB or GB.');
  const bytes = Number(text) * UNITS[unit];
  if (!Number.isSafeInteger(bytes) || bytes < UNITS.KB || bytes > UNITS.GB) throw new Error('Part size must be a whole number of bytes between 1 KB and 1 GB (1024-based units).');
  return bytes;
}
export function displayPartSize(bytes) {
  for (const unit of ['GB', 'MB', 'KB']) {
    if (bytes >= UNITS[unit] && Number.isInteger(bytes / UNITS[unit])) return { value: String(bytes / UNITS[unit]), unit };
  }
  return { value: String(bytes / UNITS.KB), unit: 'KB' };
}
export function parseVocabulary(source) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > 131072) throw new Error('Vocabulary JSON must be no larger than 128 KB.');
  let value;
  try { value = JSON.parse(source); } catch { throw new Error('Choose a valid JSON file.'); }
  const exact = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
  if (!exact(value, ['version', 'replacements']) || value.version !== 1 || !Array.isArray(value.replacements) || value.replacements.length > 200) throw new Error('Use version 1 and a replacements array with at most 200 entries.');
  const seen = new Set();
  const unsafe = new Set(['__proto__', 'prototype', 'constructor']);
  for (const entry of value.replacements) {
    if (!exact(entry, ['from', 'to']) || typeof entry.from !== 'string' || typeof entry.to !== 'string' || !entry.from.trim() || entry.from.length > 120 || entry.to.length > 500 || /[\u0000-\u001f\u007f-\u009f]/u.test(entry.from + entry.to) || unsafe.has(entry.from) || unsafe.has(entry.to)) throw new Error('Each replacement needs safe from and to strings, with no extra fields or control characters (from: 1–120 characters; to: up to 500).');
    if (seen.has(entry.from)) throw new Error('Duplicate from words are not allowed.');
    seen.add(entry.from);
  }
  return value;
}
export const DEFAULT_SETTINGS = Object.freeze({ theme: 'system', language: 'en', emoji: false, celebration: 35, patience: 60, vocabulary: { version: 1, replacements: [] } });
export function loadSettings(storage) {
  const result = { ...DEFAULT_SETTINGS };
  try {
    const source = storage.getItem('material-drive.preferences.v1') || '{}';
    if (source.length > 150000) return result;
    const saved = JSON.parse(source);
    if (['system', 'light', 'dark'].includes(saved.theme)) result.theme = saved.theme;
    if (['en', 'yue', 'bilingual'].includes(saved.language)) result.language = saved.language;
    if (typeof saved.emoji === 'boolean') result.emoji = saved.emoji;
    for (const key of ['celebration', 'patience']) if (Number.isInteger(saved[key]) && saved[key] >= 0 && saved[key] <= 100) result[key] = saved[key];
    if (saved.vocabulary) result.vocabulary = parseVocabulary(JSON.stringify(saved.vocabulary));
  } catch { /* Invalid local preferences safely return to defaults. */ }
  return result;
}
