import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { filterVersions, compareText, selectedVersions } from '../src/renderer/features/file-details/model.js';
import { createVersionSearch, VERSION_SEARCH_LIMITS } from '../src/renderer/features/file-details/version-search.js';

function search() {
 return createVersionSearch({ createWorker() {
  const url = new URL('../src/renderer/features/file-details/version-search-worker.js', import.meta.url).href;
  const worker = new Worker(`const {parentPort} = require('node:worker_threads'); globalThis.self = {postMessage: data => parentPort.postMessage(data)}; import(${JSON.stringify(url)}).then(() => parentPort.on('message', data => self.onmessage({data})));`, { eval: true });
  const adapter = { postMessage: data => worker.postMessage(data), terminate: () => worker.terminate() };
  worker.on('message', data => adapter.onmessage?.({ data }));
  worker.on('error', error => adapter.onerror?.(error));
  return adapter;
 } });
}

test('versions filter includes the full UTC day and stable selected ids', async () => {
 const rows = [{ id:'v1', path:'renamed.txt', timestampUtc:'2026-10-10T23:59:59.999Z' }, { id:'v2', path:'before.txt', timestampUtc:'2026-10-09T23:59:59Z' }];
 const bounded = search();
 assert.deepEqual(await filterVersions(rows, { from:'2026-10-10', to:'2026-10-10', pattern:'renamed\\.txt$' }, bounded), [rows[0]]);
 assert.deepEqual(selectedVersions(rows, new Set(['v1'])), [rows[0]]);
 assert.deepEqual(await filterVersions([], {}), []);
 await assert.rejects(filterVersions(rows, { pattern:'[' }, bounded), /Invalid regular expression/);
});
test('text comparison preserves markup as text and reports changes', () => {
 assert.equal(compareText('a\n<script>', 'a\n<img>'), '  a\n- <script>\n+ <img>');
 assert.throws(() => compareText('x\n'.repeat(5001), ''), /5,000/);
});

test('catastrophic expressions time out off the main thread', { timeout: 3000 }, async () => {
 const bounded = search();
 const rows = [{ id:'v1', path:'a'.repeat(20000) + '!', timestampUtc:'2026-10-10T00:00:00Z' }];
 let timerRan = false;
 const timer = setTimeout(() => { timerRan = true; }, 20);
 try {
  await assert.rejects(filterVersions(rows, { pattern:'^(a+)+$' }, bounded), /took too long/);
  assert.equal(timerRan, true, 'The main thread must remain responsive.');
 } finally { clearTimeout(timer); bounded.cancel(); }
});

test('new filters cancel stale work and search inputs are bounded', async () => {
 const bounded = search();
 const pending = bounded.filter([{ path:'a'.repeat(20000) + '!' }], '^(a+)+$');
 assert.deepEqual(await bounded.filter([{ path:'safe' }], ''), [{ path:'safe' }]);
 assert.equal(await pending, null);
 await assert.rejects(bounded.filter([], 'a'.repeat(VERSION_SEARCH_LIMITS.pattern + 1)), /256/);
 await assert.rejects(bounded.filter(Array(VERSION_SEARCH_LIMITS.rows + 1).fill({ path:'a' }), 'a'), /Too many versions/);
 await assert.rejects(bounded.filter([{ path:'a'.repeat(VERSION_SEARCH_LIMITS.rowText + 1) }], 'a'), /supported limit/);
});
