import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRegistrySyncService } from '../src/main/registry-sync-service.js';
import { DEFAULT_REGISTRY_SCHEDULE } from '../src/main/registry-schedule.js';

const execute = promisify(execFile);
const enabled = Boolean(process.env.MFE_TEST_REGISTRY && process.env.MFE_CORE_FIXTURE_DLL);
// Real core encryption and replay composed with the real registry transport.
// The adapter below is a test-process boundary, not evidence of a native mount or GUI.
for (const scenario of ['concurrent-edit', 'delete-vs-edit']) test(`real encrypted-core registry convergence: ${scenario}`, { skip: !enabled, timeout: 120000 }, async t => {
  const temporary = await fs.realpath(os.tmpdir());
  const root = path.join(temporary, 'mfe-registry-fixture-' + randomUUID());
  const leases = new Map();
  async function command(action, device = 'deviceA') {
    const result = await execute(process.env.MFE_DOTNET || 'dotnet', [process.env.MFE_CORE_FIXTURE_DLL, '--registry-fixture', action, root, device, scenario],
      { windowsHide: true, shell: false, timeout: 30000, maxBuffer: 1024 * 1024 });
    return JSON.parse(result.stdout.trim());
  }
  await command('init');
  t.after(async () => {
    const absolute = path.resolve(root);
    assert.equal(path.dirname(absolute), temporary);
    assert.match(path.basename(absolute), /^mfe-registry-fixture-[a-f0-9-]+$/);
    assert.equal(await fs.readFile(path.join(absolute, '.registry-fixture-owner'), 'utf8'), `MaterialFileEncryptor synthetic registry fixture v1\n${root}\n`);
    await fs.rm(absolute, { recursive: true });
  });
  await Promise.all([command('edit', 'deviceA'), command('edit', 'deviceB')]);
  const repository = `test/core-${scenario}-${randomUUID()}`;
  function service(device) {
    const source = path.join(root, device === 'deviceA' ? 'A' : 'B', 'source');
    return createRegistrySyncService({ root: path.join(root, device, 'client'),
      testDestination: { endpoint: process.env.MFE_TEST_REGISTRY, testOnly: true },
      contexts: id => id === undefined ? [['main', {}]] : { storageDir: source, transport: 'folder' },
      chooseRestore: async () => root,
      nativeRequest: async (method, params) => {
        if (method === 'beginSnapshot') { const value = await command('snapshot', device); leases.set(value.leaseId, value.storageDir); return value; }
        if (method === 'releaseSnapshot') {
          const directory = leases.get(params.leaseId); assert.ok(directory);
          assert.equal(path.dirname(path.resolve(directory)), path.join(root, 'snapshots'));
          await fs.rm(directory, { recursive: true }); leases.delete(params.leaseId); return { released: true };
        }
        if (method === 'cancelSnapshot') return { cancellationRequested: false };
        if (method === 'sync') return command('sync', device);
        throw Error('Unexpected native fixture operation');
      },
    });
  }
  const a = service('deviceA'), b = service('deviceB');
  await Promise.all([a.configure('main', { repository, schedule: DEFAULT_REGISTRY_SCHEDULE }), b.configure('main', { repository, schedule: DEFAULT_REGISTRY_SCHEDULE })]);
  const initial = await Promise.all([a.sync('main'), b.sync('main')]);
  assert.ok(initial.every(result => result.verified));
  assert.notEqual(initial[0].digest, initial[1].digest);
  await a.sync('main'); await b.sync('main'); await a.sync('main');
  const [first, second] = await Promise.all([command('inspect', 'deviceA'), command('inspect', 'deviceB')]);
  assert.deepEqual(first.entries, second.entries, 'independent devices converge on identical paths, values and stable identities');
  const contents = first.entries.map(entry => entry.content);
  assert.ok(contents.includes('BBBB'));
  if (scenario === 'concurrent-edit') assert.ok(contents.includes('AAAA'), 'both concurrent same-file values survive');
  assert.ok(contents.includes('AAAA-only')); assert.ok(contents.includes('BBBB-only'));
  assert.equal(new Set(first.entries.map(entry => entry.entryId)).size, first.entries.length);
  assert.equal(leases.size, 0);
});
