import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * The per-user material-file-encryptor:// link handler. It is written under HKCU by the Squirrel install and
 * update hooks (so it follows the current version's executable) and removed on uninstall. A link opens the app
 * with --receive "<link>"; the key is in the link's fragment and is never sent anywhere.
 */
export const SHARE_PROTOCOL_KEY = 'HKCU\\Software\\Classes\\material-file-encryptor';

export function registerShareProtocol(executable, { remove = false, run = execFileSync, platform = process.platform } = {}) {
  if (platform !== 'win32') return false;
  const invoke = args => run('reg.exe', args, { windowsHide: true, stdio: 'ignore', timeout: 5000 });
  if (remove) { try { invoke(['delete', SHARE_PROTOCOL_KEY, '/f']); } catch { /* already absent */ } return true; }
  if (typeof executable !== 'string' || !path.win32.isAbsolute(executable) || executable.includes('"')) throw Error('Invalid application executable.');
  invoke(['add', SHARE_PROTOCOL_KEY, '/ve', '/t', 'REG_SZ', '/d', 'URL:Material File Encryptor shared file', '/f']);
  invoke(['add', SHARE_PROTOCOL_KEY, '/v', 'URL Protocol', '/t', 'REG_SZ', '/d', '', '/f']);
  invoke(['add', SHARE_PROTOCOL_KEY + '\\DefaultIcon', '/ve', '/t', 'REG_SZ', '/d', `"${executable}",0`, '/f']);
  invoke(['add', SHARE_PROTOCOL_KEY + '\\shell\\open\\command', '/ve', '/t', 'REG_SZ', '/d', `"${executable}" --receive "%1"`, '/f']);
  return true;
}
