import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createVaultImageBuildContext } from './vault-image-context.js';

const HUB = 'https://hub.docker.com';
const REGISTRY_KEY = 'https://index.docker.io/v1/';
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const LOCAL_HOSTS = new Set(['npipe:////./pipe/docker_engine', 'npipe:////./pipe/dockerDesktopLinuxEngine']);
const DOCKER_ERROR = 'Docker could not complete the requested action. Check Docker Desktop before retrying; an upload may already have started.';
const HUB_ERROR = 'Docker Hub could not verify the repository or its expected visibility. Sign in with Docker Desktop and check repository permissions.';
const BUILD_ERROR = 'The local image build outcome could not be verified. Docker may retain a local image. Prepare a fresh image before uploading.';
const RECEIPT_ERROR = 'The upload outcome could not be verified. Do not retry blindly; inspect Docker Hub.';
export function localDockerPath(filename, platform = process.platform) {
  if (typeof filename !== 'string') return false;
  if (platform === 'win32') return /^[A-Za-z]:[\\/]/.test(filename) && path.win32.isAbsolute(filename);
  return path.isAbsolute(filename);
}
const localAbsolute = localDockerPath;
const samePath = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;

function checkCancellation(signal) {
  // Do not expose an arbitrary AbortSignal.reason, which may contain private data.
  if (signal?.aborted) throw Error('The Docker image action was cancelled. If an upload started, check Docker Hub before retrying.');
}
export function imageTarget(value) {
  if (typeof value !== 'string' || value.length > 220 || /[\r\n]/.test(value) || !/^[a-z0-9][a-z0-9_-]{1,38}\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(value))
    throw Error('Enter a Docker Hub target as namespace/repository:tag.');
  const [repository, tag] = value.split(':'); const [namespace, name] = repository.split('/');
  return Object.freeze({ reference: `docker.io/${value}`, repository, namespace, name, tag });
}
function checkedTarget(target) {
  const checked = imageTarget(`${target?.repository}:${target?.tag}`);
  if (['reference', 'namespace', 'name'].some(key => checked[key] !== target[key])) throw Error('The Docker Hub target changed. Prepare the image again.');
  return checked;
}
export function runDockerCommand(executable, args, { input, timeout = 120000, env, signal, execute = execFile } = {}) {
  return new Promise((resolve, reject) => {
    checkCancellation(signal);
    const abort = new AbortController();
    const combinedSignal = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
    let child, settled = false, inputFinished = false, processFinished = false, output;
    function fail() {
      if (settled) return;
      settled = true; abort.abort();
      try { child?.kill(); } catch { /* The owned child may already have exited. */ }
      reject(Error(DOCKER_ERROR));
    }
    function finish() {
      if (!settled && inputFinished && processFinished) { settled = true; resolve(output.trim()); }
    }
    try {
      child = execute(executable, args, { windowsHide: true, shell: false, cwd: path.dirname(executable), encoding: 'utf8', timeout, maxBuffer: 1024 * 1024, env, signal: combinedSignal }, (error, stdout) => {
        if (error || typeof stdout !== 'string') fail();
        else { output = stdout; processFinished = true; finish(); }
      });
      if (settled) { try { child?.kill(); } catch { /* Already exited. */ } return; }
      if (!child?.stdin) { fail(); return; }
      // Both helper strings and the bounded tar iterable use private stdin only.
      const iterable = typeof input === 'string' || Buffer.isBuffer(input) || input == null ? [input ?? ''] : input;
      pipeline(Readable.from(iterable, { objectMode: false }), child.stdin, { signal: combinedSignal })
        .then(() => { inputFinished = true; finish(); }, fail);
    } catch { fail(); }
  });
}
async function readJson(filename, limit = 65536) {
  let handle;
  try {
    if ((await fs.lstat(filename)).isSymbolicLink()) throw Error();
    handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const stat = await handle.stat(); if (!stat.isFile() || stat.size > limit) throw Error();
    const bytes = Buffer.alloc(limit + 1);
    try {
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
        if (!bytesRead) break; length += bytesRead;
      }
      if (length > limit) throw Error();
      const value = JSON.parse(bytes.subarray(0, length).toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
      return value;
    } finally { bytes.fill(0); }
  } catch { throw Error('Docker configuration is unavailable.'); }
  finally { await handle?.close(); }
}
async function hubJson(fetcher, pathname, options, signal, message = HUB_ERROR) {
  checkCancellation(signal);
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
  let reader;
  try {
    const response = await fetcher(HUB + pathname, { ...options, redirect: 'error', cache: 'no-store', signal: requestSignal, headers: { Accept: 'application/json', ...options.headers } });
    checkCancellation(signal);
    if (!response.ok) { const error = Error(message); error.code = [401, 403].includes(response.status) ? 'AUTHENTICATION_REQUIRED' : response.status === 404 ? 'NOT_FOUND' : 'PROVIDER_UNAVAILABLE'; error.status = response.status; throw error; }
    if (Number(response.headers.get('content-length') || 0) > 262144) throw Error();
    reader = response.body.getReader(); const chunks = []; let length = 0;
    for (;;) {
      checkCancellation(signal);
      const { done, value } = await reader.read();
      checkCancellation(signal);
      if (done) break;
      length += value.byteLength; if (length > 262144) throw Error(); chunks.push(value);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value;
  } catch (error) { checkCancellation(signal); if (error?.code === 'AUTHENTICATION_REQUIRED' || error?.code === 'NOT_FOUND') throw error; const unavailable = Error(message); unavailable.code = 'PROVIDER_UNAVAILABLE'; throw unavailable; }
  finally { if (reader) await reader.cancel().catch(() => {}); }
}
const HUB_READ_PATH = /^\/v2\/(?:repositories\/namespaces|namespaces\/[a-z0-9][a-z0-9_-]{1,38}\/repositories(?:\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*\/tags)?(?:\?page_size=\d{1,3}&page=\d{1,3})?)$/;
const IDENTITY_TOKEN_USER = '<token>';
const ACCOUNT_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/;
function reasonError(reason, message) { const error = Error(message); error.reason = reason; return error; }
/** The signed-in Docker Hub account name. Only a plain account name is ever surfaced. */
function accountFrom(credentials, accessToken) {
  if (credentials?.identifier && credentials.identifier !== IDENTITY_TOKEN_USER && ACCOUNT_NAME.test(credentials.identifier)) return credentials.identifier;
  try {
    const claims = JSON.parse(Buffer.from(String(accessToken).split('.')[1] || '', 'base64url').toString('utf8'));
    const name = claims?.['https://hub.docker.com']?.username ?? claims?.username;
    return typeof name === 'string' && ACCOUNT_NAME.test(name) ? name : null;
  } catch { return null; }
}
export function createDockerImageTransport({ platform = process.platform, programFiles = process.env.ProgramFiles || 'C:\\Program Files', localAppData = process.env.LOCALAPPDATA, configDirectory = path.join(os.homedir(), '.docker'), run = runDockerCommand, fetcher = fetch, buildContext = createVaultImageBuildContext } = {}) {
  // Docker Desktop installs for the whole machine or for a single account. The first real, unaliased install wins.
  const candidates = [path.join(programFiles, 'Docker', 'Docker', 'resources', 'bin', 'docker.exe')];
  if (typeof localAppData === 'string' && localAbsolute(localAppData)) candidates.push(path.join(localAppData, 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'), path.join(localAppData, 'Programs', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'));
  let executable = candidates[0];
  const configArgs = ['--config', configDirectory];
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(DOCKER_|BUILDX_)/i.test(key) || /^(PATH|PATHEXT)$/i.test(key)) delete env[key];
  // Disable buildx and do not let Docker resolve credential helpers from an arbitrary PATH.
  env.DOCKER_BUILDKIT = '0'; env.PATHEXT = '.EXE';
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  function useExecutable(filename) {
    executable = filename; env.PATH = path.dirname(executable);
    if (localAbsolute(systemRoot)) env.PATH += path.delimiter + path.join(systemRoot, 'System32');
  }
  useExecutable(executable);
  async function resolveExecutable() {
    for (const candidate of candidates) {
      try {
        if (!(await fs.lstat(candidate)).isFile()) continue;
        if (!samePath(path.resolve(candidate), await fs.realpath(candidate))) continue;
        if (candidate !== executable) useExecutable(candidate);
        return executable;
      } catch { /* Try the next supported install location. */ }
    }
    throw reasonError('docker-not-installed', 'The official Docker Desktop installation is unavailable.');
  }
  async function installedFile(filename) {
    try {
      if (!localAbsolute(filename) || !(await fs.lstat(filename)).isFile()) throw Error();
      const real = await fs.realpath(filename);
      if (!samePath(path.resolve(filename), real)) throw Error();
    } catch { throw Error('The official Docker Desktop installation is unavailable.'); }
  }
  async function command(binary, args, options, signal) {
    checkCancellation(signal);
    try {
      const result = await run(binary, args, { ...options, env, signal });
      checkCancellation(signal);
      if (typeof result !== 'string') throw Error();
      return result;
    } catch { checkCancellation(signal); throw Error(DOCKER_ERROR); }
  }
  async function localContext(signal) {
    checkCancellation(signal);
    if (platform !== 'win32') throw Error('Encrypted image export currently requires Docker Desktop on Windows in Linux-container mode.');
    if (!localAbsolute(configDirectory)) throw Error('Docker configuration must use an absolute local path.');
    await resolveExecutable();
    const name = await command(executable, [...configArgs, 'context', 'show'], {}, signal);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name)) throw Error('Docker context is invalid.');
    let contexts;
    const inspected = await command(executable, [...configArgs, 'context', 'inspect', '--', name], {}, signal);
    try { contexts = JSON.parse(inspected); } catch { throw Error('Docker context could not be inspected.'); }
    const host = contexts?.[0]?.Endpoints?.docker?.Host;
    if (!Array.isArray(contexts) || contexts.length !== 1 || !LOCAL_HOSTS.has(host)) throw Error('Use a local Docker Desktop context. Remote Docker daemons are not permitted for vault images.');
    // Pin the inspected endpoint itself: a context can be edited between CLI calls.
    const args = [...configArgs, '--host', host];
    const type = await command(executable, [...args, 'info', '--format', '{{.OSType}}'], {}, signal);
    if (type !== 'linux') throw Error('Switch Docker Desktop to Linux containers before building a data-only image.');
    return { name, host, args };
  }
  async function credential(signal, { allowIdentityToken = false } = {}) {
    checkCancellation(signal);
    await resolveExecutable();
    const config = await readJson(path.join(configDirectory, 'config.json'));
    checkCancellation(signal);
    const helper = config.credHelpers?.[REGISTRY_KEY] || config.credsStore;
    if (helper) {
      if (!['desktop', 'wincred'].includes(helper)) throw Error('Use an existing Docker Desktop or Windows credential-store sign-in.');
      const binary = path.join(path.dirname(executable), `docker-credential-${helper}.exe`); await installedFile(binary);
      const output = await command(binary, ['get'], { input: REGISTRY_KEY + '\n' }, signal);
      let result; try { result = JSON.parse(output); } catch { throw Error('Existing Docker Hub sign-in is unavailable. Sign in using Docker Desktop.'); }
      if (!result || typeof result.Username !== 'string' || typeof result.Secret !== 'string' || !result.Username || !result.Secret || result.Username.length > 256 || result.Secret.length > 16384)
        throw Error('Existing Docker Hub sign-in is unavailable.');
      return { identifier: result.Username, secret: result.Secret };
    }
    const entry = config.auths?.[REGISTRY_KEY]; const auth = entry?.auth;
    // A browser sign-in may store an identity token. Only the sign-in check tries it; Docker Hub decides.
    if (allowIdentityToken && typeof entry?.identitytoken === 'string' && entry.identitytoken && entry.identitytoken.length <= 16384 && typeof auth !== 'string')
      return { identifier: IDENTITY_TOKEN_USER, secret: entry.identitytoken };
    if (entry?.identitytoken || typeof auth !== 'string' || auth.length > 16384 || !/^[A-Za-z0-9+/]+={0,2}$/.test(auth)) throw Error('Sign in using Docker Desktop before uploading.');
    const decoded = Buffer.from(auth, 'base64');
    try {
      const separator = decoded.indexOf(58);
      if (decoded.toString('base64') !== auth || separator < 1 || separator > 256 || separator === decoded.length - 1) throw Error('Docker Hub sign-in is invalid.');
      return { identifier: decoded.subarray(0, separator).toString(), secret: decoded.subarray(separator + 1).toString() };
    } finally { decoded.fill(0); }
  }
  const validToken = token => typeof token === 'string' && token && token.length <= 16384 && !/[\s\x00-\x1f\x7f]/.test(token);
  /** Exchange the stored credentials for a short-lived Docker Hub API token. */
  async function hubToken(signal, options = {}) {
    const credentials = await credential(signal, options); let authentication;
    const request = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: credentials.identifier, secret: credentials.secret }) };
    try { authentication = await hubJson(fetcher, '/v2/auth/token', request, signal); }
    finally { request.body = ''; }
    const token = authentication.access_token; authentication.access_token = '';
    if (!validToken(token)) throw Error('Docker Hub authentication could not be verified.');
    return { token, credentials };
  }
  function repositoryMetadataPath(target) { return `/v2/namespaces/${target.namespace}/repositories/${target.name}`; }
  async function repositoryAccess(target, signal, visibility = 'public') {
    if (!['private', 'public'].includes(visibility)) throw Error('Invalid repository visibility.');
    const { token, credentials } = await hubToken(signal); credentials.secret = '';
    try {
      let metadata;
      try {
        metadata = await hubJson(fetcher, repositoryMetadataPath(target), { method: 'GET', headers: { Authorization: `Bearer ${token}` } }, signal,
          visibility === 'private' ? 'Docker Hub could not verify the existing private repository. Sign in with Docker Desktop and check repository permissions.' : HUB_ERROR);
      } catch (error) {
        if (error?.code === 'NOT_FOUND') { const missing = Error(visibility === 'private' ? `Upload requires an existing private repository, and ${target.repository} was not found on Docker Hub.` : `The Docker Hub repository ${target.repository} does not exist. Create it first, or let the backup flow create it as a public repository.`); missing.code = 'REPOSITORY_NOT_FOUND'; throw missing; }
        throw error;
      }
      if (metadata.is_private !== (visibility === 'private') || metadata.namespace !== target.namespace || metadata.name !== target.name || metadata.permissions?.write !== true)
        throw Error(visibility === 'private' ? 'Upload requires an existing private Docker Hub repository with write permission. Public or unverified repositories are refused.' : 'Upload requires an existing public Docker Hub repository with write permission. Private or unverified repositories are refused.');
    } finally { /* The short-lived token was a local value only. */ }
  }
  /** Create a missing PUBLIC repository with the signed-in credentials, then verify it. */
  async function ensurePublicRepository(repository, signal) {
    const target = imageTarget(`${repository}:authorization`);
    const { token, credentials } = await hubToken(signal); credentials.secret = '';
    const authorization = { Authorization: `Bearer ${token}` };
    const read = () => hubJson(fetcher, repositoryMetadataPath(target), { method: 'GET', headers: authorization }, signal, HUB_ERROR);
    let metadata, created = false;
    try { metadata = await read(); }
    catch (error) {
      if (error?.code !== 'NOT_FOUND') throw error;
      try {
        await hubJson(fetcher, `/v2/namespaces/${target.namespace}/repositories`, { method: 'POST', headers: { ...authorization, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: target.name, namespace: target.namespace, is_private: false, description: 'Encrypted vault backup (ciphertext only).' }) }, signal, HUB_ERROR);
      } catch (failure) {
        const denied = Error(failure?.code === 'AUTHENTICATION_REQUIRED' ? `Docker Hub does not allow this account to create ${target.repository}. Create the repository on Docker Hub as public, or use a namespace this account owns.` : `Docker Hub could not create ${target.repository}. Check the connection and try again.`);
        denied.code = failure?.code === 'AUTHENTICATION_REQUIRED' ? 'REPOSITORY_CREATE_DENIED' : 'PROVIDER_UNAVAILABLE'; throw denied;
      }
      created = true; metadata = await read();
    }
    if (metadata.namespace !== target.namespace || metadata.name !== target.name || metadata.permissions?.write !== true) { const error = Error('Docker Hub could not verify write permission for the repository.'); error.code = 'REPOSITORY_NOT_WRITABLE'; throw error; }
    if (metadata.is_private !== false) { const error = Error(`${target.repository} already exists as a private repository. Choose another repository name or make it public on Docker Hub.`); error.code = 'REPOSITORY_PRIVATE'; throw error; }
    return { repository: target.repository, created, visibility: 'public' };
  }
  const privateRepository = (target, signal) => repositoryAccess(target, signal, 'private');
  async function tagId(target, context, signal) {
    return command(executable, [...context.args, 'image', 'inspect', '--format', '{{.Id}}', target.reference], {}, signal);
  }
  async function loginContext(signal) {
    if (platform !== 'win32') throw reasonError('unsupported-platform', 'Registry sign-in requires Docker Desktop on Windows.');
    await resolveExecutable();
    let config;
    try { await fs.access(path.join(configDirectory, 'config.json')); }
    catch { throw reasonError('config-missing', 'Docker has no configuration yet. Start Docker Desktop once.'); }
    try { config = await readJson(path.join(configDirectory, 'config.json')); }
    catch { throw reasonError('config-unreadable', 'Docker configuration is unreadable.'); }
    const helper = config.credHelpers?.[REGISTRY_KEY] || config.credsStore;
    if (!helper) throw reasonError('credential-store-missing', 'Docker is not configured with a protected credential store.');
    if (!['desktop', 'wincred'].includes(helper)) throw reasonError('credential-store-unsupported', 'Use the Docker Desktop or Windows credential store for guided sign-in.');
    const binary = path.join(path.dirname(executable), `docker-credential-${helper}.exe`);
    try { await installedFile(binary); } catch { throw reasonError('credential-store-unavailable', 'The Docker credential helper is unavailable.'); }
    return { executable, configDirectory, env, helper: binary, config };
  }
  /** Distinguish a stopped Docker Desktop from a broken credential store with one bounded probe. */
  async function engineRunning(signal) {
    try { await command(executable, [...configArgs, 'info', '--format', '{{.ServerVersion}}'], { timeout: 15000 }, signal); return true; }
    catch (error) { if (signal?.aborted) throw error; return false; }
  }
  async function signInState(signal) {
    let context;
    try { context = await loginContext(signal); }
    catch (error) {
      if (signal?.aborted) throw error;
      return { state: 'unavailable', reason: error?.reason || 'protected-store-unavailable' };
    }
    let listed;
    try { listed = JSON.parse(await command(context.helper, ['list'], {}, signal)); }
    catch (error) {
      if (signal?.aborted) throw error;
      return { state: 'unavailable', reason: await engineRunning(signal) ? 'credential-store-unavailable' : 'docker-not-running' };
    }
    if (!listed || typeof listed !== 'object' || Array.isArray(listed)) return { state: 'unavailable', reason: 'credential-store-unavailable' };
    const stored = Object.keys(listed).some(key => key.startsWith(REGISTRY_KEY)) || Boolean(context.config.auths?.[REGISTRY_KEY]?.auth || context.config.auths?.[REGISTRY_KEY]?.identitytoken);
    if (!stored) return { state: 'missing', reason: null };
    let credentials, token;
    try {
      credentials = await credential(signal, { allowIdentityToken: true });
      ({ token } = await hubToken(signal, { allowIdentityToken: true }));
      return { state: 'signed-in', reason: null, account: accountFrom(credentials, token) };
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error?.code === 'AUTHENTICATION_REQUIRED') return { state: 'stale', reason: credentials?.identifier === IDENTITY_TOKEN_USER ? 'identity-token-unsupported' : 'stored-sign-in-unverified' };
      return { state: 'unavailable', reason: 'provider-unavailable' };
    } finally { if (credentials) credentials.secret = ''; token = ''; }
  }
  return {
    inspectRegistrySignIn: signInState,
    ensurePublicRepository,
    async registryLoginCommand(signal) {
      const context = await loginContext(signal);
      return { executable: context.executable, configDirectory: context.configDirectory, env: { ...context.env } };
    },
    /** Read-only Docker Hub API access for the repository catalogue. Only these fixed read paths are allowed. */
    async hubGet(pathname, signal) {
      if (typeof pathname !== 'string' || pathname.length > 300 || !HUB_READ_PATH.test(pathname)) throw Error('This Docker Hub request is not allowed.');
      const { token, credentials } = await hubToken(signal); credentials.secret = '';
      return hubJson(fetcher, pathname, { method: 'GET', headers: { Authorization: `Bearer ${token}` } }, signal);
    },
    /**
     * Removes one shared-file tag. Only share-<32 hex> tags in a material-file-encryptor-shares repository are
     * accepted, so this can never touch a drive backup. Docker Hub has served tag deletion at two paths; the
     * current one is tried first. A tag that is already gone counts as removed.
     */
    async deleteShareTag(repository, tag, signal) {
      const target = imageTarget(`${repository}:${tag}`);
      if (target.name !== 'material-file-encryptor-shares' || !/^share-[a-f0-9]{32}$/.test(target.tag)) throw Error('Only shared-file tags can be removed.');
      const { token, credentials } = await hubToken(signal); credentials.secret = '';
      const paths = [`/v2/namespaces/${target.namespace}/repositories/${target.name}/tags/${target.tag}`, `/v2/repositories/${target.namespace}/${target.name}/tags/${target.tag}/`];
      let missing = 0;
      for (const pathname of paths) {
        checkCancellation(signal);
        let response;
        try {
          response = await fetcher(HUB + pathname, { method: 'DELETE', redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
        } catch { checkCancellation(signal); const error = Error(HUB_ERROR); error.code = 'PROVIDER_UNAVAILABLE'; throw error; }
        await response.body?.cancel().catch(() => {});
        if (response.ok) return { removed: true };
        if ([401, 403].includes(response.status)) { const error = Error('Docker Hub did not allow this account to remove the shared file.'); error.code = 'AUTHENTICATION_REQUIRED'; throw error; }
        if ([404, 405].includes(response.status)) { missing++; continue; }
        const error = Error(HUB_ERROR); error.code = 'PROVIDER_UNAVAILABLE'; throw error;
      }
      return { removed: missing === paths.length, alreadyGone: true };
    },
    /** A pull-only registry token for any repository the account may read, public or private. No write permission is implied. */
    async registryPullAuthorization(repository, signal) {
      const target = imageTarget(`${repository}:pull`);
      const credentials = await credential(signal); let response;
      try {
        const url = new URL('https://auth.docker.io/token');
        url.searchParams.set('service', 'registry.docker.io'); url.searchParams.set('scope', `repository:${target.repository}:pull`);
        response = await fetcher(url, { redirect: 'error', cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
          headers: { Authorization: 'Basic ' + Buffer.from(`${credentials.identifier}:${credentials.secret}`).toString('base64') } });
        if (!response.ok) throw Error();
        const parsed = JSON.parse(await response.text());
        const token = parsed.token || parsed.access_token;
        if (!validToken(token)) throw Error();
        return { Authorization: `Bearer ${token}` };
      } catch { throw Error(HUB_ERROR); }
      finally { credentials.secret = ''; await response?.body?.cancel().catch(() => {}); }
    },
    async registryAuthorization(repository, signal, visibility = 'public', actions = 'pull,push') {
      const target = imageTarget(`${repository}:authorization`);
      if (!['pull,push', 'pull,push,delete'].includes(actions)) throw Error('Invalid registry permission.');
      await repositoryAccess(target, signal, visibility);
      const credentials = await credential(signal);
      let response;
      try {
        const authorization = 'Basic ' + Buffer.from(`${credentials.identifier}:${credentials.secret}`).toString('base64');
        const url = new URL('https://auth.docker.io/token');
        url.searchParams.set('service', 'registry.docker.io');
        url.searchParams.set('scope', `repository:${repository}:${actions}`);
        response = await fetcher(url, { redirect: 'error', cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000), headers: { Authorization: authorization } });
        if (!response.ok) throw Error();
        const reader = response.body.getReader(); let bytes = 0; const chunks = [];
        try { for (;;) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength; if (bytes > 65536) throw Error(); chunks.push(item.value); } }
        finally { await reader.cancel().catch(() => {}); }
        const parsed = JSON.parse(Buffer.concat(chunks));
        const token = parsed.token || parsed.access_token;
        if (typeof token !== 'string' || !token || token.length > 16384 || /[\s\x00-\x1f\x7f]/.test(token)) throw Error();
        return { Authorization: `Bearer ${token}` };
      } catch { throw Error(HUB_ERROR); }
      finally { credentials.secret = ''; await response?.body?.cancel().catch(() => {}); }
    },
    /** Delete permission is granted only for a shared-files repository, so a drive backup can never be deleted through it. */
    async registryDeleteAuthorization(repository, signal) {
      const target = imageTarget(`${repository}:authorization`);
      if (target.name !== 'material-file-encryptor-shares') throw Error('Only shared files can be removed.');
      return this.registryAuthorization(repository, signal, 'public', 'pull,push,delete');
    },
    async build(target, snapshot, signal) {
      target = checkedTarget(target);
      const context = await localContext(signal);
      // Abort validation/streaming too if the owned CLI fails before consuming its input.
      const buildAbort = new AbortController();
      const buildSignal = signal ? AbortSignal.any([signal, buildAbort.signal]) : buildAbort.signal;
      // The producer enumerates only validated snapshot objects, not a mutable directory.
      try {
        const input = buildContext(snapshot, { signal: buildSignal });
        const imageId = await command(executable, [...context.args, 'build', '--quiet', '--network=none', '--pull=false', '--no-cache', '--file', 'Dockerfile', '--tag', target.reference, '--', '-'], { input, timeout: 30 * 60 * 1000 }, buildSignal);
        if (!IMAGE_ID.test(imageId) || await tagId(target, context, buildSignal) !== imageId) throw Error();
        return Object.freeze({ imageId, context: context.name, host: context.host });
      } catch {
        buildAbort.abort();
        if (signal?.aborted) throw Error('The local image build was cancelled and its outcome is unverified. Docker may retain a local image. Prepare a fresh image before uploading.');
        throw Error(BUILD_ERROR);
      }
    },
    async push(target, expected, signal) {
      target = checkedTarget(target);
      if (!expected || !IMAGE_ID.test(expected.imageId) || !LOCAL_HOSTS.has(expected.host)) throw Error('Prepare and build the image again before uploading.');
      expected = { ...expected };
      const context = await localContext(signal);
      if (context.name !== expected.context || context.host !== expected.host) throw Error('Docker context changed. Prepare the image again.');
      if (await tagId(target, context, signal) !== expected.imageId) throw Error('The local image tag changed. Prepare the image again.');
      // This is a fresh read immediately before every explicitly requested upload.
      await privateRepository(target, signal);
      if (await tagId(target, context, signal) !== expected.imageId) throw Error('The local image tag changed. Prepare the image again.');
      const output = await command(executable, [...context.args, 'push', target.reference], { timeout: 30 * 60 * 1000 }, signal);
      if (await tagId(target, context, signal) !== expected.imageId) throw Error(RECEIPT_ERROR);
      const lastLine = output.split(/\r?\n/).filter(Boolean).at(-1);
      const receipt = lastLine?.match(/^([^\s:]+): digest: (sha256:[a-f0-9]{64}) size: [0-9]+$/);
      if (!receipt || receipt[1] !== target.tag) throw Error(RECEIPT_ERROR);
      // Inspect the immutable built image, not the mutable tag, to bind the receipt.
      const raw = await command(executable, [...context.args, 'image', 'inspect', '--format', '{{json .RepoDigests}}', expected.imageId], {}, signal);
      let digests; try { digests = JSON.parse(raw); } catch { throw Error(RECEIPT_ERROR); }
      const matches = [target.repository + '@' + receipt[2], 'docker.io/' + target.repository + '@' + receipt[2]];
      const digest = Array.isArray(digests) ? digests.find(value => matches.includes(value)) : null;
      if (!digest) throw Error(RECEIPT_ERROR);
      return { uploaded: true, digest, repository: target.repository, private: true };
    },
  };
}
