// Local support tickets. Nothing is sent anywhere: a ticket is written here,
// tracked here, and exported as a file the user chooses to share.

export const ticketsKey = 'mfe-extension-tickets-v1';
export const TICKET_LIMITS = Object.freeze({count: 30, title: 100, description: 4000, attachments: 3, attachmentBytes: 204800});
export const ATTACHMENT_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'text/plain', 'application/json']);
export const TICKET_CATEGORIES = Object.freeze(['problem', 'question', 'suggestion']);
export const TICKET_STATUSES = Object.freeze(['open', 'waiting', 'closed']);
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function checkTicket({title = '', description = '', category = ''} = {}) {
  const name = String(title).trim();
  if (!name) return 'Enter a title.';
  if (name.length > TICKET_LIMITS.title) return 'Use a title of 100 characters or fewer.';
  if (!String(description).trim()) return 'Describe what happened.';
  if (String(description).length > TICKET_LIMITS.description) return 'Use 4,000 characters or fewer.';
  if (!TICKET_CATEGORIES.includes(category)) return 'Choose a category.';
  if (CONTROL.test(name) || CONTROL.test(String(description))) return 'Remove control characters.';
  return '';
}

/** Checks a file before it is read; only the type and size are trusted at this point. */
export function checkAttachment(file, existing = []) {
  if (!file) return 'Choose a file.';
  if (existing.length >= TICKET_LIMITS.attachments) return 'Attach at most 3 files.';
  if (!ATTACHMENT_TYPES.includes(file.type)) return 'Attach PNG, JPEG, WebP, text or JSON files.';
  if (file.size > TICKET_LIMITS.attachmentBytes) return 'Attach files of 200 KB or less.';
  return '';
}

const validAttachment = item => item && typeof item.name === 'string' && item.name.length <= 120 && ATTACHMENT_TYPES.includes(item.type) && Number.isInteger(item.size) && item.size <= TICKET_LIMITS.attachmentBytes && typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:') && item.dataUrl.length <= Math.ceil(TICKET_LIMITS.attachmentBytes * 4 / 3) + 128;
const validTicket = ticket => ticket && typeof ticket === 'object' && typeof ticket.id === 'string' && /^[0-9a-z]{1,24}$/.test(ticket.id)
  && checkTicket(ticket) === '' && TICKET_STATUSES.includes(ticket.status) && typeof ticket.diagnostics === 'boolean'
  && Array.isArray(ticket.attachments) && ticket.attachments.length <= TICKET_LIMITS.attachments && ticket.attachments.every(validAttachment)
  && !Number.isNaN(Date.parse(ticket.createdAt)) && !Number.isNaN(Date.parse(ticket.updatedAt));

export function readTickets(storage) {
  try { const parsed = JSON.parse(storage?.getItem(ticketsKey) || '[]'); return Array.isArray(parsed) ? parsed.filter(validTicket).slice(0, TICKET_LIMITS.count) : []; } catch { return []; }
}
const write = (storage, list) => storage.setItem(ticketsKey, JSON.stringify(list));

/** Creates or updates a ticket; returns {ticket} or {error}, writing nothing when the ticket is invalid. */
export function saveTicket(storage, draft, now = new Date()) {
  const problem = checkTicket(draft);
  if (problem) return {error: problem};
  const attachments = Array.isArray(draft.attachments) ? draft.attachments : [];
  if (attachments.length > TICKET_LIMITS.attachments || !attachments.every(validAttachment)) return {error: 'Attach at most 3 files.'};
  const list = readTickets(storage), existing = draft.id ? list.find(item => item.id === draft.id) : null;
  if (draft.id && !existing) return {error: 'That ticket no longer exists.'};
  if (!existing && list.length >= TICKET_LIMITS.count) return {error: 'Delete a ticket before adding another; 30 is the limit.'};
  const ticket = {id: existing?.id || now.getTime().toString(36) + Math.floor(Math.random() * 1296).toString(36), title: String(draft.title).trim(), description: String(draft.description), category: draft.category, status: TICKET_STATUSES.includes(draft.status) ? draft.status : 'open', diagnostics: Boolean(draft.diagnostics), attachments, createdAt: existing?.createdAt || now.toISOString(), updatedAt: now.toISOString()};
  try { write(storage, existing ? list.map(item => item.id === ticket.id ? ticket : item) : [ticket, ...list]); } catch { return {error: 'The ticket could not be saved in this browser; attachments may be too large.'}; }
  return {ticket};
}

export function deleteTicket(storage, id) { const list = readTickets(storage); if (!list.some(item => item.id === id)) return false; try { write(storage, list.filter(item => item.id !== id)); return true; } catch { return false; } }

/** Diagnostics a user can review before sharing: build and settings only, never notes, wording, logos or credentials. */
export function diagnosticsText({version = '', sourceCommit = null, language = '', theme = '', userAgent = ''} = {}) {
  return [`Extension version: ${version}`, `Source commit: ${sourceCommit ? sourceCommit.slice(0, 12) : 'unavailable'}`, `Interface language: ${language}`, `Theme: ${theme}`, `Browser: ${String(userAgent).slice(0, 200)}`].join('\n');
}

/** The file a user can share: the ticket, its attachments and, only if chosen, the reviewed diagnostics. */
export function ticketExport(ticket, diagnostics) {
  return JSON.stringify({schemaVersion: 1, title: ticket.title, category: ticket.category, status: ticket.status, description: ticket.description, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt, attachments: ticket.attachments, ...(ticket.diagnostics ? {diagnostics} : {})}, null, 2) + '\n';
}
