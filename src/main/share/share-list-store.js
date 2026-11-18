import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * The local list of files this user has shared. Each entry keeps the share command, which includes the key, so
 * the whole list is encrypted with the operating system's protected storage (Electron safeStorage, which uses
 * DPAPI on Windows) before it touches the disk. When protected storage is unavailable the list lives only in
 * memory for this session and nothing is written.
 *   protection  { available(): boolean, encrypt(text): Buffer, decrypt(Buffer): text }
 */
const MAX_ENTRIES = 500;
const MAX_FILE = 4 * 1024 * 1024;
const ID = /^[a-f0-9-]{36}$/;

function validEntry(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && ID.test(value.id) && typeof value.name === 'string' && value.name.length <= 255 &&
    Number.isSafeInteger(value.size) && value.size >= 0 && typeof value.createdAt === 'string' && typeof value.repository === 'string' && value.repository.length <= 220 &&
    /^sha256:[a-f0-9]{64}$/.test(value.digest) && /^share-[a-f0-9]{32}$/.test(value.tag) && typeof value.passphrase === 'boolean' &&
    typeof value.command === 'string' && value.command.length <= 4096 && ['active', 'revoked'].includes(value.state);
}

export function createShareListStore({ file, protection, newId = randomUUID, now = () => new Date() }) {
  let entries = null, loadError = null;
  const persistent = () => Boolean(protection?.available?.());
  async function load() {
    if (entries) return entries;
    entries = [];
    if (!persistent()) return entries;
    let bytes;
    try { bytes = await fs.readFile(file); } catch (error) { if (error.code !== 'ENOENT') loadError = 'The list of shared files could not be read.'; return entries; }
    try {
      if (bytes.length > MAX_FILE) throw Error();
      const value = JSON.parse(protection.decrypt(bytes));
      if (!value || value.version !== 1 || !Array.isArray(value.entries)) throw Error();
      entries = value.entries.filter(validEntry).slice(0, MAX_ENTRIES);
    } catch { loadError = 'The list of shared files could not be read. It was kept unchanged.'; entries = []; }
    return entries;
  }
  async function save() {
    if (!persistent() || loadError) return false;
    const text = JSON.stringify({ version: 1, entries });
    const sealed = protection.encrypt(text);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, sealed, { mode: 0o600 });
    await fs.rename(temporary, file);
    return true;
  }
  const summary = entry => { const { command, ...rest } = entry; return { ...rest }; };
  return {
    get persistent() { return persistent() && !loadError; },
    get loadError() { return loadError; },
    /** Entries without their commands. */
    async list() { return (await load()).map(summary); },
    async add({ name, size, repository, digest, tag, passphrase, command }) {
      await load();
      const entry = { id: newId(), name, size, createdAt: now().toISOString(), repository, digest, tag, passphrase: Boolean(passphrase), command, state: 'active' };
      if (!validEntry(entry)) throw Error('The share could not be recorded.');
      entries.unshift(entry); if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
      const saved = await save();
      return { entry: summary(entry), saved };
    },
    async command(id) { const entry = (await load()).find(item => item.id === id); return entry && entry.state === 'active' ? entry.command : null; },
    async get(id) { const entry = (await load()).find(item => item.id === id); return entry ? summary(entry) : null; },
    async markRevoked(id) {
      const entry = (await load()).find(item => item.id === id); if (!entry) return null;
      entry.state = 'revoked'; entry.command = ''; await save(); return summary(entry);
    },
    async remove(id) { await load(); entries = entries.filter(item => item.id !== id); await save(); },
  };
}

/** Wraps Electron safeStorage. */
export function safeStorageProtection(safeStorage) {
  return {
    available: () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } },
    encrypt: text => safeStorage.encryptString(text),
    decrypt: bytes => safeStorage.decryptString(bytes),
  };
}
