/** Pure command builders for the four server targets.
 *
 * Nothing in this module runs anything. Every plan is an argument array for `execFile` / `spawn` with `shell: false`.
 * The only place a shell ever sees text is the single remote command string that `ssh` hands to the remote login shell; it is
 * built here from fixed templates, and every substituted value has already been matched against a strict allow list and is
 * then POSIX single-quoted as defence in depth. Anything outside the allow lists is refused, never escaped. */
const refuse = () => { throw Error('Invalid server command input.'); };

export const SERVER_ID = /^managed-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HOST = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const IPV6 = /^[A-Fa-f0-9:]{2,45}$/;
const USER = /^[a-z_][a-z0-9_-]{0,31}$/;
const REMOTE_NAME = /^[A-Za-z0-9._+-]{1,128}$/;
const FLAVOR_TYPE = Object.freeze({vanilla: 'VANILLA', paper: 'PAPER', purpur: 'PURPUR', fabric: 'FABRIC', forge: 'FORGE', neoforge: 'NEOFORGE'});
export const CONTAINER_IMAGES = Object.freeze({server: 'itzg/minecraft-server:latest', java8: 'eclipse-temurin:8-jre', java16: 'eclipse-temurin:17-jre', java17: 'eclipse-temurin:17-jre', java21: 'eclipse-temurin:21-jre'});
const SAFE_MEMORY = /^[0-9]{3,5}$/;

export const validServerId = value => typeof value === 'string' && SERVER_ID.test(value);
export const validHost = value => typeof value === 'string' && !value.startsWith('-') && (HOST.test(value) || IPV6.test(value) && value.includes(':'));
export const validUser = value => typeof value === 'string' && USER.test(value);
export const validRemoteName = value => typeof value === 'string' && REMOTE_NAME.test(value) && !value.startsWith('.') && !value.includes('..');
export const validPort = value => Number.isSafeInteger(value) && value >= 1024 && value <= 65535;
export const validMemoryMb = value => Number.isSafeInteger(value) && value >= 512 && value <= 32768;

/** POSIX single quoting. Values reaching this are already allow listed; the quoting only protects against a future widening. */
export function shellQuote(value) {
  if (typeof value !== 'string' || /[\u0000\r\n]/.test(value)) refuse();
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

/** Directory layout, relative to the server root (local) or to the SSH login directory (remote). */
export const remoteRoot = id => { if (!validServerId(id)) refuse(); return 'mfe-servers/' + id; };

function memory(memoryMb) { if (!validMemoryMb(memoryMb)) refuse(); return memoryMb + 'M'; }
function markerFor(id) { if (!validServerId(id)) refuse(); return '-Dmfe.server=' + id; }

/** Java arguments that start a prepared server. Forge and NeoForge launch through the argument file their installer writes. */
export function javaServerArgs({id, memoryMb, jar = 'server.jar', argsFile = null}) {
  const head = [markerFor(id), '-Xmx' + memory(memoryMb)];
  if (argsFile !== null) {
    if (!/^libraries\/[A-Za-z0-9._\/+-]{1,200}\/(?:unix|win)_args\.txt$/.test(argsFile) || argsFile.includes('..')) refuse();
    return [...head, '@user_jvm_args.txt', '@' + argsFile, 'nogui'];
  }
  if (jar !== '/srv/server.jar' && (!validRemoteName(jar) || !jar.endsWith('.jar'))) refuse();
  return [...head, '-jar', jar, 'nogui'];
}
export const installerArgs = jar => { if (!validRemoteName(jar) || !jar.endsWith('.jar')) refuse(); return ['-jar', jar, '--installServer']; };

/** Java major required to run a flavor release, mapped to an official runtime image tag. */
export function javaImage(major) {
  const key = 'java' + major;
  if (!Object.hasOwn(CONTAINER_IMAGES, key)) refuse();
  return CONTAINER_IMAGES[key];
}

export const containerName = id => 'mfe-' + id.replace(/^managed-/, '');

/** `docker run` for either the official itzg image (it downloads and installs the flavor itself, so the desktop's digest checks
 * do not apply; the plan says so) or an eclipse-temurin runtime with the already verified jar mounted read-only.
 * The port is published on the loopback interface only. The license variable is added only after explicit acceptance. */
export function dockerRunArgs({id, flavor, version, port, memoryMb, mode, licenseAccepted, hostData, hostJar = null, javaMajor}) {
  if (!validServerId(id) || !Object.hasOwn(FLAVOR_TYPE, flavor) || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/.test(version) || !validPort(port) || !validMemoryMb(memoryMb)) refuse();
  if (licenseAccepted !== true) throw Error('Exact server license acceptance is required.');
  if (typeof hostData !== 'string' || hostData.length === 0 || hostData.length > 400 || /[\u0000-\u001f,:]/.test(hostData.replace(/^[A-Za-z]:[\\/]/, '')) || hostData.startsWith('-')) refuse();
  const args = ['run', '--detach', '--name', containerName(id), '--label', 'mfe.managed=true', '--label', 'mfe.server=' + id, '--publish', '127.0.0.1:' + port + ':25565', '--mount', 'type=bind,source=' + hostData + ',target=/data'];
  if (mode === 'itzg') return [...args, '--env', 'EULA=TRUE', '--env', 'TYPE=' + FLAVOR_TYPE[flavor], '--env', 'VERSION=' + version, '--env', 'MEMORY=' + memory(memoryMb), CONTAINER_IMAGES.server];
  if (mode !== 'jar' || ['forge', 'neoforge'].includes(flavor)) refuse();
  // The verified jar is mounted read-only; the data directory (eula.txt, world, properties) is the only writable mount.
  if (typeof hostJar !== 'string' || hostJar.length === 0 || hostJar.length > 400 || /[\u0000-\u001f,:]/.test(hostJar.replace(/^[A-Za-z]:[\\/]/, '')) || hostJar.startsWith('-')) refuse();
  return [...args, '--mount', 'type=bind,source=' + hostJar + ',target=/srv/server.jar,readonly', '--workdir', '/data', '--read-only', '--tmpfs', '/tmp', javaImage(javaMajor), 'java', ...javaServerArgs({id, memoryMb, jar: '/srv/server.jar'})];
}
export const dockerPullArgs = image => { if (!Object.values(CONTAINER_IMAGES).includes(image)) refuse(); return ['pull', image]; };
export const dockerInspectArgs = id => ['inspect', '--format', '{{.State.Status}}|{{index .Config.Labels "mfe.server"}}', containerName(id)];
export const dockerStopArgs = id => ['stop', '--time', '30', containerName(id)];
export const dockerStartArgs = id => ['start', containerName(id)];
export const dockerRemoveArgs = id => ['rm', containerName(id)];
export function dockerLogsArgs(id, lines) { if (!Number.isSafeInteger(lines) || lines < 1 || lines > 500) refuse(); return ['logs', '--tail', String(lines), containerName(id)]; }
export const dockerVersionArgs = () => ['version', '--format', '{{.Server.Version}}'];
export function dockerExecStopArgs(id) { return ['exec', containerName(id), 'rcon-cli', 'stop']; }

/** Validated SSH endpoint -> argument prefix. Host key checking stays on (`yes`): an unknown host is refused, never trusted. */
export function sshBaseArgs({host, port = 22, user, keyPath = null}) {
  if (!validHost(host) || !validUser(user) || !Number.isSafeInteger(port) || port < 1 || port > 65535) refuse();
  const args = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '-o', 'PasswordAuthentication=no', '-o', 'KbdInteractiveAuthentication=no'];
  if (keyPath !== null) {
    if (typeof keyPath !== 'string' || keyPath.length === 0 || keyPath.length > 400 || /[\u0000-\u001f]/.test(keyPath) || keyPath.startsWith('-')) refuse();
    args.push('-o', 'IdentitiesOnly=yes', '-i', keyPath);
  }
  args.push('-p', String(port), '-l', user, '--', host);
  return args;
}
export function sshArgs(endpoint, remoteCommand) {
  if (typeof remoteCommand !== 'string' || remoteCommand.length === 0 || remoteCommand.length > 4000 || /[\u0000]/.test(remoteCommand)) refuse();
  return [...sshBaseArgs(endpoint), remoteCommand];
}

/** Remote command templates. Each is one string for the remote login shell and uses only validated, quoted substitutions. */
export const remote = Object.freeze({
  probe: () => 'echo mfe-ok',
  prepare: id => { const root = shellQuote(remoteRoot(id)); return 'mkdir -p ' + root + '/data && cd ' + root + '/data && test -f eula.txt || printf ' + shellQuote('eula=false\\n') + ' > eula.txt'; },
  upload: (id, name) => { if (!validRemoteName(name)) refuse(); return 'cd ' + shellQuote(remoteRoot(id) + '/data') + ' && tee -- ' + shellQuote(name + '.part') + ' > /dev/null && mv ' + shellQuote(name + '.part') + ' ' + shellQuote(name); },
  uploadTo: (id, directory, name) => { if (!['plugins', 'mods'].includes(directory) || !validRemoteName(name)) refuse(); return 'cd ' + shellQuote(remoteRoot(id) + '/data') + ' && mkdir -p ' + directory + ' && tee -- ' + shellQuote(directory + '/' + name + '.part') + ' > /dev/null && mv ' + shellQuote(directory + '/' + name + '.part') + ' ' + shellQuote(directory + '/' + name); },
  digest: (id, relative) => { if (!/^(?:plugins\/|mods\/)?[A-Za-z0-9._+-]{1,128}$/.test(relative) || relative.includes('..')) refuse(); return 'cd ' + shellQuote(remoteRoot(id) + '/data') + ' && sha256sum -- ' + shellQuote(relative); },
  install: (id, args) => 'cd ' + shellQuote(remoteRoot(id) + '/data') + ' && java ' + args.map(shellQuote).join(' ') + ' > install.log 2>&1',
  readFile: (id, name) => { if (!validRemoteName(name)) refuse(); return 'cd ' + shellQuote(remoteRoot(id) + '/data') + ' && head -c 1048576 -- ' + shellQuote(name); },
  writeFile: (id, name) => { if (!validRemoteName(name)) refuse(); return 'cd ' + shellQuote(remoteRoot(id) + '/data') + ' && tee -- ' + shellQuote(name + '.part') + ' > /dev/null && mv ' + shellQuote(name + '.part') + ' ' + shellQuote(name); },
  findArgsFile: id => 'cd ' + shellQuote(remoteRoot(id) + '/data') + ' && find libraries -name unix_args.txt -print -quit 2>/dev/null',
  javaVersion: () => 'java -version 2>&1',
  /** Starts detached and records the pid of java itself (nohup execs java, so `$!` is its pid). The -Dmfe.server marker lets
   * stop and status prove a pid belongs to this server before acting on it. */
  start: (id, javaArgs) => { const root = shellQuote(remoteRoot(id) + '/data'); return 'cd ' + root + ' || exit 1; nohup java ' + javaArgs.map(shellQuote).join(' ') + ' > console.log 2>&1 < /dev/null & echo $! > ../server.pid; sleep 1; head -n 1 ../server.pid'; },
  status: id => 'pid=$(head -n 1 ' + shellQuote(remoteRoot(id) + '/server.pid') + ' 2>/dev/null); if [ -n "$pid" ] && ps -o args= -p "$pid" 2>/dev/null | grep -qF -- ' + shellQuote(markerFor(id)) + '; then echo running; else echo stopped; fi',
  stop: id => 'pid=$(head -n 1 ' + shellQuote(remoteRoot(id) + '/server.pid') + ' 2>/dev/null); if [ -n "$pid" ] && ps -o args= -p "$pid" 2>/dev/null | grep -qF -- ' + shellQuote(markerFor(id)) + '; then kill -TERM "$pid" && echo stopping; else echo stopped; fi',
  logs: (id, lines) => { if (!Number.isSafeInteger(lines) || lines < 1 || lines > 500) refuse(); return 'cd ' + shellQuote(remoteRoot(id) + '/data') + ' && tail -n ' + lines + ' -- logs/latest.log 2>/dev/null || tail -n ' + lines + ' -- console.log'; },
  docker: args => 'docker ' + args.map(shellQuote).join(' '),
  /** The container needs an absolute bind source, so the remote shell expands $PWD of the server directory. */
  dockerRun: (id, args) => {
    const index = args.findIndex(item => item.startsWith('type=bind,source=')); if (index < 0) refuse();
    const rest = args.map((item, i) => i === index ? null : shellQuote(item));
    rest[index] = '"type=bind,source=$PWD/data,target=/data"';
    return 'mkdir -p ' + shellQuote(remoteRoot(id) + '/data') + ' && cd ' + shellQuote(remoteRoot(id)) + ' && docker ' + rest.join(' ');
  },
});

/** The remote container plan uses a placeholder bind source that `remote.dockerRun` replaces with the remote `$PWD/data`; a
 * local host path is never sent to a remote host. Only the official image mode exists remotely. */
export function remoteDockerRunArgs(options) { return dockerRunArgs({...options, mode: 'itzg', hostData: '/mfe-remote-data'}); }
export const dockerTypeFor = flavor => { if (!Object.hasOwn(FLAVOR_TYPE, flavor)) refuse(); return FLAVOR_TYPE[flavor]; };
