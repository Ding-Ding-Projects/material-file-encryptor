import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRegistryStorage } from '../src/main/registry-storage.js';
import { createShareService } from '../src/main/share/share-service.js';
import { createShareListStore } from '../src/main/share/share-list-store.js';
import { parseShareCommand } from '../src/main/share/share-command.js';
import { createFakeRegistry, publishFake } from './helpers/fake-hub-registry.js';

const REPOSITORY = 'someone/material-file-encryptor-shares';
// Reversible stand-in for the operating system protected storage: it changes every byte, like real encryption does.
const protection = { available: () => true, encrypt: text => Buffer.from(Buffer.from(text, 'utf8').map(byte => byte ^ 0x5a)), decrypt: bytes => Buffer.from(bytes.map(byte => byte ^ 0x5a)).toString('utf8') };

async function harness({ content = Buffer.from('share test'), name = 'notes.txt' } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-share-'));
  const registry = createFakeRegistry(REPOSITORY);
  const calls = [];
  const docker = {
    inspectRegistrySignIn: async () => ({ state: 'signed-in', account: 'someone' }),
    ensurePublicRepository: async repository => { calls.push(['ensure', repository]); return { repository, created: false }; },
    registryAuthorization: async () => ({}), registryDeleteAuthorization: async () => ({}),
    deleteShareTag: async (repository, tag) => { calls.push(['delete-tag', repository, tag]); registry.tags.delete(tag); return { removed: true }; },
  };
  const store = createShareListStore({ file: path.join(directory, 'shares.bin'), protection });
  let saveTarget = path.join(directory, 'received.txt');
  const service = createShareService({
    docker, store, testDestination: { ...registry.destination },
    storageFactory: options => createRegistryStorage({ ...options, fetcher: registry.fetcher }),
    readSource: async id => { if (id !== 'entry-1') throw Object.assign(Error('no'), { code: 'NOT_FOUND' }); return { name, size: content.length, modified: '2026-11-17T00:00:00.000Z', open: async function* () { for (let i = 0; i < content.length; i += 7) yield content.subarray(i, i + 7); } }; },
    chooseSaveFile: async () => saveTarget, driveTarget: async received => path.join(directory, 'drive', received),
  });
  return { directory, registry, docker, store, service, calls, setTarget: value => { saveTarget = value; } };
}

test('share and receive end to end through the real registry client', async () => {
  const h = await harness();
  const shared = await h.service.create({ entryId: 'entry-1' });
  assert.deepEqual(h.calls[0], ['ensure', REPOSITORY]);
  assert.match(shared.command, /^mfe-share:v1:127\.0\.0\.1:15221\/someone\/material-file-encryptor-shares@sha256:/);
  assert.match(shared.link, /^material-file-encryptor:\/\/receive\/v1\//);
  const tags = [...h.registry.tags.keys()];
  assert.equal(tags.length, 1); assert.match(tags[0], /^share-[a-f0-9]{32}$/);
  // The registry holds no file name or plaintext anywhere.
  for (const bytes of [...h.registry.blobs.values(), ...h.registry.manifests.values()]) {
    assert.equal(bytes.includes(Buffer.from('notes')), false); assert.equal(bytes.includes(Buffer.from('share test')), false);
  }
  const received = await h.service.receive({ command: shared.command });
  assert.deepEqual({ name: received.name, size: received.size }, { name: 'notes.txt', size: 10 });
  assert.deepEqual(await h.service.save({ receiveId: received.receiveId, destination: 'file' }), { saved: true, name: 'received.txt', size: 10 });
  assert.equal(await fs.readFile(path.join(h.directory, 'received.txt'), 'utf8'), 'share test');
  assert.deepEqual((await fs.readdir(h.directory)).filter(item => item.endsWith('.receiving')), []);
  await assert.rejects(h.service.save({ receiveId: received.receiveId, destination: 'file' }), { code: 'EXPIRED' });
});

test('drive snapshot listing never sees shares in the same repository', async () => {
  const h = await harness();
  await h.service.create({ entryId: 'entry-1' });
  await publishFake(createRegistryStorage, h.registry, { vaultId: 'a'.repeat(32), deviceId: 'b'.repeat(32) });
  const listed = await createRegistryStorage({ destination: h.registry.destination, fetcher: h.registry.fetcher }).list();
  assert.equal(listed.length, 1); assert.match(listed[0].tag, /^mfe-/);
});

test('a passphrase share needs the passphrase, and a wrong one is refused', async () => {
  const h = await harness();
  const shared = await h.service.create({ entryId: 'entry-1', passphrase: 'long enough passphrase' });
  assert.equal(parseShareCommand(shared.command, { allowTestHosts: true }).key, null);
  assert.deepEqual(await h.service.receive({ command: shared.command }), { needsPassphrase: true });
  await assert.rejects(h.service.receive({ command: shared.command, passphrase: 'nope' }), { code: 'WRONG_PASSPHRASE' });
  assert.equal((await h.service.receive({ command: shared.command, passphrase: 'long enough passphrase' })).name, 'notes.txt');
});

test('wrong key, tampering, a foreign host and errors never echo the key', async () => {
  const h = await harness();
  const shared = await h.service.create({ entryId: 'entry-1' });
  const secret = shared.command.split('#')[1];
  const otherKey = Buffer.alloc(32, 9).toString('base64url');
  const wrong = await h.service.receive({ command: shared.command.replace(secret, otherKey) }).catch(error => error);
  assert.equal(wrong.code, 'INVALID_KEY'); assert.equal(wrong.message.includes(secret), false);
  const layer = [...h.registry.blobs.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  layer[1][40] ^= 1;
  const tampered = await h.service.receive({ command: shared.command }).catch(error => error);
  assert.equal(tampered.code, 'REGISTRY_UNVERIFIED', 'the digest check fails before decryption');
  const foreign = await h.service.receive({ command: shared.command.replace('127.0.0.1:15221', '127.0.0.1:9999') }).catch(error => error);
  assert.equal(foreign.code, 'FOREIGN_HOST');
  const unknown = await h.service.receive({ command: shared.command.replace(':v1:', ':v7:') }).catch(error => error);
  assert.equal(unknown.code, 'UNKNOWN_VERSION');
});

test('the share list is encrypted at rest and never stores a readable command', async () => {
  const h = await harness();
  const shared = await h.service.create({ entryId: 'entry-1' });
  const raw = await fs.readFile(path.join(h.directory, 'shares.bin'));
  assert.equal(raw.includes(Buffer.from('mfe-share')), false);
  assert.equal(raw.includes(Buffer.from(shared.command.split('#')[1])), false);
  assert.equal(raw.includes(Buffer.from('notes.txt')), false);
  const listed = await h.service.list();
  assert.equal(listed.persistent, true); assert.equal(listed.entries.length, 1); assert.equal('command' in listed.entries[0], false);
  assert.equal((await h.service.command(listed.entries[0].id)).command, shared.command);
  // A fresh store reads the same list back.
  const again = createShareListStore({ file: path.join(h.directory, 'shares.bin'), protection });
  assert.equal((await again.list())[0].name, 'notes.txt');
});

test('without protected storage the list stays in memory and nothing is written', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-share-'));
  const store = createShareListStore({ file: path.join(directory, 'shares.bin'), protection: { available: () => false } });
  const { saved } = await store.add({ name: 'a.txt', size: 1, repository: REPOSITORY, digest: 'sha256:' + '1'.repeat(64), tag: 'share-' + '2'.repeat(32), passphrase: false, command: 'mfe-share:v1:x' });
  assert.equal(saved, false); assert.equal(store.persistent, false);
  await assert.rejects(fs.access(path.join(directory, 'shares.bin')));
});

test('revoke deletes the manifest and the tag, then the share no longer opens', async () => {
  const h = await harness();
  const shared = await h.service.create({ entryId: 'entry-1' });
  const [entry] = (await h.service.list()).entries;
  const result = await h.service.revoke(entry.id);
  assert.equal(result.verified, true); assert.equal(result.entry.state, 'revoked');
  assert.equal(h.registry.manifests.size, 0);
  await assert.rejects(h.service.command(entry.id), { code: 'NOT_FOUND' });
  await assert.rejects(h.service.receive({ command: shared.command }), { code: 'NOT_FOUND' });
});

test('a revoke the registry does not confirm keeps the command for a retry', async () => {
  const h = await harness();
  await h.service.create({ entryId: 'entry-1' });
  const [entry] = (await h.service.list()).entries;
  const original = h.registry.fetcher;
  // The registry refuses every delete, so the removal can never be confirmed.
  const refusing = createShareService({ docker: h.docker, store: h.store, testDestination: { ...h.registry.destination },
    storageFactory: options => createRegistryStorage({ ...options, fetcher: async (url, init = {}) => init.method === 'DELETE' ? new Response('', { status: 401 }) : original(url, init) }),
    readSource: async () => { throw Error('unused'); }, chooseSaveFile: async () => null, driveTarget: async () => null });
  h.docker.deleteShareTag = async () => ({ removed: false, alreadyGone: true });
  await assert.rejects(refusing.revoke(entry.id), { code: 'REVOKE_UNVERIFIED' });
  assert.equal(typeof (await h.service.command(entry.id)).command, 'string');
});

test('only one share runs at a time, and source problems surface as fixed messages', async () => {
  const h = await harness();
  const first = h.service.create({ entryId: 'entry-1' });
  await assert.rejects(h.service.create({ entryId: 'entry-1' }), { code: 'BUSY' });
  await first;
  await assert.rejects(h.service.create({ entryId: 'missing' }), { code: 'NOT_FOUND' });
});

test('a link from the command line is held in the main process and used once', async () => {
  const h = await harness();
  const shared = await h.service.create({ entryId: 'entry-1' });
  assert.equal(h.service.acceptIncoming('not a share'), null);
  const id = h.service.acceptIncoming(shared.link);
  assert.equal(typeof id, 'string'); assert.equal(id.includes(shared.command.split('#')[1]), false);
  assert.equal((await h.service.receive({ incomingId: id })).name, 'notes.txt');
  await assert.rejects(h.service.receive({ incomingId: id }), { code: 'EXPIRED' });
});

test('large content survives the round trip intact', async () => {
  const content = Buffer.alloc(3 * 1024 * 1024 + 123); for (let i = 0; i < content.length; i++) content[i] = i % 251;
  const h = await harness({ content, name: 'big.bin' });
  const shared = await h.service.create({ entryId: 'entry-1' });
  const received = await h.service.receive({ command: shared.command });
  await h.service.save({ receiveId: received.receiveId, destination: 'drive' }).catch(async () => {
    await fs.mkdir(path.join(h.directory, 'drive')); return h.service.save({ receiveId: received.receiveId, destination: 'drive' });
  });
  const back = await fs.readFile(path.join(h.directory, 'drive', 'big.bin'));
  assert.equal(createHash('sha256').update(back).digest('hex'), createHash('sha256').update(content).digest('hex'));
});
