import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createRegistryLogin, registryLoginRelayPath, REGISTRY_LOGIN_PAGE } from '../src/main/registry-login.js';
import { registryLoginSnapshot } from '../src/renderer/features/storage-maintenance/registry-login-model.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
async function fixture(options = {}) {
  const calls = [], pages = [], timers = [];
  let checks = 0;
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kills = 0; child.kill = () => { child.kills++; return true; };
  const service = createRegistryLogin({ platform: 'win32', systemRoot: 'C:\\Windows',
    transport: {
      inspectRegistrySignIn: async signal => { checks++; return options.inspect ? options.inspect(checks, signal) : { state: checks === 1 ? 'missing' : 'signed-in' }; },
      registryLoginCommand: async () => ({ executable: 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe', configDirectory: 'C:\\fixture\\config', env: { PATH: 'trusted' } }),
    },
    openPage: async url => { pages.push(url); }, spawnProcess: (...args) => { calls.push(args); return child; },
    setTimer: (callback, ms) => { const timer = { callback, ms, unref() {} }; timers.push(timer); return timer; }, clearTimer: () => {},
    ...options.service,
  });
  async function ready() {
    for (let attempt = 0; attempt < 200 && service.pending && !calls.length; attempt++) await new Promise(resolve => setTimeout(resolve, 1));
  }
  return { service, child, calls, pages, timers, checks: () => checks, ready, async start() { service.start(); await ready(); } };
}
const instruction = 'Your one-time device confirmation code is: ABCD-EFGH\r\nPress ENTER to open your browser or submit your device code here: https://login.docker.com/activate\r\n';

test('startup remains renderer-valid and polling-active until both code and official page arrive', async () => {
  const f = await fixture(); await f.start(); assert.equal(f.calls.length, 1);
  for (let i = 0; i < 3; i++) {
    assert.equal(f.service.status().state, 'checking');
    assert.equal(registryLoginSnapshot(f.service.status()).state, 'checking');
    assert.equal(f.service.pending, true);
  }
  f.child.stdout.write('Your one-time device confirmation code is: ABCD-EFGH\n');
  assert.equal(registryLoginSnapshot(f.service.status()).state, 'checking');
  f.child.stdout.write('Press ENTER to open your browser or submit your device code here: https://login.docker.com/activate\n');
  assert.equal(registryLoginSnapshot(f.service.status()).state, 'authorizing');
  f.service.cancel(); f.child.emit('close', 1);
});

test('packaged relay is a real extraResource and PowerShell never receives an ASAR path', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-login-package-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const config = createRequire(import.meta.url)('../forge.config.cjs');
  const sourceRelay = registryLoginRelayPath();
  assert.equal(config.packagerConfig.asar, true);
  assert.equal(config.packagerConfig.extraResource.filter(value => path.resolve(value) === path.resolve(sourceRelay)).length, 1);
  await fs.copyFile(sourceRelay, path.join(root, 'registry-login-console.ps1'));
  const f = await fixture({ service: { packaged: true, resourcesPath: root } }); await f.start();
  assert.equal(f.calls.length, 1); const args = f.calls[0][1];
  assert.equal(args[args.indexOf('-File') + 1], path.join(root, 'registry-login-console.ps1'));
  assert.ok(!args[args.indexOf('-File') + 1].includes('app.asar'));
  f.service.cancel(); f.child.emit('close', 1);
  assert.throws(() => registryLoginRelayPath({ packaged: true, resourcesPath: path.join(root, 'app.asar', 'src') }));
  const missing = await fixture({ service: { packaged: true, resourcesPath: path.join(root, 'missing') } }); await missing.start();
  assert.equal(missing.service.status().state, 'unavailable'); assert.equal(missing.calls.length, 0);
});

test('cached status does not probe and verified stored sign-in never replaces an account', async () => {
  const f = await fixture({ inspect: async () => ({ state: 'signed-in' }) });
  for (let i = 0; i < 5; i++) assert.equal(f.service.status().state, 'idle');
  assert.equal(f.checks(), 0); await f.start();
  assert.equal(f.service.status().state, 'signed-in'); assert.equal(f.calls.length, 0); assert.equal(f.checks(), 1);
});
test('fixed hidden relay accepts chunked terminal code only with the official page', async () => {
  const f = await fixture(); await f.start();
  assert.equal(f.calls.length, 1); const [binary, args, settings] = f.calls[0];
  assert.match(binary, /WindowsPowerShell/); assert.equal(settings.windowsHide, true); assert.equal(settings.shell, false);
  assert.ok(args.includes('-File')); assert.ok(!args.some(value => /ExecutionPolicy|password|token/i.test(value)));
  const output = instruction.replace('ABCD-EFGH', '\x1b[1mABCD-EFGH\x1b[0m');
  for (const byte of Buffer.from(output)) f.child.stdout.write(Buffer.from([byte]));
  assert.equal(f.service.status().deviceCode, 'ABCD-EFGH'); assert.equal(f.service.status().canOpenPage, true);
  await f.service.openPage(); assert.deepEqual(f.pages, [REGISTRY_LOGIN_PAGE]);
  f.child.emit('close', 0); await tick(); assert.equal(f.service.status().state, 'signed-in'); assert.equal(f.service.status().deviceCode, null);
});
test('code without verified official page is never exposed', async () => {
  const f = await fixture(); await f.start(); f.child.stdout.write('Your one-time device confirmation code is: ABCD-EFGH\n');
  assert.equal(f.service.status().deviceCode, null); await assert.rejects(f.service.openPage()); f.service.cancel(); f.child.emit('close', 1);
});
test('malformed codes, changed codes, foreign URLs and fallback prompts fail closed', async () => {
  for (const value of [instruction.replace('ABCD-EFGH', 'bad-code'), instruction.replace(REGISTRY_LOGIN_PAGE, 'https://example.invalid/activate'), instruction.replace(REGISTRY_LOGIN_PAGE, REGISTRY_LOGIN_PAGE + '?unexpected=value'), instruction + 'Your one-time device confirmation code is: WXYZ-1234\n', 'Username:\n', 'device failure\u202e\n']) {
    const f = await fixture(); await f.start(); f.child.stdout.write(value);
    assert.ok(['failed', 'unavailable'].includes(f.service.status().state)); assert.equal(f.service.status().deviceCode, null); assert.equal(f.child.kills, 1);
    assert.ok(!JSON.stringify(f.service.status()).includes('example.invalid')); f.child.emit('close', 1);
  }
});
test('cancellation retires code and prevents duplicate start until exact child close', async () => {
  const f = await fixture(); await f.start(); f.child.stdout.write(instruction); f.service.cancel();
  assert.equal(f.service.status().state, 'cancelled'); assert.equal(f.service.status().deviceCode, null); assert.equal(f.service.pending, true);
  f.service.start(); assert.equal(f.calls.length, 1); f.child.emit('close', 0); await tick();
  assert.equal(f.service.pending, false); assert.equal(f.service.status().state, 'cancelled'); assert.equal(f.checks(), 1);
});
test('concurrent starts share one inspection and one owned child', async () => {
  let resolve; const f = await fixture({ inspect: () => new Promise(done => { resolve = done; }) });
  f.service.start(); f.service.start(); assert.equal(f.checks(), 1); resolve({ state: 'missing' }); await f.ready();
  f.service.start(); assert.equal(f.calls.length, 1); f.service.cancel(); f.child.emit('close', 1);
});
test('late checking completion after cancellation cannot launch a child', async () => {
  let resolve; const f = await fixture({ inspect: () => new Promise(done => { resolve = done; }) });
  f.service.start(); f.service.cancel(); resolve({ state: 'missing' }); await tick();
  assert.equal(f.calls.length, 0); assert.equal(f.service.status().state, 'cancelled');
});
test('deadline and provider expiry clear code, and failed login never reports success', async () => {
  const f = await fixture(); await f.start(); f.child.stdout.write(instruction); f.timers[0].callback();
  assert.equal(f.service.status().state, 'expired'); assert.equal(f.service.status().deviceCode, null); f.child.emit('close', 1);
  const expired = await fixture(); await expired.start(); expired.child.stderr.write('failed waiting for authentication: expired_token\n');
  assert.equal(expired.service.status().state, 'expired'); expired.child.emit('close', 1);
  const failed = await fixture(); await failed.start(); failed.child.emit('close', 1); await tick(); assert.equal(failed.service.status().state, 'failed');
});
test('CLI success still requires independently verified stored sign-in', async () => {
  const f = await fixture({ inspect: async n => ({ state: n === 1 ? 'missing' : 'stale' }) }); await f.start(); f.child.stdout.write(instruction); f.child.emit('close', 0); await tick();
  assert.equal(f.service.status().state, 'stale'); assert.equal(f.service.status().deviceCode, null);
});
test('stale or unavailable existing sign-in is retained without launching login', async () => {
  for (const state of ['stale', 'unavailable']) { const f = await fixture({ inspect: async () => ({ state, reason: 'stored-sign-in-unverified' }) }); await f.start(); assert.equal(f.service.status().state, state); assert.equal(f.calls.length, 0); }
});
test('oversized or malformed UTF-8 output fails without exposing payload', async () => {
  for (const bytes of [Buffer.alloc(70000, 65), Buffer.from([255])]) { const f = await fixture(); await f.start(); f.child.stdout.write(bytes); assert.equal(f.service.status().state, 'failed'); assert.equal(f.service.status().deviceCode, null); f.child.emit('close', 1); }
});
test('close cancels only the owned relay and waits for its close event', async () => {
  const f = await fixture(); await f.start(); const pending = f.service.close(); assert.equal(f.child.kills, 1); f.child.emit('close', 1); await pending; assert.equal(f.service.pending, false);
});
