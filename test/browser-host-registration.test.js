import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {registerNativeHost, unregisterNativeHost, computeExtensionId, hostConfigFromIdentity, REGISTRY_KEYS, NATIVE_HOST_NAME, HOST_EXECUTABLE} from '../src/main/browser-host-registration.js';
import {handleNativeHostSquirrelEvent} from '../src/main/browser-host-squirrel.js';
import {extensionId} from '../scripts/browser-native-registration.mjs';
import {validateBrowserHostConfig} from '../src/main/browser-native-host.js';

const identity = JSON.parse(fs.readFileSync(new URL('../browser-extension/reviewed-identity.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(new URL('../browser-extension/manifest.json', import.meta.url), 'utf8'));

function installation() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'host-registration-'));
  const installRoot = path.join(root, 'app-1.0.0');
  const hostDirectory = path.join(installRoot, 'resources', 'browser-host');
  fs.mkdirSync(hostDirectory, {recursive: true});
  fs.writeFileSync(path.join(hostDirectory, HOST_EXECUTABLE), 'stub');
  fs.writeFileSync(path.join(hostDirectory, 'browser-host-config.json'), JSON.stringify(hostConfigFromIdentity(identity)));
  return {root, installRoot, hostDirectory, manifestDirectory: path.join(root, 'data', 'native-messaging')};
}

test('extension id derivation matches a known vector and the existing script', () => {
  // Independent computation: first 32 hex digits of SHA-256 over the DER key, 0-f mapped to a-p.
  const der = Buffer.from(identity.publicKeyDerBase64, 'base64');
  const hex = createHash('sha256').update(der).digest('hex').slice(0, 32);
  const expected = [...hex].map(char => 'abcdefghijklmnop'[parseInt(char, 16)]).join('');
  assert.equal(computeExtensionId(der), expected);
  assert.equal(extensionId(der), expected);
  assert.equal(identity.extensionId, expected);
  assert.equal(expected, 'hfabajdjnmccemhokjnipmaabdpljbbg');
  // Known all-zero style vector: SHA-256 of empty input starts e3b0c442..., which maps to "ecdbapeccdc..." digits.
  assert.equal(computeExtensionId(Buffer.alloc(0)), [...'e3b0c44298fc1c149afbf4c8996fb924'].map(char => 'abcdefghijklmnop'[parseInt(char, 16)]).join(''));
});

test('the extension manifest key is the reviewed key and yields the reviewed id', () => {
  assert.equal(manifest.key, identity.publicKeyDerBase64);
  assert.equal(computeExtensionId(Buffer.from(manifest.key, 'base64')), identity.extensionId);
  const config = hostConfigFromIdentity(identity);
  assert.deepEqual(config.allowedOrigins, [`chrome-extension://${identity.extensionId}/`]);
  assert.doesNotThrow(() => validateBrowserHostConfig(config));
  assert.throws(() => hostConfigFromIdentity({...identity, extensionId: 'a'.repeat(32)}), /does not match/);
});

test('registration writes the manifest and sets exactly the two per-user keys with argument arrays', () => {
  const setup = installation();
  const calls = [];
  const result = registerNativeHost({...setup, run: (file, args) => calls.push([file, args])});
  const written = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
  assert.deepEqual(written, {name: NATIVE_HOST_NAME, description: 'Material File Encryptor download handoff', path: path.join(setup.hostDirectory, HOST_EXECUTABLE), type: 'stdio', allowed_origins: [`chrome-extension://${identity.extensionId}/`]});
  assert.deepEqual(calls.map(call => call[0]), ['reg.exe', 'reg.exe']);
  assert.deepEqual(calls.map(call => call[1]), REGISTRY_KEYS.map(key => ['add', key, '/ve', '/t', 'REG_SZ', '/d', result.manifestPath, '/f']));
  assert.deepEqual([...REGISTRY_KEYS], [`HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`, `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`]);
});

test('registration refuses a host outside the install root, relative paths, and a missing host', () => {
  const setup = installation();
  const run = () => assert.fail('registry must not be touched');
  assert.throws(() => registerNativeHost({...setup, installRoot: path.join(setup.root, 'elsewhere'), run}), /inside the installation root/);
  assert.throws(() => registerNativeHost({...setup, manifestDirectory: 'relative', run}), /absolute/);
  fs.rmSync(path.join(setup.hostDirectory, HOST_EXECUTABLE));
  assert.throws(() => registerNativeHost({...setup, run}), /not installed/);
});

test('uninstall removes exactly those keys and the manifest', () => {
  const setup = installation();
  registerNativeHost({...setup, run: () => {}});
  const calls = [];
  const result = unregisterNativeHost({manifestDirectory: setup.manifestDirectory, run: (file, args) => calls.push([file, args])});
  assert.equal(result.removed, true);
  assert.deepEqual(calls.map(call => call[1]), REGISTRY_KEYS.map(key => ['delete', key, '/f']));
  assert.equal(fs.existsSync(result.manifestPath), false);
});

test('obsolete hook of an older version leaves a newer installation registered', () => {
  const setup = installation();
  registerNativeHost({...setup, run: () => {}});
  const calls = [];
  const olderRoot = path.join(setup.root, 'app-0.9.0');
  const kept = unregisterNativeHost({manifestDirectory: setup.manifestDirectory, onlyIfOwnedBy: olderRoot, run: (...args) => calls.push(args)});
  assert.deepEqual(kept, {removed: false, reason: 'REGISTRATION_OWNED_BY_ANOTHER_INSTALLATION'});
  assert.equal(calls.length, 0);
  assert.equal(unregisterNativeHost({manifestDirectory: setup.manifestDirectory, onlyIfOwnedBy: setup.installRoot, run: () => {}}).removed, true);
});

test('squirrel lifecycle arguments map to the right action and never throw', () => {
  const log = [];
  const base = {execPath: 'C:\\Users\\u\\AppData\\Local\\App\\app-1.0.0\\App.exe', resourcesPath: 'C:\\Users\\u\\AppData\\Local\\App\\app-1.0.0\\resources', userData: 'C:\\Users\\u\\AppData\\Roaming\\App', register: input => (log.push(['register', input]), {}), unregister: input => (log.push(['unregister', input]), {})};
  assert.equal(handleNativeHostSquirrelEvent({...base, argv: ['App.exe']}), null);
  for (const event of ['--squirrel-install', '--squirrel-updated']) handleNativeHostSquirrelEvent({...base, argv: ['App.exe', event]});
  handleNativeHostSquirrelEvent({...base, argv: ['App.exe', '--squirrel-uninstall']});
  handleNativeHostSquirrelEvent({...base, argv: ['App.exe', '--squirrel-obsolete']});
  assert.deepEqual(log.map(row => row[0]), ['register', 'register', 'unregister', 'unregister']);
  assert.equal(log[0][1].hostDirectory, 'C:\\Users\\u\\AppData\\Local\\App\\app-1.0.0\\resources\\browser-host');
  assert.equal(log[0][1].installRoot, 'C:\\Users\\u\\AppData\\Local\\App\\app-1.0.0');
  assert.equal(log[2][1].onlyIfOwnedBy, null);
  assert.equal(log[3][1].onlyIfOwnedBy, 'C:\\Users\\u\\AppData\\Local\\App\\app-1.0.0');
  const failed = handleNativeHostSquirrelEvent({...base, argv: ['x', '--squirrel-install'], register: () => { throw new Error('boom'); }});
  assert.equal(failed.failed, true);
});
