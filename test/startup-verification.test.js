import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
const desktopSource = fs.readFileSync(new URL('../scripts/desktop-check.mjs', import.meta.url), 'utf8');
const desktopReadback = desktopSource.split('    const readStartup = ')[1].split(';')[0];
const source = fs.readFileSync(new URL('../src/main/main.js', import.meta.url), 'utf8');
const helperStart = source.indexOf('function startupReadbackOptions(');
const body = source.slice(helperStart >= 0 ? helperStart : source.indexOf('function createVerificationStartup('), source.indexOf('\nlet verificationStartup;'));
const create = vm.runInNewContext(body + '\ncreateVerificationStartup;');
test('verification startup mutates only its unique entry and restores absence', () => {
  const entries = new Map([['UserEntry', { name: 'UserEntry', enabled: true }]]);
  const calls = [];
  const app = { getLoginItemSettings(options) { assert.equal(options.path, '"fixture.exe"'); assert.deepEqual([...options.args], ['--startup']); return { launchItems: [...entries.values()] }; }, setLoginItemSettings(options) { calls.push(options); if (options.openAtLogin) entries.set(options.name, { name: options.name, enabled: options.enabled }); else entries.delete(options.name); } };
  const seam = create(app, 'fixture.exe', 'UniqueVerification');
  assert.equal(seam.read().enabled, false); seam.set(true); assert.equal(seam.read().enabled, true); seam.set(false); assert.equal(seam.read().enabled, false);
  assert.equal(seam.restore().restored, true); assert.equal(entries.get('UserEntry').enabled, true); assert.equal(calls.every(call => call.name === 'UniqueVerification'), true);
});
test('verification startup refuses an existing entry before mutation', () => {
  let mutated = false;
  assert.throws(() => create({ getLoginItemSettings: () => ({ launchItems: [{ name: 'Collision', enabled: false }] }), setLoginItemSettings: () => { mutated = true; } }, 'fixture.exe', 'Collision'), /already exists/);
  assert.equal(mutated, false);
});
test('verification startup round-trips space paths using native Windows command-line parsing', { skip: process.platform !== 'win32' }, () => {
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
    const entries = new Map([['UserEntry', { name: 'UserEntry', enabled: true, command }]]);
    const calls = [];
    const app = {
      getLoginItemSettings(options) {
        assert.deepEqual([...options.args], ['--startup']);
        assert.ok(programs.has(options.path), 'The query must use a natively parsed case.');
        const launchItems = [...entries.values()].filter(item => programs.get(item.command) === programs.get(options.path));
        return { launchItems, openAtLogin: launchItems.some(item => item.name === 'UniqueVerification' && item.enabled) };
      },
      setLoginItemSettings(options) {
        assert.equal(options.path, executable, 'Setter path remains unchanged.');
        assert.deepEqual([...options.args], ['--startup']);
        assert.equal(options.name, 'UniqueVerification');
        calls.push(options);
        if (options.openAtLogin) entries.set(options.name, { name: options.name, enabled: options.enabled, command }); else entries.delete(options.name);
      },
    };
    const seam = create(app, executable, 'UniqueVerification');
    const helperBody = source.slice(source.indexOf('function startupReadbackOptions('), source.indexOf('function createVerificationStartup('));
    const ordinaryBody = source.slice(source.indexOf('function startupRegistration('), source.indexOf('\nconst configPath'));
    const readOrdinary = vm.runInNewContext(helperBody + ordinaryBody + '\nstartupRegistration;', { app, process: { platform: 'win32', execPath: executable }, verificationStartup: undefined });
    assert.equal(seam.read().enabled, false);
    seam.set(true); assert.equal(seam.read().enabled, true, 'Enabled native entry must be found for this executable.');
    assert.equal(readOrdinary().enabled, true, 'Ordinary readback must normalize the same native lookup.');
    const readDesktop = vm.runInNewContext(desktopReadback, { process: { execPath: executable }, evaluateApplication: callback => callback({ app }) });
    assert.equal(readDesktop(), true, 'Direct desktop readback must find the same native entry.');
    seam.set(false); assert.equal(seam.read().enabled, false);
    assert.equal(readOrdinary().enabled, false);
    assert.equal(seam.restore().restored, true);
    assert.equal(entries.get('UserEntry').enabled, true);
    assert.equal(calls.length, 3);
  }
});
