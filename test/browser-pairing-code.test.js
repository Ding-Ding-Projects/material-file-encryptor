import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createPairingCodes,PAIRING_ALPHABET,PAIRING_CODE_LENGTH,PAIRING_LIFETIME_MS,PAIRING_MAX_WRONG} from '../src/main/browser-pairing-code.js';
import {createBrowserDownloadReceiver} from '../src/main/browser-download-receiver.js';
import {createBrowserNativeBroker,createBrowserHandoffLifecycle} from '../src/main/browser-native-host.js';

const origin='chrome-extension://'+'a'.repeat(32)+'/';
const config={schemaVersion:1,host:'org.dingding.material_file_encryptor.downloads',allowedOrigins:[origin],identity:{extensionId:'a'.repeat(32),packageSha256:'0'.repeat(64),publicKeySha256:'1'.repeat(64)}};
const clock=(start=1000)=>{const value={at:start};return{value,now:()=>value.at};};

test('the alphabet leaves out every easily confused character', () => {
  assert.equal(PAIRING_CODE_LENGTH, 8);
  for (const forbidden of ['0', 'O', '1', 'I', 'L']) assert.equal(PAIRING_ALPHABET.includes(forbidden), false);
  assert.equal(new Set(PAIRING_ALPHABET).size, PAIRING_ALPHABET.length);
  assert.equal(PAIRING_LIFETIME_MS, 120000);
});

test('issued codes use only the alphabet, expire in two minutes and report no secret beyond the code', () => {
  const time = clock();
  const codes = createPairingCodes({ now: time.now });
  for (let index = 0; index < 50; index++) {
    const issued = codes.issue();
    assert.match(issued.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    assert.equal(issued.expiresAt, time.value.at + 120000);
    assert.equal(issued.expiresInSeconds, 120);
    assert.deepEqual(Object.keys(issued).sort(), ['code', 'expiresAt', 'expiresInSeconds']);
  }
});

test('the generator draws from the cryptographic source and never from Math.random', async () => {
  const source = await fs.readFile(new URL('../src/main/browser-pairing-code.js', import.meta.url), 'utf8');
  assert.match(source, /import \{randomInt,timingSafeEqual\} from 'node:crypto'/);
  assert.equal(/Math\.random/.test(source), false);
  const draws = [];
  const codes = createPairingCodes({ random: max => { draws.push(max); return draws.length % max; } });
  codes.issue();
  assert.equal(draws.length, 8);
  assert.ok(draws.every(max => max === PAIRING_ALPHABET.length));
  const real = new Set();
  const live = createPairingCodes();
  for (let index = 0; index < 200; index++) real.add(live.issue().code);
  assert.ok(real.size > 195, 'two hundred real codes should almost never repeat');
});

test('only one code is active: a new one replaces the old', () => {
  const codes = createPairingCodes();
  const first = codes.issue().code;
  const second = codes.issue().code;
  assert.notEqual(first, second);
  assert.equal(codes.verify(first), false);
  assert.equal(codes.verify(second), true);
});

test('a code expires after two minutes and stays unusable', () => {
  const time = clock();
  const codes = createPairingCodes({ now: time.now });
  const { code } = codes.issue();
  time.value.at += PAIRING_LIFETIME_MS - 1;
  assert.equal(codes.verify(code), true);
  time.value.at += 1;
  assert.equal(codes.verify(code), false);
  assert.equal(codes.consume(code), false);
  assert.deepEqual(codes.status(), { active: false });
});

test('a code is single use: consuming it clears it', () => {
  const codes = createPairingCodes();
  const { code } = codes.issue();
  assert.equal(codes.consume(code), true);
  assert.equal(codes.verify(code), false);
  assert.equal(codes.consume(code), false);
});

test('five wrong codes in a row clear the active code, even before the right one arrives', () => {
  const codes = createPairingCodes();
  const { code } = codes.issue();
  const wrong = code[0] === 'A' ? 'BBBBBBBB' : 'AAAAAAAA';
  for (let attempt = 1; attempt < PAIRING_MAX_WRONG; attempt++) assert.equal(codes.verify(wrong), false);
  assert.equal(codes.status().active, true);
  assert.equal(codes.verify(wrong), false);
  assert.equal(codes.status().active, false);
  assert.equal(codes.verify(code), false);
});

test('malformed candidates are wrong without comparing unequal lengths', () => {
  const codes = createPairingCodes();
  const { code } = codes.issue();
  for (const candidate of [undefined, null, 12345678, '', 'short', code + 'X', code.toLowerCase(), '0O1IL000', { code }, [code]]) assert.equal(codes.verify(candidate), false);
  assert.equal(codes.status().active, false, 'ten bad attempts used up the code');
});

test('clear forgets the code', () => {
  const codes = createPairingCodes();
  const { code } = codes.issue();
  codes.clear();
  assert.equal(codes.verify(code), false);
  assert.equal(codes.status().active, false);
});

function receiverFixture({ approve = true, locked = { value: false } } = {}) {
  const prompts = [];
  const codes = createPairingCodes();
  const receiver = createBrowserDownloadReceiver({
    allowedOrigins: [origin], pairingCodes: codes, isUnlocked: () => !locked.value, onProposal() {},
    authorizePair: async context => { prompts.push(context); return approve; },
  });
  return { receiver, codes, prompts, locked };
}

test('pairing without a code keeps the existing flow and prompt context', async () => {
  const { receiver, prompts } = receiverFixture();
  const reply = await receiver.receive(origin, { type: 'pair' });
  assert.equal(reply.type, 'paired');
  assert.deepEqual(prompts, [{ origin }]);
});

test('a valid code still needs approval, tells the prompt a code matched, and is consumed on approval', async () => {
  const { receiver, codes, prompts } = receiverFixture();
  const { code } = codes.issue();
  const reply = await receiver.receive(origin, { type: 'pair', code });
  assert.equal(reply.type, 'paired');
  assert.deepEqual(prompts, [{ origin, codeMatched: true }]);
  assert.equal(codes.status().active, false);
  assert.equal(JSON.stringify(reply).includes(code), false);
});

test('a rejected approval does not consume the code and the reply never carries it', async () => {
  const { receiver, codes, prompts } = receiverFixture({ approve: false });
  const { code } = codes.issue();
  await assert.rejects(receiver.receive(origin, { type: 'pair', code }), error => { assert.equal(error.message.includes(code), false); return /not approved/.test(error.message); });
  assert.equal(prompts.length, 1);
  assert.equal(codes.status().active, true);
});

test('a wrong, expired, used or missing code is refused before any prompt', async () => {
  const time = clock();
  const prompts = [];
  const codes = createPairingCodes({ now: time.now });
  const receiver = createBrowserDownloadReceiver({ allowedOrigins: [origin], pairingCodes: codes, isUnlocked: () => true, onProposal() {}, authorizePair: async context => { prompts.push(context); return true; }, now: time.now });
  const { code } = codes.issue();
  const wrong = code[0] === 'A' ? 'BBBBBBBB' : 'AAAAAAAA';
  await assert.rejects(receiver.receive(origin, { type: 'pair', code: wrong }), /code was not accepted/);
  time.value.at += PAIRING_LIFETIME_MS;
  await assert.rejects(receiver.receive(origin, { type: 'pair', code }), /code was not accepted/);
  const fresh = codes.issue().code;
  await receiver.receive(origin, { type: 'pair', code: fresh });
  receiver.revoke();
  await assert.rejects(receiver.receive(origin, { type: 'pair', code: fresh }), /code was not accepted/);
  await assert.rejects(receiver.receive(origin, { type: 'pair', code: 'ZZZZZZZZ' }), /code was not accepted/);
  assert.equal(prompts.length, 1, 'only the one valid code reached a prompt');
});

test('five wrong codes in a row clear the active code so the right one no longer works', async () => {
  const { receiver, codes, prompts } = receiverFixture();
  const { code } = codes.issue();
  const wrong = code[0] === 'A' ? 'BBBBBBBB' : 'AAAAAAAA';
  for (let attempt = 0; attempt < PAIRING_MAX_WRONG; attempt++) await assert.rejects(receiver.receive(origin, { type: 'pair', code: wrong }), /code was not accepted/);
  await assert.rejects(receiver.receive(origin, { type: 'pair', code }), /code was not accepted/);
  assert.equal(prompts.length, 0);
});

test('a supplied code with no code service configured is refused without a prompt', async () => {
  const prompts = [];
  const receiver = createBrowserDownloadReceiver({ allowedOrigins: [origin], isUnlocked: () => true, onProposal() {}, authorizePair: async context => { prompts.push(context); return true; } });
  await assert.rejects(receiver.receive(origin, { type: 'pair', code: 'ABCDEFGH' }), /code was not accepted/);
  assert.equal(prompts.length, 0);
});

test('extra pair fields are still refused', async () => {
  const { receiver, codes } = receiverFixture();
  const { code } = codes.issue();
  await assert.rejects(receiver.receive(origin, { type: 'pair', code, extra: 1 }), /Unsupported/);
  await assert.rejects(receiver.receive(origin, { type: 'pair', other: code }), /Unsupported/);
});

test('locking the desktop during approval clears the code', async () => {
  const locked = { value: false };
  const codes = createPairingCodes();
  const receiver = createBrowserDownloadReceiver({ allowedOrigins: [origin], pairingCodes: codes, isUnlocked: () => !locked.value, onProposal() {}, authorizePair: async () => { locked.value = true; return true; } });
  const { code } = codes.issue();
  await assert.rejects(receiver.receive(origin, { type: 'pair', code }), /Unlock/);
  assert.equal(codes.status().active, false);
});

test('closing the receiver clears the code', () => {
  const { receiver, codes } = receiverFixture();
  codes.issue();
  receiver.close();
  assert.equal(codes.status().active, false);
});

test('the broker accepts a code on the first pair message and the approval prompt still decides', async () => {
  const codes = createPairingCodes();
  const prompts = [];
  const broker = createBrowserNativeBroker({ config, pairingCodes: codes, isUnlocked: () => true, onProposal() {}, authorizePair: async context => { prompts.push(context); return true; } });
  const { code } = codes.issue();
  const reply = await broker.receive(origin, { type: 'pair', code });
  assert.equal(reply.type, 'paired');
  assert.deepEqual(prompts, [{ origin, codeMatched: true }]);
  assert.equal(JSON.stringify(reply).includes(code), false);
  await broker.close();
});

test('a new connection revokes sessions but does not spend the code it is about to present', async () => {
  const codes = createPairingCodes();
  const broker = createBrowserNativeBroker({ config, pairingCodes: codes, isUnlocked: () => true, onProposal() {}, authorizePair: async () => true });
  codes.issue();
  broker.revoke();
  assert.equal(codes.status().active, true);
  await broker.close();
  assert.equal(codes.status().active, false);
});

test('the lifecycle clears the code on revoke and on close', async () => {
  const codes = createPairingCodes();
  const lifecycle = createBrowserHandoffLifecycle({ hostDirectory: 'C:\\Owned', pairingCodes: codes, platform: 'linux', isUnlocked: () => true, authorizePair: async () => true, onProposal() {} });
  codes.issue();
  lifecycle.revoke();
  assert.equal(codes.status().active, false);
  codes.issue();
  await lifecycle.close();
  assert.equal(codes.status().active, false);
});

test('the main process issues codes only for an unlocked drive with a running receiver and never logs them', async () => {
  const source = await fs.readFile(new URL('../src/main/main.js', import.meta.url), 'utf8');
  assert.match(source, /const pairingCodes=createPairingCodes\(\)/);
  assert.match(source, /createBrowserHandoffLifecycle\(\{pairingCodes,/);
  assert.match(source, /Unlock the drive before pairing a browser\./);
  assert.match(source, /The extension entered the code shown on this desktop\./);
  const pairing = source.slice(source.indexOf('function browserPairingRequest'), source.indexOf('async function featureRequest'));
  assert.equal(/console\.|log\(|notify/.test(pairing), false);
});
