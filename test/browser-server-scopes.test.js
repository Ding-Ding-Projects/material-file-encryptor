import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createBrowserServerMediation, SERVER_ACTIONS as DESKTOP_ACTIONS, SERVER_STATES as DESKTOP_STATES, validManageRequest} from '../src/main/browser-server-mediation.js';
import {createBrowserServerAdapters, SUPPORTED_SERVER_ACTIONS} from '../src/main/browser-server-adapters.js';
import {createBrowserSchoolMediation} from '../src/main/browser-school-mediation.js';
import {createBrowserNativeBroker, nativeFrame} from '../src/main/browser-native-host.js';
import {TARGET_IDS} from '../src/features/server-manager/targets.js';
import {SERVER_TARGETS, SERVER_ACTIONS, SERVER_STATES, SERVER_RESULTS, SERVER_CHANNELS, STATE_GROUPS, stateGroup, parseSettingValue, buildManageMessage, validateServersResponse, validateCatalogResponse, validateManageResponse, filterServers, mountBrowserServers} from '../browser-extension/servers.js';

const origin = 'chrome-extension://' + 'a'.repeat(32) + '/', session = 's'.repeat(43), connectionId = '11111111-1111-1111-1111-111111111111';
const config = {schemaVersion: 1, host: 'org.dingding.material_file_encryptor.downloads', allowedOrigins: [origin], identity: {extensionId: 'a'.repeat(32), packageSha256: '0'.repeat(64), publicKeySha256: '1'.repeat(64)}};
const flush = () => new Promise(resolve => setImmediate(resolve));
const targets = TARGET_IDS.map(id => ({id, available: id === 'local-process'}));
const row = (extra = {}) => ({id: 'server-1', name: 'Vanilla 1.21.4', target: 'local-process', flavor: 'vanilla', version: '1.21.4', state: 'stopped', ...extra});
const listing = (extra = {}) => ({manager: 'available', targets, servers: [row()], ...extra});
const catalogue = (extra = {}) => ({catalogue: 'ready', flavors: [{id: 'vanilla', name: 'Vanilla', targets: ['local-process']}], versions: [{id: '1.21.4', channel: 'release'}, {id: '24w14a', channel: 'snapshot'}], total: 2, next: null, ...extra});
const read = {type: 'read-servers', session};
const manage = (action = 'start', server = 'server-1', options = null) => ({type: 'manage-server', session, action, server, options});

function mediation(options = {}) {
  let unlocked = true, visible = true, pair = {session, expires: 901000};
  const prompts = [], applied = [];
  const service = createBrowserServerMediation({
    getPair: () => pair, isUnlocked: () => unlocked, canPrompt: () => visible, now: () => 1000,
    readServers: 'readServers' in options ? options.readServers : async () => listing(),
    readServerCatalog: 'readServerCatalog' in options ? options.readServerCatalog : async () => catalogue(),
    supports: options.supports ?? (() => true),
    authenticate: options.authenticate ?? (context => new Promise(resolve => { prompts.push({context, resolve}); context.signal.addEventListener('abort', () => resolve(false), {once: true}); })),
    applyServerAction: options.apply ?? (async request => { applied.push(request); return {state: 'changed', server: request.action === 'create' ? 'server-2' : request.server}; }),
    ...options.overrides,
  });
  const check = () => { if (!unlocked) throw Error('Unlock the desktop before receiving downloads.'); };
  return {service, prompts, applied, send: (message = manage()) => service.receive(origin, message, check), lock: () => { unlocked = false; service.revoke(); }, hide: () => { visible = false; }, disconnect: () => { pair = null; service.revoke(); }};
}

test('the reviewed lists are the same on the desktop, in the page module and in the background', async () => {
  const background = await fs.readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8');
  const listOf = (name, text) => JSON.parse(text.match(new RegExp('const ' + name + '=(\\[[^\\]]*\\])'))[1].replace(/'/g, '"'));
  assert.deepEqual([...SERVER_TARGETS], [...TARGET_IDS]);
  assert.deepEqual([...SERVER_ACTIONS], [...DESKTOP_ACTIONS]);
  assert.deepEqual([...SERVER_STATES], [...DESKTOP_STATES]);
  assert.deepEqual(listOf('SERVER_TARGETS', background), [...TARGET_IDS]);
  assert.deepEqual(listOf('SERVER_ACTIONS', background), [...DESKTOP_ACTIONS]);
  assert.deepEqual(listOf('SERVER_STATES', background), [...DESKTOP_STATES]);
  assert.deepEqual(listOf('SERVER_RESULTS', background), [...SERVER_RESULTS]);
  assert.deepEqual(listOf('SERVER_CHANNELS', background), [...SERVER_CHANNELS]);
  assert.deepEqual(Object.values(STATE_GROUPS).flat().sort(), [...DESKTOP_STATES].sort(), 'every state belongs to exactly one filter group');
  assert.throws(() => SERVER_ACTIONS.push('x'), TypeError);
  assert.deepEqual(TARGET_IDS, ['local-process', 'local-container', 'ssh-process', 'ssh-container'], 'all four targets are modelled');
});

test('read-servers needs a pairing only and answers with fixed fields', async () => {
  const m = mediation();
  assert.deepEqual(await m.send(read), {type: 'servers', schemaVersion: 1, manager: 'available', targets, servers: [row()]});
  assert.equal(m.prompts.length, 0, 'a read never prompts');
  m.disconnect();
  await assert.rejects(m.send(read), /Pair the browser again/);
  const wrong = mediation(); await assert.rejects(wrong.send({...read, session: 't'.repeat(43)}), /Pair the browser again/);
});

test('a desktop without the manager answers unavailable and lists nothing', async () => {
  const none = mediation({readServers: null});
  const answer = await none.send(read);
  assert.deepEqual(answer, {type: 'servers', schemaVersion: 1, manager: 'unavailable', targets: TARGET_IDS.map(id => ({id, available: false})), servers: []});
  const noCat = mediation({readServerCatalog: null});
  assert.deepEqual(await noCat.send({type: 'read-server-catalog', session, cursor: null}), {type: 'server-catalog', schemaVersion: 1, catalogue: 'unavailable', flavors: [], versions: [], total: 0, next: null});
});

test('a malformed desktop answer is refused instead of passed on', async () => {
  const bad = [listing({extra: 1}), listing({servers: [row({path: 'C:\\Servers'})]}), listing({servers: [row({state: 'online'})]}), listing({servers: [row({target: 'cloud'})]}), listing({servers: [row(), row()]}), listing({servers: [row({name: 'a\u0007b'})]}), listing({targets: targets.slice(1)}), listing({manager: 'maybe'}), listing({servers: new Array(101).fill(0).map((_, i) => row({id: 'server-' + i}))})];
  for (const value of bad) { const m = mediation({readServers: async () => value}); await assert.rejects(m.send(read), /unavailable/, JSON.stringify(value).slice(0, 80)); }
  const failing = mediation({readServers: async () => { throw Error('C:\\secret'); }});
  await assert.rejects(failing.send(read), /Servers are unavailable/);
});

test('read-server-catalog is paged, bounded and strict', async () => {
  const seen = [];
  const m = mediation({readServerCatalog: async request => { seen.push(request); return catalogue({next: request.cursor === null ? '100' : null}); }});
  const first = await m.send({type: 'read-server-catalog', session, cursor: null});
  assert.deepEqual(first, {type: 'server-catalog', schemaVersion: 1, ...catalogue({next: '100'})});
  await m.send({type: 'read-server-catalog', session, cursor: '100'});
  assert.deepEqual(seen, [{cursor: null}, {cursor: '100'}]);
  for (const cursor of ['x', '-1', '123456', 5, undefined, '1 ']) await assert.rejects(m.send({type: 'read-server-catalog', session, cursor}), /Unsupported browser server request/, String(cursor));
  await assert.rejects(m.send({type: 'read-server-catalog', session}), /Unsupported/);
  const bad = [catalogue({versions: new Array(101).fill({id: '1.0', channel: 'release'})}), catalogue({versions: [{id: '1.0', channel: 'stable'}]}), catalogue({versions: [{id: '../x', channel: 'release'}]}), catalogue({flavors: [{id: 'Vanilla!', name: 'v', targets: []}]}), catalogue({flavors: [{id: 'v', name: 'v', targets: ['cloud']}]}), catalogue({total: -1}), catalogue({catalogue: 'stale'}), catalogue({next: 'abc'})];
  for (const value of bad) await assert.rejects(mediation({readServerCatalog: async () => value}).send({type: 'read-server-catalog', session, cursor: null}), /catalogue is unavailable/);
});

test('every change needs a fresh native re-authentication and only then reaches the desktop manager', async () => {
  for (const [action, server, options] of [['create', null, {target: 'local-process', flavor: 'vanilla', version: '1.21.4'}], ['start', 'server-1', null], ['stop', 'server-1', null], ['restart', 'server-1', null], ['change-setting', 'server-1', {key: 'max-players', value: 20}], ['install-plugin', 'server-1', {plugin: 'worldedit'}]]) {
    const m = mediation();
    const pending = m.send(manage(action, server, options)); await flush(); await flush();
    assert.equal(m.prompts.length, 1, action + ' prompts'); assert.deepEqual(m.applied, [], 'nothing happens before the person answers');
    assert.equal(m.prompts[0].context.origin, origin); assert.equal(m.prompts[0].context.action, action);
    m.prompts[0].resolve(true);
    assert.deepEqual(await pending, {type: 'server-managed', schemaVersion: 1, state: 'changed', action, server: action === 'create' ? 'server-2' : server});
    assert.equal(m.applied.length, 1); assert.deepEqual(m.applied[0].options, options);
  }
});

test('a rejected or non-true answer changes nothing and the pairing stays usable', async () => {
  for (const verdict of [false, undefined, 'yes', 1, null]) {
    const m = mediation({authenticate: async () => verdict});
    assert.equal((await m.send()).state, 'rejected'); assert.deepEqual(m.applied, []);
    assert.equal((await m.send(read)).type, 'servers');
  }
  const gone = mediation({authenticate: async () => 'unavailable'}); assert.equal((await gone.send()).state, 'unavailable');
  const thrown = mediation({authenticate: async () => { throw Error('boom'); }}); assert.equal((await thrown.send()).state, 'rejected');
});

test('an action the desktop manager does not implement is answered unavailable without any prompt', async () => {
  // The gate is generic: whichever actions the manager reports as unsupported are answered without a prompt.
  const m = mediation({supports: action => ['create', 'start', 'stop', 'restart'].includes(action)});
  assert.deepEqual([...SUPPORTED_SERVER_ACTIONS].sort(), ['change-setting', 'create', 'install-plugin', 'restart', 'start', 'stop'], 'the desktop manager now offers every action');
  for (const [action, options] of [['change-setting', {key: 'motd', value: 'hi'}], ['install-plugin', {plugin: 'worldedit'}]]) {
    assert.deepEqual(await m.send(manage(action, 'server-1', options)), {type: 'server-managed', schemaVersion: 1, state: 'unavailable', action, server: 'server-1'});
  }
  assert.equal(m.prompts.length, 0); assert.deepEqual(m.applied, []);
  const throwing = mediation({supports: () => { throw Error('x'); }}); assert.equal((await throwing.send()).state, 'unavailable');
});

test('a locked desktop, a hidden window or a missing callback refuse at once without a prompt', async () => {
  const locked = mediation({overrides: {isUnlocked: () => false}}); assert.equal((await locked.send()).state, 'unavailable'); assert.equal(locked.prompts.length, 0);
  const hidden = mediation(); hidden.hide(); assert.equal((await hidden.send()).state, 'unavailable'); assert.equal(hidden.prompts.length, 0);
  const noAuth = mediation({overrides: {authenticate: undefined}}); assert.equal((await noAuth.send()).state, 'unavailable');
  const noApply = mediation({overrides: {applyServerAction: undefined}}); assert.equal((await noApply.send()).state, 'unavailable');
  const closed = mediation(); closed.service.close(); await assert.rejects(closed.send(), /Pair the browser again/);
});

test('lock, disconnect and close withdraw the pending prompt and nothing changes', async () => {
  for (const withdraw of [m => m.lock(), m => m.disconnect(), m => m.service.close()]) {
    const m = mediation(); const pending = m.send().catch(error => error); await flush(); assert.equal(m.service.pending, 1);
    withdraw(m); const answer = await pending;
    assert.ok(answer instanceof Error || answer.state === 'rejected', 'withdrawn'); assert.deepEqual(m.applied, []); assert.equal(m.service.pending, 0);
  }
});

test('an unanswered prompt is withdrawn as rejected before the host deadline and frees the next request', async () => {
  const m = mediation({overrides: {promptTimeoutMs: 20}});
  assert.equal((await m.send()).state, 'rejected'); assert.deepEqual(m.applied, []);
  assert.equal(m.service.pending, 0);
  const next = m.send(); await flush(); assert.equal(m.prompts.length, 2); m.prompts[1].resolve(true); assert.equal((await next).state, 'changed');
});

test('the prompt is shared with school mode and a second request is answered busy', async () => {
  const gate = {held: false}, prompts = [], pair = {session, expires: 901000};
  const server = createBrowserServerMediation({getPair: () => pair, isUnlocked: () => true, now: () => 1000, authenticate: context => new Promise(resolve => { prompts.push(resolve); context.signal.addEventListener('abort', () => resolve(false), {once: true}); }), applyServerAction: async () => ({state: 'changed', server: 'server-1'}), gate});
  const school = createBrowserSchoolMediation({getPair: () => pair, isUnlocked: () => true, now: () => 1000, readSchoolMode: async () => ({enabled: false, name: 'x'}), authenticate: async () => true, applySchoolMode: async ({enabled}) => ({state: 'changed', enabled}), gate});
  const check = () => {};
  const first = server.receive(origin, manage(), check); await flush();
  assert.equal(gate.held, true);
  assert.equal((await server.receive(origin, manage('stop'), check)).state, 'busy');
  assert.equal((await school.receive(origin, {type: 'set-school-mode', session, enabled: true}, check)).state, 'busy');
  prompts[0](true); assert.equal((await first).state, 'changed'); assert.equal(gate.held, false);
});

test('a late approval after the lock, or a failing or malformed desktop write, never reports changed', async () => {
  const late = mediation(); const pending = late.send().catch(error => error); await flush(); late.lock(); late.prompts[0].resolve(true); await pending; assert.deepEqual(late.applied, []);
  for (const result of [null, 'ok', {state: 'maybe'}, {}, {state: 'changed', server: '../x'}]) {
    const m = mediation({authenticate: async () => true, apply: async () => result});
    const answer = await m.send();
    assert.equal(answer.state, result?.state === 'changed' ? 'changed' : 'unavailable', JSON.stringify(result)); assert.equal(answer.server, 'server-1');
  }
  const throwing = mediation({authenticate: async () => true, apply: async () => { throw Error('C:\\secret'); }}); assert.deepEqual(await throwing.send(), {type: 'server-managed', schemaVersion: 1, state: 'unavailable', action: 'start', server: 'server-1'});
});

test('malformed, unknown or credential-bearing requests are refused before any prompt', async () => {
  const m = mediation();
  const create = {target: 'local-process', flavor: 'vanilla', version: '1.21.4'};
  const bad = [
    {type: 'manage-server', session}, {...manage(), extra: 1}, {...manage(), action: 'delete'}, manage('start', null), manage('start', '../x'), manage('start', 'a b'), manage('start', 'server-1', {}), manage('stop', 'server-1', {force: true}),
    manage('create', 'server-1', create), manage('create', null, null), manage('create', null, {...create, target: 'cloud'}), manage('create', null, {...create, host: 'example.test'}), manage('create', null, {...create, password: 'x'}), manage('create', null, {target: 'ssh-process', flavor: 'vanilla', version: '1.21.4', privateKey: 'x'}),
    manage('create', null, {...create, flavor: 'Vanilla'}), manage('create', null, {...create, version: '../1'}), manage('create', null, {...create, version: 'x'.repeat(40)}),
    manage('change-setting', 'server-1', {key: 'Max', value: 1}), manage('change-setting', 'server-1', {key: 'ok', value: {}}), manage('change-setting', 'server-1', {key: 'ok', value: 'x'.repeat(257)}), manage('change-setting', 'server-1', {key: 'ok', value: 1.5}), manage('change-setting', 'server-1', {key: 'ok'}),
    manage('install-plugin', 'server-1', {plugin: 'https://x.test/a.jar'}), manage('install-plugin', 'server-1', {plugin: 'a', path: 'C:\\a.jar'}), manage('install-plugin', 'server-1', {plugin: '../a'}), manage('install-plugin', 'server-1', null),
    Object.create({inherited: 1}), [], null, 'start',
  ];
  for (const message of bad) { assert.equal(validManageRequest(message), false, JSON.stringify(message)); await assert.rejects(m.send(message), /Unsupported browser server request|Pair the browser again/, JSON.stringify(message)); }
  assert.equal(m.prompts.length, 0); assert.deepEqual(m.applied, []);
  await assert.rejects(m.service.receive(origin, manage(), undefined), /Unsupported/);
  assert.throws(() => createBrowserServerMediation({}), /Invalid browser server configuration/);
  for (const target of TARGET_IDS) assert.equal(validManageRequest(manage('create', null, {...create, target})), true, target);
});

test('the browser-facing modules add no storage, network or secret handling', async () => {
  for (const file of ['../src/main/browser-server-mediation.js', '../src/main/browser-server-adapters.js']) {
    const source = await fs.readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''), /localStorage|writeFile|randomBytes|fetch\(|process\.env|child_process|credential|password|ssh2/i, file);
  }
  const page = await fs.readFile(new URL('../browser-extension/servers.js', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /localStorage|sessionStorage|chrome\.storage|fetch\(|XMLHttpRequest|type="password"|<input|innerHTML|eval\(|new Function/);
  const background = await fs.readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8');
  const code = background.slice(background.indexOf("'servers-read'"), background.indexOf("'unlock-ladder-read'"));
  assert.ok(code.length > 1500);
  assert.doesNotMatch(code, /localStorage|chrome\.storage|password|credential/i);
});

test('the adapters map the desktop manager to fixed rows and offer only what it can do', async () => {
  const calls = [];
  const operations = [{id: 'op-1', serverId: 'server-1', version: '1.21.4', status: 'prepared', bytesVerified: true, lifecycle: {state: 'running'}}, {id: 'op-2', serverId: 'server-2', version: '1.20.1', status: 'downloading', bytesVerified: false}, {id: 'op-3', serverId: 'server-3', version: '1.19', status: 'failed', bytesVerified: false}, {id: 'op-4', serverId: 'server-4', version: '1.18', status: 'prepared', bytesVerified: true}];
  const dispatch = async (action, payload) => {
    calls.push([action, payload]);
    if (action === 'snapshot') return {catalogue: {state: 'fresh', sourceSha256: 'c'.repeat(64)}, operations, targets: [{id: 'local-process', available: false}, {id: 'ssh-process', available: false}]};
    if (action === 'versions') return {catalogueId: payload.catalogueId, total: 3, next: '100', versions: [{id: '1.21.4', channel: 'release', releaseTime: 'x'}, {id: 'odd', channel: 'unknown'}]};
    if (action === 'resolveVersion') return {selectionId: 'sel-1', preparable: payload.versionId !== 'too-big'};
    if (action === 'prepare') return {serverId: 'server-9', status: 'admitting'};
    return {};
  };
  const adapters = createBrowserServerAdapters({dispatch, authenticate: async () => true});
  const listed = await adapters.readServers();
  assert.deepEqual(listed.servers.map(item => [item.id, item.state, item.target, item.flavor]), [['server-1', 'running', 'local-process', 'vanilla'], ['server-2', 'preparing', 'local-process', 'vanilla'], ['server-3', 'failed', 'local-process', 'vanilla'], ['server-4', 'prepared', 'local-process', 'vanilla']]);
  assert.deepEqual(listed.targets.map(item => item.available), [false, false, false, false], 'no target is claimed available until the desktop says so');
  const mediationView = await mediation({readServers: adapters.readServers}).send(read);
  assert.equal(mediationView.servers.length, 4, 'the rows pass the strict channel validation');
  const page = await adapters.readServerCatalog({cursor: '0'});
  assert.deepEqual(page.versions, [{id: '1.21.4', channel: 'release'}]); assert.equal(page.next, '100');
  assert.deepEqual(page.flavors.map(item => item.id), ['vanilla', 'paper', 'purpur', 'fabric', 'forge', 'neoforge'], 'every flavor the desktop can prepare is offered');
  assert.ok(page.flavors.every(item => item.targets.join() === 'local-process,local-container'), 'only targets a browser may create are listed');
  assert.equal((await mediation({readServerCatalog: adapters.readServerCatalog}).send({type: 'read-server-catalog', session, cursor: null})).catalogue, 'ready');
  assert.deepEqual([adapters.supportsServerAction('create'), adapters.supportsServerAction('restart'), adapters.supportsServerAction('change-setting'), adapters.supportsServerAction('install-plugin')], [true, true, true, true]);
  calls.length = 0;
  assert.deepEqual(await adapters.applyServerAction({action: 'create', server: null, options: {target: 'local-process', flavor: 'vanilla', version: '1.21.4'}}), {state: 'unavailable', server: null}, 'a create is unavailable until the managed service reports the target available');
  assert.deepEqual(calls.map(item => item[0]), ['targets']);
  for (const options of [{target: 'ssh-process', flavor: 'vanilla', version: '1.21.4'}, {target: 'local-container', flavor: 'vanilla', version: '1.21.4'}, {target: 'local-process', flavor: 'paper', version: '1.21.4'}, {target: 'local-process', flavor: 'vanilla', version: 'too-big'}]) assert.deepEqual(await adapters.applyServerAction({action: 'create', server: null, options}), {state: 'unavailable', server: null}, JSON.stringify(options));
  calls.length = 0;
  assert.deepEqual(await adapters.applyServerAction({action: 'restart', server: 'server-1', options: null}), {state: 'changed', server: 'server-1'});
  assert.deepEqual(calls.filter(item => item[0] !== 'snapshot').map(item => item[0]), ['stop', 'start']);
  assert.deepEqual(await adapters.applyServerAction({action: 'start', server: 'server-2', options: null}), {state: 'rejected', server: 'server-2'}, 'a server that is not verified is not started');
  assert.deepEqual(await adapters.applyServerAction({action: 'change-setting', server: 'server-1', options: {key: 'a', value: 1}}), {state: 'unavailable', server: null});
  assert.deepEqual(await adapters.applyServerAction({action: 'install-plugin', server: 'server-1', options: {plugin: 'a'}}), {state: 'unavailable', server: null});
  const busy = createBrowserServerAdapters({dispatch: async action => { if (action === 'snapshot') return {operations, catalogue: {}}; throw Error('An owned preparation is already active.'); }});
  assert.equal((await busy.applyServerAction({action: 'start', server: 'server-1', options: null})).state, 'busy');
  const notLoaded = createBrowserServerAdapters({dispatch: async () => ({operations: [], catalogue: {sourceSha256: null}})});
  assert.equal((await notLoaded.readServerCatalog({cursor: null})).catalogue, 'not-loaded');
  assert.equal((await notLoaded.applyServerAction({action: 'create', server: null, options: {target: 'local-process', flavor: 'vanilla', version: '1.21.4'}})).state, 'unavailable');
  await assert.rejects(createBrowserServerAdapters({dispatch: async () => { throw Error('start unavailable'); }}).applyServerAction({action: 'start', server: 'server-1', options: null}));
  assert.throws(() => createBrowserServerAdapters({}), /Invalid/);
});

function framedBroker(options = {}) {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => queueMicrotask(() => { child.emit('exit', 0); child.emit('close', 0); });
  const state = {unlocked: true, prompts: [], applied: []};
  const broker = createBrowserNativeBroker({config, now: () => 0, hostPath: 'C:\\Fixture\\MaterialFileEncryptor.BrowserHost.exe', authorizePair: async () => true, isUnlocked: () => state.unlocked, onProposal() {}, spawnHost: () => child,
    ...(options.withCallbacks === false ? {} : {
      hasVisibleWindow: () => true, readServers: async () => listing(), readServerCatalog: async () => catalogue(), supportsServerAction: () => true,
      authenticateServerAction: context => new Promise(resolve => { state.prompts.push({context, resolve}); context.signal.addEventListener('abort', () => resolve(false), {once: true}); }),
      applyServerAction: async request => { state.applied.push(request); return {state: 'changed', server: request.server}; },
      readSchoolMode: async () => ({enabled: false, name: 'School mode'}), authenticateSchoolMode: async () => false, applySchoolMode: async ({enabled}) => ({state: 'changed', enabled}), confirmAction: async () => false, focusAuthenticator: async () => {},
    })});
  let counter = 0;
  const send = (message, id = connectionId) => new Promise(resolve => { const requestId = '22222222-2222-2222-2222-' + String(++counter).padStart(12, '0'); const onData = bytes => { const body = JSON.parse(bytes.subarray(4)); if (body.requestId === requestId) { child.stdin.off('data', onData); resolve(body.response); } }; child.stdin.on('data', onData); child.stdout.write(nativeFrame({requestId, connectionId: id, origin, message})); });
  return {broker, child, state, send, async start() { const started = broker.start(); child.stdout.write(nativeFrame({type: 'ready', aclVerified: true})); await started; }};
}

test('through the native broker the scopes need the paired live connection and every change waits for the desktop', async () => {
  const f = framedBroker(); await f.start();
  try {
    assert.deepEqual(await f.send(read), {type: 'error', code: 'HANDOFF_NOT_ACCEPTED'}, 'unpaired callers are refused');
    assert.deepEqual(await f.send(manage()), {type: 'error', code: 'HANDOFF_NOT_ACCEPTED'}); assert.equal(f.state.prompts.length, 0);
    const pair = await f.send({type: 'pair'}); assert.equal(pair.type, 'paired'); const s = pair.session;
    assert.deepEqual(await f.send({...read, session: s}), {type: 'servers', schemaVersion: 1, manager: 'available', targets, servers: [row()]});
    assert.equal((await f.send({type: 'read-server-catalog', session: s, cursor: null})).catalogue, 'ready');
    const started = f.send({...manage('start'), session: s}); await flush(); await flush();
    assert.equal(f.state.prompts.length, 1); assert.deepEqual(f.state.applied, []);
    f.state.prompts[0].resolve(true);
    assert.deepEqual(await started, {type: 'server-managed', schemaVersion: 1, state: 'changed', action: 'start', server: 'server-1'});
    const stopped = f.send({...manage('stop'), session: s}); await flush(); await flush(); f.state.prompts[1].resolve(false);
    assert.equal((await stopped).state, 'rejected');
    assert.equal((await f.send({type: 'read-lock-state', session: s})).state, 'unlocked', 'a rejection leaves the pairing in place');
    assert.equal((await f.send({...manage('create', null, {target: 'ssh-process', flavor: 'vanilla', version: '1.21.4', privateKey: 'x'}), session: s})).type, 'error');
    assert.equal((await f.send({...manage('start'), session: s, extra: true})).type, 'error');
    await assert.rejects(f.broker.receive(origin, {...manage(), session: s}), /connection identity/);
  } finally { await f.broker.close(); }
});

test('through the native broker a pending change is withdrawn by closing and an unwired desktop answers unavailable', async () => {
  const pending = framedBroker(); await pending.start();
  const pair = await pending.send({type: 'pair'}); const change = pending.send({...manage('restart'), session: pair.session}); await flush(); await flush();
  assert.equal(pending.state.prompts.length, 1);
  await pending.broker.close(); assert.deepEqual(pending.state.applied, []);
  const bare = framedBroker({withCallbacks: false}); await bare.start();
  try {
    const paired = await bare.send({type: 'pair'});
    assert.equal((await bare.send({...read, session: paired.session})).manager, 'unavailable');
    assert.equal((await bare.send({...manage(), session: paired.session})).state, 'unavailable');
  } finally { await bare.broker.close(); }
  await Promise.race([change, flush()]);
});

async function backgroundFixture() {
  let listener, receive, nativeResponses = []; const sent = [];
  const chrome = {runtime: {id: 'fixture', getURL: p => 'chrome-extension://fixture/' + p, onInstalled: {addListener() {}}, onMessage: {addListener(fn) { listener = fn; }}, connectNative: () => ({onDisconnect: {addListener() {}}, onMessage: {addListener(fn) { receive = fn; }}, disconnect() {}, postMessage(message) { sent.push(message); queueMicrotask(() => receive(message.type === 'pair' ? {type: 'paired', session: 's'.repeat(43)} : nativeResponses.shift())); }})}, contextMenus: {onClicked: {addListener() {}}, create() {}}, action: {setBadgeText() {}, setTitle() {}}};
  const context = vm.createContext({chrome, URL, setTimeout, clearTimeout, queueMicrotask});
  vm.runInContext(await fs.readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8'), context);
  context.deliver = message => new Promise(resolve => listener(message, {id: 'fixture', url: chrome.runtime.getURL('options.html'), frameId: 0}, resolve));
  const relay = async message => JSON.parse(JSON.stringify(await vm.runInContext('deliver(' + JSON.stringify(message) + ')', context)));
  return {relay, sent, answers: values => { nativeResponses = values; }};
}

test('the extension background relays the server scopes, validates answers and rejects extra fields', async () => {
  const f = await backgroundFixture();
  assert.deepEqual(await f.relay({type: 'servers-read'}), {paired: false});
  assert.deepEqual(await f.relay({type: 'server-catalog-read', cursor: null}), {paired: false});
  assert.deepEqual(await f.relay({type: 'server-manage', action: 'start', server: 'server-1', options: null}), {paired: false}); assert.equal(f.sent.length, 0);
  await f.relay({type: 'pair'}); const before = f.sent.length;
  f.answers([{type: 'servers', schemaVersion: 1, ...listing()}]);
  assert.deepEqual(await f.relay({type: 'servers-read'}), {schemaVersion: 1, ...listing()});
  assert.deepEqual(JSON.parse(JSON.stringify(f.sent[before])), {type: 'read-servers', session: 's'.repeat(43)});
  f.answers([{type: 'server-catalog', schemaVersion: 1, ...catalogue({next: '100'})}]);
  assert.deepEqual(await f.relay({type: 'server-catalog-read', cursor: '100'}), {schemaVersion: 1, ...catalogue({next: '100'})});
  assert.deepEqual(JSON.parse(JSON.stringify(f.sent.at(-1))), {type: 'read-server-catalog', session: 's'.repeat(43), cursor: '100'});
  for (const state of ['changed', 'unchanged', 'rejected', 'busy', 'unavailable']) { f.answers([{type: 'server-managed', schemaVersion: 1, state, action: 'start', server: 'server-1'}]); assert.deepEqual(await f.relay({type: 'server-manage', action: 'start', server: 'server-1', options: null}), {schemaVersion: 1, state, action: 'start', server: 'server-1'}); }
  assert.deepEqual(Object.keys(f.sent.at(-1)).sort(), ['action', 'options', 'server', 'session', 'type']);
  f.answers([{type: 'server-managed', schemaVersion: 1, state: 'changed', action: 'create', server: 'server-7'}]);
  assert.equal((await f.relay({type: 'server-manage', action: 'create', server: null, options: {target: 'ssh-container', flavor: 'vanilla', version: '1.21.4'}})).server, 'server-7');
  const badManage = [{type: 'server-managed', schemaVersion: 1, state: 'changed', action: 'start', server: 'server-1', token: 'x'}, {type: 'server-managed', schemaVersion: 1, state: 'maybe', action: 'start', server: 'server-1'}, {type: 'server-managed', schemaVersion: 2, state: 'changed', action: 'start', server: 'server-1'}, {type: 'server-managed', schemaVersion: 1, state: 'changed', action: 'stop', server: 'server-1'}, {type: 'server-managed', schemaVersion: 1, state: 'changed', action: 'start', server: 'server-2'}, {type: 'server-managed', schemaVersion: 1, state: 'changed', action: 'start', server: '../x'}, {type: 'other', schemaVersion: 1, state: 'changed', action: 'start', server: 'server-1'}];
  for (const bad of badManage) { f.answers([bad]); assert.ok((await f.relay({type: 'server-manage', action: 'start', server: 'server-1', options: null})).error, JSON.stringify(bad)); }
  for (const bad of [{type: 'servers', schemaVersion: 1, ...listing({servers: [row({path: 'C:'})]})}, {type: 'servers', schemaVersion: 1, ...listing({servers: [row({state: 'online'})]})}, {type: 'servers', schemaVersion: 2, ...listing()}, {type: 'servers', schemaVersion: 1, ...listing({manager: 'maybe'})}, {type: 'servers', schemaVersion: 1, ...listing({targets: targets.slice(1)})}, {type: 'servers', schemaVersion: 1, ...listing(), token: 'x'}]) { f.answers([bad]); assert.ok((await f.relay({type: 'servers-read'})).error, JSON.stringify(bad)); }
  for (const bad of [{type: 'server-catalog', schemaVersion: 1, ...catalogue({versions: [{id: '1.0', channel: 'stable'}]})}, {type: 'server-catalog', schemaVersion: 1, ...catalogue({total: -1})}, {type: 'server-catalog', schemaVersion: 1, ...catalogue({next: 'x'})}, {type: 'server-catalog', schemaVersion: 1, ...catalogue(), path: 'C:'}]) { f.answers([bad]); assert.ok((await f.relay({type: 'server-catalog-read', cursor: null})).error, JSON.stringify(bad)); }
  const count = f.sent.length;
  for (const bad of [{type: 'server-manage', action: 'start', server: 'server-1'}, {type: 'server-manage', action: 'delete', server: 'server-1', options: null}, {type: 'server-manage', action: 'create', server: null, options: {target: 'ssh-process', flavor: 'vanilla', version: '1.21.4', password: 'x'}}, {type: 'server-manage', action: 'create', server: null, options: {target: 'cloud', flavor: 'vanilla', version: '1.21.4'}}, {type: 'server-manage', action: 'install-plugin', server: 'server-1', options: {plugin: 'https://x.test/a.jar'}}, {type: 'server-manage', action: 'change-setting', server: 'server-1', options: {key: 'a', value: {}}}, {type: 'server-catalog-read'}, {type: 'server-catalog-read', cursor: 'x'}, {type: 'server-catalog-read', cursor: null, extra: 1}, {type: 'servers-read', session: 'x'}]) assert.ok((await f.relay(bad)).error, JSON.stringify(bad));
  assert.equal(f.sent.length, count, 'nothing malformed reaches the desktop');
});

// ---- page module -----------------------------------------------------------------------------------------------
class Node {
  constructor(tag, doc) { this.tag = tag; this.ownerDocument = doc; this.children = []; this.listeners = {}; this.attributes = {}; this.textContent = ''; this.className = ''; this.hidden = false; this.disabled = false; this.value = ''; this.open = false; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  show() { this.open = true; return Promise.resolve(); }
  close() { this.open = false; }
  focus() {}
  all() { return [this, ...this.children.flatMap(item => item.all())]; }
}
const dom = () => { const doc = {createElement: tag => new Node(tag, doc)}; return {doc, root: doc.createElement('div')}; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function mounted(replies, extra = {}) {
  const {root} = dom(), sent = [];
  const view = mountBrowserServers(root, {send: async message => { sent.push(message); const reply = replies.shift(); if (reply instanceof Error) throw reply; return typeof reply === 'function' ? reply(message) : reply; }, getLanguage: () => extra.language ?? 'en', acquire: extra.acquire, release: extra.release, isExternallyBusy: extra.isExternallyBusy});
  const find = (tag, text) => root.all().find(n => n.tag === tag && n.textContent === text);
  const button = text => root.all().find(n => n.tag.startsWith('md-') && n.textContent === text);
  const chip = label => root.all().find(n => n.tag === 'md-filter-chip' && n.label === label);
  const rows = () => root.all().filter(n => n.className === 'server-row');
  return {root, view, sent, find, button, chip, rows};
}
const serversReply = (extra = {}) => ({schemaVersion: 1, ...listing(extra)});
const catalogReply = (extra = {}) => ({schemaVersion: 1, ...catalogue(extra)});

test('page validators accept exactly what the background forwards and nothing else', () => {
  assert.equal(validateServersResponse(serversReply()), true); assert.equal(validateCatalogResponse(catalogReply()), true);
  assert.equal(validateServersResponse({...serversReply(), extra: 1}), false); assert.equal(validateServersResponse(serversReply({servers: [row({state: 'x'})]})), false);
  assert.equal(validateCatalogResponse(catalogReply({next: 'x'})), false);
  assert.equal(validateManageResponse({schemaVersion: 1, state: 'changed', action: 'create', server: 'server-9'}, 'create', null), true);
  assert.equal(validateManageResponse({schemaVersion: 1, state: 'changed', action: 'start', server: 'server-9'}, 'start', 'server-1'), false);
  assert.equal(validateManageResponse({schemaVersion: 1, state: 'changed', action: 'stop', server: 'server-1'}, 'start', 'server-1'), false);
  assert.deepEqual(buildManageMessage('start', 'server-1', null), {type: 'server-manage', action: 'start', server: 'server-1', options: null});
  assert.equal(buildManageMessage('start', 'server-1', {a: 1}), null); assert.equal(buildManageMessage('create', null, {target: 'cloud', flavor: 'vanilla', version: '1'}), null); assert.equal(buildManageMessage('nope', 'server-1', null), null);
  assert.deepEqual([parseSettingValue('true'), parseSettingValue('false'), parseSettingValue('20'), parseSettingValue('-3'), parseSettingValue('hello world'), parseSettingValue('x\u0007')], [true, false, 20, -3, 'hello world', undefined]);
  assert.equal(stateGroup('running'), 'running'); assert.equal(stateGroup('prepared'), 'idle'); assert.equal(stateGroup('starting'), 'working'); assert.equal(stateGroup('failed'), 'attention'); assert.equal(stateGroup('unknown'), 'attention');
  const all = [row({id: 'a', state: 'running'}), row({id: 'b', target: 'ssh-process', state: 'stopped'}), row({id: 'c', state: 'failed'})];
  assert.deepEqual(filterServers(all).map(r => r.id), ['a', 'b', 'c']);
  assert.deepEqual(filterServers(all, {targets: new Set(['ssh-process'])}).map(r => r.id), ['b']);
  assert.deepEqual(filterServers(all, {groups: new Set(['running', 'attention'])}).map(r => r.id), ['a', 'c']);
  assert.deepEqual(filterServers(all, {targets: new Set(['local-process']), groups: new Set(['attention'])}).map(r => r.id), ['c']);
});

test('the Servers section starts unpaired and disabled, then lists servers with state chips and target filters after a read', async () => {
  const m = mounted([serversReply({servers: [row(), row({id: 'server-2', name: 'Vanilla 1.20', state: 'running', target: 'ssh-process'}), row({id: 'server-3', state: 'failed'})]})]);
  assert.equal(m.button('Read servers').disabled, true); assert.equal(m.find('p', 'Pair the browser to begin.') !== undefined, true);
  m.view.setConnection(true); assert.equal(m.button('Read servers').disabled, false); assert.equal(m.button('Create server').disabled, true, 'create stays disabled until the catalogue is read');
  await m.button('Read servers').listeners.click(); await tick();
  assert.deepEqual(m.sent, [{type: 'servers-read'}]);
  assert.equal(m.rows().length, 3);
  const states = m.root.all().filter(n => n.className === 'server-state').map(n => [n.textContent, n.attributes['data-state']]);
  assert.deepEqual(states, [['Stopped', 'stopped'], ['Running', 'running'], ['Failed', 'failed']]);
  assert.ok(m.root.all().some(n => n.tag === 'md-filter-chip' && n.label === 'SSH process (unavailable)'), 'a target the desktop cannot use is labelled unavailable');
  assert.ok(m.root.all().some(n => n.tag === 'md-filter-chip' && n.label === 'Local process'));
  m.chip('SSH process (unavailable)').listeners.click(); assert.equal(m.rows().length, 1);
  m.chip('SSH process (unavailable)').listeners.click(); assert.equal(m.rows().length, 3);
  m.chip('Needs attention').listeners.click(); assert.equal(m.rows().length, 1);
  m.chip('Running').listeners.click(); assert.equal(m.rows().length, 2);
  m.chip('Local process').listeners.click(); assert.equal(m.rows().length, 1);
  m.chip('Needs attention').listeners.click(); m.chip('Running').listeners.click(); m.chip('Local process').listeners.click();
  assert.equal(m.rows().length, 3);
  const start = m.root.all().find(n => n.tag === 'md-text-button' && n.attributes['aria-label'] === 'Start: Vanilla 1.21.4');
  assert.ok(start, 'every action names its server for assistive technology');
});

test('a desktop without the manager is reported truthfully and nothing can be changed', async () => {
  const m = mounted([serversReply({manager: 'unavailable', targets: targets.map(item => ({...item, available: false})), servers: []}), catalogReply({catalogue: 'unavailable', flavors: [], versions: [], total: 0})]);
  m.view.setConnection(true); await m.button('Read servers').listeners.click(); await tick();
  assert.match(m.root.all().find(n => n.tag === 'p' && /no server manager/.test(n.textContent)).textContent, /nothing can be changed/);
  await m.button('Read versions').listeners.click(); await tick();
  assert.equal(m.button('Create server').disabled, true);
  assert.ok(m.find('p', 'The version catalogue is unavailable.'));
});

test('read failures, malformed answers and a lost pairing show plain states and never throw', async () => {
  const m = mounted([new Error('x'), {error: 'no'}, {paired: false}, {...serversReply(), extra: 1}, serversReply()]);
  m.view.setConnection(true);
  for (const expected of [/did not complete/, /did not complete/, /Pair the browser again/, /did not complete/]) { await m.button('Read servers').listeners.click(); await tick(); assert.match(m.root.all().find(n => n.tag === 'p' && n.attributes.role === 'status').textContent, expected); assert.equal(m.rows().length, 0); }
  await m.button('Read servers').listeners.click(); await tick(); assert.equal(m.rows().length, 1);
});

test('the create dialog offers only available targets, pages the versions and sends fixed identifiers', async () => {
  const replies = [serversReply({servers: []}), catalogReply({next: '100', total: 3}), catalogReply({versions: [{id: '1.20.1', channel: 'release'}], next: null, total: 3}), {schemaVersion: 1, state: 'changed', action: 'create', server: 'server-9'}];
  const m = mounted(replies);
  m.view.setConnection(true); await m.button('Read servers').listeners.click(); await tick(); await m.button('Read versions').listeners.click(); await tick();
  assert.equal(m.button('More versions').disabled, false); await m.button('More versions').listeners.click(); await tick();
  assert.deepEqual(m.sent.map(item => item.type), ['servers-read', 'server-catalog-read', 'server-catalog-read']); assert.deepEqual(m.sent[1], {type: 'server-catalog-read', cursor: null}); assert.deepEqual(m.sent[2], {type: 'server-catalog-read', cursor: '100'});
  assert.equal(m.button('More versions').disabled, true, 'the last page ends the paging');
  assert.equal(m.button('Create server').disabled, false);
  await m.button('Create server').listeners.click();
  const dialog = m.root.all().find(n => n.tag === 'md-dialog'); assert.equal(dialog.open, true);
  const selects = dialog.all().filter(n => n.tag === 'md-outlined-select');
  const [flavorSelect, targetSelect, versionSelect] = selects;
  const options = select => select.children.map(n => [n.value, n.disabled, n.textContent]);
  assert.deepEqual(options(flavorSelect).map(item => item[0]), ['vanilla']);
  assert.deepEqual(options(targetSelect).map(item => [item[0], item[1]]), [['local-process', false], ['local-container', true], ['ssh-process', true], ['ssh-container', true]], 'targets the desktop lacks are disabled');
  assert.ok(options(targetSelect).slice(1).every(item => /unavailable/.test(item[2])));
  assert.deepEqual(options(versionSelect).map(item => item[0]), ['1.21.4', '1.20.1'], 'only release versions show until another channel is chosen');
  versionSelect.value = '1.20.1'; versionSelect.listeners.change();
  const snapshotChip = dialog.all().find(n => n.tag === 'md-filter-chip' && n.label === 'Snapshot'); snapshotChip.listeners.click();
  assert.deepEqual(options(dialog.all().filter(n => n.tag === 'md-outlined-select')[2]).map(item => item[0]), ['1.21.4', '24w14a', '1.20.1']);
  await dialog.all().find(n => n.tag === 'md-filled-button' && n.textContent === 'Create on the desktop').listeners.click(); await tick();
  assert.deepEqual(m.sent.at(-1), {type: 'server-manage', action: 'create', server: null, options: {target: 'local-process', flavor: 'vanilla', version: '1.20.1'}});
  assert.equal(dialog.open, false);
  assert.match(m.root.all().find(n => n.tag === 'p' && /Create server/.test(n.textContent)).textContent, /accepted the request/);
});

test('start, stop and restart ask the desktop, show its fixed answer and keep the list until it is read again', async () => {
  const m = mounted([serversReply({servers: [row({state: 'running'})]}), ...['changed', 'rejected', 'busy', 'unavailable'].map(state => ({schemaVersion: 1, state, action: 'restart', server: 'server-1'}))]);
  m.view.setConnection(true); await m.button('Read servers').listeners.click(); await tick();
  const restart = () => m.root.all().find(n => n.attributes['aria-label'] === 'Restart: Vanilla 1.21.4');
  const answers = [];
  for (const expected of [/accepted the request/, /rejected on the desktop/, /already asking a question/, /cannot do this yet/]) { await restart().listeners.click(); await tick(); answers.push(m.root.all().find(n => n.tag === 'p' && /Restart/.test(n.textContent)).textContent); assert.match(answers.at(-1), expected); assert.equal(m.rows().length, 1, 'the listed state is not guessed'); }
  assert.deepEqual(m.sent.slice(1).map(item => [item.action, item.server, item.options]), new Array(4).fill(['restart', 'server-1', null]));
  const start = m.root.all().find(n => n.attributes['aria-label'] === 'Start: Vanilla 1.21.4'); assert.equal(start.disabled, true, 'a running server cannot be started again');
});

test('setting and plugin changes use bounded fields and are sent as fixed identifiers only', async () => {
  const m = mounted([serversReply(), {schemaVersion: 1, state: 'unavailable', action: 'change-setting', server: 'server-1'}, {schemaVersion: 1, state: 'unavailable', action: 'install-plugin', server: 'server-1'}]);
  m.view.setConnection(true); await m.button('Read servers').listeners.click(); await tick();
  const dialog = m.root.all().find(n => n.tag === 'md-dialog');
  await m.root.all().find(n => n.attributes['aria-label'] === 'Change setting: Vanilla 1.21.4').listeners.click();
  const [key, value] = dialog.all().filter(n => n.tag === 'md-outlined-text-field'); const confirm = () => dialog.all().find(n => n.tag === 'md-filled-button');
  key.value = 'Bad Key!'; value.value = '5'; confirm().listeners.click(); assert.equal(m.sent.length, 1, 'an invalid name is refused locally'); assert.ok(dialog.all().some(n => n.attributes.role === 'alert' && n.textContent));
  key.value = 'max-players'; value.value = '20'; confirm().listeners.click(); await tick();
  assert.deepEqual(m.sent.at(-1), {type: 'server-manage', action: 'change-setting', server: 'server-1', options: {key: 'max-players', value: 20}});
  assert.match(m.root.all().find(n => n.tag === 'p' && /Change setting/.test(n.textContent)).textContent, /cannot do this yet/);
  await m.root.all().find(n => n.attributes['aria-label'] === 'Install plugin: Vanilla 1.21.4').listeners.click();
  const plugin = dialog.all().find(n => n.tag === 'md-outlined-text-field'); plugin.value = 'https://example.test/a.jar'; confirm().listeners.click(); assert.equal(m.sent.length, 2, 'a URL is not an identifier');
  plugin.value = 'worldedit'; confirm().listeners.click(); await tick();
  assert.deepEqual(m.sent.at(-1), {type: 'server-manage', action: 'install-plugin', server: 'server-1', options: {plugin: 'worldedit'}});
  for (const message of m.sent) assert.doesNotMatch(JSON.stringify(message), /password|"host"|"path"|"url"|privateKey/i);
});

test('the busy lease is shared and a lost connection clears everything and ignores late answers', async () => {
  let release; const events = [];
  const m = mounted([() => new Promise(resolve => { release = resolve; })], {acquire: () => { events.push('acquire'); return true; }, release: () => events.push('release')});
  m.view.setConnection(true); const pending = m.button('Read servers').listeners.click(); await tick();
  assert.equal(m.button('Read servers').disabled, true, 'controls are disabled while a request waits'); assert.equal(m.button('Stop waiting').hidden, false);
  m.view.setConnection(false); release(serversReply()); await pending; await tick();
  assert.equal(m.rows().length, 0, 'a late answer after a lost connection is dropped');
  assert.ok(m.find('p', 'Pair the browser to begin.'));
  const blocked = mounted([serversReply()], {isExternallyBusy: () => true}); blocked.view.setConnection(true); assert.equal(blocked.button('Read servers').disabled, true);
  const denied = mounted([serversReply()], {acquire: () => false}); denied.view.setConnection(true); await denied.button('Read servers').listeners.click(); assert.equal(denied.sent.length, 0, 'a refused lease sends nothing');
  const stop = mounted([() => new Promise(() => {})]); stop.view.setConnection(true); stop.button('Read servers').listeners.click(); await tick(); stop.button('Stop waiting').listeners.click();
  assert.match(stop.root.all().find(n => n.tag === 'p' && n.attributes.role === 'status').textContent, /Stopped waiting/);
  assert.equal(events.length >= 2, true);
});

test('the section is localised in English, real Cantonese and both together', async () => {
  const en = mounted([serversReply()]), yue = mounted([serversReply()], {language: 'yue'}), both = mounted([serversReply()], {language: 'bilingual'});
  for (const m of [en, yue, both]) { m.view.setConnection(true); }
  await yue.root.all().find(n => n.tag === 'md-outlined-button').listeners.click(); await tick();
  assert.ok(en.button('Read servers')); assert.ok(yue.button('讀取伺服器')); assert.ok(both.button('Read servers · 讀取伺服器'));
  assert.ok(yue.root.all().some(n => n.className === 'server-state' && n.textContent === '已停止'));
  assert.ok(yue.root.all().some(n => n.tag === 'md-filter-chip' && n.label === '本機程序'));
  assert.ok(!yue.root.all().some(n => /[A-Za-z]{4,}/.test(n.textContent) && n.tag === 'md-outlined-button'), 'Cantonese buttons carry no English words');
  yue.view.refreshLabels(); both.view.refreshLabels();
});

test('the options page wires the Servers section into Home, the palette, preferences and the popup', async () => {
  const html = await fs.readFile(new URL('../browser-extension/options.html', import.meta.url), 'utf8'), source = await fs.readFile(new URL('../browser-extension/options.js', import.meta.url), 'utf8');
  const popup = await fs.readFile(new URL('../browser-extension/popup.html', import.meta.url), 'utf8'), popupSource = await fs.readFile(new URL('../browser-extension/popup.js', import.meta.url), 'utf8');
  const css = await fs.readFile(new URL('../browser-extension/options.css', import.meta.url), 'utf8'), prefs = await fs.readFile(new URL('../browser-extension/preferences.js', import.meta.url), 'utf8');
  const build = await fs.readFile(new URL('../scripts/build-browser-extension.mjs', import.meta.url), 'utf8');
  assert.match(html, /id="tab-servers" data-tab="servers" aria-controls="panel-servers"/); assert.match(html, /<section role="tabpanel" id="panel-servers" aria-labelledby="section-title" hidden>[^]*?<div id="browser-servers"/);
  assert.match(html, /id="lock-mark-servers"/); assert.match(source, /import \{mountBrowserServers\} from '\.\/servers\.js';/); assert.match(source, /mountBrowserServers\(\$\('browser-servers'\)/);
  assert.match(source, /SECTION_IDS=\[[^\]]*'servers'\]/); assert.match(source, /Open Servers/); assert.match(source, /servers:\['Servers','伺服器'\]/);
  assert.match(popup, /id="launch-cell-servers"/); assert.match(popupSource, /\['servers',\['Servers','伺服器'\]\]/); assert.match(prefs, /'servers'\]\.includes\(value\.tab\)/);
  assert.match(css, /\.server-row\{[^}]*animation:mfe-panel-in var\(--md-sys-motion-duration-short4\) var\(--md-sys-motion-easing-standard\)/); assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.server-row\{animation:none\}\.server-state\{transition:none\}\}/);
  assert.match(build, /'pairing-code\.js',[^\]]*'servers\.js'/);
  assert.equal(source.match(/const LOCK_TABS=(\[[^\]]*\])/)[1].includes('servers'), false, 'the reviewed lockable tab list is unchanged');
});
