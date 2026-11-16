import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_CUE_EVENT, CUES, CUE_NAMES, DEFAULT_SOUND_SETTINGS, PLAY, createActionSounds, inQuietHours, normalizeSoundSettings, requestCue,
} from '../src/shared/surface/action-sounds.js';

function audioFixture({ throwOnCreate = false } = {}) {
  const log = { contexts: 0, started: [], closed: 0, peaks: [] };
  class Context {
    constructor() { if (throwOnCreate) throw new Error('no audio device'); log.contexts++; this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createOscillator() { return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start(at) { log.started.push(at); }, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime(value) { log.peaks.push(value); } }, connect() {}, disconnect() {} }; }
    close() { log.closed++; }
  }
  return { Context, log };
}

test('every required cue is synthesized locally from notes and none loads a resource', () => {
  for (const name of ['success', 'warning', 'error', 'unlock', 'lock', 'upload', 'sync', 'delete', 'copy', 'toggle', 'installSuccess', 'installError', 'celebration']) {
    assert.ok(CUE_NAMES.includes(name), name);
    assert.ok(CUES[name].length > 0 && CUES[name].every(note => (Array.isArray(note.f) ? note.f : [note.f]).every(Number.isFinite) && note.dur > 0 && note.dur < 1), name);
  }
});

test('sound effects default on and a cue plays once', () => {
  const { Context, log } = audioFixture(); const now = 1000;
  const sounds = createActionSounds({ Context, clock: () => now });
  assert.equal(DEFAULT_SOUND_SETTINGS.enabled, true);
  assert.deepEqual(sounds.play('success'), { played: true, reason: PLAY.PLAYED });
  assert.equal(log.contexts, 1);
  assert.equal(log.started.length, CUES.success.length);
});

test('the switch, mute and a zero volume keep every cue silent and create no audio context', () => {
  const { Context, log } = audioFixture();
  const sounds = createActionSounds({ Context, settings: { enabled: false } });
  assert.equal(sounds.play('success').reason, PLAY.DISABLED);
  sounds.configure({ enabled: true, muted: true });
  assert.equal(sounds.play('success').reason, PLAY.MUTED);
  sounds.configure({ muted: false, volume: 0 });
  assert.equal(sounds.play('success').reason, PLAY.MUTED);
  assert.equal(log.contexts, 0);
});

test('volume scales the peak gain and reduced sound plays a single quieter note', () => {
  const loud = audioFixture(), quiet = audioFixture(), reduced = audioFixture();
  createActionSounds({ Context: loud.Context, settings: { volume: 100 } }).play('celebration');
  createActionSounds({ Context: quiet.Context, settings: { volume: 20 } }).play('celebration');
  const sounds = createActionSounds({ Context: reduced.Context, settings: { volume: 100, reducedSound: true } });
  sounds.play('celebration');
  const top = log => Math.max(...log.peaks.filter(value => value > 0.001));
  assert.ok(top(loud.log) > top(quiet.log) * 3);
  assert.equal(reduced.log.started.length, 1);
  assert.ok(top(reduced.log) < top(loud.log));
});

test('quiet hours silence cues, including a window that crosses midnight', () => {
  const quiet = { enabled: true, start: '22:00', end: '07:00' };
  assert.equal(inQuietHours(quiet, new Date(2026, 0, 1, 23, 30)), true);
  assert.equal(inQuietHours(quiet, new Date(2026, 0, 2, 6, 59)), true);
  assert.equal(inQuietHours(quiet, new Date(2026, 0, 2, 7, 0)), false);
  assert.equal(inQuietHours({ ...quiet, enabled: false }, new Date(2026, 0, 1, 23, 30)), false);
  const { Context, log } = audioFixture();
  const sounds = createActionSounds({ Context, settings: { quietHours: quiet }, date: () => new Date(2026, 0, 1, 23, 30) });
  assert.equal(sounds.play('error').reason, PLAY.QUIET);
  assert.equal(log.contexts, 0);
});

test('cues never overlap into noise: same cue is debounced and a quieter cue yields to a louder one', () => {
  const { Context } = audioFixture(); let now = 1000;
  const sounds = createActionSounds({ Context, clock: () => now });
  assert.equal(sounds.play('celebration').played, true);
  now += 10;
  assert.equal(sounds.play('celebration').reason, PLAY.DEBOUNCED);
  assert.equal(sounds.play('toggle').reason, PLAY.BUSY);
  assert.equal(sounds.play('success').reason, PLAY.BUSY);
  now += 5000;
  assert.equal(sounds.play('toggle').played, true);
  now += 5;
  assert.equal(sounds.play('error').played, true, 'a higher-priority cue may replace a quieter one');
});

test('a playback failure never throws and never repeats the failing attempt', () => {
  const { Context } = audioFixture({ throwOnCreate: true });
  const sounds = createActionSounds({ Context });
  assert.deepEqual(sounds.play('success'), { played: false, reason: PLAY.FAILED });
  assert.equal(sounds.play('success').reason, PLAY.UNAVAILABLE);
  sounds.configure({ volume: 50 });
  assert.equal(sounds.play('warning').reason, PLAY.FAILED, 'a settings change allows one fresh attempt');
  assert.equal(createActionSounds({ Context: undefined }).play('success').reason, PLAY.UNAVAILABLE);
  assert.equal(createActionSounds({ Context }).play('not-a-cue').reason, PLAY.UNKNOWN);
});

test('untrusted stored settings are clamped to a safe complete object', () => {
  assert.deepEqual(normalizeSoundSettings(null), normalizeSoundSettings({}));
  const clean = normalizeSoundSettings({ enabled: 'yes', volume: 900, muted: 1, quietHours: { enabled: true, start: '99:99', end: '06:15' } });
  assert.equal(clean.enabled, true);
  assert.equal(clean.volume, 100);
  assert.equal(clean.muted, false);
  assert.equal(clean.quietHours.start, '22:00');
  assert.equal(clean.quietHours.end, '06:15');
  assert.equal(normalizeSoundSettings({ volume: -4 }).volume, 0);
});

test('turning sounds off silences anything still sounding and destroy releases the context', () => {
  const { Context, log } = audioFixture();
  const sounds = createActionSounds({ Context });
  sounds.play('celebration');
  sounds.configure({ enabled: false });
  assert.equal(sounds.play('success').reason, PLAY.DISABLED);
  sounds.configure({ enabled: true });
  sounds.play('success');
  sounds.destroy();
  assert.equal(log.closed, 1);
});

test('features request a cue through a DOM event and a missing target is harmless', () => {
  globalThis.CustomEvent ??= class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  const seen = [];
  requestCue({ dispatchEvent: event => seen.push([event.type, event.detail.cue]) }, 'copy');
  assert.deepEqual(seen, [[ACTION_CUE_EVENT, 'copy']]);
  assert.doesNotThrow(() => requestCue(null, 'copy'));
});
