import path from 'node:path';
import {registerNativeHost, unregisterNativeHost} from './browser-host-registration.js';

/**
 * Maps one Squirrel lifecycle argument to native host registration. A failure never fails the
 * installer hook: the result is returned so callers and tests can see it.
 */
export function handleNativeHostSquirrelEvent({argv, execPath, resourcesPath, userData, register = registerNativeHost, unregister = unregisterNativeHost}) {
  const event = argv.find(arg => /^--squirrel-(install|updated|uninstall|obsolete)$/.test(arg));
  if (!event) return null;
  const installRoot = path.win32.dirname(execPath);
  const manifestDirectory = path.win32.join(userData, 'native-messaging');
  try {
    if (event === '--squirrel-install' || event === '--squirrel-updated') return {event, ...register({hostDirectory: path.win32.join(resourcesPath, 'browser-host'), installRoot, manifestDirectory})};
    // An older version's obsolete hook must not remove the registration the newer version just wrote.
    return {event, ...unregister({manifestDirectory, onlyIfOwnedBy: event === '--squirrel-obsolete' ? installRoot : null})};
  } catch (error) {
    return {event, failed: true, reason: String(error?.message || error).slice(0, 200)};
  }
}
