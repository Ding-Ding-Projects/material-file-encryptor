import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const desktopSource = fs.readFileSync(new URL('../scripts/desktop-check.mjs', import.meta.url), 'utf8');
const desktopReadback = desktopSource.split('    const readStartup = ')[1].split(';')[0];
const source = fs.readFileSync(new URL('../src/main/main.js', import.meta.url), 'utf8');
const helperStart = source.indexOf('function startupReadbackOptions(');
const body = source.slice(helperStart, source.indexOf('\nconst configPath'));
const create = vm.runInNewContext(body + '\ncreateVerificationStartup;');
function startupFixture({ verificationMode = false, packaged = true, platform = 'win32', adapter = false } = {}) {
  const calls = [];
  let enabled = true;
  const app = {
    isPackaged: packaged,
    getLoginItemSettings(options) { calls.push({ operation: 'read', options }); return { openAtLogin: enabled }; },
    setLoginItemSettings(options) { calls.push({ operation: 'write', options }); enabled = options.openAtLogin; },
  };
  const api = vm.runInNewContext(body + `
    if (${adapter}) verificationStartup = createVerificationStartup();
    ({ applyStartup, startupRegistration, restore: () => verificationStartup?.restore() });`, {
    app, verificationMode, process: { platform, execPath: 'C:\\Program Files\\Fixture\\fixture.exe' },
  });
  return { ...api, calls };
}
test('verification startup proof reports suppression without touching login items', () => {
  const seam = create();
  assert.equal(seam.read().enabled, false);
  assert.equal(seam.read().verificationOnly, true);
  assert.equal(seam.read().mutationSuppressed, true);
  assert.equal(seam.read().reason, 'VERIFICATION_STARTUP_DISABLED');
  assert.equal(seam.restore().restored, true);
  assert.equal(seam.restore().enabled, false);
  assert.equal(seam.restore().mutationSuppressed, true);
  assert.equal(seam.set, undefined, 'The verification adapter has no mutation operation.');
});
test('packaged isolated startup, preference requests and repeated shutdown never access login items', () => {
  for (const adapter of [false, true]) {
    const fixture = startupFixture({ verificationMode: true, adapter });
    // Initialization and preference requests share this production entrypoint.
    for (const enabled of [true, false, true, false]) {
      fixture.applyStartup(enabled);
      const state = fixture.startupRegistration();
      assert.equal(state.enabled, false);
      assert.equal(state.mutationSuppressed, true);
      assert.equal(state.verificationOnly, true);
    }
    if (adapter) {
      for (let index = 0; index < 3; index++) {
        assert.equal(fixture.restore().restored, true);
        assert.equal(fixture.restore().mutationSuppressed, true);
      }
    }
    assert.deepEqual(fixture.calls, [], 'Even a disabled startup request must not call the native setter.');
  }
});
test('production packaged Windows startup setter and readback retain their exact behavior', () => {
  const fixture = startupFixture();
  for (const enabled of [false, true]) {
    fixture.applyStartup(enabled);
    assert.equal(fixture.startupRegistration().enabled, enabled);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.calls)), [false, true].flatMap(enabled => [
    { operation: 'write', options: { openAtLogin: enabled, path: 'C:\\Program Files\\Fixture\\fixture.exe', args: ['--startup'] } },
    { operation: 'read', options: { path: '"C:\\Program Files\\Fixture\\fixture.exe"', args: ['--startup'] } },
  ]));
});
test('nonpackaged and non-Windows startup never write a login item', () => {
  for (const options of [{ packaged: false }, { platform: 'linux' }, { platform: 'darwin' }]) {
    const fixture = startupFixture(options);
    fixture.applyStartup(true); fixture.applyStartup(false);
    assert.deepEqual(fixture.calls, []);
  }
});
test('verification suppression requires the existing validated isolated-profile flags or restart context', () => {
  const selection = source.slice(source.indexOf('const verificationProfile = '), helperStart);
  const select = ({ argv = [], restartContext = null, testMode = false } = {}) => {
    const paths = [];
    const verificationMode = vm.runInNewContext(selection + '\nverificationMode;', {
      app: { setPath: (...args) => paths.push(args) }, process: { argv }, path: path.win32, restartContext, testMode,
    });
    return { verificationMode, paths };
  };
  const profile = 'C:\\OwnedVerification\\profile';
  assert.deepEqual(select(), { verificationMode: false, paths: [] });
  assert.equal(select({ argv: ['--desktop-check'] }).verificationMode, false);
  assert.equal(select({ argv: ['--desktop-check', '--user-data-dir=' + profile] }).verificationMode, false);
  assert.throws(() => select({ argv: ['--verification-profile=' + profile] }), /explicit absolute profile/);
  assert.throws(() => select({ argv: ['--desktop-check', '--verification-profile=relative-profile'] }), /explicit absolute profile/);
  assert.deepEqual(select({ argv: ['--desktop-check', '--verification-profile=' + profile] }), {
    verificationMode: true, paths: [['userData', profile]],
  });
  assert.deepEqual(select({ restartContext: { profile } }), {
    verificationMode: true, paths: [['userData', profile]],
  });
});
test('actual startup, settings and shutdown routes keep the centralized isolation boundary', () => {
  assert.equal((source.match(/app\.setLoginItemSettings\(/g) || []).length, 1);
  assert.equal((source.match(/applyStartup\(vaultSessions\.rows\.get\('main'\)\.preferences\.startup\)/g) || []).length, 2);
  assert.match(source, /if \(verificationMode && process\.platform === 'win32'\) verificationStartup = createVerificationStartup\(\);/);
  assert.match(source, /preflight:async\(\)=>\{verificationStartup\?\.restore\(\);\}/);
  assert.match(source, /const proof = verificationStartup\.restore\(\);/);
});
test('production startup readback round-trips space paths using native Windows command-line parsing', { skip: process.platform !== 'win32' }, () => {
  const paths = ['C:\\Program Files\\Startup Fixture\\fixture.exe', 'C:\\StartupFixture\\fixture.exe', 'C:\\Users\\Two Words\\StartupFixture\\fixture.exe'];
  const inputs = paths.flatMap(executable => [executable, '"' + executable + '"', '"' + executable + '" --startup']);
  const inputJson = JSON.stringify(inputs);
  const script = `Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class StartupParser {
 [DllImport("shell32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CommandLineToArgvW(string text, out int argc);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);
 public static string First(string text) { int count; var p=CommandLineToArgvW(text,out count); if(p==IntPtr.Zero)throw new InvalidOperationException("Parse failed");try{return Marshal.PtrToStringUni(Marshal.ReadIntPtr(p));}finally{LocalFree(p);} }
}
'@
$inputs = '${inputJson.replaceAll("'", "''")}' | ConvertFrom-Json
$results = @($inputs | ForEach-Object { @{input=$_;program=[StartupParser]::First($_)} })
$results | ConvertTo-Json -Compress
`;
  const parsed = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 15000 }));
  const programs = new Map(parsed.map(result => [result.input, result.program]));
  assert.notEqual(programs.get(paths[0]), paths[0], 'Native parser must demonstrate the unquoted-space mismatch.');
  assert.equal(programs.get(paths[1]), paths[1], 'Native parser retains a no-space executable without quotes.');
  const queryOptions = vm.runInNewContext(body + '\nstartupReadbackOptions;');
  for (const executable of paths) {
    const command = '"' + executable + '" --startup';
    assert.equal(programs.get('"' + executable + '"'), programs.get(command));
    assert.equal(queryOptions('"' + executable + '"').path, '"' + executable + '"', 'Existing quotes must not be duplicated.');
    const app = {
      getLoginItemSettings(options) {
        assert.deepEqual([...options.args], ['--startup']);
        assert.ok(programs.has(options.path), 'The query must use a natively parsed case.');
        return { openAtLogin: programs.get(command) === programs.get(options.path) };
      },
      setLoginItemSettings() { assert.fail('Readback must not write login items.'); },
    };
    const readOrdinary = vm.runInNewContext(body + '\nstartupRegistration;', {
      app, process: { platform: 'win32', execPath: executable }, verificationMode: false,
    });
    assert.equal(readOrdinary().enabled, true, 'Ordinary readback must normalize the native lookup.');
    const readDesktop = vm.runInNewContext(desktopReadback, { process: { execPath: executable }, evaluateApplication: callback => callback({ app }) });
    assert.equal(readDesktop(), true, 'Direct desktop readback must find the same native entry.');
  }
});

test('saving secondary preferences cannot overwrite the global startup setting', async () => {
  const body = source.match(/async function savePreferences\(\) \{([\s\S]*?)\n\}/)[1];
  const primary = { startup: false }, selected = { startup: true, cacheDir: 'C:\\Fixture\\Cache' };
  const writes = [];
  const run = vm.runInNewContext(`(async () => { ${body} })`, {
    state: { locked: true }, preferences: selected,
    vaultSessions: { remember() {}, rows: new Map([['main', { preferences: primary }]]), savedSessions: () => [] },
    fs: { mkdir: async () => {}, writeFile: async (_path, content) => writes.push(content) },
    app: { getPath: () => 'fixture' }, configPath: () => 'fixture/preferences.json',
    sessionSettings: { save: async () => {} },
  });
  await run();
  assert.equal(primary.startup, false);
  assert.equal(JSON.parse(writes[0]).startup, false);
  assert.match(source, /if \(params\.startup !== undefined\) vaultSessions\.rows\.get\('main'\)\.preferences\.startup = params\.startup;/);
});
