import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createBrowserSchoolMediation, cleanModeName} from '../src/main/browser-school-mediation.js';
import {createBrowserConfirmMediation} from '../src/main/browser-confirm-mediation.js';
import {createBrowserNativeBroker, nativeFrame} from '../src/main/browser-native-host.js';
import {createFeatureServices} from '../src/main/feature-services.js';

const origin = 'chrome-extension://' + 'a'.repeat(32) + '/', session = 's'.repeat(43), connectionId = '11111111-1111-1111-1111-111111111111';
const config = {schemaVersion: 1, host: 'org.dingding.material_file_encryptor.downloads', allowedOrigins: [origin], identity: {extensionId: 'a'.repeat(32), packageSha256: '0'.repeat(64), publicKeySha256: '1'.repeat(64)}};
const flush = () => new Promise(resolve => setImmediate(resolve));
const read = {type: 'read-school-mode', session};
const set = (enabled = true) => ({type: 'set-school-mode', session, enabled});

function mediation(options = {}) {
  let unlocked = true, visible = true, pair = {session, expires: 901000}, mode = {enabled: false, name: 'School mode'};
  const prompts = [], applied = [];
  const service = createBrowserSchoolMediation({
    getPair: () => pair, isUnlocked: () => unlocked, canPrompt: () => visible, now: () => 1000,
    readSchoolMode: async () => ({...mode}),
    authenticate: options.authenticate ?? (context => new Promise(resolve => { prompts.push({context, resolve}); context.signal.addEventListener('abort', () => resolve(false), {once: true}); })),
    applySchoolMode: options.apply ?? (async ({enabled}) => { applied.push(enabled); if (mode.enabled === enabled) return {state: 'unchanged', enabled}; mode = {...mode, enabled}; return {state: 'changed', enabled}; }),
    ...options.overrides,
  });
  const check = () => { if (!unlocked) throw Error('Unlock the desktop before receiving downloads.'); };
  return {service, prompts, applied, send: (message = set()) => service.receive(origin, message, check), lock: () => { unlocked = false; service.revoke(); }, hide: () => { visible = false; }, disconnect: () => { pair = null; service.revoke(); }, setMode: value => { mode = {...mode, ...value}; }, get mode() { return mode; }};
}

test('read-school-mode needs a pairing and answers with the sanitised name and state only', async () => {
  const m = mediation();
  m.setMode({enabled: true, name: '  Study\u0007 \u202Etime\u2028 now  '});
  const answer = await m.send(read);
  assert.deepEqual(answer, {type: 'school-mode', schemaVersion: 1, enabled: true, name: 'Study time now'});
  assert.deepEqual(Object.keys(answer).sort(), ['enabled', 'name', 'schemaVersion', 'type']);
  assert.equal(m.prompts.length, 0, 'Status mode never prompts');
  assert.equal(cleanModeName('x'.repeat(200)).length, 80);
  assert.equal(cleanModeName('\u0000\u0007'), 'School mode');
  assert.equal(cleanModeName(42), 'School mode');
  m.disconnect();
  await assert.rejects(m.send(read), /Pair the browser again/);
});

test('an unreadable desktop record fails the read instead of guessing', async () => {
  const pair = {session, expires: 901000};
  const bad = createBrowserSchoolMediation({getPair: () => pair, isUnlocked: () => true, now: () => 1000, readSchoolMode: async () => ({enabled: 'yes', name: 'x'})});
  await assert.rejects(bad.receive(origin, read, () => {}), /unavailable/);
  const missing = createBrowserSchoolMediation({getPair: () => pair, isUnlocked: () => true, now: () => 1000});
  await assert.rejects(missing.receive(origin, read, () => {}), /unavailable/);
});

test('a change needs a native re-authentication and only then reaches the desktop setting', async () => {
  const m = mediation();
  const pending = m.send(set(true)); await flush();
  assert.equal(m.prompts.length, 1);
  assert.equal(m.prompts[0].context.origin, origin);
  assert.deepEqual(m.applied, [], 'nothing changes before the person authenticates');
  assert.equal(m.mode.enabled, false);
  m.prompts[0].resolve(true);
  const answer = await pending;
  assert.deepEqual(answer, {type: 'school-mode-set', schemaVersion: 1, state: 'changed', enabled: true});
  assert.deepEqual(m.applied, [true]);
  assert.deepEqual(Object.keys(answer).sort(), ['enabled', 'schemaVersion', 'state', 'type']);
  const text = JSON.stringify(answer).toLowerCase();
  for (const forbidden of ['password', 'credential', 'profile', 'path', 'session', 'grant']) assert.ok(!text.includes(forbidden), forbidden);
  const same = m.send(set(true)); await flush(); m.prompts[1].resolve(true);
  assert.equal((await same).state, 'unchanged', 'asking for the current state changes nothing');
});

test('an impostor without the native authentication callback cannot change the setting', async () => {
  const none = mediation({overrides: {authenticate: undefined}, authenticate: null});
  assert.deepEqual(await none.send(set(true)), {type: 'school-mode-set', schemaVersion: 1, state: 'unavailable', enabled: null});
  assert.deepEqual(none.applied, []);
  const noApply = mediation({overrides: {applySchoolMode: undefined}});
  assert.equal((await noApply.send(set(true))).state, 'unavailable');
  assert.equal(noApply.prompts.length, 0);
  // Only an explicit true from the desktop counts: a truthy string, an object or undefined are not authentication.
  for (const verdict of ['yes', 1, {ok: true}, undefined, null, 'unavailable']) {
    const m = mediation({authenticate: async () => verdict});
    const answer = await m.send(set(true));
    assert.notEqual(answer.state, 'changed', String(verdict));
    assert.deepEqual(m.applied, [], String(verdict));
  }
  assert.equal((await mediation({authenticate: async () => 'unavailable'}).send(set(true))).state, 'unavailable');
});

test('a failed or rejected authentication answers rejected and the pairing stays usable', async () => {
  const m = mediation();
  const first = m.send(set(true)); await flush(); m.prompts[0].resolve(false);
  assert.deepEqual(await first, {type: 'school-mode-set', schemaVersion: 1, state: 'rejected', enabled: false});
  assert.deepEqual(m.applied, []);
  const throwing = mediation({authenticate: async () => { throw Error('C:\\private\\path'); }});
  const answer = await throwing.send(set(true));
  assert.equal(answer.state, 'rejected'); assert.ok(!JSON.stringify(answer).includes('private'));
  const second = m.send(set(true)); await flush(); assert.equal(m.prompts.length, 2, 'the same pairing can ask again');
  m.prompts[1].resolve(true); assert.equal((await second).state, 'changed');
});

test('only one prompt is pending: a second request is answered busy and never queued', async () => {
  const m = mediation();
  const first = m.send(set(true)); await flush();
  const second = await m.send(set(false));
  assert.deepEqual(second, {type: 'school-mode-set', schemaVersion: 1, state: 'busy', enabled: false});
  assert.equal(m.prompts.length, 1); assert.equal(m.service.pending, 1);
  m.prompts[0].resolve(true); assert.equal((await first).state, 'changed'); assert.equal(m.service.pending, 0);
});

test('the pending prompt is shared with Confirm mode in both directions', async () => {
  const gate = {held: false};
  const prompts = [], pair = {session, expires: 901000};
  const confirm = createBrowserConfirmMediation({getPair: () => pair, isUnlocked: () => true, now: () => 1000, gate,
    confirm: context => new Promise(resolve => { prompts.push(resolve); context.signal.addEventListener('abort', () => resolve(false), {once: true}); }), focusAuthenticator: async () => {}});
  const resolvers = [];
  const school = createBrowserSchoolMediation({getPair: () => pair, isUnlocked: () => true, now: () => 1000, gate,
    readSchoolMode: async () => ({enabled: false, name: 'x'}), authenticate: () => new Promise(resolve => resolvers.push(resolve)), applySchoolMode: async ({enabled}) => ({state: 'changed', enabled})});
  const focus = confirm.receive(origin, {type: 'focus-authenticator', session}, () => {}); await flush();
  assert.equal((await school.receive(origin, set(true), () => {})).state, 'busy');
  prompts[0](true); assert.equal((await focus).state, 'shown');
  const change = school.receive(origin, set(true), () => {}); await flush();
  assert.equal((await confirm.receive(origin, {type: 'focus-authenticator', session}, () => {})).state, 'busy');
  resolvers[0](true); assert.equal((await change).state, 'changed');
  assert.equal(gate.held, false, 'the gate is released after each prompt');
});

test('a locked desktop, a hidden window, a missing callback or a closed service refuse at once without a prompt', async () => {
  const locked = mediation(); locked.lock(); await assert.rejects(locked.send(), /Unlock the desktop/); assert.equal(locked.prompts.length, 0);
  const flag = mediation({overrides: {isUnlocked: () => false}}); assert.equal((await flag.send()).state, 'unavailable'); assert.equal(flag.prompts.length, 0);
  const hidden = mediation(); hidden.hide(); assert.equal((await hidden.send()).state, 'unavailable'); assert.equal(hidden.prompts.length, 0);
  const closing = mediation(); closing.service.close(); await assert.rejects(closing.send(), /Pair the browser again/);
  const throwing = mediation({overrides: {canPrompt: () => { throw Error('window gone'); }}}); assert.equal((await throwing.send()).state, 'unavailable');
  const later = mediation(); later.hide(); await later.send(); assert.equal(later.service.pending, 0);
});

test('lock and disconnect withdraw the pending prompt and the request fails closed without changing anything', async () => {
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
  const first = await m.send(set(true));
  assert.deepEqual(first, {type: 'school-mode-set', schemaVersion: 1, state: 'rejected', enabled: false});
  assert.equal(m.prompts[0].context.signal.aborted, true, 'the native prompt is withdrawn, not left open');
  assert.deepEqual(m.applied, []); assert.equal(m.service.pending, 0);
  const second = m.send(set(true)); await flush(); assert.equal(m.prompts.length, 2);
  m.prompts[1].resolve(true); assert.equal((await second).state, 'changed');
  const { PROMPT_TIMEOUT_MS } = await import('../src/main/browser-school-mediation.js');
  assert.ok(PROMPT_TIMEOUT_MS < 35000, 'the host drops a request after 35 seconds');
});

test('a late approval after the lock or a failing desktop write never reports changed', async () => {
  const m = mediation(); const pending = m.send(set(true)); await flush();
  m.lock(); m.prompts[0].resolve(true);
  await assert.rejects(pending); assert.deepEqual(m.applied, []);
  const failing = mediation({authenticate: async () => true, apply: async () => { throw Error('C:\\private\\path'); }});
  const answer = await failing.send(set(true)); assert.equal(answer.state, 'unavailable'); assert.ok(!JSON.stringify(answer).includes('private'));
  for (const result of [null, 'changed', {state: 'changed'}, {state: 'maybe', enabled: true}, {state: 'changed', enabled: 'yes'}]) {
    const m2 = mediation({authenticate: async () => true, apply: async () => result});
    assert.equal((await m2.send(set(true))).state, 'unavailable', JSON.stringify(result));
  }
  const rejectedByDesktop = mediation({authenticate: async () => true, apply: async () => ({state: 'rejected', enabled: true})});
  assert.deepEqual(await rejectedByDesktop.send(set(false)), {type: 'school-mode-set', schemaVersion: 1, state: 'rejected', enabled: true});
});

test('malformed, unpaired or mismatched requests are refused before any prompt', async () => {
  const m = mediation();
  for (const message of [{type: 'set-school-mode', session}, {type: 'set-school-mode', session, enabled: 'true'}, {type: 'set-school-mode', session, enabled: 1}, {type: 'set-school-mode', session, enabled: true, extra: 1}, {type: 'read-school-mode', session, extra: 1}, {type: 'read-school-mode'}, {type: 'set-school-mode', session: 'x'.repeat(43), enabled: true}, {type: 'set-school-mode', session: 'short', enabled: true}, {type: 'set-school-mode', session, enabled: true, [Symbol('x')]: 1}, Object.assign(Object.create({inherited: 1}), set(true)), null, 'text']) {
    await assert.rejects(m.send(message), /Unsupported|Pair the browser again/);
  }
  await assert.rejects(m.service.receive(origin, set(true)), /Unsupported/);
  assert.equal(m.prompts.length, 0); assert.deepEqual(m.applied, []);
  assert.throws(() => createBrowserSchoolMediation({}), /Invalid/);
});

function framedBroker(options = {}) {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => queueMicrotask(() => { child.emit('exit', 0); child.emit('close', 0); });
  const state = {unlocked: true, visible: true, prompts: [], applied: [], mode: {enabled: false, name: 'School mode'}};
  const broker = createBrowserNativeBroker({config, now: () => 0, hostPath: 'C:\\Fixture\\MaterialFileEncryptor.BrowserHost.exe', authorizePair: async () => true, isUnlocked: () => state.unlocked, onProposal() {}, spawnHost: () => child,
    ...(options.withCallbacks === false ? {} : {
      hasVisibleWindow: () => state.visible,
      readSchoolMode: async () => ({...state.mode}),
      authenticateSchoolMode: context => new Promise(resolve => { state.prompts.push({context, resolve}); context.signal.addEventListener('abort', () => resolve(false), {once: true}); }),
      applySchoolMode: async ({enabled}) => { state.applied.push(enabled); state.mode = {...state.mode, enabled}; return {state: 'changed', enabled}; },
      confirmAction: async () => false, focusAuthenticator: async () => {},
    }), ...options.overrides});
  let counter = 0;
  const send = (message, id = connectionId) => new Promise(resolve => { const requestId = '22222222-2222-2222-2222-' + String(++counter).padStart(12, '0'); const onData = bytes => { const body = JSON.parse(bytes.subarray(4)); if (body.requestId === requestId) { child.stdin.off('data', onData); resolve(body.response); } }; child.stdin.on('data', onData); child.stdout.write(nativeFrame({requestId, connectionId: id, origin, message})); });
  return {broker, child, state, send, async start() { const started = broker.start(); child.stdout.write(nativeFrame({type: 'ready', aclVerified: true})); await started; }};
}

test('native framed scopes need the paired live connection, and the change waits for the desktop check', async () => {
  const f = framedBroker(); await f.start();
  try {
    assert.deepEqual(await f.send({type: 'read-school-mode', session}), {type: 'error', code: 'HANDOFF_NOT_ACCEPTED'}, 'unpaired callers are refused');
    assert.deepEqual(await f.send({type: 'set-school-mode', session, enabled: true}), {type: 'error', code: 'HANDOFF_NOT_ACCEPTED'}); assert.equal(f.state.prompts.length, 0);
    const pair = await f.send({type: 'pair'}); assert.equal(pair.type, 'paired');
    assert.deepEqual(await f.send({type: 'read-school-mode', session: pair.session}), {type: 'school-mode', schemaVersion: 1, enabled: false, name: 'School mode'});
    const asked = f.send({type: 'set-school-mode', session: pair.session, enabled: true}); await flush(); await flush();
    assert.equal(f.state.prompts.length, 1); assert.deepEqual(f.state.applied, [], 'nothing changes before the person answers');
    f.state.prompts[0].resolve(true);
    assert.deepEqual(await asked, {type: 'school-mode-set', schemaVersion: 1, state: 'changed', enabled: true});
    assert.deepEqual(f.state.applied, [true]);
    assert.equal((await f.send({type: 'read-school-mode', session: pair.session})).enabled, true);
    const rejected = f.send({type: 'set-school-mode', session: pair.session, enabled: false}); await flush(); await flush(); f.state.prompts[1].resolve(false);
    assert.equal((await rejected).state, 'rejected');
    assert.equal((await f.send({type: 'read-lock-state', session: pair.session})).state, 'unlocked', 'a rejection leaves the pairing in place');
    assert.equal((await f.send({type: 'set-school-mode', session: pair.session, enabled: true, extra: true})).type, 'error');
    await assert.rejects(f.broker.receive(origin, {type: 'set-school-mode', session: pair.session, enabled: true}), /connection identity/);
  } finally { await f.broker.close(); }
});

test('through the broker an impostor without the native callback cannot change the setting', async () => {
  const f = framedBroker({withCallbacks: false}); await f.start();
  try {
    const pair = await f.send({type: 'pair'});
    assert.deepEqual(await f.send({type: 'set-school-mode', session: pair.session, enabled: true}), {type: 'school-mode-set', schemaVersion: 1, state: 'unavailable', enabled: null});
    assert.equal((await f.send({type: 'read-school-mode', session: pair.session})).type, 'error', 'with no desktop adapter there is nothing to read');
    assert.deepEqual(f.state.applied, []);
  } finally { await f.broker.close(); }
});

test('a hidden window refuses at once and locking withdraws the pending prompt', async () => {
  const f = framedBroker(); await f.start();
  try {
    const pair = await f.send({type: 'pair'});
    f.state.visible = false; assert.equal((await f.send({type: 'set-school-mode', session: pair.session, enabled: true})).state, 'unavailable'); assert.equal(f.state.prompts.length, 0);
    f.state.visible = true; const asked = f.send({type: 'set-school-mode', session: pair.session, enabled: true}); await flush(); await flush(); assert.equal(f.state.prompts.length, 1);
    assert.equal((await f.send({type: 'set-school-mode', session: pair.session, enabled: false})).state, 'busy');
    f.state.unlocked = false; f.broker.revoke();
    assert.equal((await asked).type, 'error'); assert.deepEqual(f.state.applied, []); assert.equal(f.state.prompts[0].context.signal.aborted, true);
    f.state.unlocked = true; assert.equal((await f.send({type: 'read-school-mode', session: pair.session})).type, 'error', 'the lock revoked the pairing');
  } finally { await f.broker.close(); }
});

test('closing the broker withdraws a pending prompt', async () => {
  const f = framedBroker(); await f.start();
  const pair = await f.send({type: 'pair'}); const asked = f.send({type: 'set-school-mode', session: pair.session, enabled: true}); await flush(); await flush();
  const signal = f.state.prompts[0].context.signal; await f.broker.close(); assert.equal(signal.aborted, true); void asked;
});

// The desktop adapters, exercised against a real data folder and a stand-in for the native vault check.
async function services(options = {}) {
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-school-'));
  const events = [];
  const safeStorage = {isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: value => value.toString()};
  const features = createFeatureServices({
    dataDirectory, applicationRoot: dataDirectory, safeStorage, dialog: {}, getWindow: () => null, getMainFrame: () => null, openPath: async () => {},
    emit: (feature, event) => events.push([feature, event]), ...options.overrides,
  });
  return {dataDirectory, events, features, adapters: features.browserSchoolAdapters, async cleanup() { await features.close(); await fs.rm(dataDirectory, {recursive: true, force: true}); }};
}

test('the desktop adapter persists through the shared record writer and announces the change like the desktop screen', async t => {
  let s;
  try { s = await services(); } catch (error) { t.skip('feature services could not start in this host: ' + error.message); return; }
  t.after(() => s.cleanup());
  assert.deepEqual(await s.adapters.readSchoolMode(), {enabled: false, name: 'School mode'}, 'a missing record means the default, off');
  assert.deepEqual(await s.adapters.applySchoolMode({enabled: false}), {state: 'unchanged', enabled: false});
  assert.deepEqual(await s.adapters.applySchoolMode({enabled: true}), {state: 'changed', enabled: true});
  const stored = JSON.parse(await fs.readFile(path.join(s.dataDirectory, 'shared-settings.json'), 'utf8'));
  assert.deepEqual(stored, {enabled: true, name: 'School mode'});
  assert.deepEqual(s.events.at(-1), ['personalization', {type: 'sharedSettings', value: {enabled: true, name: 'School mode'}}], 'the open desktop window is told, as for a change made on the desktop');
  await fs.writeFile(path.join(s.dataDirectory, 'shared-settings.json'), JSON.stringify({enabled: true, name: 'Study time'}));
  assert.deepEqual(await s.adapters.readSchoolMode(), {enabled: true, name: 'Study time'});
  // Turning an active mode off with no local credential recorded is allowed after the vault check; the name is kept.
  assert.deepEqual(await s.adapters.applySchoolMode({enabled: false}), {state: 'changed', enabled: false});
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(s.dataDirectory, 'shared-settings.json'), 'utf8')), {enabled: false, name: 'Study time'});
  await assert.rejects(s.adapters.applySchoolMode({enabled: 'yes'}), /Invalid/);
  await fs.writeFile(path.join(s.dataDirectory, 'shared-settings.json'), '{broken');
  await assert.rejects(s.adapters.readSchoolMode());
  await fs.writeFile(path.join(s.dataDirectory, 'shared-settings.json'), JSON.stringify({enabled: 'yes'}));
  await assert.rejects(s.adapters.readSchoolMode(), /unavailable/);
});

test('a mode protected by its own local credential can be turned off only on the desktop', async t => {
  let s;
  try { s = await services(); } catch (error) { t.skip('feature services could not start in this host: ' + error.message); return; }
  t.after(() => s.cleanup());
  await s.features.request('personalization', 'setSharedCredential', {password: 'synthetic credential'});
  assert.deepEqual(await s.adapters.applySchoolMode({enabled: true}), {state: 'changed', enabled: true}, 'turning the mode on is allowed after the desktop check');
  const before = await fs.readFile(path.join(s.dataDirectory, 'shared-settings.json'), 'utf8');
  assert.deepEqual(await s.adapters.applySchoolMode({enabled: false}), {state: 'rejected', enabled: true});
  assert.equal(await fs.readFile(path.join(s.dataDirectory, 'shared-settings.json'), 'utf8'), before, 'the record is untouched');
  assert.equal(await s.features.request('personalization', 'verifySharedCredential', {password: 'synthetic credential'}), true);
  await s.features.request('personalization', 'sharedWrite', {value: {enabled: false, name: 'School mode'}});
  assert.equal((await s.adapters.readSchoolMode()).enabled, false, 'the desktop route still works');
});

test('the desktop adapter refuses without a native prompt and never reports a verdict it did not get', async t => {
  let s;
  try { s = await services(); } catch (error) { t.skip('feature services could not start in this host: ' + error.message); return; }
  t.after(() => s.cleanup());
  assert.equal(await s.adapters.authenticateSchoolMode({origin, signal: new AbortController().signal}), 'unavailable', 'no native prompt installed means no authentication');
  assert.equal(await s.adapters.authenticateSchoolMode({origin: 'https://example.org/', signal: new AbortController().signal}), 'unavailable');
});

test('the new modules add no storage, network or secret handling to the browser-facing layer', async () => {
  const mediationSource = await fs.readFile(new URL('../src/main/browser-school-mediation.js', import.meta.url), 'utf8');
  assert.doesNotMatch(mediationSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''), /localStorage|writeFile|randomBytes|fetch\(|process\.env|child_process|credential|password/i);
  const background = await fs.readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8');
  const code = background.slice(background.indexOf("'school-mode-read'"), background.indexOf("'protected-discover'"));
  assert.doesNotMatch(code, /localStorage|chrome\.storage|password|credential/i);
});

test('extension background relays both scopes, validates answers and rejects extra fields', async () => {
  let listener, receive, nativeResponses = []; const sent = [];
  const chrome = {runtime: {id: 'fixture', getURL: p => 'chrome-extension://fixture/' + p, onInstalled: {addListener() {}}, onMessage: {addListener(fn) { listener = fn; }}, connectNative: () => ({onDisconnect: {addListener() {}}, onMessage: {addListener(fn) { receive = fn; }}, disconnect() {}, postMessage(message) { sent.push(message); queueMicrotask(() => receive(message.type === 'pair' ? {type: 'paired', session: 's'.repeat(43)} : nativeResponses.shift())); }})}, contextMenus: {onClicked: {addListener() {}}}};
  const context = vm.createContext({chrome, URL, setTimeout, clearTimeout, queueMicrotask});
  vm.runInContext(await fs.readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8'), context);
  context.deliver = message => new Promise(resolve => listener(message, {id: 'fixture', url: chrome.runtime.getURL('options.html'), frameId: 0}, resolve));
  const relay = async message => JSON.parse(JSON.stringify(await vm.runInContext('deliver(' + JSON.stringify(message) + ')', context)));
  assert.deepEqual(await relay({type: 'school-mode-read'}), {paired: false}); assert.deepEqual(await relay({type: 'school-mode-set', enabled: true}), {paired: false}); assert.equal(sent.length, 0);
  await relay({type: 'pair'}); const before = sent.length;
  nativeResponses = [{type: 'school-mode', schemaVersion: 1, enabled: true, name: 'Study time'}];
  assert.deepEqual(await relay({type: 'school-mode-read'}), {schemaVersion: 1, enabled: true, name: 'Study time'});
  assert.deepEqual(JSON.parse(JSON.stringify(sent[before])), {type: 'read-school-mode', session: 's'.repeat(43)});
  for (const state of ['changed', 'unchanged', 'rejected', 'busy', 'unavailable']) { nativeResponses = [{type: 'school-mode-set', schemaVersion: 1, state, enabled: state === 'busy' ? null : false}]; const answer = await relay({type: 'school-mode-set', enabled: false}); assert.deepEqual(answer, {schemaVersion: 1, state, enabled: state === 'busy' ? null : false}); }
  assert.deepEqual(Object.keys(sent.at(-1)).sort(), ['enabled', 'session', 'type']); assert.equal(sent.at(-1).enabled, false);
  for (const bad of [{type: 'school-mode-set', schemaVersion: 1, state: 'changed', enabled: true, token: 'x'}, {type: 'school-mode-set', schemaVersion: 1, state: 'maybe', enabled: true}, {type: 'school-mode-set', schemaVersion: 2, state: 'changed', enabled: true}, {type: 'other', schemaVersion: 1, state: 'changed', enabled: true}, {type: 'school-mode-set', schemaVersion: 1, state: 'changed'}, {type: 'school-mode-set', schemaVersion: 1, state: 'changed', enabled: 'yes'}]) { nativeResponses = [bad]; assert.ok((await relay({type: 'school-mode-set', enabled: true})).error); }
  for (const bad of [{type: 'school-mode', schemaVersion: 1, enabled: true, name: ''}, {type: 'school-mode', schemaVersion: 1, enabled: true, name: 'x'.repeat(81)}, {type: 'school-mode', schemaVersion: 1, enabled: 'yes', name: 'x'}, {type: 'school-mode', schemaVersion: 1, enabled: true, name: 'a\u0007b'}, {type: 'school-mode', schemaVersion: 1, enabled: true, name: 'x', path: 'C:'}]) { nativeResponses = [bad]; assert.ok((await relay({type: 'school-mode-read'})).error); }
  const count = sent.length;
  assert.ok((await relay({type: 'school-mode-set', enabled: 'true'})).error); assert.ok((await relay({type: 'school-mode-set'})).error); assert.ok((await relay({type: 'school-mode-set', enabled: true, session: 'x'})).error); assert.ok((await relay({type: 'school-mode-read', session: 'x'})).error);
  assert.equal(sent.length, count);
});
