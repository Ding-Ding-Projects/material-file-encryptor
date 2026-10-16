import test from 'node:test';
import assert from 'node:assert/strict';
import {superConfirm} from '../browser-extension/super-confirm.js';
import {EXTENSION_DESTRUCTIVE, extensionDestructive, destructiveDescription} from '../browser-extension/destructive-confirm.js';

class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.attributes = new Map(); this.selected = false; this.value = 0; this.textContent = ''; this.focused = 0; this.animations = 0; this.removed = false; this.disabled = false; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  show() { this.open = true; }
  close() { this.open = false; }
  remove() { this.removed = true; }
  focus() { this.focused++; }
  animate() { this.animations++; return {}; }
}
function documentDouble({reduced = false} = {}) {
  const timers = [];
  const win = {matchMedia: query => ({matches: reduced && /reduced-motion/.test(query)}), setTimeout: fn => { timers.push(fn); return timers.length; }};
  const doc = {activeElement: new Node('button'), defaultView: win, body: new Node('body'), createElement: tag => new Node(tag), addEventListener(name, fn) { this[name] = fn; }, removeEventListener(name) { delete this[name]; }};
  return {doc, timers};
}
function open(id, {language = 'en', detail, reduced = false} = {}) {
  const env = documentDouble({reduced});
  const pending = superConfirm(env.doc, id, {language, detail});
  const dialog = env.doc.body.children[0], content = dialog.children[1];
  return {env, pending, dialog, content, first: content.children[2], second: content.children[3], slider: content.children[4], status: content.children[5], progress: content.children[6], exit: dialog.children[2], execute: dialog.children[3]};
}
const key = node => { node.selected = true; node.listeners.change(); };
const slide = (c, amount) => { c.slider.value = amount; c.slider.listeners.input(); };

test('the popup confirmation needs both keys and a full slider before it resolves true', async () => {
  const c = open('extension.popup-disconnect');
  assert.equal(c.slider.disabled, true);
  assert.equal(c.execute.disabled, true);
  key(c.first); slide(c, 100);
  assert.equal(c.slider.disabled, true, 'one key is not enough');
  key(c.second); slide(c, 70);
  assert.equal(c.execute.disabled, true, 'a partial slider is not enough');
  assert.equal(c.progress.value, 0.7);
  c.execute.listeners.click();
  assert.equal(c.dialog.removed, false, 'a disabled action does nothing');
  slide(c, 100);
  assert.equal(c.execute.disabled, false);
  c.execute.listeners.click();
  assert.equal(c.progress.value, 1);
  c.env.timers.forEach(fn => fn());
  assert.equal(await c.pending, true);
  assert.equal(c.dialog.removed, true);
});

test('Emergency exit, Escape and the dialog cancel event all resolve false and return focus', async () => {
  for (const how of ['exit', 'escape', 'cancel']) {
    const c = open('extension.popup-disconnect');
    key(c.first); key(c.second); slide(c, 100);
    if (how === 'exit') c.exit.listeners.click();
    else if (how === 'escape') c.env.doc.keydown({key: 'Escape', preventDefault() {}});
    else c.dialog.listeners.cancel({preventDefault() {}});
    assert.equal(await c.pending, false, how);
    assert.equal(c.env.doc.activeElement.focused, 1, how + ' returns focus');
    assert.equal(c.dialog.removed, true);
  }
});

test('completion animates unless motion is reduced, and reduced motion still completes at once', async () => {
  const lively = open('extension.popup-disconnect');
  key(lively.first); key(lively.second); slide(lively, 100);
  lively.execute.listeners.click();
  assert.equal(lively.status.animations, 1);
  assert.equal(lively.env.timers.length, 1, 'the dialog waits for the completion animation');
  lively.env.timers[0]();
  assert.equal(await lively.pending, true);
  const calm = open('extension.popup-disconnect', {reduced: true});
  key(calm.first); key(calm.second); slide(calm, 100);
  calm.execute.listeners.click();
  assert.equal(calm.status.animations, 0);
  assert.equal(calm.env.timers.length, 0);
  assert.equal(await calm.pending, true);
});

test('the registered title and consequence are shown in every language mode and name the exact data', async () => {
  const entry = EXTENSION_DESTRUCTIVE['extension.popup-disconnect'];
  for (const [language, title, affected] of [['en', entry.title[0], entry.affected[0]], ['yue', entry.title[1], entry.affected[1]], ['bilingual', entry.title.join(' · '), entry.affected.join(' · ')]]) {
    const c = open('extension.popup-disconnect', {language});
    assert.equal(c.dialog.children[0].textContent, title);
    assert.ok(c.content.children[0].textContent.includes(affected), language);
    c.exit.listeners.click(); await c.pending;
  }
  const detailed = open('extension.delete-model', {detail: ['“alpha:latest”.', '「alpha:latest」。']});
  assert.ok(detailed.content.children[0].textContent.includes('“alpha:latest”'));
  detailed.exit.listeners.click(); await detailed.pending;
});

test('an unregistered extension action is refused', () => {
  assert.throws(() => extensionDestructive('extension.not-listed'), /Unregistered destructive action/);
  assert.throws(() => superConfirm(documentDouble().doc, 'extension.not-listed'), /Unregistered destructive action/);
  assert.throws(() => destructiveDescription('desktop.force-lock'), /Unregistered destructive action/);
});
