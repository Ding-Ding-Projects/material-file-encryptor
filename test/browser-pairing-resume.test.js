import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createBrowserNativeBroker, nativeFrame} from '../src/main/browser-native-host.js';
import {createNativeMessageDecoder, createBrowserDownloadReceiver} from '../src/main/browser-download-receiver.js';

const origin = `chrome-extension://${'a'.repeat(32)}/`;
const other = `chrome-extension://${'b'.repeat(32)}/`;
const connection1 = '11111111-1111-4111-8111-111111111111';
const connection2 = '22222222-2222-4222-8222-222222222222';
const connection3 = '44444444-4444-4444-8444-444444444444';

async function fixture(options = {}) {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { child.exitCode = 0; child.emit('exit', 0); child.emit('close', 0); };
  let sequence = 0;
  const pending = new Map();
  const counters = {approvals: 0};
  const broker = createBrowserNativeBroker({
    config: {schemaVersion: 1, host: 'org.dingding.material_file_encryptor.downloads', allowedOrigins: [origin], identity: {extensionId: 'a'.repeat(32), packageSha256: '0'.repeat(64), publicKeySha256: '1'.repeat(64)}},
    hostPath: 'C:\\Synthetic\\MaterialFileEncryptor.BrowserHost.exe', spawnHost: () => child,
    authorizePair: async () => { counters.approvals++; return true; }, isUnlocked: () => true, onProposal: () => {},
    readUpdateState: () => ({desktopVersion: '1.0.0', status: {phase: 'idle'}}), ...options,
  });
  const decoder = createNativeMessageDecoder(envelope => { const resolve = pending.get(envelope.requestId); pending.delete(envelope.requestId); resolve?.(envelope.response); });
  child.stdin.on('data', chunk => decoder.push(chunk));
  const start = broker.start();
  child.stdout.write(nativeFrame({type: 'ready', aclVerified: true}));
  await start;
  return {
    broker, child, counters,
    request: (connectionId, message) => new Promise(resolve => {
      const requestId = `33333333-3333-4333-8333-${String(++sequence).padStart(12, '0')}`;
      pending.set(requestId, resolve);
      child.stdout.write(nativeFrame({requestId, connectionId, origin, message}));
    }),
    disconnect: connectionId => child.stdout.write(nativeFrame({type: 'disconnected', connectionId})),
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const usable = async (f, connectionId, session) => (await f.request(connectionId, {type: 'protected-discover', session})).type === 'protected-capabilities';

test('a restarted worker resumes its pairing on a new native port without another desktop prompt', async () => {
  const f = await fixture();
  try {
    const pair = await f.request(connection1, {type: 'pair'});
    assert.equal(pair.type, 'paired');
    assert.equal(f.counters.approvals, 1);
    assert.equal(await usable(f, connection1, pair.session), true);
    f.disconnect(connection1);
    await settle();
    // While detached the session is useless on the old port and without any connection identity.
    assert.equal((await f.request(connection1, {type: 'protected-discover', session: pair.session})).type, 'error');
    await assert.rejects(f.broker.receive(origin, {type: 'protected-discover', session: pair.session}), /Pair the browser again/);
    const resumed = await f.request(connection2, {type: 'resume', session: pair.session});
    assert.equal(resumed.type, 'resumed');
    assert.ok(resumed.expiresInSeconds >= 1 && resumed.expiresInSeconds <= 900);
    assert.equal(f.counters.approvals, 1, 'resume must not prompt');
    assert.equal(await usable(f, connection2, pair.session), true);
    assert.equal(JSON.stringify(resumed).includes(pair.session), false, 'the reply never repeats the grant');
  } finally { await f.broker.close(); }
});

test('resume keeps the original expiry and never extends the pairing', async () => {
  let now = 1000;
  const f = await fixture({now: () => now});
  try {
    const pair = await f.request(connection1, {type: 'pair'});
    f.disconnect(connection1); await settle();
    now += 600000;
    const resumed = await f.request(connection2, {type: 'resume', session: pair.session});
    assert.equal(resumed.type, 'resumed');
    assert.equal(resumed.expiresInSeconds, 300);
    f.disconnect(connection2); await settle();
    now += 300001;
    assert.equal((await f.request(connection3, {type: 'resume', session: pair.session})).type, 'error');
  } finally { await f.broker.close(); }
});

test('a forged, truncated, replaced or never-issued grant is refused', async () => {
  const f = await fixture();
  try {
    const pair = await f.request(connection1, {type: 'pair'});
    f.disconnect(connection1); await settle();
    const forged = pair.session.slice(0, -1) + (pair.session.endsWith('A') ? 'B' : 'A');
    for (const session of [forged, 'A'.repeat(43), pair.session.slice(1), pair.session + 'A', '', 42, null]) {
      assert.equal((await f.request(connection2, {type: 'resume', session})).type, 'error', String(session));
    }
    assert.equal((await f.request(connection2, {type: 'resume', session: pair.session, extra: 1})).type, 'error');
    // The genuine grant still works afterwards: refusals never spend or revoke it.
    assert.equal((await f.request(connection2, {type: 'resume', session: pair.session})).type, 'resumed');
    // A fresh pairing replaces the grant, so the earlier one is refused from then on.
    const second = await f.request(connection2, {type: 'pair'});
    assert.equal(second.type, 'error', 'already paired on this connection');
    f.disconnect(connection2); await settle();
    const repaired = await f.request(connection3, {type: 'pair'});
    assert.equal(repaired.type, 'paired');
    assert.notEqual(repaired.session, pair.session);
    f.disconnect(connection3); await settle();
    assert.equal((await f.request(connection1, {type: 'resume', session: pair.session})).type, 'error');
    assert.equal((await f.request(connection1, {type: 'resume', session: repaired.session})).type, 'resumed');
  } finally { await f.broker.close(); }
});

test('a pairing that was never approved cannot be resumed', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request(connection1, {type: 'resume', session: 'A'.repeat(43)})).type, 'error');
    await assert.rejects(f.broker.receive(origin, {type: 'resume', session: 'A'.repeat(43)}), /connection identity|Pair the browser again/);
  } finally { await f.broker.close(); }
});

test('a grant from another origin is refused', async () => {
  const f = await fixture();
  try {
    const pair = await f.request(connection1, {type: 'pair'});
    f.disconnect(connection1); await settle();
    await assert.rejects(f.broker.receive(other, {type: 'resume', session: pair.session}, connection2), /not allowed/);
  } finally { await f.broker.close(); }
  const receiver = createBrowserDownloadReceiver({allowedOrigins: [origin, other], authorizePair: async () => true, isUnlocked: () => true, onProposal: () => {}});
  const session = (await receiver.receive(origin, {type: 'pair'})).session;
  assert.equal(receiver.holds(origin, session), true);
  assert.equal(receiver.holds(other, session), false);
  receiver.close();
});

test('desktop lock, explicit disconnect, update preparation and exit all discard a resumable grant', async () => {
  for (const cause of ['lock', 'revoke', 'unpair', 'close']) {
    let unlocked = true;
    const f = await fixture({isUnlocked: () => unlocked});
    try {
      const pair = await f.request(connection1, {type: 'pair'});
      f.disconnect(connection1); await settle();
      if (cause === 'lock') { unlocked = false; assert.equal((await f.request(connection2, {type: 'resume', session: pair.session})).type, 'error'); unlocked = true; }
      if (cause === 'revoke') f.broker.revoke();
      if (cause === 'close') await f.broker.close();
      if (cause === 'unpair') {
        const live = await f.request(connection2, {type: 'resume', session: pair.session});
        assert.equal(live.type, 'resumed');
        assert.equal((await f.request(connection2, {type: 'unpair', session: pair.session})).type, 'unpaired');
        assert.equal(await usable(f, connection2, pair.session), false);
      }
      if (cause !== 'close') assert.equal((await f.request(connection3, {type: 'resume', session: pair.session})).type, 'error', cause);
      else await assert.rejects(f.broker.receive(origin, {type: 'resume', session: pair.session}, connection3));
    } finally { await f.broker.close(); }
  }
});

test('revoking a live pairing also removes the session a later port would present', async () => {
  const f = await fixture();
  try {
    const pair = await f.request(connection1, {type: 'pair'});
    f.broker.revoke();
    assert.equal(await usable(f, connection1, pair.session), false);
    f.disconnect(connection1); await settle();
    assert.equal((await f.request(connection2, {type: 'resume', session: pair.session})).type, 'error');
  } finally { await f.broker.close(); }
});

test('only the holder of the session can end it, and only on its own live port', async () => {
  const f = await fixture();
  try {
    const pair = await f.request(connection1, {type: 'pair'});
    assert.equal((await f.request(connection1, {type: 'unpair', session: 'A'.repeat(43)})).type, 'error');
    assert.equal((await f.request(connection2, {type: 'unpair', session: pair.session})).type, 'error', 'a different port may not end it');
    assert.equal(await usable(f, connection1, pair.session), true);
  } finally { await f.broker.close(); }
});

test('a resume on a new port takes over from a stale earlier port', async () => {
  const f = await fixture();
  try {
    const pair = await f.request(connection1, {type: 'pair'});
    assert.equal((await f.request(connection2, {type: 'resume', session: pair.session})).type, 'resumed');
    assert.equal(await usable(f, connection1, pair.session), false, 'the earlier port no longer has the pairing');
    assert.equal(await usable(f, connection2, pair.session), true);
    f.disconnect(connection1); await settle();
    assert.equal(await usable(f, connection2, pair.session), true, 'a late disconnect of the stale port changes nothing');
  } finally { await f.broker.close(); }
});

test('losing the port still withdraws prompts, grants and workflow authority bound to that port', async () => {
  let revoked = 0;
  const f = await fixture({revokeProfileAuthority: () => { revoked++; }});
  try {
    const pair = await f.request(connection1, {type: 'pair'});
    const before = revoked;
    f.disconnect(connection1); await settle();
    assert.ok(revoked > before);
    const resumed = await f.request(connection2, {type: 'resume', session: pair.session});
    assert.equal(resumed.type, 'resumed');
  } finally { await f.broker.close(); }
});
