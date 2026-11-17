import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDriveLocations, restrictToOwner } from '../src/main/drive-locations.js';

async function scratch() { return fs.mkdtemp(path.join(os.tmpdir(), 'drive-locations-')); }

test('each drive gets its own storage and cache folders inside the application data area', async () => {
  const base = await scratch();
  try {
    const locations = createDriveLocations({ root: path.join(base, 'Drives'), restrict: async () => true });
    const first = await locations.allocate(), second = await locations.allocate();
    assert.notEqual(first.driveId, second.driveId);
    for (const item of [first, second]) {
      assert.match(item.driveId, /^[a-f0-9]{16}$/);
      assert.equal(item.storageDir, path.join(locations.root, item.driveId, 'storage'));
      assert.equal(item.cacheDir, path.join(locations.root, item.driveId, 'cache'));
      assert.ok(locations.owns(item.storageDir) && locations.owns(item.cacheDir));
      assert.equal((await fs.stat(item.storageDir)).isDirectory(), true);
      assert.deepEqual(await fs.readdir(item.storageDir), [], 'new storage starts empty');
    }
    assert.equal(first.ownerOnly, true);
    assert.equal(locations.owns(path.join(base, 'elsewhere')), false);
    assert.equal(locations.owns(locations.root), false, 'the area itself is not a drive folder');
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test('an existing folder is never reused and a rule failure leaves nothing behind', async () => {
  const base = await scratch();
  try {
    const root = path.join(base, 'Drives'); await fs.mkdir(path.join(root, 'aaaaaaaaaaaaaaaa'), { recursive: true });
    const ids = ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'];
    const locations = createDriveLocations({ root, restrict: async () => true, newId: () => ids.shift() });
    assert.equal((await locations.allocate()).driveId, 'bbbbbbbbbbbbbbbb', 'the colliding id is skipped');
    const failing = createDriveLocations({ root, restrict: async () => true, newId: () => 'cccccccccccccccc', validate: async () => { throw Error('Rejected by the destination rules.'); } });
    await assert.rejects(failing.allocate(), /Rejected/);
    await assert.rejects(fs.stat(path.join(root, 'cccccccccccccccc')), { code: 'ENOENT' });
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test('a linked data area is refused', { skip: process.platform === 'win32' && !process.env.MFE_TEST_SYMLINKS }, async () => {
  const base = await scratch();
  try {
    const real = path.join(base, 'real'); await fs.mkdir(real);
    await fs.symlink(real, path.join(base, 'link'), 'junction');
    await assert.rejects(createDriveLocations({ root: path.join(base, 'link'), restrict: async () => true }).allocate(), /Linked/);
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test('only an empty drive folder is discarded', async () => {
  const base = await scratch();
  try {
    const locations = createDriveLocations({ root: path.join(base, 'Drives'), restrict: async () => true });
    const empty = await locations.allocate(), filled = await locations.allocate();
    await fs.writeFile(path.join(filled.storageDir, 'vault.json'), '{}');
    assert.equal(await locations.discardEmpty(empty.driveId), true);
    assert.equal(await locations.discardEmpty(filled.driveId), false);
    await assert.rejects(fs.stat(empty.directory), { code: 'ENOENT' });
    assert.equal((await fs.stat(filled.storageDir)).isDirectory(), true);
    await assert.rejects(locations.discardEmpty('../escape'), /Invalid/);
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test('owner-only restriction on Windows removes inherited access and grants only the account and the system', async () => {
  const calls = [];
  const ok = await restrictToOwner('C:\\Data\\Drives\\a', { platform: 'win32', user: 'Pat', domain: 'PC', systemRoot: 'C:\\Windows', run: (file, args, _options, done) => { calls.push({ file, args }); done(null); } });
  assert.equal(ok, true);
  assert.match(calls[0].file, /icacls\.exe$/);
  assert.ok(calls[0].args.includes('/inheritance:r'));
  assert.ok(calls[0].args.includes('PC\\Pat:(OI)(CI)F'));
  assert.equal(await restrictToOwner('C:\\x', { platform: 'win32', user: 'bad|name', run: () => { throw Error('must not run'); } }), false);
  assert.equal(await restrictToOwner('C:\\x', { platform: 'win32', user: 'Pat', run: (_f, _a, _o, done) => done(Error('failed')) }), false);
});
