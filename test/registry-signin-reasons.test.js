import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDockerImageTransport } from '../src/main/vault-image-docker.js';

// Synthetic, offline fixtures only. Nothing here executes Docker or reaches Docker Hub.
const KEY = 'https://index.docker.io/v1/';
const SECRET = 'synthetic-fixture-secret';
const json = (value, init) => new Response(JSON.stringify(value), init);
const jwt = claims => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;

async function install(t, { where = 'machine', config = { credsStore: 'desktop' }, writeConfig = true } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'registry-signin-reasons-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bin = where === 'machine' ? path.join(root, 'Docker', 'Docker', 'resources', 'bin')
    : where === 'user' ? path.join(root, 'Local', 'Programs', 'DockerDesktop', 'resources', 'bin') : null;
  if (bin) {
    await fs.mkdir(bin, { recursive: true });
    for (const name of ['docker.exe', 'docker-credential-desktop.exe', 'docker-credential-wincred.exe']) await fs.writeFile(path.join(bin, name), 'synthetic, never executed');
  }
  const configDirectory = path.join(root, 'config'); await fs.mkdir(configDirectory);
  if (writeConfig) await fs.writeFile(path.join(configDirectory, 'config.json'), JSON.stringify(config));
  return { root, bin, configDirectory };
}
function transport(f, { run, fetcher } = {}) {
  const calls = [];
  const defaults = async (executable, args) => {
    calls.push({ executable, args });
    if (path.basename(executable).startsWith('docker-credential-')) return args[0] === 'list' ? JSON.stringify({ [KEY]: 'fixture-user' }) : JSON.stringify({ Username: 'fixture-user', Secret: SECRET });
    if (args.includes('info')) return '27.0.0';
    throw Error('Unexpected synthetic command.');
  };
  return { calls, transport: createDockerImageTransport({ platform: 'win32', programFiles: f.root, localAppData: path.join(f.root, 'Local'), configDirectory: f.configDirectory,
    run: run ? (...args) => run(defaults, ...args) : defaults, fetcher: fetcher || (async () => json({ access_token: 'synthetic-token' })) }) };
}

test('P9: Docker Desktop installed for one user is found and used', async t => {
  const f = await install(t, { where: 'user' }); const { transport: docker, calls } = transport(f);
  const result = await docker.inspectRegistrySignIn();
  assert.deepEqual(result, { state: 'signed-in', reason: null, account: 'fixture-user' });
  assert.ok(calls.every(call => call.executable.startsWith(path.join(f.root, 'Local'))));
  const command = await docker.registryLoginCommand(); assert.ok(command.executable.includes('DockerDesktop'));
});
test('P9: each unavailable cause gets its own reason', async t => {
  const reasonOf = async (options, extra) => { const f = await install(t, options); return (await transport(f, extra).transport.inspectRegistrySignIn()); };
  assert.deepEqual(await reasonOf({ where: null }), { state: 'unavailable', reason: 'docker-not-installed' });
  assert.deepEqual(await reasonOf({ writeConfig: false }), { state: 'unavailable', reason: 'config-missing' });
  assert.deepEqual(await reasonOf({ config: {} }), { state: 'unavailable', reason: 'credential-store-missing' });
  assert.deepEqual(await reasonOf({ config: { credsStore: 'custom' } }), { state: 'unavailable', reason: 'credential-store-unsupported' });
  assert.deepEqual(await reasonOf({ config: { credsStore: 'desktop' } }, { run: async (fallback, executable, args) => { if (args[0] === 'list' || args.includes('info')) throw Error('down'); return fallback(executable, args); } }), { state: 'unavailable', reason: 'docker-not-running' });
  assert.deepEqual(await reasonOf({ config: { credsStore: 'desktop' } }, { run: async (fallback, executable, args) => { if (args[0] === 'list') throw Error('locked'); return fallback(executable, args); } }), { state: 'unavailable', reason: 'credential-store-unavailable' });
});
test('P9: a broken configuration file is reported as unreadable, not as a missing one', async t => {
  const f = await install(t); await fs.writeFile(path.join(f.configDirectory, 'config.json'), '{');
  assert.deepEqual(await transport(f).transport.inspectRegistrySignIn(), { state: 'unavailable', reason: 'config-unreadable' });
});
test('P10: an identity token is tried against Docker Hub and the account is read from its claims', async t => {
  const f = await install(t); const bodies = [];
  const { transport: docker } = transport(f, {
    run: async (fallback, executable, args) => path.basename(executable).startsWith('docker-credential-') && args[0] === 'get' ? JSON.stringify({ Username: '<token>', Secret: 'synthetic-identity-token' }) : fallback(executable, args),
    fetcher: async (url, settings) => { bodies.push(settings.body); return json({ access_token: jwt({ 'https://hub.docker.com': { username: 'yourname' } }) }); },
  });
  assert.deepEqual(await docker.inspectRegistrySignIn(), { state: 'signed-in', reason: null, account: 'yourname' });
  assert.equal(bodies.length, 1);
});
test('P10: a rejected identity token gives a precise reason instead of a generic stale state', async t => {
  const f = await install(t);
  const { transport: docker } = transport(f, {
    run: async (fallback, executable, args) => path.basename(executable).startsWith('docker-credential-') && args[0] === 'get' ? JSON.stringify({ Username: '<token>', Secret: 'synthetic-identity-token' }) : fallback(executable, args),
    fetcher: async () => json({}, { status: 401 }),
  });
  assert.deepEqual(await docker.inspectRegistrySignIn(), { state: 'stale', reason: 'identity-token-unsupported' });
});
test('P10: a rejected ordinary credential stays a plain stale sign-in', async t => {
  const f = await install(t); const { transport: docker } = transport(f, { fetcher: async () => json({}, { status: 401 }) });
  assert.deepEqual(await docker.inspectRegistrySignIn(), { state: 'stale', reason: 'stored-sign-in-unverified' });
});

function hub(options = {}) {
  const log = [];
  const metadata = { namespace: 'yourname', name: 'mfe-work-vault', is_private: false, permissions: { write: true }, ...options.metadata };
  let created = false;
  const fetcher = async (url, settings) => {
    url = String(url); log.push({ url, method: settings.method, body: settings.body });
    if (url.endsWith('/v2/auth/token')) return json({ access_token: 'synthetic-token' });
    if (settings.method === 'POST') return options.create ? options.create() : (created = true, json({ name: metadata.name }, { status: 201 }));
    if (options.missing && !created) return json({}, { status: 404 });
    return json(metadata);
  };
  return { log, fetcher };
}
test('P7: a missing repository is created as public and then verified', async t => {
  const f = await install(t); const { log, fetcher } = hub({ missing: true });
  const result = await transport(f, { fetcher }).transport.ensurePublicRepository('yourname/mfe-work-vault');
  assert.deepEqual(result, { repository: 'yourname/mfe-work-vault', created: true, visibility: 'public' });
  const post = log.find(entry => entry.method === 'POST' && !entry.url.endsWith('/v2/auth/token'));
  assert.ok(post.url.endsWith('/v2/namespaces/yourname/repositories'));
  const body = JSON.parse(post.body); assert.equal(body.is_private, false); assert.equal(body.name, 'mfe-work-vault'); assert.equal(body.namespace, 'yourname');
  assert.equal(log.at(-1).method, 'GET', 'creation is followed by a verifying read');
});
test('P7: an existing public repository is reused without creating anything', async t => {
  const f = await install(t); const { log, fetcher } = hub();
  const result = await transport(f, { fetcher }).transport.ensurePublicRepository('yourname/mfe-work-vault');
  assert.equal(result.created, false); assert.equal(log.some(entry => entry.method === 'POST' && !entry.url.endsWith('/v2/auth/token')), false);
});
test('P7: a private repository is never silently made public and says so precisely', async t => {
  const f = await install(t); const { fetcher } = hub({ metadata: { is_private: true } });
  await assert.rejects(transport(f, { fetcher }).transport.ensurePublicRepository('yourname/mfe-work-vault'), error => error.code === 'REPOSITORY_PRIVATE' && /already exists as a private repository/.test(error.message));
});
test('P7: a refused creation names the repository and the next step', async t => {
  const f = await install(t); const { fetcher } = hub({ missing: true, create: () => json({}, { status: 403 }) });
  await assert.rejects(transport(f, { fetcher }).transport.ensurePublicRepository('other-team/mfe-work-vault'), error => error.code === 'REPOSITORY_CREATE_DENIED' && error.message.includes('other-team/mfe-work-vault') && !error.message.includes(SECRET));
});
test('P7: a read-only repository is refused because uploads need write permission', async t => {
  const f = await install(t); const { fetcher } = hub({ metadata: { permissions: { write: false } } });
  await assert.rejects(transport(f, { fetcher }).transport.ensurePublicRepository('yourname/mfe-work-vault'), error => error.code === 'REPOSITORY_NOT_WRITABLE');
});
test('P7: uploading to a missing public destination reports that it does not exist instead of a generic error', async t => {
  const f = await install(t); const { fetcher } = hub({ missing: true });
  await assert.rejects(transport(f, { fetcher }).transport.registryAuthorization('yourname/mfe-work-vault'), error => error.code === 'REPOSITORY_NOT_FOUND' && /does not exist/.test(error.message));
});
