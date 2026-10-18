import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createVaultImageService } from '../src/main/vault-image-service.js';
import { createVaultImageRequests } from '../src/main/vault-image-requests.js';
import { validateRequest } from '../src/main/validation.js';

async function fixture(t, overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-image-service-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const calls = []; let number = 0;
  const service = createVaultImageService({ workRoot: root,
    nativeRequest: async (method, params, id) => { calls.push({ method, params, id }); return { storageDir: root, leaseId: `lease-${id}` }; },
    snapshot: async () => { const directory = path.join(root, String(++number)); await fs.mkdir(directory); return { directory, manifest: { vaultId: 'fixture' }, fileCount: 3, totalBytes: 150 }; },
    verify: async () => { calls.push({ method: 'verify' }); },
    docker: { build: async () => { calls.push({ method: 'build' }); return { imageId: 'sha256:fixture', context: 'desktop' }; }, push: async () => { calls.push({ method: 'push' }); return { uploaded: true, digest: 'fixture' }; } }, ...overrides });
  return { service, calls, root };
}

test('prepare is data-only, binds native lease to session and never builds or uploads', async t => {
  const { service, calls } = await fixture(t);
  const preview = await service.prepare('one', 'example/backup:one');
  assert.equal(preview.phase, 'prepared'); assert.equal(preview.sessionId, 'one');
  assert.equal(preview.storageOnly, true); assert.equal(preview.excludesPendingCache, true);
  assert.deepEqual(calls.map(x => [x.method, x.id]), [['beginSnapshot', 'one'], ['releaseSnapshot', 'one']]);
  assert.equal(calls[1].params.leaseId, 'lease-one');
  assert.equal(service.status('two'), null);
});

test('build and upload are independent explicit actions with immutable preview identity', async t => {
  const { service, calls } = await fixture(t);
  const p = await service.prepare('one', 'example/backup:one');
  await assert.rejects(service.upload('one', p.previewId), /Build and review/);
  await assert.rejects(service.build('two', p.previewId), /expired/);
  assert.equal((await service.build('one', p.previewId)).phase, 'built');
  assert.equal(calls.filter(x => x.method === 'push').length, 0);
  assert.equal((await service.upload('one', p.previewId)).phase, 'uploaded');
  await assert.rejects(service.upload('one', p.previewId), /never retried/);
});

test('snapshot failure releases native lease and failed release cleans copied context', async t => {
  const { service, calls } = await fixture(t, { snapshot: async () => { throw Error('changed'); } });
  await assert.rejects(service.prepare('one', 'example/backup:one'), /changed/);
  assert.equal(calls.at(-1).method, 'releaseSnapshot'); assert.equal(service.status('one'), null);
  const second = await fixture(t, { nativeRequest: async method => { if (method === 'releaseSnapshot') throw Error('release failed'); return { storageDir: 'fixture', leaseId: 'lease' }; } });
  await assert.rejects(second.service.prepare('one', 'example/backup:one'), /release failed/);
  assert.deepEqual(await fs.readdir(second.root), []);
});

test('uncertain upload remains unverified and cannot silently retry', async t => {
  const { service } = await fixture(t, { docker: { build: async () => ({ imageId: 'fixture' }), push: async () => { throw Error('uncertain'); } } });
  const p = await service.prepare('one', 'example/backup:one'); await service.build('one', p.previewId);
  await assert.rejects(service.upload('one', p.previewId), /uncertain/);
  assert.equal(service.status('one').phase, 'upload-unverified');
  await assert.rejects(service.upload('one', p.previewId), /never retried/);
});

test('cancel is session-bound and shutdown cannot delete an active context', async t => {
  let started; const ready = new Promise(resolve => { started = resolve; });
  const { service } = await fixture(t, { snapshot: async ({ signal }) => { started(); await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true })); } });
  const action = service.prepare('one', 'example/backup:one'); await ready;
  assert.equal(service.pending, true); assert.throws(() => service.cancel('two'), /another vault/);
  await assert.rejects(service.close(), /still running/);
  await assert.rejects(service.discard('one'), /Cancel/);
  service.cancel('one'); await assert.rejects(action, /cancelled/); assert.equal(service.pending, false);
});

test('discard and close remove only session-owned generated contexts', async t => {
  const { service, root } = await fixture(t);
  const old = await service.prepare('one', 'example/backup:one');
  await service.prepare('two', 'example/backup:two');
  await service.discard('one'); assert.equal(service.status('one'), null); assert.ok(service.status('two'));
  await assert.rejects(service.build('one', old.previewId), /expired/);
  await service.close(); assert.deepEqual(await fs.readdir(root), []);
});

test('main confirmation names exact target, encrypted scope and risks, cancellation never uploads', async t => {
  const { service, calls } = await fixture(t); let options; let response = 0;
  const request = createVaultImageRequests({ service, available: () => true, exiting: () => false, confirm: async value => { options = value; return { response }; } });
  const p = await request('prepareVaultImage', { reference: 'example/backup:one' }, 'one');
  await request('buildVaultImage', { previewId: p.previewId }, 'one');
  assert.equal((await request('uploadVaultImage', { previewId: p.previewId }, 'one')).phase, 'built');
  assert.match(options.message, /docker.io\/example\/backup:one/); assert.match(options.detail, /offline password guessing/);
  assert.match(options.detail, /Pending cache changes are excluded/); assert.match(options.detail, /replace an existing tag/);
  assert.equal(calls.filter(x => x.method === 'push').length, 0);
  response = 1; await request('uploadVaultImage', { previewId: p.previewId }, 'one');
  assert.equal(calls.filter(x => x.method === 'push').length, 1);
});

test('main refuses unavailable or exiting image actions and malformed IPC parameters', async () => {
  const unavailable = createVaultImageRequests({ available: () => false });
  await assert.rejects(unavailable('prepareVaultImage', {}, 'one'), /native vault helper/);
  const exiting = createVaultImageRequests({ available: () => true, exiting: () => true });
  await assert.rejects(exiting('prepareVaultImage', {}, 'one'), /preparing to close/);
  assert.deepEqual(validateRequest('prepareVaultImage', { reference: 'example/backup:one' }), { reference: 'example/backup:one' });
  assert.throws(() => validateRequest('prepareVaultImage', { reference: 'example/backup:one', storageDir: 'arbitrary' }));
  assert.throws(() => validateRequest('uploadVaultImage', { previewId: '../wrong' }));
});

test('multiline Docker targets never reach native lease acquisition', async t => {
  const { service, calls } = await fixture(t);
  await assert.rejects(service.prepare('one', 'example/backup:one\n'), /Docker Hub target/);
  assert.equal(calls.length, 0);
});
