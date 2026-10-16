// Personal wording: a bounded local JSON file that swaps interface words for
// the user's own. It applies to interface copy only, never to notes, exports or
// anything sent to the desktop, and clearing it restores the original copy.

export const vocabularyKey = 'mfe-extension-vocabulary-v1';
const MAX_BYTES = 32768, MAX_ENTRIES = 200, MAX_TEXT = 60;
const plain = text => typeof text === 'string' && text.length >= 1 && text.length <= MAX_TEXT && text === text.trim() && !/[\u0000-\u001f\u007f-\u009f<>-]/.test(text);

const MAX_NAME = 40;
const plainName = text => typeof text === 'string' && text.length >= 1 && [...text].length <= MAX_NAME && text === text.trim() && !/[\u0000-\u001f\u007f-\u009f<>]/.test(text);

/** Parses a wording file all or nothing: any invalid entry rejects the whole file. */
export function parseVocabulary(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES) return {error: 'Use a wording file of 32 KB or less.'};
  let value;
  try { value = JSON.parse(text); } catch { return {error: 'The file is not valid JSON.'}; }
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1 || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries)) return {error: 'Use {"schemaVersion":1,"entries":{"original":"replacement"}}.'};
  const entries = Object.entries(value.entries);
  if (!entries.length || entries.length > MAX_ENTRIES) return {error: 'Include between 1 and 200 entries.'};
  if (!entries.every(([from, to]) => plain(from) && plain(to))) return {error: 'Each entry needs plain text of 60 characters or fewer.'};
  // Optional headline for the celebration: plain text, never applied as wording.
  if (Object.hasOwn(value, 'displayName') && !plainName(value.displayName)) return {error: 'The display name needs plain text of 40 characters or fewer.'};
  return {entries: entries.sort((a, b) => b[0].length - a[0].length), displayName: value.displayName};
}

export function readVocabulary(storage) {
  try { const stored = storage?.getItem(vocabularyKey); if (!stored) return []; const parsed = parseVocabulary(stored); return parsed.entries || []; } catch { return []; }
}
export function saveVocabulary(storage, text) { const parsed = parseVocabulary(text); if (parsed.error) return parsed; try { storage.setItem(vocabularyKey, text); } catch { return {error: 'The wording could not be saved in this browser.'}; } return parsed; }
export function clearVocabulary(storage) { try { storage?.removeItem(vocabularyKey); return true; } catch { return false; } }

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Applies wording to one piece of interface copy: whole words for Latin text, exact text otherwise. */
export function applyVocabulary(text, entries) {
  // Placeholders first, replacements last, so one entry's replacement is never rewritten by another entry.
  // Marks use private-use characters, which no entry can contain or match.
  let result = String(text).replace(/[-]/g, '');
  const list = entries || [];
  list.forEach(([from], index) => {
    const mark = '' + String.fromCharCode(0xE100 + index) + '';
    result = /^[\p{Script=Latin}\d ]+$/u.test(from)
      ? result.replace(new RegExp(`(?<![\\p{L}\\d])${escape(from)}(?![\\p{L}\\d])`, 'gu'), mark)
      : result.split(from).join(mark);
  });
  return result.replace(/([-])/g, (match, code) => list[code.charCodeAt(0) - 0xE100]?.[1] ?? '');
}
