import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { runRebalance } from '../src/main/split-storage/mover.js';
import { createFolderParts, sha256 } from '../src/main/split-storage/folder-location.js';

async function fixture(t, count = 6) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'split-mover-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const main = createFolderParts({ id: 'main', label: 'Main storage', partsDirectory: path.join(root, 'source', 'parts'), root: path.join(root, 'source') });
  const usb = createFolderParts({ id: 'usb', label: 'USB backup (E:)', partsDirectory: path.join(root, 'usb', 'parts'), root: path.join(root, 'usb') });
  await fs.mkdir(path.join(root, 'usb'), { recursive: true });
  const ids = [], content = {};
  for (let i = 0; i < count; i++) {
    const id = randomBytes(16).toString('hex'), bytes = randomBytes(2000 + i);
    await main.write(id, bytes); ids.push(id); content[id] = sha256(bytes);
  }
  ids.sort();
  const placement = { parts: {}, hashes: {} };
  const persisted = [];
  const persist = async () => { persisted.push(structuredClone(placement)); };
  return { root, main, usb, ids, content, placement, persisted, persist, adapters: new Map([['main', main], ['usb', usb]]), connected: new Set(['main', 'usb']) };
}
const everyTo = (ids, holders) => new Map(ids.map(id => [id, holders]));
const run = (f, options) => runRebalance({ placement: f.placement, adapters: f.adapters, connected: f.connected, persist: f.persist, job: {}, ...options });

/** Wraps an adapter so selected calls fail. */
function failing(adapter, { writeAfter = Infinity, hashBad = new Set() } = {}) {
  let writes = 0;
  return { ...adapter, writes: () => writes,
    async write(part, bytes) { if (++writes > writeAfter) throw Error('The device stopped responding.'); return adapter.write(part, bytes); },
    async hash(part) { return hashBad.has(part) ? 'damaged' : adapter.hash(part); } };
}

test('safety backup moves parts only after every copy and a final verification', async t => {
  const f = await fixture(t);
  const job = await run(f, { targets: everyTo(f.ids, ['usb']), safetyBackup: true });
  assert.equal(job.phase, 'done');
  for (const id of f.ids) {
    assert.equal(await f.main.has(id), false); assert.equal(await f.usb.hash(id), f.content[id]);
    assert.deepEqual(f.placement.parts[id], ['usb']);
  }
  // Every manifest written before a main copy disappeared still listed a verified copy elsewhere.
  for (const snapshot of f.persisted) for (const [, holders] of Object.entries(snapshot.parts)) assert.ok(holders.length >= 1);
});

test('safety backup: a failure mid-copy leaves every main copy in place', async t => {
  const f = await fixture(t);
  f.adapters.set('usb', failing(f.usb, { writeAfter: 3 }));
  const job = await run(f, { targets: everyTo(f.ids, ['usb']), safetyBackup: true });
  assert.equal(job.safetyHeld, true); assert.match(job.safetyHeldReason, /stopped responding/);
  for (const id of f.ids) assert.equal(await f.main.has(id), true, 'a main copy was removed');
  assert.equal(Object.keys(f.placement.parts).length, 3, 'only verified copies are recorded');
  for (const holders of Object.values(f.placement.parts)) assert.deepEqual(holders, ['main', 'usb']);
});

test('safety backup: cancel before release keeps main intact', async t => {
  const f = await fixture(t);
  const controller = new AbortController();
  const usb = f.usb; let writes = 0;
  f.adapters.set('usb', { ...usb, async write(part, bytes) { if (++writes === 2) controller.abort(); return usb.write(part, bytes); } });
  const job = await run(f, { targets: everyTo(f.ids, ['usb']), safetyBackup: true, signal: controller.signal });
  assert.equal(job.safetyHeld, true); assert.match(job.safetyHeldReason, /cancelled/);
  for (const id of f.ids) assert.equal(await f.main.has(id), true);
});

test('safety backup: the final verification catches a damaged target copy', async t => {
  const f = await fixture(t);
  f.adapters.set('usb', failing(f.usb, { hashBad: new Set([f.ids[4]]) }));
  const job = await run(f, { targets: everyTo(f.ids, ['usb']), safetyBackup: true });
  assert.equal(job.safetyHeld, true); assert.match(job.safetyHeldReason, /did not verify/);
  for (const id of f.ids) assert.equal(await f.main.has(id), true);
  assert.deepEqual(f.placement.parts[f.ids[4]], undefined, 'the damaged copy must be forgotten so a retry rewrites it');
});

test('safety backup: a retry resumes from the verified copies already made', async t => {
  const f = await fixture(t);
  f.adapters.set('usb', failing(f.usb, { writeAfter: 4 }));
  assert.equal((await run(f, { targets: everyTo(f.ids, ['usb']), safetyBackup: true })).safetyHeld, true);
  const retry = failing(f.usb); f.adapters.set('usb', retry);
  const job = await run(f, { targets: everyTo(f.ids, ['usb']), safetyBackup: true });
  assert.equal(job.phase, 'done');
  assert.equal(retry.writes(), 2, 'only the parts that were not copied yet are written again');
  for (const id of f.ids) assert.equal(await f.main.has(id), false);
});

test('target room is checked before the copy phase starts', async t => {
  const f = await fixture(t);
  f.adapters.set('usb', { ...f.usb, async freeBytes() { return 100; } });
  const job = await run(f, { targets: everyTo(f.ids, ['usb']), safetyBackup: true, sizes: Object.fromEntries(f.ids.map(id => [id, 2000])) });
  assert.equal(job.safetyHeld, true); assert.match(job.safetyHeldReason, /more free space/);
  assert.equal(await f.usb.list().then(list => list.length), 0, 'nothing was copied');
});

test('without safety backup a crash between copy and delete keeps every part readable', async t => {
  const f = await fixture(t);
  let releases = 0;
  const persist = f.persist;
  // The manifest commit before deletion fails, as if the process died there.
  f.persist = async () => { if (f.placement.parts && Object.values(f.placement.parts).some(holders => holders.length === 1 && holders[0] === 'usb') && ++releases === 1) throw Error('crash'); return persist(); };
  await assert.rejects(run(f, { targets: everyTo(f.ids, ['usb']), safetyBackup: false }), /crash/);
  for (const id of f.ids) assert.ok(await f.main.has(id) || await f.usb.has(id));
  for (const id of f.ids) assert.equal(await f.main.has(id), true, 'deletion ran before the manifest commit');
  // Restarting finishes the move; a part present in two places is fine.
  f.persist = persist;
  assert.equal((await run(f, { targets: everyTo(f.ids, ['usb']), safetyBackup: false })).phase, 'done');
  for (const id of f.ids) { assert.equal(await f.main.has(id), false); assert.equal(await f.usb.hash(id), f.content[id]); }
});

test('a damaged source copy is never propagated', async t => {
  const f = await fixture(t);
  for (const id of f.ids) f.placement.hashes[id] = f.content[id];
  await fs.writeFile(path.join(f.main.partsDirectory, `${f.ids[0]}.mfe`), randomBytes(100));
  const job = await run(f, { targets: everyTo(f.ids, ['usb']), safetyBackup: false });
  assert.equal(job.phase, 'stopped'); assert.match(job.reason, /No readable copy/);
  assert.equal(await f.usb.has(f.ids[0]), false);
});

test('a disconnected location is never deleted from and blocks nothing else', async t => {
  const f = await fixture(t);
  assert.equal((await run(f, { targets: everyTo(f.ids, ['usb']), safetyBackup: false })).phase, 'done');
  f.connected.delete('usb');
  const job = await run(f, { targets: everyTo(f.ids, ['main']), safetyBackup: false });
  assert.equal(job.phase, 'stopped'); assert.match(job.reason, /No readable copy|not connected/);
  for (const id of f.ids) { assert.equal(await f.usb.has(id), true); assert.deepEqual(f.placement.parts[id], ['usb']); }
});

test('bring everything back returns every part to main with verify-then-delete', async t => {
  const f = await fixture(t);
  await run(f, { targets: everyTo(f.ids, ['usb']), safetyBackup: true });
  const job = await run(f, { targets: everyTo(f.ids, ['main']), safetyBackup: false });
  assert.equal(job.phase, 'done');
  for (const id of f.ids) { assert.equal(await f.main.hash(id), f.content[id]); assert.equal(await f.usb.has(id), false); }
  assert.deepEqual(f.placement.parts, {});
});
