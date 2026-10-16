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

const MANIFEST_FOLDER = 'native-messaging';

/**
 * The one fixed, version-independent manifest folder: a sibling of the versioned app-x.y.z folder inside the
 * Squirrel install root, so the user-data profile in use never changes it and Squirrel's removal of the install
 * root removes it. Returns null when the executable is not inside a Squirrel layout (development, unpacked runs).
 */
export function fixedManifestDirectory(execPath) {
  if (!cleanAbsolute(execPath)) return null;
  const appFolder = path.win32.dirname(execPath);
  if (!/^app-\d+\.\d+\.\d+/.test(path.win32.basename(appFolder))) return null;
  const installRoot = path.win32.dirname(appFolder);
  if (path.win32.dirname(installRoot) === installRoot) return null;
  return path.win32.join(installRoot, MANIFEST_FOLDER);
}

/** The earlier, profile-relative manifest folder, kept only so it can be migrated away. */
export function legacyManifestDirectory(userData) {
  return cleanAbsolute(userData) ? path.win32.join(userData, MANIFEST_FOLDER) : null;
}

/**
 * Removes the old in-profile manifest of exactly this profile, and only when this application wrote it: the host
 * name must match and every allowed origin must be one of ours. Anything else is left alone, and no other profile
 * is ever inspected.
 */
export function migrateLegacyManifest({userData, allowedOrigins, fileSystem = fs}) {
  const directory = legacyManifestDirectory(userData);
  if (!directory || !Array.isArray(allowedOrigins) || !allowedOrigins.length) return {migrated: false};
  const manifestPath = path.win32.join(directory, `${NATIVE_HOST_NAME}.json`);
  try {
    const old = JSON.parse(fileSystem.readFileSync(manifestPath, 'utf8'));
    const ours = old && old.name === NATIVE_HOST_NAME && Array.isArray(old.allowed_origins) && old.allowed_origins.length > 0 && old.allowed_origins.every(origin => allowedOrigins.includes(origin));
    if (!ours) return {migrated: false};
    fileSystem.rmSync(manifestPath, {force: true});
    try { fileSystem.rmdirSync(directory); } catch { /* other files remain, or it is already gone */ }
    return {migrated: true, manifestPath};
  } catch { return {migrated: false}; }
}

function runner(run) {
  // A bounded wait keeps an installer hook inside Squirrel's time budget even if the registry tool stalls.
  return args => run('reg.exe', args, {windowsHide: true, stdio: 'ignore', timeout: 5000});
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
 * Startup self-healing: when the registered manifest is missing, or does not describe exactly this
 * installation's host, write it again through the same checked registration. A matching manifest is left alone
 * so a normal start costs two small file reads.
 */
export function repairNativeHostRegistration({hostDirectory, installRoot, manifestDirectory, legacyUserData = null, register = registerNativeHost, fileSystem = fs, ...rest}) {
  if (![hostDirectory, installRoot, manifestDirectory].every(cleanAbsolute)) throw new Error('Repair needs normalized absolute Windows paths.');
  const hostPath = path.win32.join(hostDirectory, HOST_EXECUTABLE);
  const manifestPath = path.win32.join(manifestDirectory, `${NATIVE_HOST_NAME}.json`);
  let current = null;
  try { current = JSON.parse(fileSystem.readFileSync(manifestPath, 'utf8')); } catch { current = null; }
  let allowed = null;
  try { allowed = validateBrowserHostConfig(JSON.parse(fileSystem.readFileSync(path.win32.join(hostDirectory, 'browser-host-config.json'), 'utf8'))); } catch { allowed = null; }
  const matches = Boolean(current) && typeof current === 'object' && current.name === NATIVE_HOST_NAME && current.path === hostPath && current.type === 'stdio'
    && Array.isArray(current.allowed_origins) && allowed !== null && JSON.stringify(current.allowed_origins) === JSON.stringify(allowed);
  const migrate = () => (legacyUserData && allowed ? migrateLegacyManifest({userData: legacyUserData, allowedOrigins: allowed, fileSystem}) : {migrated: false});
  if (matches) return {repaired: false, manifestPath, hostPath, legacy: migrate()};
  const registered = register({hostDirectory, installRoot, manifestDirectory, fileSystem, ...rest});
  return {repaired: true, ...registered, legacy: migrate()};
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
  try { fileSystem.rmdirSync(manifestDirectory); } catch { /* not empty or already gone */ }
  return {removed: true, keys: REGISTRY_KEYS.slice(), manifestPath};
}
