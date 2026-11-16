import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallationTakeover, createTakeoverPreference, SUCCESS_AUTO_DISMISS_MS, TAKEOVER_STORAGE_KEY} from '../src/renderer/features/installation/takeover.js';
import {lastOutputLines, maskSecrets} from '../src/renderer/features/installation/mask-secrets.js';

class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.className = ''; this.textContent = ''; this.dataset = {}; this.isConnected = true; this.parent = null; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter(item => item !== fn); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.isConnected = false; }
  focus() { this.doc.activeElement = this; }
  click() { for (const fn of this.listeners.click || []) fn({stopPropagation() {}}); }
  find(predicate, out = []) { if (predicate(this)) out.push(this); for (const child of this.children) child.find(predicate, out); return out; }
  text() { return [this.textContent, ...this.children.map(child => child.text())].join(' '); }
}
function fakeDocument() {
  const doc = {activeElement: null, listeners: {}};
  doc.createElement = tag => { const node = new Node(tag); node.doc = doc; return node; };
  doc.body = doc.createElement('body');
  doc.addEventListener = (name, fn) => { (doc.listeners[name] ||= []).push(fn); };
  doc.removeEventListener = (name, fn) => { doc.listeners[name] = (doc.listeners[name] || []).filter(item => item !== fn); };
  doc.press = (key, extra = {}) => { for (const fn of [...(doc.listeners.keydown || [])]) fn({key, preventDefault() {}, stopPropagation() {}, ...extra}); };
  return doc;
}
function fakeTimers() {
  let next = 1; const timers = new Map();
  return {
    setTimer: (fn, ms) => { timers.set(next, {fn, ms}); return next++; },
    clearTimer: id => timers.delete(id),
    count: () => timers.size,
    fire: () => { for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); } }
  };
}
function setup(options = {}) {
  const doc = fakeDocument(), timers = fakeTimers(), notifications = [], cues = [];
  const opener = doc.createElement('button'); doc.body.append(opener); opener.focus();
  const storage = (() => { const map = new Map(); return {map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value)}; })();
  const preference = createTakeoverPreference({storage});
  const takeover = createInstallationTakeover({doc, preference, setTimer: timers.setTimer, clearTimer: timers.clearTimer, notify: input => notifications.push(input), playCue: kind => cues.push(kind), copyText: async () => {}, ...options});
  const overlays = () => doc.body.children.filter(node => node.className.includes('install-takeover'));
  return {doc, timers, notifications, cues, opener, storage, preference, takeover, overlays};
}

const failure = {what: 'Ollama runtime 0.5.1', command: 'ollama-setup --token ghp_abcdefghijklmnopqrstuvwxyz0123456789 --quiet', exitCode: 1603, durationMs: 4200, output: ['downloading', 'verifying', 'checksum mismatch'], recovery: [{label: 'Retry', run: () => {}}]};

test('a failure takeover stays until it is dismissed, however long it waits', () => {
  const t = setup();
  t.takeover.failure(failure);
  assert.equal(t.overlays().length, 1);
  assert.equal(t.overlays()[0].dataset.kind, 'failure');
  assert.equal(t.timers.count(), 0, 'a failure never schedules an automatic close');
  t.timers.fire();
  t.timers.fire();
  assert.equal(t.overlays().length, 1, 'firing every pending timer does not close it');
  // A stray click on the backdrop does not dismiss an alarm either.
  t.overlays()[0].click();
  assert.equal(t.overlays().length, 1);
  // Other keys do not dismiss it.
  t.doc.press('Enter'); t.doc.press('a');
  assert.equal(t.overlays().length, 1);
  assert.deepEqual(t.takeover.active(), {kind: 'failure', what: 'Ollama runtime 0.5.1'});
  // Dismiss by the button.
  const dismiss = t.overlays()[0].find(node => node.tagName === 'button' && node.textContent === 'Dismiss')[0];
  dismiss.click();
  assert.equal(t.overlays().length, 0);
  assert.equal(t.takeover.active(), null);
});

test('Escape dismisses a failure and focus returns to where it was', () => {
  const t = setup();
  assert.equal(t.doc.activeElement, t.opener);
  t.takeover.failure(failure);
  assert.notEqual(t.doc.activeElement, t.opener);
  assert.equal(t.doc.activeElement.textContent, 'Dismiss', 'focus lands on the dismiss control');
  t.doc.press('Escape');
  assert.equal(t.overlays().length, 0);
  assert.equal(t.doc.activeElement, t.opener);
  assert.equal(t.doc.listeners.keydown.length, 0, 'the key listener is removed');
});

test('the failure shows only real values with secrets masked', () => {
  const t = setup();
  t.takeover.failure(failure);
  const text = t.overlays()[0].text();
  assert.match(text, /Ollama runtime 0\.5\.1/);
  assert.match(text, /Exit code\s+1603/);
  assert.match(text, /4\.2 s/);
  assert.match(text, /checksum mismatch/);
  assert.match(text, /ollama-setup --token \*{8} --quiet/);
  assert.doesNotMatch(text, /ghp_abcdef/);
  const card = t.overlays()[0].children[0];
  assert.equal(card.attributes.role, 'alertdialog');
  assert.equal(card.attributes['aria-modal'], 'true');
});

test('unknown values are omitted rather than shown as placeholders', () => {
  const t = setup();
  t.takeover.failure({what: 'WinFsp driver', command: 'installDriver'});
  const text = t.overlays()[0].text();
  assert.doesNotMatch(text, /Exit code/);
  assert.doesNotMatch(text, /Duration/);
  assert.doesNotMatch(text, /Last output/);
  assert.doesNotMatch(text, /undefined|null|NaN|TODO/);
  assert.throws(() => t.takeover.success({what: '  '}), /name of what was installed/);
});

test('a success closes itself after a few seconds, on click and on Escape', () => {
  const auto = setup();
  auto.takeover.success({what: 'WinFsp driver', where: 'Windows driver service', exitCode: 0, durationMs: 1500});
  assert.equal(auto.overlays().length, 1);
  assert.equal(auto.timers.count(), 1);
  assert.ok(SUCCESS_AUTO_DISMISS_MS >= 3000 && SUCCESS_AUTO_DISMISS_MS <= 10000);
  assert.equal(auto.overlays()[0].children[0].attributes.role, 'dialog');
  assert.match(auto.overlays()[0].text(), /Exit code\s+0/);
  auto.timers.fire();
  assert.equal(auto.overlays().length, 0);
  assert.equal(auto.doc.activeElement, auto.opener);

  const click = setup();
  click.takeover.success({what: 'Update'});
  click.overlays()[0].click();
  assert.equal(click.overlays().length, 0);
  assert.equal(click.timers.count(), 0, 'closing clears the countdown');

  const escape = setup();
  escape.takeover.success({what: 'Update'});
  escape.doc.press('Escape');
  assert.equal(escape.overlays().length, 0);
});

test('focusing or hovering a success pauses its countdown', () => {
  const t = setup();
  t.takeover.success({what: 'Update'});
  const card = t.overlays()[0].children[0];
  for (const fn of card.listeners.focusin) fn();
  assert.equal(t.timers.count(), 0);
  assert.equal(t.overlays().length, 1);
});

test('Tab stays inside the takeover', () => {
  const t = setup();
  t.takeover.failure(failure);
  const buttons = t.overlays()[0].find(node => node.tagName === 'button');
  assert.deepEqual(buttons.map(node => node.textContent), ['Retry', 'Copy details', 'Dismiss']);
  t.doc.press('Tab');
  assert.equal(t.doc.activeElement, buttons[0], 'Tab from the last control wraps to the first');
  t.doc.press('Tab', {shiftKey: true});
  assert.equal(t.doc.activeElement, buttons[2]);
});

test('a failure replaces a success, and a second failure waits its turn', () => {
  const t = setup();
  t.takeover.success({what: 'First'});
  t.takeover.failure({what: 'Second'});
  assert.equal(t.takeover.active().kind, 'failure');
  assert.equal(t.overlays().length, 1);
  t.takeover.failure({what: 'Third'});
  assert.equal(t.takeover.pending(), 1);
  t.doc.press('Escape');
  assert.equal(t.takeover.active().what, 'Third');
  t.doc.press('Escape');
  assert.equal(t.takeover.active(), null);
});

test('a recovery action runs and then closes the alarm', async () => {
  let ran = 0;
  const t = setup();
  t.takeover.failure({what: 'WinFsp driver', recovery: [{label: 'Retry', run: () => { ran++; }}]});
  t.overlays()[0].find(node => node.textContent === 'Retry')[0].click();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(ran, 1);
  assert.equal(t.overlays().length, 0);
});

test('with notifications chosen, no full-window message is drawn and the same real values are notified', () => {
  const t = setup();
  t.preference.set('notify');
  assert.equal(JSON.parse(t.storage.map.get(TAKEOVER_STORAGE_KEY)).mode, 'notify');
  t.takeover.failure(failure);
  t.takeover.success({what: 'WinFsp driver', durationMs: 900});
  assert.equal(t.overlays().length, 0);
  assert.equal(t.notifications.length, 2);
  assert.equal(t.notifications[0].level, 'error');
  assert.match(t.notifications[0].message, /1603/);
  assert.doesNotMatch(t.notifications[0].title + t.notifications[0].message, /ghp_/);
  assert.equal(t.notifications[1].level, 'success');
  assert.throws(() => t.preference.set('banner'), /Unknown/);
});

test('the sound cue follows the result and uses the injected sound switch', () => {
  const t = setup();
  t.takeover.success({what: 'A'});
  t.takeover.dismiss();
  t.takeover.failure({what: 'B'});
  assert.deepEqual(t.cues, ['success', 'failure']);
});

test('the preference defaults to the takeover and survives bad stored data', () => {
  const storage = {getItem: () => '{bad', setItem() { throw new Error('quota'); }};
  const preference = createTakeoverPreference({storage});
  assert.equal(preference.get(), 'takeover');
  assert.equal(preference.set('notify'), 'notify');
});

test('secret masking covers flags, key value pairs, bearer tokens and URLs', () => {
  assert.equal(maskSecrets('tool --password hunter2 --name x'), 'tool --password ******** --name x');
  assert.equal(maskSecrets('tool /password:hunter2'), 'tool /password:********');
  assert.match(maskSecrets('api_key=abc123 other=1'), /api_key=\*{8} other=1/);
  assert.equal(maskSecrets('Authorization: Bearer abcdefghijklmnop'), 'Authorization: ********');
  assert.match(maskSecrets('https://user:pw@example.test/x'), /user:\*{8}@example\.test/);
  assert.equal(maskSecrets('github_pat_' + 'a'.repeat(30)), '********');
  assert.equal(maskSecrets('plain text stays'), 'plain text stays');
  assert.deepEqual(lastOutputLines(['a', '', 'b\u0007c', 'token=zzz']), ['a', 'bc', 'token=********']);
  assert.equal(lastOutputLines('x\n'.repeat(40)).length, 12);
  assert.deepEqual(lastOutputLines(undefined), []);
});
