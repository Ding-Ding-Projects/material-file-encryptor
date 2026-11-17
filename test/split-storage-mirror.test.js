import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { updateFolderMirror, folderMirrorState, verifyFolderMirror } from '../src/main/split-storage/mirror.js';
import { normalizeSplitConfig, mirrorRoot } from '../src/main/split-storage/config.js';

const VAULT = 'a'.repeat(32);
const id = () => randomBytes(16).toString('hex');
async function storage(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'split-mirror-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  for (const folder of ['parts', 'commits', 'activity']) await fs.mkdir(path.join(source, folder), { recursive: true });
  await fs.writeFile(path.join(source, 'vault.json'), '{"VaultId":"first"}');
  const add = async (folder, name = id()) => { await fs.writeFile(path.join(source, folder, `${name}.mfe`), randomBytes(500)); return name; };
  const location = { id: 'mirror-1', kind: 'folder', role: 'mirror', label: 'Backup folder', path: path.join(root, 'backup') };
  await fs.mkdir(location.path);
  const readPart = part => fs.readFile(path.join(source, 'parts', `${part}.mfe`));
  return { root, source, add, location, readPart, mirror: mirrorRoot(location.path, VAULT) };
}
const names = async folder => (await fs.readdir(folder).catch(() => [])).filter(name => name.endsWith('.mfe')).sort();

test('a mirror is laid out exactly like a storage folder', async t => {
  const s = await storage(t);
  await s.add('parts'); await s.add('parts'); await s.add('commits'); await s.add('activity');
  await updateFolderMirror({ storageDir: s.source, vaultId: VAULT, location: s.location, placement: null, readPart: s.readPart });
  for (const folder of ['parts', 'commits', 'activity']) assert.deepEqual(await names(path.join(s.mirror, folder)), await names(path.join(s.source, folder)));
  assert.equal(await fs.readFile(path.join(s.mirror, 'vault.json'), 'utf8'), '{"VaultId":"first"}');
  const state = await folderMirrorState({ storageDir: s.source, vaultId: VAULT, location: s.location, placement: null });
  assert.equal(state.upToDate, true);
  assert.equal((await verifyFolderMirror({ storageDir: s.source, vaultId: VAULT, location: s.location, placement: null })).damagedParts, 0);
});

test('a crash between parts and metadata leaves the previous mirror consistent', async t => {
  const s = await storage(t);
  await s.add('parts'); const oldCommit = await s.add('commits');
  await updateFolderMirror({ storageDir: s.source, vaultId: VAULT, location: s.location, placement: null, readPart: s.readPart });
  await s.add('parts'); await s.add('commits'); await fs.writeFile(path.join(s.source, 'vault.json'), '{"VaultId":"second"}');
  await assert.rejects(updateFolderMirror({ storageDir: s.source, vaultId: VAULT, location: s.location, placement: null, readPart: s.readPart, hooks: { afterParts: () => { throw Error('power lost'); } } }), /power lost/);
  assert.deepEqual(await names(path.join(s.mirror, 'commits')), [`${oldCommit}.mfe`], 'new metadata reached the mirror before it finished');
  assert.equal(await fs.readFile(path.join(s.mirror, 'vault.json'), 'utf8'), '{"VaultId":"first"}');
  // Every part the old metadata needs is still present; the new part is an unreferenced extra.
  assert.equal((await names(path.join(s.mirror, 'parts'))).length, 2);
  await updateFolderMirror({ storageDir: s.source, vaultId: VAULT, location: s.location, placement: null, readPart: s.readPart });
  assert.equal((await folderMirrorState({ storageDir: s.source, vaultId: VAULT, location: s.location, placement: null })).upToDate, true);
});

test('a source part that cannot be read leaves the mirror metadata unchanged', async t => {
  const s = await storage(t);
  const placed = id(); await s.add('commits');
  const placement = { parts: { [placed]: ['usb'] }, hashes: {} };
  await assert.rejects(updateFolderMirror({ storageDir: s.source, vaultId: VAULT, location: s.location, placement, readPart: async () => { throw Error('USB backup (E:) is not connected.'); } }), /not connected/);
  assert.deepEqual(await names(path.join(s.mirror, 'commits')), []);
});

test('a disconnected mirror is reported behind and catches up when reconnected', async t => {
  const s = await storage(t);
  await s.add('parts'); await s.add('commits');
  await updateFolderMirror({ storageDir: s.source, vaultId: VAULT, location: s.location, placement: null, readPart: s.readPart });
  const unplugged = `${s.location.path}-unplugged`; await fs.rename(s.location.path, unplugged);
  await s.add('parts'); await s.add('commits');
  assert.equal((await folderMirrorState({ storageDir: s.source, vaultId: VAULT, location: s.location, placement: null })).connected, false);
  await assert.rejects(updateFolderMirror({ storageDir: s.source, vaultId: VAULT, location: s.location, placement: null, readPart: s.readPart }), /not connected/);
  await fs.rename(unplugged, s.location.path);
  const behind = await folderMirrorState({ storageDir: s.source, vaultId: VAULT, location: s.location, placement: null });
  assert.equal(behind.upToDate, false); assert.equal(behind.behindParts, 1);
  await updateFolderMirror({ storageDir: s.source, vaultId: VAULT, location: s.location, placement: null, readPart: s.readPart });
  assert.equal((await folderMirrorState({ storageDir: s.source, vaultId: VAULT, location: s.location, placement: null })).upToDate, true);
});

test('locations may share the main disk but never nest, repeat, or sit in storage, cache or the drive', () => {
  const base = path.join(os.tmpdir(), 'split-config'), storageDir = path.join(base, 'source'), cacheDir = path.join(base, 'cache');
  const folder = (p, role = 'share') => ({ kind: 'folder', role, path: p, label: 'x' });
  const ok = normalizeSplitConfig({ locations: [folder(path.join(base, 'backup'), 'mirror'), folder(path.join(base, 'share'))] }, { storageDir, cacheDir });
  assert.equal(ok.locations.length, 3, 'same-disk folders are allowed');
  assert.equal(ok.safetyBackup, true, 'safety backup defaults on');
  const refuse = (locations, pattern, extra = {}) => assert.throws(() => normalizeSplitConfig({ locations }, { storageDir, cacheDir, ...extra }), pattern);
  refuse([folder(path.join(storageDir, 'inner'))], /main storage folder/);
  refuse([folder(base)], /main storage folder/);
  refuse([folder(path.join(cacheDir, 'x'))], /cache folder/);
  refuse([folder(path.join(base, 'a')), folder(path.join(base, 'a'))], /same folder/);
  refuse([folder(path.join(base, 'a')), folder(path.join(base, 'a', 'b'))], /inside another/);
  refuse([folder('Q:\\split')], /encrypted drive/, { mountedDrive: 'Q:' });
  refuse([folder('relative/path')], /folder picker/);
  assert.equal(normalizeSplitConfig({ safetyBackup: false }, { storageDir }).safetyBackup, false);
});
