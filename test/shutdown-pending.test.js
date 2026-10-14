import test from 'node:test';
import assert from 'node:assert/strict';
import {describePending, shutdownPrompt} from '../src/main/shutdown-pending.js';

test('the shutdown prompt names exactly the work still running', () => {
  const lines = describePending({requests: 0, servers: 0, workflows: 1, converter: 2, models: 0}, 0);
  assert.deepEqual(lines, ['File conversions: 2', 'Document and download tasks: 1']);
  const prompt = shutdownPrompt(lines);
  assert.equal(prompt.title, 'Work is still running');
  assert.match(prompt.detail, /Still running:\nFile conversions: 2\nDocument and download tasks: 1$/);
});

test('drive transfers alone keep the transfer title and unknown counts are ignored', () => {
  const lines = describePending({requests: -1, converter: 1.5, models: '3'}, 2);
  assert.deepEqual(lines, ['Drive transfers: 2']);
  assert.equal(shutdownPrompt(lines).title, 'Transfers are still active');
  assert.equal(shutdownPrompt([]).title, 'Transfers are still active');
  assert.doesNotMatch(shutdownPrompt([]).detail, /Still running/);
});
