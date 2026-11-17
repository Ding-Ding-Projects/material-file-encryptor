import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { PART, mirrorRoot } from './config.js';
import { mirrorParts, sha256 } from './folder-location.js';

const OBJECT = /^(?:[0-9a-f]{32}|[0-9a-f]{64})\.mfe$/;
const METADATA = ['commits', 'activity'];

async function listObjects(folder) {
  try { return (await fs.readdir(folder)).filter(name => OBJECT.test(name)).sort(); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function sameBytes(a, b) {
  try { return sha256(await fs.readFile(a)) === sha256(await fs.readFile(b)); } catch { return false; }
}
/** Copies one file durably: temporary file, fsync, rename, re-read. */
async function copyDurable(from, to) {
  const bytes = await fs.readFile(from);
  await fs.mkdir(path.dirname(to), { recursive: true });
  const temporary = path.join(path.dirname(to), `.${path.basename(to)}.${randomUUID()}.tmp`);
  const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporary, to);
  } finally { await fs.rm(temporary, { force: true }); }
  if (sha256(await fs.readFile(to)) !== sha256(bytes)) throw Error('A mirror copy did not verify.');
}

/** Every part the drive holds anywhere: the main folder plus every part recorded in placement.json. */
export async function allParts(storageDir, placement) {
  const names = new Set((await listObjects(path.join(storageDir, 'parts'))).map(name => name.slice(0, -4)));
  for (const part of Object.keys(placement?.parts ?? {})) if (PART.test(part)) names.add(part);
  return [...names].sort();
}

/** How far a folder mirror is behind the drive, from directory listings only. */
export async function folderMirrorState({ storageDir, vaultId, location, placement, sizes = {} }) {
  const root = mirrorRoot(location.path, vaultId), parts = mirrorParts(location, vaultId);
  if (!await parts.connected()) return { connected: false, upToDate: false, behindParts: null, behindBytes: null };
  const have = new Set(await parts.list());
  const missing = (await allParts(storageDir, placement)).filter(part => !have.has(part));
  let metadataBehind = false;
  for (const folder of METADATA) {
    const mirrored = new Set(await listObjects(path.join(root, folder)));
    if ((await listObjects(path.join(storageDir, folder))).some(name => !mirrored.has(name))) metadataBehind = true;
  }
  if (!await sameBytes(path.join(storageDir, 'vault.json'), path.join(root, 'vault.json'))) metadataBehind = true;
  return { connected: true, upToDate: missing.length === 0 && !metadataBehind, behindParts: missing.length,
    behindBytes: missing.reduce((sum, part) => sum + (sizes[part] ?? 0), 0) };
}

/**
 * Brings a folder mirror up to date so it stays an independently openable storage folder.
 * Order: new parts first (each verified), then commits and activity, then vault.json last, then prune.
 * The metadata list is taken before parts are copied, and the engine publishes parts before the metadata
 * that references them, so every mirrored commit finds its parts. If any part cannot be copied the metadata
 * step is skipped, leaving the previous consistent mirror in place.
 */
export async function updateFolderMirror({ storageDir, vaultId, location, placement, readPart, signal, hooks = {} }) {
  const root = mirrorRoot(location.path, vaultId), parts = mirrorParts(location, vaultId);
  if (!await parts.connected()) throw Error(`${location.label} is not connected.`);
  await fs.mkdir(root, { recursive: true });
  const metadata = {};
  for (const folder of METADATA) metadata[folder] = await listObjects(path.join(storageDir, folder));
  const wanted = await allParts(storageDir, placement), have = new Set(await parts.list());
  let copiedParts = 0, copiedBytes = 0;
  for (const part of wanted) {
    signal?.throwIfAborted();
    if (have.has(part)) continue;
    const bytes = await readPart(part, signal);
    if (placement?.hashes?.[part] && sha256(bytes) !== placement.hashes[part]) throw Error('A source copy of an encrypted part is damaged; the mirror was left unchanged.');
    await parts.write(part, bytes); copiedParts++; copiedBytes += bytes.length;
  }
  await hooks.afterParts?.();
  for (const folder of METADATA) for (const name of metadata[folder]) {
    signal?.throwIfAborted();
    const from = path.join(storageDir, folder, name), to = path.join(root, folder, name);
    if (!await sameBytes(from, to)) await copyDurable(from, to);
  }
  // vault.json last: until it lands, an older but complete mirror stays openable.
  if (!await sameBytes(path.join(storageDir, 'vault.json'), path.join(root, 'vault.json'))) await copyDurable(path.join(storageDir, 'vault.json'), path.join(root, 'vault.json'));
  const keep = new Set(wanted); let prunedParts = 0;
  for (const part of await parts.list()) if (!keep.has(part)) { await parts.remove(part); prunedParts++; }
  return { copiedParts, copiedBytes, prunedParts };
}

/** Re-reads every mirrored part and compares it with the recorded hash or the main copy. */
export async function verifyFolderMirror({ storageDir, vaultId, location, placement }) {
  const parts = mirrorParts(location, vaultId), damaged = [], missing = [];
  if (!await parts.connected()) throw Error(`${location.label} is not connected.`);
  const have = new Set(await parts.list());
  for (const part of await allParts(storageDir, placement)) {
    if (!have.has(part)) { missing.push(part); continue; }
    const expected = placement?.hashes?.[part] ?? await fs.readFile(path.join(storageDir, 'parts', `${part}.mfe`)).then(sha256, () => null);
    if (expected && await parts.hash(part) !== expected) damaged.push(part);
  }
  return { checkedParts: have.size, missingParts: missing.length, damagedParts: damaged.length };
}

/** Publishes the complete storage folder as one registry backup snapshot. Skipped when nothing changed. */
export async function updateRegistryMirror({ storageDir, vaultId, location, placement, readPart, storage, state = {}, deviceId, signal }) {
  const files = [{ path: 'vault.json', file: path.join(storageDir, 'vault.json') }];
  for (const folder of METADATA) for (const name of await listObjects(path.join(storageDir, folder))) files.push({ path: `${folder}/${name}`, file: path.join(storageDir, folder, name) });
  for (const part of await allParts(storageDir, placement)) files.push({ path: `parts/${part}.mfe`, part });
  const fingerprint = createHash('sha256').update(files.map(item => item.path).join('\n')).digest('hex');
  if (state.fingerprint === fingerprint && state.digest) return { ...state, skipped: true };
  const rows = [];
  const bytesOf = async item => item.part ? readPart(item.part, signal) : fs.readFile(item.file);
  for (const item of files) { const bytes = await bytesOf(item); rows.push({ path: item.path, bytes: bytes.length, sha256: sha256(bytes) }); }
  const result = await storage.publish({ vaultId, deviceId, parents: state.digest ? [state.digest] : [], files: rows,
    readFile: async name => bytesOf(files.find(item => item.path === name)) }, signal);
  if (result?.verified !== true) throw Error(`${location.label} did not confirm the upload.`);
  return { digest: result.digest, fingerprint };
}
