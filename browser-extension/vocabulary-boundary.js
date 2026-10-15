// Where personal wording may and may not appear.
//
// Imported wording is a private, local preference. It is applied to interface
// copy only after the desktop pairing is active, so a browser that is not
// paired always shows the original copy. It never reaches a boundary that
// leaves the page: exports, note files, clipboard text, the page title, logs,
// diagnostics, or anything sent to the desktop. Those paths use the original
// copy below, or carry only fixed protocol words that wording cannot change.

/** True only while the browser holds an active, approved desktop pairing. */
export const wordingActive = connection => connection === true;

/** The entries that may be applied right now: the stored entries while paired, otherwise none. */
export function entriesFor(connection, stored) {
  return wordingActive(connection) && Array.isArray(stored) ? stored : [];
}

/** Original copy in the chosen language. Personal wording is never applied. Bilingual shows English. */
export function publicCopy(pair, language) {
  return language === 'yue' ? pair[1] : pair[0];
}

/**
 * Every replacement the entries could introduce into `value`, as a boolean:
 * true when some replacement text occurs in the serialised value but the
 * original text does not. Used on records the extension itself builds, whose
 * fields are fixed words, to prove no wording reached them.
 */
export function carriesWording(value, entries) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return (entries || []).some(([from, to]) => to !== from && text.includes(to) && !text.includes(from));
}

/** Throws when a record bound for a public boundary carries imported wording. */
export function assertPublic(value, entries) {
  if (carriesWording(value, entries)) throw new Error('Personal wording must not leave this page.');
  return value;
}

