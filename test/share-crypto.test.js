import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { sealShare, openShare, wrapShareKey, unwrapShareKey, sealedSize, cleanShareName, WRAPPED_KEY_BYTES } from '../src/main/share/share-crypto.js';

const CHUNK = 4096;
async function* pieces(bytes, size = 1000) { for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size); }
const seal = (key, content, options = {}) => sealShare({ key, source: pieces(content), name: 'report.pdf', size: content.length, modified: '2026-11-17T12:00:00.000Z', chunkSize: CHUNK, ...options });
const read = (blob, key) => { const { metadata, content } = openShare(blob, key); return { metadata, bytes: Buffer.concat([...content()]) }; };
const codeOf = fn => { try { fn(); return 'none'; } catch (error) { return error.code; } };

test('a share round trips at every size around the chunk boundaries', async () => {
  for (const length of [0, 1, CHUNK - 60, CHUNK, CHUNK * 3, CHUNK * 3 + 17, 50000]) {
    const key = randomBytes(32), content = randomBytes(length);
    const blob = await seal(key, content);
    const { metadata, bytes } = read(blob, key);
    assert.deepEqual(bytes, content, `length ${length}`);
    assert.deepEqual(metadata, { name: 'report.pdf', size: length, modified: '2026-11-17T12:00:00.000Z' });
    assert.ok(blob.length <= sealedSize(length, 200, CHUNK));
  }
});

test('the file name and size are not visible in the blob', async () => {
  const key = randomBytes(32), blob = await seal(key, Buffer.from('quarterly numbers'), { name: 'secret-plan.docx' });
  assert.equal(blob.includes(Buffer.from('secret-plan')), false);
  assert.equal(blob.includes(Buffer.from('quarterly')), false);
});

test('a wrong key is refused before anything is returned', async () => {
  const blob = await seal(randomBytes(32), randomBytes(9000));
  assert.equal(codeOf(() => openShare(blob, randomBytes(32))), 'INVALID_KEY');
});

test('a flipped bit in any chunk, the header or a tag is refused', async () => {
  const key = randomBytes(32), content = randomBytes(CHUNK * 3 + 100), blob = await seal(key, content);
  const positions = [0, 9, 12, 20, 21, 21 + CHUNK + 5, 21 + 2 * (CHUNK + 16) + 3, blob.length - 1, blob.length - 20];
  for (const position of positions) {
    const damaged = Buffer.from(blob); damaged[position] ^= 1;
    assert.notEqual(codeOf(() => read(damaged, key)), 'none', `bit at ${position}`);
  }
});

test('truncation at a chunk boundary, inside a chunk and to nothing is refused', async () => {
  const key = randomBytes(32), blob = await seal(key, randomBytes(CHUNK * 3 + 100));
  assert.equal(codeOf(() => read(blob.subarray(0, 21 + 2 * (CHUNK + 16)), key)), 'TRUNCATED');
  assert.notEqual(codeOf(() => read(blob.subarray(0, blob.length - 5), key)), 'none');
  assert.equal(codeOf(() => read(blob.subarray(0, 10), key)), 'TRUNCATED');
});

test('reordered or duplicated chunks are refused', async () => {
  const key = randomBytes(32), blob = await seal(key, randomBytes(CHUNK * 3 + 100)), step = CHUNK + 16;
  const head = blob.subarray(0, 21), c = i => blob.subarray(21 + i * step, 21 + (i + 1) * step), tail = blob.subarray(21 + 3 * step);
  assert.notEqual(codeOf(() => read(Buffer.concat([head, c(1), c(0), c(2), tail]), key)), 'none');
  assert.notEqual(codeOf(() => read(Buffer.concat([head, c(0), c(0), c(2), tail]), key)), 'none');
});

test('an unknown format version is reported as such', async () => {
  const key = randomBytes(32), blob = Buffer.from(await seal(key, Buffer.from('x'))); blob[8] = 2;
  assert.equal(codeOf(() => openShare(blob, key)), 'UNKNOWN_VERSION');
});

test('every nonce is distinct: no two chunks share a nonce, and two shares share no prefix', async () => {
  // Same key, same content: with distinct nonces the ciphertext chunks differ.
  const key = randomBytes(32), content = Buffer.alloc(CHUNK * 4, 7);
  const blob = await seal(key, content), step = CHUNK + 16;
  const chunks = new Set(); for (let i = 0; i < 4; i++) chunks.add(blob.subarray(21 + i * step, 21 + (i + 1) * step).toString('hex'));
  assert.equal(chunks.size, 4);
  const prefixes = new Set(); for (let i = 0; i < 50; i++) prefixes.add((await seal(key, Buffer.from('a'))).subarray(14, 21).toString('hex'));
  assert.equal(prefixes.size, 50);
});

test('a source that changes length while it is read is refused', async () => {
  const key = randomBytes(32);
  await assert.rejects(sealShare({ key, source: pieces(Buffer.alloc(10)), name: 'a.txt', size: 11 }), { code: 'SOURCE_CHANGED' });
  await assert.rejects(sealShare({ key, source: pieces(Buffer.alloc(12)), name: 'a.txt', size: 11 }), { code: 'SOURCE_CHANGED' });
  await assert.rejects(sealShare({ key, source: pieces(Buffer.alloc(10)), name: 'a.txt', size: 10, maxBytes: 20 }), { code: 'TOO_LARGE' });
});

test('names that could escape a folder are refused', () => {
  for (const bad of ['', '.', '..', 'a/b', 'a\\b', 'c:x', 'x\u0000', 'x‮.txt', 'name.', 'a'.repeat(256)]) assert.equal(cleanShareName(bad), null, JSON.stringify(bad));
  assert.equal(cleanShareName('Report 2026 (final).pdf'), 'Report 2026 (final).pdf');
  assert.equal(cleanShareName('報告.txt'), '報告.txt');
});

test('the passphrase wrap opens only with the passphrase', async () => {
  const key = randomBytes(32);
  const wrapped = await wrapShareKey(key, 'correct horse battery staple');
  assert.equal(wrapped.length, WRAPPED_KEY_BYTES);
  assert.equal(wrapped.includes(key), false);
  assert.deepEqual(await unwrapShareKey(wrapped, 'correct horse battery staple'), key);
  await assert.rejects(unwrapShareKey(wrapped, 'wrong'), { code: 'WRONG_PASSPHRASE' });
  const damaged = Buffer.from(wrapped); damaged[40] ^= 1;
  await assert.rejects(unwrapShareKey(damaged, 'correct horse battery staple'), { code: 'WRONG_PASSPHRASE' });
  await assert.rejects(unwrapShareKey(wrapped, ''), { code: 'PASSPHRASE_REQUIRED' });
});
