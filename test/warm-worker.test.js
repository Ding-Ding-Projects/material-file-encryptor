import test from 'node:test';
import assert from 'node:assert/strict';
import {createWarmWorkerRunner} from '../src/shared/surface/warm-worker.js';

function fakeFactory(script) {
  const made = [];
  const createWorker = () => {
    const worker = {terminated: false, onmessage: null, onerror: null, received: [],
      emit(data) { setImmediate(() => worker.onmessage?.({data})); },
      postMessage(payload) { worker.received.push(payload); script(worker, payload, made.length); },
      terminate() { worker.terminated = true; }};
    made.push(worker);
    return worker;
  };
  return {createWorker, made};
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('start-up time is not charged to the match budget', async () => {
  const {createWorker, made} = fakeFactory((worker, payload) => {
    // Slow to start (longer than the match budget), instant to match.
    setTimeout(() => { worker.emit({ready: true}); worker.emit({matches: [payload.n]}); }, 120);
  });
  const runner = createWarmWorkerRunner({createWorker, matchBudget: 40, startBudget: 5000});
  assert.deepEqual(await runner.run({n: 1}), {matches: [1]});
  assert.equal(made.length, 1);
  runner.dispose();
});

test('a finished worker stays warm and serves the next job', async () => {
  let jobs = 0;
  const {createWorker, made} = fakeFactory((worker, payload, count) => {
    jobs += 1;
    if (jobs === 1) worker.emit({ready: true});
    worker.emit({matches: [payload.n]});
  });
  const runner = createWarmWorkerRunner({createWorker, matchBudget: 500});
  assert.deepEqual(await runner.run({n: 1}), {matches: [1]});
  assert.deepEqual(await runner.run({n: 2}), {matches: [2]});
  assert.equal(made.length, 1, 'the worker is reused');
  assert.equal(made[0].terminated, false);
  runner.dispose();
  assert.equal(made[0].terminated, true);
});

test('a runaway match is terminated after the match budget and the next job gets a fresh worker', async () => {
  const {createWorker, made} = fakeFactory((worker, payload, count) => {
    worker.emit({ready: true});
    if (!payload.hang) worker.emit({matches: []});
  });
  const runner = createWarmWorkerRunner({createWorker, matchBudget: 50});
  await assert.rejects(runner.run({hang: true}), error => error.code === 'match-timeout');
  assert.equal(made[0].terminated, true);
  assert.deepEqual(await runner.run({}), {matches: []});
  assert.equal(made.length, 2);
  runner.dispose();
});

test('a worker that never becomes ready fails with an honest start error', async () => {
  const {createWorker, made} = fakeFactory(() => {});
  const runner = createWarmWorkerRunner({createWorker, matchBudget: 20, startBudget: 60});
  await assert.rejects(runner.run({}), error => error.code === 'start-timeout');
  assert.equal(made[0].terminated, true);
  runner.dispose();
});

test('a newer job supersedes the running one and disposal rejects further jobs', async () => {
  const {createWorker, made} = fakeFactory((worker, payload) => {
    worker.emit({ready: true});
    if (!payload.hang) worker.emit({matches: [7]});
  });
  const runner = createWarmWorkerRunner({createWorker, matchBudget: 2000});
  const first = runner.run({hang: true});
  const firstRejected = assert.rejects(first, error => error.code === 'superseded');
  assert.deepEqual(await runner.run({}), {matches: [7]});
  await firstRejected;
  assert.equal(made[0].terminated, true);
  await sleep(0);
  runner.dispose();
  await assert.rejects(runner.run({}), error => error.code === 'disposed');
});

test('a worker error is reported and the worker is discarded', async () => {
  const {createWorker, made} = fakeFactory(worker => { setImmediate(() => worker.onerror?.(new Error('boom'))); });
  const runner = createWarmWorkerRunner({createWorker, matchBudget: 100});
  await assert.rejects(runner.run({}), error => error.code === 'worker-error');
  assert.equal(made[0].terminated, true);
  runner.dispose();
});
