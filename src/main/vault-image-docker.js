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
const HUB_ERROR = 'Docker Hub could not verify the existing private repository. Sign in with Docker Desktop and check repository permissions.';
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
async function hubJson(fetcher, pathname, options, signal) {
  checkCancellation(signal);
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
  let reader;
  try {
    const response = await fetcher(HUB + pathname, { ...options, redirect: 'error', cache: 'no-store', signal: requestSignal, headers: { Accept: 'application/json', ...options.headers } });
    checkCancellation(signal);
    if (!response.ok || Number(response.headers.get('content-length') || 0) > 262144) throw Error();
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
  } catch { checkCancellation(signal); throw Error(HUB_ERROR); }
  finally { if (reader) await reader.cancel().catch(() => {}); }
}
export function createDockerImageTransport({ platform = process.platform, programFiles = process.env.ProgramFiles || 'C:\\Program Files', configDirectory = path.join(os.homedir(), '.docker'), run = runDockerCommand, fetcher = fetch, buildContext = createVaultImageBuildContext } = {}) {
  const executable = path.join(programFiles, 'Docker', 'Docker', 'resources', 'bin', 'docker.exe');
  const configArgs = ['--config', configDirectory];
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(DOCKER_|BUILDX_)/i.test(key) || /^(PATH|PATHEXT)$/i.test(key)) delete env[key];
  // Disable buildx and do not let Docker resolve credential helpers from an arbitrary PATH.
  env.DOCKER_BUILDKIT = '0'; env.PATHEXT = '.EXE';
  env.PATH = path.dirname(executable);
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  if (localAbsolute(systemRoot)) env.PATH += path.delimiter + path.join(systemRoot, 'System32');
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
    await installedFile(executable);
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
  async function credential(signal) {
    checkCancellation(signal);
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
    if (entry?.identitytoken || typeof auth !== 'string' || auth.length > 16384 || !/^[A-Za-z0-9+/]+={0,2}$/.test(auth)) throw Error('Sign in using Docker Desktop before uploading.');
    const decoded = Buffer.from(auth, 'base64');
    try {
      const separator = decoded.indexOf(58);
      if (decoded.toString('base64') !== auth || separator < 1 || separator > 256 || separator === decoded.length - 1) throw Error('Docker Hub sign-in is invalid.');
      return { identifier: decoded.subarray(0, separator).toString(), secret: decoded.subarray(separator + 1).toString() };
    } finally { decoded.fill(0); }
  }
  async function privateRepository(target, signal) {
    const credentials = await credential(signal); let authentication;
    const request = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) };
    try { authentication = await hubJson(fetcher, '/v2/auth/token', request, signal); }
    finally { credentials.secret = ''; request.body = ''; }
    if (typeof authentication.access_token !== 'string' || !authentication.access_token || authentication.access_token.length > 16384 || /[\s\x00-\x1f\x7f]/.test(authentication.access_token)) throw Error('Docker Hub authentication could not be verified.');
    try {
      const metadata = await hubJson(fetcher, `/v2/namespaces/${target.namespace}/repositories/${target.name}`, { method: 'GET', headers: { Authorization: `Bearer ${authentication.access_token}` } }, signal);
      if (metadata.is_private !== true || metadata.namespace !== target.namespace || metadata.name !== target.name || metadata.permissions?.write !== true)
        throw Error('Upload requires an existing private Docker Hub repository with write permission. Public or unverified repositories are refused.');
    } finally { authentication.access_token = ''; }
  }
  async function tagId(target, context, signal) {
    return command(executable, [...context.args, 'image', 'inspect', '--format', '{{.Id}}', target.reference], {}, signal);
  }
  return {
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
