import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8');
const SESSION = 'q'.repeat(43);

// A small model of the desktop: it issues one grant on pair and honours resume and unpair for that grant only.
function desktop(options = {}) {
  const state = {grant: null, reachable: true, approvals: 0, lifetime: 900, seen: []};
  state.answer = message => {
    state.seen.push(message);
    if (!state.reachable) return null;
    if (message.type === 'pair') { state.approvals++; state.grant = SESSION; return {type: 'paired', session: SESSION, expiresInSeconds: state.lifetime}; }
    if (message.type === 'resume') return state.grant !== null && message.session === state.grant ? {type: 'resumed', expiresInSeconds: state.lifetime} : {type: 'error'};
    if (message.type === 'unpair') { state.grant = null; return {type: 'unpaired'}; }
    if (message.type === 'propose') return state.grant !== null && message.session === state.grant ? {type: 'proposed', id: '12345678-1234-4234-8234-123456789abc', state: 'awaiting-confirmation'} : {type: 'error'};
    return {type: 'error'};
  };
  Object.assign(state, options);
  return state;
}

// Each call is one service worker lifetime. Session storage survives across workers, memory does not.
function worker(desktopState, sessionRows, local = {writes: []}, clock = {now: 1000}) {
  let onMessage, onClick;
  const writes = [];
  const sessionStore = {
    async get(key) { return key in sessionRows ? {[key]: structuredClone(sessionRows[key])} : {}; },
    async set(values) { Object.assign(sessionRows, structuredClone(values)); writes.push(values); },
    async remove(key) { delete sessionRows[key]; },
  };
  const localStore = {async get() { return {}; }, async set(values) { local.writes.push(values); }, async remove() { local.writes.push('remove'); }};
  const connections = [];
  const chrome = {
    runtime: {
      id: 'fixture', getURL: name => 'chrome-extension://fixture/' + name, onInstalled: {addListener() {}}, onMessage: {addListener(fn) { onMessage = fn; }},
      connectNative() {
        if (!desktopState.reachable) throw new Error('Specified native messaging host not found.');
        let receive; const port = {
          disconnect() { port.closed = true; }, onDisconnect: {addListener() {}}, onMessage: {addListener(fn) { receive = fn; }},
          postMessage(message) {
            if (!desktopState.reachable) throw new Error('Native host has exited.');
            const reply = desktopState.answer(message);
            if (reply) queueMicrotask(() => receive(reply));
          },
        };
        connections.push(port); return port;
      },
    },
    contextMenus: {create() {}, onClicked: {addListener(fn) { onClick = fn; }}}, action: {setBadgeText() {}, setTitle() {}},
    storage: {session: sessionStore, local: localStore},
  };
  const context = vm.createContext({chrome, URL, setTimeout, clearTimeout, queueMicrotask, Date: {now: () => clock.now}});
  vm.runInContext(source, context);
  // Messages are built inside the worker's realm, as a real extension page message would be.
  const make = vm.runInContext('(text) => JSON.parse(text)', context);
  const sender = {id: 'fixture', url: chrome.runtime.getURL('options.html')};
  const ask = value => new Promise(resolve => { if (onMessage(make(JSON.stringify(value)), sender, resolve) === false) resolve('sync'); });
  const plain = async value => JSON.parse(JSON.stringify(await value));
  return {ask: value => plain(ask(value)), click: link => onClick({menuItemId: 'propose-download', linkUrl: link}), connections, sessionWrites: writes};
}

test('a restarted worker reuses the stored grant without asking the desktop to approve again', async () => {
  const d = desktop(), rows = {};
  const first = worker(d, rows);
  assert.deepEqual(await first.ask({type: 'pair'}), {paired: true});
  assert.equal(d.approvals, 1);
  const second = worker(d, rows); // the browser stopped the idle worker; a new one starts with empty memory
  const status = await second.ask({type: 'status'});
  assert.equal(status.paired, true);
  assert.equal('link' in status, false);
  assert.equal(d.approvals, 1, 'no second approval prompt');
  assert.deepEqual(d.seen.map(item => item.type), ['pair', 'resume']);
  assert.equal(d.seen[1].session, SESSION);
  second.click('https://public.example/file.bin');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(d.seen.map(item => item.type), ['pair', 'resume', 'propose']);
});

test('the first request after a restart lazily reconnects and the answer still arrives', async () => {
  const d = desktop(), rows = {};
  await worker(d, rows).ask({type: 'pair'});
  const next = worker(d, rows);
  d.seen.length = 0;
  const reply = await next.ask({type: 'desktop-status'});
  // The model refuses read-lock-state, so the worker confirms with one more resume that the grant is still honored.
  assert.deepEqual(d.seen.map(item => item.type), ['resume', 'read-lock-state', 'resume']);
  assert.notEqual(reply, undefined);
});

test('a grant the desktop no longer accepts ends as pairing expired and is forgotten', async () => {
  for (const cause of ['lock', 'disconnect', 'update', 'exit']) {
    const d = desktop(), rows = {};
    await worker(d, rows).ask({type: 'pair'});
    d.grant = null; // every one of these withdraws the session on the desktop
    const next = worker(d, rows);
    const status = await next.ask({type: 'status'});
    assert.deepEqual(status, {paired: false, link: 'expired'}, cause);
    assert.deepEqual(rows, {'pairing-expired': true}, 'the refused grant is removed; only the secret-free expired marker remains');
    d.seen.length = 0;
    assert.deepEqual(await next.ask({type: 'status'}), {paired: false, link: 'expired'});
    assert.deepEqual(d.seen, [], 'an expired grant is not presented again');
    assert.equal(d.approvals, 1);
    assert.equal((await next.ask({type: 'pair'})).paired, true, 'pairing again works');
    assert.equal(d.approvals, 2);
    assert.equal((await next.ask({type: 'status'})).paired, true);
  }
});

test('an unreachable desktop reads as reconnecting, keeps the grant and recovers without pairing', async () => {
  const d = desktop(), rows = {};
  await worker(d, rows).ask({type: 'pair'});
  d.reachable = false;
  const down = worker(d, rows);
  assert.deepEqual(await down.ask({type: 'status'}), {paired: false, link: 'reconnecting'});
  assert.equal(Object.keys(rows).length, 1, 'the grant is kept');
  d.reachable = true;
  assert.equal((await down.ask({type: 'status'})).paired, true);
  assert.equal(d.approvals, 1);
});

test('a grant past its lifetime is expired locally without contacting the desktop', async () => {
  const d = desktop({lifetime: 60}), rows = {}, clock = {now: 1000};
  await worker(d, rows, undefined, clock).ask({type: 'pair'});
  clock.now += 61000;
  const next = worker(d, rows, undefined, clock);
  d.seen.length = 0;
  assert.deepEqual(await next.ask({type: 'status'}), {paired: false, link: 'expired'});
  assert.deepEqual(d.seen, []);
});

test('an explicit Disconnect ends the desktop session and nothing can resume it afterwards', async () => {
  const d = desktop(), rows = {};
  const first = worker(d, rows);
  await first.ask({type: 'pair'});
  assert.deepEqual(await first.ask({type: 'disconnect'}), {paired: false});
  assert.equal(d.seen.at(-1).type, 'unpair');
  assert.equal(d.grant, null);
  assert.deepEqual(rows, {});
  const next = worker(d, rows);
  d.seen.length = 0;
  assert.deepEqual(await next.ask({type: 'status'}), {paired: false});
  assert.deepEqual(d.seen, []);
});

test('Disconnect after a restart resumes just long enough to end the desktop session', async () => {
  const d = desktop(), rows = {};
  await worker(d, rows).ask({type: 'pair'});
  const next = worker(d, rows);
  assert.deepEqual(await next.ask({type: 'disconnect'}), {paired: false});
  assert.deepEqual(d.seen.map(item => item.type), ['pair', 'resume', 'unpair']);
  assert.equal(d.grant, null);
  assert.deepEqual(rows, {});
});

test('the grant lives only in session storage and never reaches local storage or any reply', async () => {
  const d = desktop(), rows = {}, local = {writes: []};
  const first = worker(d, rows, local);
  const replies = [await first.ask({type: 'pair'})];
  const next = worker(d, rows, local);
  replies.push(await next.ask({type: 'status'}), await next.ask({type: 'desktop-status'}), await next.ask({type: 'disconnect'}));
  assert.deepEqual(local.writes, []);
  assert.equal(JSON.stringify(replies).includes(SESSION), false);
  assert.equal([...first.sessionWrites, ...next.sessionWrites].every(write => Object.keys(write).join() === 'pairing-grant' && Object.keys(write['pairing-grant']).sort().join() === 'expires,session'), true);
});

test('a forged or malformed stored value is ignored and never sent to the desktop', async () => {
  for (const bad of ['short', 12, null, {session: 'x'}, {session: 'z'.repeat(43)}, {session: 'z'.repeat(43), expires: 'soon'}, {session: 'z'.repeat(42) + '!', expires: 999999}]) {
    const d = desktop(), rows = {'pairing-grant': bad};
    const next = worker(d, rows);
    const status = await next.ask({type: 'status'});
    assert.equal(status.paired, false, JSON.stringify(bad));
    assert.equal(d.seen.some(item => item.type === 'resume' && item.session !== 'z'.repeat(43)), false);
  }
});

test('requests that need a pairing fail plainly when there is nothing to resume', async () => {
  const d = desktop();
  const next = worker(d, {});
  assert.equal((await next.ask({type: 'school-mode-read'})).paired, false);
  assert.deepEqual(d.seen, []);
});
