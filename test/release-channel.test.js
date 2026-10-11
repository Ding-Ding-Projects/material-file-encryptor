import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { promoteDefaultRelease } from '../scripts/release-channel.mjs';

const source = 'a'.repeat(40);
test('task releases invoke no main or promotion provider', async () => {
  const result = await promoteDefaultRelease({ ref: 'refs/heads/task/example', source,
    readMain: () => assert.fail('unexpected main lookup'), promote: () => assert.fail('unexpected promotion') });
  assert.equal(result.promoted, false); assert.equal(result.reason, 'not-main-ref');
});
test('stale main completion preserves latest and exact current main promotes once', async () => {
  const calls = [];
  const run = main => promoteDefaultRelease({ ref: 'refs/heads/main', source,
    readMain: () => { calls.push('read'); return main; }, promote: () => { calls.push('promote'); } });
  assert.equal((await run('b'.repeat(40))).reason, 'superseded-main-source');
  assert.deepEqual(calls, ['read']); calls.length = 0;
  assert.equal((await run(source)).promoted, true); assert.deepEqual(calls, ['read', 'promote']);
});
test('invalid or unavailable main proof never invokes promotion', async () => {
  for (const readMain of [() => 'invalid', () => { throw new Error('offline'); }]) {
    await assert.rejects(promoteDefaultRelease({ ref: 'refs/heads/main', source, readMain, promote: () => assert.fail('unexpected promotion') }));
  }
});
test('publisher creates download-only releases and invokes channel consumer after download hashes', async () => {
  const source = await readFile(new URL('../.github/scripts/publish-preview.ps1', import.meta.url), 'utf8');
  assert.match(source, /'--latest=false'/); assert.doesNotMatch(source, /make_latest=legacy/);
  assert.ok(source.indexOf('DOWNLOADED_ASSET_MISMATCH') < source.indexOf('& node scripts/release-channel.mjs'));
  assert.match(source, /Assert \(\$LASTEXITCODE -eq 0\) 'RELEASE_CHANNEL_VERIFICATION_FAILED'/);
});
