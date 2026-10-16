import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { NativeClient } from '../src/main/native-client.js';
function fixture() {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const client = new NativeClient('fixture', { spawnProcess: () => child, slowAfterMs: 5 });
  return { client, child };
}
test('slow upgrade retains request identity until a terminal response', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { client, child } = fixture();
  const warning = new Promise(resolve => client.once('slow', resolve));
  let settled = false;
  const result = client.request('copyUpgrade').finally(() => { settled = true; });
  t.mock.timers.tick(5);
  const observed = await warning;
  assert.equal(observed.method, 'copyUpgrade'); assert.equal(client.pending.has(observed.id), true); assert.equal(settled, false);
  child.stdout.write(JSON.stringify({ id: observed.id, result: { locked: false } }) + '\n');
  assert.deepEqual(await result, { locked: false }); assert.equal(client.pending.size, 0);
  client.reader.close();
});
test('helper close is terminal for a slow request after stdout drains', async () => {
  const { client, child } = fixture();
  const result = client.request('importFiles');
  const rejection = assert.rejects(result, /Native helper stopped/);
  child.emit('exit'); assert.equal(client.pending.size, 1);
  child.emit('close'); await rejection; assert.equal(client.pending.size, 0); client.reader.close();
});
