import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

/** placement.json lives in the main storage folder and holds only part ids, sizes, location ids, labels and settings. */
export const PLACEMENT_FILE = 'placement.json';
export const SPLIT_FOLDER = 'MaterialFileEncryptor-Split';
export const MIRROR_FOLDER = 'MaterialFileEncryptor-Mirror';
export const MAIN = 'main';
export const PART = /^(?:[0-9a-f]{32}|[0-9a-f]{64})$/;
const LOCATION_ID = /^[a-z0-9-]{1,64}$/;
const REPOSITORY = /^[a-z0-9][a-z0-9_-]{1,38}\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
const MAX_LOCATIONS = 32, MAX_RULES = 100, MAX_PLACEMENT_BYTES = 64 * 1024 ** 2;

export class SplitStorageError extends Error {}
const fail = message => new SplitStorageError(message);

const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
/** True when child is parent or inside it (Windows paths compare case-insensitively). */
export function within(child, parent) {
  const relative = path.relative(path.resolve(parent).toLowerCase(), path.resolve(child).toLowerCase());
  return relative === '' || !relative.startsWith('..') && !path.isAbsolute(relative);
}
export const newLocationId = () => randomBytes(6).toString('hex');
export const folderPartPath = (folder, vaultId, part) => path.join(folder, SPLIT_FOLDER, vaultId, 'parts', `${part}.mfe`);
export const mirrorRoot = (folder, vaultId) => path.join(folder, MIRROR_FOLDER, vaultId);

const text = (value, max) => typeof value === 'string' && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
function integer(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw fail('Enter whole numbers for shares and size limits.');
  return value;
}
/** A glob over drive paths: Projects/** or *.mp4. The engine compiles it; this only refuses unsafe text. */
export function validRule(match) {
  return text(match, 256) && match.trim() === match && match.length > 0 && !match.includes('\\') && match.split('/').every(part => part !== '.' && part !== '..');
}

/**
 * Validates a renderer-supplied configuration. Folder paths must be absolute, outside the main storage folder,
 * the cache and the mounted drive, and must not overlap another location. The main location always exists.
 */
export function normalizeSplitConfig(input, { storageDir, cacheDir, mountedDrive = null } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('Invalid split storage settings.');
  const allowed = ['enabled', 'copies', 'locations', 'rules', 'safetyBackup'];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw fail('Invalid split storage settings.');
  const enabled = input.enabled === undefined ? false : input.enabled;
  if (typeof enabled !== 'boolean') throw fail('Invalid split storage settings.');
  // Safety backup is on unless explicitly turned off, including for settings saved before it existed.
  const safetyBackup = input.safetyBackup === undefined ? true : input.safetyBackup;
  if (typeof safetyBackup !== 'boolean') throw fail('Invalid split storage settings.');
  const list = input.locations ?? [];
  if (!Array.isArray(list) || list.length > MAX_LOCATIONS) throw fail(`Use at most ${MAX_LOCATIONS} locations.`);
  const locations = [], ids = new Set(), folders = [];
  let main = null;
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw fail('Invalid location.');
    const kind = item.kind;
    if (!['main', 'folder', 'registry'].includes(kind)) throw fail('Choose a folder or registry location.');
    const id = kind === 'main' ? MAIN : item.id ?? newLocationId();
    if (typeof id !== 'string' || !LOCATION_ID.test(id) || ids.has(id) || (id === MAIN) !== (kind === 'main')) throw fail('Invalid location.');
    ids.add(id);
    const role = item.role === undefined ? 'share' : item.role;
    if (!['share', 'mirror'].includes(role) || kind === 'main' && role !== 'share') throw fail('Invalid location role.');
    const label = item.label === undefined ? '' : item.label;
    if (!text(label, 200)) throw fail('Location names can be up to 200 characters.');
    const location = { id, kind, role, label: label.trim() || (kind === 'main' ? 'Main storage' : kind === 'registry' ? 'Docker Hub' : 'Folder'),
      weight: integer(item.weight, { min: 0, max: 1000000, fallback: kind === 'main' ? 1 : 1 }),
      capacityBytes: integer(item.capacityBytes, { min: 0, fallback: 0 }),
      enabled: item.enabled === undefined ? true : item.enabled, removableHint: item.removableHint === true };
    if (typeof location.enabled !== 'boolean') throw fail('Invalid location.');
    if (kind === 'folder') {
      if (typeof item.path !== 'string' || item.path.length > 32767 || item.path.includes('\0') || !path.isAbsolute(item.path)) throw fail('Choose a folder with the folder picker.');
      const folder = path.resolve(item.path);
      if (storageDir && (within(folder, storageDir) || within(storageDir, folder))) throw fail('A location cannot be inside the main storage folder or contain it.');
      if (cacheDir && (within(folder, cacheDir) || within(cacheDir, folder))) throw fail('A location cannot be inside the cache folder or contain it.');
      if (mountedDrive && folder.slice(0, 2).toUpperCase() === mountedDrive.slice(0, 2).toUpperCase()) throw fail('A location cannot be on the encrypted drive itself.');
      for (const other of folders) {
        if (samePath(other, folder)) throw fail('The same folder is used twice.');
        if (within(folder, other) || within(other, folder)) throw fail('One location folder is inside another.');
      }
      folders.push(folder); location.path = folder;
    } else if (kind === 'registry') {
      if (typeof item.repository !== 'string' || !REPOSITORY.test(item.repository)) throw fail('Enter the repository as user/name.');
      location.repository = item.repository;
      location.visibility = item.visibility === 'private' ? 'private' : 'public';
    }
    if (kind === 'main') main = location; else locations.push(location);
  }
  main ??= { id: MAIN, kind: 'main', role: 'share', label: 'Main storage', weight: 1, capacityBytes: 0, enabled: true, removableHint: false };
  main.enabled = true; main.capacityBytes = 0;
  const all = [main, ...locations];
  const shares = all.filter(location => location.role === 'share' && location.enabled);
  const copies = integer(input.copies, { min: 1, max: Math.max(1, shares.length), fallback: 1 });
  if (enabled && !shares.some(location => location.weight > 0)) throw fail('Give at least one location a share above zero.');
  const rules = input.rules ?? [];
  if (!Array.isArray(rules) || rules.length > MAX_RULES) throw fail(`Use at most ${MAX_RULES} rules.`);
  const normalizedRules = rules.map(rule => {
    if (!rule || typeof rule !== 'object' || !validRule(rule.match)) throw fail('Rules use patterns such as Projects/** or *.mp4.');
    const location = rule.location ?? 'spread';
    if (location !== 'spread' && !shares.some(item => item.id === location)) throw fail('A rule points at a location that is not an enabled share.');
    return { match: rule.match, location };
  });
  return { enabled, copies, safetyBackup, locations: all, rules: normalizedRules };
}

/** Reads placement.json. A missing file is an empty placement; a damaged one is an error, never silently replaced. */
export async function readPlacement(storageDir) {
  const file = path.join(storageDir, PLACEMENT_FILE);
  let stat;
  try { stat = await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_PLACEMENT_BYTES) throw fail('The split storage placement file is damaged.');
  let value;
  try { value = JSON.parse(await fs.readFile(file, 'utf8')); } catch { throw fail('The split storage placement file is damaged.'); }
  if (!value || value.format !== 1 || typeof value.vaultId !== 'string' || !Array.isArray(value.locations)) throw fail('The split storage placement file is damaged.');
  value.parts ??= {}; value.sizes ??= {}; value.pins ??= {}; value.registryObjects ??= {}; value.mirrors ??= {};
  if (value.safetyBackup === undefined) value.safetyBackup = true;
  for (const location of value.locations) location.role ??= 'share';
  for (const [part, holders] of Object.entries(value.parts))
    if (!PART.test(part) || !Array.isArray(holders) || holders.length < 1 || holders.some(id => !value.locations.some(location => location.id === id))) throw fail('The split storage placement file is damaged.');
  return value;
}

/** Writes JSON durably: temporary file, fsync, rename over the old file. */
export async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, 'wx', 0o600);
  try {
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

export async function writePlacement(storageDir, value) {
  value.revision = (value.revision ?? 0) + 1;
  await writeJsonAtomic(path.join(storageDir, PLACEMENT_FILE), value);
  return value;
}

/** A new placement with nothing moved yet. */
export function emptyPlacement(vaultId) {
  return { format: 1, vaultId, revision: 0, enabled: false, copies: 1, safetyBackup: true,
    locations: [{ id: MAIN, kind: 'main', role: 'share', label: 'Main storage', weight: 1, capacityBytes: 0, enabled: true, removableHint: false }],
    rules: [], parts: {}, sizes: {}, pins: {}, registryObjects: {}, mirrors: {}, job: null };
}
