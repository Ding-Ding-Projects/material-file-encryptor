import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBytes, encodeText, decodeToBytes, decodeToText, createStreamEncoder, createStreamDecoder, buildDataUri, parseDataUri, toHexView, Base64Error, base64NameFor, originalNameFrom, sniffType } from '../src/shared/toolbox/base64-codec.js';

const sample = Uint8Array.from({ length: 1000 }, (_, i) => (i * 37 + 11) & 255);

test('matches Node for every variant and length', () => {
  for (let n = 0; n < 40; n++) {
    const bytes = sample.subarray(0, n);
    assert.equal(encodeBytes(bytes), Buffer.from(bytes).toString('base64'));
    assert.equal(encodeBytes(bytes, { variant: 'url' }), Buffer.from(bytes).toString('base64url'));
    assert.deepEqual(decodeToBytes(encodeBytes(bytes, { variant: 'url' }), { strict: true, variant: 'url' }), bytes);
    assert.deepEqual(decodeToBytes(encodeBytes(bytes, { variant: 'mime' })), bytes);
  }
});
test('mime wraps at 76 characters with CRLF', () => {
  const lines = encodeBytes(sample, { variant: 'mime' }).split('\r\n');
  assert.ok(lines.slice(0, -1).every(line => line.length === 76));
});
test('strict decoding reports exact offsets', () => {
  assert.throws(() => decodeToBytes('QUJD!', { strict: true }), error => error instanceof Base64Error && error.offset === 4);
  assert.throws(() => decodeToBytes('QUI=A', { strict: true }), error => error.code === 'DATA_AFTER_PADDING' && error.offset === 4);
  assert.throws(() => decodeToBytes('QU JD', { strict: true }), error => error.code === 'WHITESPACE' && error.offset === 2);
  assert.throws(() => decodeToBytes('QUJDR', { strict: true }), error => error.code === 'BAD_LENGTH');
  assert.deepEqual(Buffer.from(decodeToBytes('QU JD\n', { strict: false })), Buffer.from('ABC'));
});
test('text round trip with non-ASCII input', () => { assert.equal(decodeToText(encodeText('廣東話 ok')), '廣東話 ok'); });
test('streaming encode and decode match one-shot across odd chunk sizes', () => {
  for (const chunk of [1, 2, 3, 5, 77, 1000]) {
    const encoder = createStreamEncoder({ variant: 'mime' });
    let text = '';
    for (let i = 0; i < sample.length; i += chunk) text += encoder.write(sample.subarray(i, i + chunk));
    text += encoder.finish();
    assert.equal(text, encodeBytes(sample, { variant: 'mime' }));
    const decoder = createStreamDecoder();
    const parts = [];
    for (let i = 0; i < text.length; i += chunk + 1) parts.push(decoder.write(text.slice(i, i + chunk + 1)));
    parts.push(decoder.finish());
    assert.deepEqual(Buffer.concat(parts), Buffer.from(sample));
  }
});
test('data URI build and parse', () => {
  const uri = buildDataUri(Buffer.from('hi'), 'text/plain');
  assert.equal(uri, 'data:text/plain;base64,aGk=');
  assert.equal(Buffer.from(parseDataUri(uri).bytes).toString(), 'hi');
  assert.throws(() => buildDataUri(Buffer.from('x'), 'bad mime'), Base64Error);
  assert.equal(Buffer.from(parseDataUri('data:,a%20b').bytes).toString(), 'a b');
});
test('hex view, names and sniffing', () => {
  assert.match(toHexView(Buffer.from('AB')), /^00000000 {2}41 42/);
  assert.equal(base64NameFor('a.png'), 'a.png.base64.txt');
  assert.equal(originalNameFrom('a.png.base64.txt'), 'a.png');
  assert.equal(originalNameFrom('notes.txt'), null);
  assert.equal(sniffType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])).extension, 'png');
});
