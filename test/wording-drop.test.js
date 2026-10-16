import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  CELEBRATION, createCelebration, createNotice, dragCarriesFiles, headlineFrom, installWordingDrop, isTextDropTarget, pickDroppedFile,
} from '../src/renderer/wording-drop.js';
import { createVocabularyStore, parseVocabulary as parseDesktop, serializeVocabulary } from '../src/shared/personal-vocabulary.js';
import { parseVocabulary as parseExtension, saveVocabulary, readVocabulary } from '../browser-extension/vocabulary.js';
import { entriesFor } from '../browser-extension/vocabulary-boundary.js';

// ---- a tiny document: just enough surface for the module, with controllable timers ----
class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attrs = {}; this.parent = null; this.className = ''; this.textContent = ''; this.focusCalls = 0; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; } }
  focus() { this.focusCalls++; }
}
class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, handler) { (this.listeners.get(name) ?? this.listeners.set(name, new Set()).get(name)).add(handler); }
  removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler); }
  async fire(name, event) { for (const handler of [...(this.listeners.get(name) ?? [])]) await handler(event); return event; }
}
function environment() {
  const view = new Target(), body = new Node('body');
  const doc = { body, defaultView: view, createElement: tag => new Node(tag) };
  let now = 0, next = 1; const timers = new Map();
  const setTimer = (fn, ms) => { const id = next++; timers.set(id, { fn, at: now + ms }); return id; };
  const clearTimer = id => timers.delete(id);
  const advance = ms => { const end = now + ms; for (;;) { const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; now = due[1].at; timers.delete(due[0]); due[1].fn(); } now = end; };
  return { view, doc, body, setTimer, clearTimer, advance, timers };
}
const file = (name, text, size = text.length) => ({ name, size, text: async () => text });
const dropEvent = (files, { types = ['Files'], target = new Node('div') } = {}) => ({ dataTransfer: { types, files, dropEffect: '' }, target, composedPath: () => [target], relatedTarget: null, prevented: false, preventDefault() { this.prevented = true; } });
const fileOf = (entries, extra = {}) => JSON.stringify({ schemaVersion: 1, entries, ...extra });
const memory = () => { const values = new Map(); return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };

function desktopSetup({ reduced = false } = {}) {
  const env = environment(), storage = memory(), store = createVocabularyStore(storage, 'wording'), refusals = [];
  const celebration = createCelebration({ doc: env.doc, neutral: () => 'Personal wording applied', reducedMotion: () => reduced, setTimer: env.setTimer, clearTimer: env.clearTimer });
  const drop = installWordingDrop({
    doc: env.doc, maxBytes: 256 * 1024, celebration, overlayText: () => 'Drop your wording file to apply it',
    apply: source => ({ name: store.replace(source).vocabulary.displayName }), refuse: (code, error) => refusals.push([code, error?.message]),
  });
  return { ...env, storage, store, refusals, celebration, drop };
}
const celebrationNode = env => env.body.children.find(node => node.className === 'wording-celebration');

test('a valid drop applies the wording and persists it the same way as an upload', async () => {
  const s = desktopSetup();
  const event = await s.view.fire('drop', dropEvent([file('words.json', fileOf({ Files: 'Stash' }, { displayName: 'Team words' }))]));
  assert.equal(event.prevented, true);
  assert.deepEqual(s.store.current.replacements, [{ from: 'Files', to: 'Stash' }]);
  assert.equal(s.store.persisted, true);
  assert.equal(s.storage.getItem('wording'), serializeVocabulary(s.store.current));
  assert.equal(createVocabularyStore(s.storage, 'wording').current.replacements[0].to, 'Stash');
  assert.deepEqual(s.refusals, []);
  assert.equal(celebrationNode(s).children[0].textContent, 'Team words');
});

test('an invalid drop is refused and nothing changes', async () => {
  const s = desktopSetup();
  await s.view.fire('drop', dropEvent([file('words.json', fileOf({ Files: 'Stash' }))]));
  const before = s.storage.getItem('wording');
  s.celebration.dismiss();
  await s.view.fire('drop', dropEvent([file('bad.json', '{"schemaVersion":1,"entries":{"a":')]));
  await s.view.fire('drop', dropEvent([file('bad.json', fileOf({ a: 'b' }, { displayName: 'x'.repeat(41) }))]));
  assert.deepEqual(s.refusals.map(([code]) => code), ['invalid', 'invalid']);
  assert.equal(s.storage.getItem('wording'), before);
  assert.deepEqual(s.store.current.replacements, [{ from: 'Files', to: 'Stash' }]);
  assert.equal(celebrationNode(s), undefined);
});

test('only one small .json file is accepted', async () => {
  const s = desktopSetup(), good = file('a.json', fileOf({ a: 'b' }));
  await s.view.fire('drop', dropEvent([good, good]));
  await s.view.fire('drop', dropEvent([file('a.txt', fileOf({ a: 'b' }))]));
  await s.view.fire('drop', dropEvent([file('a.json', fileOf({ a: 'b' }), 256 * 1024 + 1)]));
  await s.view.fire('drop', dropEvent([]));
  assert.deepEqual(s.refusals.map(([code]) => code), ['count', 'type', 'size', 'count']);
  assert.deepEqual(s.store.current.replacements, []);
  assert.deepEqual(pickDroppedFile({ files: [file('A.JSON', '{}')] }, 10).file.name, 'A.JSON');
});

test('a drag with no files is ignored', async () => {
  const s = desktopSetup();
  const over = await s.view.fire('dragover', dropEvent([], { types: ['text/plain'] }));
  const drop = await s.view.fire('drop', dropEvent([file('a.json', fileOf({ a: 'b' }))], { types: ['text/plain', 'text/uri-list'] }));
  assert.equal(over.prevented, false);
  assert.equal(drop.prevented, false);
  assert.equal(s.drop.overlay.dataset.active, 'false');
  assert.deepEqual(s.store.current.replacements, []);
  assert.deepEqual(s.refusals, []);
  assert.equal(dragCarriesFiles({ dataTransfer: { types: ['Files'] } }), true);
  assert.equal(dragCarriesFiles({}), false);
});

test('a drop into a text field is left to the field', async () => {
  const s = desktopSetup();
  for (const target of [Object.assign(new Node('textarea'), {}), Object.assign(new Node('input'), { type: 'text' }), Object.assign(new Node('div'), { isContentEditable: true }), new Node('md-outlined-text-field')]) {
    const over = await s.view.fire('dragover', dropEvent([file('a.json', '{}')], { target }));
    const drop = await s.view.fire('drop', dropEvent([file('a.json', fileOf({ a: 'b' }))], { target }));
    assert.equal(over.prevented, false);
    assert.equal(drop.prevented, false);
    assert.equal(isTextDropTarget(drop), true);
  }
  assert.equal(s.drop.overlay.dataset.active, 'false');
  assert.deepEqual(s.store.current.replacements, []);
  assert.deepEqual(s.refusals, []);
  assert.equal(isTextDropTarget(dropEvent([], { target: Object.assign(new Node('input'), { type: 'file' }) })), false);
});

test('the drop target overlay shows while files are dragged and hides after', async () => {
  const s = desktopSetup();
  assert.equal(s.drop.overlay.attrs['aria-hidden'], 'true');
  await s.view.fire('dragenter', dropEvent([]));
  assert.equal(s.drop.overlay.dataset.active, 'true');
  assert.equal(s.drop.overlay.children[0].children[0].textContent, 'Drop your wording file to apply it');
  await s.view.fire('dragleave', { relatedTarget: null });
  assert.equal(s.drop.overlay.dataset.active, 'false');
  await s.view.fire('dragover', dropEvent([]));
  await s.view.fire('drop', dropEvent([file('a.json', fileOf({ a: 'b' }))]));
  assert.equal(s.drop.overlay.dataset.active, 'false');
  s.drop.dispose();
  assert.equal(s.view.listeners.get('drop').size, 0);
});

test('the headline comes from the file and falls back to the neutral text', async () => {
  assert.equal(parseDesktop(fileOf({ a: 'b' }, { displayName: 'Team words' })).displayName, 'Team words');
  assert.equal(parseExtension(fileOf({ a: 'b' }, { displayName: 'Team words' })).displayName, 'Team words');
  assert.equal(parseDesktop(fileOf({ a: 'b' })).displayName, undefined);
  assert.equal(parseExtension(fileOf({ a: 'b' })).displayName, undefined);
  const s = desktopSetup();
  await s.view.fire('drop', dropEvent([file('a.json', fileOf({ a: 'b' }))]));
  assert.equal(celebrationNode(s).children[0].textContent, 'Personal wording applied');
  assert.equal(headlineFrom('  '), '');
  assert.equal(headlineFrom(7), '');
  assert.equal(headlineFrom('x'.repeat(41)), '');
});

test('the display name is optional, bounded plain text in both schemas', () => {
  for (const bad of ['', ' padded ', 'x'.repeat(41), 'a\u0000b', '<b>x</b>', 5, null]) {
    assert.throws(() => parseDesktop(fileOf({ a: 'b' }, { displayName: bad })), /Invalid vocabulary/);
    assert.ok(parseExtension(fileOf({ a: 'b' }, { displayName: bad })).error);
  }
  assert.equal(parseDesktop(fileOf({ a: 'b' }, { displayName: 'x'.repeat(40) })).displayName.length, 40);
  assert.throws(() => parseDesktop(fileOf({ a: 'b' }, { unknown: 1 })), /Invalid vocabulary/);
  assert.deepEqual(parseDesktop(JSON.stringify({ version: 1, replacements: [{ from: 'a', to: 'b' }], displayName: 'Team words' })).replacements, [{ from: 'a', to: 'b' }]);
  // The name is never stored with the replacements.
  assert.equal(serializeVocabulary(parseDesktop(fileOf({ a: 'b' }, { displayName: 'Team words' }))), '{"schemaVersion":1,"entries":{"a":"b"}}');
});

test('the celebration animates in, holds for about three seconds, animates out and then leaves', async () => {
  const s = desktopSetup();
  s.celebration.show('Team words');
  const node = celebrationNode(s);
  assert.equal(node.dataset.phase, 'in');
  assert.equal(node.attrs.role, 'status');
  assert.equal(node.attrs['aria-live'], 'polite');
  assert.equal(CELEBRATION.holdMs, 3000);
  s.advance(CELEBRATION.enterMs - 1); assert.equal(node.dataset.phase, 'in');
  s.advance(1); assert.equal(node.dataset.phase, 'hold');
  s.advance(CELEBRATION.holdMs - 1); assert.equal(node.dataset.phase, 'hold');
  s.advance(1); assert.equal(node.dataset.phase, 'out');
  s.advance(CELEBRATION.exitMs - 1); assert.equal(s.celebration.active, true);
  s.advance(1); assert.equal(s.celebration.active, false); assert.equal(celebrationNode(s), undefined);
  assert.equal(s.timers.size, 0);
});

test('the celebration never takes focus or shows anything but the headline', async () => {
  const s = desktopSetup();
  s.celebration.show('Team words');
  const node = celebrationNode(s);
  assert.equal(node.focusCalls, 0);
  assert.equal(node.attrs.tabindex, undefined);
  assert.equal(node.children.length, 1);
  assert.equal(node.children[0].textContent, 'Team words');
  s.celebration.show('Second');
  assert.equal(s.body.children.filter(child => child.className === 'wording-celebration').length, 1);
  assert.equal(celebrationNode(s).children[0].textContent, 'Second');
});

test('reduced motion keeps a static notice for three seconds', async () => {
  const s = desktopSetup({ reduced: true });
  s.celebration.show('Team words');
  const node = celebrationNode(s);
  assert.equal(node.dataset.reduced, 'true');
  assert.equal(node.dataset.phase, 'hold');
  s.advance(2999); assert.equal(s.celebration.active, true);
  s.advance(1); assert.equal(s.celebration.active, false);
});

test('a later drop supersedes an earlier slow one', async () => {
  const env = environment(), applied = [];
  let release;
  const slow = { name: 'a.json', size: 2, text: () => new Promise(resolve => { release = () => resolve(fileOf({ a: 'one' })); }) };
  installWordingDrop({ doc: env.doc, maxBytes: 1000, celebration: createCelebration({ doc: env.doc, neutral: 'Personal wording applied', setTimer: env.setTimer, clearTimer: env.clearTimer }), overlayText: () => '', apply: source => { applied.push(source); return { name: 'x' }; }, refuse: () => {} });
  const first = env.view.fire('drop', dropEvent([slow]));
  await env.view.fire('drop', dropEvent([file('b.json', fileOf({ b: 'two' }))]));
  release(); await first;
  assert.deepEqual(applied, [fileOf({ b: 'two' })]);
});

test('the extension stores wording when unpaired and applies it only while paired', async () => {
  for (const paired of [false, true]) {
    const env = environment(), storage = memory(), refusals = [];
    const celebration = createCelebration({ doc: env.doc, neutral: 'Personal wording applied', setTimer: env.setTimer, clearTimer: env.clearTimer });
    const notice = createNotice({ doc: env.doc, setTimer: env.setTimer, clearTimer: env.clearTimer });
    installWordingDrop({
      doc: env.doc, maxBytes: 32768, celebration, overlayText: () => 'Drop',
      apply: source => {
        const result = saveVocabulary(storage, source);
        if (result.error) throw new Error(result.error);
        if (entriesFor(paired, readVocabulary(storage)).length) return { name: result.displayName };
        notice.show('Saved. Applies after pairing.');
        return null;
      },
      refuse: (code, error) => refusals.push(code),
    });
    await env.view.fire('drop', dropEvent([file('w.json', fileOf({ Notes: 'Jottings' }, { displayName: 'Team words' }))]));
    assert.deepEqual(readVocabulary(storage).map(([from]) => from), ['Notes'], 'stored in both cases');
    assert.equal(entriesFor(paired, readVocabulary(storage)).length, paired ? 1 : 0);
    assert.equal(env.body.children.some(node => node.className === 'wording-celebration'), paired);
    assert.equal(env.body.children.some(node => node.className === 'wording-notice'), !paired);
    const before = storage.getItem('mfe-extension-vocabulary-v1');
    await env.view.fire('drop', dropEvent([file('bad.json', '{"schemaVersion":1,"entries":{}}')]));
    assert.deepEqual(refusals, ['invalid']);
    assert.equal(storage.getItem('mfe-extension-vocabulary-v1'), before, 'an invalid file changes nothing');
    env.advance(5000);
    assert.equal(env.body.children.some(node => node.className === 'wording-notice'), false);
  }
});

test('both app surfaces wire the drop and the upload to the celebration', async () => {
  const read = path => fs.readFile(new URL(path, import.meta.url), 'utf8');
  const [app, options, popup, build] = await Promise.all([read('../src/renderer/app.js'), read('../browser-extension/options.js'), read('../browser-extension/popup-wording.js'), read('../scripts/build-browser-extension.mjs')]);
  for (const source of [app, options, popup]) assert.match(source, /installWordingDrop\(/);
  assert.match(app, /celebrateWording\(next\.displayName\)/, 'the Settings upload celebrates');
  assert.match(app, /\{ name: next\.displayName \}/, 'a dropped file celebrates with its own name');
  assert.match(options, /wordingDrop\.celebration\.show\(result\.name\)/);
  assert.match(options, /result\.applied\?\{name:result\.name\}:null/, 'the options page celebrates only when the wording applies');
  assert.match(popup, /if\(await paired\(\)\)return \{name:result\.displayName\}/);
  assert.match(await read('../browser-extension/popup.html'), /src="popup-wording\.js"/);
  assert.match(build, /'wording-drop\.js'/);
});

test('the two shipped copies of the drop module are identical', async () => {
  const [desktop, extension] = await Promise.all(['../src/renderer/wording-drop.js', '../browser-extension/wording-drop.js'].map(path => fs.readFile(new URL(path, import.meta.url), 'utf8')));
  assert.equal(extension, desktop);
});

test('guard: headlines never come from literals in the new source files', async () => {
  const files = ['../src/renderer/wording-drop.js', '../browser-extension/wording-drop.js'];
  for (const path of files) {
    const source = await fs.readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\.show\(\s*['"`]/, `${path} passes a literal headline`);
    assert.doesNotMatch(source, /displayName\s*[:=]\s*['"`]/, `${path} hard-codes a display name`);
  }
  for (const path of ['../src/renderer/app.js', '../browser-extension/options.js', '../browser-extension/popup-wording.js']) {
    const source = await fs.readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /celebration\.show\(\s*['"`]/, `${path} passes a literal headline`);
  }
});
