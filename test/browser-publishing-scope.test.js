import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import * as extension from '../browser-extension/publishing.js';
import * as desktop from '../src/shared/publication-request.js';
import {createBrowserPublishMediation} from '../src/main/browser-publish-mediation.js';
import {createBrowserConfirmPrompt, confirmationOptions} from '../src/main/browser-confirm-prompt.js';
import {createBrowserNativeBroker, nativeFrame} from '../src/main/browser-native-host.js';
import {defaults, applyPreferences} from '../browser-extension/preferences.js';

const {sanitizeNote, validateLink, parseLinks, buildRequest, validateRequest, mountPublishing, COPY} = extension;
const origin = 'chrome-extension://' + 'a'.repeat(32) + '/', session = 's'.repeat(43), connectionId = '11111111-1111-1111-1111-111111111111';
const config = {schemaVersion: 1, host: 'org.dingding.material_file_encryptor.downloads', allowedOrigins: [origin], identity: {extensionId: 'a'.repeat(32), packageSha256: '0'.repeat(64), publicKeySha256: '1'.repeat(64)}};
const flush = () => new Promise(resolve => setImmediate(resolve));
const goodRequest = (over = {}) => ({destination: 'discussion-comment', note: 'Pairing now works.', links: ['https://example.org/evidence'], projectStatus: null, ...over});

// ---- Sanitizer ----------------------------------------------------------------------------------------------------
test('the sanitizer removes local paths, user names, email addresses and token-like strings', () => {
  const cases = [
    ['Saved to C:\\Users\\Alex\\Documents\\vault.bin today', /^Saved to \[local path\] today$/],
    ['See \\\\nas\\share\\folder\\file.txt', /^See \[local path\]$/],
    ['Opened file:///C:/Users/Alex/a.txt ok', /^Opened \[local path\] ok$/],
    ['Log in /home/alex/project/log.txt and /Users/alex/x', /^Log in \[local path\] and \[local path\]$/],
    ['In ~/notes/today.md', /^In \[local path\]$/],
    ['%APPDATA%\\App\\config', /^\[local path\]$/],
    ['username: alex and login=alex2', /^username: \[user removed\] and login=\[user removed\]$/],
    ['Mail alex@example.org please', /^Mail \[email removed\] please$/],
    ['token ghp_abcdefghijklmnopqrstuvwxyz0123456789', /^token \[secret removed\]$/],
    ['Authorization: Bearer abcDEF123456.-_xyz', /^Authorization: Bearer \[secret removed\]$/],
    ['password=hunter2 and api_key: "abc def"', /^password=\[secret removed\] and api_key: \[secret removed\]$/],
    ['key AKIAABCDEFGHIJKLMNOP end', /^key \[secret removed\] end$/],
    ['jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4 end', /^jwt \[secret removed\] end$/],
    ['blob ' + 'aB3'.repeat(14) + ' end', /^blob \[secret removed\] end$/],
    ['https://user:pw@example.org/x', /^\[secret removed\]@example\.org\/x$/],
  ];
  for (const [input, expected] of cases) assert.match(sanitizeNote(input).text, expected, input);
  assert.equal(sanitizeNote('Plain progress: tests pass, ~5 minutes, 100% done, see https://example.org/home/page').text, 'Plain progress: tests pass, ~5 minutes, 100% done, see https://example.org/home/page', 'ordinary prose and public addresses are untouched');
  const counted = sanitizeNote('C:\\x\\y alex@example.org password=1').redactions;
  assert.deepEqual([counted.paths, counted.emails, counted.secrets], [1, 1, 1]);
});

test('sanitizing is idempotent, strips control characters, collapses blank lines and shortens long notes', () => {
  for (const input of ['token=abc password: x C:\\Users\\A\\f user=bob a@b.co', 'Bearer abcdefghijkl then Authorization: Bearer zzzzzzzzzz', 'a\u0000b\u202ec\r\n\r\n\r\n\r\nd']) {
    const once = sanitizeNote(input).text;
    assert.equal(sanitizeNote(once).text, once, input);
  }
  assert.equal(sanitizeNote('a\u0000b\u202ec\r\n\r\n\r\n\r\nd').text, 'abc\n\nd');
  const long = sanitizeNote('word '.repeat(1000));
  assert.ok(long.text.length <= 2000 && long.redactions.truncated);
  assert.equal(sanitizeNote(42).text, '');
});

test('personal wording is turned back into the original word so it never reaches a publication', () => {
  const result = sanitizeNote('The gizmo broke; gizmo again.', {wording: [['bug', 'gizmo']]});
  assert.equal(result.text, 'The bug broke; bug again.');
  assert.equal(result.redactions.wording, 2);
  assert.equal(sanitizeNote('keep', {wording: [['a', ''], ['x', 'x'], [1, 2]]}).text, 'keep');
});

// ---- Links and requests --------------------------------------------------------------------------------------------
test('evidence links must be https with a public host, no credentials and no secret in the address', () => {
  assert.deepEqual(validateLink('https://example.org/a?b=1#c'), {url: 'https://example.org/a?b=1#c'});
  for (const [input, error] of [['http://example.org', 'https'], ['javascript:alert(1)', 'https'], ['ftp://example.org', 'https'], ['https://user:pw@example.org', 'credentials'], ['https://localhost/x', 'host'], ['https://127.0.0.1/x', 'host'], ['https://printer.local/x', 'host'], ['https://example.org/?token=abc', 'secret'], ['https://example.org/?sig=abc', 'secret'], ['https://example.org/x y', 'invalid'], ['not a link', 'invalid'], ['', 'invalid'], [null, 'invalid'], ['https://example.org/' + 'a'.repeat(600), 'invalid']]) assert.equal(validateLink(input).error, error, String(input));
  assert.deepEqual(parseLinks('https://example.org/a\n\n https://example.org/a \nhttps://example.org/b'), {links: ['https://example.org/a', 'https://example.org/b']});
  assert.equal(parseLinks(Array.from({length: 6}, (_, i) => 'https://example.org/' + i).join('\n')).error, 'count');
  assert.deepEqual(parseLinks('https://example.org/ok\nhttp://example.org/no'), {links: [], error: 'https', line: 2});
});

test('a request is built only from a sanitized note and checked links, and the validator refuses everything else', () => {
  const built = buildRequest({destination: 'discussion-comment', note: 'Done at C:\\Users\\A\\x with token=abc', links: 'https://example.org/e'});
  assert.deepEqual(built.request, {destination: 'discussion-comment', note: 'Done at [local path] with token=[secret removed]', links: ['https://example.org/e'], projectStatus: null});
  assert.equal(validateRequest(built.request).ok, true);
  assert.equal(buildRequest({destination: 'nowhere', note: 'x'}).error, 'destination');
  assert.equal(buildRequest({destination: 'publication-draft', note: '   '}).error, 'note');
  assert.equal(buildRequest({destination: 'publication-draft', note: 'x', links: 'http://example.org'}).error, 'links');
  assert.equal(buildRequest({destination: 'project-item-status', note: 'x'}).error, 'status');
  assert.equal(buildRequest({destination: 'project-item-status', note: 'x', projectStatus: 'done'}).request.projectStatus, 'done');
  assert.equal(buildRequest({destination: 'publication-draft', note: 'x', projectStatus: 'done'}).request.projectStatus, null, 'a status is carried only by the project destination');
  for (const bad of [null, [], 'x', goodRequest({extra: 1}), goodRequest({destination: 'other'}), goodRequest({note: ''}), goodRequest({note: 'x'.repeat(2001)}), goodRequest({note: 'password=abc'}), goodRequest({note: 'C:\\Users\\A'}), goodRequest({links: 'https://example.org'}), goodRequest({links: ['http://example.org']}), goodRequest({links: ['https://example.org/a', 'https://example.org/a']}), goodRequest({links: Array(6).fill(0).map((_, i) => 'https://example.org/' + i)}), goodRequest({projectStatus: 'done'}), goodRequest({destination: 'project-item-status'}), goodRequest({destination: 'project-item-status', projectStatus: 'later'}), Object.create(null)]) assert.equal(validateRequest(bad).ok, false, JSON.stringify(bad));
  assert.equal(validateRequest(goodRequest({destination: 'project-item-status', projectStatus: 'todo'})).ok, true);
});

test('the desktop copy of the sanitizer and validator agrees with the extension copy', async () => {
  const vectors = ['Saved C:\\Users\\Alex\\a.txt', 'token=abc123 password: x', 'Bearer abcdefghijkl', 'alex@example.org', '/home/alex/x and ~/y', 'user=bob', 'plain text', 'a'.repeat(40) + '1', 'word '.repeat(900), 'eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4'];
  for (const input of vectors) assert.deepEqual(desktop.sanitizeNote(input), extension.sanitizeNote(input), input);
  for (const link of ['https://example.org/a', 'http://example.org', 'https://example.org/?token=1', 'https://127.0.0.1/']) assert.deepEqual(desktop.validateLink(link), extension.validateLink(link), link);
  for (const request of [goodRequest(), goodRequest({note: 'password=x'}), goodRequest({destination: 'project-item-status', projectStatus: 'done'}), {}]) assert.deepEqual(desktop.validateRequest(request), extension.validateRequest(request));
  const extensionSource = await fs.readFile(new URL('../browser-extension/publishing.js', import.meta.url), 'utf8');
  const desktopSource = await fs.readFile(new URL('../src/shared/publication-request.js', import.meta.url), 'utf8');
  const body = text => text.slice(text.indexOf('export const DESTINATIONS'), text.indexOf('// ---- Copy') === -1 ? undefined : text.indexOf('// ---- Copy')).trimEnd();
  assert.equal(body(desktopSource), body(extensionSource), 'the two files carry the same logic');
});

// ---- Desktop mediation ---------------------------------------------------------------------------------------------
function mediation(options = {}) {
  let unlocked = true, visible = true, pair = {session, expires: 901000};
  const prompts = [], published = [];
  const service = createBrowserPublishMediation({getPair: () => pair, isUnlocked: () => unlocked, canPrompt: () => visible, now: () => 1000,
    confirm: options.confirm ?? (context => new Promise(resolve => { prompts.push({context, resolve}); context.signal.addEventListener('abort', () => resolve(false), {once: true}); })),
    publishProgress: options.publish ?? (async request => { published.push(request); return true; }), ...options.overrides});
  const check = () => { if (!unlocked) throw Error('Unlock the desktop before receiving downloads.'); };
  const message = (request = goodRequest()) => ({type: 'publish-progress', session, request});
  return {service, prompts, published, message, send: (m = message()) => service.receive(origin, m, check), lock: () => { unlocked = false; service.revoke(); }, hide: () => { visible = false; }, disconnect: () => { pair = null; service.revoke(); }};
}

test('an approved prompt hands the validated request to the publishing route and returns only a fixed state word', async () => {
  const m = mediation(); const pending = m.send(); await flush();
  assert.equal(m.prompts.length, 1); assert.equal(m.prompts[0].context.action, 'publish-progress'); assert.deepEqual(m.prompts[0].context.request, goodRequest());
  assert.equal(m.published.length, 0, 'nothing is published before the person answers');
  m.prompts[0].resolve(true); const answer = await pending;
  assert.deepEqual(answer, {type: 'publish-progress-result', schemaVersion: 1, state: 'approved'});
  assert.deepEqual(m.published, [goodRequest()]);
  const text = JSON.stringify(answer); for (const forbidden of ['note', 'link', 'account', 'secret', 'path', 'session']) assert.ok(!text.includes(forbidden), forbidden);
  assert.equal(m.service.pending, 0);
});

test('a rejected prompt publishes nothing and leaves the pairing usable', async () => {
  const m = mediation(); const pending = m.send(); await flush(); m.prompts[0].resolve(false);
  assert.equal((await pending).state, 'rejected'); assert.equal(m.published.length, 0);
  const next = m.send(); await flush(); m.prompts[1].resolve(true); assert.equal((await next).state, 'approved');
});

test('without a publishing route the answer is a fixed unavailable and no prompt is ever shown', async () => {
  const none = mediation({overrides: {publishProgress: undefined}}); assert.equal((await none.send()).state, 'unavailable'); assert.equal(none.prompts.length, 0);
  const locked = mediation({overrides: {isUnlocked: () => false}}); assert.equal((await locked.send()).state, 'unavailable'); assert.equal(locked.prompts.length, 0);
  const hidden = mediation(); hidden.hide(); assert.equal((await hidden.send()).state, 'unavailable'); assert.equal(hidden.prompts.length, 0);
  const noPrompt = mediation({overrides: {confirm: undefined}, confirm: null}); assert.equal((await noPrompt.send()).state, 'unavailable');
  const refusing = mediation({publish: async () => false}); const asked = refusing.send(); await flush(); refusing.prompts[0].resolve(true); assert.equal((await asked).state, 'unavailable', 'a route that declines is reported as unavailable, never approved');
  const failing = mediation({publish: async () => { throw Error('no host permission'); }}); const failed = failing.send(); await flush(); failing.prompts[0].resolve(true); assert.equal((await failed).state, 'unavailable');
  const truthy = mediation({publish: async () => 'yes'}); const maybe = truthy.send(); await flush(); truthy.prompts[0].resolve(true); assert.equal((await maybe).state, 'unavailable', 'only an exact true counts');
});

test('a malformed or unsanitized request is refused before any prompt, and an unpaired caller cannot use the scope', async () => {
  const m = mediation();
  for (const bad of [goodRequest({note: 'password=abc'}), goodRequest({note: 'C:\\Users\\Alex\\x'}), goodRequest({extra: 1}), goodRequest({links: ['http://example.org']}), goodRequest({destination: 'delete-everything'}), null]) await assert.rejects(m.send(m.message(bad)), /Invalid browser publication request/, JSON.stringify(bad));
  await assert.rejects(m.send({type: 'publish-progress', session}), /Unsupported/);
  await assert.rejects(m.send({type: 'publish-progress', session, request: goodRequest(), extra: 1}), /Unsupported/);
  await assert.rejects(m.send({type: 'focus-authenticator', session, request: goodRequest()}), /Unsupported/);
  await assert.rejects(m.send({type: 'publish-progress', session: 'x'.repeat(43), request: goodRequest()}), /Pair the browser again/);
  assert.equal(m.prompts.length, 0);
  const closed = mediation(); closed.service.close(); await assert.rejects(closed.send(), /Pair the browser again/);
});

test('one prompt at a time: a second request is busy, and it shares the gate with the other Confirm scopes', async () => {
  const m = mediation(); const first = m.send(); await flush();
  assert.equal((await m.send()).state, 'busy'); assert.equal(m.prompts.length, 1);
  m.prompts[0].resolve(true); assert.equal((await first).state, 'approved');
  const gate = {held: true}; const shared = mediation({overrides: {gate}}); assert.equal((await shared.send()).state, 'busy'); assert.equal(shared.prompts.length, 0);
  const held = mediation({overrides: {gate: {held: false}}}); const pending = held.send(); await flush(); assert.equal(held.service.pending, 1); held.prompts[0].resolve(true); await pending;
});

test('lock, disconnect and a 30 second deadline withdraw the pending prompt and publish nothing', async () => {
  const locking = mediation(); const first = locking.send(); await flush(); locking.lock();
  await assert.rejects(first, /Unlock the desktop/); assert.equal(locking.prompts[0].context.signal.aborted, true); assert.equal(locking.published.length, 0);
  const leaving = mediation(); const second = leaving.send(); await flush(); leaving.disconnect();
  await assert.rejects(second, /Pair the browser again/); assert.equal(leaving.published.length, 0);
  const slow = mediation({overrides: {promptTimeoutMs: 40}}); assert.equal((await slow.send()).state, 'rejected'); assert.equal(slow.prompts[0].context.signal.aborted, true); assert.equal(slow.service.pending, 0);
  const late = mediation(); const third = late.send(); await flush(); late.service.revoke(); late.prompts[0].resolve(true);
  assert.equal((await third).state, 'rejected', 'an approval that lands after the withdrawal is not an approval'); assert.equal(late.published.length, 0);
  const {PUBLISH_PROMPT_TIMEOUT_MS} = await import('../src/main/browser-publish-mediation.js'); assert.equal(PUBLISH_PROMPT_TIMEOUT_MS, 30000);
});

test('the publishing route receives a frozen copy, so the prompt text and the published text cannot diverge', async () => {
  let seen; const m = mediation({publish: async request => { seen = request; return true; }});
  const asked = m.send(); await flush(); m.prompts[0].resolve(true); await asked;
  assert.ok(Object.isFrozen(seen) && Object.isFrozen(seen.links));
});

// ---- Native prompt text --------------------------------------------------------------------------------------------
test('the native prompt shows the destination, the sanitized note and every link, with Reject as the default', () => {
  const request = goodRequest({destination: 'project-item-status', projectStatus: 'done', links: ['https://example.org/a', 'https://example.org/b']});
  const english = confirmationOptions({origin, action: 'publish-progress', language: 'en', request});
  assert.equal(english.defaultId, 0); assert.equal(english.cancelId, 0); assert.equal(english.buttons[0], 'Reject'); assert.equal(english.buttons[1], 'Send note');
  for (const needle of [origin, 'Project item status', 'done', 'Pairing now works.', 'https://example.org/a', 'https://example.org/b']) assert.ok(english.detail.includes(needle), needle);
  const yue = confirmationOptions({origin, action: 'publish-progress', language: 'yue', request});
  assert.equal(yue.buttons[0], '拒絕'); assert.ok(yue.detail.includes('專案項目狀態')); assert.ok(yue.detail.includes('證據連結'));
  const both = confirmationOptions({origin, action: 'publish-progress', language: 'bilingual', request}); assert.ok(both.title.includes('·'));
  const long = confirmationOptions({origin, action: 'publish-progress', language: 'en', request: goodRequest({note: 'x'.repeat(2000)})});
  assert.ok(long.detail.length < 1500 && long.detail.includes('…'), 'a long note is shortened in the prompt');
  assert.throws(() => confirmationOptions({origin, action: 'publish-progress', language: 'en'}), /Unsupported/);
  assert.throws(() => confirmationOptions({origin, action: 'publish-progress', language: 'en', request: {note: 'x', destination: 'other', links: []}}), /Unsupported/);
  assert.equal(confirmationOptions({origin, action: 'focus-authenticator', language: 'en'}).buttons[1], 'Open authenticator');
});

test('the prompt passes the request through and approves only on the second button', async () => {
  const seen = []; const parent = {isDestroyed: () => false};
  const prompt = answer => createBrowserConfirmPrompt({getWindow: () => parent, getLanguage: async () => 'en', showMessageBox: async (owner, options) => { seen.push(options); return answer; }});
  assert.equal(await prompt({response: 1}).confirm({origin, action: 'publish-progress', request: goodRequest()}), true);
  assert.ok(seen[0].detail.includes('Pairing now works.'));
  assert.equal(await prompt({response: 0}).confirm({origin, action: 'publish-progress', request: goodRequest()}), false);
  assert.equal(await prompt({response: 1}).confirm({origin, action: 'publish-progress'}), false, 'without the request there is nothing to approve');
});

// ---- Framed broker ---------------------------------------------------------------------------------------------------
function framedBroker(options = {}) {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => queueMicrotask(() => { child.emit('exit', 0); child.emit('close', 0); });
  const state = {unlocked: true, visible: true, prompts: [], published: []};
  const broker = createBrowserNativeBroker({config, now: () => 0, hostPath: 'C:\\Fixture\\MaterialFileEncryptor.BrowserHost.exe', authorizePair: async () => true, isUnlocked: () => state.unlocked, onProposal() {}, spawnHost: () => child,
    hasVisibleWindow: () => state.visible, focusAuthenticator: async () => {},
    confirmAction: context => new Promise(resolve => { state.prompts.push({context, resolve}); context.signal.addEventListener('abort', () => resolve(false), {once: true}); }),
    ...(options.route === false ? {} : {publishProgress: async request => { state.published.push(request); return true; }}), ...options.overrides});
  let counter = 0;
  const send = (message, id = connectionId) => new Promise(resolve => { const requestId = '22222222-2222-2222-2222-' + String(++counter).padStart(12, '0'); const onData = bytes => { const body = JSON.parse(bytes.subarray(4)); if (body.requestId === requestId) { child.stdin.off('data', onData); resolve(body.response); } }; child.stdin.on('data', onData); child.stdout.write(nativeFrame({requestId, connectionId: id, origin, message})); });
  return {broker, child, state, send, async start() { const started = broker.start(); child.stdout.write(nativeFrame({type: 'ready', aclVerified: true})); await started; }};
}

test('native framed publication request needs the paired live connection and a native approval', async () => {
  const f = framedBroker(); await f.start();
  try {
    assert.deepEqual(await f.send({type: 'publish-progress', session, request: goodRequest()}), {type: 'error', code: 'HANDOFF_NOT_ACCEPTED'}, 'unpaired callers are refused'); assert.equal(f.state.prompts.length, 0);
    const pair = await f.send({type: 'pair'});
    const asked = f.send({type: 'publish-progress', session: pair.session, request: goodRequest()}); await flush(); await flush();
    assert.equal(f.state.prompts.length, 1); assert.equal(f.state.published.length, 0);
    f.state.prompts[0].resolve(true); assert.deepEqual(await asked, {type: 'publish-progress-result', schemaVersion: 1, state: 'approved'}); assert.equal(f.state.published.length, 1);
    assert.equal((await f.send({type: 'publish-progress', session: pair.session, request: goodRequest({note: 'token=abc'})})).type, 'error', 'an unsanitized note is refused');
    const rejected = f.send({type: 'publish-progress', session: pair.session, request: goodRequest()}); await flush(); await flush(); f.state.prompts[1].resolve(false);
    assert.equal((await rejected).state, 'rejected'); assert.equal(f.state.published.length, 1);
    assert.equal((await f.send({type: 'read-lock-state', session: pair.session})).state, 'unlocked', 'a rejection leaves the pairing in place');
    await assert.rejects(f.broker.receive(origin, {type: 'publish-progress', session: pair.session, request: goodRequest()}), /connection identity/);
  } finally { await f.broker.close(); }
});

test('with no publishing route the desktop honestly reports unavailable and never prompts', async () => {
  const f = framedBroker({route: false}); await f.start();
  try { const pair = await f.send({type: 'pair'}); assert.deepEqual(await f.send({type: 'publish-progress', session: pair.session, request: goodRequest()}), {type: 'publish-progress-result', schemaVersion: 1, state: 'unavailable'}); assert.equal(f.state.prompts.length, 0); assert.equal(f.state.published.length, 0); } finally { await f.broker.close(); }
});

test('locking withdraws the pending publication prompt, and the prompt gate is shared with the authenticator scope', async () => {
  const f = framedBroker(); await f.start();
  try {
    const pair = await f.send({type: 'pair'});
    const asked = f.send({type: 'publish-progress', session: pair.session, request: goodRequest()}); await flush(); await flush();
    assert.equal((await f.send({type: 'focus-authenticator', session: pair.session})).state, 'busy', 'one native prompt across every Confirm scope');
    f.state.unlocked = false; f.broker.revoke();
    assert.equal((await asked).type, 'error'); assert.equal(f.state.published.length, 0); assert.equal(f.state.prompts[0].context.signal.aborted, true);
  } finally { await f.broker.close(); }
});

test('closing the broker withdraws a pending publication prompt', async () => {
  const f = framedBroker(); await f.start();
  const pair = await f.send({type: 'pair'}); const asked = f.send({type: 'publish-progress', session: pair.session, request: goodRequest()}); await flush(); await flush();
  const signal = f.state.prompts[0].context.signal; await f.broker.close(); assert.equal(signal.aborted, true); void asked;
});

test('the desktop publication modules add no storage, network or secret handling', async () => {
  for (const name of ['src/main/browser-publish-mediation.js', 'src/shared/publication-request.js']) { const source = await fs.readFile(new URL('../' + name, import.meta.url), 'utf8'); assert.doesNotMatch(source, /localStorage|writeFile|randomBytes|fetch\(|process\.env|child_process|XMLHttpRequest/, name); }
  const wiring = await fs.readFile(new URL('../src/main/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(wiring, /publishProgress/, 'no forge route is wired, so the desktop reports unavailable rather than pretending to publish');
});

// ---- Service worker relay ---------------------------------------------------------------------------------------------
test('extension background relays the scope, validates the answer and refuses a malformed request', async () => {
  let listener, receive, nativeResponses = []; const sent = [];
  const chrome = {runtime: {id: 'fixture', getURL: p => 'chrome-extension://fixture/' + p, onInstalled: {addListener() {}}, onMessage: {addListener(fn) { listener = fn; }}, connectNative: () => ({onDisconnect: {addListener() {}}, onMessage: {addListener(fn) { receive = fn; }}, disconnect() {}, postMessage(message) { sent.push(message); queueMicrotask(() => receive(message.type === 'pair' ? {type: 'paired', session: 's'.repeat(43)} : nativeResponses.shift())); }})}, contextMenus: {create() {}, onClicked: {addListener() {}}, removeAll(cb) { cb?.(); }}, permissions: {contains: async () => false, onRemoved: {addListener() {}}}, downloads: {}};
  const context = vm.createContext({chrome, URL, setTimeout, clearTimeout, queueMicrotask});
  vm.runInContext(await fs.readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8'), context);
  context.deliver = message => new Promise(resolve => listener(message, {id: 'fixture', url: chrome.runtime.getURL('options.html'), frameId: 0}, resolve));
  const send = async message => JSON.parse(JSON.stringify(await vm.runInContext('deliver(' + JSON.stringify(message) + ')', context)));
  assert.deepEqual(await send({type: 'publish-progress-request', request: goodRequest()}), {paired: false}); assert.equal(sent.length, 0);
  await send({type: 'pair'}); const before = sent.length;
  for (const state of ['approved', 'rejected', 'busy', 'unavailable']) { nativeResponses = [{type: 'publish-progress-result', schemaVersion: 1, state}]; assert.deepEqual(await send({type: 'publish-progress-request', request: goodRequest()}), {schemaVersion: 1, state}); }
  assert.deepEqual(sent.slice(before).map(item => item.type), Array(4).fill('publish-progress')); assert.deepEqual(Object.keys(sent[before]).sort(), ['request', 'session', 'type']); assert.deepEqual(JSON.parse(JSON.stringify(sent[before].request)), goodRequest());
  for (const bad of [{type: 'publish-progress-result', schemaVersion: 1, state: 'approved', note: 'x'}, {type: 'publish-progress-result', schemaVersion: 1, state: 'maybe'}, {type: 'publish-progress-result', schemaVersion: 2, state: 'approved'}, {type: 'other', schemaVersion: 1, state: 'approved'}, {type: 'publish-progress-result', schemaVersion: 1}]) { nativeResponses = [bad]; assert.ok((await send({type: 'publish-progress-request', request: goodRequest()})).error); }
  const count = sent.length;
  for (const bad of [{type: 'publish-progress-request'}, {type: 'publish-progress-request', request: goodRequest({destination: 'other'})}, {type: 'publish-progress-request', request: goodRequest({links: ['http://example.org']})}, {type: 'publish-progress-request', request: goodRequest({extra: 1})}, {type: 'publish-progress-request', request: goodRequest(), extra: 1}, {type: 'publish-progress-request', request: goodRequest({note: ''})}]) assert.ok((await send(bad)).error, JSON.stringify(bad));
  assert.equal(sent.length, count, 'a malformed request never reaches the native channel');
});

// ---- Section rendering ------------------------------------------------------------------------------------------------
class Node {
  constructor(tag, doc) { this.localName = tag; this.doc = doc; this.children = []; this.attributes = new Map(); this.listeners = {}; this.dataset = {}; this.textContent = ''; this.value = ''; this.checked = false; this.disabled = false; this.hidden = false; this.id = ''; this.className = ''; this.ownerDocument = doc; }
  append(...nodes) { this.children.push(...nodes); } setAttribute(name, value) { this.attributes.set(name, String(value)); } addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); }
  async fire(name) { for (const fn of this.listeners[name] ?? []) await fn({}); }
  all() { return [this, ...this.children.flatMap(child => child.all())]; }
}
function section(options = {}) {
  const doc = {createElement: tag => new Node(tag, doc)}; const root = new Node('div', doc); doc.root = root;
  let language = options.language ?? 'en', wording = options.wording ?? []; const sentMessages = []; const timers = []; let answer = options.answer ?? (async () => ({schemaVersion: 1, state: 'approved'}));
  const view = mountPublishing(root, {send: async message => { sentMessages.push(message); return answer(message); }, getLanguage: () => language, getWording: () => wording, setTimer: (fn, ms) => { timers.push({fn, ms}); return timers.length; }, clearTimer: id => { timers[id - 1] && (timers[id - 1].cleared = true); }});
  const byId = id => root.all().find(node => node.id === id);
  return {view, root, byId, sentMessages, timers, setLanguage: value => { language = value; view.refreshLabels(); }, setAnswer: fn => { answer = fn; }, setWording: value => { wording = value; },
    type(note, links = '') { byId('publishing-note').value = note; byId('publishing-links').value = links; byId('publishing-note').listeners.input[0](); },
    review(on = true) { byId('publishing-reviewed').checked = on; byId('publishing-reviewed').listeners.change[0](); }};
}

test('the section shows an empty preview, a disabled send button and the idle state until a note is reviewed', () => {
  const s = section();
  assert.equal(s.byId('publishing-heading').textContent, 'Progress and publication');
  assert.equal(s.byId('publishing-preview').dataset.state, 'hidden'); assert.equal(s.byId('publishing-preview').attributes.get('aria-hidden'), 'true');
  assert.equal(s.byId('publishing-send').disabled, true); assert.equal(s.byId('publishing-state').textContent, 'Nothing has been sent.'); assert.equal(s.byId('publishing-state').attributes.get('role'), 'status');
  s.type('Progress at C:\\Users\\Alex\\vault with token=abc', 'https://example.org/e');
  assert.equal(s.byId('publishing-preview').dataset.state, 'shown'); assert.equal(s.byId('publishing-preview').attributes.get('aria-hidden'), 'false');
  assert.equal(s.byId('publishing-preview-body').textContent, 'Progress at [local path] with token=[secret removed]');
  assert.match(s.byId('publishing-preview-links').textContent, /https:\/\/example\.org\/e/); assert.match(s.byId('publishing-redactions').textContent, /1 paths.*1 secret-like/);
  assert.equal(s.byId('publishing-send').disabled, true, 'review is required first'); s.review(); assert.equal(s.byId('publishing-send').disabled, false);
  s.type('', ''); assert.equal(s.byId('publishing-send').disabled, true, 'an empty note cannot be sent');
  s.type('Clean note'); assert.equal(s.byId('publishing-redactions').textContent, 'Nothing needed to be removed.');
});

test('invalid evidence links are explained in place and block sending', () => {
  const s = section(); s.type('Note', 'http://example.org'); s.review();
  assert.equal(s.byId('publishing-link-error').textContent, 'Evidence links must start with https://. (1)'); assert.equal(s.byId('publishing-link-error').attributes.get('role'), 'alert');
  assert.equal(s.byId('publishing-send').disabled, true);
  s.type('Note', 'https://example.org/ok\nhttps://example.org/?token=abc'); assert.match(s.byId('publishing-link-error').textContent, /secret/);
  s.type('Note', 'https://example.org/ok'); assert.equal(s.byId('publishing-link-error').textContent, '');
});

test('the destination selects the help text and the project status field only for the project destination', () => {
  const s = section(); assert.equal(s.byId('publishing-project-status').hidden, true);
  s.byId('publishing-destination').value = 'project-item-status'; s.byId('publishing-destination').listeners.change[0]();
  assert.equal(s.byId('publishing-project-status').hidden, false); assert.match(s.byId('publishing-destination-help').textContent, /host permission/);
  s.byId('publishing-destination').value = 'publication-draft'; s.byId('publishing-destination').listeners.change[0]();
  assert.equal(s.byId('publishing-project-status').hidden, true); assert.match(s.byId('publishing-destination-help').textContent, /Nothing is published from the browser/);
});

test('sending goes through the service worker only, shows pending, then each truthful state, and clears the review box', async () => {
  for (const state of ['approved', 'rejected', 'busy', 'unavailable']) {
    let release; const s = section({answer: () => new Promise(resolve => { release = () => resolve({schemaVersion: 1, state}); })});
    s.byId('publishing-destination').value = 'project-item-status'; s.byId('publishing-destination').listeners.change[0](); s.byId('publishing-project-status').value = 'done';
    s.type('Tracked at C:\\Users\\Alex\\x', 'https://example.org/e'); s.review();
    const sending = s.byId('publishing-send').listeners.click[0]();
    assert.equal(s.view.state, 'pending'); assert.equal(s.byId('publishing-state').dataset.state, 'pending'); assert.match(s.byId('publishing-state').textContent, /^Pending: waiting for your approval on the desktop/);
    assert.equal(s.byId('publishing-send').disabled, true); assert.equal(s.byId('publishing-note').disabled, true);
    assert.equal(s.timers.length, 1); assert.equal(s.timers[0].ms, 45000, 'the page gives up shortly after the desktop 30 second withdrawal');
    release(); await sending;
    assert.deepEqual(s.sentMessages, [{type: 'publish-progress-request', request: {destination: 'project-item-status', note: 'Tracked at [local path]', links: ['https://example.org/e'], projectStatus: 'done'}}]);
    assert.equal(s.view.state, state); assert.equal(s.byId('publishing-state').textContent, COPY.states[state][0]);
    assert.equal(s.byId('publishing-reviewed').checked, false, 'a new send needs a new review'); assert.equal(s.byId('publishing-send').disabled, true); assert.equal(s.timers[0].cleared, true);
  }
});

test('unpaired, failed and silent attempts end as honest states, and editing after an answer returns to idle', async () => {
  const unpaired = section({answer: async () => ({paired: false})}); unpaired.type('Note'); unpaired.review(); await unpaired.byId('publishing-send').listeners.click[0]();
  assert.equal(unpaired.view.state, 'unpaired'); assert.match(unpaired.byId('publishing-state').textContent, /Pair the browser with the desktop first/);
  const failed = section({answer: async () => ({error: 'x'})}); failed.type('Note'); failed.review(); await failed.byId('publishing-send').listeners.click[0](); assert.equal(failed.view.state, 'expired');
  const thrown = section({answer: async () => { throw Error('closed'); }}); thrown.type('Note'); thrown.review(); await thrown.byId('publishing-send').listeners.click[0](); assert.equal(thrown.view.state, 'expired');
  const forged = section({answer: async () => ({schemaVersion: 1, state: 'published'})}); forged.type('Note'); forged.review(); await forged.byId('publishing-send').listeners.click[0](); assert.equal(forged.view.state, 'expired', 'an unknown state word is never shown as success');
  failed.type('Note again'); assert.equal(failed.view.state, 'idle');
  const silent = section({answer: () => new Promise(() => {})}); silent.type('Note'); silent.review(); void silent.byId('publishing-send').listeners.click[0]();
  assert.equal(silent.view.state, 'pending'); silent.timers[0].fn(); assert.equal(silent.view.state, 'expired'); assert.match(silent.byId('publishing-state').textContent, /^Expired/);
  const dropped = section({answer: () => new Promise(() => {})}); dropped.type('Note'); dropped.review(); void dropped.byId('publishing-send').listeners.click[0](); dropped.view.disconnect(); assert.equal(dropped.view.state, 'expired');
});

test('a second click while pending does nothing and the form can be cleared', async () => {
  let release; const s = section({answer: () => new Promise(resolve => { release = () => resolve({schemaVersion: 1, state: 'approved'}); })});
  s.type('Note'); s.review(); const first = s.byId('publishing-send').listeners.click[0](); await s.byId('publishing-send').listeners.click[0]();
  assert.equal(s.sentMessages.length, 1); await s.byId('publishing-reset').listeners.click[0](); assert.equal(s.byId('publishing-note').value, 'Note', 'reset is disabled while pending');
  release(); await first; await s.byId('publishing-reset').listeners.click[0]();
  assert.equal(s.byId('publishing-note').value, ''); assert.equal(s.view.state, 'idle'); assert.equal(s.byId('publishing-preview').dataset.state, 'hidden');
});

test('personal wording is reversed in the preview and in the request that is sent', async () => {
  const s = section({wording: [['bug', 'gizmo']]}); s.type('A gizmo was fixed.'); s.review();
  assert.equal(s.byId('publishing-preview-body').textContent, 'A bug was fixed.'); assert.match(s.byId('publishing-redactions').textContent, /1 personal wording/);
  await s.byId('publishing-send').listeners.click[0](); assert.equal(s.sentMessages[0].request.note, 'A bug was fixed.');
});

test('every label is English, Cantonese or bilingual and follows the page language', () => {
  const s = section({language: 'yue'}); s.type('Note');
  assert.equal(s.byId('publishing-heading').textContent, '進度同發佈'); assert.equal(s.byId('publishing-send').textContent, '傳送去桌面等待批准'); assert.equal(s.byId('publishing-state').textContent, '未傳送任何嘢。');
  s.setLanguage('bilingual'); assert.equal(s.byId('publishing-heading').textContent, 'Progress and publication · 進度同發佈'); assert.ok(s.byId('publishing-state').textContent.includes(' · '));
  s.setLanguage('en'); assert.equal(s.byId('publishing-send').textContent, 'Send to desktop for approval');
  const walk = (value, path) => { if (Array.isArray(value)) { assert.equal(value.length, 2, path); assert.ok(value[0] && value[1], path); assert.notEqual(value[0], value[1], path); } else if (typeof value === 'function') walk(value({paths: 1, users: 2, emails: 3, secrets: 4, wording: 5, truncated: true}), path); else for (const [key, item] of Object.entries(value)) walk(item, path + '.' + key); };
  walk(COPY, 'COPY');
  for (const destination of extension.DESTINATIONS) assert.ok(COPY.destinations[destination] && COPY.destinationHelp[destination]);
});

// ---- Page wiring ---------------------------------------------------------------------------------------------------------
test('the options page registers the section with a Home card, a panel and a mount point, and keeps the extension off the network', async () => {
  const html = await fs.readFile(new URL('../browser-extension/options.html', import.meta.url), 'utf8');
  const source = await fs.readFile(new URL('../browser-extension/options.js', import.meta.url), 'utf8');
  assert.match(html, /<button type="button" class="home-card" id="tab-publishing" data-tab="publishing" aria-controls="panel-publishing" aria-labelledby="title-publishing" aria-describedby="desc-publishing">/);
  assert.match(html, /<section role="tabpanel" id="panel-publishing" aria-labelledby="section-title" hidden>/); assert.match(html, /id="publishing-root"/); assert.match(html, /id="lock-mark-publishing"/);
  assert.match(html, /<script type="module" src="publishing-entry\.js"><\/script>/);
  assert.match(source, /publishingDesc:\['[^']+','[^']+'\]/); assert.match(source, /PUBLISHING_TAB\]/);
  assert.doesNotMatch(source.slice(source.indexOf('PUBLISHING_TAB')), /publish-progress/, 'options.js carries only the section registration');
  assert.equal(applyPreferences({getItem: () => null, setItem() {}}, defaults, {tab: 'publishing'}).value.tab, 'publishing');
  for (const name of ['publishing.js', 'publishing-entry.js']) { const code = await fs.readFile(new URL('../browser-extension/' + name, import.meta.url), 'utf8'); assert.doesNotMatch(code, /fetch\(|XMLHttpRequest|WebSocket|sendBeacon|innerHTML|insertAdjacentHTML|eval\(|localStorage\.setItem/, name); }
  const css = await fs.readFile(new URL('../browser-extension/options.css', import.meta.url), 'utf8');
  assert.match(css, /\.publishing-preview\[data-state=hidden\]/); assert.match(css, /prefers-reduced-motion:reduce\)\{\.publishing-project-status:not\(\[hidden\]\)\{animation:none\}\.publishing-preview/);
  const build = await fs.readFile(new URL('../scripts/build-browser-extension.mjs', import.meta.url), 'utf8'); assert.match(build, /'publishing\.js','publishing-entry\.js'/);
});
