import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { releaseVersion, stampReleaseVersion } from '../scripts/release-version.mjs';

test('release identity advances across runs and attempts and rejects invalid native versions', () => {
  assert.equal(releaseVersion('123', '1'), '1.123.1');
  assert.equal(releaseVersion('123', '2'), '1.123.2');
  assert.equal(releaseVersion('124', '1'), '1.124.1');
  for (const number of ['0', '-1', '01', '65536', '', undefined])
    assert.throws(() => releaseVersion(number, '1'), /INVALID_RELEASE_VERSION/);
});

test('stamping preserves dependency pins and keeps manifest and lock roots coherent', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'release-version-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const manifest = { name: 'fixture', version: '0.2.0', dependencies: { pinned: '2.5.0' } };
  const lock = { name: 'fixture', version: '0.2.0', packages: { '': { ...manifest }, 'node_modules/pinned': { version: '2.5.0', integrity: 'unchanged' } } };
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(root, 'package-lock.json'), JSON.stringify(lock));
  await stampReleaseVersion(root, releaseVersion('123', '1'));
  const actual = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
  const pinned = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json')));
  assert.equal(actual.version, '1.123.1');
  assert.equal(pinned.version, actual.version);
  assert.equal(pinned.packages[''].version, actual.version);
  assert.deepEqual(actual.dependencies, manifest.dependencies);
  assert.deepEqual(pinned.packages['node_modules/pinned'], lock.packages['node_modules/pinned']);
});
