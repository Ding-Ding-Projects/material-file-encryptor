import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createBrowserUnlockLadderMediation, UNLOCK_LADDER_LEVELS, PROMPT_TIMEOUT_MS} from '../src/main/browser-unlock-ladder-mediation.js';
import {createBrowserElementLockMediation} from '../src/main/browser-element-lock-mediation.js';
import {createBrowserSchoolMediation} from '../src/main/browser-school-mediation.js';
import {createBrowserConfirmMediation} from '../src/main/browser-confirm-mediation.js';
import {createBrowserNativeBroker, nativeFrame} from '../src/main/browser-native-host.js';
import {createAccessIntegration} from '../src/main/access-integration.js';
import {passwordVerifier} from '../src/renderer/features/access/crypto.js';

const origin = 'chrome-extension://' + 'a'.repeat(32) + '/', session = 's'.repeat(43), connectionId = '11111111-1111-1111-1111-111111111111';
const config = {schemaVersion: 1, host: 'org.dingding.material_file_encryptor.downloads', allowedOrigins: [origin], identity: {extensionId: 'a'.repeat(32), packageSha256: '0'.repeat(64), publicKeySha256: '1'.repeat(64)}};
const flush = () => new Promise(resolve => setImmediate(resolve));
const read = {type: 'read-unlock-ladder', session};
const step = {type: 'request-unlock-step', session};
const NOW = 1000000;

/** A desktop whose ladder state is a plain mutable object, so each test decides what the desktop reports. */
function mediation(options = {}) {
  let unlocked = true, visible = true, pair = {session, expires: NOW + 900000};
  const desktop = {level: options.level ?? 2, until: options.until ?? 0, recovery: options.recovery ?? 'none'};
  const prompts = [];
  const service = createBrowserUnlockLadderMediation({
    getPair: () => pair, isUnlocked: () => unlocked, canPrompt: () => visible, now: () => NOW,
    readUnlockLadder: options.read ?? (async () => ({...desktop})),
    authenticate: options.authenticate ?? (context => new Promise(resolve => { prompts.push({context, resolve}); context.signal.addEventListener('abort', () => resolve(false), {once: true}); })),
    ...options.overrides,
  });
  const check = () => { if (!unlocked) throw Error('Unlock the desktop before receiving downloads.'); };
  return {service, prompts, desktop, send: (message = step) => service.receive(origin, message, check), lock: () => { unlocked = false; service.revoke(); }, hide: () => { visible = false; }, disconnect: () => { pair = null; service.revoke(); }};
}

test('the ladder has nine ordered levels and the last one is the one-hour cap of the desktop', () => {
  assert.deepEqual([...UNLOCK_LADDER_LEVELS], ['level-0', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6', 'level-7', 'level-8']);
  assert.throws(() => UNLOCK_LADDER_LEVELS.push('level-9'), TypeError, 'the list is frozen');
  // 30 seconds doubled each level reaches the one hour cap at level 8, which is the arithmetic in access-challenges.js.
  assert.equal(Math.min(3600000, 30000 * 2 ** 6), 1920000); assert.equal(Math.min(3600000, 30000 * 2 ** 7), 3600000);
});

test('read-unlock-ladder needs a pairing only and answers with fixed fields and no prompt', async () => {
  const m = mediation({level: 3});
  const answer = await m.send(read);
  assert.deepEqual(answer, {type: 'unlock-ladder', schemaVersion: 1, level: 'level-3', levels: [...UNLOCK_LADDER_LEVELS], cooldownUntil: null, recovery: 'none'});
  assert.deepEqual(Object.keys(answer).sort(), ['cooldownUntil', 'level', 'levels', 'recovery', 'schemaVersion', 'type']);
  assert.equal(m.prompts.length, 0, 'Status mode never prompts');
  const text = JSON.stringify(answer).toLowerCase();
  for (const forbidden of ['password', 'credential', 'profile', 'path', 'session', 'grant', 'verifier', 'hash', 'salt', 'nonce', 'answer', 'challenge']) assert.ok(!text.includes(forbidden), forbidden);
  const cooling = mediation({level: 12, until: NOW + 30000, recovery: 'available'});
  assert.deepEqual(await cooling.send(read), {type: 'unlock-ladder', schemaVersion: 1, level: 'level-8', levels: [...UNLOCK_LADDER_LEVELS], cooldownUntil: NOW + 30000, recovery: 'available'}, 'a higher stored level reads as the top rung');
  const ended = mediation({level: 1, until: NOW - 1}); assert.equal((await ended.send(read)).cooldownUntil, null, 'an elapsed cooldown is not reported');
  const odd = mediation({level: 1, recovery: 'unknown-word'}); assert.equal((await odd.send(read)).recovery, 'none', 'recovery is one of three fixed words');
  m.disconnect();
  await assert.rejects(m.send(read), /Pair the browser again/);
  for (const bad of [null, 'level', {level: -1, until: 0}, {level: 1.5, until: 0}, {level: 1, until: -5}, {level: '1', until: 0}, {until: 0}]) {
    await assert.rejects(mediation({read: async () => bad}).send(read), /unavailable/, JSON.stringify(bad));
  }
  await assert.rejects(mediation({read: async () => { throw Error('C:\\private\\path'); }}).send(read), /unavailable/);
  const pair = {session, expires: NOW + 900000};
  await assert.rejects(createBrowserUnlockLadderMediation({getPair: () => pair, isUnlocked: () => true, now: () => NOW}).receive(origin, read, () => {}), /unavailable/);
});

test('the step needs a fresh native re-authentication and reports the level read back afterwards', async () => {
  const m = mediation({level: 3});
  const pending = m.send(); await flush();
  assert.equal(m.prompts.length, 1);
  assert.equal(m.prompts[0].context.origin, origin);
  assert.deepEqual(Object.keys(m.prompts[0].context).sort(), ['origin', 'signal'], 'the prompt gets the origin and a withdrawal signal only');
  m.desktop.level = 0; // the desktop's own state machine clears the escalation when its credential check succeeds
  m.prompts[0].resolve(true);
  const answer = await pending;
  assert.deepEqual(answer, {type: 'unlock-step', schemaVersion: 1, state: 'advanced', level: 'level-0', cooldownUntil: null});
  assert.deepEqual(Object.keys(answer).sort(), ['cooldownUntil', 'level', 'schemaVersion', 'state', 'type']);
  const text = JSON.stringify(answer).toLowerCase();
  for (const forbidden of ['password', 'credential', 'profile', 'path', 'session', 'grant', 'verifier', 'hash', 'salt', 'nonce', 'answer', 'challenge']) assert.ok(!text.includes(forbidden), forbidden);
});

test('approval alone is not progress: the answer comes from the desktop state read afterwards', async () => {
  const unchanged = mediation({level: 2, authenticate: async () => true});
  assert.deepEqual(await unchanged.send(), {type: 'unlock-step', schemaVersion: 1, state: 'rejected', level: 'level-2', cooldownUntil: null}, 'a level that did not go down is never advanced');
  const cooled = mediation({level: 2, authenticate: async () => { cooled.desktop.until = NOW + 60000; return true; }});
  assert.deepEqual(await cooled.send(), {type: 'unlock-step', schemaVersion: 1, state: 'cooldown', level: 'level-2', cooldownUntil: NOW + 60000});
  let reads = 0;
  const failing = mediation({level: 2, authenticate: async () => true, read: async () => { if (++reads > 1) throw Error('gone'); return {level: 2, until: 0}; }});
  assert.deepEqual(await failing.send(), {type: 'unlock-step', schemaVersion: 1, state: 'unavailable', level: null, cooldownUntil: null});
});

test('a running cooldown is reported and never skipped: no prompt and no attempt', async () => {
  const m = mediation({level: 4, until: NOW + 90000});
  assert.deepEqual(await m.send(), {type: 'unlock-step', schemaVersion: 1, state: 'cooldown', level: 'level-4', cooldownUntil: NOW + 90000});
  assert.equal(m.prompts.length, 0, 'no prompt is shown during a cooldown');
  let authenticated = 0;
  const forced = mediation({level: 4, until: NOW + 90000, authenticate: async () => { authenticated++; return true; }});
  assert.equal((await forced.send()).state, 'cooldown'); assert.equal(authenticated, 0, 'the credential check is never attempted during a cooldown');
  const edge = mediation({level: 4, until: NOW + 1}); assert.equal((await edge.send()).state, 'cooldown');
  const done = mediation({level: 4, until: NOW, authenticate: async () => false}); assert.equal((await done.send()).state, 'rejected', 'a cooldown that has just ended is over');
});

test('with no escalation there is no step to take and the answer is complete without a prompt', async () => {
  const m = mediation({level: 0});
  assert.deepEqual(await m.send(), {type: 'unlock-step', schemaVersion: 1, state: 'complete', level: 'level-0', cooldownUntil: null});
  assert.equal(m.prompts.length, 0);
});

test('an impostor without the native callback cannot advance the ladder', async () => {
  for (const overrides of [{authenticate: null}, {authenticate: undefined}]) {
    const m = mediation({level: 3, overrides: {...overrides}, authenticate: null});
    assert.deepEqual(await m.send(), {type: 'unlock-step', schemaVersion: 1, state: 'unavailable', level: null, cooldownUntil: null});
  }
  const noRead = mediation({level: 3, overrides: {readUnlockLadder: undefined}, read: null});
  assert.equal((await noRead.send()).state, 'unavailable'); assert.equal(noRead.prompts.length, 0);
  for (const verdict of ['yes', 1, {ok: true}, undefined, null, 'unavailable', false]) {
    const m = mediation({level: 3, authenticate: async () => verdict});
    const answer = await m.send();
    assert.notEqual(answer.state, 'advanced', String(verdict));
    assert.equal(m.desktop.level, 3, 'nothing about the desktop state changed: ' + String(verdict));
  }
  const throwing = mediation({level: 3, authenticate: async () => { throw Error('C:\\private\\path'); }});
  const answer = await throwing.send(); assert.equal(answer.state, 'rejected'); assert.ok(!JSON.stringify(answer).includes('private'));
});

test('a rejected check answers rejected with the state read back and the pairing stays usable', async () => {
  const m = mediation({level: 3});
  const first = m.send(); await flush();
  m.desktop.until = NOW + 30000; m.desktop.level = 4; // a wrong credential can start a cooldown of its own
  m.prompts[0].resolve(false);
  assert.deepEqual(await first, {type: 'unlock-step', schemaVersion: 1, state: 'rejected', level: 'level-4', cooldownUntil: NOW + 30000});
  assert.equal((await m.send(read)).level, 'level-4', 'the pairing was not ended by the rejection');
  m.desktop.until = 0;
  const second = m.send(); await flush(); assert.equal(m.prompts.length, 2);
  m.desktop.level = 0; m.prompts[1].resolve(true); assert.equal((await second).state, 'advanced');
});

test('the single pending prompt is shared with Confirm mode, school mode and element locks in every direction', async () => {
  const gate = {held: false}, pair = {session, expires: NOW + 900000}, resolvers = [], confirmResolvers = [], schoolResolvers = [], lockResolvers = [];
  const desktop = {level: 3, until: 0};
  const ladder = createBrowserUnlockLadderMediation({getPair: () => pair, isUnlocked: () => true, now: () => NOW, gate, readUnlockLadder: async () => ({...desktop}), authenticate: () => new Promise(resolve => resolvers.push(resolve))});
  const confirm = createBrowserConfirmMediation({getPair: () => pair, isUnlocked: () => true, now: () => NOW, gate,
    confirm: context => new Promise(resolve => { confirmResolvers.push(resolve); context.signal.addEventListener('abort', () => resolve(false), {once: true}); }), focusAuthenticator: async () => {}});
  const school = createBrowserSchoolMediation({getPair: () => pair, isUnlocked: () => true, now: () => NOW, gate,
    readSchoolMode: async () => ({enabled: false, name: 'x'}), authenticate: () => new Promise(resolve => schoolResolvers.push(resolve)), applySchoolMode: async ({enabled}) => ({state: 'changed', enabled})});
  const locks = createBrowserElementLockMediation({getPair: () => pair, isUnlocked: () => true, now: () => NOW, gate,
    readElementLocks: async () => [], authenticate: () => new Promise(resolve => lockResolvers.push(resolve)), applyElementLock: async ({locked}) => ({state: 'changed', locked})});
  const focus = confirm.receive(origin, {type: 'focus-authenticator', session}, () => {}); await flush();
  assert.equal((await ladder.receive(origin, step, () => {})).state, 'busy');
  confirmResolvers[0](true); assert.equal((await focus).state, 'shown');
  const climbing = ladder.receive(origin, step, () => {}); await flush();
  assert.equal((await confirm.receive(origin, {type: 'focus-authenticator', session}, () => {})).state, 'busy');
  assert.equal((await school.receive(origin, {type: 'set-school-mode', session, enabled: true}, () => {})).state, 'busy');
  assert.equal((await locks.receive(origin, {type: 'set-element-lock', session, target: 'notes', locked: true}, () => {})).state, 'busy');
  assert.equal((await ladder.receive(origin, step, () => {})).state, 'busy', 'a second step request is busy too');
  assert.equal((await ladder.receive(origin, read, () => {})).type, 'unlock-ladder', 'a read still works while a prompt is pending');
  desktop.level = 0; resolvers[0](true); assert.equal((await climbing).state, 'advanced');
  const lockChange = locks.receive(origin, {type: 'set-element-lock', session, target: 'notes', locked: true}, () => {}); await flush();
  desktop.level = 3; assert.equal((await ladder.receive(origin, step, () => {})).state, 'busy');
  lockResolvers[0](true); assert.equal((await lockChange).state, 'changed');
  const schoolChange = school.receive(origin, {type: 'set-school-mode', session, enabled: true}, () => {}); await flush();
  assert.equal((await ladder.receive(origin, step, () => {})).state, 'busy');
  schoolResolvers[0](true); assert.equal((await schoolChange).state, 'changed');
  assert.equal(gate.held, false, 'the gate is released after each prompt');
});

test('a locked desktop, a hidden window, a missing callback or a closed service refuse at once without a prompt', async () => {
  const locked = mediation(); locked.lock(); await assert.rejects(locked.send(), /Unlock the desktop/); assert.equal(locked.prompts.length, 0);
  const flag = mediation({overrides: {isUnlocked: () => false}}); assert.equal((await flag.send()).state, 'unavailable'); assert.equal(flag.prompts.length, 0);
  const hidden = mediation(); hidden.hide(); assert.deepEqual(await hidden.send(), {type: 'unlock-step', schemaVersion: 1, state: 'unavailable', level: null, cooldownUntil: null}); assert.equal(hidden.prompts.length, 0);
  const closing = mediation(); closing.service.close(); await assert.rejects(closing.send(), /Pair the browser again/);
  const throwing = mediation({overrides: {canPrompt: () => { throw Error('window gone'); }}}); assert.equal((await throwing.send()).state, 'unavailable');
});

test('lock, disconnect and close withdraw the pending prompt and nothing advances', async () => {
  const locking = mediation(); const first = locking.send(); await flush();
  let aborted = false; locking.prompts[0].context.signal.addEventListener('abort', () => { aborted = true; }); locking.lock();
  await assert.rejects(first, /Unlock the desktop|Pair the browser again/); assert.equal(aborted, true); assert.equal(locking.desktop.level, 2); assert.equal(locking.service.pending, 0);
  const dropping = mediation(); const second = dropping.send(); await flush(); dropping.disconnect();
  await assert.rejects(second, /Pair the browser again/);
  const closing = mediation(); const third = closing.send(); await flush(); closing.service.close();
  await assert.rejects(third, /Pair the browser again/);
});

test('an unanswered prompt is withdrawn as rejected before the host deadline and frees the next request', async () => {
  const m = mediation({overrides: {promptTimeoutMs: 50}});
  assert.deepEqual(await m.send(), {type: 'unlock-step', schemaVersion: 1, state: 'rejected', level: 'level-2', cooldownUntil: null});
  assert.equal(m.prompts[0].context.signal.aborted, true, 'the native prompt is withdrawn, not left open');
  assert.equal(m.service.pending, 0);
  const second = m.send(); await flush(); assert.equal(m.prompts.length, 2);
  m.desktop.level = 0; m.prompts[1].resolve(true); assert.equal((await second).state, 'advanced');
  assert.ok(PROMPT_TIMEOUT_MS === 30000 && PROMPT_TIMEOUT_MS < 35000);
});

test('a late approval after the lock never reports advanced', async () => {
  const m = mediation(); const pending = m.send(); await flush();
  m.lock(); m.desktop.level = 0; m.prompts[0].resolve(true);
  await assert.rejects(pending);
});

test('malformed, extra-field, unpaired or mismatched requests are refused before any prompt', async () => {
  const m = mediation();
  const bad = [
    {type: 'request-unlock-step'}, {type: 'request-unlock-step', session, extra: 1}, {type: 'request-unlock-step', session, level: 'level-0'}, {type: 'read-unlock-ladder'}, {type: 'read-unlock-ladder', session, extra: 1},
    {type: 'request-unlock-step', session: 'x'.repeat(43)}, {type: 'request-unlock-step', session: 'short'}, {type: 'request-unlock-step', session: 42}, {type: 'request-unlock-step', session, [Symbol('x')]: 1},
    Object.assign(Object.create({inherited: 1}), step), {type: 'unlock-step', session}, null, 'text',
  ];
  for (const message of bad) await assert.rejects(m.send(message), /Unsupported|Pair the browser again/, JSON.stringify(message));
  await assert.rejects(m.service.receive(origin, step, undefined), /Unsupported/);
  assert.equal(m.prompts.length, 0);
  assert.throws(() => createBrowserUnlockLadderMediation({}), /Invalid/);
});

async function realDesktop() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unlock-ladder-')), records = new Map(), versions = new Map();
  let serial = 0, now = 100000; const frame = {};
  const write = (key, value) => { if (value === null) records.delete(key); else records.set(key, structuredClone(value)); versions.set(key, String(++serial)); return String(serial); };
  const credentials = {get: async key => structuredClone(records.get(key) ?? null), set: async (key, value) => write(key, value), delete: async key => write(key, null), list: async prefix => [...records.keys()].filter(key => key.startsWith(prefix)),
    readVersioned: async key => ({value: structuredClone(records.get(key) ?? null), revision: versions.get(key) ?? null}), compareAndSetVersioned: async (key, revision, value) => revision === (versions.get(key) ?? null) ? {updated: true, revision: write(key, value)} : {updated: false}};
  await credentials.set('local-profile:v1', await passwordVerifier('fixture-only-credential', 100000));
  const access = createAccessIntegration({dataDirectory: root, toolsDirectory: path.join(root, 'tools'), credentials, getMainFrame: () => frame, recordMutation: async () => {}, now: () => now});
  return {access, frame, advance: ms => { now += ms; }, now: () => now, async close() { access.close(); await fs.rm(root, {recursive: true, force: true}); }};
}

test('against the real access state machine: five wrong credentials start a cooldown, it is never skipped, and a correct one clears the escalation', async () => {
  const d = await realDesktop();
  try {
    const pair = {session, expires: d.now() + 900000}, prompts = [];
    const service = createBrowserUnlockLadderMediation({getPair: () => pair, isUnlocked: () => true, now: d.now,
      readUnlockLadder: async () => { const state = await d.access.readNativeWaitingLadder(); return {level: state.level, until: state.until, recovery: 'none'}; },
      authenticate: async () => { prompts.push(1); return (await d.access.authenticateNativeProfile('fixture-only-credential')).ok === true; }});
    const call = message => service.receive(origin, message, () => {});
    assert.equal((await call(read)).level, 'level-0');
    assert.equal((await call(step)).state, 'complete'); assert.equal(prompts.length, 0);
    for (let i = 0; i < 5; i++) assert.equal((await d.access.authenticateNativeProfile('wrong-fixture')).ok, false);
    const cooling = await call(read);
    assert.equal(cooling.level, 'level-1'); assert.ok(cooling.cooldownUntil > d.now(), 'the desktop started a cooldown');
    const refused = await call(step);
    assert.equal(refused.state, 'cooldown'); assert.equal(refused.cooldownUntil, cooling.cooldownUntil); assert.equal(prompts.length, 0, 'the correct credential is not even tried during the cooldown');
    d.advance(61000);
    assert.equal((await call(read)).cooldownUntil, null);
    assert.deepEqual(await call(step), {type: 'unlock-step', schemaVersion: 1, state: 'advanced', level: 'level-0', cooldownUntil: null});
    assert.equal(prompts.length, 1);
    assert.equal((await call(read)).level, 'level-0');
    assert.equal((await call(step)).state, 'complete');
  } finally { await d.close(); }
});

function framedBroker(options = {}) {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => queueMicrotask(() => { child.emit('exit', 0); child.emit('close', 0); });
  const state = {unlocked: true, visible: true, prompts: [], desktop: {level: 3, until: 0}};
  const broker = createBrowserNativeBroker({config, now: () => 0, hostPath: 'C:\\Fixture\\MaterialFileEncryptor.BrowserHost.exe', authorizePair: async () => true, isUnlocked: () => state.unlocked, onProposal() {}, spawnHost: () => child,
    ...(options.withCallbacks === false ? {} : {
      hasVisibleWindow: () => state.visible,
      readUnlockLadder: async () => ({...state.desktop, recovery: 'none'}),
      authenticateUnlockStep: context => new Promise(resolve => { state.prompts.push({context, resolve}); context.signal.addEventListener('abort', () => resolve(false), {once: true}); }),
      readSchoolMode: async () => ({enabled: false, name: 'School mode'}),
      authenticateSchoolMode: context => new Promise(resolve => { state.prompts.push({context, resolve}); context.signal.addEventListener('abort', () => resolve(false), {once: true}); }),
      applySchoolMode: async ({enabled}) => ({state: 'changed', enabled}),
      confirmAction: async () => false, focusAuthenticator: async () => {},
    })});
  let counter = 0;
  const send = (message, id = connectionId) => new Promise(resolve => {
    const requestId = '22222222-2222-2222-2222-' + String(++counter).padStart(12, '0');
    const onData = bytes => { const body = JSON.parse(bytes.subarray(4)); if (body.requestId === requestId) { child.stdin.off('data', onData); resolve(body.response); } };
    child.stdin.on('data', onData);
    child.stdout.write(nativeFrame({requestId, connectionId: id, origin, message}));
  });
  return {broker, child, state, send, async start() { const started = broker.start(); child.stdout.write(nativeFrame({type: 'ready', aclVerified: true})); await started; }};
}

test('native framed scopes need the paired live connection and the step waits for the desktop check', async () => {
  const f = framedBroker(); await f.start();
  try {
    assert.deepEqual(await f.send(read), {type: 'error', code: 'HANDOFF_NOT_ACCEPTED'}, 'unpaired callers are refused');
    assert.deepEqual(await f.send(step), {type: 'error', code: 'HANDOFF_NOT_ACCEPTED'}); assert.equal(f.state.prompts.length, 0);
    const pair = await f.send({type: 'pair'}); assert.equal(pair.type, 'paired');
    const s = pair.session;
    assert.deepEqual(await f.send({type: 'read-unlock-ladder', session: s}), {type: 'unlock-ladder', schemaVersion: 1, level: 'level-3', levels: [...UNLOCK_LADDER_LEVELS], cooldownUntil: null, recovery: 'none'});
    const asking = f.send({type: 'request-unlock-step', session: s}); await flush(); await flush();
    assert.equal(f.state.prompts.length, 1);
    f.state.desktop.level = 0; f.state.prompts[0].resolve(true);
    assert.deepEqual(await asking, {type: 'unlock-step', schemaVersion: 1, state: 'advanced', level: 'level-0', cooldownUntil: null});
    f.state.desktop.level = 3; const rejected = f.send({type: 'request-unlock-step', session: s}); await flush(); await flush(); f.state.prompts[1].resolve(false);
    assert.equal((await rejected).state, 'rejected');
    assert.equal((await f.send({type: 'read-lock-state', session: s})).state, 'unlocked', 'a rejection leaves the pairing in place');
    assert.equal((await f.send({type: 'request-unlock-step', session: s, extra: true})).type, 'error');
    await assert.rejects(f.broker.receive(origin, {type: 'request-unlock-step', session: s}), /connection identity/);
  } finally { await f.broker.close(); }
});

test('through the broker an impostor without the native callback cannot advance, and the cooldown is reported', async () => {
  const bare = framedBroker({withCallbacks: false}); await bare.start();
  try {
    const pair = await bare.send({type: 'pair'});
    assert.deepEqual(await bare.send({type: 'request-unlock-step', session: pair.session}), {type: 'unlock-step', schemaVersion: 1, state: 'unavailable', level: null, cooldownUntil: null});
    assert.equal((await bare.send({type: 'read-unlock-ladder', session: pair.session})).type, 'error', 'with no desktop adapter there is nothing to read');
  } finally { await bare.broker.close(); }
  const f = framedBroker(); await f.start();
  try {
    const pair = await f.send({type: 'pair'}), s = pair.session;
    f.state.desktop.until = Date.now() + 600000;
    const answer = await f.send({type: 'request-unlock-step', session: s});
    assert.equal(answer.state, 'cooldown'); assert.equal(f.state.prompts.length, 0);
  } finally { await f.broker.close(); }
});

test('through the broker a pending step shares the prompt with school mode and is withdrawn by locking', async () => {
  const f = framedBroker(); await f.start();
  try {
    const pair = await f.send({type: 'pair'}), s = pair.session;
    f.state.visible = false; assert.equal((await f.send({type: 'request-unlock-step', session: s})).state, 'unavailable'); assert.equal(f.state.prompts.length, 0);
    f.state.visible = true; const asked = f.send({type: 'request-unlock-step', session: s}); await flush(); await flush(); assert.equal(f.state.prompts.length, 1);
    assert.equal((await f.send({type: 'set-school-mode', session: s, enabled: true})).state, 'busy', 'school mode shares the prompt');
    assert.equal((await f.send({type: 'request-unlock-step', session: s})).state, 'busy');
    f.state.unlocked = false; f.broker.revoke();
    assert.equal((await asked).type, 'error'); assert.equal(f.state.prompts[0].context.signal.aborted, true);
    f.state.unlocked = true; assert.equal((await f.send({type: 'read-unlock-ladder', session: s})).type, 'error', 'the lock revoked the pairing');
  } finally { await f.broker.close(); }
});
