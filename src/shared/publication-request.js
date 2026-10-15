// Desktop copy of the publication note sanitizer and request validator. The browser extension keeps an identical copy
// (browser-extension/publishing.js); a test compares the two on shared vectors. The desktop validates every request
// again because the browser is never trusted to have sanitized it.

export const DESTINATIONS = Object.freeze(['discussion-comment', 'project-item-status', 'publication-draft']);
export const PROJECT_STATUSES = Object.freeze(['todo', 'in-progress', 'done']);
export const RESULT_STATES = Object.freeze(['approved', 'rejected', 'busy', 'unavailable']);
export const LIMITS = Object.freeze({note: 2000, links: 5, link: 500});
export const REQUEST_TIMEOUT_MS = 45000;

const PATH_MARK = '[local path]', SECRET_MARK = '[secret removed]', EMAIL_MARK = '[email removed]', USER_MARK = '[user removed]';
const SECRET_KEY = 'pass(?:word|wd|phrase)?|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credential|authorization|cookie';
const QUERY_KEY = SECRET_KEY + '|auth|session|signature|sig|key|code|jwt';
const RULES = [
  // Credentials inside a URL, then well-known token shapes, then labelled secrets, then long opaque strings.
  ['secrets', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/giu, SECRET_MARK + '@'],
  ['secrets', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/gu, SECRET_MARK],
  ['secrets', /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/giu, 'Bearer ' + SECRET_MARK],
  ['secrets', new RegExp('\\b(' + SECRET_KEY + ')(\\s*[:=]\\s*)(?!(?:(?:Bearer|Basic)\\s+)?\\[secret removed\\])(?:(?:Bearer|Basic)\\s+)?(?:"[^"\\n]*"|\'[^\'\\n]*\'|[^\\s,;&]+)', 'giu'), '$1$2' + SECRET_MARK],
  ['secrets', /\b(?=[A-Za-z0-9+/_=-]*[A-Za-z])(?=[A-Za-z0-9+/_=-]*\d)[A-Za-z0-9+/_=-]{32,}\b/gu, SECRET_MARK],
  ['emails', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b/gu, EMAIL_MARK],
  ['paths', /\bfile:\/\/\/?[^\s"'<>)\]]+/giu, PATH_MARK],
  ['paths', /\\\\[A-Za-z0-9._$-]+\\[^\s"'<>|)\]]+/gu, PATH_MARK],
  ['paths', /\b[A-Za-z]:[\\/][^\s"'<>|:*?)\]]*/gu, PATH_MARK],
  ['paths', /%(?:USERPROFILE|APPDATA|LOCALAPPDATA|HOMEPATH|TEMP)%[\\/][^\s"'<>|)\]]*/giu, PATH_MARK],
  ['paths', /(?<![A-Za-z0-9_.:/-])(?:~\/[^\s"'<>|)\]]*|\/(?:home|Users|root|mnt|var|tmp|etc|opt|private)(?:\/[^\s"'<>|)\]]*)?)/gu, PATH_MARK],
  ['users', /\b(user(?:name)?|login)(\s*[:=]\s*)(?!\[user removed\])[^\s,;]+/giu, '$1$2' + USER_MARK],
];

/** Removes local paths, user names, email addresses and token-like strings. `wording` is the person's own wording
 * list ([original, replacement] pairs); a replacement is turned back into its original so private wording does not
 * reach a publication. The result is idempotent: sanitizing it again changes nothing. */
export function sanitizeNote(input, {wording = []} = {}) {
  const redactions = {paths: 0, emails: 0, secrets: 0, users: 0, wording: 0, truncated: false};
  let text = typeof input === 'string' ? input : '';
  text = text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '');
  for (const [original, replacement] of Array.isArray(wording) ? wording : []) {
    if (typeof original !== 'string' || typeof replacement !== 'string' || !replacement || original === replacement) continue;
    const parts = text.split(replacement);
    if (parts.length > 1) { redactions.wording += parts.length - 1; text = parts.join(original); }
  }
  for (const [kind, pattern, mark] of RULES) text = text.replace(pattern, (match, ...groups) => { redactions[kind]++; return mark.replace(/\$(\d)/g, (_, n) => typeof groups[n - 1] === 'string' ? groups[n - 1] : ''); });
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length > LIMITS.note) { text = text.slice(0, LIMITS.note).trimEnd(); redactions.truncated = true; }
  return {text, redactions};
}

const SECRET_QUERY = new RegExp('^(?:' + QUERY_KEY + ')$', 'iu');
/** An evidence link must be an https address with a public-looking host, no credentials and no secret-like query. */
export function validateLink(value) {
  if (typeof value !== 'string' || !value || value.length > LIMITS.link || /[\s\u0000-\u001f\u007f-\u009f]/u.test(value)) return {error: 'invalid'};
  let url;
  try { url = new URL(value); } catch { return {error: 'invalid'}; }
  if (url.protocol !== 'https:') return {error: 'https'};
  if (url.username || url.password) return {error: 'credentials'};
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return {error: 'host'};
  for (const key of url.searchParams.keys()) if (SECRET_QUERY.test(key)) return {error: 'secret'};
  if (sanitizeNote(url.href).redactions.secrets > 0) return {error: 'secret'};
  return {url: url.href};
}

/** Parses one link per line. Returns normalized links plus the first problem, so the form can say which line to fix. */
export function parseLinks(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > LIMITS.links) return {links: [], error: 'count'};
  const links = [];
  for (const [index, line] of lines.entries()) {
    const result = validateLink(line);
    if (result.error) return {links: [], error: result.error, line: index + 1};
    if (!links.includes(result.url)) links.push(result.url);
  }
  return {links};
}

/** Builds the exact request the desktop receives. Nothing but sanitized text and checked links is included. */
export function buildRequest({destination, note, links, projectStatus = null, wording = []} = {}) {
  if (!DESTINATIONS.includes(destination)) return {error: 'destination'};
  const clean = sanitizeNote(note, {wording});
  if (!clean.text) return {error: 'note'};
  const parsed = typeof links === 'string' ? parseLinks(links) : {links: Array.isArray(links) ? links : []};
  if (parsed.error) return {error: 'links', detail: parsed};
  if (destination === 'project-item-status' && !PROJECT_STATUSES.includes(projectStatus)) return {error: 'status'};
  const request = {destination, note: clean.text, links: parsed.links, projectStatus: destination === 'project-item-status' ? projectStatus : null};
  const checked = validateRequest(request);
  return checked.ok ? {request, redactions: clean.redactions} : {error: 'invalid'};
}

const KEYS = 'destination,links,note,projectStatus';
/** Strict shape check used before sending and again in the service worker. A note that would still be changed by the
 * sanitizer is refused, so an unsanitized note can never be sent. */
export function validateRequest(request) {
  const fail = reason => ({ok: false, reason});
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.getPrototypeOf(request) !== Object.prototype || Object.keys(request).sort().join(',') !== KEYS) return fail('shape');
  if (!DESTINATIONS.includes(request.destination)) return fail('destination');
  if (typeof request.note !== 'string' || !request.note || request.note.length > LIMITS.note) return fail('note');
  if (sanitizeNote(request.note).text !== request.note) return fail('unsanitized');
  if (!Array.isArray(request.links) || request.links.length > LIMITS.links) return fail('links');
  for (const link of request.links) { const result = validateLink(link); if (result.error || result.url !== link) return fail('links'); }
  if (new Set(request.links).size !== request.links.length) return fail('links');
  if (request.destination === 'project-item-status' ? !PROJECT_STATUSES.includes(request.projectStatus) : request.projectStatus !== null) return fail('status');
  return {ok: true};
}

