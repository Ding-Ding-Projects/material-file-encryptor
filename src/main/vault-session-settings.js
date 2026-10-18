import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeDriveName } from '../shared/drive-name.js';
import { parseStrictJson } from '../shared/personal-vocabulary.js';

export const MAX_SECONDARY_VAULTS = 23;
export const MAX_SESSION_SETTINGS_BYTES = 4 * 1024 * 1024;
const invalid = () => new Error('Saved secondary vault settings are invalid. The original settings file has been preserved.');
const plain = value => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const text = (value, limit) => typeof value === 'string' && value.length > 0 && value.length <= limit && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
function recoveryPath(value) {
  if (!text(value, 32767)) return false;
  const windows = value.replaceAll('/', '\\');
  const absoluteDrive = /^[A-Za-z]:\\/.test(windows);
  const absoluteUnc = /^\\\\[^\\]+\\[^\\]+(?:\\|$)/.test(windows);
  if (absoluteDrive || absoluteUnc) {
    const components = windows.slice(absoluteDrive ? 3 : 2).split('\\').filter(Boolean);
    return components.every(component => component !== '.' && component !== '..' && !/[<>:"|?*]/.test(component) && !/[ .]$/.test(component) && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(component));
  }
  // POSIX paths support offline tests and non-Windows settings inspection only.
  return process.platform !== 'win32' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && value.split('/').every(component => component !== '.' && component !== '..');
}
const sameFile = (left, right) => left.dev === right.dev && left.ino === right.ino;

function field(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) return undefined;
  if (!Object.hasOwn(descriptor, 'value')) throw invalid();
  return descriptor.value;
}

/** Only recovery locations and ordinary UI preferences may survive a restart. */
export function sanitizeSecondaryVaultPreferences(value) {
  if (!plain(value) || Reflect.ownKeys(value).length > 32) throw invalid();
  const result = { autoUnlock: false };
  for (const key of ['storageDir', 'cacheDir']) {
    const item = field(value, key);
    if (item !== undefined) {
      if (!recoveryPath(item)) throw invalid();
      result[key] = item;
    }
  }
  // A missing cache identity must never silently generate a new empty cache.
  if (!result.cacheDir) throw invalid();
  const driveLetter = field(value, 'driveLetter');
  if (driveLetter !== undefined) {
    if (typeof driveLetter !== 'string' || !/^[D-Z]:?$/i.test(driveLetter)) throw invalid();
    result.driveLetter = driveLetter[0].toUpperCase() + ':';
  }
  const driveName = field(value, 'driveName');
  if (driveName !== undefined) {
    const normalized = normalizeDriveName(driveName);
    if (normalized === null) throw invalid();
    result.driveName = normalized;
  }
  const transport = field(value, 'transport');
  if (transport !== undefined) {
    if (!['folder', 'privateGit'].includes(transport)) throw invalid();
    result.transport = transport;
  }
  const repository = field(value, 'remoteRepository');
  if (repository !== undefined) {
    if (typeof repository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(repository) || repository.endsWith('/.') || repository.endsWith('/..')) throw invalid();
    result.remoteRepository = repository;
  }
  if (transport === 'privateGit' && !result.remoteRepository) throw invalid();
  for (const key of ['historyRetentionDays', 'performanceMode']) {
    const item = field(value, key);
    if (item === undefined) continue;
    const valid = key === 'performanceMode' ? ['responsive', 'throughput'].includes(item)
        : item === null || Number.isSafeInteger(item) && item >= 1 && item <= 36500;
    if (!valid) throw invalid();
    result[key] = item;
  }
  return result;
}

export function sanitizeSecondaryVaultSessions(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_SECONDARY_VAULTS || Reflect.ownKeys(value).length !== value.length + 1) throw invalid();
  return Array.from({ length: value.length }, (_, index) => {
    if (!Object.hasOwn(value, index)) throw invalid();
    return sanitizeSecondaryVaultPreferences(field(value, index));
  });
}

export function parseVaultSessionSettings(contents) {
  if (typeof contents !== 'string' || Buffer.byteLength(contents, 'utf8') > MAX_SESSION_SETTINGS_BYTES) throw invalid();
  let value;
  try { value = parseStrictJson(contents, MAX_SESSION_SETTINGS_BYTES); } catch { throw invalid(); }
  if (!plain(value) || value.schemaVersion !== 1 || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'sessions')) throw invalid();
  return sanitizeSecondaryVaultSessions(value.sessions);
}

/** Reads only this settings file, never any saved storage, cache or repository. */
export function createVaultSessionSettings({ filePath, fileSystem = fs }) {
  let attempted = false, loaded = false, blocked = false, queued = Promise.resolve();
  const target = () => typeof filePath === 'function' ? filePath() : filePath;
  return {
    async load() {
      if (attempted) throw new Error('Secondary vault settings have already been loaded.');
      attempted = true;
      let handle, sessions;
      try {
        const filename = target();
        let before;
        try { before = await fileSystem.lstat(filename); }
        catch (error) { if (error.code === 'ENOENT') { loaded = true; return []; } throw error; }
        if (before.isSymbolicLink() || !before.isFile() || before.size > MAX_SESSION_SETTINGS_BYTES) throw invalid();
        handle = await fileSystem.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        const opened = await handle.stat(), current = await fileSystem.lstat(filename);
        if (!opened.isFile() || opened.size > MAX_SESSION_SETTINGS_BYTES || current.isSymbolicLink() || !current.isFile() || !sameFile(before, opened) || !sameFile(opened, current)) throw invalid();
        const buffer = Buffer.alloc(MAX_SESSION_SETTINGS_BYTES + 1);
        let size = 0;
        while (size < buffer.length) {
          const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
          if (!bytesRead) break;
          size += bytesRead;
        }
        if (size > MAX_SESSION_SETTINGS_BYTES) throw invalid();
        const after = await handle.stat();
        if (after.size !== size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw invalid();
        sessions = parseVaultSessionSettings(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size)));
        await handle.close(); handle = null;
        loaded = true;
        return sessions;
      } catch (error) {
        blocked = true;
        throw new Error('Secondary vault settings could not be read. The original settings file is preserved and will not be overwritten during this run.', { cause: error });
      } finally { if (handle) await handle.close().catch(() => {}); }
    },
    async save(sessions) {
      if (!loaded || blocked) throw new Error('Secondary vault settings cannot be saved because their original contents have not been safely loaded. Restart after resolving the settings error.');
      const contents = JSON.stringify({ schemaVersion: 1, sessions: sanitizeSecondaryVaultSessions(sessions) });
      if (Buffer.byteLength(contents, 'utf8') > MAX_SESSION_SETTINGS_BYTES) throw invalid();
      const save = queued.catch(() => {}).then(async () => {
        const destination = target(), temporary = `${destination}.${randomUUID()}.tmp`;
        let handle;
        try {
          await fileSystem.mkdir(path.dirname(destination), { recursive: true });
          handle = await fileSystem.open(temporary, 'wx', 0o600);
          await handle.writeFile(contents, 'utf8');
          await handle.sync();
          await handle.close(); handle = null;
          await fileSystem.rename(temporary, destination);
        } finally {
          if (handle) await handle.close();
          await fileSystem.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
        }
      });
      queued = save;
      await save;
    },
  };
}
