import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServerTargetsService} from '../src/main/server-targets-service.js';
import {requiredJavaMajor, resolveJavaRequirement} from '../src/features/server-manager/flavors.js';
import {serverImage, javaImage, dockerRunArgs} from '../src/features/server-manager/launch-plans.js';
import {createWindowCloseHandler, closeChoiceFromResponse} from '../src/main/window-close.js';
import {fakeExec, fakeFetch, fakeSpawn, sha, JAR} from './server-targets-fakes.js';

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const DETAIL = 'https://piston-meta.mojang.com/v1/packages/abc/26.3.json';
const JARURL = 'https://piston-data.mojang.com/v1/objects/xyz/server.jar';
const mojang = (major = 25) => ({
  [MANIFEST]: {versions: [{id: '26.3', type: 'release', url: DETAIL}]},
  [DETAIL]: {javaVersion: {component: 'java-runtime-epsilon', majorVersion: major}, downloads: {server: {url: JARURL, sha1: sha('sha1', JAR), size: JAR.length}}},
  [JARURL]: JAR,
});

async function harness({javaStderr = 'openjdk version "21.0.4" 2024-07-16', routes = mojang()} = {}) {
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-runtime-'));
  const world = {javaStderr, container: null, remoteRunning: true, remoteJava: javaStderr};
  const execFile = fakeExec((file, args) => {
    if (file === 'java') return {stdout: '', stderr: world.javaStderr};
    if (file === 'docker') {
      if (args[0] === 'version' || args[0] === 'pull') return {stdout: '27\n', stderr: ''};
      if (args[0] === 'run') { world.container = {state: 'running', exit: '0', label: args.find(item => item.startsWith('mfe.server=')).slice(11)}; return {stdout: 'id\n', stderr: ''}; }
      if (args[0] === 'inspect') { if (!world.container) throw Error('No such object'); return {stdout: world.container.state + '|' + world.container.label + '|' + world.container.exit + '\n', stderr: ''}; }
      if (args[0] === 'logs') return {stdout: 'container crashed\n', stderr: ''};
      if (args[0] === 'start') { world.container.state = 'running'; return {stdout: '', stderr: ''}; }
    }
    if (file === 'ssh') {
      const cmd = args.at(-1);
      if (cmd === 'echo mfe-ok') return {stdout: 'mfe-ok\n', stderr: ''};
      if (cmd.includes('sha256sum')) return {stdout: sha('sha256', JAR) + '  file\n', stderr: ''};
      if (cmd.startsWith('java -version')) return {stdout: world.remoteJava + '\n', stderr: ''};
      if (cmd.includes('nohup java')) return {stdout: '321\n', stderr: ''};
      if (cmd.includes('echo running')) return {stdout: (world.remoteRunning ? 'running' : 'stopped') + '\n', stderr: ''};
      if (cmd.includes('tail -n')) return {stdout: 'remote crash line\n', stderr: ''};
      if (cmd.startsWith('mkdir -p') || cmd.startsWith('cd ') || cmd.includes('tee')) return {stdout: '', stderr: ''};
    }
    throw Error('unexpected command ' + file + ' ' + JSON.stringify(args));
  });
  const spawn = fakeSpawn();
  const states = [];
  const service = createServerTargetsService({
    dataDirectory, deps: {execFile, spawn}, fetchImpl: fakeFetch(routes), portProbe: async () => true, pause: async () => {}, monitorMs: 0,
    confirmLicense: async () => true, chooseSshKey: async () => null, emit: event => states.push(event),
  });
  const call = (action, payload = {}) => service.dispatch(action, payload);
  const make = async payload => { const view = await call('createServer', payload); await service.idle(); return (await call('servers')).servers.find(item => item.serverId === view.serverId); };
  const find = async id => (await call('servers')).servers.find(item => item.serverId === id);
  return {service, call, make, find, execFile, spawn, world, states};
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(condition) { for (let i = 0; i < 200; i++) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 5)); } throw Error('Condition was never met.'); }
const ssh = {host: 'mc.example.net', user: 'minecraft'};

test('the Java requirement comes from Mojang metadata, falls back to the release table, and understands year-based versions', async () => {
  assert.deepEqual(['26.1', '26.3', '26w14a', '25w02a', '1.21.4', '1.20.4', '1.16.5'].map(requiredJavaMajor), [25, 25, 25, 21, 21, 17, 8]);
  assert.deepEqual(await resolveJavaRequirement('vanilla', '26.3', {fetchImpl: fakeFetch(mojang(25))}), {major: 25, source: 'mojang'});
  assert.deepEqual(await resolveJavaRequirement('paper', '26.3', {fetchImpl: fakeFetch(mojang(25))}), {major: 25, source: 'mojang'}, 'every flavor runs a Mojang release');
  assert.deepEqual(await resolveJavaRequirement('vanilla', '26.3', {fetchImpl: fakeFetch({})}), {major: 25, source: 'table'}, 'unreachable metadata falls back and says so');
  assert.deepEqual(await resolveJavaRequirement('vanilla', '1.20.4', {fetchImpl: fakeFetch({[MANIFEST]: {versions: [{id: '1.20.4', url: DETAIL}]}, [DETAIL]: {javaVersion: {majorVersion: 'bogus'}}})}), {major: 17, source: 'table'});
});

test('container images follow the required Java major', () => {
  assert.equal(javaImage(25), 'eclipse-temurin:25-jre');
  assert.deepEqual([8, 16, 17, 21, 25, undefined].map(serverImage), ['itzg/minecraft-server:java8', 'itzg/minecraft-server:java17', 'itzg/minecraft-server:java17', 'itzg/minecraft-server:latest', 'itzg/minecraft-server:java25', 'itzg/minecraft-server:latest']);
  assert.throws(() => serverImage(99), /Invalid server command input/);
  const base = {id: 'managed-11111111-1111-1111-1111-111111111111', flavor: 'paper', version: '26.3', port: 25565, memoryMb: 2048, licenseAccepted: true, hostData: '/data', mode: 'itzg'};
  assert.equal(dockerRunArgs({...base, javaMajor: 25}).at(-1), 'itzg/minecraft-server:java25');
});

test('Start is refused before launch when the local Java is older than the release needs', async () => {
  const h = await harness();
  const server = await h.make({target: 'local-process', flavor: 'vanilla', version: '26.3'});
  assert.deepEqual([server.state, server.javaMajor, server.javaSource], ['prepared', 25, 'mojang']);
  await h.call('acceptServerLicense', {serverId: server.serverId});
  await assert.rejects(h.call('startServer', {serverId: server.serverId}), /Java 25 or newer is required; Java 21 was found\./);
  assert.equal(h.spawn.calls.length, 0, 'java was never spawned');
  const failed = await h.find(server.serverId);
  assert.deepEqual([failed.state, failed.errorCode, failed.errorParams], ['failed', 'java-too-old', {required: 25, found: 21, where: 'local'}]);
  h.world.javaStderr = 'openjdk version "25.0.1" 2025-10-21';
  assert.equal((await h.call('startServer', {serverId: server.serverId})).state, 'running', 'a new enough Java starts it and clears the failure');
  const running = await h.find(server.serverId);
  assert.deepEqual([running.errorCode, running.error], [null, null]);
});

test('Start on an SSH host checks the remote Java against the stored requirement', async () => {
  const h = await harness();
  const server = await h.make({target: 'ssh-process', flavor: 'vanilla', version: '26.3', ssh});
  assert.equal(server.state, 'prepared');
  await h.call('acceptServerLicense', {serverId: server.serverId});
  await assert.rejects(h.call('startServer', {serverId: server.serverId}), /Java 25 or newer is required on the host; Java 21 was found\./);
  assert.ok(!h.execFile.calls.some(call => call.file === 'ssh' && call.args.at(-1).includes('nohup java')), 'nothing was started on the host');
  assert.equal((await h.find(server.serverId)).errorParams.where, 'host');
  h.world.remoteJava = 'openjdk version "25.0.1" 2025-10-21';
  assert.equal((await h.call('startServer', {serverId: server.serverId})).state, 'running');
});

test('a local process that crashes moves the card to failed with its exit code and last log lines', async () => {
  const h = await harness({javaStderr: 'openjdk version "25.0.1" 2025-10-21'});
  const server = await h.make({target: 'local-process', flavor: 'vanilla', version: '26.3'});
  await h.call('acceptServerLicense', {serverId: server.serverId});
  await h.call('startServer', {serverId: server.serverId});
  const child = h.spawn.calls[0].child;
  child.stdout.write('Exception in thread "main" java.lang.UnsupportedClassVersionError\n');
  await tick();
  const before = h.states.length;
  child.finish(1);
  await until(async () => (await h.find(server.serverId)).state === 'failed' && h.states.length > before);
  const failed = await h.find(server.serverId);
  assert.deepEqual([failed.state, failed.exitCode, failed.errorCode, failed.errorParams], ['failed', 1, 'exited', {code: 1}]);
  assert.match(failed.error, /exited with code 1/);
  assert.match(failed.lastLines.join('\n'), /UnsupportedClassVersionError/);
  assert.ok(h.states.length > before, 'the renderer is told the state changed');
  const restarted = await h.call('startServer', {serverId: server.serverId});
  assert.equal(restarted.state, 'running', 'a failed card can be started again');
  assert.deepEqual([restarted.exitCode, restarted.lastLines], [null, []]);
});

test('a requested stop and a clean exit are stopped, never failed', async () => {
  const h = await harness({javaStderr: 'openjdk version "25.0.1" 2025-10-21'});
  const server = await h.make({target: 'local-process', flavor: 'vanilla', version: '26.3'});
  await h.call('acceptServerLicense', {serverId: server.serverId});
  await h.call('startServer', {serverId: server.serverId});
  assert.equal((await h.call('stopServer', {serverId: server.serverId})).state, 'stopped');
  await tick();
  assert.equal((await h.find(server.serverId)).state, 'stopped');
  await h.call('startServer', {serverId: server.serverId});
  h.spawn.calls[1].child.finish(0);
  await until(async () => (await h.find(server.serverId)).state === 'stopped');
  const clean = await h.find(server.serverId);
  assert.deepEqual([clean.state, clean.exitCode, clean.error], ['stopped', 0, null], 'an in-game /stop exits with code 0');
});

test('a container that exits on its own is noticed by the monitor', async () => {
  const h = await harness({javaStderr: 'openjdk version "25.0.1" 2025-10-21'});
  const server = await h.make({target: 'local-container', flavor: 'vanilla', version: '26.3', containerMode: 'jar'});
  assert.ok(h.execFile.calls.some(call => call.args[0] === 'pull' && call.args[1] === 'eclipse-temurin:25-jre'), 'the image matches the required Java');
  await h.call('acceptServerLicense', {serverId: server.serverId});
  await h.call('startServer', {serverId: server.serverId});
  await h.service.monitorOnce();
  assert.equal((await h.find(server.serverId)).state, 'running', 'a healthy container stays running');
  h.world.container.state = 'exited'; h.world.container.exit = '1';
  await h.service.monitorOnce();
  const failed = await h.find(server.serverId);
  assert.deepEqual([failed.state, failed.exitCode, failed.errorCode], ['failed', 1, 'exited']);
  assert.deepEqual(failed.lastLines, ['container crashed']);
  await h.call('startServer', {serverId: server.serverId});
  h.world.container.state = 'exited'; h.world.container.exit = '0';
  await h.service.monitorOnce();
  assert.equal((await h.find(server.serverId)).state, 'stopped', 'exit code 0 is a normal end');
});

test('an SSH process whose pid vanished is noticed by the monitor', async () => {
  const h = await harness({javaStderr: 'openjdk version "25.0.1" 2025-10-21'});
  const server = await h.make({target: 'ssh-process', flavor: 'vanilla', version: '26.3', ssh});
  await h.call('acceptServerLicense', {serverId: server.serverId});
  await h.call('startServer', {serverId: server.serverId});
  await h.service.monitorOnce();
  assert.equal((await h.find(server.serverId)).state, 'running');
  h.world.remoteRunning = false;
  await h.service.monitorOnce();
  const failed = await h.find(server.serverId);
  assert.deepEqual([failed.state, failed.errorCode, failed.lastLines], ['failed', 'ended', ['remote crash line']]);
});

test('the monitor timer runs while a server is live and stops with the service', async () => {
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-runtime-timer-'));
  const spawn = fakeSpawn();
  const execFile = fakeExec(file => file === 'java' ? {stdout: '', stderr: 'openjdk version "25.0.1" 2025-10-21'} : {stdout: '', stderr: ''});
  const service = createServerTargetsService({dataDirectory, deps: {execFile, spawn}, fetchImpl: fakeFetch(mojang()), portProbe: async () => true, monitorMs: 20, confirmLicense: async () => true});
  const view = await service.dispatch('createServer', {target: 'local-process', flavor: 'vanilla', version: '26.3'});
  await service.idle();
  await service.dispatch('acceptServerLicense', {serverId: view.serverId});
  await service.dispatch('startServer', {serverId: view.serverId});
  spawn.calls[0].child.exitCode = 3; // the process died without the exit event reaching us; only polling can see it
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal((await service.dispatch('servers')).servers[0].state, 'failed');
  await service.close();
});

test('window close: no servers hides, a running server asks, and no close is ever swallowed', async () => {
  const calls = [];
  const make = (servers, choice) => createWindowCloseHandler({
    isShuttingDown: () => false, isTestMode: () => false, liveServers: () => servers, hideWindow: () => calls.push('hide'),
    askChoice: async list => { calls.push('ask:' + list.length); if (choice instanceof Error) throw choice; return choice; }, quit: async () => { calls.push('quit'); },
  });
  const event = () => ({prevented: false, preventDefault() { this.prevented = true; }});
  const settle = () => new Promise(resolve => setTimeout(resolve, 5));
  let e = event(); make([], 'quit')(e); await settle();
  assert.deepEqual([e.prevented, calls.splice(0)], [true, ['hide']]);
  e = event(); make([{name: 'a'}], 'quit')(e); await settle();
  assert.deepEqual(calls.splice(0), ['ask:1', 'quit']);
  e = event(); make([{name: 'a'}], 'hide')(e); await settle();
  assert.deepEqual(calls.splice(0), ['ask:1', 'hide']);
  e = event(); make([{name: 'a'}], 'cancel')(e); await settle();
  assert.deepEqual(calls.splice(0), ['ask:1'], 'cancel is an explicit, visible choice to stay open');
  e = event(); make([{name: 'a'}], Error('dialog failed'))(e); await settle();
  assert.deepEqual(calls.splice(0), ['ask:1', 'hide'], 'a failed dialog falls back to the ordinary hide');
  const throwing = createWindowCloseHandler({isShuttingDown: () => false, isTestMode: () => false, liveServers: () => { throw Error('bad'); }, hideWindow: () => calls.push('hide'), askChoice: async () => 'quit', quit: async () => {}});
  e = event(); throwing(e); await settle();
  assert.deepEqual(calls.splice(0), ['hide']);
  let release; const gate = new Promise(resolve => { release = resolve; });
  const slow = createWindowCloseHandler({isShuttingDown: () => false, isTestMode: () => false, liveServers: () => [{name: 'a'}], hideWindow: () => calls.push('hide'), askChoice: async () => { calls.push('ask'); await gate; return 'hide'; }, quit: async () => {}});
  slow(event()); slow(event()); await settle();
  assert.deepEqual(calls.splice(0), ['ask'], 'a second close while the choice is open does not stack a second dialog');
  release(); await settle();
  assert.deepEqual(calls.splice(0), ['hide']);
  const shutting = createWindowCloseHandler({isShuttingDown: () => true, isTestMode: () => false, liveServers: () => [], hideWindow: () => calls.push('hide'), askChoice: async () => 'quit', quit: async () => {}});
  e = event(); shutting(e);
  assert.deepEqual([e.prevented, calls], [false, []], 'while shutting down the close goes through');
  assert.deepEqual([0, 1, 2, 9].map(closeChoiceFromResponse), ['hide', 'quit', 'cancel', 'cancel']);
});
