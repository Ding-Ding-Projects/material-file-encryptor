import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// A small DOM double: enough to drive the two-key confirmation the way a person would.
const previous = {HTMLElement: globalThis.HTMLElement, document: globalThis.document};
globalThis.HTMLElement = class {};
class Node {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.listeners = {}; this.attributes = new Map(); this.selected = false; this.value = 0; this.textContent = ''; this.focused = 0; this.animations = 0; this.removed = false; }
  append(...nodes) { this.children.push(...nodes); }
  after(node) { this.sibling = node; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  show() { this.shown = true; }
  close() { this.shown = false; }
  remove() { this.removed = true; }
  focus() { this.focused++; }
  animate() { this.animations++; return {}; }
}
function documentDouble({reduced = false} = {}) {
  const popstate = [];
  const view = {matchMedia: query => ({matches: reduced && /reduced-motion/.test(query)}), addEventListener: (name, handler) => { if (name === 'popstate') popstate.push(handler); }, removeEventListener() {}, setTimeout: (fn) => { fn(); return 0; }};
  const doc = {activeElement: new Node('button'), defaultView: view, body: new Node('body'), createElement: tag => new Node(tag), addEventListener(name, fn) { this[name] = fn; }, removeEventListener(name) { delete this[name]; }};
  return {doc, popstate};
}
globalThis.document = documentDouble().doc;
const {requestSuperConfirmation, confirmDestructiveAction} = await import('../src/shared/surface/workflow-confirm.js');
const {DESTRUCTIVE_ACTIONS} = await import('../src/shared/destructive-actions.js');
test.after(() => { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value; });

function open(options = {}, env = documentDouble(options.env)) {
  globalThis.document = env.doc;
  const host = new Node('host'); host.ownerDocument = env.doc;
  let runs = 0;
  const pending = requestSuperConfirmation(host, {destructiveId: 'desktop.empty-recycle-bin', run: async () => { runs++; return 'done'; }, ...options.request});
  const dialog = host.children[0], content = dialog.children[1];
  return {host, env, pending, dialog, content, first: content.children[2], second: content.children[3], slider: content.children[4], status: content.children[5], progress: content.children[6], cancel: dialog.children[2], execute: dialog.children[3], runs: () => runs};
}
const setSlider = (c, amount) => { c.slider.value = amount; c.slider.listeners.input(); };
const key = (node) => { node.selected = true; node.listeners.change(); };

test('untouched: nothing is enabled and nothing runs', async () => {
  const c = open();
  assert.equal(c.slider.disabled, true);
  assert.equal(c.execute.disabled, true);
  assert.equal(c.progress.value, 0);
  await c.execute.listeners.click();
  assert.equal(c.runs(), 0);
  c.cancel.listeners.click(); await c.pending;
});

test('one key alone never enables the slider or the action', async () => {
  const c = open();
  key(c.first); setSlider(c, 100);
  assert.equal(c.slider.disabled, true);
  assert.equal(c.slider.value, 0, 'the slider is reset while a key is off');
  assert.equal(c.execute.disabled, true);
  await c.execute.listeners.click();
  assert.equal(c.runs(), 0);
  c.cancel.listeners.click(); await c.pending;
});

test('both keys enable the slider, a partial slider keeps the action disabled, and only a full slider runs it once', async () => {
  const c = open();
  key(c.first); key(c.second);
  assert.equal(c.slider.disabled, false);
  assert.equal(c.execute.disabled, true);
  setSlider(c, 60);
  assert.equal(c.execute.disabled, true);
  assert.equal(c.progress.value, 0.6, 'progress follows the slider');
  setSlider(c, 99);
  assert.equal(c.execute.disabled, true);
  await c.execute.listeners.click();
  assert.equal(c.runs(), 0, 'the action does not run before the slider is complete');
  setSlider(c, 100);
  assert.equal(c.execute.disabled, false);
  await c.execute.listeners.click();
  assert.equal(c.runs(), 1);
  assert.equal(c.progress.value, 1, 'completion fills the progress');
  assert.equal(c.status.textContent, 'Operation completed.');
  assert.equal(c.execute.textContent, 'Done');
  await c.execute.listeners.click();
  assert.deepEqual(await c.pending, {confirmed: true, result: 'done'});
  assert.equal(c.runs(), 1, 'finishing the dialog never runs the action again');
});

test('turning a key off after completing the slider takes the action away again', async () => {
  const c = open();
  key(c.first); key(c.second); setSlider(c, 100);
  c.second.selected = false; c.second.listeners.change();
  assert.equal(c.slider.disabled, true);
  assert.equal(c.execute.disabled, true);
  await c.execute.listeners.click();
  assert.equal(c.runs(), 0);
  c.cancel.listeners.click(); await c.pending;
});

test('Emergency exit leaves without running the action, removes the dialog and returns focus', async () => {
  const c = open();
  key(c.first); key(c.second); setSlider(c, 100);
  const origin = c.env.doc.activeElement;
  c.cancel.listeners.click();
  assert.deepEqual(await c.pending, {confirmed: false});
  assert.equal(c.runs(), 0);
  assert.equal(c.dialog.removed, true);
  assert.equal(origin.focused, 1, 'focus goes back to the control that asked');
  assert.match(c.cancel.textContent, /Emergency exit/);
});

test('Escape and Back both leave without acting and return focus', async () => {
  const escape = open();
  const origin = escape.env.doc.activeElement;
  escape.env.doc.keydown({key: 'Escape', preventDefault() {}});
  assert.deepEqual(await escape.pending, {confirmed: false});
  assert.equal(origin.focused, 1);
  const back = open();
  assert.equal(back.env.popstate.length, 1, 'Back is listened for');
  back.env.popstate[0]();
  assert.deepEqual(await back.pending, {confirmed: false});
  assert.equal(back.runs(), 0);
});

test('progress and completion animate unless the platform asks for reduced motion', async () => {
  const motion = open({env: {reduced: false}});
  key(motion.first); key(motion.second); setSlider(motion, 100);
  await motion.execute.listeners.click();
  assert.ok(motion.status.animations >= 1, 'completion is animated');
  await motion.execute.listeners.click(); await motion.pending;
  const calm = open({env: {reduced: true}});
  key(calm.first); key(calm.second); setSlider(calm, 100);
  await calm.execute.listeners.click();
  assert.equal(calm.status.animations, 0, 'reduced motion removes the animation');
  assert.equal(calm.progress.value, 1, 'the state still changes');
  await calm.execute.listeners.click(); await calm.pending;
});

test('the registered action and its data are named in English, Cantonese and bilingual modes', async () => {
  const entry = DESTRUCTIVE_ACTIONS.find(item => item.id === 'desktop.server-stop');
  for (const [language, expected] of [['en', [entry.title[0], entry.affected[0]]], ['yue', [entry.title[1], entry.affected[1]]], ['bilingual', [entry.title.join(' · '), entry.affected.join(' · ')]]]) {
    const c = open({request: {destructiveId: 'desktop.server-stop', affected: 'Survival world', getLanguage: () => language}});
    const text = c.content.children[0].textContent;
    assert.ok(text.includes('Survival world'), 'the exact data is named: ' + text);
    for (const part of expected) assert.ok(text.includes(part), `${language}: ${part}`);
    c.cancel.listeners.click(); await c.pending;
  }
});

test('every registered action can be shown, in every language, with its consequence', async () => {
  for (const entry of DESTRUCTIVE_ACTIONS) {
    for (const language of ['en', 'yue', 'bilingual']) {
      const c = open({request: {destructiveId: entry.id, getLanguage: () => language}});
      const text = c.content.children[0].textContent;
      assert.ok(text.length > 8 && text.includes(language === 'yue' ? entry.title[1] : entry.title[0]), entry.id + ' ' + language);
      assert.equal(c.dialog.getAttribute('data-destructive-id'), entry.id);
      c.cancel.listeners.click(); await c.pending;
    }
  }
});

test('an unregistered action is refused before any dialog appears', async () => {
  globalThis.document = documentDouble().doc;
  const host = new Node('host'); host.ownerDocument = globalThis.document;
  await assert.rejects(() => requestSuperConfirmation(host, {destructiveId: 'desktop.not-listed', run: async () => {}}), /Unregistered destructive action/);
  assert.equal(host.children.length, 0);
});

test('confirmDestructiveAction resolves true only after both keys and the full slider, and false on exit', async () => {
  const env = documentDouble(); globalThis.document = env.doc;
  const host = new Node('host'); host.ownerDocument = env.doc;
  const yes = confirmDestructiveAction(host, 'desktop.force-lock');
  let dialog = host.children[0], content = dialog.children[1];
  key(content.children[2]); key(content.children[3]); content.children[4].value = 100; content.children[4].listeners.input();
  await dialog.children[3].listeners.click();
  assert.equal(await yes, true);
  const no = confirmDestructiveAction(host, 'desktop.force-lock');
  dialog = host.children[1];
  dialog.children[2].listeners.click();
  assert.equal(await no, false);
});

test('an anchored confirmation opens beside its control as an alert dialog and still gates the action', async () => {
  const env = documentDouble(); globalThis.document = env.doc;
  const host = new Node('host'); host.ownerDocument = env.doc;
  const anchor = new Node('md-outlined-button');
  const pending = requestSuperConfirmation(host, {destructiveId: 'desktop.force-lock', anchor, confirmationOnly: true});
  const panel = anchor.sibling;
  assert.ok(panel, 'the panel sits next to the control');
  assert.equal(panel.getAttribute('role'), 'alertdialog');
  assert.equal(host.children.length, 0, 'it is not a modal dialog on the host');
  const content = panel.children[1];
  assert.equal(content.children[2].focused, 1, 'the first key takes focus');
  const execute = panel.children[2].children[1];
  await execute.listeners.click();
  key(content.children[2]); key(content.children[3]); content.children[4].value = 100; content.children[4].listeners.input();
  await execute.listeners.click();
  assert.deepEqual(await pending, {confirmed: true});
});

test('a failing action keeps the confirmation open with the reason and can be retried', async () => {
  let attempts = 0;
  const c = open({request: {run: async () => { attempts++; if (attempts === 1) throw new Error('Server refused'); return 'ok'; }}});
  key(c.first); key(c.second); setSlider(c, 100);
  await c.execute.listeners.click();
  assert.equal(c.status.textContent, 'Server refused');
  assert.equal(c.dialog.removed, false);
  await c.execute.listeners.click();
  assert.equal(attempts, 2);
  await c.execute.listeners.click();
  assert.deepEqual(await c.pending, {confirmed: true, result: 'ok'});
});

test('the documentation site workspace hands the registered id to the confirmation and stops when it is declined', async () => {
  const source = readFileSync(new URL('../docs/site/workspace.js', import.meta.url), 'utf8');
  const part = source.slice(source.indexOf('export async function confirmWorkspaceAction'), source.indexOf('function confirmAction(options)'));
  const {confirmWorkspaceAction} = await import('data:text/javascript;base64,' + Buffer.from(part).toString('base64'));
  const host = {append() {}, ownerDocument: {createElement: () => ({remove() {}, querySelector: () => null})}};
  const seen = [];
  const ask = confirmed => confirmWorkspaceAction(host, {title: 'Clear private wording', destructiveId: 'site.clear-workspace-vocabulary'}, {requestConfirmation: async (_wrapper, options) => { seen.push(options); return {confirmed}; }, getLanguage: () => 'yue'});
  assert.equal(await ask(true), true);
  assert.equal(await ask(false), false);
  assert.equal(seen[0].destructiveId, 'site.clear-workspace-vocabulary');
  assert.equal(seen[0].confirmationOnly, true, 'the workspace asks for approval and performs the clear itself afterwards');
  assert.equal(seen[0].getLanguage(), 'yue');
});