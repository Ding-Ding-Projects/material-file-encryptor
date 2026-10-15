import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8');
const SESSION = 'q'.repeat(43);

// A small model of the desktop. Replies arrive after a short delay so that overlapping requests really overlap.
function desktop(options = {}) {
  const state = {grant: null, reachable: true, approvals: 0, seen: [], delayMs: 3, failProtection: false};
  state.answer = message => {
    state.seen.push(message);
    if (!state.reachable) return null;
    if (message.type === 'pair') { state.approvals++; state.grant = SESSION; return {type: 'paired', session: SESSION, expiresInSeconds: 900}; }
    const known = state.grant !== null && message.session === state.grant;
    if (message.type === 'resume') return known ? {type: 'resumed', expiresInSeconds: 800} : {type: 'error', code: 'HANDOFF_NOT_ACCEPTED'};
    if (message.type === 'unpair') { state.grant = null; return {type: 'unpaired'}; }
    if (message.type === 'protection-status') return known && !state.failProtection ? {type: 'protection-status', schemaVersion: 1, profile: 'authenticated', sharedMode: 'inactive', browserPermission: 'unavailable'} : {type: 'error', code: 'HANDOFF_NOT_ACCEPTED'};
    return {type: 'error', code: 'HANDOFF_NOT_ACCEPTED'};
  };
  return Object.assign(state, options);
}

function worker(desktopState, sessionRows, clock = {now: 1000}) {
  let onMessage;
  const sessionStore = {
    async get(key) { return key in sessionRows ? {[key]: structuredClone(sessionRows[key])} : {}; },
    async set(values) { Object.assign(sessionRows, structuredClone(values)); },
    async remove(key) { delete sessionRows[key]; },
  };
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
            if (reply) setTimeout(() => receive(reply), desktopState.delayMs);
          },
        };
        return port;
      },
    },
    contextMenus: {create() {}, onClicked: {addListener() {}}}, action: {setBadgeText() {}, setTitle() {}},
    storage: {session: sessionStore, local: {async get() { return {}; }, async set() {}, async remove() {}}},
  };
  const context = vm.createContext({chrome, URL, setTimeout, clearTimeout, queueMicrotask, Date: {now: () => clock.now}});
  vm.runInContext(source, context);
  const make = vm.runInContext('(text) => JSON.parse(text)', context);
  const sender = {id: 'fixture', url: chrome.runtime.getURL('options.html')};
  const ask = value => new Promise(resolve => { if (onMessage(make(JSON.stringify(value)), sender, resolve) === false) resolve('sync'); });
  return {ask: async value => JSON.parse(JSON.stringify(await ask(value)))};
}

test('requests that arrive together after the worker idled all wait for the single resume and all succeed', async () => {
  const d = desktop(), rows = {};
  await worker(d, rows).ask({type: 'pair'});
  const next = worker(d, rows); // a new worker with no memory, as after the browser stopped the idle one
  d.seen.length = 0;
  const replies = await Promise.all([next.ask({type: 'protection-status'}), next.ask({type: 'protection-status'}), next.ask({type: 'protection-status'})]);
  for (const reply of replies) assert.equal(reply.profile, 'authenticated', JSON.stringify(reply));
  assert.equal(d.seen.filter(item => item.type === 'resume').length, 1, 'one resume serves every waiting request');
  assert.equal(d.seen.filter(item => item.type === 'protection-status').length, 3);
});

test('a request that waits behind a slow in-flight one is answered, not refused as busy', async () => {
  const d = desktop({delayMs: 25}), rows = {};
  const first = worker(d, rows);
  await first.ask({type: 'pair'});
  const [a, b] = await Promise.all([first.ask({type: 'protection-status'}), first.ask({type: 'protection-status'})]);
  assert.equal(a.profile, 'authenticated');
  assert.equal(b.profile, 'authenticated');
});

test('after the desktop locks, the next refused request clears the grant and the link reads expired', async () => {
  const d = desktop(), rows = {};
  const w = worker(d, rows);
  await w.ask({type: 'pair'});
  assert.equal((await w.ask({type: 'protection-status'})).profile, 'authenticated');
  d.grant = null; // lock revokes the session on the desktop
  assert.deepEqual(await w.ask({type: 'protection-status'}), {error: 'Protection observations are unavailable.'});
  assert.deepEqual(await w.ask({type: 'status'}), {paired: false, link: 'expired'});
  assert.equal('pairing-grant' in rows, false);
});

test('the periodic verification notices a lock within one poll and a healthy pairing stays paired', async () => {
  const d = desktop(), rows = {};
  const w = worker(d, rows);
  await w.ask({type: 'pair'});
  assert.deepEqual(await w.ask({type: 'verify-pairing'}), {paired: true});
  assert.deepEqual(await w.ask({type: 'verify-pairing'}), {paired: true});
  d.grant = null;
  assert.deepEqual(await w.ask({type: 'verify-pairing'}), {paired: false, link: 'expired'});
  assert.deepEqual(await w.ask({type: 'verify-pairing'}), {paired: false, link: 'expired'});
});

test('a refusal that is not a revocation leaves the pairing in place', async () => {
  const d = desktop({failProtection: true}), rows = {};
  const w = worker(d, rows);
  await w.ask({type: 'pair'});
  assert.deepEqual(await w.ask({type: 'protection-status'}), {error: 'Protection observations are unavailable.'});
  assert.deepEqual(await w.ask({type: 'status'}), {paired: true});
  assert.equal('pairing-grant' in rows, true);
});

test('pairing expired survives a worker restart, and pairing again or disconnecting clears it', async () => {
  const d = desktop(), rows = {};
  await worker(d, rows).ask({type: 'pair'});
  d.grant = null; // the desktop exited or locked: it no longer knows the grant
  assert.deepEqual(await worker(d, rows).ask({type: 'status'}), {paired: false, link: 'expired'});
  d.seen.length = 0;
  const later = worker(d, rows); // another idle restart after the refusal was recorded
  assert.deepEqual(await later.ask({type: 'status'}), {paired: false, link: 'expired'});
  assert.deepEqual(d.seen, [], 'nothing stale is presented to the desktop again');
  assert.equal((await later.ask({type: 'pair'})).paired, true);
  assert.equal('pairing-expired' in rows, false, 'pairing again clears the expired marker');
  assert.deepEqual(await worker(d, rows).ask({type: 'status'}), {paired: true});

  d.grant = null;
  const expired = worker(d, rows);
  await expired.ask({type: 'status'});
  assert.deepEqual(await expired.ask({type: 'disconnect'}), {paired: false});
  assert.deepEqual(await worker(d, rows).ask({type: 'status'}), {paired: false}, 'Disconnect returns to plain not paired');
});

test('reconnecting is reported only while the desktop is unreachable, then recovers or expires truthfully', async () => {
  const d = desktop(), rows = {};
  await worker(d, rows).ask({type: 'pair'});
  d.reachable = false;
  const w = worker(d, rows);
  assert.deepEqual(await w.ask({type: 'status'}), {paired: false, link: 'reconnecting'});
  assert.deepEqual(await w.ask({type: 'verify-pairing'}), {paired: false, link: 'reconnecting'});
  d.reachable = true;
  d.grant = null; // the app was closed and reopened: its new session does not know the old grant
  assert.deepEqual(await w.ask({type: 'status'}), {paired: false, link: 'expired'});
  assert.deepEqual(await worker(d, rows).ask({type: 'status'}), {paired: false, link: 'expired'});
});
