import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createPackage, createPackageWithOptions, getRawHeader, uncache } from '@electron/asar';
import { inspectPackage, requirePrivateFreePackage, isPrivateEntry } from '../scripts/package-privacy.mjs';
const config = createRequire(import.meta.url)('../forge.config.cjs');

test('local assistant state is excluded at directory boundaries and rejected from archives', async () => {
  for (const directory of ['.claude', '.codex']) {
    for (const name of [`/${directory}`, `/nested/${directory}/worktrees/task/.git`, `\\nested\\${directory}\\session.json`]) {
      assert.equal(isPrivateEntry(name), true, name);
      assert.equal(config.packagerConfig.ignore.some(rule => rule.test(name)), true, name);
    }
    assert.equal(isPrivateEntry(`/nested/${directory}-example/readme.md`), false);
    const temporary=await mkdtemp(path.join(os.tmpdir(),'assistant-package-boundary-'));
    try {
      const source=path.join(temporary,'source'),output=path.join(temporary,'output'),archive=path.join(output,'resources','app.asar');
      await mkdir(path.join(source,directory,'worktrees'),{recursive:true});await mkdir(path.dirname(archive),{recursive:true});
      await writeFile(path.join(source,'index.js'),'export const ready=true;');
      await writeFile(path.join(source,directory,'worktrees','synthetic.txt'),'synthetic local state');
      await createPackage(source,archive);
      assert.equal((await inspectPackage(output)).code,'PACKAGE_PRIVACY_REJECTED');
      await rm(path.join(source,directory),{recursive:true});await createPackage(source,archive);
      assert.equal((await inspectPackage(output)).code,'PACKAGE_PRIVACY_OK');
      await mkdir(path.join(output,'resources',directory),{recursive:true});
      await writeFile(path.join(output,'resources',directory,'synthetic.txt'),'synthetic local state');
      assert.equal((await inspectPackage(output)).code,'PACKAGE_PRIVACY_REJECTED');
    } finally {await rm(temporary,{recursive:true,force:true});}
  }
});

async function rewriteHeader(archive, mutate) {
  uncache(archive);
  const original = await readFile(archive);
  const { header, headerSize } = getRawHeader(archive);
  mutate(header);
  const json = Buffer.from(JSON.stringify(header));
  const payloadSize = Math.ceil((4 + json.length) / 4) * 4;
  const serialized = Buffer.alloc(4 + payloadSize);
  serialized.writeUInt32LE(payloadSize, 0);
  serialized.writeUInt32LE(json.length, 4);
  json.copy(serialized, 8);
  const size = Buffer.alloc(8);
  size.writeUInt32LE(4, 0);
  size.writeUInt32LE(serialized.length, 4);
  await writeFile(archive, Buffer.concat([size, serialized, original.subarray(8 + headerSize)]));
}

async function withArchive(unpacked, contents, run) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'package-integrity-'));
  try {
    const source = path.join(temporary, 'source');
    const output = path.join(temporary, 'output');
    const archive = path.join(output, 'resources', 'app.asar');
    await mkdir(source, { recursive: true });
    await mkdir(path.dirname(archive), { recursive: true });
    await writeFile(path.join(source, 'payload.bin'), contents);
    await createPackageWithOptions(source, archive, unpacked ? { unpack: 'payload.bin' } : {});
    await run({ archive, output });
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

for (const unpacked of [false, true]) {
  test(`same-length ${unpacked ? 'unpacked' : 'packed'} corruption rejects inspection and packaging`, async () => {
    await withArchive(unpacked, Buffer.from('GOOD'), async ({ archive, output }) => {
      assert.equal((await inspectPackage(output)).code, 'PACKAGE_PRIVACY_OK');
      const target = unpacked ? path.join(archive + '.unpacked', 'payload.bin') : archive;
      const original = await readFile(target);
      const damaged = Buffer.from(original);
      damaged[damaged.length - 1] ^= 1;
      await writeFile(target, damaged);
      const receipt = await inspectPackage(output);
      assert.equal(receipt.code, 'PACKAGE_PRIVACY_UNREADABLE');
      assert.equal('archiveSha256' in receipt, false);
      assert.equal(JSON.stringify(receipt).includes('payload'), false);
      await assert.rejects(requirePrivateFreePackage(output), { message: 'PACKAGE_PRIVACY_UNREADABLE' });
      await assert.rejects(config.hooks.postPackage({}, { outputPaths: [output] }), { message: 'PACKAGE_PRIVACY_UNREADABLE' });
      await writeFile(target, original);
      assert.equal((await inspectPackage(output)).code, 'PACKAGE_PRIVACY_OK');
    });
  });
}

test('empty and multiblock content validates in packed and unpacked archives', async () => {
  for (const unpacked of [false, true]) {
    for (const content of [Buffer.alloc(0), Buffer.alloc(4 * 1024 * 1024 + 1, 0x61)]) {
      await withArchive(unpacked, content, async ({ archive, output }) => {
        const { header } = getRawHeader(archive);
        assert.equal(header.files['payload.bin'].integrity.blocks.length, content.length ? 2 : 1);
        assert.equal((await inspectPackage(output)).code, 'PACKAGE_PRIVACY_OK');
        if (unpacked && content.length === 0) {
          await writeFile(path.join(archive + '.unpacked', 'payload.bin'), 'unexpected bytes');
          assert.equal((await inspectPackage(output)).code, 'PACKAGE_PRIVACY_UNREADABLE');
        }
      });
    }
  }
});

test('missing, malformed and inconsistent ASAR integrity metadata fails closed', async () => {
  const mutations = [
    info => { delete info.integrity; },
    info => { info.integrity = null; },
    info => { info.integrity.algorithm = 'SHA512'; },
    info => { info.integrity.hash = '0'.repeat(64); },
    info => { info.integrity.hash = 'not a digest'; },
    info => { info.integrity.blockSize = 0; },
    info => { info.integrity.blockSize = -1; },
    info => { info.integrity.blockSize = 1.5; },
    info => { info.integrity.blockSize = '4194304'; },
    info => { info.integrity.blocks = []; },
    info => { info.integrity.blocks = ['0'.repeat(64)]; },
    info => { info.integrity.blocks = ['not a digest']; },
    info => { info.integrity.blocks.push(info.integrity.blocks[0]); },
  ];
  for (const unpacked of [false, true]) {
    await withArchive(unpacked, Buffer.from('GOOD'), async ({ archive, output }) => {
      const original = await readFile(archive);
      for (const mutate of mutations) {
        await writeFile(archive, original);
        await rewriteHeader(archive, header => mutate(header.files['payload.bin']));
        assert.equal((await inspectPackage(output)).code, 'PACKAGE_PRIVACY_UNREADABLE');
      }
      await writeFile(archive, original);
      assert.equal((await inspectPackage(output)).code, 'PACKAGE_PRIVACY_OK');
    });
  }
});

test('directory-boundary exclusion blocks only complete private segments', () => {
  const excluded = name => config.packagerConfig.ignore.some(rule => rule.test(name));
  for (const name of ['/.agent', '/.agent/a', '/nested/.agent/a', '/nested/.AGENT/a', '\\nested\\.agent\\a', '/.test-output', '/.test-output/fixture.bin', '/nested/.test-output/fixture.bin', '/src/features/converter/native/bin/Release/native.exe', '/src/features/converter/native/obj/generated.cs']) assert.equal(excluded(name), true);
  for (const name of ['/agent/a', '/.agent-helper/a', '/nested/agent.txt']) assert.equal(excluded(name), false);
  const weakened = config.packagerConfig.ignore.filter(rule => !rule.test('/.agent/a'));
  assert.equal(weakened.some(rule => rule.test('/.agent/a')), false, 'removed exclusion reproduces the regression');
});

test('verification fixtures are rejected from actual archive contents', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'package-fixture-exclusion-'));
  try {
    const source = path.join(temporary, 'source'), output = path.join(temporary, 'output');
    const archive = path.join(output, 'resources', 'app.asar');
    await mkdir(path.join(source, '.test-output'), { recursive: true });
    await mkdir(path.dirname(archive), { recursive: true });
    await writeFile(path.join(source, 'index.js'), 'export const ready = true;');
    await writeFile(path.join(source, '.test-output', 'fixture.bin'), 'synthetic verification data');
    await createPackage(source, archive);
    assert.equal((await inspectPackage(output)).code, 'PACKAGE_PRIVACY_REJECTED');
    await rm(path.join(source, '.test-output'), { recursive: true });
    await createPackage(source, archive);
    assert.equal((await inspectPackage(output)).code, 'PACKAGE_PRIVACY_OK');
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('compiled server lease verifier is excluded and rejected from ASAR and loose resources', async () => {
  const temporary=await mkdtemp(path.join(os.tmpdir(),'server-lease-package-exclusion-'));
  const name='MaterialFileEncryptor.ServerLease.Verifier.exe';
  try {
    assert.equal(config.packagerConfig.ignore.some(rule=>rule.test(`/nested/${name}`)),true);
    const source=path.join(temporary,'source'),output=path.join(temporary,'output'),archive=path.join(output,'resources','app.asar');
    await mkdir(source,{recursive:true});await mkdir(path.dirname(archive),{recursive:true});await writeFile(path.join(source,'index.js'),'export const ready=true;');
    await writeFile(path.join(source,name),'synthetic verifier bytes');await createPackage(source,archive);
    assert.equal((await inspectPackage(output)).code,'PACKAGE_PRIVACY_REJECTED');
    await rm(path.join(source,name));await createPackage(source,archive);
    assert.equal((await inspectPackage(output)).code,'PACKAGE_PRIVACY_OK');
    await writeFile(path.join(output,'resources',name),'synthetic verifier bytes');
    assert.equal((await inspectPackage(output)).code,'PACKAGE_PRIVACY_REJECTED');
  } finally {await rm(temporary,{recursive:true,force:true});}
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
