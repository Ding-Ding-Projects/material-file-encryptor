import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { planRegistrySnapshot } from '../src/main/registry-snapshot-plan.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function record(size = 32, fill = 0x54) { const b = Buffer.alloc(size + 36, fill); b.write('MFE1'); b.writeInt32LE(size, 4); return b; }
async function storage(t) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'snapshot-plan-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'); await fs.mkdir(path.join(source, 'parts'), { recursive: true });
  const configuration = { Format: 3, VaultId: 'a'.repeat(32), Kind: 'password', Iterations: 600000,
    Salt: Buffer.alloc(32).toString('base64'), WrappedKey: record().toString('base64'), KeyCheck: record().toString('base64') };
  await fs.writeFile(path.join(source, 'vault.json'), JSON.stringify(configuration));
  const parts = [];
  for (let i = 0; i < 3; i++) { const bytes = record(1000 + i, 0x40 + i); const name = `parts/${sha(bytes)}.mfe`; await fs.writeFile(path.join(source, name), bytes); parts.push({ name, bytes }); }
  return { root, source, parts, work: path.join(root, 'work') };
}

test('objects the registry already holds are referenced by digest and never read or copied', async t => {
  const s = await storage(t);
  const known = new Map([[s.parts[0].name, { size: s.parts[0].bytes.length, digest: 'sha256:' + sha(s.parts[0].bytes) }]]);
  const progress = [];
  const plan = await planRegistrySnapshot({ stagedRoot: s.source, stagedIsTemporary: false, known, workRoot: s.work, onProgress: value => progress.push(value) });
  t.after(() => plan.dispose());
  assert.equal(plan.manifest.vaultId, 'a'.repeat(32));
  assert.equal(plan.manifest.files.length, 4);
  assert.deepEqual(plan.upload.map(file => file.path).sort(), [s.parts[1].name, s.parts[2].name, 'vault.json'].sort());
  assert.ok(plan.reused.has(s.parts[0].name));
  // Only the mutable vault.json was copied; immutable objects are read in place.
  assert.deepEqual(await fs.readdir(plan.directory), ['vault.json']);
  assert.deepEqual(await plan.read(s.parts[1].name), s.parts[1].bytes);
  assert.equal(progress.at(-1).completedFiles, 3); assert.equal(progress.at(-1).totalFiles, 3);
  assert.equal(plan.uploadBytes, plan.upload.reduce((n, file) => n + file.bytes, 0));
});

test('a part known under the same path but a different size is read again, never trusted', async t => {
  const s = await storage(t);
  const known = new Map([[s.parts[0].name, { size: 1, digest: 'sha256:' + 'f'.repeat(64) }]]);
  const plan = await planRegistrySnapshot({ stagedRoot: s.source, stagedIsTemporary: false, known, workRoot: s.work });
  t.after(() => plan.dispose());
  assert.ok(plan.upload.some(file => file.path === s.parts[0].name));
});

test('a temporary staged copy is copied out, and parts left in storage are read from there', async t => {
  const s = await storage(t);
  const staged = path.join(s.root, 'staged'); await fs.mkdir(path.join(staged, 'parts'), { recursive: true });
  await fs.copyFile(path.join(s.source, 'vault.json'), path.join(staged, 'vault.json'));
  await fs.copyFile(path.join(s.source, s.parts[2].name), path.join(staged, s.parts[2].name));
  const plan = await planRegistrySnapshot({ stagedRoot: staged, stagedIsTemporary: true, sourceRoot: s.source, sourceParts: [s.parts[0].name, s.parts[1].name], workRoot: s.work });
  t.after(() => plan.dispose());
  assert.equal(plan.manifest.files.length, 4);
  await fs.rm(staged, { recursive: true });
  assert.deepEqual(await plan.read(s.parts[2].name), s.parts[2].bytes, 'the staged copy survives the drive releasing its folder');
  assert.deepEqual(await plan.read(s.parts[0].name), s.parts[0].bytes);
});

test('a changed object is refused at upload, and a wrong content address is refused at planning', async t => {
  const s = await storage(t);
  const plan = await planRegistrySnapshot({ stagedRoot: s.source, stagedIsTemporary: false, workRoot: s.work });
  t.after(() => plan.dispose());
  await fs.writeFile(path.join(s.source, s.parts[1].name), record(1001, 0x00));
  await assert.rejects(plan.read(s.parts[1].name), /changed/);
  const bad = await storage(t); const wrong = `parts/${'0'.repeat(64)}.mfe`;
  await fs.writeFile(path.join(bad.source, wrong), record(10));
  await assert.rejects(planRegistrySnapshot({ stagedRoot: bad.source, stagedIsTemporary: false, workRoot: bad.work }), /invalid hash/);
  assert.deepEqual(await fs.readdir(bad.work).catch(() => []), [], 'a refused plan leaves no work folder behind');
});
