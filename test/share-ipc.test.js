import test from 'node:test';
import assert from 'node:assert/strict';
import { validateShareRequest, receiveArgument, SHARE_METHODS } from '../src/main/share/ipc.js';
import { validateRequest } from '../src/main/validation.js';
import { registerShareProtocol, SHARE_PROTOCOL_KEY } from '../src/main/share/share-protocol.js';
import { runSquirrelLifecycle } from '../src/main/squirrel-lifecycle.js';

const id = '0123abcd-0123-4abc-8def-0123456789ab';

test('share requests are shape checked through the shared validator', () => {
  for (const method of SHARE_METHODS) assert.throws(() => validateRequest(method, { unexpected: true }), /Invalid share request/);
  assert.deepEqual(validateRequest('shareCreate', { entryId: 'e1' }), { entryId: 'e1', passphrase: null });
  assert.deepEqual(validateRequest('shareReceive', { command: 'x' }), { command: 'x', passphrase: null });
  assert.throws(() => validateShareRequest('shareReceive', { command: 'x', incomingId: id }));
  assert.throws(() => validateShareRequest('shareReceive', {}));
  assert.throws(() => validateShareRequest('shareReceive', { command: 'x'.repeat(4097) }));
  assert.throws(() => validateShareRequest('shareReceiveSave', { receiveId: id, destination: 'C:\\' }));
  assert.throws(() => validateShareRequest('shareRevoke', { id: '../x' }));
  assert.deepEqual(validateShareRequest('shareReceiveSave', { receiveId: id, destination: 'drive' }), { receiveId: id, destination: 'drive' });
});

test('the command line share is found after --receive or as a trailing link only', () => {
  assert.equal(receiveArgument(['app.exe', '--receive', 'mfe-share:v1:x']), 'mfe-share:v1:x');
  assert.equal(receiveArgument(['app.exe', 'material-file-encryptor://receive/v1/x']), 'material-file-encryptor://receive/v1/x');
  assert.equal(receiveArgument(['app.exe', '--startup']), null);
  assert.equal(receiveArgument(['app.exe', '--receive']), null);
});

test('the link handler is written per user and removed on uninstall', () => {
  const calls = [];
  const run = (file, args) => calls.push([file, ...args]);
  registerShareProtocol('C:\\Users\\u\\AppData\\Local\\App\\app-2.0.0\\App.exe', { run, platform: 'win32' });
  assert.ok(calls.every(call => call[0] === 'reg.exe' && call[2].startsWith(SHARE_PROTOCOL_KEY) && SHARE_PROTOCOL_KEY.startsWith('HKCU\\')));
  assert.ok(calls.some(call => call.includes('URL Protocol')));
  assert.ok(calls.some(call => call.includes('"C:\\Users\\u\\AppData\\Local\\App\\app-2.0.0\\App.exe" --receive "%1"')));
  calls.length = 0;
  registerShareProtocol(null, { remove: true, run, platform: 'win32' });
  assert.deepEqual(calls, [['reg.exe', 'delete', SHARE_PROTOCOL_KEY, '/f']]);
  assert.throws(() => registerShareProtocol('relative.exe', { run, platform: 'win32' }));
  assert.equal(registerShareProtocol('C:\\a.exe', { run, platform: 'linux' }), false);
});

test('the Squirrel install, update and uninstall hooks register and remove the link handler', () => {
  for (const [event, expected] of [['--squirrel-install', 'register'], ['--squirrel-updated', 'register'], ['--squirrel-uninstall', 'remove']]) {
    const log = [];
    runSquirrelLifecycle({ argv: ['App.exe', event], platform: 'win32', packaged: false, execPath: 'C:\\A\\app-1\\App.exe', exit: () => {},
      registerExplorer: () => {}, removeExplorer: () => {}, disableLogin: () => {}, nativeHostEvent: () => {},
      registerProtocol: () => log.push('register'), removeProtocol: () => log.push('remove'),
      spawn: () => ({ once() {}, unref() {} }), setTimer: () => {} });
    assert.deepEqual(log, [expected], event);
  }
});
