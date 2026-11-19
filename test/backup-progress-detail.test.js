import test from 'node:test';
import assert from 'node:assert/strict';
import { progressPercent, statusBarState } from '../src/renderer/features/storage-maintenance/auto-backup/model.js';
import { progressView } from '../src/renderer/features/storage-maintenance/registry-progress.js';

// The case reported from a real drive: 1,140 of 5,752 objects sent, but only 283 KB of 5.6 GB, so a bytes-only
// percentage read 0% and looked stuck.
const progress = { step: 'uploading', unit: 'files', completedFiles: 1140, totalFiles: 5752, completedBytes: 283000, totalBytes: 5.6e9 };

test('the status bar percentage moves with files as well as bytes, and names the file count', () => {
  assert.equal(progressPercent(progress), 10);
  const line = statusBarState({ settings: { enabled: true }, drives: [{ sessionId: 's', enabled: true, phase: 'backing-up', progress }] }, 's');
  assert.equal(line.key, 'Backing up… {percent}% · {done} of {total} files');
  assert.equal(line.percent, 10);
  assert.equal(line.done, (1140).toLocaleString());
  assert.equal(line.total, (5752).toLocaleString());
});

test('the progress view knows the packing step and gives speed and time left', () => {
  const now = 1_000_000;
  const view = progressView({ step: 'packing', phase: 'packing', unit: 'files', completedFiles: 0, totalFiles: 1, completedBytes: 1e9, totalBytes: 3e9, stepStartedAt: now - 10_000 }, now);
  assert.equal(view.step, 'packing');
  assert.equal(view.phase, 'packing');
  assert.equal(view.rate, 1e8);
  assert.equal(view.remainingMs, 20_000);
  assert.equal(view.percent, 16);
  const early = progressView({ step: 'uploading', completedBytes: 10, totalBytes: 100, stepStartedAt: now - 1000 }, now);
  assert.equal(early.rate, null, 'no speed from a sample under three seconds');
});
