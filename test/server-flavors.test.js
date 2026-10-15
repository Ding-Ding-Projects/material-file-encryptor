import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {listFlavorVersions, resolveFlavorDistribution, requiredJavaMajor, neoForgeMinecraft} from '../src/features/server-manager/flavors.js';
import {downloadToFile} from '../src/features/server-manager/bounded-http.js';
import {fakeFetch, sha, JAR} from './server-targets-fakes.js';

const MOJANG = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const PAPER = 'https://api.papermc.io/v2/projects/paper';
const PURPUR = 'https://api.purpurmc.org/v2/purpur';
const FABRIC = 'https://meta.fabricmc.net/v2/versions';
const PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const NEO = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge';

const routes = () => ({
  [MOJANG]: {versions: [{id: '1.21.4', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/a/1.21.4.json'}, {id: '24w01a', type: 'snapshot', url: 'https://piston-meta.mojang.com/v1/packages/b/x.json'}]},
  'https://piston-meta.mojang.com/v1/packages/a/1.21.4.json': {downloads: {server: {sha1: sha('sha1', JAR), size: JAR.length, url: 'https://piston-data.mojang.com/v1/objects/a/server.jar'}}},
  [PAPER]: {versions: ['1.20.4', '1.21.4', '1.21.1']},
  [PAPER + '/versions/1.21.4/builds']: {builds: [{build: 10, channel: 'default', downloads: {application: {name: 'paper-1.21.4-10.jar', sha256: sha('sha256', JAR)}}}, {build: 12, channel: 'experimental', downloads: {application: {name: 'paper-1.21.4-12.jar', sha256: 'f'.repeat(64)}}}, {build: 11, channel: 'default', downloads: {application: {name: 'paper-1.21.4-11.jar', sha256: sha('sha256', JAR)}}}]},
  [PURPUR]: {versions: ['1.21.4', '1.20.6']},
  [PURPUR + '/1.21.4']: {builds: {latest: '2300', all: ['2299', '2300']}},
  [PURPUR + '/1.21.4/2300']: {result: 'SUCCESS', md5: sha('md5', JAR)},
  [FABRIC + '/game']: [{version: '1.21.4', stable: true}, {version: '25w01a', stable: false}],
  [FABRIC + '/loader']: [{version: '0.17.0-beta', stable: false}, {version: '0.16.9', stable: true}],
  [FABRIC + '/installer']: [{version: '1.0.1', stable: true}],
  [PROMOS]: {promos: {'1.21.1-latest': '52.0.30', '1.21.1-recommended': '52.0.2', '1.12.2-latest': '14.23.5.2860', '1.20.1-latest': '47.3.0'}},
  'https://maven.minecraftforge.net/net/minecraftforge/forge/1.21.1-52.0.2/forge-1.21.1-52.0.2-installer.jar.sha256': sha('sha256', JAR) + '\n',
  [NEO]: {isSnapshot: false, versions: ['20.4.237', '21.1.1', '21.1.172', '21.0.5', '21.1.172-beta', '26.1.0.1']},
  'https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.172/neoforge-21.1.172-installer.jar.sha1': sha('sha1', JAR) + '  neoforge-21.1.172-installer.jar\n',
});

test('every flavor lists versions from its official API, newest first and bounded', async () => {
  const fetchImpl = fakeFetch(routes());
  assert.deepEqual((await listFlavorVersions('vanilla', {fetchImpl})).versions, [{id: '1.21.4', channel: 'release'}, {id: '24w01a', channel: 'snapshot'}]);
  assert.deepEqual((await listFlavorVersions('paper', {fetchImpl})).versions.map(row => row.id), ['1.21.4', '1.21.1', '1.20.4']);
  assert.deepEqual((await listFlavorVersions('purpur', {fetchImpl})).versions.map(row => row.id), ['1.21.4', '1.20.6']);
  assert.deepEqual((await listFlavorVersions('fabric', {fetchImpl})).versions, [{id: '1.21.4', channel: 'release'}, {id: '25w01a', channel: 'snapshot'}]);
  assert.deepEqual((await listFlavorVersions('forge', {fetchImpl})).versions.map(row => row.id), ['1.21.1', '1.20.1'], 'Forge before 1.18 is not offered');
  assert.deepEqual((await listFlavorVersions('neoforge', {fetchImpl})).versions.map(row => row.id), ['1.21.1', '1.21', '1.20.4'], 'betas and unmapped schemes are not offered');
  await assert.rejects(listFlavorVersions('bukkit', {fetchImpl}), /Unsupported/);
});

test('digests are recorded honestly per flavor and never upgraded', async () => {
  const fetchImpl = fakeFetch(routes());
  const vanilla = await resolveFlavorDistribution('vanilla', '1.21.4', {fetchImpl});
  assert.deepEqual([vanilla.hashAlgorithm, vanilla.hashSource, vanilla.integrity, vanilla.size], ['sha1', 'api', 'verified-sha1', JAR.length]);
  const paper = await resolveFlavorDistribution('paper', '1.21.4', {fetchImpl});
  assert.deepEqual([paper.build, paper.hashAlgorithm, paper.integrity], ['11', 'sha256', 'verified-sha256'], 'the highest stable build is chosen and the experimental one is ignored');
  assert.match(paper.url, /builds\/11\/downloads\/paper-1\.21\.4-11\.jar$/);
  const purpur = await resolveFlavorDistribution('purpur', '1.21.4', {fetchImpl});
  assert.deepEqual([purpur.hashAlgorithm, purpur.integrity], ['md5', 'verified-md5-weak'], 'MD5 is reported as weak');
  const fabric = await resolveFlavorDistribution('fabric', '1.21.4', {fetchImpl});
  assert.deepEqual([fabric.hash, fabric.integrity, fabric.hashSource], [null, 'unverified-upstream', 'none'], 'Fabric publishes no digest and says so');
  assert.match(fabric.url, /loader\/1\.21\.4\/0\.16\.9\/1\.0\.1\/server\/jar$/, 'only stable components are chosen');
  const forge = await resolveFlavorDistribution('forge', '1.21.1', {fetchImpl});
  assert.deepEqual([forge.artifact, forge.build, forge.hashSource, forge.hashAlgorithm], ['installer', '52.0.2', 'sidecar', 'sha256'], 'the recommended build wins and its sidecar checksum is used');
  const neo = await resolveFlavorDistribution('neoforge', '1.21.1', {fetchImpl});
  assert.deepEqual([neo.artifact, neo.build, neo.hashAlgorithm], ['installer', '21.1.172', 'sha1']);
  const bare = await resolveFlavorDistribution('neoforge', '1.20.4', {fetchImpl});
  assert.deepEqual([bare.hash, bare.integrity], [null, 'unverified-upstream'], 'a missing sidecar is reported as unverified, not invented');
  await assert.rejects(resolveFlavorDistribution('forge', '1.12.2', {fetchImpl}), /from Minecraft 1\.18/);
  await assert.rejects(resolveFlavorDistribution('paper', '9.9.9', {fetchImpl}), /unavailable/);
  await assert.rejects(resolveFlavorDistribution('vanilla', '../x', {fetchImpl}), /Invalid server version/);
});

test('sources are bound to https and exact hosts, redirects included, and responses are bounded', async () => {
  const hostile = {...routes(), [PAPER]: {status: 302, headers: {location: 'https://evil.example/paper'}, body: ''}};
  await assert.rejects(listFlavorVersions('paper', {fetchImpl: fakeFetch(hostile)}), /Untrusted/);
  const loop = {...routes(), [PAPER]: {status: 302, headers: {location: PAPER}, body: ''}};
  await assert.rejects(listFlavorVersions('paper', {fetchImpl: fakeFetch(loop)}), /too many times/);
  const downgraded = {...routes(), [PAPER]: {status: 302, headers: {location: 'http://api.papermc.io/v2/projects/paper'}, body: ''}};
  await assert.rejects(listFlavorVersions('paper', {fetchImpl: fakeFetch(downgraded)}), /Untrusted/);
  const huge = {...routes(), [PAPER]: {headers: {'content-length': String(64 * 1024 * 1024)}, body: '{}'}};
  await assert.rejects(listFlavorVersions('paper', {fetchImpl: fakeFetch(huge)}), /size bound/);
  const streamed = {...routes(), [PAPER]: Buffer.alloc(9 * 1024 * 1024, 0x20)};
  await assert.rejects(listFlavorVersions('paper', {fetchImpl: fakeFetch(streamed)}), /size bound/);
  const evilManifest = {...routes(), 'https://piston-meta.mojang.com/v1/packages/a/1.21.4.json': {downloads: {server: {sha1: sha('sha1', JAR), size: 4, url: 'https://evil.example/s.jar'}}}};
  await assert.rejects(resolveFlavorDistribution('vanilla', '1.21.4', {fetchImpl: fakeFetch(evilManifest)}), /Untrusted/, 'metadata that points at an unlisted host is refused at resolution');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-flavor-'));
  await assert.rejects(downloadToFile(fakeFetch({}), 'https://evil.example/s.jar', ['api.papermc.io'], path.join(directory, 'a.jar'), {maxBytes: 1000}), /Untrusted/, 'a download host outside the allow list is refused');
  const malformed = {...routes(), [PURPUR + '/1.21.4']: {builds: {latest: '../etc'}}};
  await assert.rejects(resolveFlavorDistribution('purpur', '1.21.4', {fetchImpl: fakeFetch(malformed)}), /unexpected shape/);
});

test('a download is size bounded, digest checked and never leaves a mismatching file behind', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-flavor-'));
  const url = 'https://api.papermc.io/v2/projects/paper/versions/1.21.4/builds/11/downloads/p.jar';
  const hosts = ['api.papermc.io'];
  const ok = await downloadToFile(fakeFetch({[url]: JAR}), url, hosts, path.join(directory, 'ok.jar'), {maxBytes: 1000, hashAlgorithm: 'sha256', hash: sha('sha256', JAR), expectedSize: JAR.length});
  assert.deepEqual([ok.upstreamVerified, ok.sha256, ok.size], [true, sha('sha256', JAR), JAR.length]);
  const bad = path.join(directory, 'bad.jar');
  await assert.rejects(downloadToFile(fakeFetch({[url]: JAR}), url, hosts, bad, {maxBytes: 1000, hashAlgorithm: 'sha256', hash: 'a'.repeat(64)}), /integrity mismatch/);
  await assert.rejects(fs.stat(bad), /ENOENT/, 'the mismatching file is removed');
  await assert.rejects(downloadToFile(fakeFetch({[url]: JAR}), url, hosts, path.join(directory, 'big.jar'), {maxBytes: 8}), /size bound/);
  await assert.rejects(downloadToFile(fakeFetch({[url]: JAR}), url, hosts, path.join(directory, 'size.jar'), {maxBytes: 1000, expectedSize: 3}), /size bound/);
  await assert.rejects(downloadToFile(fakeFetch({[url]: JAR}), url, hosts, path.join(directory, 'sha.jar'), {maxBytes: 1000, hashAlgorithm: 'sha256', hash: 'zz'}), /malformed/);
  const unverified = await downloadToFile(fakeFetch({[url]: JAR}), url, hosts, path.join(directory, 'none.jar'), {maxBytes: 1000});
  assert.deepEqual([unverified.upstreamVerified, unverified.hashAlgorithm], [false, null], 'with no upstream digest the result says it is unverified');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(downloadToFile(fakeFetch({[url]: JAR}), url, hosts, path.join(directory, 'abort.jar'), {maxBytes: 1000, signal: controller.signal}));
});

test('Java major and NeoForge version mapping follow the published requirements', () => {
  assert.deepEqual(['1.21.4', '1.20.5', '1.20.4', '1.18.2', '1.17.1', '1.16.5'].map(requiredJavaMajor), [21, 21, 17, 17, 16, 8]);
  assert.deepEqual(['21.1.172', '21.0.5', '20.4.237', '26.1.0.1', 'x'].map(neoForgeMinecraft), ['1.21.1', '1.21', '1.20.4', null, null]);
});
