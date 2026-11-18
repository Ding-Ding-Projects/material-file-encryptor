import test from 'node:test';
import assert from 'node:assert/strict';
import { finishBackupBeforeQuit, QUIT_FLUSH_PROMPT } from '../src/main/auto-backup/quit-flush.js';
import { localizeDialogView } from '../src/main/dialog-copy.js';
import { dialogView } from '../src/main/material-dialog.js';

const later = ms => new Promise(resolve => setTimeout(resolve, ms));

test('a quick backup finishes without showing a prompt', async () => {
  let asked = 0, stopped = 0;
  const outcome = await finishBackupBeforeQuit({ flush: () => later(5), ask: async () => { asked++; return { response: 0 }; }, stop: async () => { stopped++; }, graceMs: 200 });
  assert.equal(outcome, 'finished');
  assert.equal(asked, 0);
  assert.equal(stopped, 0);
});

test('a slow backup shows Finishing backup and the prompt closes itself when it finishes', async () => {
  let signal = null, stopped = 0;
  const outcome = await finishBackupBeforeQuit({
    flush: () => later(80), graceMs: 10, stop: async () => { stopped++; },
    ask: options => { signal = options.signal; assert.equal(options.title, 'Finishing backup…'); assert.deepEqual(options.buttons, ['Quit now']);
      return new Promise(resolve => options.signal.addEventListener('abort', () => resolve({ response: 0 }), { once: true })); },
  });
  assert.equal(outcome, 'finished');
  assert.equal(signal.aborted, true, 'the prompt is withdrawn once the backup finishes');
  assert.equal(stopped, 0, 'a finished backup is not stopped');
});

test('Quit now stops the running backup and returns without waiting for it', async () => {
  let stopped = 0; const started = Date.now();
  const outcome = await finishBackupBeforeQuit({ flush: () => new Promise(() => {}), graceMs: 5, stop: async () => { stopped++; }, ask: async () => { await later(10); return { response: 0 }; } });
  assert.equal(outcome, 'quit-now');
  assert.equal(stopped, 1);
  assert.ok(Date.now() - started < 2000);
});

test('the wait is bounded even when the backup and its stop both hang', async () => {
  const outcome = await finishBackupBeforeQuit({ flush: () => new Promise(() => {}), graceMs: 5, limitMs: 30, stopMs: 30, stop: () => new Promise(() => {}),
    ask: options => new Promise(resolve => options.signal.addEventListener('abort', () => resolve({ response: 0 }), { once: true })) });
  assert.equal(outcome, 'time-limit');
});

test('a prompt that cannot be shown never blocks quitting', async () => {
  const outcome = await finishBackupBeforeQuit({ flush: () => later(40), graceMs: 5, stop: async () => {}, ask: async () => { throw Error('no window'); } });
  assert.equal(outcome, 'finished');
});

test('the prompt is translated into Cantonese', () => {
  const view = localizeDialogView(dialogView(QUIT_FLUSH_PROMPT), 'yue');
  assert.match(view.title, /完成緊備份/);
  assert.match(view.detail, /呢部電腦/);
  assert.match(view.buttons[0], /而家離開/);
});
