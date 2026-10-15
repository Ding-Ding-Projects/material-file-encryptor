import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createBrowserStatusMediation, validStatusClientReport} from '../src/main/browser-status-mediation.js';
import {createBrowserNativeBroker, nativeFrame} from '../src/main/browser-native-host.js';
import {validReport, buildReport, enrollmentFromReply, shownEnrollment, ENROLLMENT_STATES} from '../browser-extension/status-client.js';

const origin = 'chrome-extension://' + 'a'.repeat(32) + '/', session = 's'.repeat(43), connectionId = '11111111-1111-1111-1111-111111111111';
const config = {schemaVersion: 1, host: 'org.dingding.material_file_encryptor.downloads', allowedOrigins: [origin], identity: {extensionId: 'a'.repeat(32), packageSha256: '0'.repeat(64), publicKeySha256: '1'.repeat(64)}};
const report = () => ({version: '0.1.0', connection: 'paired', lastRefresh: '2026-10-14T09:30Z', counts: {notes: 2, schedules: 1, tickets: 0, operations: 0}});

function fixture(options = {}) {
  let pair = {session, expires: 901000};
  const service = createBrowserStatusMediation({getPair: () => pair, isUnlocked: () => true, now: () => 1000, ...options});
  return {service, enroll: (message = {type: 'enroll-status-client', session, report: report()}, check = () => {}) => service.receive(origin, message, check), disconnect() { pair = null; }};
}

test('the extension and desktop accept exactly the same bounded report', () => {
  const good = report();
  assert.equal(validReport(good), true);
  assert.equal(validStatusClientReport(good), true);
  const variants = [
    {...good, extra: 1}, {...good, version: 'v1'}, {...good, version: 'C:\\x'}, {...good, connection: 'unpaired'}, {...good, lastRefresh: '2026-10-14T09:30:45Z'}, {...good, lastRefresh: 'yesterday'},
    {...good, counts: {...good.counts, notes: -1}}, {...good, counts: {...good.counts, notes: 10000}}, {...good, counts: {...good.counts, notes: 1.5}}, {...good, counts: {...good.counts, title: 3}},
    {...good, counts: {notes: 1, schedules: 1, tickets: 1}}, {version: '0.1.0', connection: 'paired', counts: good.counts}, {...good, lastRefresh: undefined}, [], null, 'text',
  ];
  for (const bad of variants) { assert.equal(validReport(bad), false, JSON.stringify(bad)); assert.equal(validStatusClientReport(bad), false, JSON.stringify(bad)); }
  assert.equal(validReport({...good, lastRefresh: null}), true);
  assert.equal(validStatusClientReport({...good, lastRefresh: null}), true);
});

test('building a report cuts the time to the minute and bounds counts', () => {
  const built = buildReport({version: '0.1.0', lastRefreshAt: new Date('2026-10-14T09:30:45.123Z'), counts: {notes: 5, schedules: 99999, tickets: -4, operations: 'x'}});
  assert.deepEqual(built, {version: '0.1.0', connection: 'paired', lastRefresh: '2026-10-14T09:30Z', counts: {notes: 5, schedules: 9999, tickets: 0, operations: 0}});
  assert.equal(buildReport({version: '0.1.0', counts: {}}).lastRefresh, null);
  assert.throws(() => buildReport({version: 'not a version', counts: {}}), /not valid/);
});

test('enrollment states are truthful: never enrolled before pairing, unavailable on anything unexpected', () => {
  assert.deepEqual([...ENROLLMENT_STATES], ['not-enrolled', 'pending', 'enrolled', 'unavailable']);
  assert.equal(shownEnrollment(false, 'enrolled'), 'not-enrolled');
  assert.equal(shownEnrollment(null, 'enrolled'), 'not-enrolled');
  assert.equal(shownEnrollment(true, 'enrolled'), 'enrolled');
  assert.equal(shownEnrollment(true, 'bogus'), 'not-enrolled');
  const reply = state => ({type: 'status-client', schemaVersion: 1, state});
  assert.equal(enrollmentFromReply(reply('enrolled')), 'enrolled');
  assert.equal(enrollmentFromReply(reply('pending')), 'pending');
  for (const bad of [reply('admin'), {...reply('enrolled'), extra: 1}, {...reply('enrolled'), schemaVersion: 2}, {...reply('enrolled'), type: 'x'}, null, 'enrolled']) assert.equal(enrollmentFromReply(bad), 'unavailable');
});

test('the desktop routes a valid report to its status feature and answers one fixed state word', async () => {
  const seen = [];
  for (const [answer, expected] of [['enrolled', 'enrolled'], ['pending', 'pending'], ['unavailable', 'unavailable'], ['admin', 'unavailable'], [undefined, 'unavailable'], [{state: 'enrolled'}, 'unavailable']]) {
    const f = fixture({enrollStatusClient: async value => { seen.push(value); return answer; }});
    assert.deepEqual(await f.enroll(), {type: 'status-client', schemaVersion: 1, state: expected});
  }
  assert.deepEqual(JSON.parse(JSON.stringify(seen[0])), report());
  assert.ok(Object.isFrozen(seen[0]) && Object.isFrozen(seen[0].counts), 'the feature gets an immutable copy');
});

test('without a status feature, or when it fails, the desktop reports unavailable honestly', async () => {
  assert.deepEqual(await fixture().enroll(), {type: 'status-client', schemaVersion: 1, state: 'unavailable'});
  const broken = fixture({enrollStatusClient: async () => { throw Error('C:\\private\\path'); }});
  const answer = await broken.enroll();
  assert.deepEqual(answer, {type: 'status-client', schemaVersion: 1, state: 'unavailable'});
  assert.ok(!JSON.stringify(answer).includes('private'));
});

test('an unpaired, expired or malformed enrollment is refused before the status feature is reached', async () => {
  let reached = 0;
  const f = fixture({enrollStatusClient: async () => { reached++; return 'enrolled'; }});
  for (const message of [
    {type: 'enroll-status-client', session: 'x'.repeat(43), report: report()}, {type: 'enroll-status-client', session, report: {...report(), extra: 1}}, {type: 'enroll-status-client', session},
    {type: 'enroll-status-client', session, report: report(), extra: true}, {type: 'enroll-status-client', session, report: {...report(), counts: {...report().counts, notes: 'many'}}},
    {type: 'read-lock-state', session, report: report()}, Object.assign(Object.create({report: report()}), {type: 'enroll-status-client', session}),
  ]) await assert.rejects(f.enroll(message), /Unsupported|Pair the browser/);
  f.disconnect();
  await assert.rejects(f.enroll(), /Pair the browser again/);
  assert.equal(reached, 0);
  const lost = fixture({enrollStatusClient: async () => 'enrolled'});
  await assert.rejects(lost.enroll(undefined, () => { throw Error('connection gone'); }), /connection gone/);
});

test('a connection lost during enrollment withholds the answer', async () => {
  let current = {session, expires: 901000};
  const service = createBrowserStatusMediation({getPair: () => current, isUnlocked: () => true, enrollStatusClient: async () => { current = {session, expires: 901000}; return 'enrolled'; }, now: () => 1000});
  await assert.rejects(service.receive(origin, {type: 'enroll-status-client', session, report: report()}, () => {}), /Pair the browser again/);
});

test('native framed enrollment needs the live paired connection and reaches the injected feature', async () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => queueMicrotask(() => { child.emit('exit', 0); child.emit('close', 0); });
  const received = [];
  const broker = createBrowserNativeBroker({config, now: () => 0, hostPath: 'C:\\Fixture\\MaterialFileEncryptor.BrowserHost.exe', authorizePair: async () => true, isUnlocked: () => true, onProposal() {}, enrollStatusClient: async value => { received.push(value); return 'pending'; }, spawnHost: () => child});
  const start = broker.start();
  child.stdout.write(nativeFrame({type: 'ready', aclVerified: true}));
  await start;
  const send = (message, id = connectionId) => new Promise(resolve => { child.stdin.once('data', bytes => resolve(JSON.parse(bytes.subarray(4)).response)); child.stdout.write(nativeFrame({requestId: '22222222-2222-2222-2222-222222222222', connectionId: id, origin, message})); });
  try {
    assert.deepEqual(await send({type: 'enroll-status-client', session, report: report()}), {type: 'error', code: 'HANDOFF_NOT_ACCEPTED'});
    const pair = await send({type: 'pair'});
    assert.equal(pair.type, 'paired');
    assert.deepEqual(await send({type: 'enroll-status-client', session: pair.session, report: report()}), {type: 'status-client', schemaVersion: 1, state: 'pending'});
    assert.equal(received.length, 1);
    assert.equal((await send({type: 'enroll-status-client', session: pair.session, report: {...report(), title: 'secret note'}})).type, 'error');
    assert.equal(received.length, 1);
  } finally { await broker.close(); }
});

test('extension background relays enrollment, validates the report and the answer, and needs a pairing', async () => {
  let listener, receive, nativeResponses = [];
  const sent = [];
  const chrome = {runtime: {id: 'fixture', getURL: p => 'chrome-extension://fixture/' + p, onInstalled: {addListener() {}}, onMessage: {addListener(fn) { listener = fn; }}, connectNative: () => ({onDisconnect: {addListener() {}}, onMessage: {addListener(fn) { receive = fn; }}, disconnect() {}, postMessage(message) { sent.push(message); queueMicrotask(() => receive(message.type === 'pair' ? {type: 'paired', session: 's'.repeat(43)} : nativeResponses.shift())); }})}, contextMenus: {onClicked: {addListener() {}}}};
  const context = vm.createContext({chrome, URL, setTimeout, clearTimeout, queueMicrotask});
  vm.runInContext(await fs.readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8'), context);
  context.deliver = message => new Promise(resolve => listener(message, {id: 'fixture', url: chrome.runtime.getURL('options.html'), frameId: 0}, resolve));
  const send = async message => JSON.parse(JSON.stringify(await vm.runInContext('deliver(' + JSON.stringify(message) + ')', context)));
  assert.deepEqual(await send({type: 'status-client-enroll', report: report()}), {paired: false});
  assert.equal(sent.length, 0);
  await send({type: 'pair'});
  const before = sent.length;
  nativeResponses = [{type: 'status-client', schemaVersion: 1, state: 'enrolled'}];
  assert.deepEqual(await send({type: 'status-client-enroll', report: report()}), {schemaVersion: 1, state: 'enrolled'});
  assert.deepEqual(JSON.parse(JSON.stringify(sent.slice(before).map(item => ({type: item.type, report: item.report})))), [{type: 'enroll-status-client', report: report()}]);
  assert.equal(sent.at(-1).session, 's'.repeat(43));
  for (const bad of [{type: 'status-client', schemaVersion: 1, state: 'root'}, {type: 'status-client', schemaVersion: 1, state: 'enrolled', path: 'C:\\x'}, {type: 'other', schemaVersion: 1, state: 'enrolled'}]) {
    nativeResponses = [bad];
    assert.ok((await send({type: 'status-client-enroll', report: report()})).error);
  }
  const count = sent.length;
  for (const bad of [{type: 'status-client-enroll', report: {...report(), note: 'text'}}, {type: 'status-client-enroll'}, {type: 'status-client-enroll', report: report(), extra: 1}, {type: 'status-client-enroll', report: {...report(), counts: {notes: 1}}}]) assert.ok((await send(bad)).error);
  assert.equal(sent.length, count, 'invalid reports never reach the desktop');
});

test('the status client carries no storage, network or secret handling', async () => {
  for (const file of ['../browser-extension/status-client.js', '../src/main/browser-status-mediation.js']) {
    const source = await fs.readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /localStorage|writeFile|randomBytes|fetch\(|process\.env|child_process|XMLHttpRequest/);
  }
});
