import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import { releaseVersion, stampReleaseVersion, verifyReleaseVersion } from '../scripts/release-version.mjs';

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
  await verifyReleaseVersion(root, actual.version);
  await assert.rejects(verifyReleaseVersion(root, '1.124.1'), /RELEASE_PACKAGE_VERSION_MISMATCH/);
  pinned.packages[''].version='1.122.1';
  await fs.writeFile(path.join(root,'package-lock.json'),JSON.stringify(pinned));
  await assert.rejects(verifyReleaseVersion(root, actual.version), /RELEASE_LOCK_VERSION_MISMATCH/);
});

test('publisher version admission runs in Windows PowerShell with an empty lockfile root key', {skip:process.platform!=='win32'}, async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'release-publisher-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'scripts'));
  await fs.copyFile(new URL('../scripts/release-version.mjs',import.meta.url),path.join(root,'scripts/release-version.mjs'));
  const manifest={name:'fixture',version:'1.123.1'};
  const lock={...manifest,packages:{'':{...manifest}}};
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify(manifest));
  await fs.writeFile(path.join(root,'package-lock.json'),JSON.stringify(lock));
  const publisher=await fs.readFile(new URL('../.github/scripts/publish-preview.ps1',import.meta.url),'utf8');
  const admission=publisher.match(/^& node scripts\/release-version\.mjs --verify \$packageVersion\r?\nAssert \(\$LASTEXITCODE -eq 0\) 'RELEASE_MANIFEST_VERIFICATION_FAILED'/m)?.[0];
  assert.ok(admission,'exercise the actual publication admission boundary');
  const run=command=>spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000});
  const old=run("$ErrorActionPreference='Stop'; Get-Content package-lock.json -Raw | ConvertFrom-Json | Out-Null");
  assert.notEqual(old.status,0,'the original empty-key parser must demonstrate the regression');
  const command="$ErrorActionPreference='Stop'; function Assert([bool]$condition,[string]$message){if(!$condition){throw $message}}; $packageVersion='1.123.1';\n"+admission;
  const positive=run(command);assert.equal(positive.status,0,positive.stderr);
  lock.packages[''].version='1.122.1';
  await fs.writeFile(path.join(root,'package-lock.json'),JSON.stringify(lock));
  const negative=run(command);assert.notEqual(negative.status,0);assert.match(negative.stderr,/RELEASE_LOCK_VERSION_MISMATCH/);
});
