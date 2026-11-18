// The personal wording file must reach every surface: synthetic fixtures only, no private wording.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWholeLabelMapper } from '../src/renderer/wording-labels.js';
import { wordingGate } from '../src/renderer/wording-gate.js';
import { createCelebration } from '../src/renderer/wording-drop.js';
import { parseVocabulary, replaceVocabulary, serializeVocabulary, emptyVocabulary } from '../src/shared/personal-vocabulary.js';
import { loadSettings } from '../src/renderer/preferences.js';

const words = map => JSON.stringify({ schemaVersion: 1, entries: map });
const app = readFileSync(new URL('../src/renderer/app.js', import.meta.url), 'utf8');

test('gate state 1: no local profile was ever set up, so the loaded wording applies at once', () => {
  assert.deepEqual(wordingGate({ profileExists: false, hasWording: true }), { state: 'applied', active: true });
});

test('gate state 2: a locked profile keeps the wording waiting, and unlock applies it immediately', () => {
  assert.deepEqual(wordingGate({ profileExists: true, authenticated: false, hasWording: true }), { state: 'waiting', active: false });
  assert.deepEqual(wordingGate({ profileExists: true, authenticated: true, hasWording: true }), { state: 'applied', active: true });
  assert.deepEqual(wordingGate({ profileExists: true, authenticated: false, hasWording: false }), { state: 'inactive', active: false }, 'nothing loaded, nothing waiting');
});

test('gate state 3: school mode always turns it off, and an unanswered profile check fails closed', () => {
  assert.equal(wordingGate({ school: true, profileExists: false, authenticated: true, hasWording: true }).active, false);
  assert.equal(wordingGate({ profileExists: undefined, hasWording: true }).active, false);
  assert.equal(wordingGate({ profileExists: undefined, authenticated: true, hasWording: true }).active, true);
});

test('the app wires the gate to the profile check, the waiting notice and the Settings status line', () => {
  assert.match(app, /const wordingActive=\(\)=>wordingGateNow\(\)\.active;/);
  assert.match(app, /featureRequest\('access','credentialGet',\{key:'local-profile:v1'\}\)/);
  assert.match(app, /toast\('Unlock your local profile to show your wording'\)/);
  assert.match(app, /Loaded, waiting for unlock\./);
  assert.equal((app.match(/noticeWordingWaiting\(\);/g) || []).length >= 2, true, 'both the drop and the upload explain the waiting state');
  assert.match(app, /queueMicrotask\(\(\)=>\{applyPreferences\(\);void refreshProfileExists\(\);\}\)/, 'unlock re-applies at once');
  assert.match(readFileSync(new URL('../src/renderer/i18n.js', import.meta.url), 'utf8'), /"Unlock your local profile to show your wording":/);
});

test('a label mapped exactly wins in every display language', () => {
  let vocabulary = parseVocabulary(words({ 'Docker Hub': 'Example Registry', 'Personal wording applied': 'Wording is live' })), active = true;
  const mapper = createWholeLabelMapper({ getVocabulary: () => vocabulary, isActive: () => active });
  assert.equal(mapper('Docker Hub'), 'Example Registry');
  assert.equal(mapper('Personal wording applied'), 'Wording is live');
  assert.equal(mapper('Docker Hub drive'), undefined, 'only an exact label; substrings go through the page projection');
  assert.equal(mapper(42), undefined);
  active = false; assert.equal(mapper('Docker Hub'), undefined);
  active = true; vocabulary = emptyVocabulary(); assert.equal(mapper('Docker Hub'), undefined);
  vocabulary = null; assert.equal(mapper('Docker Hub'), undefined, 'a missing vocabulary never throws');
});

test('the translation function is routed through the whole-label mapper', () => {
  assert.match(app, /function t\(source,options\) \{ return mappedWholeLabel\(source\) \?\? translateWorkspace\(source,options\); \}/);
});

test('the celebration headline shows the mapped phrase, and a displayName still wins', () => {
  const mapper = createWholeLabelMapper({ getVocabulary: () => parseVocabulary(words({ 'Personal wording applied': 'Wording is live' })), isActive: () => true });
  const made = [];
  const doc = { body: { append: node => made.push(node) }, createElement: () => ({ dataset: {}, setAttribute() {}, append(child) { this.child = child; }, remove() {} }) };
  const celebration = createCelebration({ doc, neutral: () => mapper('Personal wording applied') ?? 'fallback', reducedMotion: () => true, setTimer: () => 0, clearTimer: () => {} });
  celebration.show(undefined);
  assert.equal(made[0].child.textContent, 'Wording is live');
  celebration.show('Named file');
  assert.equal(made[1].child.textContent, 'Named file');
  assert.match(app, /neutral: \(\) => t\('Personal wording applied', \{ message: true \}\)/);
});

test('substring replacement reaches labels inside longer sentences, and clear restores the original', () => {
  const vocabulary = parseVocabulary(words({ 'Docker Hub': 'Example Registry' }));
  assert.equal(replaceVocabulary('Open a drive from Docker Hub', vocabulary), 'Open a drive from Example Registry');
  assert.equal(replaceVocabulary('Open a drive from Docker Hub', emptyVocabulary()), 'Open a drive from Docker Hub');
});

test('the loaded file persists across a restart, and an invalid file is refused leaving the old wording', () => {
  const store = new Map(), storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const vocabulary = parseVocabulary(words({ 'Docker Hub': 'Example Registry' }));
  storage.setItem('material-drive.preferences.v1', JSON.stringify({ language: 'yue', vocabulary: JSON.parse(serializeVocabulary(vocabulary)) }));
  const restarted = loadSettings(storage);
  assert.equal(restarted.language, 'yue');
  assert.equal(replaceVocabulary('Docker Hub', restarted.vocabulary), 'Example Registry');
  assert.throws(() => parseVocabulary('{not json'), /Invalid|vocabulary/i);
  assert.throws(() => parseVocabulary(words({ 'Docker Hub': 5 })), /Invalid/);
  assert.equal(replaceVocabulary('Docker Hub', restarted.vocabulary), 'Example Registry');
});
