import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createBrowserElementLockMediation} from '../src/main/browser-element-lock-mediation.js';
import {createBrowserSchoolMediation} from '../src/main/browser-school-mediation.js';
import {createBrowserConfirmMediation} from '../src/main/browser-confirm-mediation.js';
import {createBrowserNativeBroker, nativeFrame} from '../src/main/browser-native-host.js';
import {createFeatureServices} from '../src/main/feature-services.js';
import {readExtensionElementLocks, setExtensionElementLock} from '../src/main/access-integration.js';
import {EXTENSION_LOCK_TABS, extensionLockId, isExtensionLockTab} from '../src/shared/extension-lock-targets.js';
import {passwordVerifier, verifyPassword} from '../src/renderer/features/access/crypto.js';

const origin = 'chrome-extension://' + 'a'.repeat(32) + '/', session = 's'.repeat(43), connectionId = '11111111-1111-1111-1111-111111111111';
const config = {schemaVersion: 1, host: 'org.dingding.material_file_encryptor.downloads', allowedOrigins: [origin], identity: {extensionId: 'a'.repeat(32), packageSha256: '0'.repeat(64), publicKeySha256: '1'.repeat(64)}};
const flush = () => new Promise(resolve => setImmediate(resolve));
const read = {type: 'read-element-locks', session};
const set = (target = 'notes', locked = true) => ({type: 'set-element-lock', session, target, locked});

function mediation(options = {}) {
  let unlocked = true, visible = true, pair = {session, expires: 901000}, held = new Set(options.initial || []);
  const prompts = [], applied = [];
  const service = createBrowserElementLockMediation({
    getPair: () => pair, isUnlocked: () => unlocked, canPrompt: () => visible, now: () => 1000,
    readElementLocks: async () => [...held],
    authenticate: options.authenticate ?? (context => new Promise(resolve => { prompts.push({context, resolve}); context.signal.addEventListener('abort', () => resolve(false), {once: true}); })),
    applyElementLock: options.apply ?? (async ({target, locked}) => { applied.push([target, locked]); if (held.has(target) === locked) return {state: 'unchanged', locked}; if (locked) held.add(target); else held.delete(target); return {state: 'changed', locked}; }),
    ...options.overrides,
  });
  const check = () => { if (!unlocked) throw Error('Unlock the desktop before receiving downloads.'); };
  return {service, prompts, applied, held, send: (message = set()) => service.receive(origin, message, check), lock: () => { unlocked = false; service.revoke(); }, hide: () => { visible = false; }, disconnect: () => { pair = null; service.revoke(); }};
}

test('the reviewed target list is fixed, one entry per options tab, and unknown targets are not lockable', () => {
  assert.deepEqual([...EXTENSION_LOCK_TABS], ['connection', 'personalization', 'changelog', 'notes', 'docs', 'support', 'dimsum', 'models', 'status']);
  assert.equal(extensionLockId('notes'), 'extension:notes');
  assert.ok(isExtensionLockTab('docs'));
  for (const bad of ['', 'Notes', 'extension:notes', 'popup', '../notes', 'notes ', 42, null, undefined, ['notes']]) assert.equal(isExtensionLockTab(bad), false, String(bad));
  assert.throws(() => EXTENSION_LOCK_TABS.push('popup'), TypeError, 'the list is frozen');
});

test('the extension keeps the same list as the desktop', async () => {
  const options = await fs.readFile(new URL('../browser-extension/options.js', import.meta.url), 'utf8'), background = await fs.readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8');
  const listOf = text => JSON.parse(text.match(/const LOCK_TABS=(\[[^\]]*\])/)[1].replace(/'/g, '"'));
  assert.deepEqual(listOf(options), [...EXTENSION_LOCK_TABS]);
  assert.deepEqual(listOf(background), [...EXTENSION_LOCK_TABS]);
});

test('read-element-locks needs a pairing only and answers with reviewed tab ids in list order', async () => {
  const m = mediation({initial: ['status', 'notes', 'extension:ghost', 'popup']});
  const answer = await m.send(read);
  assert.deepEqual(answer, {type: 'element-locks', schemaVersion: 1, locked: ['notes', 'status']});
  assert.deepEqual(Object.keys(answer).sort(), ['locked', 'schemaVersion', 'type']);
  assert.equal(m.prompts.length, 0, 'Status mode never prompts');
  assert.deepEqual(await mediation().send(read), {type: 'element-locks', schemaVersion: 1, locked: []});
  m.disconnect();
  await assert.rejects(m.send(read), /Pair the browser again/);
  const pair = {session, expires: 901000};
  const bad = createBrowserElementLockMediation({getPair: () => pair, isUnlocked: () => true, now: () => 1000, readElementLocks: async () => 'notes'});
  await assert.rejects(bad.receive(origin, read, () => {}), /unavailable/);
  const missing = createBrowserElementLockMediation({getPair: () => pair, isUnlocked: () => true, now: () => 1000});
  await assert.rejects(missing.receive(origin, read, () => {}), /unavailable/);
});

test('locking needs a fresh native re-authentication and only then reaches the desktop record', async () => {
  const m = mediation();
  const pending = m.send(set('notes', true)); await flush();
  assert.equal(m.prompts.length, 1);
  assert.equal(m.prompts[0].context.origin, origin);
  assert.equal(m.prompts[0].context.target, 'notes');
  assert.deepEqual(m.applied, [], 'nothing changes before the person authenticates');
  m.prompts[0].resolve(true);
  const answer = await pending;
  assert.deepEqual(answer, {type: 'element-lock-set', schemaVersion: 1, state: 'changed', target: 'notes', locked: true});
  assert.deepEqual(Object.keys(answer).sort(), ['locked', 'schemaVersion', 'state', 'target', 'type']);
  const text = JSON.stringify(answer).toLowerCase();
  for (const forbidden of ['password', 'credential', 'profile', 'path', 'session', 'grant', 'verifier', 'hash', 'salt']) assert.ok(!text.includes(forbidden), forbidden);
  const same = m.send(set('notes', true)); await flush(); m.prompts[1].resolve(true);
  assert.equal((await same).state, 'unchanged');
});

test('unlocking needs the same fresh re-authentication, so an impostor cannot remove a lock', async () => {
  const m = mediation({initial: ['docs']});
  const pending = m.send(set('docs', false)); await flush();
  assert.equal(m.prompts.length, 1, 'unlocking prompts exactly like locking');
  assert.deepEqual(m.applied, []);
  assert.ok(m.held.has('docs'));
  m.prompts[0].resolve(true);
  assert.deepEqual(await pending, {type: 'element-lock-set', schemaVersion: 1, state: 'changed', target: 'docs', locked: false});
  const none = mediation({initial: ['docs'], overrides: {authenticate: undefined}, authenticate: null});
  assert.deepEqual(await none.send(set('docs', false)), {type: 'element-lock-set', schemaVersion: 1, state: 'unavailable', target: 'docs', locked: null});
  assert.ok(none.held.has('docs'));
  assert.deepEqual(none.applied, []);
  const noApply = mediation({initial: ['docs'], overrides: {applyElementLock: undefined}});
  assert.equal((await noApply.send(set('docs', false))).state, 'unavailable');
  assert.equal(noApply.prompts.length, 0);
  for (const verdict of ['yes', 1, {ok: true}, undefined, null, 'unavailable', false]) {
    for (const locked of [true, false]) {
      const x = mediation({initial: ['docs'], authenticate: async () => verdict});
      const answer = await x.send(set('docs', locked));
      assert.notEqual(answer.state, 'changed', String(verdict));
      assert.deepEqual(x.applied, [], String(verdict));
      assert.ok(x.held.has('docs'), String(verdict));
    }
  }
});

test('a rejected authentication answers rejected with the current state and the pairing stays usable', async () => {
  const m = mediation({initial: ['support']});
  const first = m.send(set('support', false)); await flush(); m.prompts[0].resolve(false);
  assert.deepEqual(await first, {type: 'element-lock-set', schemaVersion: 1, state: 'rejected', target: 'support', locked: true});
  assert.deepEqual(m.applied, []);
  const throwing = mediation({authenticate: async () => { throw Error('C:\\private\\path'); }});
  const answer = await throwing.send(set('notes', true));
  assert.equal(answer.state, 'rejected'); assert.ok(!JSON.stringify(answer).includes('private'));
  const second = m.send(set('support', false)); await flush(); assert.equal(m.prompts.length, 2);
  m.prompts[1].resolve(true); assert.equal((await second).state, 'changed');
});

test('the single pending prompt is shared with Confirm mode and school mode in every direction', async () => {
  const gate = {held: false}, pair = {session, expires: 901000}, prompts = [], resolvers = [], schoolResolvers = [];
  const confirm = createBrowserConfirmMediation({getPair: () => pair, isUnlocked: () => true, now: () => 1000, gate,
    confirm: context => new Promise(resolve => { prompts.push(resolve); context.signal.addEventListener('abort', () => resolve(false), {once: true}); }), focusAuthenticator: async () => {}});
  const school = createBrowserSchoolMediation({getPair: () => pair, isUnlocked: () => true, now: () => 1000, gate,
    readSchoolMode: async () => ({enabled: false, name: 'x'}), authenticate: () => new Promise(resolve => schoolResolvers.push(resolve)), applySchoolMode: async ({enabled}) => ({state: 'changed', enabled})});
  const locks = createBrowserElementLockMediation({getPair: () => pair, isUnlocked: () => true, now: () => 1000, gate,
    readElementLocks: async () => [], authenticate: () => new Promise(resolve => resolvers.push(resolve)), applyElementLock: async ({target, locked}) => ({state: 'changed', locked})});
  const focus = confirm.receive(origin, {type: 'focus-authenticator', session}, () => {}); await flush();
  assert.equal((await locks.receive(origin, set(), () => {})).state, 'busy');
  prompts[0](true); assert.equal((await focus).state, 'shown');
  const change = locks.receive(origin, set(), () => {}); await flush();
  assert.equal((await confirm.receive(origin, {type: 'focus-authenticator', session}, () => {})).state, 'busy');
  assert.equal((await school.receive(origin, {type: 'set-school-mode', session, enabled: true}, () => {})).state, 'busy');
  assert.equal((await locks.receive(origin, set('docs', true), () => {})).state, 'busy', 'a second lock request is busy too');
  resolvers[0](true); assert.equal((await change).state, 'changed');
  const schoolChange = school.receive(origin, {type: 'set-school-mode', session, enabled: true}, () => {}); await flush();
  assert.equal((await locks.receive(origin, set(), () => {})).state, 'busy');
  schoolResolvers[0](true); assert.equal((await schoolChange).state, 'changed');
  assert.equal(gate.held, false, 'the gate is released after each prompt');
});

test('a locked desktop, a hidden window, a missing callback or a closed service refuse at once without a prompt', async () => {
  const locked = mediation(); locked.lock(); await assert.rejects(locked.send(), /Unlock the desktop/); assert.equal(locked.prompts.length, 0);
  const flag = mediation({overrides: {isUnlocked: () => false}}); assert.equal((await flag.send()).state, 'unavailable'); assert.equal(flag.prompts.length, 0);
  const hidden = mediation(); hidden.hide(); assert.deepEqual(await hidden.send(), {type: 'element-lock-set', schemaVersion: 1, state: 'unavailable', target: 'notes', locked: null}); assert.equal(hidden.prompts.length, 0);
  const closing = mediation(); closing.service.close(); await assert.rejects(closing.send(), /Pair the browser again/);
  const throwing = mediation({overrides: {canPrompt: () => { throw Error('window gone'); }}}); assert.equal((await throwing.send()).state, 'unavailable');
});

test('lock, disconnect and close withdraw the pending prompt and nothing changes', async () => {
  const locking = mediation(); const first = locking.send(); await flush();
  let aborted = false; locking.prompts[0].context.signal.addEventListener('abort', () => { aborted = true; }); locking.lock();
  await assert.rejects(first, /Unlock the desktop|Pair the browser again/); assert.equal(aborted, true); assert.deepEqual(locking.applied, []); assert.equal(locking.service.pending, 0);
  const dropping = mediation(); const second = dropping.send(); await flush(); dropping.disconnect();
  await assert.rejects(second, /Pair the browser again/); assert.deepEqual(dropping.applied, []);
  const closing = mediation(); const third = closing.send(); await flush(); closing.service.close();
  await assert.rejects(third, /Pair the browser again/); assert.deepEqual(closing.applied, []);
});

test('an unanswered prompt is withdrawn as rejected before the host deadline and frees the next request', async () => {
  const m = mediation({overrides: {promptTimeoutMs: 50}});
  assert.deepEqual(await m.send(set('notes', true)), {type: 'element-lock-set', schemaVersion: 1, state: 'rejected', target: 'notes', locked: false});
  assert.equal(m.prompts[0].context.signal.aborted, true, 'the native prompt is withdrawn, not left open');
  assert.deepEqual(m.applied, []); assert.equal(m.service.pending, 0);
  const second = m.send(set('notes', true)); await flush(); assert.equal(m.prompts.length, 2);
  m.prompts[1].resolve(true); assert.equal((await second).state, 'changed');
  const {PROMPT_TIMEOUT_MS} = await import('../src/main/browser-element-lock-mediation.js');
  assert.ok(PROMPT_TIMEOUT_MS === 30000 && PROMPT_TIMEOUT_MS < 35000);
});

test('a late approval after the lock or a failing desktop write never reports changed', async () => {
  const m = mediation(); const pending = m.send(set('notes', true)); await flush();
  m.lock(); m.prompts[0].resolve(true);
  await assert.rejects(pending); assert.deepEqual(m.applied, []);
  const failing = mediation({authenticate: async () => true, apply: async () => { throw Error('C:\\private\\path'); }});
  const answer = await failing.send(set('notes', true)); assert.equal(answer.state, 'unavailable'); assert.ok(!JSON.stringify(answer).includes('private'));
  for (const result of [null, 'changed', {state: 'changed'}, {state: 'maybe', locked: true}, {state: 'changed', locked: 'yes'}]) {
    const m2 = mediation({authenticate: async () => true, apply: async () => result});
    assert.equal((await m2.send(set('notes', true))).state, 'unavailable', JSON.stringify(result));
  }
  const rejectedByDesktop = mediation({initial: ['notes'], authenticate: async () => true, apply: async () => ({state: 'rejected', locked: true})});
  assert.deepEqual(await rejectedByDesktop.send(set('notes', false)), {type: 'element-lock-set', schemaVersion: 1, state: 'rejected', target: 'notes', locked: true});
});

test('malformed, unknown-target, unpaired or mismatched requests are refused before any prompt', async () => {
  const m = mediation();
  const bad = [
    {type: 'set-element-lock', session, target: 'notes'}, {type: 'set-element-lock', session, locked: true}, {type: 'set-element-lock', session, target: 'notes', locked: 'true'}, {type: 'set-element-lock', session, target: 'notes', locked: 1},
    {type: 'set-element-lock', session, target: 'extension:notes', locked: true}, {type: 'set-element-lock', session, target: 'popup', locked: true}, {type: 'set-element-lock', session, target: '', locked: true}, {type: 'set-element-lock', session, target: ['notes'], locked: true},
    {type: 'set-element-lock', session, target: 'element:profile', locked: true}, {type: 'set-element-lock', session, target: 'profile', locked: true}, {type: 'set-element-lock', session, target: 'notes', locked: true, extra: 1},
    {type: 'read-element-locks', session, extra: 1}, {type: 'read-element-locks'}, {type: 'set-element-lock', session: 'x'.repeat(43), target: 'notes', locked: true}, {type: 'set-element-lock', session: 'short', target: 'notes', locked: true},
    {type: 'set-element-lock', session, target: 'notes', locked: true, [Symbol('x')]: 1}, Object.assign(Object.create({inherited: 1}), set()), null, 'text',
  ];
  for (const message of bad) await assert.rejects(m.send(message), /Unsupported|Pair the browser again/, JSON.stringify(message));
  await assert.rejects(m.service.receive(origin, set(), undefined), /Unsupported/);
  assert.equal(m.prompts.length, 0); assert.deepEqual(m.applied, []);
  assert.throws(() => createBrowserElementLockMediation({}), /Invalid/);
});

function framedBroker(options = {}) {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => queueMicrotask(() => { child.emit('exit', 0); child.emit('close', 0); });
  const state = {unlocked: true, visible: true, prompts: [], applied: [], held: new Set()};
  const broker = createBrowserNativeBroker({config, now: () => 0, hostPath: 'C:\\Fixture\\MaterialFileEncryptor.BrowserHost.exe', authorizePair: async () => true, isUnlocked: () => state.unlocked, onProposal() {}, spawnHost: () => child,
    ...(options.withCallbacks === false ? {} : {
      hasVisibleWindow: () => state.visible,
      readElementLocks: async () => [...state.held],
      authenticateElementLock: context => new Promise(resolve => { state.prompts.push({context, resolve}); context.signal.addEventListener('abort', () => resolve(false), {once: true}); }),
      applyElementLock: async ({target, locked}) => { state.applied.push([target, locked]); if (locked) state.held.add(target); else state.held.delete(target); return {state: 'changed', locked}; },
      readSchoolMode: async () => ({enabled: false, name: 'School mode'}),
      authenticateSchoolMode: context => new Promise(resolve => { state.prompts.push({context, resolve}); context.signal.addEventListener('abort', () => resolve(false), {once: true}); }),
      applySchoolMode: async ({enabled}) => ({state: 'changed', enabled}),
      confirmAction: async () => false, focusAuthenticator: async () => {},
    }), ...options.overrides});
  let counter = 0;
  const send = (message, id = connectionId) => new Promise(resolve => { const requestId = '22222222-2222-2222-2222-' + String(++counter).padStart(12, '0'); const onData = bytes => { const body = JSON.parse(bytes.subarray(4)); if (body.requestId === requestId) { child.stdin.off('data', onData); resolve(body.response); } }; child.stdin.on('data', onData); child.stdout.write(nativeFrame({requestId, connectionId: id, origin, message})); });
  return {broker, child, state, send, async start() { const started = broker.start(); child.stdout.write(nativeFrame({type: 'ready', aclVerified: true})); await started; }};
}

test('native framed scopes need the paired live connection, and both changes wait for the desktop check', async () => {
  const f = framedBroker(); await f.start();
  try {
    assert.deepEqual(await f.send({type: 'read-element-locks', session}), {type: 'error', code: 'HANDOFF_NOT_ACCEPTED'}, 'unpaired callers are refused');
    assert.deepEqual(await f.send(set()), {type: 'error', code: 'HANDOFF_NOT_ACCEPTED'}); assert.equal(f.state.prompts.length, 0);
    const pair = await f.send({type: 'pair'}); assert.equal(pair.type, 'paired');
    const s = pair.session;
    assert.deepEqual(await f.send({type: 'read-element-locks', session: s}), {type: 'element-locks', schemaVersion: 1, locked: []});
    const lock = f.send({type: 'set-element-lock', session: s, target: 'notes', locked: true}); await flush(); await flush();
    assert.equal(f.state.prompts.length, 1); assert.deepEqual(f.state.applied, [], 'nothing changes before the person answers');
    f.state.prompts[0].resolve(true);
    assert.deepEqual(await lock, {type: 'element-lock-set', schemaVersion: 1, state: 'changed', target: 'notes', locked: true});
    assert.deepEqual((await f.send({type: 'read-element-locks', session: s})).locked, ['notes']);
    const unlock = f.send({type: 'set-element-lock', session: s, target: 'notes', locked: false}); await flush(); await flush();
    assert.equal(f.state.prompts.length, 2, 'unlocking prompts again'); f.state.prompts[1].resolve(false);
    assert.deepEqual(await unlock, {type: 'element-lock-set', schemaVersion: 1, state: 'rejected', target: 'notes', locked: true});
    assert.equal((await f.send({type: 'read-lock-state', session: s})).state, 'unlocked', 'a rejection leaves the pairing in place');
    assert.equal((await f.send({type: 'set-element-lock', session: s, target: 'popup', locked: true})).type, 'error');
    assert.equal((await f.send({type: 'set-element-lock', session: s, target: 'notes', locked: true, extra: true})).type, 'error');
    await assert.rejects(f.broker.receive(origin, {type: 'set-element-lock', session: s, target: 'notes', locked: true}), /connection identity/);
  } finally { await f.broker.close(); }
});

test('through the broker an impostor without the native callback cannot change or remove a lock', async () => {
  const f = framedBroker({withCallbacks: false}); await f.start();
  try {
    const pair = await f.send({type: 'pair'});
    assert.deepEqual(await f.send({type: 'set-element-lock', session: pair.session, target: 'notes', locked: true}), {type: 'element-lock-set', schemaVersion: 1, state: 'unavailable', target: 'notes', locked: null});
    assert.deepEqual(await f.send({type: 'set-element-lock', session: pair.session, target: 'notes', locked: false}), {type: 'element-lock-set', schemaVersion: 1, state: 'unavailable', target: 'notes', locked: null});
    assert.equal((await f.send({type: 'read-element-locks', session: pair.session})).type, 'error', 'with no desktop adapter there is nothing to read');
    assert.deepEqual(f.state.applied, []);
  } finally { await f.broker.close(); }
});

test('through the broker a pending lock request shares the prompt with school mode and is withdrawn by locking', async () => {
  const f = framedBroker(); await f.start();
  try {
    const pair = await f.send({type: 'pair'}), s = pair.session;
    f.state.visible = false; assert.equal((await f.send({type: 'set-element-lock', session: s, target: 'notes', locked: true})).state, 'unavailable'); assert.equal(f.state.prompts.length, 0);
    f.state.visible = true; const asked = f.send({type: 'set-element-lock', session: s, target: 'notes', locked: true}); await flush(); await flush(); assert.equal(f.state.prompts.length, 1);
    assert.equal((await f.send({type: 'set-school-mode', session: s, enabled: true})).state, 'busy', 'school mode shares the prompt');
    assert.equal((await f.send({type: 'set-element-lock', session: s, target: 'docs', locked: true})).state, 'busy');
    f.state.unlocked = false; f.broker.revoke();
    assert.equal((await asked).type, 'error'); assert.deepEqual(f.state.applied, []); assert.equal(f.state.prompts[0].context.signal.aborted, true);
    f.state.unlocked = true; assert.equal((await f.send({type: 'read-element-locks', session: s})).type, 'error', 'the lock revoked the pairing');
  } finally { await f.broker.close(); }
});

test('closing the broker withdraws a pending lock prompt', async () => {
  const f = framedBroker(); await f.start();
  const pair = await f.send({type: 'pair'}); const asked = f.send({type: 'set-element-lock', session: pair.session, target: 'notes', locked: true}); await flush(); await flush();
  const signal = f.state.prompts[0].context.signal; await f.broker.close(); assert.equal(signal.aborted, true); void asked;
});

// The desktop side, against a real protected record store and a real local profile verifier.
async function services() {
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-locks-'));
  const safeStorage = {isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: value => value.toString()};
  const features = createFeatureServices({dataDirectory, applicationRoot: dataDirectory, safeStorage, dialog: {}, getWindow: () => null, getMainFrame: () => null, openPath: async () => {}, emit: () => {}});
  return {dataDirectory, features, credentials: features.credentials, async cleanup() { await features.close(); await fs.rm(dataDirectory, {recursive: true, force: true}); }};
}

test('a lock is written and removed as the desktop element-lock record, openable with the profile credential', async t => {
  let s;
  try { s = await services(); } catch (error) { t.skip('feature services could not start in this host: ' + error.message); return; }
  t.after(() => s.cleanup());
  const profile = await passwordVerifier('synthetic profile credential', 100000);
  await s.credentials.set('local-profile:v1', profile);
  assert.deepEqual(await readExtensionElementLocks(s.credentials), []);
  assert.deepEqual(await setExtensionElementLock(s.credentials, {target: 'notes', locked: true}), {state: 'changed', locked: true});
  const record = await s.credentials.get('element-lock:extension:notes');
  assert.equal(record.id, 'extension:notes'); assert.equal(record.policy, 'password'); assert.equal(record.version, 1);
  assert.deepEqual(Object.keys(record.factors), ['password']);
  assert.equal(await verifyPassword('synthetic profile credential', record.factors.password), true, 'the desktop can open it with the profile credential');
  assert.equal(await verifyPassword('another credential', record.factors.password), false);
  assert.deepEqual(await readExtensionElementLocks(s.credentials), ['notes']);
  assert.deepEqual(await setExtensionElementLock(s.credentials, {target: 'notes', locked: true}), {state: 'unchanged', locked: true});
  assert.deepEqual(await setExtensionElementLock(s.credentials, {target: 'notes', locked: false}), {state: 'changed', locked: false});
  assert.equal(await s.credentials.get('element-lock:extension:notes'), null);
  assert.deepEqual(await setExtensionElementLock(s.credentials, {target: 'notes', locked: false}), {state: 'unchanged', locked: false});
  const adapters = s.features.browserElementLockAdapters;
  assert.deepEqual(Object.keys(adapters).sort(), ['applyElementLock', 'authenticateElementLock', 'readElementLocks']);
  assert.deepEqual(await adapters.applyElementLock({target: 'docs', locked: true}), {state: 'changed', locked: true});
  assert.deepEqual(await adapters.readElementLocks(), ['docs']);
  assert.equal(await adapters.authenticateElementLock({origin, signal: new AbortController().signal}), 'unavailable', 'no native prompt installed means no authentication');
});

test('only the reviewed targets are touched and other element locks are never read or removed', async t => {
  let s;
  try { s = await services(); } catch (error) { t.skip('feature services could not start in this host: ' + error.message); return; }
  t.after(() => s.cleanup());
  await s.credentials.set('local-profile:v1', await passwordVerifier('synthetic profile credential', 100000));
  for (const bad of ['popup', 'extension:notes', '', '../x', 'profile', 'element:profile', undefined]) await assert.rejects(setExtensionElementLock(s.credentials, {target: bad, locked: true}), /Invalid/, String(bad));
  await assert.rejects(setExtensionElementLock(s.credentials, {target: 'notes', locked: 'yes'}), /Invalid/);
  const desktopRecord = {version: 1, id: 'dialog-lock', policy: 'password', factors: {password: await passwordVerifier('desktop credential', 100000)}, sessionMode: 'timed', duration: 0, revision: 'r1'};
  await s.credentials.set('element-lock:dialog-lock', desktopRecord);
  assert.deepEqual(await readExtensionElementLocks(s.credentials), []);
  await setExtensionElementLock(s.credentials, {target: 'status', locked: true});
  assert.deepEqual(await s.credentials.get('element-lock:dialog-lock'), desktopRecord, 'the desktop record is untouched');
});

test('locking without a usable local profile is rejected and writes nothing', async t => {
  let s;
  try { s = await services(); } catch (error) { t.skip('feature services could not start in this host: ' + error.message); return; }
  t.after(() => s.cleanup());
  assert.deepEqual(await setExtensionElementLock(s.credentials, {target: 'notes', locked: true}), {state: 'rejected', locked: false});
  await s.credentials.set('local-profile:v1', {version: 2, purpose: 'password-verifier', iterations: 5, salt: 'x', hash: 'y'});
  assert.deepEqual(await setExtensionElementLock(s.credentials, {target: 'notes', locked: true}), {state: 'rejected', locked: false});
  assert.deepEqual(await readExtensionElementLocks(s.credentials), []);
});

test('only a lock that still opens with the profile credential can be removed from the browser', async t => {
  let s;
  try { s = await services(); } catch (error) { t.skip('feature services could not start in this host: ' + error.message); return; }
  t.after(() => s.cleanup());
  const profile = await passwordVerifier('synthetic profile credential', 100000);
  await s.credentials.set('local-profile:v1', profile);
  const key = 'element-lock:extension:notes';
  const stronger = {version: 1, id: 'extension:notes', policy: 'pin-password', factors: {pin: await passwordVerifier('1234', 100000), password: profile}, sessionMode: 'timed', duration: 0, revision: 'r1'};
  await s.credentials.set(key, stronger);
  assert.deepEqual(await setExtensionElementLock(s.credentials, {target: 'notes', locked: false}), {state: 'rejected', locked: true}, 'a stronger policy is left for the desktop');
  assert.deepEqual(await s.credentials.get(key), stronger);
  const other = {...stronger, policy: 'password', factors: {password: await passwordVerifier('desktop only credential', 100000)}};
  await s.credentials.set(key, other);
  assert.deepEqual(await setExtensionElementLock(s.credentials, {target: 'notes', locked: false}), {state: 'rejected', locked: true}, 'a lock with another password is left for the desktop');
  assert.deepEqual(await s.credentials.get(key), other);
  assert.deepEqual(await setExtensionElementLock(s.credentials, {target: 'notes', locked: true}), {state: 'unchanged', locked: true}, 'an existing lock is never replaced');
  await s.credentials.delete(key);
  await setExtensionElementLock(s.credentials, {target: 'notes', locked: true});
  await s.credentials.set('local-profile:v1', await passwordVerifier('changed profile credential', 100000));
  assert.deepEqual(await setExtensionElementLock(s.credentials, {target: 'notes', locked: false}), {state: 'rejected', locked: true}, 'a changed profile no longer matches, so the desktop must remove it');
});

test('a concurrent change to the record is rejected instead of overwritten', async () => {
  const profile = await passwordVerifier('synthetic profile credential', 100000);
  const store = new Map([['local-profile:v1', profile]]);
  const credentials = {
    async get(key) { return store.has(key) ? structuredClone(store.get(key)) : null; },
    async readVersioned(key) { return {value: store.has(key) ? structuredClone(store.get(key)) : null, revision: null}; },
    async compareAndSetVersioned() { return {updated: false, revision: 'moved'}; },
  };
  assert.deepEqual(await setExtensionElementLock(credentials, {target: 'notes', locked: true}), {state: 'rejected', locked: false});
  store.set('element-lock:extension:notes', {version: 1, id: 'extension:notes', policy: 'password', factors: {password: profile}, sessionMode: 'timed', duration: 0, revision: 'r'});
  assert.deepEqual(await setExtensionElementLock(credentials, {target: 'notes', locked: false}), {state: 'rejected', locked: true});
});

test('the browser-facing module adds no storage, network or secret handling', async () => {
  const source = await fs.readFile(new URL('../src/main/browser-element-lock-mediation.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''), /localStorage|writeFile|randomBytes|fetch\(|process\.env|child_process|credential|password/i);
  const background = await fs.readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8');
  const code = background.slice(background.indexOf("'element-locks-read'"), background.indexOf("'protected-discover'"));
  assert.ok(code.length > 500);
  assert.doesNotMatch(code, /localStorage|chrome\.storage|password|credential/i);
});

test('extension background relays both scopes, validates answers and rejects extra fields', async () => {
  let listener, receive, nativeResponses = []; const sent = [];
  const chrome = {runtime: {id: 'fixture', getURL: p => 'chrome-extension://fixture/' + p, onInstalled: {addListener() {}}, onMessage: {addListener(fn) { listener = fn; }}, connectNative: () => ({onDisconnect: {addListener() {}}, onMessage: {addListener(fn) { receive = fn; }}, disconnect() {}, postMessage(message) { sent.push(message); queueMicrotask(() => receive(message.type === 'pair' ? {type: 'paired', session: 's'.repeat(43)} : nativeResponses.shift())); }})}, contextMenus: {onClicked: {addListener() {}}}};
  const context = vm.createContext({chrome, URL, setTimeout, clearTimeout, queueMicrotask});
  vm.runInContext(await fs.readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8'), context);
  context.deliver = message => new Promise(resolve => listener(message, {id: 'fixture', url: chrome.runtime.getURL('options.html'), frameId: 0}, resolve));
  const relay = async message => JSON.parse(JSON.stringify(await vm.runInContext('deliver(' + JSON.stringify(message) + ')', context)));
  assert.deepEqual(await relay({type: 'element-locks-read'}), {paired: false}); assert.deepEqual(await relay({type: 'element-lock-set', target: 'notes', locked: true}), {paired: false}); assert.equal(sent.length, 0);
  await relay({type: 'pair'}); const before = sent.length;
  nativeResponses = [{type: 'element-locks', schemaVersion: 1, locked: ['notes', 'status']}];
  assert.deepEqual(await relay({type: 'element-locks-read'}), {schemaVersion: 1, locked: ['notes', 'status']});
  assert.deepEqual(JSON.parse(JSON.stringify(sent[before])), {type: 'read-element-locks', session: 's'.repeat(43)});
  for (const state of ['changed', 'unchanged', 'rejected', 'busy', 'unavailable']) { nativeResponses = [{type: 'element-lock-set', schemaVersion: 1, state, target: 'docs', locked: state === 'busy' ? null : false}]; const answer = await relay({type: 'element-lock-set', target: 'docs', locked: false}); assert.deepEqual(answer, {schemaVersion: 1, state, target: 'docs', locked: state === 'busy' ? null : false}); }
  assert.deepEqual(Object.keys(sent.at(-1)).sort(), ['locked', 'session', 'target', 'type']); assert.equal(sent.at(-1).target, 'docs'); assert.equal(sent.at(-1).locked, false);
  for (const bad of [{type: 'element-lock-set', schemaVersion: 1, state: 'changed', target: 'docs', locked: true, token: 'x'}, {type: 'element-lock-set', schemaVersion: 1, state: 'maybe', target: 'docs', locked: true}, {type: 'element-lock-set', schemaVersion: 2, state: 'changed', target: 'docs', locked: true}, {type: 'other', schemaVersion: 1, state: 'changed', target: 'docs', locked: true}, {type: 'element-lock-set', schemaVersion: 1, state: 'changed', target: 'notes', locked: true}, {type: 'element-lock-set', schemaVersion: 1, state: 'changed', target: 'docs'}, {type: 'element-lock-set', schemaVersion: 1, state: 'changed', target: 'docs', locked: 'yes'}]) { nativeResponses = [bad]; assert.ok((await relay({type: 'element-lock-set', target: 'docs', locked: true})).error); }
  for (const bad of [{type: 'element-locks', schemaVersion: 1, locked: ['popup']}, {type: 'element-locks', schemaVersion: 1, locked: ['notes', 'notes']}, {type: 'element-locks', schemaVersion: 1, locked: 'notes'}, {type: 'element-locks', schemaVersion: 1, locked: [], path: 'C:'}, {type: 'element-locks', schemaVersion: 2, locked: []}, {type: 'element-locks', schemaVersion: 1, locked: new Array(10).fill('notes')}]) { nativeResponses = [bad]; assert.ok((await relay({type: 'element-locks-read'})).error); }
  const count = sent.length;
  for (const bad of [{type: 'element-lock-set', target: 'notes', locked: 'true'}, {type: 'element-lock-set', target: 'popup', locked: true}, {type: 'element-lock-set', target: 'extension:notes', locked: true}, {type: 'element-lock-set', target: 'notes'}, {type: 'element-lock-set', locked: true}, {type: 'element-lock-set', target: 'notes', locked: true, session: 'x'}, {type: 'element-locks-read', session: 'x'}]) assert.ok((await relay(bad)).error, JSON.stringify(bad));
  assert.equal(sent.length, count);
});
