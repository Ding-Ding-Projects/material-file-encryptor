import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {applySetting, describeSettings, readSettings, validateSetting, SETTING_KEYS} from '../src/features/server-manager/server-properties.js';
import {extensionKind, inspectLocalExtension, resolveModrinthFile, safeJarName, searchExtensions} from '../src/features/server-manager/extensions.js';
import {fakeFetch, sha, JAR} from './server-targets-fakes.js';

test('server.properties edits go through a typed schema with bounds', () => {
  assert.equal(validateSetting('server-port', 25570), '25570');
  assert.equal(validateSetting('online-mode', false), 'false');
  assert.equal(validateSetting('difficulty', 'hard'), 'hard');
  assert.equal(validateSetting('motd', 'A Minecraft Server'), 'A Minecraft Server');
  const refused = [['server-port', 80], ['server-port', '25565'], ['server-port', 65536], ['max-players', 0], ['max-players', 1.5], ['view-distance', 2], ['view-distance', 33], ['difficulty', 'impossible'], ['gamemode', 'god'], ['online-mode', 'true'], ['pvp', 1], ['motd', 'a\nenable-rcon=true'], ['motd', 'x'.repeat(60)], ['motd', 'a=b'], ['motd', 'back\\slash'], ['motd', 5]];
  for (const [key, value] of refused) assert.throws(() => validateSetting(key, value), /Invalid server setting value/, key + '=' + JSON.stringify(value));
  for (const key of ['enable-rcon', 'rcon.password', 'server-ip', 'level-name', 'resource-pack', '__proto__', 'constructor']) assert.throws(() => validateSetting(key, 'x'), /not editable/, key);
  assert.throws(() => validateSetting('server-port', 25570, 'local-container'), /fixed when the container is created/);
  assert.ok(!describeSettings('local-container').some(row => row.key === 'server-port') && describeSettings('ssh-process').some(row => row.key === 'server-port'));
  assert.ok(SETTING_KEYS.length >= 15);
});

test('applying a setting rewrites one line and preserves comments, order, unknown keys and line endings', () => {
  const source = '#Minecraft server properties\r\nlevel-name=world\r\nmotd=Old\r\nrcon.password=secret\r\nmax-players=20\r\n';
  const next = applySetting(source, 'motd', 'New world', 'local-process');
  assert.equal(next, '#Minecraft server properties\r\nlevel-name=world\r\nmotd=New world\r\nrcon.password=secret\r\nmax-players=20\r\n');
  assert.equal(applySetting('a=1\n', 'pvp', false, 'local-process'), 'a=1\npvp=false\n', 'an absent key is appended');
  assert.equal(applySetting('', 'pvp', true, 'local-process'), 'pvp=true\n');
  assert.equal(applySetting('motd=x', 'motd', 'y', 'ssh-process'), 'motd=y\n');
  assert.deepEqual(readSettings(next), {motd: 'New world', 'max-players': '20'}, 'only schema keys are exposed, so an RCON password is never read back');
  assert.throws(() => applySetting(source, 'rcon.password', 'x', 'local-process'), /not editable/);
});

const slug = 'worldedit';
const API = 'https://api.modrinth.com/v2';
const versionRoute = (flavor, loaders) => API + '/project/' + slug + '/version?loaders=' + encodeURIComponent(JSON.stringify(loaders)) + '&game_versions=' + encodeURIComponent(JSON.stringify(['1.21.4']));
const modrinthVersion = (overrides = {}) => ({id: 'AbCd1234', version_number: '7.3.0', files: [{primary: true, filename: 'worldedit-7.3.0.jar', size: JAR.length, url: 'https://cdn.modrinth.com/data/x/versions/AbCd1234/worldedit-7.3.0.jar', hashes: {sha1: sha('sha1', JAR), sha512: sha('sha512', JAR)}, ...overrides}]});

test('Modrinth search and resolution are bounded, host bound and digest carrying', async () => {
  const facets = JSON.stringify([['project_type:plugin'], ['versions:1.21.4'], ['categories:paper', 'categories:spigot', 'categories:bukkit']]);
  const fetchImpl = fakeFetch({
    [API + '/search?query=edit&limit=20&facets=' + encodeURIComponent(facets)]: {hits: [{slug, title: 'WorldEdit', description: 'Edit\nthe world', downloads: 9}, {slug: '../bad', title: 'x'}]},
    [versionRoute('paper', ['paper', 'spigot', 'bukkit'])]: [modrinthVersion()],
  });
  const hits = await searchExtensions({flavor: 'paper', minecraft: '1.21.4', query: 'edit'}, {fetchImpl});
  assert.deepEqual(hits, [{project: slug, title: 'WorldEdit', summary: 'Edit the world', downloads: 9}], 'invalid slugs are dropped and control characters removed');
  assert.ok(fetchImpl.calls.every(call => call.options.headers['user-agent'] && call.options.redirect === 'manual'), 'a User-Agent is always sent and redirects are handled explicitly');
  const file = await resolveModrinthFile({flavor: 'paper', minecraft: '1.21.4', project: slug}, {fetchImpl});
  assert.deepEqual([file.fileName, file.hashAlgorithm, file.hash, file.directory], ['worldedit-7.3.0.jar', 'sha512', sha('sha512', JAR), 'plugins']);
  await assert.rejects(searchExtensions({flavor: 'vanilla', minecraft: '1.21.4', query: 'a'}, {fetchImpl}), /no plugin or mod repository/);
  await assert.rejects(searchExtensions({flavor: 'paper', minecraft: '1.21.4', query: 'a\nb'}, {fetchImpl}), /Invalid extension search/);
  await assert.rejects(resolveModrinthFile({flavor: 'paper', minecraft: '1.21.4', project: '../etc'}, {fetchImpl}), /Invalid extension request/);
  await assert.rejects(resolveModrinthFile({flavor: 'paper', minecraft: '1.21.4', project: slug, version: 'nope!'}, {fetchImpl}), /Invalid extension request/);
  assert.deepEqual([extensionKind('fabric').directory, extensionKind('neoforge').directory, extensionKind('vanilla')], ['mods', 'mods', null]);
});

test('a Modrinth file without a SHA-512, from another host, oversized or oddly named is refused', async () => {
  const route = overrides => fakeFetch({[versionRoute('paper', ['paper', 'spigot', 'bukkit'])]: [modrinthVersion(overrides)]});
  const ask = overrides => resolveModrinthFile({flavor: 'paper', minecraft: '1.21.4', project: slug}, {fetchImpl: route(overrides)});
  await assert.rejects(ask({hashes: {sha1: sha('sha1', JAR)}}), /no SHA-512/);
  await assert.rejects(ask({hashes: {sha512: 'zz'}}), /no SHA-512/);
  await assert.rejects(ask({url: 'https://evil.example/worldedit.jar'}), /Untrusted extension download source/);
  await assert.rejects(ask({url: 'http://cdn.modrinth.com/worldedit.jar'}), /Untrusted extension download source/);
  await assert.rejects(ask({size: 512 * 1024 * 1024}), /size bound/);
  await assert.rejects(ask({filename: '../../evil.jar'}), /not allowed/);
  await assert.rejects(ask({filename: 'evil.exe'}), /not allowed/);
  await assert.rejects(resolveModrinthFile({flavor: 'paper', minecraft: '1.21.4', project: slug}, {fetchImpl: fakeFetch({[versionRoute('paper', ['paper', 'spigot', 'bukkit'])]: []})}), /No compatible release/);
  assert.equal(safeJarName('My Plugin-1.0.jar'), 'My_Plugin-1.0.jar');
  for (const bad of ['', '.jar', 'a/b.txt', 'a..b.jar', 'x'.repeat(200) + '.jar']) assert.throws(() => safeJarName(bad), /not allowed/, bad);
});

test('a local extension must be a regular, bounded jar and its digest is recorded as locally computed', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-ext-'));
  const good = path.join(directory, 'plugin.jar'), text = path.join(directory, 'notes.jar'), exe = path.join(directory, 'plugin.exe'), empty = path.join(directory, 'empty.jar');
  await fs.writeFile(good, JAR); await fs.writeFile(text, 'not a zip'); await fs.writeFile(exe, JAR); await fs.writeFile(empty, '');
  const inspected = await inspectLocalExtension(good, 'paper');
  assert.deepEqual([inspected.source, inspected.fileName, inspected.directory, inspected.sha256], ['local', 'plugin.jar', 'plugins', sha('sha256', JAR)]);
  assert.equal(inspected.upstreamVerified, undefined, 'a local file is never described as verified against a publisher');
  await assert.rejects(inspectLocalExtension(text, 'paper'), /not a jar archive/);
  await assert.rejects(inspectLocalExtension(exe, 'paper'), /not allowed/);
  await assert.rejects(inspectLocalExtension(empty, 'paper'), /size bound/);
  await assert.rejects(inspectLocalExtension(directory, 'paper'), /regular extension file/);
  await assert.rejects(inspectLocalExtension(good, 'vanilla'), /no plugin or mod directory/);
  const link = path.join(directory, 'link.jar');
  if (await fs.symlink(good, link).then(() => true, () => false)) await assert.rejects(inspectLocalExtension(link, 'paper'), /regular extension file/);
});
