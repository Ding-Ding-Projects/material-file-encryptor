import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {runSquirrelLifecycle, squirrelEvent} from '../src/main/squirrel-lifecycle.js';
import {repairNativeHostRegistration, registerNativeHost, hostConfigFromIdentity, HOST_EXECUTABLE, NATIVE_HOST_NAME, REGISTRY_KEYS} from '../src/main/browser-host-registration.js';

const identity = JSON.parse(fs.readFileSync(new URL('../browser-extension/reviewed-identity.json', import.meta.url), 'utf8'));
const execPath = 'C:\\Users\\u\\AppData\\Local\\App\\app-2.0.0\\App.exe';

function harness(overrides = {}) {
  const log = [], timers = [], children = [];
  const options = {
    argv: ['App.exe', '--squirrel-updated'], platform: 'win32', packaged: true, execPath,
    resourcesPath: 'C:\\Users\\u\\AppData\\Local\\App\\app-2.0.0\\resources', userData: 'C:\\Users\\u\\AppData\\Roaming\\App',
    exit: code => log.push(['exit', code]),
    registerExplorer: executable => log.push(['explorer', executable]),
    removeExplorer: executable => log.push(['explorer-remove', executable]),
    disableLogin: () => log.push(['login-off']),
    nativeHostEvent: details => log.push(['host', details.argv[1]]),
    spawn: (file, args) => { const child = new EventEmitter(); child.unref = () => {}; children.push(child); log.push(['spawn', file, args]); return child; },
    setTimer: (fn, ms) => timers.push({fn, ms}),
    ...overrides,
  };
  return {options, log, timers, children};
}

test('the lifecycle event is read from the application arguments only', () => {
  assert.equal(squirrelEvent(['App.exe', '--squirrel-updated']), '--squirrel-updated');
  assert.equal(squirrelEvent(['App.exe', '--squirrel-firstrun']), null);
  assert.equal(squirrelEvent(['--squirrel-updated']), null, 'the executable slot is never an event');
  assert.equal(squirrelEvent(['App.exe', '--other']), null);
});

test('an update registers the host and shortcut first, then exits as soon as the shortcut helper ends', () => {
  const h = harness();
  const outcome = runSquirrelLifecycle(h.options);
  assert.equal(outcome.handled, true);
  assert.deepEqual(h.log.map(row => row[0]), ['explorer', 'host', 'spawn'], 'registration happens before anything can wait');
  assert.deepEqual(h.log[2].slice(1), ['C:\\Users\\u\\AppData\\Local\\App\\Update.exe', ['--createShortcut=App.exe']]);
  assert.equal(h.log.some(row => row[0] === 'exit'), false, 'it waits for the shortcut helper');
  h.children[0].emit('exit');
  assert.deepEqual(h.log.at(-1), ['exit', 0]);
});

test('a stalled shortcut helper cannot hold the hook past its watchdog', () => {
  const h = harness();
  runSquirrelLifecycle(h.options);
  assert.equal(h.timers.length, 1);
  assert.ok(h.timers[0].ms <= 8000, 'well inside the installer time budget');
  h.timers[0].fn();
  assert.deepEqual(h.log.at(-1), ['exit', 0]);
  h.children[0].emit('exit');
  assert.equal(h.log.filter(row => row[0] === 'exit').length, 1, 'exit is requested once');
});

test('a failing step never stops the remaining steps or the exit', () => {
  const h = harness({registerExplorer: () => { throw new Error('boom'); }, nativeHostEvent: () => { throw new Error('boom'); }, spawn: () => { throw new Error('boom'); }});
  assert.equal(runSquirrelLifecycle(h.options).handled, true);
  assert.deepEqual(h.log.at(-1), ['exit', 0]);
});

test('uninstall removes login item, context command and shortcut, and obsolete only touches the host', () => {
  const uninstall = harness({argv: ['App.exe', '--squirrel-uninstall']});
  runSquirrelLifecycle(uninstall.options);
  assert.deepEqual(uninstall.log.map(row => row[0]), ['login-off', 'explorer-remove', 'host', 'spawn']);
  assert.deepEqual(uninstall.log.at(-1)[2], ['--removeShortcut=App.exe']);
  const obsolete = harness({argv: ['App.exe', '--squirrel-obsolete']});
  runSquirrelLifecycle(obsolete.options);
  assert.deepEqual(obsolete.log.map(row => row[0]), ['host', 'exit']);
});

test('an unpackaged run never writes the host registration, and an ordinary start is not handled', () => {
  const dev = harness({packaged: false});
  runSquirrelLifecycle(dev.options);
  assert.equal(dev.log.some(row => row[0] === 'host'), false);
  const plain = harness({argv: ['App.exe']});
  assert.deepEqual(runSquirrelLifecycle(plain.options), {handled: false, event: null});
  assert.deepEqual(plain.log, []);
  assert.deepEqual(runSquirrelLifecycle(harness({platform: 'linux'}).options), {handled: false, event: null});
});

function installation(version) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'host-repair-'));
  const installRoot = path.join(root, `app-${version}`);
  const hostDirectory = path.join(installRoot, 'resources', 'browser-host');
  fs.mkdirSync(hostDirectory, {recursive: true});
  fs.writeFileSync(path.join(hostDirectory, HOST_EXECUTABLE), 'stub');
  fs.writeFileSync(path.join(hostDirectory, 'browser-host-config.json'), JSON.stringify(hostConfigFromIdentity(identity)));
  return {root, installRoot, hostDirectory};
}

test('startup repair rewrites a manifest that names another version and leaves a correct one alone', () => {
  const old = installation('1.0.0'), current = installation('2.0.0');
  const manifestDirectory = path.join(old.root, 'data', 'native-messaging');
  const calls = [];
  registerNativeHost({...old, manifestDirectory, run: () => {}});
  const manifestPath = path.join(manifestDirectory, `${NATIVE_HOST_NAME}.json`);
  assert.equal(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).path, path.join(old.hostDirectory, HOST_EXECUTABLE));

  const repaired = repairNativeHostRegistration({...current, manifestDirectory, run: (file, args) => calls.push([file, args])});
  assert.equal(repaired.repaired, true);
  assert.equal(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).path, path.join(current.hostDirectory, HOST_EXECUTABLE));
  assert.deepEqual(calls.map(call => call[1].slice(0, 2)), REGISTRY_KEYS.map(key => ['add', key]), 'the same two per-user keys');

  calls.length = 0;
  const untouched = repairNativeHostRegistration({...current, manifestDirectory, run: (file, args) => calls.push([file, args])});
  assert.equal(untouched.repaired, false);
  assert.deepEqual(calls, [], 'a matching manifest costs no registry writes');
});

test('startup repair writes a missing manifest, rejects a tampered origin list and keeps every safety check', () => {
  const current = installation('2.0.0');
  const manifestDirectory = path.join(current.root, 'data', 'native-messaging');
  const manifestPath = path.join(manifestDirectory, `${NATIVE_HOST_NAME}.json`);
  assert.equal(repairNativeHostRegistration({...current, manifestDirectory, run: () => {}}).repaired, true, 'missing manifest');
  const written = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.writeFileSync(manifestPath, JSON.stringify({...written, allowed_origins: ['chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/']}));
  assert.equal(repairNativeHostRegistration({...current, manifestDirectory, run: () => {}}).repaired, true, 'wrong origins');
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).allowed_origins, written.allowed_origins);
  assert.throws(() => repairNativeHostRegistration({hostDirectory: 'relative', installRoot: current.installRoot, manifestDirectory, run: () => assert.fail('registry must not be touched')}), /absolute/);
  const outside = installation('3.0.0');
  assert.throws(() => repairNativeHostRegistration({hostDirectory: outside.hostDirectory, installRoot: current.installRoot, manifestDirectory, run: () => assert.fail('registry must not be touched')}), /inside the installation root/);
});

test('the main module hands the lifecycle to the first import and no longer waits on the helper package', () => {
  const main = fs.readFileSync(new URL('../src/main/main.js', import.meta.url), 'utf8');
  assert.match(main.split('\n')[0], /squirrel-hook-entry\.js/, 'the lifecycle entry is the first import');
  assert.equal(/electron-squirrel-startup/.test(main), false);
  assert.match(main, /repairNativeHostRegistration\(/);
});
