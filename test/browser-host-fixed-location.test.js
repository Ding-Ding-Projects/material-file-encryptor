import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {registerNativeHost, unregisterNativeHost, repairNativeHostRegistration, fixedManifestDirectory, legacyManifestDirectory, migrateLegacyManifest, hostConfigFromIdentity, REGISTRY_KEYS, NATIVE_HOST_NAME, HOST_EXECUTABLE} from '../src/main/browser-host-registration.js';
import {handleNativeHostSquirrelEvent} from '../src/main/browser-host-squirrel.js';

const identity = JSON.parse(fs.readFileSync(new URL('../browser-extension/reviewed-identity.json', import.meta.url), 'utf8'));
const config = hostConfigFromIdentity(identity);

/** A fake Squirrel layout on disk: <root>/app-<version>/resources/browser-host plus per-profile user data folders. */
function layout(version = '2.0.0') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'host-fixed-'));
  const installRoot = path.join(root, 'Install', `app-${version}`);
  const hostDirectory = path.join(installRoot, 'resources', 'browser-host');
  fs.mkdirSync(hostDirectory, {recursive: true});
  fs.writeFileSync(path.join(hostDirectory, HOST_EXECUTABLE), 'stub');
  fs.writeFileSync(path.join(hostDirectory, 'browser-host-config.json'), JSON.stringify(config));
  return {root, installRoot, hostDirectory, execPath: path.join(installRoot, 'App.exe'), resourcesPath: path.join(installRoot, 'resources'), fixed: path.join(root, 'Install', 'native-messaging')};
}
const writeLegacy = (userData, body) => {
  const directory = path.join(userData, 'native-messaging');
  fs.mkdirSync(directory, {recursive: true});
  const file = path.join(directory, `${NATIVE_HOST_NAME}.json`);
  fs.writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body));
  return file;
};
const ours = {name: NATIVE_HOST_NAME, path: 'C:\\old\\host.exe', type: 'stdio', allowed_origins: config.allowedOrigins.slice()};

test('the fixed location is derived from the install root, one level above the versioned folder', () => {
  assert.equal(fixedManifestDirectory('C:\\Users\\u\\AppData\\Local\\App\\app-2.0.0\\App.exe'), 'C:\\Users\\u\\AppData\\Local\\App\\native-messaging');
  assert.equal(fixedManifestDirectory('C:\\Users\\u\\AppData\\Local\\App\\app-3.1.4-beta\\App.exe'), 'C:\\Users\\u\\AppData\\Local\\App\\native-messaging', 'the version does not change it');
  assert.equal(legacyManifestDirectory('C:\\Users\\u\\AppData\\Roaming\\App'), 'C:\\Users\\u\\AppData\\Roaming\\App\\native-messaging');
});

test('outside a Squirrel layout there is no location, so development runs never reach the registry', () => {
  assert.equal(fixedManifestDirectory('C:\\dev\\electron\\dist\\electron.exe'), null);
  assert.equal(fixedManifestDirectory('relative\\app-1.0.0\\App.exe'), null);
  assert.equal(fixedManifestDirectory(undefined), null);
  const calls = [];
  const result = handleNativeHostSquirrelEvent({argv: ['App.exe', '--squirrel-install'], execPath: 'C:\\dev\\electron\\dist\\electron.exe', resourcesPath: 'C:\\dev\\electron\\dist\\resources', userData: 'C:\\Users\\u\\AppData\\Roaming\\App', register: input => calls.push(input), unregister: input => calls.push(input)});
  assert.equal(result.failed, true);
  assert.deepEqual(calls, [], 'neither registration nor removal ran');
});

test('the user-data profile in use has no effect on the registered location or the keys', () => {
  const setup = layout();
  const seen = [];
  for (const userData of ['C:\\Users\\u\\AppData\\Roaming\\App', 'C:\\Temp\\isolated-profile']) {
    const outcome = handleNativeHostSquirrelEvent({argv: ['App.exe', '--squirrel-updated'], execPath: setup.execPath, resourcesPath: setup.resourcesPath, userData, register: input => { seen.push(input.manifestDirectory); return {}; }, unregister: () => ({})});
    assert.equal(outcome.event, '--squirrel-updated');
  }
  assert.deepEqual(seen, [setup.fixed, setup.fixed]);
});

test('registration and self-heal write one manifest inside the install root pointing at the current host', () => {
  const setup = layout();
  const calls = [];
  const run = (file, args) => calls.push(args);
  const repaired = repairNativeHostRegistration({hostDirectory: setup.hostDirectory, installRoot: path.dirname(setup.execPath), manifestDirectory: setup.fixed, run});
  assert.equal(repaired.repaired, true);
  const manifest = JSON.parse(fs.readFileSync(path.join(setup.fixed, `${NATIVE_HOST_NAME}.json`), 'utf8'));
  assert.equal(manifest.path, path.join(setup.hostDirectory, HOST_EXECUTABLE));
  assert.deepEqual(calls.map(args => args[1]), [...REGISTRY_KEYS]);
  assert.ok(calls.every(args => args[4] === 'REG_SZ' && args[6] === path.join(setup.fixed, `${NATIVE_HOST_NAME}.json`)));
  calls.length = 0;
  assert.equal(repairNativeHostRegistration({hostDirectory: setup.hostDirectory, installRoot: path.dirname(setup.execPath), manifestDirectory: setup.fixed, run}).repaired, false);
  assert.deepEqual(calls, [], 'a matching manifest touches no registry key');
});

test('uninstall removes both keys, the manifest file and its now-empty folder', () => {
  const setup = layout();
  registerNativeHost({hostDirectory: setup.hostDirectory, installRoot: path.dirname(setup.execPath), manifestDirectory: setup.fixed, run: () => {}});
  const calls = [];
  const result = unregisterNativeHost({manifestDirectory: setup.fixed, run: (file, args) => calls.push(args)});
  assert.equal(result.removed, true);
  assert.deepEqual(calls.map(args => args.slice(0, 2)), REGISTRY_KEYS.map(key => ['delete', key]));
  assert.equal(fs.existsSync(path.join(setup.fixed, `${NATIVE_HOST_NAME}.json`)), false);
  assert.equal(fs.existsSync(setup.fixed), false);
});

test('migration removes only this profile\'s own old manifest', () => {
  const setup = layout();
  const mine = path.join(setup.root, 'profile-a');
  const other = path.join(setup.root, 'profile-b');
  const foreign = path.join(setup.root, 'profile-c');
  const badOrigin = path.join(setup.root, 'profile-d');
  const unreadable = path.join(setup.root, 'profile-e');
  const mineFile = writeLegacy(mine, ours);
  const otherFile = writeLegacy(other, ours);
  const foreignFile = writeLegacy(foreign, {...ours, name: 'com.someone.else'});
  const badFile = writeLegacy(badOrigin, {...ours, allowed_origins: ['chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/']});
  const junkFile = writeLegacy(unreadable, 'not json');
  assert.equal(migrateLegacyManifest({userData: mine, allowedOrigins: config.allowedOrigins}).migrated, true);
  assert.equal(fs.existsSync(mineFile), false);
  assert.equal(fs.existsSync(path.dirname(mineFile)), false, 'the emptied folder goes too');
  assert.equal(fs.existsSync(otherFile), true, 'another profile is never touched');
  assert.equal(migrateLegacyManifest({userData: foreign, allowedOrigins: config.allowedOrigins}).migrated, false);
  assert.equal(migrateLegacyManifest({userData: badOrigin, allowedOrigins: config.allowedOrigins}).migrated, false);
  assert.equal(migrateLegacyManifest({userData: unreadable, allowedOrigins: config.allowedOrigins}).migrated, false);
  assert.ok([foreignFile, badFile, junkFile].every(file => fs.existsSync(file)));
  assert.equal(migrateLegacyManifest({userData: path.join(setup.root, 'missing'), allowedOrigins: config.allowedOrigins}).migrated, false);
  assert.equal(migrateLegacyManifest({userData: mine, allowedOrigins: []}).migrated, false);
});

test('install, update and self-heal migrate the old file of the current profile', () => {
  const setup = layout();
  const profile = path.join(setup.root, 'profile');
  const legacyFile = writeLegacy(profile, ours);
  const installed = handleNativeHostSquirrelEvent({argv: ['App.exe', '--squirrel-updated'], execPath: setup.execPath, resourcesPath: setup.resourcesPath, userData: profile, register: () => ({}), unregister: () => ({})});
  assert.equal(installed.legacy.migrated, true);
  assert.equal(fs.existsSync(legacyFile), false);
  const second = path.join(setup.root, 'profile-2');
  const secondFile = writeLegacy(second, ours);
  const healed = repairNativeHostRegistration({hostDirectory: setup.hostDirectory, installRoot: path.dirname(setup.execPath), manifestDirectory: setup.fixed, legacyUserData: second, run: () => {}});
  assert.equal(healed.legacy.migrated, true);
  assert.equal(fs.existsSync(secondFile), false);
});

test('uninstall also clears the profile\'s old file, and the obsolete hook leaves a newer registration alone', () => {
  const setup = layout('1.0.0');
  const profile = path.join(setup.root, 'profile');
  const legacyFile = writeLegacy(profile, ours);
  registerNativeHost({hostDirectory: setup.hostDirectory, installRoot: path.dirname(setup.execPath), manifestDirectory: setup.fixed, run: () => {}});
  const keyCalls = [];
  const obsolete = handleNativeHostSquirrelEvent({argv: ['App.exe', '--squirrel-obsolete'], execPath: path.join(setup.root, 'Install', 'app-0.9.0', 'App.exe'), resourcesPath: path.join(setup.root, 'Install', 'app-0.9.0', 'resources'), userData: profile, run: (...a) => keyCalls.push(a)});
  assert.equal(obsolete.removed, false);
  assert.equal(obsolete.reason, 'REGISTRATION_OWNED_BY_ANOTHER_INSTALLATION');
  assert.equal(fs.existsSync(legacyFile), true, 'obsolete never migrates');
  assert.ok(fs.existsSync(path.join(setup.fixed, `${NATIVE_HOST_NAME}.json`)));
  const removed = handleNativeHostSquirrelEvent({argv: ['App.exe', '--squirrel-uninstall'], execPath: setup.execPath, resourcesPath: setup.resourcesPath, userData: profile, unregister: input => unregisterNativeHost({...input, run: () => {}})});
  assert.equal(removed.removed, true);
  assert.equal(fs.existsSync(path.join(setup.fixed, `${NATIVE_HOST_NAME}.json`)), false);
  assert.equal(removed.legacy.migrated, true);
  assert.equal(fs.existsSync(legacyFile), false);
});

test('the main module derives the manifest folder from the executable and skips unpackaged layouts', () => {
  const main = fs.readFileSync(new URL('../src/main/main.js', import.meta.url), 'utf8');
  assert.match(main, /fixedManifestDirectory\(process\.execPath\)/);
  assert.equal(/manifestDirectory: path\.win32\.join\(app\.getPath\('userData'\)/.test(main), false);
});
