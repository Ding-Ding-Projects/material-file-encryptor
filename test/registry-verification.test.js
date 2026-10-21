import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { registryVerificationDestination } from '../src/main/registry-verification.js';
test('normal profiles cannot select a test registry', () => {
  assert.equal(registryVerificationDestination({ argv: [], verificationMode: false }), null);
  const argv = ['--registry-test-endpoint=http://127.0.0.1:15221'];
  assert.throws(() => registryVerificationDestination({ argv, verificationMode: false, profile: os.tmpdir() }));
  assert.throws(() => registryVerificationDestination({ argv, verificationMode: true, profile: 'relative' }));
});
test('explicit isolated verification admits loopback only without registry credentials', () => {
  const options = { verificationMode: true, profile: path.join(os.tmpdir(), 'registry-verification') };
  assert.deepEqual(registryVerificationDestination({ ...options, argv: ['--registry-test-endpoint=http://127.0.0.1:15221'] }), { endpoint: 'http://127.0.0.1:15221', testOnly: true });
  for (const endpoint of ['http://192.168.1.1', 'https://registry-1.docker.io', 'http://127.0.0.1/path', 'http://user:pass@127.0.0.1'])
    assert.throws(() => registryVerificationDestination({ ...options, argv: [`--registry-test-endpoint=${endpoint}`] }));
  assert.throws(() => registryVerificationDestination({ ...options, argv: ['--registry-test-endpoint=http://127.0.0.1', '--registry-test-endpoint=http://localhost'] }));
});
