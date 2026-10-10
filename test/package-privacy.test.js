import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createPackage } from '@electron/asar';
import { inspectPackage, requirePrivateFreePackage } from '../scripts/package-privacy.mjs';
const config = createRequire(import.meta.url)('../forge.config.cjs');

test('directory-boundary exclusion blocks only complete private segments', () => {
  const excluded = name => config.packagerConfig.ignore.some(rule => rule.test(name));
  for (const name of ['/.agent', '/.agent/a', '/nested/.agent/a', '/nested/.AGENT/a', '\\nested\\.agent\\a']) assert.equal(excluded(name), true);
  for (const name of ['/agent/a', '/.agent-helper/a', '/nested/agent.txt']) assert.equal(excluded(name), false);
  const weakened = config.packagerConfig.ignore.filter(rule => !rule.test('/.agent/a'));
  assert.equal(weakened.some(rule => rule.test('/.agent/a')), false, 'removed exclusion reproduces the regression');
});

test('actual ASAR and resource inspection rejects synthetic private entries then accepts restored output', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'package-privacy-'));
  try {
    const source = path.join(temporary, 'source');
    const output = path.join(temporary, 'output');
    const archive = path.join(output, 'resources', 'app.asar');
    await mkdir(path.join(source, '.agent'), { recursive: true });
    await mkdir(path.dirname(archive), { recursive: true });
    await writeFile(path.join(source, 'index.js'), 'export const ready = true;');
    await writeFile(path.join(source, '.agent', 'synthetic.txt'), 'harmless synthetic test fixture');
    await createPackage(source, archive);
    const red = await inspectPackage(output);
    assert.equal(red.code, 'PACKAGE_PRIVACY_REJECTED');
    assert.ok(red.rejected > 0);
    assert.equal(JSON.stringify(red).includes('synthetic'), false);
    await assert.rejects(config.hooks.postPackage({}, { outputPaths: [output] }), { message: 'PACKAGE_PRIVACY_REJECTED' });
    await rm(path.join(source, '.agent'), { recursive: true });
    await createPackage(source, archive);
    const green = await requirePrivateFreePackage(output);
    assert.equal(green.code, 'PACKAGE_PRIVACY_OK');
    assert.match(green.archiveSha256, /^[a-f0-9]{64}$/);
    await config.hooks.postPackage({}, { outputPaths: [output] });
    await mkdir(path.join(output, 'resources', '.agent'));
    await writeFile(path.join(output, 'resources', '.agent', 'synthetic.txt'), 'harmless synthetic test fixture');
    assert.equal((await inspectPackage(output)).code, 'PACKAGE_PRIVACY_REJECTED');
    await rm(path.join(output, 'resources', '.agent'), { recursive: true });
    const completeArchive = await readFile(archive);
    await writeFile(archive, completeArchive.subarray(0, completeArchive.length - 1));
    assert.equal((await inspectPackage(output)).code, 'PACKAGE_PRIVACY_UNREADABLE');
    await writeFile(archive, 'invalid synthetic archive');
    assert.equal((await inspectPackage(output)).code, 'PACKAGE_PRIVACY_UNREADABLE');
    await assert.rejects(requirePrivateFreePackage(output), { message: 'PACKAGE_PRIVACY_UNREADABLE' });
    await assert.rejects(config.hooks.postPackage({}, {}), { message: 'PACKAGE_PRIVACY_INPUT_REQUIRED' });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
