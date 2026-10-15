import path from 'node:path';
import {spawn as nodeSpawn} from 'node:child_process';

/**
 * Handles the Squirrel.Windows lifecycle arguments before the rest of the application is evaluated.
 *
 * Squirrel waits a short, fixed time for the application to exit after it passes one of these arguments. The
 * earlier arrangement ran this work after the whole main module graph had loaded and left the exit to a helper
 * package that waited on a detached child's stdio, so a cold first start could pass that deadline and Squirrel
 * reported "operation canceled" before the native host registration had been refreshed. This module does only the
 * registrations and the shortcut change, then exits, and a watchdog guarantees the exit.
 */
export const SQUIRREL_EVENT_PATTERN = /^--squirrel-(install|updated|uninstall|obsolete)$/;

/** Squirrel passes the event as the first application argument; the earlier hook accepted it anywhere, so keep both. */
export function squirrelEvent(argv) {
  const found = (argv || []).slice(1).find(arg => SQUIRREL_EVENT_PATTERN.test(arg));
  return found || null;
}

export function runSquirrelLifecycle({
  argv, platform = process.platform, packaged, execPath, resourcesPath, userData,
  exit, registerExplorer, removeExplorer, disableLogin, nativeHostEvent, spawn = nodeSpawn, watchdogMs = 6000, setTimer = setTimeout,
}) {
  const event = platform === 'win32' ? squirrelEvent(argv) : null;
  if (!event) return {handled: false, event: null};
  let finished = false;
  const finish = () => { if (finished) return; finished = true; try { exit(0); } catch { /* the process is ending either way */ } };
  // Whatever happens below, the hook never outlasts this deadline.
  setTimer(finish, watchdogMs);
  const attempt = step => { try { step(); return true; } catch { return false; } };
  const installDirectory = path.win32.dirname(execPath);
  const updateExe = path.win32.resolve(installDirectory, '..', 'Update.exe');
  const target = path.win32.basename(execPath);
  let shortcut = null;
  if (event === '--squirrel-uninstall') {
    attempt(() => disableLogin());
    attempt(() => removeExplorer(execPath));
    shortcut = `--removeShortcut=${target}`;
  } else if (event === '--squirrel-install' || event === '--squirrel-updated') {
    attempt(() => registerExplorer(execPath));
    shortcut = `--createShortcut=${target}`;
  }
  // The host manifest comes first among the slower steps: it is what pairing depends on.
  const host = packaged ? attempt(() => nativeHostEvent({argv, execPath, resourcesPath, userData})) : null;
  if (!shortcut) { finish(); return {handled: true, event, host}; }
  try {
    const child = spawn(updateExe, [shortcut], {detached: true, stdio: 'ignore', windowsHide: true});
    child.once?.('exit', finish);
    child.once?.('error', finish);
    child.unref?.();
  } catch { finish(); }
  return {handled: true, event, host};
}
