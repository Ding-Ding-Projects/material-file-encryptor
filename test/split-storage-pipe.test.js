import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { NativeClient, hydrationEvent } from '../src/main/native-client.js';
import { attachPartHydration, validateSplitStorageRequest } from '../src/main/split-storage/ipc.js';

const request = { event: 'hydratePart', requestId: 'f'.repeat(32), part: 'a'.repeat(32), location: 'hub-1', storageDir: 'C:\\Vault\\source', destination: `C:\\Vault\\cache\\parts\\${'a'.repeat(32)}.mfe.${'b'.repeat(32)}.fetch.tmp` };

function client(t) {
  const child = new EventEmitter();
  child.writes = [];
  child.stdin = new Writable({ write(chunk, _encoding, callback) { child.writes.push(chunk.toString()); callback(); } });
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const native = new NativeClient('pipe-fixture', { slowAfterMs: 60000, spawnProcess: () => child });
  t.after(() => { native.fail(new Error('done')); child.emit('close'); child.stdout.destroy(); });
  native.start();
  return { native, child };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('hydration events are validated field by field', () => {
  assert.deepEqual(hydrationEvent(request), { requestId: request.requestId, part: request.part, location: request.location, storageDir: request.storageDir, destination: request.destination });
  assert.deepEqual(hydrationEvent({ event: 'hydratePartCancel', requestId: request.requestId }), { requestId: request.requestId });
  for (const change of [{ requestId: 'x' }, { part: 'zz' }, { location: 'UPPER' }, { storageDir: 'relative' }, { destination: 'C:\\a\u0001b' }, { extra: 1 }])
    assert.equal(hydrationEvent({ ...request, ...change }), null, JSON.stringify(change));
  const { event, ...missing } = request; assert.equal(hydrationEvent({ event, ...missing, part: undefined }), null);
});

test('the native client emits hydratePart and still rejects unknown events', async t => {
  const { native, child } = client(t);
  const seen = []; native.on('hydratePart', value => seen.push(value));
  child.stdout.write(JSON.stringify(request) + '\n'); await tick();
  assert.equal(seen.length, 1); assert.equal(native.failure, null);
  child.stdout.write(JSON.stringify({ ...request, part: '../../evil' }) + '\n'); await tick();
  assert.match(native.failure?.message ?? '', /invalid response/);
});

test('each hydration request is answered once and a cancel aborts the fetch', async t => {
  const { native, child } = client(t);
  let release; const fetches = [];
  attachPartHydration(native, { hydrate: (value, signal) => { fetches.push(signal); return new Promise((resolve, reject) => { release = resolve; signal.addEventListener('abort', () => reject(Error('cancelled'))); }); } });
  child.stdout.write(JSON.stringify(request) + '\n'); await tick();
  release(); await tick(); await tick();
  const answers = child.writes.map(line => JSON.parse(line)).filter(line => line.method === 'hydratePartResult');
  assert.deepEqual(answers.map(line => line.params), [{ requestId: request.requestId, ok: true }]);
  const second = { ...request, requestId: 'e'.repeat(32) };
  child.stdout.write(JSON.stringify(second) + '\n'); await tick();
  child.stdout.write(JSON.stringify({ event: 'hydratePartCancel', requestId: second.requestId }) + '\n'); await tick(); await tick();
  assert.equal(fetches[1].aborted, true);
  assert.equal(child.writes.map(line => JSON.parse(line)).filter(line => line.method === 'hydratePartResult').length, 1, 'a cancelled request is not answered');
});

test('renderer requests accept only known shapes', () => {
  assert.deepEqual(validateSplitStorageRequest('applySplitStorage', {}), {});
  assert.throws(() => validateSplitStorageRequest('applySplitStorage', { force: true }));
  assert.throws(() => validateSplitStorageRequest('saveSplitStorage', { locations: [{ kind: 'folder', script: 'x' }] }));
  assert.throws(() => validateSplitStorageRequest('verifyMirror', { id: '../x' }));
  assert.deepEqual(validateSplitStorageRequest('verifyMirror', { id: 'mirror-1' }), { id: 'mirror-1' });
});
