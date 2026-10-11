import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createUpdateService, UPDATE_PROJECT } from '../src/main/update-service.js';

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-service-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'app-1.0.0')); await fs.mkdir(path.join(root, 'packages'));
  await fs.writeFile(path.join(root, 'Update.exe'), 'test fixture only');
  const bytes = Buffer.from('test package bytes, never executable');
  const name = 'MaterialFileEncryptor-1.1.0-full.nupkg';
  const digest = algorithm => createHash(algorithm).update(bytes).digest('hex');
  const tag = 'v1.20.1', sha = 'a'.repeat(40);
  const base = `https://github.com/${UPDATE_PROJECT}/releases/download/${tag}/`;
  const release = { draft: false, prerelease: false, tag_name: tag,
    html_url: `https://github.com/${UPDATE_PROJECT}/releases/tag/${tag}`,
    assets: ['RELEASES', 'build-provenance.json', name].map(n => ({ name: n, size: n === name ? bytes.length : 100, browser_download_url: base + n })) };
  const provenance = { schemaVersion: 1, unsignedInstaller: true, tag, sourceCommit: sha, packageVersion: '1.1.0',
    assets: [{ name, bytes: bytes.length, sha256: digest('sha256') }] };
  const releasesText = `${digest('sha1')} ${name} ${bytes.length}`;
  provenance.assets.push({ name: 'RELEASES', bytes: Buffer.byteLength(releasesText), sha256: createHash('sha256').update(releasesText).digest('hex') });
  release.assets.find(a => a.name === 'RELEASES').size = Buffer.byteLength(releasesText);
  const ref = { ref: `refs/tags/${tag}`, object: { type: 'commit', sha } };
  const routes = new Map([
    [`https://api.github.com/repos/${UPDATE_PROJECT}/releases/latest`, () => JSON.stringify(release)],
    [`https://api.github.com/repos/${UPDATE_PROJECT}/git/ref/tags/${tag}`, () => JSON.stringify(ref)],
    [base + 'build-provenance.json', () => JSON.stringify(provenance)],
    [base + 'RELEASES', () => releasesText],
    [base + name, () => bytes],
  ]);
  const requested = [], native = new EventEmitter(), calls = [], dialogs = [];
  native.setFeedURL = value => calls.push(['feed', value]);
  native.checkForUpdates = () => { calls.push(['check']); queueMicrotask(() => native.emit('update-downloaded')); };
  native.quitAndInstall = () => calls.push(['install']);
  let active = false, leases = 0;
  const config = { platform: 'win32', argv: [], autoSchedule: false,
    app: { isPackaged: true, getVersion: () => '1.0.0', getPath: key => key === 'exe' ? path.join(root, 'app-1.0.0', 'MaterialFileEncryptor.exe') : root },
    autoUpdater: native, dialog: { showMessageBox: async (...args) => { dialogs.push(args); return { response: 0 }; } },
    isActiveWork: () => active, acquireInstallLease: () => { leases++; return () => leases--; },
    fetch: async (url, init) => { requested.push(url); assert.equal(init.redirect, 'manual'); assert.equal(init.credentials, 'omit'); assert.ok(routes.has(url), url); return new Response(routes.get(url)()); }, ...options };
  const service = createUpdateService(config); t.after(() => service.dispose());
  return { service, root, name, bytes, release, provenance, ref, routes, requested, native, calls, dialogs, config,
    setActive: value => active = value, leases: () => leases,
    stageNative: () => fs.writeFile(path.join(root, 'packages', name), bytes) };
}
test('unsupported and unpackaged contexts never fetch or invoke native updater', async t => {
  const f = await fixture(t, { platform: 'linux' });
  assert.equal((await f.service.check()).state, 'unavailable'); assert.deepEqual(f.requested, []); assert.deepEqual(f.calls, []);
});
test('check validates fixed project release source and real package version', async t => {
  const f = await fixture(t); const states = []; f.service.on('status', s => states.push(s.state));
  const result = await f.service.check(); assert.equal(result.state, 'available'); assert.equal(result.update.version, '1.1.0');
  assert.deepEqual(states, ['checking', 'available']); assert.deepEqual(f.calls, []);
  const copy = f.service.status(); copy.update.version = 'bad'; assert.equal(f.service.status().update.version, '1.1.0');
});
test('same package version remains current despite a newer release tag', async t => {
  const f = await fixture(t); f.config.app.getVersion = () => '1.1.0';
  assert.equal((await f.service.check()).state, 'current'); assert.deepEqual(f.calls, []);
});
for (const [label, mutate, expected] of [
  ['foreign asset', f => { f.release.assets[0].browser_download_url = 'https://other.invalid/RELEASES'; }, 'INVALID_RELEASE_ASSET'],
  ['draft', f => { f.release.draft = true; }, 'INVALID_RELEASE'],
  ['source mismatch', f => { f.ref.object.sha = 'b'.repeat(40); }, 'SOURCE_COMMIT_MISMATCH'],
  ['invalid digest', f => { f.provenance.assets[0].sha256 = 'wrong'; }, 'INVALID_PACKAGE_METADATA'],
  ['modified feed', f => { f.routes.set([...f.routes.keys()].find(k => k.endsWith('/RELEASES')), () => `${'a'.repeat(40)} ../escape.nupkg 1`); }, 'RELEASES_HASH_MISMATCH'],
]) test(`rejects ${label} before any native operation`, async t => {
  const f = await fixture(t); mutate(f); const result = await f.service.check(); assert.equal(result.reason, expected); assert.deepEqual(f.calls, []);
});
test('offline and oversized metadata fail closed', async t => {
  const f = await fixture(t, { fetch: async () => { throw new Error('sensitive server error'); } });
  assert.equal((await f.service.check()).reason, 'UPDATE_OPERATION_FAILED');
  const g = await fixture(t, { fetch: async () => new Response('x'.repeat(1024 * 1024 + 1)) });
  assert.equal((await g.service.check()).reason, 'METADATA_TOO_LARGE');
});
test('download stages and verifies hashes without invoking native updater', async t => {
  const f = await fixture(t); await f.service.check(); const result = await f.service.download();
  assert.equal(result.state, 'ready'); assert.equal(result.stagedHashVerified, true); assert.deepEqual(f.calls, []);
  assert.equal(result.rollbackSupported, false); assert.equal(result.nativeAcceptance, 'unverified');
});
test('corrupt package is removed and cannot become ready', async t => {
  const f = await fixture(t); await f.service.check();
  f.routes.set([...f.routes.keys()].find(k => k.endsWith(f.name)), () => Buffer.alloc(f.bytes.length));
  assert.equal((await f.service.download()).reason, 'PACKAGE_HASH_MISMATCH');
  assert.deepEqual(await fs.readdir(path.join(f.root, 'update-staging')), []); assert.deepEqual(f.calls, []);
});
test('Later and active work defer without native download', async t => {
  const f = await fixture(t); await f.service.check(); await f.service.download(); f.setActive(true);
  assert.equal((await f.service.installWhenSafe()).reason, 'ACTIVE_WORK'); assert.equal(f.dialogs.length, 0);
  f.setActive(false); f.config.dialog.showMessageBox = async () => ({ response: 1 });
  const result = await f.service.installWhenSafe(); assert.equal(result.state, 'ready'); assert.equal(result.deferred, true); assert.deepEqual(f.calls, []);
});
test('missing exclusive lease cannot install', async t => {
  const f = await fixture(t, { acquireInstallLease: undefined }); await f.service.check(); await f.service.download();
  assert.equal((await f.service.installWhenSafe()).reason, 'INSTALL_LEASE_UNAVAILABLE'); assert.deepEqual(f.calls, []);
});
test('explicit confirmation plus idle lease permits verified native restart request only', async t => {
  const f = await fixture(t); await f.service.check(); await f.service.download(); await f.stageNative();
  assert.equal((await f.service.installWhenSafe()).state, 'restart-requested');
  assert.deepEqual(f.calls.map(c => c[0]), ['feed', 'check', 'install']); assert.equal(f.leases(), 0);
  assert.match(f.dialogs[0][0].detail, /unsigned/); assert.equal(f.dialogs[0][0].defaultId, 1);
  assert.equal(f.native.listenerCount('update-downloaded'), 0);
});
test('native cache corruption blocks restart and releases exclusive lease', async t => {
  const f = await fixture(t); await f.service.check(); await f.service.download(); await f.stageNative();
  await fs.writeFile(path.join(f.root, 'packages', f.name), Buffer.alloc(f.bytes.length));
  assert.equal((await f.service.installWhenSafe()).reason, 'PACKAGE_HASH_MISMATCH');
  assert.equal(f.calls.some(c => c[0] === 'install'), false); assert.equal(f.leases(), 0);
});
test('concurrent installation requests produce one dialog', async t => {
  const f = await fixture(t); await f.service.check(); await f.service.download(); await f.stageNative();
  await Promise.all([f.service.installWhenSafe(), f.service.installWhenSafe()]); assert.equal(f.dialogs.length, 1);
});
test('schedule is bounded, first-run delay respected, cancellation and disposal clear timers', async t => {
  const timers = [], cleared = [];
  const f = await fixture(t, { autoSchedule: true, argv: ['--squirrel-firstrun'], intervalMs: 1,
    setTimer: (fn, delay) => { const timer = { fn, delay, unref() {} }; timers.push(timer); return timer; }, clearTimer: timer => cleared.push(timer) });
  assert.equal(timers[0].delay, 10_000); await timers[0].fn();
  assert.equal(timers.at(-1).delay, 15 * 60_000); f.service.cancelSchedule(); assert.ok(cleared.includes(timers.at(-1)));
  f.service.dispose(); assert.equal((await f.service.check()).state, 'disposed');
});
test('disposal aborts metadata request and does not report a later success', async t => {
  const f = await fixture(t, { fetch: async (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) });
  const pending = f.service.check(); await new Promise(resolve => setTimeout(resolve, 10)); f.service.dispose();
  assert.equal((await pending).state, 'disposed'); assert.deepEqual(f.calls, []);
});
test('native timeout removes observers and a late event cannot restart', async t => {
  const timers = [];
  const f = await fixture(t, { setTimer: (fn, delay) => { const timer = { fn, delay, unref() {} }; timers.push(timer); return timer; }, clearTimer: () => {} });
  await f.service.check(); await f.service.download(); await f.stageNative();
  f.native.checkForUpdates = () => {};
  const pending = f.service.installWhenSafe();
  while (f.service.status().state !== 'installing' || !timers.some(v => v.delay === 600_000)) await new Promise(resolve => setImmediate(resolve));
  timers.find(v => v.delay === 600_000).fn();
  assert.equal((await pending).reason, 'NATIVE_UPDATE_TIMED_OUT'); f.native.emit('update-downloaded');
  assert.equal(f.calls.some(c => c[0] === 'install'), false); assert.equal(f.leases(), 0);
});
test('disposing native observation releases lease without pretending native cancellation', async t => {
  const f = await fixture(t); await f.service.check(); await f.service.download(); f.native.checkForUpdates = () => {};
  const pending = f.service.installWhenSafe();
  while (f.native.listenerCount('update-downloaded') === 0) await new Promise(resolve => setImmediate(resolve));
  f.service.dispose(); assert.equal((await pending).state, 'disposed'); assert.equal(f.leases(), 0);
  assert.equal(f.native.listenerCount('update-downloaded'), 0); assert.equal(f.calls.some(c => c[0] === 'install'), false);
});
test('busy work introduced while confirmation is open prevents native updating', async t => {
  const f = await fixture(t); await f.service.check(); await f.service.download();
  f.config.dialog.showMessageBox = async () => { f.setActive(true); return { response: 0 }; };
  assert.equal((await f.service.installWhenSafe()).reason, 'ACTIVE_WORK'); assert.deepEqual(f.calls, []); assert.equal(f.leases(), 0);
});
test('bilingual native confirmation retains conservative default and unsigned warning', async t => {
  const f = await fixture(t, { getLanguage: () => 'bilingual' }); await f.service.check(); await f.service.download(); await f.stageNative();
  await f.service.installWhenSafe(); const options = f.dialogs[0][0];
  assert.match(options.detail, /未經簽署/); assert.match(options.detail, /unsigned/); assert.equal(options.cancelId, 1);
});
test('foreign release redirect is rejected before any redirected request', async t => {
  const f = await fixture(t, { fetch: async url => url.endsWith('/latest') ? new Response(null, { status: 302, headers: { location: 'https://other.invalid/feed' } }) : assert.fail(url) });
  assert.equal((await f.service.check()).reason, 'INVALID_DOWNLOAD_REDIRECT'); assert.deepEqual(f.calls, []);
});
test('missing installed updater reports the exact unavailable prerequisite without networking', async t => {
  const f = await fixture(t); await fs.rm(path.join(f.root, 'Update.exe'));
  assert.equal((await f.service.check()).reason, 'SQUIRREL_NOT_INSTALLED'); assert.deepEqual(f.requested, []);
});
