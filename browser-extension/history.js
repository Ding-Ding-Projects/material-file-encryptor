// Local history of setting changes in this extension origin. Only the named
// settings below are recorded; tab moves, pairing state and anything secret are not.

export const historyKey = 'mfe-extension-history-v1';
export const HISTORY_FIELDS = Object.freeze(['language', 'theme', 'funnyEnglish', 'funnyCantonese', 'emoji', 'displayName', 'accent']);
const LIMIT = 50;

const validEntry = entry => entry && typeof entry === 'object' && !Array.isArray(entry)
  && Object.keys(entry).sort().join(',') === 'at,field,from,id,to'
  && typeof entry.id === 'string' && /^[0-9a-z]{1,24}$/.test(entry.id)
  && typeof entry.at === 'string' && !Number.isNaN(Date.parse(entry.at))
  && HISTORY_FIELDS.includes(entry.field)
  && ['string', 'number', 'boolean'].includes(typeof entry.from) && ['string', 'number', 'boolean'].includes(typeof entry.to)
  && String(entry.from).length <= 60 && String(entry.to).length <= 60;

/** Reads the history, newest first; anything malformed is discarded rather than trusted. */
export function readHistory(storage) {
  try {
    const raw = storage?.getItem(historyKey);
    if (!raw || raw.length > 16384) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validEntry).slice(0, LIMIT) : [];
  } catch { return []; }
}

/** Records the recorded fields that differ between two preference values. */
export function recordChanges(storage, before, after, now = new Date()) {
  const entries = HISTORY_FIELDS.filter(field => before[field] !== after[field]).map((field, index) => ({
    id: now.getTime().toString(36) + index.toString(36), at: now.toISOString(), field, from: before[field], to: after[field],
  }));
  if (!entries.length) return readHistory(storage);
  const next = [...entries.reverse(), ...readHistory(storage)].slice(0, LIMIT);
  try { storage?.setItem(historyKey, JSON.stringify(next)); } catch {}
  return next;
}

/** Clears the history; returns whether the store accepted the change. */
export function clearHistory(storage) {
  try { storage?.removeItem(historyKey); return true; } catch { return false; }
}
