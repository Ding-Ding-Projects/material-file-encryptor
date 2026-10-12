import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

test('release index normalization preserves valid bytes and rejects invalid feeds before writing', { skip: process.platform !== 'win32' }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-release-index-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const packagePath = path.join(root, 'MaterialFileEncryptor-1.2.3-full.nupkg');
  const index = path.join(root, 'RELEASES');
  const packageBytes = Buffer.from('synthetic non-executable package');
  await fs.writeFile(packagePath, packageBytes);
  const valid = Buffer.from(`${createHash('sha1').update(packageBytes).digest('hex')} ${path.basename(packagePath)} ${packageBytes.length}\r\n`);
  const script = path.join(root, 'run.ps1');
  const literal = value => `'${value.replaceAll("'", "''")}'`;
  await fs.writeFile(script, `$ErrorActionPreference='Stop'\n. ${literal(path.resolve('scripts/squirrel-file-hash.ps1'))}\n. ${literal(path.resolve('scripts/squirrel-release-index.ps1'))}\nConvertTo-CompatibleSquirrelReleaseIndex -Index ${literal(index)} -Package ${literal(packagePath)}\n`);
  const run = () => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { stdio: 'pipe' });
  for (const raw of [valid, Buffer.concat([Buffer.from([239,187,191]), valid])]) {
    await fs.writeFile(index, raw); run(); assert.deepEqual(await fs.readFile(index), valid);
  }
  for (const raw of [Buffer.from(valid.toString().replace(/^[a-f0-9]/, '0')), Buffer.from(valid.toString().replace('1.2.3', '9.9.9')), Buffer.concat([valid, valid]), Buffer.concat([valid, Buffer.from([255])]), Buffer.alloc(4097), Buffer.from(valid.toString().replace(` ${packageBytes.length}\r`, ' 1\r'))]) {
    await fs.writeFile(index, raw); assert.throws(run); assert.deepEqual(await fs.readFile(index), raw);
  }
});
