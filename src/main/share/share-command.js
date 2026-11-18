import { SHARE_KEY_BYTES, WRAPPED_KEY_BYTES } from './share-crypto.js';

/**
 * The share command: one copyable string that names the encrypted blob and carries the key that opens it.
 *
 *   mfe-share:v1:<registry host>/<namespace>/material-file-encryptor-shares@sha256:<64 hex>#<key>
 *   material-file-encryptor://receive/v1/<registry host>/<namespace>/material-file-encryptor-shares@sha256:<64 hex>#<key>
 *
 * <key> is the 32-byte share key in unpadded base64url, or "p:" and the passphrase-wrapped key. The key is in the
 * fragment of the link form, which a browser never sends anywhere. Parsing is strict: anything unexpected is refused,
 * and errors never repeat the text that was given.
 */
export const SHARE_SCHEME = 'mfe-share';
export const SHARE_PROTOCOL = 'material-file-encryptor';
export const SHARE_REPOSITORY_NAME = 'material-file-encryptor-shares';
export const DOCKER_HUB_REGISTRY_HOST = 'registry-1.docker.io';
const NAMESPACE = /^[a-z0-9][a-z0-9_-]{1,38}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
const MAX_TEXT = 4096;
const TEST_HOST = /^(?:127\.0\.0\.1|localhost):[1-9][0-9]{0,4}$/;

export function commandError(code) {
  const messages = {
    COMMAND_INVALID: 'This is not a share command. Paste the whole command you were sent.',
    UNKNOWN_VERSION: 'This share was made by a newer version of the app. Update Material File Encryptor and try again.',
    FOREIGN_HOST: 'This share points somewhere other than Docker Hub, so it was not opened.',
    FOREIGN_REPOSITORY: 'This share points to a repository that does not hold shared files, so it was not opened.',
  };
  const error = Error(messages[code] || messages.COMMAND_INVALID);
  error.code = code;
  return error;
}

const encode = bytes => Buffer.from(bytes).toString('base64url');
function decode(text, length) {
  if (!B64URL.test(text)) return null;
  const bytes = Buffer.from(text, 'base64url');
  return bytes.length === length && encode(bytes) === text ? bytes : null;
}

/** The share repository for a Docker Hub account name. */
export function shareRepositoryFor(account) {
  const namespace = String(account || '').toLowerCase();
  if (!NAMESPACE.test(namespace)) throw commandError('COMMAND_INVALID');
  return `${namespace}/${SHARE_REPOSITORY_NAME}`;
}

export function formatShareCommand({ host = DOCKER_HUB_REGISTRY_HOST, repository, digest, key = null, wrapped = null }) {
  if (!DIGEST.test(digest || '') || typeof repository !== 'string' || !repository.endsWith('/' + SHARE_REPOSITORY_NAME) || !NAMESPACE.test(repository.split('/')[0]) || repository.split('/').length !== 2) throw commandError('COMMAND_INVALID');
  if ((key === null) === (wrapped === null)) throw commandError('COMMAND_INVALID');
  const secret = key !== null ? (key.length === SHARE_KEY_BYTES ? encode(key) : null) : (wrapped.length === WRAPPED_KEY_BYTES ? 'p:' + encode(wrapped) : null);
  if (!secret) throw commandError('COMMAND_INVALID');
  return `${SHARE_SCHEME}:v1:${host}/${repository}@${digest}#${secret}`;
}

/** The same share as a link that opens the app. */
export function shareLink(command) {
  const parsed = parseShareCommand(command, { allowTestHosts: true });
  return `${SHARE_PROTOCOL}://receive/v1/${parsed.host}/${parsed.repository}@${parsed.digest}#${command.slice(command.indexOf('#') + 1)}`;
}

/** A command line the recipient can paste into a terminal. The install path is the per-user Squirrel stub. */
export function shareCommandLine(command) {
  parseShareCommand(command, { allowTestHosts: true });
  return `"%LOCALAPPDATA%\\MaterialFileEncryptor\\MaterialFileEncryptor.exe" --receive "${command}"`;
}

/**
 * Finds the one share in pasted text: the command itself, its link form, or a command line containing either.
 *   allowTestHosts  admits a loopback registry; only the main process's explicit test capability sets it.
 */
export function parseShareCommand(text, { allowTestHosts = false } = {}) {
  if (typeof text !== 'string' || text.length > MAX_TEXT || /[\x00-\x08\x0e-\x1f\x7f]/.test(text)) throw commandError('COMMAND_INVALID');
  const found = [...text.matchAll(/(?:mfe-share:|material-file-encryptor:\/\/)[^\s"'<>`]*/gi)].map(match => match[0]);
  if (found.length !== 1) throw commandError('COMMAND_INVALID');
  let token = found[0], rest;
  const lower = token.toLowerCase();
  if (lower.startsWith('mfe-share:')) {
    if (!token.startsWith('mfe-share:')) throw commandError('COMMAND_INVALID');
    const version = /^mfe-share:v(\d{1,3}):/.exec(token);
    if (!version) throw commandError('COMMAND_INVALID');
    if (version[1] !== '1') throw commandError('UNKNOWN_VERSION');
    rest = token.slice(version[0].length);
  } else {
    const version = /^material-file-encryptor:\/\/receive\/v(\d{1,3})\//.exec(token);
    if (!version) throw commandError('COMMAND_INVALID');
    if (version[1] !== '1') throw commandError('UNKNOWN_VERSION');
    rest = token.slice(version[0].length);
    // Some launchers percent-encode the fragment separator or append a slash. Undo only those two changes.
    if (!rest.includes('#') && (rest.match(/%23/gi) || []).length === 1) rest = rest.replace(/%23/i, '#');
    rest = rest.replace(/\/$/, '');
  }
  const hash = rest.indexOf('#');
  if (hash < 0 || rest.indexOf('#', hash + 1) >= 0) throw commandError('COMMAND_INVALID');
  const location = rest.slice(0, hash), secret = rest.slice(hash + 1);
  const match = /^([^/@]+)\/([^/@]+)\/([^/@]+)@(sha256:[a-f0-9]{64})$/.exec(location);
  if (!match) throw commandError('COMMAND_INVALID');
  const [, host, namespace, name, digest] = match;
  if (host !== DOCKER_HUB_REGISTRY_HOST && !(allowTestHosts && TEST_HOST.test(host))) throw commandError('FOREIGN_HOST');
  if (!NAMESPACE.test(namespace)) throw commandError('COMMAND_INVALID');
  if (name !== SHARE_REPOSITORY_NAME) throw commandError('FOREIGN_REPOSITORY');
  if (!DIGEST.test(digest)) throw commandError('COMMAND_INVALID');
  let key = null, wrapped = null;
  if (secret.startsWith('p:')) { wrapped = decode(secret.slice(2), WRAPPED_KEY_BYTES); if (!wrapped) throw commandError('COMMAND_INVALID'); }
  else { key = decode(secret, SHARE_KEY_BYTES); if (!key) throw commandError('COMMAND_INVALID'); }
  return Object.freeze({ version: 1, host, repository: `${namespace}/${name}`, digest, key, wrapped, needsPassphrase: wrapped !== null,
    command: `${SHARE_SCHEME}:v1:${host}/${namespace}/${name}@${digest}#${secret}` });
}

/** For logs and reports: the same command with the key replaced. */
export function redactShareCommand(text) {
  return String(text).replace(/#(?:p:)?[A-Za-z0-9_-]+/g, '#[redacted]');
}
