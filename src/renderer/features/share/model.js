// Pure helpers for the share dialogs. Nothing here touches the document or the bridge.
export const SHARE_LIMIT_BYTES = 1024 ** 3;
export const MIN_PASSPHRASE = 8;
const ERROR_CODES = new Set(['INVALID_KEY', 'TAMPERED', 'TRUNCATED', 'UNKNOWN_VERSION', 'WRONG_PASSPHRASE', 'COMMAND_INVALID', 'FOREIGN_HOST', 'FOREIGN_REPOSITORY', 'NOT_FOUND', 'EXPIRED',
  'SIGN_IN_REQUIRED', 'LOCKED', 'NOT_MOUNTED', 'TOO_LARGE', 'SOURCE_CHANGED', 'INVALID_NAME', 'BUSY', 'CANCELLED', 'REVOKE_UNVERIFIED', 'PROVIDER_UNAVAILABLE', 'REGISTRY_UNVERIFIED',
  'REPOSITORY_CREATE_DENIED', 'REPOSITORY_PRIVATE']);

export const fill = (text, values = {}) => String(text).replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB']; let value = bytes, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${unit ? value.toFixed(value < 10 ? 1 : 0) : value} ${units[unit]}`;
}
export function formatTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(); }

/**
 * The copy key for an error. The main process sends a stable code; Electron may wrap the message, so the code is
 * also looked for at the start of a wrapped message. Unknown errors map to one generic line, so no raw text (and
 * never a command) is ever shown.
 */
export function errorKey(error) {
  const code = error?.code ?? /\b([A-Z][A-Z_]{3,})\b/.exec(String(error?.message || ''))?.[1];
  if (ERROR_CODES.has(code)) return `error_${code}`;
  for (const candidate of ERROR_CODES) if (String(error?.message || '').includes(candidate)) return `error_${candidate}`;
  return 'error_OTHER';
}

/** Messages from the main process arrive without their code after the IPC boundary; match the fixed sentences. */
const MESSAGE_CODES = [
  ['does not open the file', 'INVALID_KEY'], ['failed its integrity check', 'TAMPERED'], ['is incomplete', 'TRUNCATED'], ['newer version of the app', 'UNKNOWN_VERSION'],
  ['passphrase does not open', 'WRONG_PASSPHRASE'], ['not a share command', 'COMMAND_INVALID'], ['other than Docker Hub', 'FOREIGN_HOST'], ['does not hold shared files', 'FOREIGN_REPOSITORY'],
  ['was not found', 'NOT_FOUND'], ['expired', 'EXPIRED'], ['Sign in to Docker Hub', 'SIGN_IN_REQUIRED'], ['Unlock the drive', 'LOCKED'], ['Mount the drive', 'NOT_MOUNTED'],
  ['larger than a share', 'TOO_LARGE'], ['changed while it was being read', 'SOURCE_CHANGED'], ['cannot be shared', 'INVALID_NAME'], ['Another file is being shared', 'BUSY'],
  ['was cancelled', 'CANCELLED'], ['has not confirmed', 'REVOKE_UNVERIFIED'], ['could not be reached', 'PROVIDER_UNAVAILABLE'], ['could not be verified on Docker Hub', 'REGISTRY_UNVERIFIED'],
  ['does not allow this account to create', 'REPOSITORY_CREATE_DENIED'], ['private repository', 'REPOSITORY_PRIVATE'],
];
export function shareErrorKey(error) {
  const direct = errorKey(error); if (direct !== 'error_OTHER') return direct;
  const message = String(error?.message || '');
  const found = MESSAGE_CODES.find(([text]) => message.includes(text));
  return found ? `error_${found[1]}` : 'error_OTHER';
}

/** Problems with the passphrase fields, as copy keys. An empty list means it is ready. */
export function passphraseProblems({ enabled, passphrase = '', confirm = '' }) {
  if (!enabled) return [];
  if ([...passphrase].length < MIN_PASSPHRASE) return ['passphraseShort'];
  if (passphrase !== confirm) return ['passphraseMismatch'];
  return [];
}

/** Whether a file can be shared from the current drive state. Returns a copy key for the reason it cannot. */
export function shareBlocker(state, file) {
  if (!state || state.locked !== false || !state.mounted) return 'needsUnlock';
  if (!file) return 'chooseFile';
  if (Number.isFinite(file.size) && file.size > SHARE_LIMIT_BYTES - 1024 * 1024) return 'tooLarge';
  return null;
}

/** A pasted value is worth sending to the main process only if it looks like a share. The main process parses it strictly. */
export function looksLikeShare(text) { return typeof text === 'string' && text.length <= 4096 && /(mfe-share:|material-file-encryptor:\/\/)/.test(text); }
