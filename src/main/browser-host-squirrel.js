import fs from 'node:fs';
import path from 'node:path';
import {registerNativeHost, unregisterNativeHost, fixedManifestDirectory, migrateLegacyManifest} from './browser-host-registration.js';
import {validateBrowserHostConfig} from './browser-native-host.js';

function allowedOriginsOf(hostDirectory, fileSystem) {
  try { return validateBrowserHostConfig(JSON.parse(fileSystem.readFileSync(path.win32.join(hostDirectory, 'browser-host-config.json'), 'utf8'))); } catch { return null; }
}

/**
 * Maps one Squirrel lifecycle argument to native host registration. The manifest lives in one fixed folder inside
 * the install root, never in the user-data profile. A failure never fails the installer hook: the result is
 * returned so callers and tests can see it.
 */
export function handleNativeHostSquirrelEvent({argv, execPath, resourcesPath, userData, register = registerNativeHost, unregister = unregisterNativeHost, migrate = migrateLegacyManifest, fileSystem = fs}) {
  const event = argv.find(arg => /^--squirrel-(install|updated|uninstall|obsolete)$/.test(arg));
  if (!event) return null;
  const installRoot = path.win32.dirname(execPath);
  const manifestDirectory = fixedManifestDirectory(execPath);
  if (!manifestDirectory) return {event, failed: true, reason: 'NOT_A_SQUIRREL_INSTALLATION'};
  const hostDirectory = path.win32.join(resourcesPath, 'browser-host');
  const migrateOld = () => { try { const allowedOrigins = allowedOriginsOf(hostDirectory, fileSystem); return allowedOrigins ? migrate({userData, allowedOrigins, fileSystem}) : {migrated: false}; } catch { return {migrated: false}; } };
  try {
    if (event === '--squirrel-install' || event === '--squirrel-updated') {
      const registered = register({hostDirectory, installRoot, manifestDirectory});
      return {event, ...registered, legacy: migrateOld()};
    }
    // An older version's obsolete hook must not remove the registration the newer version just wrote.
    const removed = unregister({manifestDirectory, onlyIfOwnedBy: event === '--squirrel-obsolete' ? installRoot : null});
    return {event, ...removed, legacy: event === '--squirrel-uninstall' ? migrateOld() : {migrated: false}};
  } catch (error) {
    return {event, failed: true, reason: String(error?.message || error).slice(0, 200)};
  }
}
