import test from 'node:test';
import assert from 'node:assert/strict';
import { createCelebration, installWordingDrop } from '../src/renderer/wording-drop.js';
import { createVocabularyStore, replaceVocabulary } from '../src/shared/personal-vocabulary.js';
import { createPrivateWordingView } from '../src/shared/surface/private-wording-view.js';
import { createActionSounds } from '../src/shared/surface/action-sounds.js';

// A tiny document for the drop module and a tiny tree for the wording projection.
class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.parent = null; this.className = ''; this.textContent = ''; }
  setAttribute() {}
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; } }
}
class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, handler) { (this.listeners.get(name) ?? this.listeners.set(name, new Set()).get(name)).add(handler); }
  removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler); }
  async fire(name, event) { for (const handler of [...(this.listeners.get(name) ?? [])]) await handler(event); return event; }
}
const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
const file = (name, text, size = text.length) => ({ name, size, text: async () => text });
const dropEvent = files => ({ dataTransfer: { types: ['Files'], files, dropEffect: '' }, target: new Node('div'), composedPath() { return [this.target]; }, relatedTarget: null, preventDefault() {} });
const fileOf = entries => JSON.stringify({ schemaVersion: 1, entries });

function audio() {
  const started = [];
  class Context {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() { started.push(1); }, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    close() {}
  }
  return { Context, started };
}

function setup({ cues } = {}) {
  const view = new Target(), body = new Node('body'), doc = { body, defaultView: view, createElement: tag => new Node(tag) };
  const storage = memory(), store = createVocabularyStore(storage, 'wording'), refusals = [];
  const celebration = createCelebration({ doc, neutral: () => 'Personal wording applied', setTimer: () => 0, clearTimer: () => {} });
  installWordingDrop({
    doc, maxBytes: 256 * 1024, celebration, overlayText: () => 'Drop', cues,
    apply: source => ({ name: store.replace(source).vocabulary.displayName }), refuse: (code, error) => refusals.push([code, error?.message]),
  });
  return { view, store, refusals, body };
}

test('a valid drop plays the celebration cue exactly once beside the celebration', async () => {
  const calls = [];
  const s = setup({ cues: { applied: () => calls.push('applied'), refused: () => calls.push('refused') } });
  await s.view.fire('drop', dropEvent([file('words.json', fileOf({ Files: 'Stash' }))]));
  assert.deepEqual(calls, ['applied']);
  assert.ok(s.body.children.some(node => node.className === 'wording-celebration'));
});

test('invalid, oversized, non-JSON and multiple drops play the invalid cue once and never the celebration', async () => {
  const cases = [
    [file('words.json', '{not json')],
    [file('big.json', fileOf({ a: 'b' }), 999999)],
    [file('notes.txt', 'hello')],
    [file('a.json', fileOf({ a: 'b' })), file('b.json', fileOf({ c: 'd' }))],
  ];
  for (const files of cases) {
    const calls = [];
    const s = setup({ cues: { applied: () => calls.push('applied'), refused: () => calls.push('refused') } });
    await s.view.fire('drop', dropEvent(files));
    assert.deepEqual(calls, ['refused'], files.map(f => f.name).join());
    assert.equal(s.body.children.some(node => node.className === 'wording-celebration'), false);
    assert.equal(s.store.current.replacements.length, 0, 'the previous wording is untouched');
  }
});

test('a sound hook that throws never changes the outcome of the drop', async () => {
  const s = setup({ cues: { applied: () => { throw new Error('speaker unplugged'); }, refused: () => { throw new Error('speaker unplugged'); } } });
  await s.view.fire('drop', dropEvent([file('words.json', fileOf({ Files: 'Stash' }))]));
  assert.equal(s.store.current.replacements[0].to, 'Stash');
  await s.view.fire('drop', dropEvent([file('x.txt', 'nope')]));
  assert.deepEqual(s.refusals.map(row => row[0]), ['type']);
});

test('the real audio service plays the celebration once for a valid drop and the invalid cue for a bad one', async () => {
  const { Context, started } = audio(); let now = 1000;
  const sounds = createActionSounds({ Context, clock: () => now });
  const cues = { applied: () => sounds.play('celebration'), refused: () => sounds.play('error') };
  const s = setup({ cues });
  await s.view.fire('drop', dropEvent([file('words.json', fileOf({ Files: 'Stash' }))]));
  const afterValid = started.length;
  assert.ok(afterValid >= 4, 'the fanfare is several notes');
  now += 10_000;
  await s.view.fire('drop', dropEvent([file('x.txt', 'nope')]));
  assert.ok(started.length > afterValid && started.length - afterValid <= 3, 'the invalid cue is a short two-note descent, never the fanfare');
});

// ---- the loaded wording reaches error surfaces too -------------------------------------------------------
function tree() {
  const make = (tag, content = '') => {
    const node = { tag, children: [], attrs: new Map(), parentElement: null, ownerDocument: null, shadowRoot: null,
      append(child) { child.parentElement = this; child.ownerDocument = document; this.children.push(child); },
      contains(target) { return this === target || this.children.some(child => child.contains?.(target)); },
      closest(selector) { if (selector.includes(this.tag)) return this; return this.parentElement?.closest(selector) || null; },
      getRootNode() { return this.parentElement?.getRootNode() || this; },
      hasAttribute(name) { return this.attrs.has(name); }, getAttribute(name) { return this.attrs.get(name); }, setAttribute(name, value) { this.attrs.set(name, value); } };
    if (content) node.children.push({ nodeValue: content, parentElement: node, getRootNode: () => node.getRootNode() });
    return node;
  };
  class Observer { observe() {} disconnect() {} takeRecords() { return []; } }
  const document = { defaultView: { MutationObserver: Observer } };
  const root = make('body'); root.ownerDocument = document;
  return { root, make };
}

test('loading a wording file also changes the words on error, notification and empty-state surfaces', async () => {
  const s = setup();
  const { root, make } = tree();
  const error = make('div', 'Your drive could not be mounted.');
  const notice = make('div', 'Update: Files were moved to the Recycle Bin.');
  const empty = make('div', 'No files here yet.');
  const field = make('x-field'); field.setAttribute('aria-label', 'Search files');
  field.setAttribute('placeholder', 'Search files');
  root.append(error); root.append(notice); root.append(empty); root.append(field);
  const view = createPrivateWordingView({ root, isActive: () => true, replace: value => replaceVocabulary(value, s.store.current) });
  // Before the file is loaded nothing is replaced.
  assert.equal(error.children[0].nodeValue, 'Your drive could not be mounted.');
  await s.view.fire('drop', dropEvent([file('words.json', fileOf({ drive: 'vault', Files: 'Stash', files: 'stash items' }))]));
  view.refresh();
  assert.equal(error.children[0].nodeValue, 'Your vault could not be mounted.');
  assert.equal(notice.children[0].nodeValue, 'Update: Stash were moved to the Recycle Bin.');
  assert.equal(empty.children[0].nodeValue, 'No stash items here yet.');
  assert.equal(field.getAttribute('aria-label'), 'Search stash items');
  // A later error surface that appears after the load gets the same wording, and clearing restores the original.
  const later = make('div', 'The drive is locked.'); root.append(later); view.refresh();
  assert.equal(later.children[0].nodeValue, 'The vault is locked.');
  s.store.replace('{"schemaVersion":1,"entries":{}}'); view.refresh();
  assert.equal(error.children[0].nodeValue, 'Your drive could not be mounted.');
  view.destroy();
});
