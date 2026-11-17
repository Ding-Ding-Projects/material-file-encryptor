import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createSplitStorageService } from '../src/main/split-storage/service.js';

const VAULT = 'c'.repeat(32);
const envelope = length => { const bytes = Buffer.alloc(length + 36); bytes.write('MFE1'); bytes.writeInt32LE(length, 4); return bytes.toString('base64'); };
const vaultJson = () => JSON.stringify({ Format: 3, VaultId: VAULT, Kind: 'password', Iterations: 600000, Salt: randomBytes(32).toString('base64'), WrappedKey: envelope(32), KeyCheck: envelope(32) });

async function fixture(t, { locked = true } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'split-service-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const storageDir = path.join(root, 'source'), cacheDir = path.join(root, 'cache'), usb = path.join(root, 'usb');
  for (const folder of ['parts', 'commits', 'activity']) await fs.mkdir(path.join(storageDir, folder), { recursive: true });
  await fs.mkdir(path.join(cacheDir, 'parts'), { recursive: true }); await fs.mkdir(usb);
  await fs.writeFile(path.join(storageDir, 'vault.json'), vaultJson());
  const parts = [];
  for (let i = 0; i < 8; i++) { const id = randomBytes(16).toString('hex'); parts.push(id); await fs.writeFile(path.join(storageDir, 'parts', `${id}.mfe`), randomBytes(3000)); }
  const context = { storageDir, cacheDir, transport: 'folder', locked, mountedDrive: null, busy: false };
  const calls = [];
  const lease = { storageOnly: true };
  const service = createSplitStorageService({
    contexts: id => id === undefined ? [context] : context,
    nativeRequest: async (method, params) => {
      calls.push(method);
      if (method === 'beginSnapshot') return { leaseId: 'lease-1', storageDir: params.storageDir, ...lease };
      if (method === 'releaseSnapshot') return { released: true };
      throw Error(`unexpected ${method}`);
    },
    pickFolder: async () => usb,
  });
  t.after(() => service.close());
  return { root, storageDir, cacheDir, usb, parts, context, calls, lease, service };
}
const exists = file => fs.access(file).then(() => true, () => false);

test('apply moves parts to a picked folder under the locked folder lease, with safety backup on', async t => {
  const f = await fixture(t);
  const picked = await f.service.chooseFolder('main');
  assert.equal(picked.path, f.usb); assert.equal(picked.sameDisk, true);
  const saved = await f.service.save('main', { enabled: true, locations: [{ kind: 'main', weight: 0 }, { kind: 'folder', path: picked.path, label: 'USB backup', weight: 1 }] });
  assert.equal(saved.safetyBackup, true); assert.equal(saved.plan.movesPending, 8);
  await f.service.apply('main'); await f.service.settle();
  const status = await f.service.status('main');
  assert.equal(status.job.phase, 'done', status.job.reason);
  assert.deepEqual(f.calls.filter(name => name.endsWith('Snapshot')), ['beginSnapshot', 'releaseSnapshot']);
  for (const id of f.parts) assert.equal(await exists(path.join(f.storageDir, 'parts', `${id}.mfe`)), false);
  const share = status.locations.find(row => row.kind === 'folder');
  assert.equal(share.storedParts, 8); assert.equal(share.connected, true);
  assert.equal(await exists(path.join(f.usb, 'MaterialFileEncryptor-Split', VAULT, 'placement.json')), true, 'the location describes itself');
  // Bring everything back.
  await f.service.disable('main'); await f.service.settle();
  for (const id of f.parts) assert.equal(await exists(path.join(f.storageDir, 'parts', `${id}.mfe`)), true);
  assert.equal((await f.service.status('main')).enabled, false);
});

test('moves are refused while the drive is unlocked or when the lease is a staged copy', async t => {
  const f = await fixture(t, { locked: false });
  await assert.rejects(f.service.apply('main'), /Lock the drive/);
  f.context.locked = true; f.lease.storageOnly = false;
  await f.service.chooseFolder('main');
  await f.service.save('main', { enabled: true, locations: [{ kind: 'main', weight: 0 }, { kind: 'folder', path: f.usb, weight: 1 }] }).catch(() => {});
  await f.service.apply('main'); await f.service.settle();
  const status = await f.service.status('main');
  assert.equal(status.job.phase, 'stopped'); assert.match(status.job.reason, /Lock the drive/);
  assert.equal(f.calls.at(-1), 'releaseSnapshot', 'the lease is always released');
  for (const id of f.parts) assert.equal(await exists(path.join(f.storageDir, 'parts', `${id}.mfe`)), true);
});

test('folders must come from the picker and a location holding the only copy cannot be removed', async t => {
  const f = await fixture(t);
  await assert.rejects(f.service.save('main', { enabled: true, locations: [{ kind: 'folder', path: path.join(f.root, 'typed'), weight: 1 }] }), /folder picker/);
  await f.service.chooseFolder('main');
  const saved = await f.service.save('main', { enabled: true, locations: [{ kind: 'main', weight: 0 }, { kind: 'folder', path: f.usb, weight: 1 }] });
  await f.service.apply('main'); await f.service.settle();
  await assert.rejects(f.service.save('main', { enabled: true, locations: [{ kind: 'main', weight: 1 }] }), /only copy/);
  assert.ok(saved.locations.some(row => row.kind === 'folder'));
});

test('hydration writes only to the requesting drive cache and only from a recorded registry holder', async t => {
  const f = await fixture(t);
  const part = f.parts[0], destination = path.join(f.cacheDir, 'parts', `${part}.mfe.${'d'.repeat(32)}.fetch.tmp`);
  await assert.rejects(f.service.hydrate({ storageDir: f.storageDir, part, location: 'hub-1', destination: path.join(f.root, 'elsewhere.tmp') }), /not a cache part/);
  await assert.rejects(f.service.hydrate({ storageDir: path.join(f.root, 'other'), part, location: 'hub-1', destination }), /not open/);
  await assert.rejects(f.service.hydrate({ storageDir: f.storageDir, part, location: 'hub-1', destination }), /does not hold/);
  assert.equal(await exists(destination), false);
});
