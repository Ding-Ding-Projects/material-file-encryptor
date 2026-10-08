import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRequest, trustedFrame } from '../src/main/validation.js';

test('bridge rejects extra fields, traversal, ambiguous credentials and unsafe actions', () => {
  assert.throws(() => validateRequest('__proto__', {}));
  assert.throws(() => validateRequest('constructor', {}));
  assert.throws(() => validateRequest('getState', { password: 'secret' }));
  for (const filename of ['../secret', 'folder/../../secret', 'C:\\secret', '/secret', 'folder\\..\\secret', 'x\0y']) assert.throws(() => validateRequest('openFile', { path: filename }));
  assert.deepEqual(validateRequest('openFile', { path: 'folder/document.txt' }), { path: 'folder/document.txt' });
  assert.throws(() => validateRequest('unlockVault', { storageDir: 'storage', cacheDir: 'cache', driveLetter: 'M:', password: 'pass', keyFilePath: 'key' }));
  assert.throws(() => validateRequest('windowControl', { action: 'execute' }));
  assert.throws(() => validateRequest('openExternal', { url: 'https://evil.example/' }));
  assert.throws(() => validateRequest('setPreferences', { startup: 'true' }));
  assert.throws(() => validateRequest('setPartSize', { partSizeBytes: Infinity }));
  assert.throws(() => validateRequest('importSelected', { paths: ['good', 5] }));
});
test('bridge accepts only the app main frame at its exact local URL', () => {
  const url = 'file:///app/index.html'; const frame = { url }; const contents = { mainFrame: frame }; const window = { webContents: contents };
  assert.equal(trustedFrame({ sender: contents, senderFrame: frame }, window, url), true);
  assert.equal(trustedFrame({ sender: contents, senderFrame: { url } }, window, url), false);
  assert.equal(trustedFrame({ sender: {}, senderFrame: frame }, window, url), false);
  frame.url = 'https://evil.example';
  assert.equal(trustedFrame({ sender: contents, senderFrame: frame }, window, url), false);
});
