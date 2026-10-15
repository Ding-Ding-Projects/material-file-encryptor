import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {execFile as nodeExecFile, spawn as nodeSpawn} from 'node:child_process';
import {promisify} from 'node:util';
import {sha256OfFile} from './bounded-http.js';
import {requiredJavaMajor} from './flavors.js';
import {
  containerName, dockerInspectArgs, dockerLogsArgs, dockerPullArgs, dockerRunArgs, dockerStartArgs, dockerStopArgs, dockerVersionArgs,
  installerArgs, javaImage, javaServerArgs, remote, remoteDockerRunArgs, remoteRoot, sshArgs, validRemoteName, validServerId, CONTAINER_IMAGES,
} from './launch-plans.js';

/** The four execution targets. Every external process goes through `deps.execFile` / `deps.spawn`, which default to the real
 * child-process functions with `shell: false` and are replaced by fakes in tests. No driver builds a shell string except the
 * fixed, validated remote command templates in launch-plans.js, and none accepts a password: SSH runs with BatchMode, so a key
 * file or ssh-agent is the only way in and an unknown host key is a refusal. */
export const MAX_OUTPUT = 256 * 1024;
const TIMEOUT = {probe: 10000, command: 60000, pull: 15 * 60 * 1000, install: 20 * 60 * 1000, stop: 45000};

export function defaultDeps() {
  const exec = promisify(nodeExecFile);
  return {
    execFile: (file, args, options = {}) => exec(file, args, {shell: false, windowsHide: true, maxBuffer: MAX_OUTPUT, encoding: 'utf8', ...options}),
    spawn: (file, args, options = {}) => nodeSpawn(file, args, {shell: false, windowsHide: true, ...options}),
  };
}

const redact = message => String(message ?? '').replace(/[A-Za-z]:\\[^\s'"]+|\/(?:home|Users|root|tmp)\/[^\s'"]+/g, '<path>').slice(0, 300);
export function failure(prefix, error) {
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') return Object.assign(Error('Canceled.'), {code: 'canceled'});
  return Error(prefix + (error?.stderr || error?.message ? ': ' + redact(String(error.stderr || error.message).trim().split(/\r?\n/).at(-1)) : '.'));
}
function parseJavaMajor(output) {
  const match = /version "(\d+)(?:\.(\d+))?/.exec(String(output));
  if (!match) return null;
  return match[1] === '1' ? Number(match[2]) : Number(match[1]);
}

async function pipeFile(deps, file, args, {signal}) {
  const child = deps.spawn(args[0], args.slice(1), {stdio: ['pipe', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr?.on?.('data', chunk => { if (stderr.length < 4096) stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(Error(redact(stderr.trim().split(/\r?\n/).at(-1) || 'Remote upload failed.'))));
  });
  const onAbort = () => child.kill?.();
  signal?.addEventListener('abort', onAbort, {once: true});
  try {
    signal?.throwIfAborted();
    const source = fsSync.createReadStream(file);
    source.pipe(child.stdin);
    child.stdin.on?.('error', () => {});
    await done;
  } finally { signal?.removeEventListener('abort', onAbort); }
}

/* ---------------------------------------------------------------- local process */
function localProcessDriver(deps, {dataRoot}) {
  const children = new Map();
  const dataOf = record => path.join(dataRoot, 'servers', record.id, 'data');
  const bounded = (list, line) => { list.push(line.slice(0, 400)); if (list.length > 500) list.shift(); };
  async function javaProbe(signal) {
    try { const {stdout, stderr} = await deps.execFile('java', ['-version'], {timeout: TIMEOUT.probe, signal}); const major = parseJavaMajor(stderr || stdout); return major ? {available: true, major} : {available: false, reason: 'Java could not be identified.'}; }
    catch { return {available: false, reason: 'Java was not found on this computer.'}; }
  }
  async function findArgsFile(record) {
    const wanted = process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt';
    const walk = async (directory, depth) => {
      if (depth > 8) return null;
      for (const entry of await fs.readdir(directory, {withFileTypes: true}).catch(() => [])) {
        const full = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isFile() && entry.name === wanted) return path.relative(dataOf(record), full).split(path.sep).join('/');
        if (entry.isDirectory()) { const found = await walk(full, depth + 1); if (found) return found; }
      }
      return null;
    };
    return walk(path.join(dataOf(record), 'libraries'), 0);
  }
  return {
    id: 'local-process',
    async availability(signal) { const java = await javaProbe(signal); return {available: java.available, reason: java.available ? 'Java ' + java.major + ' found on this computer.' : java.reason}; },
    async prepare(record, {artifactFile, distribution, signal, port}) {
      const data = dataOf(record);
      await fs.mkdir(data, {recursive: true});
      await fs.writeFile(path.join(data, 'eula.txt'), 'eula=false\n', {flag: 'wx'}).catch(error => { if (error.code !== 'EEXIST') throw error; });
      await fs.writeFile(path.join(data, 'server.properties'), 'server-ip=127.0.0.1\nserver-port=' + port + '\n', {flag: 'wx'}).catch(error => { if (error.code !== 'EEXIST') throw error; });
      if (distribution.artifact === 'installer') {
        const java = await javaProbe(signal);
        if (!java.available) throw Error(java.reason);
        await fs.copyFile(artifactFile, path.join(data, 'installer.jar'));
        try { await deps.execFile('java', installerArgs('installer.jar'), {cwd: data, timeout: TIMEOUT.install, signal}); } catch (error) { throw failure('The documented installer did not complete', error); }
        const argsFile = await findArgsFile(record);
        if (!argsFile) throw Error('The installer did not write a launch argument file.');
        return {argsFile, jarSha256: await sha256OfFile(artifactFile)};
      }
      await fs.copyFile(artifactFile, path.join(data, 'server.jar'));
      return {argsFile: null, jarSha256: await sha256OfFile(path.join(data, 'server.jar'))};
    },
    async readText(record, name) { return fs.readFile(path.join(dataOf(record), name), 'utf8'); },
    async writeText(record, name, text) { const file = path.join(dataOf(record), name), temporary = file + '.part'; await fs.writeFile(temporary, text); await fs.rename(temporary, file); },
    async putFile(record, directory, name, localFile) { const target = path.join(dataOf(record), directory); await fs.mkdir(target, {recursive: true}); const temporary = path.join(target, name + '.part'); await fs.copyFile(localFile, temporary); await fs.rename(temporary, path.join(target, name)); },
    async start(record, {signal}) {
      const live = children.get(record.id);
      if (live && live.child.exitCode === null) throw Error('This server is already running.');
      const java = await javaProbe(signal);
      if (!java.available) throw Error(java.reason);
      const need = requiredJavaMajor(record.version);
      if (java.major < need) throw Error('Java ' + need + ' or newer is required; Java ' + java.major + ' was found.');
      signal?.throwIfAborted();
      const args = javaServerArgs({id: record.id, memoryMb: record.memoryMb, ...(record.argsFile ? {argsFile: record.argsFile} : {})});
      const child = deps.spawn('java', args, {cwd: dataOf(record), stdio: ['pipe', 'pipe', 'pipe']});
      const entry = {child, lines: [], exited: null};
      entry.exited = new Promise(resolve => { child.once('exit', (code, exitSignal) => { entry.exit = {code, signal: exitSignal}; resolve(); }); child.once('error', error => { entry.error = redact(error.message); resolve(); }); });
      for (const stream of [child.stdout, child.stderr]) { let rest = ''; stream?.on?.('data', chunk => { rest += chunk; const parts = rest.split(/\r?\n/); rest = parts.pop(); parts.forEach(line => bounded(entry.lines, line)); }); }
      children.set(record.id, entry);
      return {state: 'running'};
    },
    async status(record) {
      const entry = children.get(record.id);
      if (!entry) return {state: ['running', 'starting', 'stopping'].includes(record.state) ? 'stopped' : record.state};
      return {state: entry.child.exitCode === null && !entry.exit && !entry.error ? 'running' : 'stopped'};
    },
    async stop(record, {signal}) {
      const entry = children.get(record.id);
      if (!entry || entry.child.exitCode !== null || entry.exit) return {state: 'stopped'};
      await new Promise((resolve, reject) => entry.child.stdin.write('stop\n', error => error ? reject(error) : resolve()));
      let timer;
      const stopped = await Promise.race([entry.exited.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), TIMEOUT.stop); signal?.addEventListener('abort', () => resolve(false), {once: true}); })]);
      clearTimeout(timer);
      if (!stopped) throw Error('The server did not stop within the bound; no forced termination was attempted.');
      return {state: 'stopped'};
    },
    async logs(record, lines) {
      const entry = children.get(record.id);
      if (entry?.lines.length) return entry.lines.slice(-lines);
      const text = await fs.readFile(path.join(dataOf(record), 'logs', 'latest.log'), 'utf8').catch(() => '');
      return text.split(/\r?\n/).filter(Boolean).slice(-lines).map(line => line.slice(0, 400));
    },
    async close() { await Promise.allSettled([...children.values()].filter(entry => entry.child.exitCode === null && !entry.exit).map(async entry => { entry.child.stdin.write('stop\n'); await Promise.race([entry.exited, new Promise(resolve => setTimeout(resolve, TIMEOUT.stop))]); })); },
  };
}

/* ---------------------------------------------------------------- local container */
function localContainerDriver(deps, {dataRoot}) {
  const rootOf = record => path.join(dataRoot, 'servers', record.id);
  const dataOf = record => path.join(rootOf(record), 'data');
  const docker = (args, options = {}) => deps.execFile('docker', args, {timeout: TIMEOUT.command, ...options});
  async function inspect(record, signal) {
    try { const {stdout} = await docker(dockerInspectArgs(record.id), {timeout: TIMEOUT.probe, signal}); const [state, label] = String(stdout).trim().split('|'); return {exists: true, state, owned: label === record.id}; }
    catch (error) { if (error?.name === 'AbortError') throw failure('', error); return {exists: false}; }
  }
  return {
    id: 'local-container',
    async availability(signal) {
      try { const {stdout} = await docker(dockerVersionArgs(), {timeout: TIMEOUT.probe, signal}); return {available: true, reason: 'Docker daemon ' + String(stdout).trim().slice(0, 20) + ' answered.'}; }
      catch { return {available: false, reason: 'The Docker daemon is not reachable.'}; }
    },
    async prepare(record, {artifactFile, signal}) {
      await fs.mkdir(dataOf(record), {recursive: true});
      await fs.writeFile(path.join(dataOf(record), 'eula.txt'), 'eula=false\n', {flag: 'wx'}).catch(error => { if (error.code !== 'EEXIST') throw error; });
      let jarSha256 = null;
      if (record.containerMode === 'jar') { await fs.copyFile(artifactFile, path.join(rootOf(record), 'server.jar')); jarSha256 = await sha256OfFile(path.join(rootOf(record), 'server.jar')); }
      try { await docker(dockerPullArgs(record.containerMode === 'jar' ? javaImage(requiredJavaMajor(record.version)) : CONTAINER_IMAGES.server), {timeout: TIMEOUT.pull, signal}); } catch (error) { throw failure('The image could not be pulled', error); }
      return {argsFile: null, jarSha256};
    },
    async readText(record, name) { return fs.readFile(path.join(dataOf(record), name), 'utf8'); },
    async writeText(record, name, text) { const file = path.join(dataOf(record), name), temporary = file + '.part'; await fs.writeFile(temporary, text); await fs.rename(temporary, file); },
    async putFile(record, directory, name, localFile) { const target = path.join(dataOf(record), directory); await fs.mkdir(target, {recursive: true}); const temporary = path.join(target, name + '.part'); await fs.copyFile(localFile, temporary); await fs.rename(temporary, path.join(target, name)); },
    async start(record, {signal}) {
      const found = await inspect(record, signal);
      if (found.exists && !found.owned) throw Error('A container with this name exists but is not owned by this server.');
      if (found.exists) { await docker(dockerStartArgs(record.id), {signal}).catch(error => { throw failure('The container did not start', error); }); return {state: 'running'}; }
      const args = dockerRunArgs({id: record.id, flavor: record.flavor, version: record.version, port: record.port, memoryMb: record.memoryMb, mode: record.containerMode, licenseAccepted: record.licenseAccepted, hostData: dataOf(record), hostJar: record.containerMode === 'jar' ? path.join(rootOf(record), 'server.jar') : null, javaMajor: requiredJavaMajor(record.version)});
      await docker(args, {signal}).catch(error => { throw failure('The container did not start', error); });
      return {state: 'running'};
    },
    async status(record, {signal} = {}) {
      const found = await inspect(record, signal);
      if (!found.exists) return {state: ['running', 'starting', 'stopping'].includes(record.state) ? 'stopped' : record.state};
      if (!found.owned) return {state: 'failed', note: 'ownership-unverified'};
      return {state: found.state === 'running' ? 'running' : found.state === 'restarting' || found.state === 'created' ? 'starting' : 'stopped'};
    },
    async stop(record, {signal}) {
      const found = await inspect(record, signal);
      if (!found.exists) return {state: 'stopped'};
      if (!found.owned) throw Error('The container is not owned by this server.');
      await docker(dockerStopArgs(record.id), {timeout: TIMEOUT.stop + 15000, signal}).catch(error => { throw failure('The container did not stop', error); });
      return {state: 'stopped'};
    },
    async logs(record, lines, {signal} = {}) {
      const {stdout, stderr} = await docker(dockerLogsArgs(record.id, lines), {signal}).catch(error => { throw failure('Logs are unavailable', error); });
      return String(stdout + stderr).split(/\r?\n/).filter(Boolean).slice(-lines).map(line => line.slice(0, 400));
    },
    async close() {},
  };
}

/* ---------------------------------------------------------------- SSH helpers */
function sshRunner(deps, endpointOf) {
  return {
    run: (record, command, options = {}) => deps.execFile('ssh', sshArgs(endpointOf(record), command), {timeout: TIMEOUT.command, ...options}),
    upload: (record, command, file, signal) => pipeFile(deps, file, ['ssh', ...sshArgs(endpointOf(record), command)], {signal}),
  };
}
async function sshAvailability(runner, record, signal) {
  try { const {stdout} = await runner.run(record, remote.probe(), {timeout: TIMEOUT.probe, signal}); return String(stdout).trim() === 'mfe-ok' ? {available: true, reason: 'SSH host answered with the known host key.'} : {available: false, reason: 'SSH host did not answer as expected.'}; }
  catch { return {available: false, reason: 'SSH is unavailable or the host key is not already trusted. Connect once with ssh to accept it.'}; }
}
async function sshUploadVerified(runner, record, command, digestPath, file, signal) {
  await runner.upload(record, command, file, signal);
  const {stdout} = await runner.run(record, remote.digest(record.id, digestPath), {signal});
  if (String(stdout).trim().split(/\s+/)[0] !== await sha256OfFile(file)) throw Error('The uploaded file did not match its verified digest.');
}
function remoteStatus(runner) {
  return async (record, {signal} = {}) => {
    const {stdout} = await runner.run(record, remote.status(record.id), {timeout: TIMEOUT.probe, signal}).catch(error => { throw failure('Remote status is unavailable', error); });
    return {state: String(stdout).trim() === 'running' ? 'running' : ['running', 'starting', 'stopping'].includes(record.state) ? 'stopped' : record.state};
  };
}
function remoteFileOps(runner) {
  return {
    async readText(record, name) { const {stdout} = await runner.run(record, remote.readFile(record.id, name)); return String(stdout); },
    async writeText(record, name, text) {
      const temp = path.join(await fs.mkdtemp(path.join((await import('node:os')).tmpdir(), 'mfe-')), name);
      try { await fs.writeFile(temp, text); await runner.upload(record, remote.writeFile(record.id, name), temp); } finally { await fs.rm(path.dirname(temp), {recursive: true, force: true}); }
    },
    async putFile(record, directory, name, localFile) {
      if (!validRemoteName(name)) throw Error('Invalid remote file name.');
      await sshUploadVerified(runner, record, remote.uploadTo(record.id, directory, name), directory + '/' + name, localFile);
    },
  };
}

/* ---------------------------------------------------------------- SSH process */
function sshProcessDriver(deps, {endpointOf}) {
  const runner = sshRunner(deps, endpointOf), ops = remoteFileOps(runner);
  return {
    id: 'ssh-process', ...ops,
    availability: (signal, record) => record ? sshAvailability(runner, record, signal) : Promise.resolve({available: true, reason: 'Needs a host, user and key or ssh-agent.'}),
    async prepare(record, {artifactFile, distribution, signal, port}) {
      await runner.run(record, remote.prepare(record.id), {signal});
      const jarName = distribution.artifact === 'installer' ? 'installer.jar' : 'server.jar';
      await sshUploadVerified(runner, record, remote.upload(record.id, jarName), jarName, artifactFile, signal);
      let argsFile = null;
      if (distribution.artifact === 'installer') {
        try { await runner.run(record, remote.install(record.id, installerArgs('installer.jar')), {timeout: TIMEOUT.install, signal}); } catch (error) { throw failure('The documented installer did not complete', error); }
        const {stdout} = await runner.run(record, remote.findArgsFile(record.id), {signal});
        argsFile = String(stdout).trim().split(/\r?\n/)[0] || null;
        if (!argsFile) throw Error('The installer did not write a launch argument file.');
      }
      await ops.writeText(record, 'server.properties', 'server-port=' + port + '\n');
      return {argsFile, jarSha256: await sha256OfFile(artifactFile)};
    },
    async start(record, {signal}) {
      const {stdout, stderr} = await runner.run(record, remote.javaVersion(), {signal, timeout: TIMEOUT.probe}).catch(error => { throw failure('Java could not be checked on the host', error); });
      const major = parseJavaMajor(stderr || stdout), need = requiredJavaMajor(record.version);
      if (!major) throw Error('Java was not found on the host.');
      if (major < need) throw Error('Java ' + need + ' or newer is required on the host; Java ' + major + ' was found.');
      const {stdout: pid} = await runner.run(record, remote.start(record.id, javaServerArgs({id: record.id, memoryMb: record.memoryMb, ...(record.argsFile ? {argsFile: record.argsFile} : {})})), {signal}).catch(error => { throw failure('The remote server did not start', error); });
      if (!/^\d{1,9}$/.test(String(pid).trim())) throw Error('The remote server did not report a process id.');
      return {state: 'running'};
    },
    status: remoteStatus(runner),
    async stop(record, {signal}) { await runner.run(record, remote.stop(record.id), {signal, timeout: TIMEOUT.stop}).catch(error => { throw failure('The remote server did not stop', error); }); return {state: 'stopping'}; },
    async logs(record, lines, {signal} = {}) { const {stdout} = await runner.run(record, remote.logs(record.id, lines), {signal}).catch(error => { throw failure('Logs are unavailable', error); }); return String(stdout).split(/\r?\n/).filter(Boolean).slice(-lines).map(line => line.slice(0, 400)); },
    async close() {},
  };
}

/* ---------------------------------------------------------------- SSH container */
function sshContainerDriver(deps, {endpointOf}) {
  const runner = sshRunner(deps, endpointOf), ops = remoteFileOps(runner);
  const dockerCommand = args => remote.docker(args);
  async function inspect(record, signal) {
    try { const {stdout} = await runner.run(record, dockerCommand(dockerInspectArgs(record.id)), {timeout: TIMEOUT.probe, signal}); const [state, label] = String(stdout).trim().split('|'); return {exists: true, state, owned: label === record.id}; }
    catch { return {exists: false}; }
  }
  return {
    id: 'ssh-container', ...ops,
    async availability(signal, record) {
      if (!record) return {available: true, reason: 'Needs a host, user and key or ssh-agent, and Docker on the host.'};
      const ssh = await sshAvailability(runner, record, signal);
      if (!ssh.available) return ssh;
      try { await runner.run(record, dockerCommand(dockerVersionArgs()), {timeout: TIMEOUT.probe, signal}); return {available: true, reason: 'SSH host and its Docker daemon answered.'}; }
      catch { return {available: false, reason: 'The Docker daemon on the SSH host is not reachable.'}; }
    },
    async prepare(record, {signal}) {
      await runner.run(record, remote.prepare(record.id), {signal});
      try { await runner.run(record, dockerCommand(dockerPullArgs(CONTAINER_IMAGES.server)), {timeout: TIMEOUT.pull, signal}); } catch (error) { throw failure('The image could not be pulled on the host', error); }
      return {argsFile: null, jarSha256: null};
    },
    async start(record, {signal}) {
      const found = await inspect(record, signal);
      if (found.exists && !found.owned) throw Error('A container with this name exists but is not owned by this server.');
      if (found.exists) { await runner.run(record, dockerCommand(dockerStartArgs(record.id)), {signal}).catch(error => { throw failure('The container did not start', error); }); return {state: 'running'}; }
      const args = remoteDockerRunArgs({id: record.id, flavor: record.flavor, version: record.version, port: record.port, memoryMb: record.memoryMb, licenseAccepted: record.licenseAccepted});
      await runner.run(record, remote.dockerRun(record.id, args), {signal}).catch(error => { throw failure('The container did not start', error); });
      return {state: 'running'};
    },
    async status(record, {signal} = {}) {
      const found = await inspect(record, signal);
      if (!found.exists) return {state: ['running', 'starting', 'stopping'].includes(record.state) ? 'stopped' : record.state};
      if (!found.owned) return {state: 'failed', note: 'ownership-unverified'};
      return {state: found.state === 'running' ? 'running' : found.state === 'restarting' || found.state === 'created' ? 'starting' : 'stopped'};
    },
    async stop(record, {signal}) {
      const found = await inspect(record, signal);
      if (!found.exists) return {state: 'stopped'};
      if (!found.owned) throw Error('The container is not owned by this server.');
      await runner.run(record, dockerCommand(dockerStopArgs(record.id)), {signal, timeout: TIMEOUT.stop + 15000}).catch(error => { throw failure('The container did not stop', error); });
      return {state: 'stopped'};
    },
    async logs(record, lines, {signal} = {}) { const {stdout, stderr} = await runner.run(record, dockerCommand(dockerLogsArgs(record.id, lines)), {signal}).catch(error => { throw failure('Logs are unavailable', error); }); return String(stdout + stderr).split(/\r?\n/).filter(Boolean).slice(-lines).map(line => line.slice(0, 400)); },
    async close() {},
  };
}

export function createTargetDrivers({deps = defaultDeps(), dataRoot, endpointOf}) {
  if (typeof dataRoot !== 'string' || typeof endpointOf !== 'function') throw Error('Invalid target driver configuration.');
  return {
    'local-process': localProcessDriver(deps, {dataRoot}),
    'local-container': localContainerDriver(deps, {dataRoot}),
    'ssh-process': sshProcessDriver(deps, {endpointOf}),
    'ssh-container': sshContainerDriver(deps, {endpointOf}),
  };
}
export {validServerId, containerName, remoteRoot};
