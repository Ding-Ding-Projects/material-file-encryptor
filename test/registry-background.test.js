import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRegistryBackground } from '../src/main/registry-background.js';
const principal = 'S-1-5-21-123-456-789-1001';
async function fixture(t, { xml, marker } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-task-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  if (marker) await fs.writeFile(path.join(root, 'registry-task-owned.json'), JSON.stringify(marker));
  const commands = []; let stored = xml;
  const executable = 'C:\\Program Files\\MaterialFileEncryptor\\MaterialFileEncryptor.exe';
  const run = async (binary, args) => {
    commands.push({ binary, args });
    if (binary.endsWith('whoami.exe')) return { stdout: `"user","${principal}"` };
    if (args.includes('/Query')) { if (!stored) throw Object.assign(Error(), { code: 1 }); return { stdout: stored }; }
    if (args.includes('/Create')) { stored = (await fs.readFile(path.join(root, 'registry-task.xml'))).toString('utf16le'); return { stdout: '' }; }
    if (args.includes('/Delete')) { stored = null; return { stdout: '' }; }
    throw Error('Unexpected command');
  };
  return { root, commands, register: createRegistryBackground({ root, executable, platform: 'win32', packaged: true, run }), executable };
}
test('registration is signed-in, least privilege, no wake and exact executable', async t => {
  const f = await fixture(t); await f.register(true);
  const xml = (await fs.readFile(path.join(f.root, 'registry-task.xml'))).toString('utf16le');
  for (const expected of ['<LogonType>InteractiveToken</LogonType>', `<UserId>${principal}</UserId>`, '<RunLevel>LeastPrivilege</RunLevel>', '<WakeToRun>false</WakeToRun>', '<Arguments>--registry-sync</Arguments>']) assert.ok(xml.includes(expected));
  assert.equal(f.commands.some(command => command.args.includes('/RP')), false);
  await f.register(false); assert.ok(f.commands.some(command => command.args.includes('/Delete')));
});
test('an existing repointed task is preserved even when its arguments match', async t => {
  const executable = 'C:\\Program Files\\MaterialFileEncryptor\\MaterialFileEncryptor.exe';
  for (const enabled of [true, false]) {
    const f = await fixture(t, { marker: { task: 'MaterialFileEncryptor.RegistrySync', executable, principal },
      xml: `<Task><Command>C:\\Other.exe</Command><Arguments>--registry-sync</Arguments><UserId>${principal}</UserId><LogonType>InteractiveToken</LogonType></Task>` });
    await assert.rejects(f.register(enabled), /ownership/);
    assert.equal(f.commands.some(command => command.args.includes('/Create') || command.args.includes('/Delete')), false);
  }
});
test('an existing task without the private ownership marker is preserved', async t => {
  const f = await fixture(t, { xml: '<Task><Arguments>--registry-sync</Arguments></Task>' });
  await assert.rejects(f.register(true), /ownership/);
  assert.equal(f.commands.some(command => command.args.includes('/Create')), false);
});
