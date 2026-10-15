import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {normalizePairingCode,validPairingCode,scanSupported,createPairingScanner,SCAN_TIMEOUT_MS} from '../browser-extension/pairing-code.js';

const CODE = 'ABCD2345';
function fakeScope({ detect, supported = true, failCamera = false } = {}) {
  const tracks = [];
  const listeners = { pagehide: [], visibilitychange: [] };
  const state = { opened: 0, video: null };
  class BarcodeDetector {
    constructor(options) { assert.deepEqual(options, { formats: ['qr_code'] }); }
    async detect() { return detect ? detect() : []; }
  }
  const scope = {
    ...(supported ? { BarcodeDetector } : {}),
    navigator: { mediaDevices: { async getUserMedia(constraints) {
      assert.equal(constraints.audio, false);
      state.opened++;
      if (failCamera) throw new Error('denied');
      const track = { stopped: false, stop() { this.stopped = true; } };
      tracks.push(track);
      return { getTracks: () => [track] };
    } } },
    document: { visibilityState: 'visible', addEventListener(name, fn) { listeners[name]?.push(fn); }, removeEventListener(name, fn) { const list = listeners[name]; list?.splice(list.indexOf(fn), 1); } },
    addEventListener(name, fn) { listeners[name]?.push(fn); },
    removeEventListener(name, fn) { const list = listeners[name]; list?.splice(list.indexOf(fn), 1); },
  };
  const video = { hidden: true, srcObject: null, videoWidth: 640, videoHeight: 480, paused: false, async play() {}, pause() { this.paused = true; } };
  return { scope, video, tracks, listeners, state };
}
function timers() {
  const queue = [];
  const clock = { at: 0 };
  return {
    setTimer: fn => { queue.push(fn); return queue.length; },
    clearTimer: id => { queue[id - 1] = null; },
    now: () => clock.at,
    clock,
    async run() { const next = queue.splice(0).filter(Boolean); for (const fn of next) await fn(); },
    get pending() { return queue.filter(Boolean).length; },
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('typed codes are normalized to the exact desktop alphabet and anything else is invalid', () => {
  assert.equal(normalizePairingCode('abcd 2345'), CODE);
  assert.equal(normalizePairingCode(' ABCD-2345 '), CODE);
  assert.equal(validPairingCode(CODE), true);
  for (const bad of ['', 'ABCD234', 'ABCD23456', 'ABCD234O', 'ABCD2341', 'ABCD234L', 'ABCD234I', 'ABCD234!', undefined, null, 12345678]) assert.equal(validPairingCode(normalizePairingCode(bad)), false);
  assert.equal(normalizePairingCode('x'.repeat(100)), '');
});

test('scan support needs both BarcodeDetector and getUserMedia', () => {
  assert.equal(scanSupported(fakeScope().scope), true);
  assert.equal(scanSupported(fakeScope({ supported: false }).scope), false);
  assert.equal(scanSupported({ BarcodeDetector() {}, navigator: {} }), false);
});

test('the camera is not opened until start is called', async () => {
  const f = fakeScope();
  const t = timers();
  createPairingScanner({ scope: f.scope, video: f.video, onCode() {}, setTimer: t.setTimer, clearTimer: t.clearTimer, now: t.now });
  await settle();
  assert.equal(f.state.opened, 0);
  assert.equal(t.pending, 0);
});

test('a missing BarcodeDetector reports that scanning is unsupported and opens no camera', async () => {
  const f = fakeScope({ supported: false });
  const states = [];
  const scanner = createPairingScanner({ scope: f.scope, video: f.video, onCode() {}, onState: state => states.push(state) });
  await scanner.start();
  assert.deepEqual(states, ['unsupported']);
  assert.equal(f.state.opened, 0);
  assert.equal(scanner.active, false);
});

test('a found code stops every track, hides the preview and is delivered once', async () => {
  let frames = 0;
  const f = fakeScope({ detect: () => (++frames < 2 ? [] : [{ rawValue: CODE }]) });
  const t = timers();
  const codes = [];
  const states = [];
  const scanner = createPairingScanner({ scope: f.scope, video: f.video, onCode: code => codes.push(code), onState: state => states.push(state), setTimer: t.setTimer, clearTimer: t.clearTimer, now: t.now });
  await scanner.start();
  assert.equal(f.state.opened, 1);
  assert.equal(f.video.hidden, false);
  await t.run(); await t.run(); await t.run();
  assert.deepEqual(codes, [CODE]);
  assert.ok(f.tracks.every(track => track.stopped));
  assert.equal(f.video.srcObject, null);
  assert.equal(f.video.hidden, true);
  assert.equal(scanner.active, false);
  assert.deepEqual(states.slice(-1), ['found']);
  assert.equal(t.pending, 0);
});

test('a scanned value that is not a pairing code is ignored and scanning continues', async () => {
  const f = fakeScope({ detect: () => [{ rawValue: 'https://example.com/?x=1' }, { rawValue: 'otpauth://totp/x' }, { rawValue: 'ABCD2340' }] });
  const t = timers();
  const codes = [];
  const scanner = createPairingScanner({ scope: f.scope, video: f.video, onCode: code => codes.push(code), setTimer: t.setTimer, clearTimer: t.clearTimer, now: t.now });
  await scanner.start();
  await t.run(); await t.run();
  assert.deepEqual(codes, []);
  assert.equal(scanner.active, true);
  scanner.stop();
});

test('cancel stops every track', async () => {
  const f = fakeScope();
  const t = timers();
  const states = [];
  const scanner = createPairingScanner({ scope: f.scope, video: f.video, onCode() {}, onState: state => states.push(state), setTimer: t.setTimer, clearTimer: t.clearTimer, now: t.now });
  await scanner.start();
  scanner.stop();
  assert.ok(f.tracks.every(track => track.stopped));
  assert.equal(states.at(-1), 'stopped');
  assert.equal(t.pending, 0);
});

test('a denied or failing camera stops cleanly and says so', async () => {
  const f = fakeScope({ failCamera: true });
  const states = [];
  const scanner = createPairingScanner({ scope: f.scope, video: f.video, onCode() {}, onState: state => states.push(state) });
  await scanner.start();
  assert.equal(states.at(-1), 'error');
  assert.equal(scanner.active, false);
});

test('a detector failure stops every track', async () => {
  const f = fakeScope({ detect: () => { throw new Error('detector failed'); } });
  const t = timers();
  const states = [];
  const scanner = createPairingScanner({ scope: f.scope, video: f.video, onCode() {}, onState: state => states.push(state), setTimer: t.setTimer, clearTimer: t.clearTimer, now: t.now });
  await scanner.start();
  await t.run();
  assert.equal(states.at(-1), 'error');
  assert.ok(f.tracks.every(track => track.stopped));
});

test('the camera stops by itself after the scan time limit', async () => {
  const f = fakeScope();
  const t = timers();
  const states = [];
  const scanner = createPairingScanner({ scope: f.scope, video: f.video, onCode() {}, onState: state => states.push(state), setTimer: t.setTimer, clearTimer: t.clearTimer, now: t.now });
  await scanner.start();
  t.clock.at = SCAN_TIMEOUT_MS;
  await t.run();
  assert.equal(states.at(-1), 'timeout');
  assert.ok(f.tracks.every(track => track.stopped));
});

test('hiding the tab and closing the page stop the camera', async () => {
  for (const event of ['visibilitychange', 'pagehide']) {
    const f = fakeScope();
    const t = timers();
    const scanner = createPairingScanner({ scope: f.scope, video: f.video, onCode() {}, setTimer: t.setTimer, clearTimer: t.clearTimer, now: t.now });
    await scanner.start();
    if (event === 'visibilitychange') f.scope.document.visibilityState = 'hidden';
    for (const listener of f.listeners[event]) listener();
    assert.ok(f.tracks.every(track => track.stopped), event);
    assert.equal(scanner.active, false);
  }
});

test('stopping while the camera is still opening releases the stream that arrives late', async () => {
  const f = fakeScope();
  const original = f.scope.navigator.mediaDevices.getUserMedia;
  let release;
  f.scope.navigator.mediaDevices.getUserMedia = constraints => new Promise(resolve => { release = () => resolve(original(constraints)); });
  const scanner = createPairingScanner({ scope: f.scope, video: f.video, onCode() {} });
  const starting = scanner.start();
  scanner.stop();
  release();
  await starting;
  await settle();
  assert.ok(f.tracks.length === 1 && f.tracks.every(track => track.stopped));
  assert.equal(f.video.srcObject, null);
});

test('options and background send the code once, keep nothing and add no storage or network', async () => {
  const options = await fs.readFile(new URL('../browser-extension/options.js', import.meta.url), 'utf8');
  const background = await fs.readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8');
  const scanner = await fs.readFile(new URL('../browser-extension/pairing-code.js', import.meta.url), 'utf8');
  assert.match(options, /\$\('pair-code'\)\.value=''/);
  assert.match(options, /message=\{type,code:entered\}/);
  assert.equal(/storage|localStorage|sessionStorage|indexedDB|fetch\(/.test(scanner), false);
  assert.equal(/code/.test((background.match(/chrome\.storage[^;]*;/g) || []).join('')), false);
  assert.equal(/innerHTML|insertAdjacentHTML/.test(scanner), false);
});
