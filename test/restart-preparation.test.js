import test from 'node:test';
import assert from 'node:assert/strict';
import { createRestartPreparation } from '../src/main/restart-preparation.js';

test('partial closure preserves recovery marker and permits only a shutdown retry', async () => {
  const calls = []; let fail = true;
  const preparation = createRestartPreparation({
    verify: async () => calls.push('verify'), preflight: async () => calls.push('preflight'),
    closeServices: async () => { calls.push('close'); if (fail) throw Error('CLOSE_FAILED'); },
    clearMarker: async () => calls.push('marker'), disposeHelper: async () => calls.push('helper'),
    prepared: () => calls.push('prepared'),
  });
  await assert.rejects(preparation.run(), /CLOSE_FAILED/);
  assert.equal(preparation.started, true); assert.equal(preparation.completed, false);
  assert.deepEqual(calls, ['verify', 'preflight', 'close']);
  fail = false; await preparation.run(); await preparation.run();
  assert.deepEqual(calls, ['verify', 'preflight', 'close', 'close', 'marker', 'helper', 'prepared']);
  assert.equal(preparation.completed, true);
});

test('preflight failure leaves resources intact and rechecks admission on retry', async () => {
  let verifies = 0, fail = true, closed = false;
  const preparation = createRestartPreparation({ verify: async () => verifies++,
    preflight: async () => { if (fail) throw Error('PREFLIGHT_FAILED'); },
    closeServices: async () => { closed = true; }, clearMarker: async () => {},
    disposeHelper: async () => {}, prepared: () => {},
  });
  await assert.rejects(preparation.run(), /PREFLIGHT_FAILED/);
  assert.equal(preparation.started, false); assert.equal(closed, false);
  fail = false; await preparation.run(); assert.equal(verifies, 2);
});

test('concurrent teardown callers share one pending preparation', async () => {
  let finish, closes = 0;
  const preparation = createRestartPreparation({ verify: async () => {}, preflight: async () => {},
    closeServices: () => { closes++; return new Promise(resolve => { finish = resolve; }); },
    clearMarker: async () => {}, disposeHelper: async () => {}, prepared: () => {},
  });
  const first = preparation.run(), second = preparation.run();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(closes, 1);
  finish(); await Promise.all([first, second]); assert.equal(preparation.completed, true);
});
