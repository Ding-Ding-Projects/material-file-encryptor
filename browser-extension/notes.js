// Local notes for this browser: bounded records, a recoverable draft, and
// per-note results for actions applied to several notes at once.

export const notesKey = 'mfe-extension-notes-v1';
export const draftKey = 'mfe-extension-note-draft-v1';
export const NOTE_LIMITS = Object.freeze({title: 80, body: 4000, count: 50});
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** Returns an error message for a note, or '' when it can be saved. */
export function checkNote({title = '', body = ''} = {}) {
  const name = String(title).trim(), text = String(body);
  if (!name) return 'Enter a title.';
  if (name.length > NOTE_LIMITS.title) return 'Use a title of 80 characters or fewer.';
  if (!text.trim()) return 'Write the note before saving.';
  if (text.length > NOTE_LIMITS.body) return 'Use 4,000 characters or fewer.';
  if (CONTROL.test(name) || CONTROL.test(text)) return 'Remove control characters.';
  return '';
}

const validNote = note => note && typeof note === 'object' && !Array.isArray(note)
  && Object.keys(note).sort().join(',') === 'body,id,title,updatedAt'
  && typeof note.id === 'string' && /^[0-9a-z]{1,24}$/.test(note.id)
  && typeof note.updatedAt === 'string' && !Number.isNaN(Date.parse(note.updatedAt))
  && checkNote(note) === '';

export function readNotes(storage) {
  try { const parsed = JSON.parse(storage?.getItem(notesKey) || '[]'); return Array.isArray(parsed) ? parsed.filter(validNote).slice(0, NOTE_LIMITS.count) : []; } catch { return []; }
}

function writeNotes(storage, notes) { storage.setItem(notesKey, JSON.stringify(notes)); }

/** Saves a new note; returns {note} or {error}. Nothing is written when the note is invalid. */
export function addNote(storage, {title, body}, now = new Date()) {
  const problem = checkNote({title, body});
  if (problem) return {error: problem};
  const notes = readNotes(storage);
  if (notes.length >= NOTE_LIMITS.count) return {error: 'Delete a note before adding another; 50 is the limit.'};
  const note = {id: now.getTime().toString(36) + Math.floor(Math.random() * 1296).toString(36), title: String(title).trim(), body: String(body), updatedAt: now.toISOString()};
  try { writeNotes(storage, [note, ...notes]); } catch { return {error: 'The note could not be saved in this browser.'}; }
  return {note};
}

/** Deletes the chosen notes and reports each one: deleted, or missing because it was already gone. */
export function deleteNotes(storage, ids) {
  const notes = readNotes(storage), wanted = new Set(ids);
  const results = [...wanted].map(id => ({id, outcome: notes.some(note => note.id === id) ? 'deleted' : 'missing'}));
  try { writeNotes(storage, notes.filter(note => !wanted.has(note.id))); }
  catch { return results.map(result => ({...result, outcome: result.outcome === 'deleted' ? 'failed' : result.outcome})); }
  return results;
}

/** Splits note text into plain parts and links; only https links are marked safe to open. */
export function linkParts(text) {
  const parts = [], pattern = /\b((?:https?|ftp|file|javascript|data):[^\s<>"']+)/gi;
  let last = 0, match;
  const value = String(text);
  while ((match = pattern.exec(value))) {
    if (match.index > last) parts.push({text: value.slice(last, match.index)});
    // Trailing punctuation belongs to the sentence; a closing bracket only when the link itself has no matching opener.
    let raw = match[1].replace(/[.,;:!?]+$/, '');
    while (raw.endsWith(')') && (raw.match(/\)/g) || []).length > (raw.match(/\(/g) || []).length) raw = raw.slice(0, -1).replace(/[.,;:!?]+$/, '');
    let safe = false;
    try { const url = new URL(raw); safe = url.protocol === 'https:' && !url.username && !url.password; } catch {}
    parts.push({link: raw, safe});
    last = match.index + raw.length;
    pattern.lastIndex = last;
  }
  if (last < value.length) parts.push({text: value.slice(last)});
  return parts;
}

export function notesMarkdown(notes) { return notes.map(note => `## ${note.title}\n\n${note.body}\n`).join('\n'); }

export function readDraft(storage) {
  try { const draft = JSON.parse(storage?.getItem(draftKey) || 'null'); if (draft && typeof draft.title === 'string' && typeof draft.body === 'string' && Number.isInteger(draft.step) && draft.step >= 1 && draft.step <= 3 && draft.title.length <= NOTE_LIMITS.title * 2 && draft.body.length <= NOTE_LIMITS.body * 2) return {title: draft.title, body: draft.body, step: draft.step}; } catch {}
  return null;
}
export function saveDraft(storage, draft) { try { storage?.setItem(draftKey, JSON.stringify({title: String(draft.title || ''), body: String(draft.body || ''), step: draft.step})); } catch {} }
export function clearDraft(storage) { try { storage?.removeItem(draftKey); } catch {} }
