import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createVaultSessionSettings, MAX_SECONDARY_VAULTS, MAX_SESSION_SETTINGS_BYTES, parseVaultSessionSettings, sanitizeSecondaryVaultPreferences, sanitizeSecondaryVaultSessions } from '../src/main/vault-session-settings.js';

const descriptor = () => ({ storageDir: 'C:\\Encrypted\\Storage', cacheDir: 'C:\\Encrypted\\Cache\\original-session-id', driveLetter: 'N:', driveName: 'Private archive', transport: 'privateGit', remoteRepository: 'owner/private-vault', autoUnlock: false, performanceMode: 'throughput', historyRetentionDays: 30 });
const envelope = sessions => JSON.stringify({ schemaVersion: 1, sessions });
async function fixture(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-session-settings-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  return { folder, filePath: path.join(folder, 'vault-sessions.json') };
}

test('secondary settings persist only bounded recovery preferences and never credentials', () => {
  const source = { ...descriptor(), autoUnlock: true, startup: true, password: 'secret-password', keyFilePath: 'C:\\Secrets\\key.bin', key: 'secret-key', keys: ['secret-key'], credentials: { token: 'secret-token' }, sessionId: 'old-session', arbitrary: 'secret-other' };
  const result = sanitizeSecondaryVaultPreferences(source);
  assert.deepEqual(result, descriptor());
  for (const secret of ['secret-password', 'key.bin', 'secret-key', 'secret-token', 'old-session', 'secret-other']) assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(source.autoUnlock, true);
  assert.equal(sanitizeSecondaryVaultPreferences({ cacheDir: 'C:\\Cache', driveLetter: 'n', driveName: '  Archive  ' }).driveLetter, 'N:');
  assert.equal(sanitizeSecondaryVaultPreferences({ cacheDir: 'C:\\Cache', driveName: '  Archive  ' }).driveName, 'Archive');
  assert.deepEqual(parseVaultSessionSettings(envelope([source])), [descriptor()]);
  assert.throws(() => parseVaultSessionSettings(JSON.stringify({ schemaVersion: 1, sessions: [source], password: 'secret' })), /invalid/);
});

test('invalid identity and unbounded settings are rejected rather than regenerated or truncated', () => {
  for (const change of [
    { cacheDir: undefined }, { cacheDir: '' }, { cacheDir: 'x'.repeat(32768) }, { cacheDir: 'bad\0path' }, { storageDir: 4 }, { storageDir: 'bad\npath' },
    { driveLetter: 'C:' }, { driveLetter: 'NN:' }, { driveName: '../secret' }, { driveName: 'x'.repeat(33) }, { transport: 'http' },
    { remoteRepository: 'https://token@host/repository' }, { remoteRepository: 'owner/..' }, { remoteRepository: undefined },
    { historyRetentionDays: 0 }, { historyRetentionDays: 36501 }, { performanceMode: 'unsafe' },
  ]) assert.throws(() => sanitizeSecondaryVaultPreferences({ ...descriptor(), ...change }), /invalid/);
  for (const value of [null, [], new Date(), Object.create({ cacheDir: 'inherited' })]) assert.throws(() => sanitizeSecondaryVaultPreferences(value));
  for (const value of [null, {}, new Array(1), Array(MAX_SECONDARY_VAULTS + 1).fill(descriptor())]) assert.throws(() => sanitizeSecondaryVaultSessions(value));
  for (const contents of ['{', '{}', envelope([{}]), JSON.stringify({ schemaVersion: 2, sessions: [] }), ' '.repeat(MAX_SESSION_SETTINGS_BYTES + 1)]) assert.throws(() => parseVaultSessionSettings(contents));
  assert.equal(sanitizeSecondaryVaultSessions(Array(MAX_SECONDARY_VAULTS).fill(descriptor())).length, MAX_SECONDARY_VAULTS);
});

test('recovery paths must be absolute and cannot name devices or traversal components', () => {
  for (const cacheDir of ['cache/relative', 'C:relative', '\\rooted-without-drive', 'C:\\Cache\\..\\Other', 'C:\\Cache\\.\\Other', 'C:\\Cache\\.. \\Other', '\\\\?\\C:\\Cache', '\\\\.\\C:\\Cache', '\\??\\C:\\Cache', '\\\\server', '\\\\server\\..\\cache', 'C:\\NUL', 'C:\\Cache:stream', '/cache/../other', '/cache/./other']) {
    assert.throws(() => sanitizeSecondaryVaultPreferences({ cacheDir }), /invalid/, cacheDir);
  }
  for (const cacheDir of ['C:\\', 'C:/Encrypted/Cache', '\\\\server\\share\\cache', '//server/share/cache', ...(process.platform === 'win32' ? [] : ['/tmp/offline-cache'])]) {
    assert.equal(sanitizeSecondaryVaultPreferences({ cacheDir }).cacheDir, cacheDir);
  }
});

test('strict settings documents reject duplicate keys and unexpected root fields', () => {
  for (const contents of [
    '{"schemaVersion":1,"schemaVersion":1,"sessions":[]}',
    '{"schemaVersion":1,"sessions":[],"sessions":[]}',
    '{"schemaVersion":1,"sessions":[{"cacheDir":"C:/first","cacheDir":"C:/second"}]}',
    '{"schemaVersion":1,"sessions":[{"cacheDir":"C:/cache","autoUnlock":false,"autoUnlock":true}]}',
    '{"schemaVersion":1,"sessions":[],"password":"unexpected"}',
    '{"schemaVersion":1,"sessions":[],"__proto__":{"polluted":true}}',
  ]) assert.throws(() => parseVaultSessionSettings(contents), /invalid/);
});

test('settings sanitization never executes accessors or copies prototype-bearing unknown fields', () => {
  let accessed = false;
  const value = { ...descriptor() };
  Object.defineProperty(value, 'password', { get() { accessed = true; throw Error('secret'); } });
  assert.deepEqual(sanitizeSecondaryVaultPreferences(value), descriptor());
  assert.equal(accessed, false);
  Object.defineProperty(value, 'cacheDir', { get() { accessed = true; throw Error('path'); } });
  assert.throws(() => sanitizeSecondaryVaultPreferences(value), /invalid/);
  assert.equal(accessed, false);
  const poisoned = JSON.parse('{"cacheDir":"C:/Cache","__proto__":{"polluted":true},"constructor":{"secret":"value"}}');
  assert.deepEqual(sanitizeSecondaryVaultPreferences(poisoned), { autoUnlock: false, cacheDir: 'C:/Cache' });
  assert.equal({}.polluted, undefined);
});

test('atomic settings round trip preserves original cache identity and sanitizes each save', async t => {
  const { folder, filePath } = await fixture(t);
  const store = createVaultSessionSettings({ filePath: () => filePath });
  await assert.rejects(store.save([]), /not been safely loaded/);
  assert.deepEqual(await store.load(), []);
  await store.save([{ ...descriptor(), password: 'never-saved', keyFilePath: 'never-saved', autoUnlock: true }]);
  const contents = await fs.readFile(filePath, 'utf8');
  assert.deepEqual(JSON.parse(contents), { schemaVersion: 1, sessions: [descriptor()] });
  assert.deepEqual(await fs.readdir(folder), ['vault-sessions.json']);
  assert.deepEqual(await createVaultSessionSettings({ filePath }).load(), [descriptor()]);
  if (process.platform !== 'win32') assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
  await store.save([]);
  assert.deepEqual(await createVaultSessionSettings({ filePath }).load(), []);
});

test('malformed, oversized and invalid UTF-8 files are preserved and block all writes', async t => {
  const { filePath } = await fixture(t);
  for (const original of [Buffer.from('{broken'), Buffer.from(envelope([{ storageDir: 'source-without-cache' }])), Buffer.alloc(MAX_SESSION_SETTINGS_BYTES + 1, 32), Buffer.from([0xff, 0xfe])]) {
    await fs.writeFile(filePath, original);
    const store = createVaultSessionSettings({ filePath });
    await assert.rejects(store.load(), /preserved.*not be overwritten/);
    await assert.rejects(store.save([]), /not been safely loaded/);
    assert.deepEqual(await fs.readFile(filePath), original);
  }
});

test('a non-missing read failure never becomes an empty inventory or permits replacement', async () => {
  const calls = [];
  const store = createVaultSessionSettings({ filePath: '/settings-only.json', fileSystem: { lstat: async (...args) => { calls.push(args); throw Object.assign(Error('denied'), { code: 'EACCES' }); } } });
  await assert.rejects(store.load(), /preserved/);
  await assert.rejects(store.save([]), /not been safely loaded/);
  assert.deepEqual(calls, [['/settings-only.json']]);
});

test('linked and nonregular settings files are refused before opening their contents', async t => {
  const { filePath } = await fixture(t);
  await fs.mkdir(filePath);
  const directoryStore = createVaultSessionSettings({ filePath });
  await assert.rejects(directoryStore.load(), /preserved/);
  await assert.rejects(directoryStore.save([]), /not been safely loaded/);
  let opened = false;
  const linkedStore = createVaultSessionSettings({ filePath, fileSystem: {
    lstat: async () => ({ isSymbolicLink: () => true, isFile: () => false }),
    open: async () => { opened = true; throw Error('The link must not be followed.'); },
  } });
  await assert.rejects(linkedStore.load(), /preserved/);
  assert.equal(opened, false);
});

test('a changed settings file identity is refused before any content read', async t => {
  const { filePath } = await fixture(t);
  const original = envelope([descriptor()]);
  await fs.writeFile(filePath, original);
  let read = false, inspected = 0;
  const fileSystem = {
    lstat: async filename => {
      const stat = await fs.lstat(filename);
      if (++inspected > 1) stat.ino += 1;
      return stat;
    },
    open: async (...args) => {
      const handle = await fs.open(...args);
      return { stat: () => handle.stat(), close: () => handle.close(), read: () => { read = true; throw Error('Changed files must not be read.'); } };
    },
  };
  const store = createVaultSessionSettings({ filePath, fileSystem });
  await assert.rejects(store.load(), /preserved/);
  await assert.rejects(store.save([]), /not been safely loaded/);
  assert.equal(read, false);
  assert.equal(await fs.readFile(filePath, 'utf8'), original);
});

test('settings load touches only the settings file, never configured vault paths', async t => {
  const { filePath } = await fixture(t);
  const original = { ...descriptor(), storageDir: '\\\\offline-host\\vault', cacheDir: '\\\\offline-host\\cache' };
  await fs.writeFile(filePath, envelope([original]));
  const opened = [], inspected = [];
  const fileSystem = { open: async (...args) => { opened.push(args); return fs.open(...args); }, lstat: async (...args) => { inspected.push(args); return fs.lstat(...args); } };
  assert.deepEqual(await createVaultSessionSettings({ filePath, fileSystem }).load(), [original]);
  assert.deepEqual(opened, [[filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0)]]);
  assert.ok(inspected.length > 0 && inspected.every(args => args.length === 1 && args[0] === filePath));
});

test('failed atomic replacement preserves existing descriptors and removes only its temporary file', async t => {
  const { folder, filePath } = await fixture(t);
  const original = envelope([descriptor()]);
  await fs.writeFile(filePath, original);
  let fail = true;
  const store = createVaultSessionSettings({ filePath, fileSystem: { ...fs, rename: async (...args) => { if (fail) throw Error('replacement failed'); return fs.rename(...args); } } });
  await store.load();
  await assert.rejects(store.save([]), /replacement failed/);
  assert.equal(await fs.readFile(filePath, 'utf8'), original);
  assert.deepEqual(await fs.readdir(folder), ['vault-sessions.json']);
  fail = false;
  await store.save([{ ...descriptor(), driveName: 'Updated archive' }]);
  assert.equal(parseVaultSessionSettings(await fs.readFile(filePath, 'utf8'))[0].driveName, 'Updated archive');
});

test('queued saves complete in invocation order without mixed settings', async t => {
  const { filePath } = await fixture(t);
  const store = createVaultSessionSettings({ filePath });
  await store.load();
  await Promise.all([store.save([descriptor()]), store.save([{ ...descriptor(), driveName: 'Last settings' }]), store.save([])]);
  assert.deepEqual(await createVaultSessionSettings({ filePath }).load(), []);
});
