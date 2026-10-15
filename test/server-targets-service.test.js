import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServerTargetsService} from '../src/main/server-targets-service.js';
import {fakeExec, fakeFetch, fakeSpawn, sha, JAR, JAVA_21} from './server-targets-fakes.js';

const PAPER = 'https://api.papermc.io/v2/projects/paper';
const FORGE_ID = '1.21.1-52.0.2';
const API = 'https://api.modrinth.com/v2';
const modrinthRoute = (loaders, body) => API + '/project/worldedit/version?loaders=' + encodeURIComponent(JSON.stringify(loaders)) + '&game_versions=' + encodeURIComponent(JSON.stringify(['1.21.4']));
const PLUGIN = Buffer.concat([JAR, Buffer.from(' plugin')]);
const CDN = 'https://cdn.modrinth.com/data/x/versions/AbCd1234/worldedit-7.3.0.jar';

function routes(overrides = {}) {
  return {
    [PAPER + '/versions/1.21.4/builds']: {builds: [{build: 11, channel: 'default', downloads: {application: {name: 'paper-1.21.4-11.jar', sha256: sha('sha256', JAR)}}}]},
    [PAPER + '/versions/1.21.4/builds/11/downloads/paper-1.21.4-11.jar']: JAR,
    'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json': {promos: {'1.21.1-recommended': '52.0.2'}},
    ['https://maven.minecraftforge.net/net/minecraftforge/forge/' + FORGE_ID + '/forge-' + FORGE_ID + '-installer.jar.sha256']: sha('sha256', JAR),
    ['https://maven.minecraftforge.net/net/minecraftforge/forge/' + FORGE_ID + '/forge-' + FORGE_ID + '-installer.jar']: JAR,
    [modrinthRoute(['paper', 'spigot', 'bukkit'])]: [{id: 'AbCd1234', version_number: '7.3.0', files: [{primary: true, filename: 'worldedit-7.3.0.jar', size: PLUGIN.length, url: CDN, hashes: {sha512: sha('sha512', PLUGIN)}}]}],
    [CDN]: PLUGIN,
    [API + '/search?query=worldedit&limit=20&facets=' + encodeURIComponent(JSON.stringify([['project_type:plugin'], ['versions:1.21.4'], ['categories:paper', 'categories:spigot', 'categories:bukkit']]))]: {hits: [{slug: 'worldedit', title: 'WorldEdit', description: 'x', downloads: 1}]},
    ...overrides,
  };
}

/** One service wired entirely to fakes. `world` lets a test steer what docker and the SSH host answer. */
async function harness({fetchRoutes = routes(), license = true, key = null, extensionFile = null, ports = true} = {}) {
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-targets-'));
  const world = {containers: new Map(), remoteRunning: false, remoteDigest: sha('sha256', JAR), docker: true, dockerLabel: null, javaStderr: JAVA_21.stderr};
  const execFile = fakeExec((file, args) => {
    if (file === 'java') return {stdout: '', stderr: world.javaStderr};
    if (file === 'ssh' && args[0] === '-V') return {stdout: '', stderr: 'OpenSSH_9.8'};
    if (file === 'docker') {
      if (!world.docker) throw Error('Cannot connect to the Docker daemon');
      if (args[0] === 'version') return {stdout: '27.0.1\n', stderr: ''};
      if (args[0] === 'pull') return {stdout: '', stderr: ''};
      const name = args.find(item => /^mfe-/.test(item));
      if (args[0] === 'run') { const label = args.find(item => item.startsWith('mfe.server=')).slice(11); world.containers.set(args[args.indexOf('--name') + 1], {state: 'running', label: world.dockerLabel ?? label}); return {stdout: 'abc123\n', stderr: ''}; }
      const container = world.containers.get(name);
      if (args[0] === 'inspect') { if (!container) throw Error('No such object'); return {stdout: container.state + '|' + container.label + '\n', stderr: ''}; }
      if (args[0] === 'stop') { container.state = 'exited'; return {stdout: name, stderr: ''}; }
      if (args[0] === 'start') { container.state = 'running'; return {stdout: name, stderr: ''}; }
      if (args[0] === 'logs') return {stdout: 'line one\nline two\n', stderr: ''};
    }
    if (file === 'ssh') {
      const cmd = args.at(-1);
      if (cmd === 'echo mfe-ok') return {stdout: 'mfe-ok\n', stderr: ''};
      if (cmd.includes('sha256sum')) return {stdout: world.remoteDigest + '  file\n', stderr: ''};
      if (cmd.startsWith('java -version')) return {stdout: '', stderr: world.javaStderr};
      if (cmd.includes('setsid nohup')) { world.remoteRunning = true; return {stdout: '321\n', stderr: ''}; }
      if (cmd.includes('kill -TERM')) { world.remoteRunning = false; return {stdout: 'stopping\n', stderr: ''}; }
      if (cmd.includes('echo running')) return {stdout: (world.remoteRunning ? 'running' : 'stopped') + '\n', stderr: ''};
      if (cmd.includes('find libraries')) return {stdout: 'libraries/net/minecraftforge/forge/' + FORGE_ID + '/unix_args.txt\n', stderr: ''};
      if (cmd.includes('tail -n')) return {stdout: 'remote one\nremote two\n', stderr: ''};
      if (cmd.includes("docker 'version'")) { if (!world.docker) throw Error('no docker'); return {stdout: '27\n', stderr: ''}; }
      if (cmd.startsWith("docker 'inspect'")) { const container = [...world.containers.values()][0]; if (!container) throw Error('No such object'); return {stdout: container.state + '|' + container.label + '\n', stderr: ''}; }
      if (cmd.includes("docker 'run'")) { world.containers.set('remote', {state: 'running', label: cmd.match(/mfe\.server=(managed-[a-f0-9-]+)/)[1]}); return {stdout: 'abc\n', stderr: ''}; }
      if (cmd.startsWith("docker 'stop'")) { [...world.containers.values()][0].state = 'exited'; return {stdout: '', stderr: ''}; }
      if (cmd.startsWith("docker 'pull'") || cmd.startsWith('mkdir -p') || cmd.startsWith('java ') || cmd.startsWith('cd ')) return {stdout: '', stderr: ''};
      if (cmd.startsWith("docker 'logs'")) return {stdout: 'container log\n', stderr: ''};
    }
    throw Error('unexpected command ' + file + ' ' + JSON.stringify(args));
  });
  const spawn = fakeSpawn();
  const fetchImpl = fakeFetch(fetchRoutes);
  const confirmations = [];
  const service = createServerTargetsService({
    dataDirectory, deps: {execFile, spawn}, fetchImpl, portProbe: async () => ports, pause: async () => {},
    confirmLicense: async contract => { confirmations.push(contract); return license; },
    chooseSshKey: async () => key, chooseExtensionFile: async () => extensionFile, emit: () => {},
  });
  const call = (action, payload = {}) => service.dispatch(action, payload);
  return {service, call, execFile, spawn, fetchImpl, world, dataDirectory, confirmations};
}
const settle = async h => { await h.service.idle(); };
async function created(h, payload) { const view = await h.call('createServer', payload); await settle(h); return (await h.call('targets')).servers.find(item => item.serverId === view.serverId); }

test('local process: prepare verified bytes, gate start on the license, start, tail logs and stop with argument arrays only', async () => {
  const h = await harness();
  const server = await created(h, {target: 'local-process', flavor: 'paper', version: '1.21.4'});
  assert.deepEqual([server.state, server.distribution.integrity, server.distribution.hashAlgorithm, server.licenseAccepted], ['prepared', 'verified-sha256', 'sha256', false]);
  const data = path.join(h.dataDirectory, 'server-manager', 'managed', 'servers', server.serverId, 'data');
  assert.equal(await fs.readFile(path.join(data, 'eula.txt'), 'utf8'), 'eula=false\n');
  assert.deepEqual(await fs.readFile(path.join(data, 'server.jar')), JAR);
  assert.match(await fs.readFile(path.join(data, 'server.properties'), 'utf8'), /^server-ip=127\.0\.0\.1\nserver-port=25565\n/, 'a local process binds to loopback by default');
  await assert.rejects(h.call('startServer', {serverId: server.serverId}), /license acceptance is required/);
  assert.equal(h.spawn.calls.length, 0, 'nothing was launched before the license was accepted');
  assert.deepEqual(await h.call('acceptServerLicense', {serverId: server.serverId}), {accepted: true});
  assert.equal(h.confirmations[0].url, 'https://www.minecraft.net/en-us/eula');
  assert.equal(await fs.readFile(path.join(data, 'eula.txt'), 'utf8'), 'eula=true\n');
  assert.equal((await h.call('startServer', {serverId: server.serverId})).state, 'running');
  const launch = h.spawn.calls[0];
  assert.equal(launch.file, 'java');
  assert.deepEqual(launch.args, ['-Dmfe.server=' + server.serverId, '-Xmx2048M', '-jar', 'server.jar', 'nogui']);
  assert.ok(!launch.options.shell && launch.options.cwd === data, 'no shell, and the working directory is the owned data directory');
  launch.child.stdout.write('[Server] Done (1.2s)!\nsecond line\n');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual((await h.call('serverLogs', {serverId: server.serverId, lines: 1})).lines, ['second line'], 'logs are bounded to the requested tail');
  assert.equal((await h.call('startServer', {serverId: server.serverId})).state, 'running', 'a second start of a running server is a no-op');
  assert.equal(h.spawn.calls.length, 1, 'and never launches a second process');
  assert.equal((await h.call('stopServer', {serverId: server.serverId})).state, 'stopped');
  assert.deepEqual(launch.child.written, ['stop\n'], 'a normal stop is the console command, never a signal');
  assert.equal((await h.call('serverStatus', {serverId: server.serverId})).state, 'stopped');
});

test('start refuses an old Java and a missing Java without launching anything', async () => {
  const h = await harness();
  const server = await created(h, {target: 'local-process', flavor: 'paper', version: '1.21.4'});
  await h.call('acceptServerLicense', {serverId: server.serverId});
  h.world.javaStderr = 'openjdk version "17.0.2" 2022-01-18';
  await assert.rejects(h.call('startServer', {serverId: server.serverId}), /Java 21 or newer is required; Java 17 was found/);
  assert.equal(h.spawn.calls.length, 0);
  assert.equal((await h.call('targets')).servers[0].state, 'failed');
});

test('an integrity mismatch, an occupied port and a hostile request are all refused', async () => {
  const bad = await harness({fetchRoutes: routes({[PAPER + '/versions/1.21.4/builds/11/downloads/paper-1.21.4-11.jar']: Buffer.concat([JAR, Buffer.from('tampered')])})});
  const server = await created(bad, {target: 'local-process', flavor: 'paper', version: '1.21.4'});
  assert.equal(server.state, 'failed');
  assert.match(server.error, /integrity mismatch|size/);
  assert.deepEqual(await fs.readdir(path.join(bad.dataDirectory, 'server-manager', 'managed', 'staging')), [], 'the unverified bytes are removed');
  await assert.rejects(bad.call('startServer', {serverId: server.serverId}), /license acceptance is required|still being/);
  const busy = await harness({ports: false});
  await assert.rejects(busy.call('createServer', {target: 'local-process', flavor: 'paper', version: '1.21.4'}), /port is already in use/);
  const h = await harness();
  const hostile = [
    {target: 'local-process', flavor: 'paper', version: '1.21.4; id'}, {target: 'local-process', flavor: 'paper', version: '1.21.4', port: 80},
    {target: 'local-process', flavor: 'paper', version: '1.21.4', memoryMb: 1}, {target: 'nope', flavor: 'paper', version: '1.21.4'},
    {target: 'local-process', flavor: 'paper', version: '1.21.4', ssh: {host: 'h.example', user: 'mc'}},
    {target: 'local-process', flavor: 'paper', version: '1.21.4', containerMode: 'jar'},
    {target: 'local-container', flavor: 'forge', version: '1.21.1', containerMode: 'jar'},
    {target: 'ssh-process', flavor: 'paper', version: '1.21.4'},
    {target: 'ssh-process', flavor: 'paper', version: '1.21.4', ssh: {host: '-oProxyCommand=id', user: 'mc'}},
    {target: 'ssh-process', flavor: 'paper', version: '1.21.4', ssh: {host: 'h.example', user: 'mc', password: 'hunter2'}},
    {target: 'ssh-process', flavor: 'paper', version: '1.21.4', ssh: {host: 'h.example', user: 'mc', keyId: 'key-unknown'}},
    {target: 'local-process', flavor: 'paper', version: '1.21.4', command: 'rm -rf /'},
  ];
  for (const payload of hostile) await assert.rejects(h.call('createServer', payload), /Invalid|only|SSH/, JSON.stringify(payload));
  assert.equal(h.execFile.calls.length, 0, 'no external process ran for any hostile request');
  assert.equal(h.fetchImpl.calls.length, 0, 'and no network request was made');
});

test('cancelling a download stops it, reports cancellation and retains nothing unverified', async () => {
  const hanging = routes();
  const base = fakeFetch(hanging);
  const fetchImpl = async (url, options) => {
    if (!String(url).endsWith('.jar')) return base(url, options);
    return new Response(new ReadableStream({start(controller) { controller.enqueue(new Uint8Array(4)); options.signal.addEventListener('abort', () => controller.error(options.signal.reason), {once: true}); }}), {status: 200});
  };
  const h = await harness();
  const service = createServerTargetsService({dataDirectory: h.dataDirectory, deps: {execFile: h.execFile, spawn: h.spawn}, fetchImpl, portProbe: async () => true, pause: async () => {}});
  const view = await service.dispatch('createServer', {target: 'local-process', flavor: 'paper', version: '1.21.4'});
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(await service.dispatch('cancelServer', {serverId: view.serverId}), {requested: true});
  await service.idle();
  const [server] = (await service.dispatch('targets')).servers;
  assert.deepEqual([server.state, /Canceled/.test(server.error)], ['failed', true]);
  await assert.rejects(service.dispatch('createServer', {target: 'local-process', flavor: 'paper', version: 'x y'}), /Invalid/);
  assert.deepEqual(await service.dispatch('cancelServer', {serverId: view.serverId}), {requested: false}, 'a finished operation is not canceled');
});

test('local container (official image): pull, gate on the license, run with loopback publishing, owned stop, foreign refusal', async () => {
  const h = await harness();
  const server = await created(h, {target: 'local-container', flavor: 'neoforge', version: '1.21.1', port: 25570, memoryMb: 3072});
  assert.equal(server.state, 'prepared');
  assert.deepEqual([server.distribution.artifact, server.distribution.integrity], ['delegated-to-image', 'delegated-to-image'], 'the image downloads the flavor itself, and the result says the desktop did not verify it');
  assert.equal(h.fetchImpl.calls.length, 0, 'the desktop downloaded nothing');
  assert.deepEqual(h.execFile.calls.filter(call => call.file === 'docker').map(call => call.args[0]), ['pull', 'version'], 'only the image pull and the availability probe ran');
  assert.deepEqual(h.execFile.calls.find(call => call.args[0] === 'pull').args, ['pull', 'itzg/minecraft-server:latest']);
  await assert.rejects(h.call('startServer', {serverId: server.serverId}), /license acceptance is required/);
  assert.ok(!h.execFile.calls.some(call => call.args[0] === 'run'), 'no container was created before acceptance');
  await h.call('acceptServerLicense', {serverId: server.serverId});
  assert.equal((await h.call('startServer', {serverId: server.serverId})).state, 'running');
  const run = h.execFile.calls.find(call => call.args[0] === 'run');
  assert.equal(run.file, 'docker');
  assert.ok(run.args.includes('127.0.0.1:25570:25565') && run.args.includes('EULA=TRUE') && run.args.includes('TYPE=NEOFORGE') && run.args.includes('MEMORY=3072M'));
  assert.ok(Array.isArray(run.args) && run.args.every(item => typeof item === 'string'));
  assert.equal((await h.call('serverStatus', {serverId: server.serverId})).state, 'running');
  assert.deepEqual((await h.call('serverLogs', {serverId: server.serverId, lines: 5})).lines, ['line one', 'line two']);
  assert.equal((await h.call('stopServer', {serverId: server.serverId})).state, 'stopped');
  assert.equal((await h.call('startServer', {serverId: server.serverId})).state, 'running', 'an owned existing container is started, not recreated');
  assert.equal(h.execFile.calls.filter(call => call.args[0] === 'run').length, 1);
  for (const container of h.world.containers.values()) container.label = 'someone-elses';
  assert.equal((await h.call('serverStatus', {serverId: server.serverId})).state, 'failed', 'a container whose label is not ours is never trusted');
  await assert.rejects(h.call('stopServer', {serverId: server.serverId}), /not owned/);
});

test('local container (mounted jar): the verified jar is mounted read-only', async () => {
  const h = await harness();
  const server = await created(h, {target: 'local-container', flavor: 'paper', version: '1.21.4', containerMode: 'jar'});
  assert.deepEqual([server.state, server.distribution.integrity], ['prepared', 'verified-sha256']);
  await h.call('acceptServerLicense', {serverId: server.serverId});
  await h.call('startServer', {serverId: server.serverId});
  const run = h.execFile.calls.find(call => call.args[0] === 'run');
  assert.ok(run.args.some(item => /^type=bind,source=.*server\.jar,target=\/srv\/server\.jar,readonly$/.test(item)));
  assert.ok(run.args.includes('--read-only') && !run.args.includes('EULA=TRUE'));
  assert.equal(await fs.readFile(path.join(h.dataDirectory, 'server-manager', 'managed', 'servers', server.serverId, 'data', 'eula.txt'), 'utf8'), 'eula=true\n');
});

test('an unavailable Docker daemon is reported and nothing is attempted blindly', async () => {
  const h = await harness();
  h.world.docker = false;
  const overview = await h.call('targets');
  assert.deepEqual(overview.targets.map(item => [item.id, item.available]), [['local-process', true], ['local-container', false], ['ssh-process', true], ['ssh-container', true]]);
  assert.match(overview.targets[1].reason, /Docker daemon is not reachable/);
  const server = await created(h, {target: 'local-container', flavor: 'paper', version: '1.21.4'});
  assert.equal(server.state, 'failed');
  assert.match(server.error, /image could not be pulled/);
});

test('ssh process: key chosen in a native chooser stays in the main process, host key checking stays on, uploads are digest checked', async () => {
  const keyFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-key-')), 'id_test');
  await fs.writeFile(keyFile, '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----\n');
  const h = await harness({key: keyFile});
  const chosen = await h.call('chooseSshKey');
  assert.deepEqual([chosen.chosen, chosen.label, /^key-/.test(chosen.keyId)], [true, 'id_test', true]);
  const server = await created(h, {target: 'ssh-process', flavor: 'paper', version: '1.21.4', ssh: {host: 'play.example.org', port: 2222, user: 'mc', keyId: chosen.keyId}});
  assert.equal(server.state, 'prepared');
  assert.deepEqual(server.ssh, {host: 'play.example.org', port: 2222, user: 'mc', keyConfigured: true});
  const exposed = JSON.stringify([chosen, server, await h.call('targets'), await h.call('serverSettings', {serverId: server.serverId}).catch(() => null)]);
  assert.ok(!exposed.includes(keyFile) && !exposed.includes('id_test\\') && !exposed.includes('BEGIN'), 'the key path never leaves the main process');
  const sshCalls = [...h.execFile.calls.filter(call => call.file === 'ssh' && call.args[0] !== '-V'), ...h.spawn.calls.filter(call => call.file === 'ssh')];
  assert.ok(sshCalls.length >= 4);
  for (const call of sshCalls) {
    const text = call.args.join(' ');
    assert.match(text, /StrictHostKeyChecking=yes/); assert.match(text, /BatchMode=yes/); assert.ok(call.args.includes(keyFile)); assert.ok(!call.options.shell);
    assert.equal(call.args.at(-2), 'play.example.org');
  }
  const upload = h.spawn.calls.find(call => call.file === 'ssh' && /cat > 'server\.jar\.part'/.test(call.args.at(-1)));
  assert.ok(upload, 'the verified jar is streamed over the ssh stdin');
  await h.call('acceptServerLicense', {serverId: server.serverId});
  assert.equal((await h.call('startServer', {serverId: server.serverId})).state, 'running');
  assert.equal((await h.call('serverStatus', {serverId: server.serverId})).state, 'running');
  assert.deepEqual((await h.call('serverLogs', {serverId: server.serverId, lines: 10})).lines, ['remote one', 'remote two']);
  assert.equal((await h.call('stopServer', {serverId: server.serverId})).state, 'stopping');
  assert.equal((await h.call('serverStatus', {serverId: server.serverId})).state, 'stopped');
  await h.call('startServer', {serverId: server.serverId});
  assert.equal((await h.call('restartServer', {serverId: server.serverId})).state, 'running');
});

test('ssh: an upload whose remote digest differs is a failed preparation, and a non-key file is refused', async () => {
  const h = await harness();
  h.world.remoteDigest = 'a'.repeat(64);
  const server = await created(h, {target: 'ssh-process', flavor: 'paper', version: '1.21.4', ssh: {host: 'h.example', user: 'mc'}});
  assert.equal(server.state, 'failed');
  assert.match(server.error, /did not match its verified digest/);
  const notKey = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-key-')), 'notes.txt');
  await fs.writeFile(notKey, 'hello');
  const other = await harness({key: notKey});
  await assert.rejects(other.call('chooseSshKey'), /does not look like an SSH private key/);
  const folder = await harness({key: path.dirname(notKey)});
  await assert.rejects(folder.call('chooseSshKey'), /regular private key file/);
  assert.deepEqual(await (await harness()).call('chooseSshKey'), {chosen: false});
});

test('ssh process with Forge runs the documented installer remotely and launches from its argument file', async () => {
  const h = await harness();
  const server = await created(h, {target: 'ssh-process', flavor: 'forge', version: '1.21.1', ssh: {host: 'h.example', user: 'mc'}});
  assert.deepEqual([server.state, server.build, server.distribution.integrity], ['prepared', '52.0.2', 'verified-sha256']);
  const install = h.execFile.calls.find(call => call.file === 'ssh' && /--installServer/.test(call.args.at(-1)));
  assert.match(install.args.at(-1), /^cd 'mfe-servers\/managed-[^']+\/data' && java '-jar' 'installer\.jar' '--installServer' > install\.log 2>&1$/);
  await h.call('acceptServerLicense', {serverId: server.serverId});
  await h.call('startServer', {serverId: server.serverId});
  const start = h.execFile.calls.find(call => call.file === 'ssh' && /setsid nohup/.test(call.args.at(-1)));
  assert.match(start.args.at(-1), /'@user_jvm_args\.txt' '@libraries\/net\/minecraftforge\/forge\/1\.21\.1-52\.0\.2\/unix_args\.txt' 'nogui'/);
});

test('ssh container: the official image runs on the host, bound to the remote server directory, after the license', async () => {
  const h = await harness();
  const server = await created(h, {target: 'ssh-container', flavor: 'fabric', version: '1.21.4', ssh: {host: 'h.example', user: 'mc'}});
  assert.equal(server.state, 'prepared');
  await assert.rejects(h.call('startServer', {serverId: server.serverId}), /license acceptance is required/);
  await h.call('acceptServerLicense', {serverId: server.serverId});
  assert.equal((await h.call('startServer', {serverId: server.serverId})).state, 'running');
  const run = h.execFile.calls.find(call => call.file === 'ssh' && /docker 'run'/.test(call.args.at(-1))).args.at(-1);
  assert.ok(run.includes('"type=bind,source=$PWD/data,target=/data"') && run.includes("'EULA=TRUE'") && run.includes("'TYPE=FABRIC'") && run.includes("'127.0.0.1:25565:25565'"));
  assert.ok(!run.includes(os.tmpdir()) && !run.includes(h.dataDirectory), 'no local path is sent to the remote host');
  assert.equal((await h.call('stopServer', {serverId: server.serverId})).state, 'stopped');
  assert.deepEqual((await h.call('serverLogs', {serverId: server.serverId, lines: 3})).lines, ['container log']);
});

test('settings are edited through the schema and never accept RCON, paths or free keys', async () => {
  const h = await harness();
  const server = await created(h, {target: 'local-process', flavor: 'paper', version: '1.21.4'});
  const before = await h.call('serverSettings', {serverId: server.serverId});
  assert.equal(before.values['server-port'], '25565');
  assert.ok(before.descriptors.some(row => row.key === 'motd') && !before.descriptors.some(row => /rcon|level-name/.test(row.key)));
  assert.deepEqual(await h.call('changeServerSetting', {serverId: server.serverId, key: 'motd', value: 'Hello'}), {key: 'motd', applied: 'next-start'});
  assert.deepEqual(await h.call('changeServerSetting', {serverId: server.serverId, key: 'server-port', value: 25570}), {key: 'server-port', applied: 'next-start'});
  assert.deepEqual(await h.call('changeServerSetting', {serverId: server.serverId, key: 'online-mode', value: false}), {key: 'online-mode', applied: 'next-start'});
  const values = (await h.call('serverSettings', {serverId: server.serverId})).values;
  assert.deepEqual([values.motd, values['server-port'], values['online-mode']], ['Hello', '25570', 'false']);
  for (const [key, value] of [['enable-rcon', true], ['rcon.password', 'x'], ['difficulty', 'brutal'], ['motd', 'a\nrcon.port=1'], ['max-players', '20']]) await assert.rejects(h.call('changeServerSetting', {serverId: server.serverId, key, value}), /not editable|Invalid server setting/, key);
  await h.call('acceptServerLicense', {serverId: server.serverId});
  await h.call('startServer', {serverId: server.serverId});
  assert.equal((await h.call('changeServerSetting', {serverId: server.serverId, key: 'pvp', value: false})).applied, 'after-restart');
  const container = await created(h, {target: 'local-container', flavor: 'paper', version: '1.21.4'});
  await assert.rejects(h.call('changeServerSetting', {serverId: container.serverId, key: 'server-port', value: 25580}), /fixed when the container is created/);
});

test('plugins: a Modrinth file is installed only when its SHA-512 matches; a mismatch installs nothing', async () => {
  const h = await harness();
  const server = await created(h, {target: 'local-process', flavor: 'paper', version: '1.21.4'});
  assert.deepEqual((await h.call('searchExtensions', {serverId: server.serverId, query: 'worldedit'})).results.map(item => item.project), ['worldedit']);
  const plugins = path.join(h.dataDirectory, 'server-manager', 'managed', 'servers', server.serverId, 'data', 'plugins');
  const installed = await h.call('installExtension', {serverId: server.serverId, source: 'modrinth', project: 'worldedit'});
  assert.deepEqual([installed.installed, installed.upstreamVerified, installed.directory, installed.sha256], [true, true, 'plugins', sha('sha256', PLUGIN)]);
  assert.deepEqual(await fs.readFile(path.join(plugins, 'worldedit-7.3.0.jar')), PLUGIN);
  assert.deepEqual((await h.call('listExtensions', {serverId: server.serverId})).extensions.map(item => [item.fileName, item.source, item.upstreamVerified]), [['worldedit-7.3.0.jar', 'modrinth', true]]);
  assert.deepEqual(await fs.readdir(path.join(h.dataDirectory, 'server-manager', 'managed', 'staging')), [], 'staging is cleaned up');
  const tampered = await harness({fetchRoutes: routes({[CDN]: Buffer.concat([PLUGIN, Buffer.from('x')])})});
  const other = await created(tampered, {target: 'local-process', flavor: 'paper', version: '1.21.4'});
  await assert.rejects(tampered.call('installExtension', {serverId: other.serverId, source: 'modrinth', project: 'worldedit'}), /size bound|integrity mismatch/);
  await assert.rejects(fs.stat(path.join(tampered.dataDirectory, 'server-manager', 'managed', 'servers', other.serverId, 'data', 'plugins', 'worldedit-7.3.0.jar')), /ENOENT/);
  assert.deepEqual((await tampered.call('listExtensions', {serverId: other.serverId})).extensions, []);
  await assert.rejects(h.call('installExtension', {serverId: server.serverId, source: 'modrinth', project: '../x'}), /Invalid extension request/);
  await assert.rejects(h.call('installExtension', {serverId: server.serverId, source: 'url', project: 'worldedit'}), /Invalid extension request/);
  await h.call('acceptServerLicense', {serverId: server.serverId}); await h.call('startServer', {serverId: server.serverId});
  await assert.rejects(h.call('installExtension', {serverId: server.serverId, source: 'modrinth', project: 'worldedit'}), /Stop the server/);
});

test('plugins: a locally chosen jar is installed with its recorded digest and honestly marked unverified upstream; vanilla has no plugins', async () => {
  const jar = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-local-')), 'my plugin.jar');
  await fs.writeFile(jar, PLUGIN);
  const h = await harness({extensionFile: jar});
  const paper = await created(h, {target: 'local-process', flavor: 'paper', version: '1.21.4'});
  const installed = await h.call('installExtension', {serverId: paper.serverId, source: 'file'});
  assert.deepEqual([installed.installed, installed.fileName, installed.upstreamVerified], [true, 'my_plugin.jar', false]);
  assert.equal((await fs.readFile(path.join(h.dataDirectory, 'server-manager', 'managed', 'servers', paper.serverId, 'data', 'plugins', 'my_plugin.jar'))).length, PLUGIN.length);
  const cancelled = await harness({extensionFile: null});
  const target = await created(cancelled, {target: 'local-process', flavor: 'paper', version: '1.21.4'});
  assert.deepEqual(await cancelled.call('installExtension', {serverId: target.serverId, source: 'file'}), {installed: false});
  const vanilla = await created(h, {target: 'local-container', flavor: 'vanilla', version: '1.21.4'});
  await assert.rejects(h.call('installExtension', {serverId: vanilla.serverId, source: 'file'}), /no plugin or mod directory/);
});

test('state survives a restart of the service and an interrupted preparation is marked failed, never resumed silently', async () => {
  const h = await harness();
  const server = await created(h, {target: 'local-process', flavor: 'paper', version: '1.21.4'});
  await h.call('acceptServerLicense', {serverId: server.serverId});
  const file = path.join(h.dataDirectory, 'server-manager', 'managed', 'records.json');
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(saved.servers[0].licenseAccepted, true);
  saved.servers[0].state = 'preparing'; await fs.writeFile(file, JSON.stringify(saved));
  const again = createServerTargetsService({dataDirectory: h.dataDirectory, deps: {execFile: h.execFile, spawn: h.spawn}, fetchImpl: h.fetchImpl, portProbe: async () => true});
  const [reloaded] = (await again.dispatch('targets')).servers;
  assert.deepEqual([reloaded.serverId, reloaded.state, /interrupted/.test(reloaded.error)], [server.serverId, 'failed', true]);
  await assert.rejects(again.dispatch('startServer', {serverId: 'managed-00000000-0000-4000-8000-000000000000'}), /owned managed server/);
  await assert.rejects(again.dispatch('startServer', {serverId: '../etc'}), /Invalid server identity/);
  await assert.rejects(again.dispatch('bogus', {}), /Unsupported managed server action/);
  await again.close();
  await assert.rejects(again.dispatch('targets', {}), /closing/);
});

test('flavor versions are listed through the injected fetch and an operation can only run once per server', async () => {
  const h = await harness();
  await assert.rejects(h.call('flavorVersions', {flavor: 'bukkit'}), /Unsupported/);
  const server = await created(h, {target: 'local-process', flavor: 'paper', version: '1.21.4'});
  await h.call('acceptServerLicense', {serverId: server.serverId});
  const first = h.call('startServer', {serverId: server.serverId});
  await assert.rejects(h.call('stopServer', {serverId: server.serverId}), /already active/);
  await first;
});
