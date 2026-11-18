import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_RETENTION, validateRetention } from './retention.js';

/**
 * Automatic backup settings. Backup is on by default once the person is signed in to Docker Hub; each drive can
 * opt out on its own row. Nothing is uploaded until the public-repository notice has been acknowledged once.
 * Backing up while the app is closed needs a Windows scheduled task and stays off by default.
 */
export const IDLE_DELAYS = Object.freeze([30, 60, 120, 300, 600, 1800]);
export const CHECK_INTERVALS = Object.freeze([15, 30, 60, 120, 360, 720, 1440]);
export const DEFAULT_AUTO_BACKUP = Object.freeze({
  enabled: true, idleDelaySeconds: 60, intervalMinutes: 60, onLock: true, whileClosed: false,
  repositoryLayout: 'shared', retention: DEFAULT_RETENTION, noticeAcknowledged: false,
});
const KEYS = Object.keys(DEFAULT_AUTO_BACKUP);
const SESSION = /^[A-Za-z0-9-]{1,64}$/;
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** Validates a partial change. Unknown keys and out-of-range values are refused, never clamped. */
export function validateAutoBackupPatch(value) {
  if (!plain(value) || !Object.keys(value).length || Object.keys(value).some(key => !KEYS.includes(key))) throw Error('Invalid automatic backup settings.');
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (['enabled', 'onLock', 'whileClosed', 'noticeAcknowledged'].includes(key)) { if (typeof item !== 'boolean') throw Error('Invalid automatic backup settings.'); out[key] = item; }
    else if (key === 'idleDelaySeconds') { if (!IDLE_DELAYS.includes(item)) throw Error('Invalid automatic backup settings.'); out[key] = item; }
    else if (key === 'intervalMinutes') { if (!CHECK_INTERVALS.includes(item)) throw Error('Invalid automatic backup settings.'); out[key] = item; }
    else if (key === 'repositoryLayout') { if (!['shared', 'per-drive'].includes(item)) throw Error('Invalid automatic backup settings.'); out[key] = item; }
    else if (key === 'retention') out[key] = validateRetention(item);
  }
  return out;
}

/** A small owner-only JSON store: { version, settings, drives: { sessionId: { enabled } } }. */
export function createAutoBackupSettings({ file }) {
  let value = null, saving = Promise.resolve();
  async function load() {
    if (value) return value;
    let stored = null;
    try { const stat = await fs.lstat(file); if (stat.isFile() && !stat.isSymbolicLink() && stat.size < 256 * 1024) stored = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') stored = null; }
    const settings = { ...DEFAULT_AUTO_BACKUP };
    const drives = {};
    if (stored?.version === 1 && plain(stored.settings)) {
      for (const key of KEYS) { try { Object.assign(settings, validateAutoBackupPatch({ [key]: stored.settings[key] })); } catch { /* a damaged value keeps its default */ } }
      if (plain(stored.drives)) for (const [id, item] of Object.entries(stored.drives).slice(0, 200)) if (SESSION.test(id) && typeof item?.enabled === 'boolean') drives[id] = { enabled: item.enabled };
    }
    value = { settings, drives };
    return value;
  }
  function save() {
    saving = saving.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      const temporary = `${file}.${randomUUID()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify({ version: 1, ...value }), { mode: 0o600, flag: 'wx' });
      try { await fs.rename(temporary, file); } catch (error) { await fs.rm(temporary, { force: true }); throw error; }
    });
    return saving;
  }
  return {
    async get() { const current = await load(); return structuredClone(current); },
    /** The settings already in memory, or the defaults before the first read. For synchronous callers. */
    peek() { return structuredClone(value?.settings ?? DEFAULT_AUTO_BACKUP); },
    async update(patch) { const change = validateAutoBackupPatch(patch); const current = await load(); Object.assign(current.settings, change); await save(); return structuredClone(current); },
    async setDrive(sessionId, enabled) {
      if (!SESSION.test(String(sessionId)) || typeof enabled !== 'boolean') throw Error('Invalid drive.');
      const current = await load(); current.drives[sessionId] = { enabled }; await save(); return structuredClone(current);
    },
    /** A drive is backed up unless its row switch was turned off. */
    async driveEnabled(sessionId) { const current = await load(); return current.drives[sessionId]?.enabled !== false; },
  };
}
