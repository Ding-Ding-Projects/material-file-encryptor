import { parseVocabulary, parseStrictJson } from '../shared/personal-vocabulary.js';
export { parseVocabulary, replaceVocabulary } from '../shared/personal-vocabulary.js';
export const UNITS = Object.freeze({ KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 });
export function parsePartSize(value, unit) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text) || !Object.hasOwn(UNITS, unit)) throw new Error('Enter a positive number and choose KB, MB or GB.');
  const bytes = Number(text) * UNITS[unit];
  if (!Number.isSafeInteger(bytes) || bytes < UNITS.KB || bytes > 90000000) throw new Error('Part size must be a whole number of bytes between 1 KiB and 90,000,000 physical bytes.');
  return bytes;
}
export function displayPartSize(bytes) {
  for (const unit of ['GB', 'MB', 'KB']) {
    if (bytes >= UNITS[unit] && Number.isInteger(bytes / UNITS[unit])) return { value: String(bytes / UNITS[unit]), unit };
  }
  return { value: String(bytes / UNITS.KB), unit: 'KB' };
}
export const DEFAULT_SETTINGS = Object.freeze({ theme: 'system', language: 'en', emoji: false, celebration: 35, patience: 60, vocabulary: { version: 1, replacements: [] } });
export function loadSettings(storage) {
  const result = { ...DEFAULT_SETTINGS };
  try {
    const source = storage.getItem('material-drive.preferences.v1') || '{}';
    if (new TextEncoder().encode(source).length > 300000) return result;
    const saved = parseStrictJson(source, 300000);
    if (['system', 'light', 'dark'].includes(saved.theme)) result.theme = saved.theme;
    if (['en', 'yue', 'bilingual'].includes(saved.language)) result.language = saved.language;
    if (typeof saved.emoji === 'boolean') result.emoji = saved.emoji;
    for (const key of ['celebration', 'patience']) if (Number.isInteger(saved[key]) && saved[key] >= 0 && saved[key] <= 100) result[key] = saved[key];
    if (saved.vocabulary) result.vocabulary = parseVocabulary(JSON.stringify(saved.vocabulary));
  } catch { /* Invalid local preferences safely return to defaults. */ }
  return result;
}
