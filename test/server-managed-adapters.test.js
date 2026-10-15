import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServerTargetsService} from '../src/main/server-targets-service.js';
import {createBrowserServerAdapters, SUPPORTED_SERVER_ACTIONS} from '../src/main/browser-server-adapters.js';
import {SERVER_STATES, flavorId, serverId, versionId} from '../src/main/browser-server-mediation.js';
import {validateFeatureRequest} from '../src/main/validation.js';
import {fakeExec, fakeFetch, fakeSpawn, sha, JAR, JAVA_21} from './server-targets-fakes.js';

const PAPER = 'https://api.papermc.io/v2/projects/paper';
const API = 'https://api.modrinth.com/v2';
const PLUGIN = Buffer.concat([JAR, Buffer.from(' plugin')]);
const CDN = 'https://cdn.modrinth.com/data/x/versions/AbCd1234/worldedit-7.3.0.jar';
const MANAGED = 'managed-0d3f5b2a-1111-4222-8333-444455556666';
const loaders = ['paper', 'spigot', 'bukkit'];
const routes = {
  [PAPER + '/versions/1.21.4/builds']: {builds: [{build: 11, channel: 'default', downloads: {application: {name: 'p.jar', sha256: sha('sha256', JAR)}}}]},
  [PAPER + '/versions/1.21.4/builds/11/downloads/p.jar']: JAR,
  [API + '/project/worldedit/version?loaders=' + encodeURIComponent(JSON.stringify(loaders)) + '&game_versions=' + encodeURIComponent(JSON.stringify(['1.21.4']))]: [{id: 'AbCd1234', version_number: '7.3.0', files: [{primary: true, filename: 'worldedit-7.3.0.jar', size: PLUGIN.length, url: CDN, hashes: {sha512: sha('sha512', PLUGIN)}}]}],
  [CDN]: PLUGIN,
};

async function wire({docker = true, legacy = []} = {}) {
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-adapter-'));
  const execFile = fakeExec((file, args) => {
    if (file === 'java') return {stdout: '', stderr: JAVA_21.stderr};
    if (file === 'ssh') return {stdout: '', stderr: 'OpenSSH_9'};
    if (file === 'docker' && docker) return {stdout: '27\n', stderr: ''};
    throw Error('unavailable');
  });
  const service = createServerTargetsService({dataDirectory, deps: {execFile, spawn: fakeSpawn()}, fetchImpl: fakeFetch(routes), portProbe: async () => true, pause: async () => {}, confirmLicense: async () => true});
  const dispatch = async (action, payload) => {
    if (action === 'snapshot') return {catalogue: {sourceSha256: null}, operations: legacy, targets: []};
    return service.dispatch(action, payload);
  };
  return {service, adapters: createBrowserServerAdapters({dispatch, authenticate: async () => true}), dispatch, execFile};
}

test('every action the channel defines is now mapped, and flavors cover all six with creatable targets only', async () => {
  const {adapters} = await wire();
  assert.deepEqual([...SUPPORTED_SERVER_ACTIONS].sort(), ['change-setting', 'create', 'install-plugin', 'restart', 'start', 'stop']);
  for (const action of SUPPORTED_SERVER_ACTIONS) assert.equal(adapters.supportsServerAction(action), true);
  assert.equal(adapters.supportsServerAction('delete'), false);
  const catalogue = await adapters.readServerCatalog({});
  assert.deepEqual(catalogue.flavors.map(item => item.id), ['vanilla', 'paper', 'purpur', 'fabric', 'forge', 'neoforge']);
  assert.ok(catalogue.flavors.every(item => item.targets.join() === 'local-process,local-container'));
});

test('create, license, start, settings and plugin install map onto the managed service', async () => {
  const {adapters, service, dispatch} = await wire({legacy: [{serverId: 'server-1', version: '1.21.4', status: 'prepared', bytesVerified: true}]});
  const created = await adapters.applyServerAction({action: 'create', server: null, options: {target: 'local-process', flavor: 'paper', version: '1.21.4'}});
  assert.equal(created.state, 'changed');
  assert.match(created.server, /^managed-/);
  await service.idle();
  const id = created.server;
  const listed = await adapters.readServers();
  assert.deepEqual(listed.targets, [{id: 'local-process', available: true}, {id: 'local-container', available: true}, {id: 'ssh-process', available: true}, {id: 'ssh-container', available: true}]);
  assert.deepEqual(listed.servers.map(item => [item.id, item.target, item.flavor, item.state]), [['server-1', 'local-process', 'vanilla', 'prepared'], [id, 'local-process', 'paper', 'prepared']]);
  for (const row of listed.servers) assert.ok(serverId(row.id) && flavorId(row.flavor) && versionId(row.version) && SERVER_STATES.includes(row.state) && row.name.length <= 80, 'rows pass the strict channel validation: ' + JSON.stringify(row));
  assert.deepEqual(Object.keys(listed.servers[1]).sort(), ['flavor', 'id', 'name', 'state', 'target', 'version'], 'no path, address, key or log leaves the desktop');

  assert.deepEqual(await adapters.applyServerAction({action: 'start', server: id, options: null}), {state: 'rejected', server: id}, 'a license that was never accepted in the desktop is never accepted from the browser');
  await dispatch('acceptServerLicense', {serverId: id});
  assert.deepEqual(await adapters.applyServerAction({action: 'start', server: id, options: null}), {state: 'changed', server: id});
  assert.equal((await adapters.readServers()).servers[1].state, 'running');
  assert.deepEqual(await adapters.applyServerAction({action: 'install-plugin', server: id, options: {plugin: 'worldedit'}}), {state: 'rejected', server: id}, 'extensions need a stopped server');
  assert.deepEqual(await adapters.applyServerAction({action: 'stop', server: id, options: null}), {state: 'changed', server: id});
  assert.deepEqual(await adapters.applyServerAction({action: 'install-plugin', server: id, options: {plugin: 'worldedit'}}), {state: 'changed', server: id});
  assert.deepEqual(await adapters.applyServerAction({action: 'change-setting', server: id, options: {key: 'max-players', value: 12}}), {state: 'changed', server: id});
  assert.deepEqual(await adapters.applyServerAction({action: 'change-setting', server: id, options: {key: 'enable-rcon', value: true}}), {state: 'rejected', server: id}, 'RCON is not an editable setting');
  assert.deepEqual(await adapters.applyServerAction({action: 'change-setting', server: id, options: {key: 'difficulty', value: 'brutal'}}), {state: 'rejected', server: id});
  assert.deepEqual(await adapters.applyServerAction({action: 'install-plugin', server: id, options: {plugin: 'missing-plugin'}}).catch(error => ({thrown: error.message})), {thrown: 'Server source is unavailable.'}, 'an unreachable repository is an unavailable answer, not a success');
  assert.deepEqual(await adapters.applyServerAction({action: 'restart', server: id, options: null}), {state: 'changed', server: id});
  assert.deepEqual(await adapters.applyServerAction({action: 'start', server: MANAGED, options: null}), {state: 'rejected', server: MANAGED}, 'an unknown managed id is rejected');
  assert.deepEqual(await adapters.applyServerAction({action: 'change-setting', server: 'server-1', options: {key: 'motd', value: 'x'}}), {state: 'unavailable', server: null}, 'verified-download servers have no settings surface');
});

test('create is unavailable when the target cannot run, and SSH servers cannot be created from a browser', async () => {
  const noDocker = await wire({docker: false});
  assert.deepEqual(await noDocker.adapters.applyServerAction({action: 'create', server: null, options: {target: 'local-container', flavor: 'paper', version: '1.21.4'}}), {state: 'unavailable', server: null});
  assert.deepEqual((await noDocker.adapters.readServers()).targets.map(item => item.available), [true, false, true, true]);
  const {adapters, execFile} = await wire();
  for (const target of ['ssh-process', 'ssh-container']) assert.deepEqual(await adapters.applyServerAction({action: 'create', server: null, options: {target, flavor: 'paper', version: '1.21.4'}}), {state: 'unavailable', server: null}, target);
  assert.deepEqual(await adapters.applyServerAction({action: 'create', server: null, options: {target: 'local-process', flavor: 'bukkit', version: '1.21.4'}}), {state: 'unavailable', server: null});
  assert.ok(!execFile.calls.some(call => call.file === 'ssh' && call.args[0] !== '-V'), 'no SSH connection was attempted for a browser request');
});

test('a second operation on the same server is answered busy', async () => {
  const {adapters, dispatch, service} = await wire();
  const { server } = await adapters.applyServerAction({action: 'create', server: null, options: {target: 'local-process', flavor: 'paper', version: '1.21.4'}});
  await service.idle();
  await dispatch('acceptServerLicense', {serverId: server});
  const first = adapters.applyServerAction({action: 'start', server, options: null});
  assert.equal((await adapters.applyServerAction({action: 'stop', server, options: null})).state, 'busy');
  assert.equal((await first).state, 'changed');
});

test('the renderer channel accepts only fixed identifiers and bounded values for the new actions', () => {
  const id = MANAGED;
  const ok = [
    ['targets', {}], ['servers', {}], ['chooseSshKey', {}], ['flavorVersions', {flavor: 'paper'}],
    ['createServer', {target: 'ssh-process', flavor: 'paper', version: '1.21.4', ssh: {host: 'h.example', user: 'mc', port: 2222, keyId: 'key-0d3f5b2a-1111-4222-8333-444455556666'}}],
    ['createServer', {target: 'local-container', flavor: 'fabric', version: '1.21.4', name: 'Mine', port: 25570, memoryMb: 4096, containerMode: 'jar'}],
    ['cancelServer', {serverId: id}], ['acceptServerLicense', {serverId: id}], ['startServer', {serverId: id}], ['stopServer', {serverId: id}], ['restartServer', {serverId: id}], ['serverStatus', {serverId: id}],
    ['serverLogs', {serverId: id, lines: 100}], ['serverSettings', {serverId: id}], ['changeServerSetting', {serverId: id, key: 'motd', value: 'Hi'}], ['changeServerSetting', {serverId: id, key: 'pvp', value: false}],
    ['searchExtensions', {serverId: id, query: ''}], ['installExtension', {serverId: id, source: 'modrinth', project: 'worldedit'}], ['installExtension', {serverId: id, source: 'file'}], ['listExtensions', {serverId: id}],
  ];
  for (const [action, payload] of ok) assert.deepEqual(validateFeatureRequest('server-manager', action, payload), {feature: 'server-manager', action, payload}, action);
  const bad = [
    ['createServer', {target: 'ssh-process', flavor: 'paper', version: '1.21.4', ssh: {host: 'h.example', user: 'mc', password: 'hunter2'}}],
    ['createServer', {target: 'ssh-process', flavor: 'paper', version: '1.21.4', ssh: {host: 'h.example', user: 'mc', keyPath: 'C:\\id_rsa'}}],
    ['createServer', {target: 'ssh-process', flavor: 'paper', version: '1.21.4', ssh: {host: 'h.example', user: 'root;id'}}],
    ['createServer', {target: 'local-process', flavor: 'paper', version: '1.21.4', url: 'https://evil.example/s.jar'}],
    ['createServer', {target: 'local-process', flavor: 'paper', version: '1.21.4', command: 'id'}],
    ['createServer', {target: 'local-process', flavor: 'paper', version: '$(id)'}],
    ['createServer', {target: 'local-process', flavor: 'paper', version: '1.21.4', port: 22}],
    ['startServer', {serverId: 'server-0d3f5b2a-1111-4222-8333-444455556666'}], ['startServer', {serverId: '../x'}], ['startServer', {}], ['startServer', {serverId: id, extra: 1}],
    ['serverLogs', {serverId: id, lines: 5000}], ['changeServerSetting', {serverId: id, key: 'A B', value: 1}], ['changeServerSetting', {serverId: id, key: 'motd', value: {}}],
    ['installExtension', {serverId: id, source: 'url', project: 'x'}], ['installExtension', {serverId: id, source: 'file', path: 'C:\\evil.jar'}], ['installExtension', {serverId: id, source: 'modrinth', project: '../x'}],
    ['flavorVersions', {flavor: 'Paper;id'}], ['targets', {a: 1}], ['chooseSshKey', {path: 'C:\\id'}],
  ];
  for (const [action, payload] of bad) assert.throws(() => validateFeatureRequest('server-manager', action, payload), /Unsupported/, action + JSON.stringify(payload));
  assert.throws(() => validateFeatureRequest('server-manager', 'startServer', {serverId: id}, {browser: true}), /Unsupported/, 'the paired browser reaches the manager only through the mediated channel');
});
