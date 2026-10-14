import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PassThrough, Writable } from 'node:stream';
import { NativeClient } from '../src/main/native-client.js';

function fixture(t, options = {}) {
  const children = [], calls = [];
  const makeChild = () => {
    const child = new EventEmitter();
    child.writes = [];
    child.stdin = new Writable({ write(chunk, _encoding, callback) { child.writes.push(chunk.toString()); callback(); } });
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    children.push(child);
    return child;
  };
  const client = new NativeClient('protocol-fixture', {
    slowAfterMs: 60000,
    spawnProcess: (...args) => { calls.push(args); return makeChild(); },
    ...options,
  });
  t.after(() => {
    client.fail(new Error('Fixture finished.'));
    for (const child of children) {
      for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on('error', () => {});
      child.emit('close'); child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
    }
    client.reader?.close();
  });
  const request = (...args) => {
    const result = client.request(...args);
    result.catch(() => {});
    return result;
  };
  return { client, children, calls, request, get child() { return children.at(-1); } };
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
const respond = (child, value) => child.stdout.write(JSON.stringify(value) + '\n');

for (const [label, makeParams] of [
  ['circular parameters', () => { const value = {}; value.self = value; return value; }],
  ['BigInt parameters', () => ({ value: 1n })],
  ['throwing serialization', () => ({ toJSON() { throw new Error('sensitive fixture text'); } })],
]) {
  test(`rejects ${label} without spawning, leaking details or retaining pending work`, async t => {
    const f = fixture(t);
    await assert.rejects(f.request('importFiles', makeParams()), { message: 'Native request could not be serialized.' });
    assert.equal(f.calls.length, 0); assert.equal(f.client.pending.size, 0);
  });
}
test('rejects an oversized request before the helper loses its correlation ID', async t => {
  const f = fixture(t);
  const result = f.request('importFiles', { value: 'x'.repeat(1048576) });
  assert.equal(f.calls.length, 0); assert.equal(f.client.pending.size, 0);
  await assert.rejects(result, /Native request exceeded its limit/);
});
test('request size boundary counts UTF-16 code units and excludes the newline', async t => {
  const f = fixture(t);
  const overhead = JSON.stringify({ id: 1, method: 'echo', params: { value: '' } }).length;
  const value = '界'.repeat(1048576 - overhead);
  const result = f.request('echo', { value });
  assert.equal(f.child.writes[0].length, 1048577);
  respond(f.child, { id: 1, result: true }); assert.equal(await result, true);
});
test('rejects JSON nesting beyond the native parser limit before submission', async t => {
  const f = fixture(t); let params = {};
  for (let i = 0; i < 32; i++) params = { nested: params };
  const result = f.request('importFiles', params);
  assert.equal(f.calls.length, 0); assert.equal(f.client.pending.size, 0);
  await assert.rejects(result, /Native request exceeded its nesting limit/);
});
test('accepts the native nesting boundary and ignores escaped brackets inside strings', async t => {
  const f = fixture(t); let params = { value: '\\"' + '[{'.repeat(50) };
  for (let i = 0; i < 30; i++) params = { nested: params };
  const result = f.request('echo', params);
  respond(f.child, { id: 1, result: null }); assert.equal(await result, null);
});
for (const [label, line] of [
  ['null', 'null'], ['array', '[]'], ['primitive', 'true'], ['invalid JSON', '{'],
  ['missing terminal value', '{"id":1}'], ['uncorrelated error', '{"id":null,"error":"Invalid request"}'],
  ['ambiguous terminal value', '{"id":1,"result":true,"error":"failure"}'],
  ['invalid error object', '{"id":1,"error":{"message":{}}}'],
]) {
  test(`malformed reply (${label}) rejects safely and prevents reuse of a live helper`, async t => {
    const f = fixture(t); const result = f.request('importFiles');
    const rejection = assert.rejects(result, /Native helper returned an invalid response/); rejection.catch(() => {});
    assert.doesNotThrow(() => f.child.stdout.write(line + '\n'));
    assert.equal(f.client.pending.size, 0);
    await rejection;
    const retry = f.request('importFiles');
    assert.equal(f.calls.length, 1); assert.equal(f.child.writes.length, 1);
    await assert.rejects(retry, /Native helper returned an invalid response/);
  });
}
test('empty helper errors are not mistaken for successful undefined results', async t => {
  const f = fixture(t); const result = f.request('echo');
  const rejection = assert.rejects(result, /Native operation failed/);
  respond(f.child, { id: 1, error: '' }); await rejection;
});
test('normal replies correlate independently and both status payload forms remain supported', async t => {
  const f = fixture(t), statuses = []; f.client.on('status', value => statuses.push(value));
  const first = f.request('one'), second = f.request('two');
  respond(f.child, { event: 'status', status: { locked: true } });
  respond(f.child, { event: 'status', data: { locked: false } });
  respond(f.child, { id: 999, result: 'old reply' });
  respond(f.child, { id: 2, result: false }); respond(f.child, { id: 1, result: 0 });
  assert.deepEqual(await Promise.all([first, second]), [0, false]);
  assert.deepEqual(statuses, [{ locked: true }, { locked: false }]);
  assert.equal(f.client.pending.size, 0);
});
for (const stream of ['stdin', 'stdout', 'stderr']) {
  test(`${stream} errors are sanitized and never escape as unhandled events`, async t => {
    const f = fixture(t); const result = f.request('importFiles');
    const rejection = assert.rejects(result, { message: 'Native helper connection closed.' }); rejection.catch(() => {});
    assert.doesNotThrow(() => f.child[stream].emit('error', new Error('sensitive fixture text')));
    await rejection;
    await assert.rejects(f.request('importFiles'), /Native helper connection closed/);
    assert.equal(f.calls.length, 1);
  });
}
test('synchronous spawn failure is a sanitized promise rejection', async t => {
  const f = fixture(t, { spawnProcess() { throw new Error('sensitive fixture text'); } });
  let result;
  assert.doesNotThrow(() => { result = f.request('status'); });
  await assert.rejects(result, { message: 'Native helper could not start. Reinstall the Windows application.' });
  assert.equal(f.client.pending.size, 0);
});
test('synchronous write failure clears pending work and quarantines the connection', async t => {
  const f = fixture(t); f.client.start();
  f.child.stdin.write = () => { throw new Error('sensitive fixture text'); };
  await assert.rejects(f.request('importFiles'), { message: 'Native helper connection closed.' });
  assert.equal(f.client.pending.size, 0);
  await assert.rejects(f.request('importFiles'), /Native helper connection closed/);
  assert.equal(f.calls.length, 1);
});
test('failed spawn releases its child on close even when exit never occurs', async t => {
  const f = fixture(t); const first = f.request('status'); const old = f.child;
  const rejection = assert.rejects(first, /Native helper could not start/);
  old.emit('error', new Error('ENOENT')); await rejection; old.emit('close', -2);
  assert.equal(f.client.child, null);
  const second = f.request('status'); assert.equal(f.calls.length, 2);
  respond(f.child, { id: 2, result: true }); assert.equal(await second, true);
});
test('exit blocks admission but drains a final reply before close settles remaining requests', async t => {
  const f = fixture(t); let exits = 0; f.client.on('exit', () => exits++);
  const first = f.request('one'), second = f.request('two');
  const rejection = assert.rejects(second, /Native helper stopped/);
  f.child.emit('exit', 0);
  assert.equal(f.client.pending.size, 2); assert.equal(exits, 0);
  await assert.rejects(f.request('three'), /Native helper stopped/);
  respond(f.child, { id: 1, result: 'final' }); assert.equal(await first, 'final');
  f.child.emit('close', 0); await rejection;
  assert.equal(f.client.pending.size, 0); assert.equal(exits, 1);
});
test('late events from a previous child cannot affect its replacement', async t => {
  const f = fixture(t); const first = f.request('one'); const old = f.child;
  respond(old, { id: 1, result: true }); await first; old.emit('exit'); old.emit('close');
  const second = f.request('two');
  old.emit('error', new Error('late')); old.emit('exit'); old.emit('close');
  assert.equal(f.client.child, f.child); assert.equal(f.client.pending.size, 1);
  respond(f.child, { id: 2, result: true }); assert.equal(await second, true);
});
test('dispose is permanent and idempotent without cancelling an in-flight result', async t => {
  const f = fixture(t); const result = f.request('one'); const child = f.child;
  f.client.dispose(); f.client.dispose();
  await assert.rejects(f.request('two'), /Native client is disposed/);
  respond(child, { id: 1, result: true }); assert.equal(await result, true);
  child.emit('exit'); child.emit('close');
  await assert.rejects(f.request('three'), /Native client is disposed/);
  assert.equal(f.calls.length, 1);
});
test('disposing before the first request never launches a helper', async t => {
  const f = fixture(t); f.client.dispose();
  const result = f.request('one');
  assert.equal(f.calls.length, 0);
  await assert.rejects(result, /Native client is disposed/);
});
test('an unterminated oversized response is rejected before buffering another chunk', async t => {
  const f = fixture(t); const result = f.request('one');
  const rejection = assert.rejects(result, /Native helper response exceeded its limit/); rejection.catch(() => {});
  const chunk = Buffer.alloc(65536, 0x78);
  for (let i = 0; i < 129; i++) f.child.stdout.write(chunk);
  await nextTurn(); assert.equal(f.client.pending.size, 0); await rejection;
});
test('split UTF-8 and CRLF replies are decoded without corrupting Unicode', async t => {
  const f = fixture(t); const result = f.request('one');
  const frame = Buffer.from(JSON.stringify({ id: 1, result: '界😀' }) + '\r\n');
  for (const byte of frame) f.child.stdout.write(Buffer.from([byte]));
  assert.equal(await result, '界😀');
});

test('failed serialization leaves an already submitted operation intact', async t => {
  const f = fixture(t); const first = f.request('importFiles');
  const circular = {}; circular.self = circular;
  await assert.rejects(f.request('two', circular), /Native request could not be serialized/);
  assert.equal(f.client.pending.size, 1); assert.equal(f.child.writes.length, 1);
  respond(f.child, { id: 1, result: true }); assert.equal(await first, true);
});
test('serialization reentrancy reserves distinct request IDs', async t => {
  const f = fixture(t); let nested;
  const outer = f.request('outer', { toJSON() { nested = f.request('inner'); return {}; } });
  const sent = f.child.writes.map(line => JSON.parse(line));
  assert.deepEqual(sent.map(value => value.id), [2, 1]);
  respond(f.child, { id: 1, result: 'outer' }); respond(f.child, { id: 2, result: 'inner' });
  assert.deepEqual(await Promise.all([outer, nested]), ['outer', 'inner']);
});
test('write callback failure and its separate stream error settle every request safely', async t => {
  const f = fixture(t); const first = f.request('one');
  f.child.stdin._write = (_chunk, _encoding, callback) => callback(new Error('sensitive fixture text'));
  const second = f.request('two');
  await nextTurn(); assert.equal(f.client.pending.size, 0);
  await Promise.all([first, second].map(result => assert.rejects(result, { message: 'Native helper connection closed.' })));
  await assert.rejects(f.request('three'), /Native helper connection closed/);
  assert.equal(f.calls.length, 1);
});
test('a late write callback from a closed child cannot fail a new request', async t => {
  const f = fixture(t); f.client.start(); let callback;
  f.child.stdin.write = (_line, done) => { callback = done; return true; };
  const first = f.request('one'); const old = f.child;
  const rejection = assert.rejects(first, /Native helper stopped/);
  old.emit('exit'); old.emit('close'); await rejection;
  const second = f.request('two'); callback(new Error('late fixture error'));
  assert.equal(f.client.pending.size, 1);
  respond(f.child, { id: 2, result: true }); assert.equal(await second, true);
});
for (const [label, bytes] of [['invalid', [0xc3, 0x28]], ['truncated', [0xe7, 0x95]]]) {
  test(`${label} UTF-8 rejects pending work without replacement characters`, async t => {
    const f = fixture(t); const result = f.request('one');
    const rejection = assert.rejects(result, /Native helper returned an invalid response/); rejection.catch(() => {});
    f.child.stdout.end(Buffer.from(bytes));
    await nextTurn(); assert.equal(f.client.pending.size, 0); await rejection;
  });
}
test('the response limit is per line rather than per chunk', async t => {
  const f = fixture(t), first = f.request('one'), second = f.request('two');
  const firstFrame = JSON.stringify({ id: 1, result: 'a'.repeat(5 * 1024 * 1024) }) + '\n';
  const secondFrame = JSON.stringify({ id: 2, result: 'b'.repeat(5 * 1024 * 1024) }) + '\n';
  f.child.stdout.write(firstFrame + secondFrame);
  const results = await Promise.all([first, second]);
  assert.equal(results[0].length, 5 * 1024 * 1024); assert.equal(results[1].length, 5 * 1024 * 1024);
});
test('the exact response length boundary remains accepted', async t => {
  const f = fixture(t); const result = f.request('one');
  const overhead = JSON.stringify({ id: 1, result: '' }).length;
  const value = 'x'.repeat(8 * 1024 * 1024 - overhead);
  respond(f.child, { id: 1, result: value }); assert.equal((await result).length, value.length);
});
test('credentials remain in the private pipe, not executable arguments or diagnostics', async t => {
  const f = fixture(t, { managedDataRoot: 'fixture-managed-root' });
  const result = f.request('unlock', { password: 'synthetic-test-password' });
  const [executable, args, options] = f.calls[0];
  assert.equal(executable, 'protocol-fixture');
  assert.deepEqual(args, ['--managed-data-root', 'fixture-managed-root']);
  assert.deepEqual(options, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
  assert.equal(JSON.parse(f.child.writes[0]).params.password, 'synthetic-test-password');
  f.child.stderr.write('synthetic backend diagnostic');
  respond(f.child, { id: 1, result: true }); assert.equal(await result, true);
});
test('real failed spawn reaches close without exit and does not retain a dead child', async () => {
  const client = new NativeClient(`${process.execPath}.missing-${randomUUID()}`);
  const closed = once(client, 'exit');
  const result = client.request('status');
  const pipeClosed = new Promise(resolve => client.child.once('close', resolve));
  await assert.rejects(result, /Native helper could not start/);
  await pipeClosed; assert.equal(client.child, null);
  await closed; assert.equal(client.pending.size, 0);
  client.dispose();
});
test('a real protocol child drains a buffered final reply and exits naturally', async t => {
  // This isolated Node child has no native drive, credentials or filesystem access.
  const script = `const r=require('node:readline').createInterface({input:process.stdin});r.once('line',line=>{const q=JSON.parse(line);process.stdout.write(JSON.stringify({id:q.id,result:'x'.repeat(512*1024)})+'\\n');r.close();process.stdin.destroy();});`;
  const client = new NativeClient('protocol-fixture', { spawnProcess: (_executable, _args, options) => spawn(process.execPath, ['-e', script], options) });
  t.after(() => client.dispose());
  const closed = once(client, 'exit');
  assert.equal((await client.request('one')).length, 512 * 1024);
  await closed; assert.equal(client.child, null); assert.equal(client.pending.size, 0);
});
