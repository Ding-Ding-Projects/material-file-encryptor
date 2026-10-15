import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {validateBrowserHostConfig} from './browser-native-host.js';

export const NATIVE_HOST_NAME = 'org.dingding.material_file_encryptor.downloads';
export const HOST_EXECUTABLE = 'MaterialFileEncryptor.BrowserHost.exe';
export const REGISTRY_KEYS = Object.freeze([
  `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
  `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Chrome extension id: first 32 hex digits of SHA-256(DER public key), digits 0-f mapped to a-p. */
export function computeExtensionId(derPublicKey) {
  return sha256(derPublicKey).slice(0, 32).replace(/[0-9a-f]/g, char => String.fromCharCode(97 + parseInt(char, 16)));
}

/** Validates a checked-in reviewed identity file and returns the host configuration derived from it. */
export function hostConfigFromIdentity(identity) {
  const keys = ['schemaVersion', 'extensionId', 'publicKeyDerBase64', 'publicKeySha256', 'note'];
  if (!identity || typeof identity !== 'object' || Array.isArray(identity) || Object.keys(identity).sort().join() !== [...keys].sort().join() || identity.schemaVersion !== 1) throw new Error('A complete reviewed extension identity is required.');
  const der = Buffer.from(String(identity.publicKeyDerBase64), 'base64');
  if (!der.length || der.toString('base64') !== identity.publicKeyDerBase64 || sha256(der) !== identity.publicKeySha256 || computeExtensionId(der) !== identity.extensionId) throw new Error('The reviewed extension identity does not match its public key.');
  const config = {schemaVersion: 1, host: NATIVE_HOST_NAME, allowedOrigins: [`chrome-extension://${identity.extensionId}/`], identity: {extensionId: identity.extensionId, packageSha256: 'unpacked', publicKeySha256: identity.publicKeySha256}};
  validateBrowserHostConfig(config);
  return config;
}

const inside = (root, target) => {
  const relative = path.win32.relative(path.win32.resolve(root), path.win32.resolve(target));
  return relative !== '' && !relative.startsWith('..') && !path.win32.isAbsolute(relative);
};
const cleanAbsolute = value => typeof value === 'string' && value.length < 1024 && path.win32.isAbsolute(value) && /^[A-Za-z]:\\/.test(value) && !/[\x00-\x1f"<>|?*]/.test(value) && path.win32.normalize(value) === value;

function runner(run) {
  return args => run('reg.exe', args, {windowsHide: true, stdio: 'ignore'});
}

/**
 * Registers the native messaging host for the current user only: writes the host manifest into the
 * per-user data folder and points the Edge and Chrome HKCU keys at it. No administrator rights.
 * The host executable must live inside the installation root; the manifest must live inside the data root.
 */
export function registerNativeHost({hostDirectory, installRoot, manifestDirectory, run = execFileSync, fileSystem = fs}) {
  if (![hostDirectory, installRoot, manifestDirectory].every(cleanAbsolute)) throw new Error('Registration needs normalized absolute Windows paths.');
  const hostPath = path.win32.join(hostDirectory, HOST_EXECUTABLE);
  if (!inside(installRoot, hostPath)) throw new Error('The native host executable must be inside the installation root.');
  const config = JSON.parse(fileSystem.readFileSync(path.win32.join(hostDirectory, 'browser-host-config.json'), 'utf8'));
  validateBrowserHostConfig(config);
  if (!fileSystem.existsSync(hostPath)) throw new Error('The native host executable is not installed.');
  const manifestPath = path.win32.join(manifestDirectory, `${NATIVE_HOST_NAME}.json`);
  if (!inside(manifestDirectory, manifestPath)) throw new Error('The host manifest path escapes its folder.');
  const manifest = {name: NATIVE_HOST_NAME, description: 'Material File Encryptor download handoff', path: hostPath, type: 'stdio', allowed_origins: config.allowedOrigins.slice()};
  fileSystem.mkdirSync(manifestDirectory, {recursive: true});
  fileSystem.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', {mode: 0o600});
  const invoke = runner(run);
  for (const key of REGISTRY_KEYS) invoke(['add', key, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f']);
  return {manifestPath, hostPath, keys: REGISTRY_KEYS.slice()};
}

/**
 * Removes exactly the two keys and the manifest. With `onlyIfOwnedBy` (the obsolete hook of an older
 * version during an update) nothing is removed when the manifest already points at another installation.
 */
export function unregisterNativeHost({manifestDirectory, onlyIfOwnedBy = null, run = execFileSync, fileSystem = fs}) {
  if (!cleanAbsolute(manifestDirectory)) throw new Error('Unregistration needs a normalized absolute Windows path.');
  const manifestPath = path.win32.join(manifestDirectory, `${NATIVE_HOST_NAME}.json`);
  if (onlyIfOwnedBy) {
    if (!cleanAbsolute(onlyIfOwnedBy)) throw new Error('Ownership root must be a normalized absolute Windows path.');
    let owned = false;
    try { owned = inside(onlyIfOwnedBy, JSON.parse(fileSystem.readFileSync(manifestPath, 'utf8')).path); } catch { owned = false; }
    if (!owned) return {removed: false, reason: 'REGISTRATION_OWNED_BY_ANOTHER_INSTALLATION'};
  }
  const invoke = runner(run);
  for (const key of REGISTRY_KEYS) { try { invoke(['delete', key, '/f']); } catch { /* key already absent */ } }
  try { fileSystem.rmSync(manifestPath, {force: true}); } catch { /* manifest already absent */ }
  return {removed: true, keys: REGISTRY_KEYS.slice(), manifestPath};
}
