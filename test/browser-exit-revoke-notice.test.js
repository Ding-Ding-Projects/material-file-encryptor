import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createBrowserNativeBroker, createBrowserHandoffLifecycle, nativeFrame} from '../src/main/browser-native-host.js';
import {createNativeMessageDecoder} from '../src/main/browser-download-receiver.js';

const origin = `chrome-extension://${'a'.repeat(32)}/`;
const connection1 = '11111111-1111-4111-8111-111111111111';
const settle = () => new Promise(resolve => setImmediate(resolve));

// ---- Desktop side: the broker writes the notice to the native host before it discards the pairing. ----

async function fixture(options = {}, {acknowledge = true} = {}) {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { child.exitCode = 0; child.emit('exit', 0); child.emit('close', 0); };
  let sequence = 0;
  const pending = new Map(), notices = [];
  const broker = createBrowserNativeBroker({
    config: {schemaVersion: 1, host: 'org.dingding.material_file_encryptor.downloads', allowedOrigins: [origin], identity: {extensionId: 'a'.repeat(32), packageSha256: '0'.repeat(64), publicKeySha256: '1'.repeat(64)}},
    hostPath: 'C:\\Synthetic\\MaterialFileEncryptor.BrowserHost.exe', spawnHost: () => child,
    authorizePair: async () => true, isUnlocked: () => true, onProposal: () => {},
    readUpdateState: () => ({desktopVersion: '1.0.0', status: {phase: 'idle'}}), ...options,
  });
  const decoder = createNativeMessageDecoder(envelope => {
    if (envelope.type === 'revoked') { notices.push(envelope); if (acknowledge) child.stdout.write(nativeFrame({type: 'notified', count: 1})); return; }
    const resolve = pending.get(envelope.requestId); pending.delete(envelope.requestId); resolve?.(envelope.response);
  });
  child.stdin.on('data', chunk => decoder.push(chunk));
  const start = broker.start();
  child.stdout.write(nativeFrame({type: 'ready', aclVerified: true}));
  await start;
  return {
    broker, child, notices,
    request: (connectionId, message) => new Promise(resolve => {
      const requestId = `33333333-3333-4333-8333-${String(++sequence).padStart(12, '0')}`;
      pending.set(requestId, resolve);
      child.stdout.write(nativeFrame({requestId, connectionId, origin, message}));
    }),
  };
}

test('the desktop sends a secret-free notice for exit, lock and update before it discards the pairing', async () => {
  for (const reason of ['exit', 'lock', 'update']) {
    const f = await fixture();
    try {
      const pair = await f.request(connection1, {type: 'pair'});
      assert.equal(pair.type, 'paired');
      assert.equal(await f.broker.notifyRevoked(reason), true, 'the host confirmed delivery');
      assert.deepEqual(f.notices, [{type: 'revoked', reason}]);
      assert.equal(JSON.stringify(f.notices).includes(pair.session), false, 'the notice carries no secret');
      f.broker.revoke();
      assert.equal(await f.broker.notifyRevoked(reason), false, 'once the pairing is gone there is nothing to announce');
      assert.equal(f.notices.length, 1);
    } finally { await f.broker.close(); }
  }
});

test('no notice is sent without a pairing, without a live port, or for an unknown reason', async () => {
  const f = await fixture();
  try {
    assert.equal(await f.broker.notifyRevoked('exit'), false);
    await f.request(connection1, {type: 'pair'});
    assert.equal(await f.broker.notifyRevoked('crash'), false);
    assert.equal(await f.broker.notifyRevoked(undefined), false);
    assert.deepEqual(f.notices, []);
  } finally { await f.broker.close(); }
});

test('waiting for the host to confirm the notice is bounded', async () => {
  const f = await fixture({}, {acknowledge: false});
  try {
    await f.request(connection1, {type: 'pair'});
    const started = Date.now();
    assert.equal(await f.broker.notifyRevoked('exit'), false);
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 150 && elapsed < 450, `bounded to about 200 ms, took ${elapsed} ms`);
    assert.equal(f.notices.length, 1, 'the notice was still written');
  } finally { await f.broker.close(); }
});

test('the lifecycle announces before it revokes, only when given a reason, and its promise is bounded and never rejects', async () => {
  const calls = [];
  const broker = {
    available: true, pending: 0, start: async () => {}, close: async () => ({verified: true}), observeDownload() {},
    notifyRevoked(reason) { calls.push('notify:' + reason); return new Promise(resolve => setTimeout(() => resolve(true), 20)); },
    revoke() { calls.push('revoke'); },
  };
  const cleared = [];
  const lifecycle = createBrowserHandoffLifecycle({
    hostDirectory: 'C:\\OwnedFixture', platform: 'win32', pairingCodes: {clear: () => cleared.push('codes')},
    readConfiguration: async () => ({schemaVersion: 1, host: 'org.dingding.material_file_encryptor.downloads', allowedOrigins: [origin], identity: {extensionId: 'a'.repeat(32), packageSha256: '0'.repeat(64), publicKeySha256: '1'.repeat(64)}}),
    createBroker: () => broker, isUnlocked: () => true, authorizePair: async () => true, onProposal() {},
  });
  await lifecycle.initialize();
  assert.equal(lifecycle.revoke(), undefined);
  assert.deepEqual(calls, ['revoke']);
  calls.length = 0;
  assert.equal(await lifecycle.revoke('exit'), true);
  assert.deepEqual(calls, ['notify:exit', 'revoke'], 'the notice is written before the sessions are cleared');
  assert.deepEqual(cleared, ['codes', 'codes']);
  await lifecycle.close();
});

test('the application announces exit, update preparation and lock through the handoff, with exit bounded by the notice deadline', async () => {
  const main = await fs.readFile(new URL('../src/main/main.js', import.meta.url), 'utf8');
  assert.match(main, /quitPending=true;await browserHandoff\?\.revoke\('exit'\)/);
  assert.match(main, /updateInstallLease=true;quitPending=true;await browserHandoff\?\.revoke\('update'\)/);
  assert.match(main, /beforeLock: \(\) => \{ browserHandoff\?\.revoke\('lock'\)/);
  assert.match(main, /state\.locked\|\|state\.lockVerified===false\)browserHandoff\?\.revoke\('lock'\)/);
  assert.match(main, /\['lockVault','unmount'\]\.includes\(method\)\)browserHandoff\?\.revoke\('lock'\)/);
  assert.equal(/browserHandoff\?\.revoke\(\)/.test(main), false, 'every application call site names why the pairing ends');
  const host = await fs.readFile(new URL('../src/main/browser-native-host.js', import.meta.url), 'utf8');
  assert.match(host, /noticeTimeoutMs=200/);
});

// ---- Extension side. ----

const source = await fs.readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8');
const SESSION = 'q'.repeat(43);

function extension({crash = false} = {}) {
  const rows = {};
  const state = {grant: null, seen: []};
  let onMessage; const ports = []; const broadcasts = [];
  const sessionStore = {
    async get(key) { return key in rows ? {[key]: structuredClone(rows[key])} : {}; },
    async set(values) { Object.assign(rows, structuredClone(values)); },
    async remove(key) { delete rows[key]; },
  };
  const chrome = {
    runtime: {
      id: 'fixture', getURL: name => 'chrome-extension://fixture/' + name, onInstalled: {addListener() {}}, onMessage: {addListener(fn) { onMessage = fn; }},
      sendMessage(message, callback) { broadcasts.push(message); callback?.(); },
      connectNative() {
        let receive, disconnected;
        const port = {
          closed: false, disconnect() { port.closed = true; },
          onDisconnect: {addListener(fn) { disconnected = fn; }}, onMessage: {addListener(fn) { receive = fn; }},
          postMessage(message) {
            state.seen.push(message);
            if (message.type === 'pair') { state.grant = SESSION; queueMicrotask(() => receive({type: 'paired', session: SESSION, expiresInSeconds: 900})); }
            else if (message.type === 'resume') {
              if (crash) { queueMicrotask(() => disconnected?.()); return; }
              queueMicrotask(() => receive(state.grant && message.session === state.grant ? {type: 'resumed', expiresInSeconds: 900} : {type: 'error'}));
            }
          },
          emit(message) { receive(message); }, drop() { disconnected?.(); },
        };
        ports.push(port); return port;
      },
    },
    contextMenus: {create() {}, onClicked: {addListener() {}}}, action: {setBadgeText() {}, setTitle() {}},
    storage: {session: sessionStore, local: {async get() { return {}; }, async set() {}, async remove() {}}},
  };
  const context = vm.createContext({chrome, URL, setTimeout, clearTimeout, queueMicrotask, Date});
  vm.runInContext(source, context);
  const make = vm.runInContext('(text) => JSON.parse(text)', context);
  const sender = {id: 'fixture', url: chrome.runtime.getURL('options.html')};
  const ask = value => new Promise(resolve => { if (onMessage(make(JSON.stringify(value)), sender, resolve) === false) resolve('sync'); }).then(result => JSON.parse(JSON.stringify(result)));
  const inside = value => make(JSON.stringify(value));
  return {rows, state, ports, broadcasts, ask, inside};
}

test('a revoke notice on the live port clears the grant, stores only the expired marker and tells the open pages at once', async () => {
  for (const reason of ['exit', 'lock', 'update']) {
    const e = extension();
    assert.deepEqual(await e.ask({type: 'pair'}), {paired: true});
    assert.equal(e.ports.length, 1);
    e.ports[0].emit(e.inside({type: 'revoked', reason}));
    await settle(); await settle();
    assert.deepEqual(e.rows, {'pairing-expired': true}, reason);
    assert.deepEqual(await e.ask({type: 'status'}), {paired: false, link: 'expired'}, reason);
    assert.deepEqual(JSON.parse(JSON.stringify(e.broadcasts)), [{type: 'pairing-state-changed'}], 'popup and options re-read the state immediately');
    assert.equal(e.ports[0].closed, true);
    const before = e.state.seen.length;
    await e.ask({type: 'status'});
    assert.equal(e.state.seen.length, before, 'an expired grant is never presented to the desktop again');
  }
});

test('with no notice (a crash or kill) the extension keeps the grant and reads Reconnecting', async () => {
  const e = extension({crash: true});
  assert.deepEqual(await e.ask({type: 'pair'}), {paired: true});
  e.ports[0].drop();
  assert.deepEqual(await e.ask({type: 'status'}), {paired: false, link: 'reconnecting'});
  assert.equal(Object.keys(e.rows).some(key => key === 'pairing-expired'), false, 'nothing marks the pairing expired');
  assert.equal(Object.keys(e.rows).length, 1, 'the grant itself is kept');
  assert.deepEqual(e.broadcasts, []);
});

test('a notice from another port, or with any other shape or reason, is ignored', async () => {
  const e = extension();
  assert.deepEqual(await e.ask({type: 'pair'}), {paired: true});
  const stale = e.ports[0];
  const heldBefore = JSON.stringify(e.rows);
  for (const bad of [
    {type: 'revoked'}, {type: 'revoked', reason: 'crash'}, {type: 'revoked', reason: 'exit', session: SESSION},
    {type: 'revoke', reason: 'exit'}, {type: 'revoked', reason: ['exit']}, null, 'revoked',
  ]) {
    stale.emit(bad === null || typeof bad === 'string' ? bad : e.inside(bad));
    await settle();
    assert.deepEqual(await e.ask({type: 'status'}), {paired: true}, JSON.stringify(bad));
  }
  assert.equal(JSON.stringify(e.rows), heldBefore);
  assert.deepEqual(e.broadcasts, []);
  // A port the worker already replaced no longer speaks for the desktop.
  stale.drop();
  await settle();
  assert.deepEqual(await e.ask({type: 'pair'}), {paired: true});
  const live = e.ports.at(-1);
  assert.notEqual(live, stale);
  stale.emit(e.inside({type: 'revoked', reason: 'exit'}));
  await settle();
  assert.deepEqual(await e.ask({type: 'status'}), {paired: true});
  assert.deepEqual(e.broadcasts, []);
});
