import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRegistryLogin, registryLoginRelayPath } from '../src/main/registry-login.js';

// Output captured from the real Docker 29.8.2 device sign-in through the relay: a pseudo console
// redraws with cursor moves instead of newlines.
const REAL_OUTPUT = '\x1b[?9001h\x1b[?1004h\x1b[?25l\x1b[2J\x1b[m\x1b[1m\x1b[2;1HUSING WEB-BASED LOGIN\r\n\x1b]0;C:\\docker.exe\x07\x1b[?25h\x1b[?25l\x1b[22m\r\n'
  + ' Info -> To sign in with credentials on the command line, use \'docker login -u <username>\'\r\n\x1b[9X\x1b[7;1HYour one-time device confirmation code is: \x1b[1mGXHF-QVJW\r\n'
  + 'Press ENTER\x1b[22m to open your browser or submit your device code here: \x1b[4mhttps://login.docker.com/activate\x1b[24m\x1b[10;1HWaiting for authentication in the browser\u2026\r\n\x1b[?25h';

function fakeChild() {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => child.emit('close', 1);
  return child;
}

function service(child) {
  return createRegistryLogin({ openPage: async () => {}, platform: 'win32',
    transport: { inspectRegistrySignIn: async () => ({ state: 'missing' }), registryLoginCommand: async () => ({ executable: 'C:\\docker.exe', configDirectory: 'C:\\config', env: {} }) },
    spawnProcess: () => { setTimeout(() => child.stdout.write(REAL_OUTPUT), 10); return child; } });
}

test('the device code reaches the panel from real pseudo console output', async () => {
  const child = fakeChild(); const login = service(child);
  login.start();
  await new Promise(resolve => setTimeout(resolve, 300));
  const status = login.status();
  assert.equal(status.state, 'authorizing');
  assert.equal(status.deviceCode, 'GXHF-QVJW');
  assert.equal(status.canOpenPage, true);
  await login.close();
  assert.equal(login.status().deviceCode, null);
});

test('a code that is split across output chunks is still parsed', async () => {
  const child = fakeChild();
  const login = createRegistryLogin({ openPage: async () => {}, platform: 'win32',
    transport: { inspectRegistrySignIn: async () => ({ state: 'missing' }), registryLoginCommand: async () => ({ executable: 'C:\\docker.exe', configDirectory: 'C:\\config', env: {} }) },
    spawnProcess: () => { setTimeout(() => { child.stdout.write(REAL_OUTPUT.slice(0, 120)); setTimeout(() => child.stdout.write(REAL_OUTPUT.slice(120)), 10); }, 10); return child; } });
  login.start();
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(login.status().deviceCode, 'GXHF-QVJW');
  await login.close();
});

test('the relay gives the child a real console instead of the relay pipes', () => {
  const script = fs.readFileSync(registryLoginRelayPath(), 'utf8');
  assert.match(script, /startup\.StartupInfo\.flags=0x100/);
  assert.match(script, /CreateJobObject/);
  assert.match(script, /JOB_OBJECT_LIMIT|0x00002000/);
});

test('a child started by the relay sees a console on stdin, stdout and stderr', { skip: process.platform !== 'win32' }, () => {
  const probe = 'Add-Type -TypeDefinition \'using System;using System.Runtime.InteropServices;public static class P{[DllImport("kernel32.dll")]public static extern IntPtr GetStdHandle(int n);[DllImport("kernel32.dll")]public static extern bool GetConsoleMode(IntPtr h,out uint m);}\';'
    + 'foreach($n in -10,-11,-12){$m=0;Write-Output ("std$n="+[P]::GetConsoleMode([P]::GetStdHandle($n),[ref]$m))}';
  const encoded = Buffer.from(probe, 'utf16le').toString('base64');
  const original = fs.readFileSync(registryLoginRelayPath(), 'utf8');
  const marker = '"\\""+executable+"\\" --config \\""+config+"\\" login"';
  assert.ok(original.includes(marker), 'relay command line changed, update this test');
  const patched = original.replace(marker, '"\\""+executable+"\\" -NoProfile -EncodedCommand ' + encoded + '"');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-console-'));
  try {
    const file = path.join(dir, 'relay.ps1'); fs.writeFileSync(file, patched);
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    // Redirected stdio on purpose: this is the situation in which the child used to inherit pipes.
    const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', file, '-DockerExecutable', powershell, '-ConfigurationDirectory', dir],
      { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    assert.equal(result.status, 0, result.stderr);
    for (const n of [-10, -11, -12]) assert.match(result.stdout, new RegExp(`std${n}=True`));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
