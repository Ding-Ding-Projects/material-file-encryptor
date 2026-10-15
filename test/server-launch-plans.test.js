import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dockerRunArgs, dockerLogsArgs, dockerStopArgs, dockerInspectArgs, dockerPullArgs, installerArgs, javaServerArgs, remote, remoteDockerRunArgs,
  shellQuote, sshArgs, sshBaseArgs, validHost, validUser, containerName, remoteRoot, CONTAINER_IMAGES,
} from '../src/features/server-manager/launch-plans.js';

const ID = 'managed-0d3f5b2a-1111-4222-8333-444455556666';
const base = {id: ID, flavor: 'paper', version: '1.21.4', port: 25565, memoryMb: 2048, licenseAccepted: true, hostData: 'C:\\Users\\Me\\servers\\data', javaMajor: 21};

test('docker run is an argument array that publishes on loopback only and mounts data explicitly', () => {
  const args = dockerRunArgs({...base, mode: 'itzg'});
  assert.ok(Array.isArray(args) && args.every(item => typeof item === 'string'));
  assert.deepEqual(args.slice(0, 6), ['run', '--detach', '--name', containerName(ID), '--label', 'mfe.managed=true']);
  assert.ok(args.includes('127.0.0.1:25565:25565'), 'never published on all interfaces');
  assert.ok(args.includes('type=bind,source=C:\\Users\\Me\\servers\\data,target=/data'));
  assert.deepEqual(args.slice(-7), ['--env', 'TYPE=PAPER', '--env', 'VERSION=1.21.4', '--env', 'MEMORY=2048M', CONTAINER_IMAGES.server]);
  assert.ok(!args.includes('--privileged') && !args.some(item => /^--(network|pid|cap-add|device|volume|user)/.test(item)), 'no privilege or host namespace is requested');
});

test('the mounted-jar container mode mounts the verified jar read-only and refuses installer flavors', () => {
  const args = dockerRunArgs({...base, mode: 'jar', hostJar: 'C:\\Users\\Me\\servers\\server.jar'});
  assert.ok(args.includes('type=bind,source=C:\\Users\\Me\\servers\\server.jar,target=/srv/server.jar,readonly'));
  assert.ok(args.includes('--read-only') && args.includes('eclipse-temurin:21-jre'));
  assert.deepEqual(args.slice(-3), ['-jar', '/srv/server.jar', 'nogui']);
  assert.throws(() => dockerRunArgs({...base, flavor: 'forge', mode: 'jar', hostJar: '/x/server.jar'}), /Invalid server command input/);
  assert.throws(() => dockerRunArgs({...base, mode: 'jar'}), /Invalid server command input/, 'the jar path is required');
  assert.throws(() => dockerRunArgs({...base, mode: 'privileged'}), /Invalid server command input/);
});

test('the license gate: no container plan exists before explicit acceptance', () => {
  for (const licenseAccepted of [false, undefined, 'true', 1]) assert.throws(() => dockerRunArgs({...base, mode: 'itzg', licenseAccepted}), /license acceptance is required/);
});

test('docker plans refuse every injection attempt instead of escaping it', () => {
  const evil = ['x; rm -rf /', '$(id)', '`id`', '1.21 && id', '../..', '', 'a b', '--privileged', 'a\nb'];
  for (const version of evil) assert.throws(() => dockerRunArgs({...base, mode: 'itzg', version}), /Invalid server command input/, JSON.stringify(version));
  for (const hostData of ['/a,target=/etc', '-v/x', 'C:\\a,source=b', '', 'a\u0000b', '/a:b']) assert.throws(() => dockerRunArgs({...base, mode: 'itzg', hostData}), /Invalid server command input/, JSON.stringify(hostData));
  for (const flavor of ['paper;id', '__proto__', 'Paper']) assert.throws(() => dockerRunArgs({...base, mode: 'itzg', flavor}), /Invalid server command input/);
  for (const port of [80, 70000, 2.5, '25565', NaN]) assert.throws(() => dockerRunArgs({...base, mode: 'itzg', port}), /Invalid server command input/);
  assert.throws(() => dockerRunArgs({...base, mode: 'itzg', id: 'managed-x; id'}), /Invalid server command input/);
  assert.throws(() => dockerPullArgs('evil/image:latest'), /Invalid server command input/);
  assert.throws(() => dockerLogsArgs(ID, 100000), /Invalid server command input/);
  assert.deepEqual(dockerLogsArgs(ID, 50), ['logs', '--tail', '50', containerName(ID)]);
  assert.deepEqual(dockerStopArgs(ID), ['stop', '--time', '30', containerName(ID)]);
  assert.deepEqual(dockerInspectArgs(ID).slice(0, 2), ['inspect', '--format']);
});

test('java launch arguments carry an ownership marker and refuse unsafe jar or argument file names', () => {
  assert.deepEqual(javaServerArgs({id: ID, memoryMb: 1024}), ['-Dmfe.server=' + ID, '-Xmx1024M', '-jar', 'server.jar', 'nogui']);
  assert.deepEqual(javaServerArgs({id: ID, memoryMb: 1024, argsFile: 'libraries/net/neoforged/neoforge/21.1.172/unix_args.txt'}).slice(-3), ['@user_jvm_args.txt', '@libraries/net/neoforged/neoforge/21.1.172/unix_args.txt', 'nogui']);
  for (const jar of ['../server.jar', 'a b.jar', 'server.jar;id', '-jar', 'x']) assert.throws(() => javaServerArgs({id: ID, memoryMb: 1024, jar}), /Invalid server command input/, jar);
  assert.throws(() => javaServerArgs({id: ID, memoryMb: 1024, argsFile: 'libraries/../../etc/unix_args.txt'}), /Invalid server command input/);
  assert.throws(() => javaServerArgs({id: ID, memoryMb: 64}), /Invalid server command input/);
  assert.deepEqual(installerArgs('installer.jar'), ['-jar', 'installer.jar', '--installServer']);
});

test('ssh arguments keep host key checking on, never allow passwords, and refuse hostile endpoints', () => {
  const args = sshBaseArgs({host: 'play.example.org', port: 2222, user: 'mc', keyPath: 'C:\\Users\\Me\\.ssh\\id_ed25519'});
  const text = args.join(' ');
  assert.match(text, /StrictHostKeyChecking=yes/);
  assert.match(text, /BatchMode=yes/);
  assert.match(text, /PasswordAuthentication=no/);
  assert.ok(!/StrictHostKeyChecking=(no|accept-new)|UserKnownHostsFile=\/dev\/null/.test(text), 'host key checking is never weakened');
  assert.deepEqual(args.slice(-6), ['-p', '2222', '-l', 'mc', '--', 'play.example.org']);
  assert.ok(args.includes('-i') && args.includes('IdentitiesOnly=yes'));
  assert.ok(!sshBaseArgs({host: 'h.example', user: 'mc'}).includes('-i'), 'without a key file the ssh-agent is used');
  for (const host of ['-oProxyCommand=id', 'a b', 'a;id', 'a$(id)', '', 'a'.repeat(300), "a'b"]) assert.throws(() => sshBaseArgs({host, user: 'mc'}), /Invalid server command input/, host);
  for (const user of ['root;id', 'Mc', '-l', '', 'a b', '$(id)']) assert.throws(() => sshBaseArgs({host: 'h.example', user}), /Invalid server command input/, user);
  assert.throws(() => sshBaseArgs({host: 'h.example', user: 'mc', port: 70000}), /Invalid server command input/);
  assert.throws(() => sshBaseArgs({host: 'h.example', user: 'mc', keyPath: '-oProxyCommand=id'}), /Invalid server command input/);
  assert.deepEqual([validHost('2001:db8::1'), validHost('203.0.113.9'), validHost('-x'), validUser('mc_1')], [true, true, false, true]);
  assert.throws(() => sshArgs({host: 'h.example', user: 'mc'}, ''), /Invalid server command input/);
});

test('remote command strings are built only from validated, single-quoted substitutions', () => {
  assert.equal(shellQuote("it's"), "'it'\\''s'");
  assert.throws(() => shellQuote('a\nb'), /Invalid server command input/);
  assert.equal(remoteRoot(ID), 'mfe-servers/' + ID);
  assert.throws(() => remoteRoot('../etc'), /Invalid server command input/);
  assert.throws(() => remote.upload(ID, '../x.jar'), /Invalid server command input/);
  assert.throws(() => remote.upload(ID, 'a b.jar'), /Invalid server command input/);
  assert.throws(() => remote.uploadTo(ID, 'etc', 'x.jar'), /Invalid server command input/);
  assert.throws(() => remote.logs(ID, 0), /Invalid server command input/);
  assert.throws(() => remote.digest(ID, '../../etc/passwd'), /Invalid server command input/);
  const start = remote.start(ID, javaServerArgs({id: ID, memoryMb: 1024}));
  assert.match(start, /^cd 'mfe-servers\/managed-[^']+\/data' && setsid nohup java '-Dmfe\.server=managed-/);
  assert.ok(start.includes("'-jar' 'server.jar' 'nogui'"));
  assert.match(remote.status(ID), /grep -qF -- '-Dmfe\.server=managed-/, 'status and stop prove the pid belongs to this server before acting');
  assert.match(remote.stop(ID), /kill -TERM/);
  const run = remote.dockerRun(ID, remoteDockerRunArgs({id: ID, flavor: 'fabric', version: '1.21.4', port: 25565, memoryMb: 2048, licenseAccepted: true}));
  assert.match(run, /^mkdir -p 'mfe-servers\/managed-[^']+\/data' && cd 'mfe-servers\/managed-[^']+' && docker 'run'/);
  assert.ok(run.includes('"type=bind,source=$PWD/data,target=/data"'), 'the remote bind source is the remote server directory, never a local path');
  assert.ok(!run.includes('/mfe-remote-data'));
  assert.throws(() => remoteDockerRunArgs({id: ID, flavor: 'fabric', version: '1.21.4', port: 25565, memoryMb: 2048, licenseAccepted: false}), /license acceptance is required/);
});
