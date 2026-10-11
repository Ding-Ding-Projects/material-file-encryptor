import test from 'node:test';
import assert from 'node:assert/strict';
import { onPageDiscard } from '../src/renderer/page-lifecycle.js';

test('cancelled navigation preserves the live workspace and final unload disposes once', () => {
  const target = new EventTarget(); let calls = 0;
  onPageDiscard(target, () => calls++);
  const attempt = new Event('beforeunload', { cancelable: true });
  attempt.preventDefault(); target.dispatchEvent(attempt);
  assert.equal(calls, 0);
  target.dispatchEvent(new Event('unload'));
  target.dispatchEvent(new Event('unload'));
  assert.equal(calls, 1);
});

test('removed page cleanup does not run on later discard', () => {
  const target = new EventTarget(); let calls = 0;
  const remove = onPageDiscard(target, () => calls++);
  remove(); target.dispatchEvent(new Event('unload'));
  assert.equal(calls, 0);
});
