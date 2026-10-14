import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaterialDialogs, dialogView} from '../src/main/material-dialog.js';

function harness({failWindow = false, theme} = {}) {
  const handles = new Map(), listeners = new Map(), windows = [];
  let nextId = 100;
  class FakeWindow {
    constructor(options) {
      if (failWindow) throw new Error('synthetic window failure');
      this.options = options; this.destroyed = false; this.events = {};
      this.webContents = {id: nextId++, on() {}, setWindowOpenHandler() {}};
      windows.push(this);
    }
    on(name, fn) { this.events[name] = fn; }
    once(name, fn) { this.events[name] = fn; }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; }
    setContentSize(width, height) { this.size = [width, height]; }
    loadFile() { return Promise.resolve(); }
    close() { this.destroyed = true; this.events.closed?.(); }
  }
  const ipcMain = {handle: (name, fn) => handles.set(name, fn), on: (name, fn) => listeners.set(name, fn)};
  const native = {calls: [], showMessageBox(...args) { this.calls.push(args); return Promise.resolve({response: 1, checkboxChecked: false}); }};
  const dialogs = createMaterialDialogs({BrowserWindow: FakeWindow, ipcMain, nativeDialog: native, preloadPath: 'preload.cjs', pagePath: 'page.html', getTheme: async () => theme});
  const tick = () => new Promise(resolve => setImmediate(resolve));
  return {dialogs, windows, native, tick,
    view: id => handles.get('material-dialog:view')({sender: {id}}),
    respond: (id, nonce, index) => listeners.get('material-dialog:respond')({sender: {id}}, nonce, index)};
}

test('only the dialog window with its nonce and an in-range choice settles the prompt', async () => {
  const h = harness();
  let settled = null;
  const result = h.dialogs.showMessageBox({type: 'question', buttons: ['Reject', 'Pair browser'], defaultId: 0, cancelId: 0, title: 'Pair browser tools', message: 'Allow?'});
  result.then(value => { settled = value; });
  await h.tick();
  const window = h.windows[0], id = window.webContents.id, {nonce, buttons} = await h.view(id);
  assert.deepEqual(buttons, ['Reject', 'Pair browser']);
  await assert.rejects(Promise.resolve().then(() => h.view(id + 1)), /unavailable/);
  h.respond(id + 1, nonce, 1); await h.tick(); assert.equal(settled, null, 'another web contents cannot answer');
  h.respond(id, 'forged-nonce', 1); await h.tick(); assert.equal(settled, null, 'a wrong nonce cannot answer');
  h.respond(id, nonce, 7); await h.tick(); assert.equal(settled, null, 'an out-of-range choice is ignored');
  h.respond(id, nonce, 1);
  assert.deepEqual(await result, {response: 1, checkboxChecked: false});
  assert.equal(window.destroyed, true);
  h.respond(id, nonce, 0); assert.equal(h.dialogs.pendingCount(), 0, 'a settled prompt cannot be answered again');
});

test('closing the dialog window chooses the cancel button', async () => {
  const h = harness();
  const result = h.dialogs.showMessageBox(null, {buttons: ['Keep running', 'Finish then quit', 'Cancel unfinished work then quit'], cancelId: 0, message: 'What should happen to unfinished work?'});
  await h.tick();
  h.windows[0].close();
  assert.deepEqual(await result, {response: 0, checkboxChecked: false});
});

test('a window that cannot open falls back to the native dialog instead of dropping consent', async () => {
  const h = harness({failWindow: true});
  const result = await h.dialogs.showMessageBox({message: 'Accept?', buttons: ['Cancel', 'Accept']});
  assert.equal(result.response, 1);
  assert.equal(h.native.calls.length, 1);
});

test('the dialog follows the application theme and ignores anything that is not a theme', async () => {
  for (const [reported, expected] of [['dark', 'dark'], ['light', 'light'], ['<script>', null], [undefined, null]]) {
    const h = harness({theme: reported});
    const result = h.dialogs.showMessageBox({message: 'Theme?'});
    await h.tick(); await h.tick();
    const view = await h.view(h.windows[0].webContents.id);
    assert.equal(view.theme, expected, String(reported));
    h.respond(h.windows[0].webContents.id, view.nonce, 0); await result;
  }
});

test('dialog views are bounded and keep valid indices', () => {
  const view = dialogView({type: 'script', buttons: Array.from({length: 9}, (_, i) => 'B' + i), defaultId: 8, cancelId: -1, message: 'x'.repeat(5000)});
  assert.equal(view.type, 'none');
  assert.equal(view.buttons.length, 6);
  assert.equal(view.defaultId, 0);
  assert.equal(view.cancelId, 0);
  assert.equal(view.message.length, 2000);
  assert.deepEqual(dialogView({}).buttons, ['OK']);
});
