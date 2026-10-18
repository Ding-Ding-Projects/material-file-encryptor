import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { createDockerImageTransport, imageTarget, runDockerCommand } from '../src/main/vault-image-docker.js';

// All executables, credentials, responses and command results in this suite are synthetic.
// Never substitute the production run/fetch defaults: these tests are entirely offline.
const ID = 'sha256:' + 'a'.repeat(64);
const OTHER_ID = 'sha256:' + 'b'.repeat(64);
const DIGEST = 'sha256:' + 'c'.repeat(64);
const SECRET = 'synthetic-fixture-secret';
const TOKEN = 'synthetic-fixture-token';
const HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const TARGET = imageTarget('example-team/encrypted-vault:archive');
const CONFIG_KEY = 'https://index.docker.io/v1/';
const DOCKERFILE = 'FROM scratch\nCOPY vault/ /vault/\nCOPY manifest.json /manifest.json\n';
const json = (value, init) => new Response(JSON.stringify(value), init);

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-docker-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'Docker', 'Docker', 'resources', 'bin');
  const configDirectory = path.join(root, 'config'); const directory = path.join(root, 'context');
  await fs.mkdir(bin, { recursive: true }); await fs.mkdir(configDirectory); await fs.mkdir(directory);
  for (const filename of ['docker.exe', 'docker-credential-desktop.exe', 'docker-credential-wincred.exe']) await fs.writeFile(path.join(bin, filename), 'synthetic, never executed');
  await fs.writeFile(path.join(directory, 'Dockerfile'), DOCKERFILE);
  await fs.writeFile(path.join(configDirectory, 'config.json'), JSON.stringify(options.config ?? { credsStore: 'desktop' }));
  const events = [];
  const snapshot = { directory, manifest: { files: [] } };
  const buildContext = options.buildContext ?? ((actual, { signal }) => {
    assert.equal(actual, snapshot);
    events.push({ kind: 'context', snapshot: actual, signal });
    return (async function* () { yield Buffer.from('synthetic-tar-context'); })();
  });
  const state = { imageId: ID, context: 'desktop-linux', host: HOST, osType: 'linux', metadata: { is_private: true, namespace: TARGET.namespace, name: TARGET.name, permissions: { write: true } }, digests: [TARGET.repository + '@' + DIGEST] };
  const run = async (executable, args, settings) => {
    const event = { kind: 'command', executable, args, settings }; events.push(event);
    if (args.includes('build')) { event.inputChunks = []; for await (const chunk of settings.input) event.inputChunks.push(Buffer.from(chunk)); }
    const fallback = () => {
      if (path.basename(executable).startsWith('docker-credential-')) return JSON.stringify({ Username: 'fixture-user', Secret: SECRET });
      if (args.includes('context')) return args.includes('show') ? state.context : JSON.stringify([{ Endpoints: { docker: { Host: state.host } } }]);
      if (args.includes('info')) return state.osType;
      if (args.includes('build')) return ID;
      if (args.includes('push')) return `The push refers to repository [docker.io/${TARGET.repository}]\n${TARGET.tag}: digest: ${DIGEST} size: 1234`;
      if (args.includes('{{.Id}}')) return state.imageId;
      if (args.includes('{{json .RepoDigests}}')) return JSON.stringify(state.digests);
      throw Error('Unexpected synthetic command.');
    };
    return options.run ? options.run(event, state, fallback) : fallback();
  };
  const fetcher = async (url, settings) => {
    // Snapshot options because production clears its own in-memory request objects.
    const event = { kind: 'fetch', url, settings: { ...settings, headers: { ...settings.headers } } }; events.push(event);
    const fallback = () => url.endsWith('/v2/auth/token') ? json({ access_token: TOKEN }) : json(state.metadata);
    return options.fetcher ? options.fetcher(event, state, fallback) : fallback();
  };
  const transport = createDockerImageTransport({ platform: options.platform ?? 'win32', programFiles: root, configDirectory, run, fetcher, buildContext });
  const expected = { imageId: ID, context: state.context, host: state.host };
  return { transport, snapshot, directory, configDirectory, root, bin, state, events, expected };
}
const commands = fixture => fixture.events.filter(event => event.kind === 'command');
const pushes = fixture => commands(fixture).filter(event => event.args.includes('push'));
const fetches = fixture => fixture.events.filter(event => event.kind === 'fetch');

test('target accepts only a bounded explicit Docker Hub namespace, repository and tag', () => {
  assert.deepEqual(TARGET, { reference: 'docker.io/example-team/encrypted-vault:archive', repository: 'example-team/encrypted-vault', namespace: 'example-team', name: 'encrypted-vault', tag: 'archive' });
  assert.ok(Object.isFrozen(TARGET));
  assert.equal(imageTarget('example/repo__with--parts:Tag_1.2').name, 'repo__with--parts');
  for (const value of [null, 42, '', 'example/repo', 'https://docker.io/example/repo:tag', 'docker.io/example/repo:tag', 'example/repo@sha256:' + 'a'.repeat(64), '../repo:tag', 'example/repo:tag\n', 'EXAMPLE/repo:tag', 'example/Repo:tag', 'example/nested/repo:tag', 'example/repo:--arg', 'example/repo:' + 'x'.repeat(129), 'example/' + 'x'.repeat(210) + ':tag']) assert.throws(() => imageTarget(value), /namespace\/repository:tag/);
});

test('build pins local npipe, uses only the fixed data context and never reads credentials or calls Hub', async t => {
  const f = await fixture(t); await fs.rm(path.join(f.configDirectory, 'config.json'));
  const result = await f.transport.build(TARGET, f.snapshot);
  assert.deepEqual(result, f.expected); assert.ok(Object.isFrozen(result)); assert.equal(fetches(f).length, 0);
  assert.ok(commands(f).every(event => event.executable === path.join(f.bin, 'docker.exe')));
  const build = commands(f).find(event => event.args.includes('build'));
  assert.deepEqual(build.args, ['--config', f.configDirectory, '--host', HOST, 'build', '--quiet', '--network=none', '--pull=false', '--no-cache', '--file', 'Dockerfile', '--tag', TARGET.reference, '--', '-']);
  assert.equal(Buffer.concat(build.inputChunks).toString(), 'synthetic-tar-context');
  assert.equal(f.events.filter(event => event.kind === 'context').length, 1);
  assert.equal(build.settings.env.DOCKER_BUILDKIT, '0'); assert.equal(build.settings.env.PATHEXT, '.EXE');
  assert.ok(build.settings.env.PATH.startsWith(f.bin));
  assert.ok(commands(f).filter(event => event.args.includes('info') || event.args.includes('build') || event.args.includes('image')).every(event => event.args.includes('--host') && !event.args.includes('--context')));
});

test('successful push freshly verifies existing private write access and binds digest to immutable built ID', async t => {
  const f = await fixture(t); const controller = new AbortController();
  const result = await f.transport.push(TARGET, f.expected, controller.signal);
  assert.deepEqual(result, { uploaded: true, digest: TARGET.repository + '@' + DIGEST, repository: TARGET.repository, private: true });
  const requests = fetches(f);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://hub.docker.com/v2/auth/token');
  assert.equal(requests[0].settings.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].settings.body), { identifier: 'fixture-user', secret: SECRET });
  assert.equal(requests[1].url, 'https://hub.docker.com/v2/namespaces/example-team/repositories/encrypted-vault');
  assert.equal(requests[1].settings.headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(requests.every(event => event.settings.redirect === 'error' && event.settings.cache === 'no-store' && event.settings.signal instanceof AbortSignal));
  assert.ok(commands(f).every(event => event.settings.signal === controller.signal));
  const helper = commands(f).find(event => path.basename(event.executable).startsWith('docker-credential-'));
  assert.equal(helper.executable, path.join(f.bin, 'docker-credential-desktop.exe'));
  assert.deepEqual(helper.args, ['get']); assert.equal(helper.settings.input, CONFIG_KEY + '\n');
  assert.ok(commands(f).every(event => !event.args.join(' ').includes(SECRET) && !event.args.join(' ').includes(TOKEN) && !event.args.includes('login')));
  assert.ok(f.events.indexOf(requests[1]) < f.events.indexOf(pushes(f)[0]));
  assert.deepEqual(commands(f).at(-1).args.slice(-4), ['inspect', '--format', '{{json .RepoDigests}}', ID]);
  assert.equal(pushes(f).length, 1);
});

test('existing base64 sign-in is supported without creating or persisting any new credentials', async t => {
  const config = { auths: { [CONFIG_KEY]: { auth: Buffer.from('fixture-user:' + SECRET).toString('base64') } } };
  const f = await fixture(t, { config });
  const before = await fs.readFile(path.join(f.configDirectory, 'config.json'), 'utf8');
  await f.transport.push(TARGET, f.expected);
  assert.deepEqual(JSON.parse(fetches(f)[0].settings.body), { identifier: 'fixture-user', secret: SECRET });
  assert.equal(await fs.readFile(path.join(f.configDirectory, 'config.json'), 'utf8'), before);
  assert.deepEqual(await fs.readdir(f.configDirectory), ['config.json']);
  assert.ok(commands(f).every(event => !path.basename(event.executable).startsWith('docker-credential-')));
});

test('Docker environment overrides and arbitrary helper search paths cannot redirect commands', async t => {
  const original = new Map();
  for (const name of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CERT_PATH', 'DOCKER_TLS_VERIFY', 'DOCKER_API_VERSION', 'DOCKER_CONFIG', 'BUILDX_BUILDER', 'BUILDX_CONFIG']) { original.set(name, process.env[name]); process.env[name] = 'untrusted-test-value'; }
  t.after(() => { for (const [name, value] of original) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  const f = await fixture(t); await f.transport.build(TARGET, f.snapshot);
  for (const event of commands(f)) {
    for (const name of original.keys()) assert.equal(event.settings.env[name], undefined);
    assert.notEqual(event.settings.env.PATH, process.env.PATH);
  }
});

test('unsupported operating system and missing official executable fail before any command or Hub call', async t => {
  const unsupported = await fixture(t, { platform: 'linux' });
  await assert.rejects(unsupported.transport.build(TARGET, unsupported.snapshot), /Windows/);
  assert.equal(unsupported.events.length, 0);
  const missing = await fixture(t); await fs.rm(path.join(missing.bin, 'docker.exe'));
  await assert.rejects(missing.transport.build(TARGET, missing.snapshot), /official Docker Desktop/);
  assert.equal(missing.events.length, 0);
});

test('linked executable is refused rather than following it outside the installation', async t => {
  const f = await fixture(t); const executable = path.join(f.bin, 'docker.exe');
  await fs.rename(executable, path.join(f.root, 'replacement')); await fs.symlink(path.join(f.root, 'replacement'), executable);
  await assert.rejects(f.transport.build(TARGET, f.snapshot), /official Docker Desktop/);
  assert.equal(f.events.length, 0);
});

test('remote Docker endpoints and Windows containers are refused before build or credential reads', async t => {
  for (const host of ['tcp://127.0.0.1:2375', 'tcp://remote.example:2376', 'ssh://remote.example', 'unix:///var/run/docker.sock', 'npipe:////remote/pipe/docker_engine']) {
    const f = await fixture(t); f.state.host = host;
    await assert.rejects(f.transport.build(TARGET, f.snapshot), /Remote Docker daemons/);
    assert.equal(fetches(f).length, 0); assert.ok(commands(f).every(event => !event.args.includes('build') && !event.args.includes('info')));
  }
  const f = await fixture(t); f.state.osType = 'windows';
  await assert.rejects(f.transport.build(TARGET, f.snapshot), /Linux containers/);
  assert.ok(commands(f).every(event => !event.args.includes('build')));
});

test('invalid context output and malformed inspect metadata fail closed', async t => {
  for (const response of ['', 'malicious\ncontext', '-x']) {
    const f = await fixture(t); f.state.context = response;
    await assert.rejects(f.transport.build(TARGET, f.snapshot), /context is invalid/);
  }
  for (const response of ['not json', '{}', '[]', '[{},{}]']) {
    const f = await fixture(t, { run: (event, state, fallback) => event.args.includes('context') && event.args.includes('inspect') ? response : fallback() });
    await assert.rejects(f.transport.build(TARGET, f.snapshot), /context|Remote Docker/);
    assert.ok(commands(f).every(event => !event.args.includes('build')));
  }
});

test('a failing snapshot stream is never reported as a successful build or inspected', async t => {
  const f = await fixture(t, { buildContext: async function* () { yield Buffer.from('partial-context'); throw Error('synthetic-invalid-object'); } });
  await assert.rejects(f.transport.build(TARGET, f.snapshot), /local image build outcome could not be verified/);
  assert.equal(commands(f).filter(event => event.args.includes('build')).length, 1);
  assert.equal(commands(f).filter(event => event.args.includes('image')).length, 0);
  assert.equal(fetches(f).length, 0);
});

test('build cancellation reports an unverified local outcome without claiming daemon cleanup', async t => {
  const controller = new AbortController();
  const f = await fixture(t, { run: (event, state, fallback) => { if (event.args.includes('build')) controller.abort(SECRET); return fallback(); } });
  await assert.rejects(f.transport.build(TARGET, f.snapshot, controller.signal), error => /cancelled/.test(error.message) && /unverified/.test(error.message) && /retain a local image/.test(error.message) && !error.message.includes(SECRET));
  assert.equal(fetches(f).length, 0);
  assert.ok(commands(f).every(event => !event.args.includes('rm') && !event.args.includes('prune')));
});

test('failed build aborts its owned context producer without cancelling the caller', async t => {
  const controller = new AbortController(); let producerSignal;
  const f = await fixture(t, { buildContext: async function* (snapshot, { signal }) { producerSignal = signal; yield Buffer.from('context'); }, run: (event, state, fallback) => { if (event.args.includes('build')) throw Error(SECRET); return fallback(); } });
  await assert.rejects(f.transport.build(TARGET, f.snapshot, controller.signal), /local image build outcome/);
  assert.equal(producerSignal.aborted, true); assert.equal(controller.signal.aborted, false);
});

test('build rejects a failed or changed immutable image identity', async t => {
  const f = await fixture(t); f.state.imageId = OTHER_ID;
  await assert.rejects(f.transport.build(TARGET, f.snapshot), /local image build outcome could not be verified/);
  const invalid = await fixture(t, { run: (event, state, fallback) => event.args.includes('build') ? 'not-an-image-id' : fallback() });
  await assert.rejects(invalid.transport.build(TARGET, invalid.snapshot), /local image build outcome could not be verified/);
});

test('forged target fields and incomplete expected builds cannot start commands', async t => {
  const f = await fixture(t);
  for (const target of [{ ...TARGET, reference: 'attacker.invalid/repo:tag' }, { ...TARGET, namespace: 'other' }, { ...TARGET, name: '../other' }, null]) {
    await assert.rejects(f.transport.build(target, f.snapshot));
    await assert.rejects(f.transport.push(target, f.expected));
  }
  for (const expected of [null, {}, { ...f.expected, imageId: 'bad' }, { ...f.expected, host: 'tcp://remote:2375' }]) await assert.rejects(f.transport.push(TARGET, expected), /Prepare and build/);
  assert.equal(f.events.length, 0);
});

test('context endpoint, context selection and image tag changes refuse upload before credential access', async t => {
  for (const change of [state => { state.context = 'default'; }, state => { state.host = 'npipe:////./pipe/docker_engine'; }, state => { state.imageId = OTHER_ID; }]) {
    const f = await fixture(t); change(f.state);
    await assert.rejects(f.transport.push(TARGET, f.expected), /context changed|image tag changed/);
    assert.equal(fetches(f).length, 0); assert.equal(pushes(f).length, 0);
    assert.ok(commands(f).every(event => !path.basename(event.executable).startsWith('docker-credential-')));
  }
});

test('a tag changed during Hub verification is refused before push', async t => {
  const f = await fixture(t, { fetcher: (event, state, fallback) => { if (!event.url.endsWith('/v2/auth/token')) state.imageId = OTHER_ID; return fallback(); } });
  await assert.rejects(f.transport.push(TARGET, f.expected), /image tag changed/);
  assert.equal(pushes(f).length, 0);
});

test('public, absent, mismatched, read-only or unverified repositories are never pushed', async t => {
  for (const metadata of [null, [], {}, { is_private: false }, { is_private: 'true' }, { is_private: true, namespace: 'wrong', name: TARGET.name, permissions: { write: true } }, { is_private: true, namespace: TARGET.namespace, name: 'wrong', permissions: { write: true } }, { is_private: true, namespace: TARGET.namespace, name: TARGET.name, permissions: { write: false } }, { is_private: true, namespace: TARGET.namespace, name: TARGET.name, permissions: { write: 'true' } }]) {
    const f = await fixture(t); f.state.metadata = metadata;
    await assert.rejects(f.transport.push(TARGET, f.expected), /private repository|private Docker Hub repository/);
    assert.equal(pushes(f).length, 0);
  }
  const absent = await fixture(t, { fetcher: (event, state, fallback) => event.url.endsWith('/v2/auth/token') ? fallback() : json({}, { status: 404 }) });
  await assert.rejects(absent.transport.push(TARGET, absent.expected), /private repository/);
  assert.equal(pushes(absent).length, 0);
  assert.ok(fetches(absent).every(event => event.settings.method !== 'POST' || event.url.endsWith('/v2/auth/token')));
});

test('repository privacy is read again rather than cached between explicit uploads', async t => {
  const f = await fixture(t); await f.transport.push(TARGET, f.expected);
  f.state.metadata.is_private = false;
  await assert.rejects(f.transport.push(TARGET, f.expected), /Public or unverified/);
  assert.equal(fetches(f).filter(event => event.url.includes('/repositories/')).length, 2);
  assert.equal(pushes(f).length, 1);
});

test('unknown helpers, absent credentials and malformed credential files fail closed without network or push', async t => {
  for (const config of [{}, { credsStore: 'custom' }, { credHelpers: { [CONFIG_KEY]: 'untrusted' } }, { auths: { [CONFIG_KEY]: { auth: '!!!!' } } }, { auths: { [CONFIG_KEY]: { auth: Buffer.from('user:').toString('base64') } } }, { auths: { [CONFIG_KEY]: { auth: Buffer.from('user:secret').toString('base64'), identitytoken: 'synthetic-token' } } }]) {
    const f = await fixture(t, { config }); await assert.rejects(f.transport.push(TARGET, f.expected));
    assert.equal(fetches(f).length, 0); assert.equal(pushes(f).length, 0);
  }
  for (const contents of ['null', '[]', '{', 'x'.repeat(65537)]) {
    const f = await fixture(t); await fs.writeFile(path.join(f.configDirectory, 'config.json'), contents);
    await assert.rejects(f.transport.push(TARGET, f.expected), /configuration is unavailable/);
    assert.equal(fetches(f).length, 0);
  }
});

test('credential helper selection is restricted and invalid helper replies never reach Hub', async t => {
  const wincred = await fixture(t, { config: { credsStore: 'wincred' } });
  await wincred.transport.push(TARGET, wincred.expected);
  assert.ok(commands(wincred).some(event => event.executable === path.join(wincred.bin, 'docker-credential-wincred.exe')));
  for (const output of ['not json', 'null', '{}', JSON.stringify({ Username: '', Secret: SECRET }), JSON.stringify({ Username: 'user', Secret: '' }), JSON.stringify({ Username: 'x'.repeat(257), Secret: SECRET })]) {
    const f = await fixture(t, { run: (event, state, fallback) => path.basename(event.executable).startsWith('docker-credential-') ? output : fallback() });
    await assert.rejects(f.transport.push(TARGET, f.expected), /sign-in is unavailable/);
    assert.equal(fetches(f).length, 0);
  }
});

test('Hub failures, oversized bodies and invalid authentication responses are sanitized and not retried', async t => {
  const failures = [
    () => { throw Error('transport leaked ' + SECRET); },
    () => json({}, { status: 403 }),
    () => new Response('{invalid json ' + SECRET),
    () => new Response('x'.repeat(262145)),
    () => json({}, { headers: { 'Content-Length': '262145' } }),
    () => json({ access_token: '' }),
    () => json({ access_token: 'invalid\n' + TOKEN }),
    () => json({ access_token: 'x'.repeat(16385) }),
  ];
  for (const fetcher of failures) {
    const f = await fixture(t, { fetcher });
    await assert.rejects(f.transport.push(TARGET, f.expected), error => !error.message.includes(SECRET) && !error.message.includes(TOKEN));
    assert.equal(fetches(f).length, 1); assert.equal(pushes(f).length, 0);
  }
});

test('Docker command errors are generic and a failed push is not retried', async t => {
  const f = await fixture(t, { run: (event, state, fallback) => { if (event.args.includes('push')) throw Error('command stderr ' + SECRET); return fallback(); } });
  await assert.rejects(f.transport.push(TARGET, f.expected), error => /may already have started/.test(error.message) && !error.message.includes(SECRET));
  assert.equal(pushes(f).length, 1);
  const helper = await fixture(t, { run: (event, state, fallback) => { if (path.basename(event.executable).startsWith('docker-credential-')) throw Error(SECRET); return fallback(); } });
  await assert.rejects(helper.transport.push(TARGET, helper.expected), error => !error.message.includes(SECRET));
  assert.equal(fetches(helper).length, 0);
});

test('cancellation before any operation never runs Docker or fetch and does not reveal its reason', async t => {
  const f = await fixture(t); const controller = new AbortController(); controller.abort(SECRET);
  for (const operation of [() => f.transport.build(TARGET, f.snapshot, controller.signal), () => f.transport.push(TARGET, f.expected, controller.signal)]) await assert.rejects(operation(), error => /cancelled/.test(error.message) && !error.message.includes(SECRET));
  assert.equal(f.events.length, 0);
});

test('cancellation in context inspection, helper access or push propagates without subsequent commands', async t => {
  for (const phase of ['context', 'helper', 'push']) {
    const controller = new AbortController();
    const f = await fixture(t, { run: (event, state, fallback) => {
      if ((phase === 'context' && event.args.includes('context')) || (phase === 'helper' && path.basename(event.executable).startsWith('docker-credential-')) || (phase === 'push' && event.args.includes('push'))) { assert.equal(event.settings.signal, controller.signal); controller.abort(SECRET); }
      return fallback();
    } });
    await assert.rejects(f.transport.push(TARGET, f.expected, controller.signal), error => /cancelled/.test(error.message) && !error.message.includes(SECRET));
    assert.equal(commands(f).at(-1).args.includes('push'), phase === 'push');
    assert.equal(pushes(f).length, phase === 'push' ? 1 : 0);
    if (phase !== 'push') assert.equal(fetches(f).length, 0);
  }
});

test('cancellation reaches both authentication and metadata fetch and never starts a push', async t => {
  for (const pathname of ['/v2/auth/token', '/repositories/encrypted-vault']) {
    const controller = new AbortController(); let requestSignal;
    const f = await fixture(t, { fetcher: async (event, state, fallback) => {
      if (event.url.endsWith(pathname)) {
        requestSignal = event.settings.signal;
        assert.equal(requestSignal.aborted, false);
        const interrupted = new Promise((resolve, reject) => requestSignal.addEventListener('abort', () => reject(Error(SECRET)), { once: true }));
        controller.abort(SECRET); return interrupted;
      }
      return fallback();
    } });
    await assert.rejects(f.transport.push(TARGET, f.expected, controller.signal), error => /cancelled/.test(error.message) && !error.message.includes(SECRET));
    assert.equal(requestSignal.aborted, true); assert.equal(pushes(f).length, 0);
  }
});

test('receipt requires the pushed tag, valid digest and membership on the expected immutable image', async t => {
  for (const output of ['', 'archive: digest: sha256:not-valid size: 1234', `other: digest: ${DIGEST} size: 1234`, `${TARGET.tag}: digest: ${OTHER_ID} size: 1234`, `${TARGET.tag}: digest: ${DIGEST} size: nope`]) {
    const f = await fixture(t, { run: (event, state, fallback) => event.args.includes('push') ? output : fallback() });
    await assert.rejects(f.transport.push(TARGET, f.expected), /outcome could not be verified/);
    assert.equal(pushes(f).length, 1);
  }
  for (const digests of [null, {}, [], [`wrong/repo@${DIGEST}`], [TARGET.repository + '@' + DIGEST + 'extra']]) {
    const f = await fixture(t); f.state.digests = digests;
    await assert.rejects(f.transport.push(TARGET, f.expected), /outcome could not be verified/);
    assert.equal(pushes(f).length, 1);
  }
  const normalized = await fixture(t); normalized.state.digests = ['docker.io/' + TARGET.repository + '@' + DIGEST];
  assert.equal((await normalized.transport.push(TARGET, normalized.expected)).digest, normalized.state.digests[0]);
});

test('post-push tag changes are reported as uncertain, never successful or retried', async t => {
  const f = await fixture(t, { run: (event, state, fallback) => { if (event.args.includes('push')) state.imageId = OTHER_ID; return fallback(); } });
  await assert.rejects(f.transport.push(TARGET, f.expected), /outcome could not be verified/);
  assert.equal(pushes(f).length, 1);
});

test('production process runner uses execFile without a shell or diagnostic logging', async () => {
  const source = await fs.readFile(new URL('../src/main/vault-image-docker.js', import.meta.url), 'utf8');
  assert.match(source, /execute = execFile/);
  assert.match(source, /execute\(executable, args, \{[^}]*shell: false/);
  assert.doesNotMatch(source, /\bexec\(|spawnSync\(|execSync\(|console\./);
});

function fakeExecutor({ processBeforeInput = false, exitError, stdinError } = {}) {
  const seen = { killed: 0, chunks: [], options: null, callback: null };
  const execute = (executable, args, options, callback) => {
    Object.assign(seen, { executable, args, options, callback });
    const child = {
      kill: () => { seen.killed++; },
      stdin: new Writable({
        write(chunk, encoding, done) { seen.chunks.push(Buffer.from(chunk)); done(stdinError); },
        final(done) { done(); if (!processBeforeInput) queueMicrotask(() => callback(exitError, exitError ? '' : '  synthetic-output  ')); },
      }),
    };
    if (processBeforeInput) queueMicrotask(() => callback(exitError, exitError ? '' : '  synthetic-output  '));
    return child;
  };
  return { execute, seen };
}

test('runner sends string and streamed inputs only through stdin and waits for process completion', async () => {
  for (const input of [SECRET, (async function* () { yield Buffer.from('part-one'); yield Buffer.from('part-two'); })()]) {
    const fake = fakeExecutor();
    const result = await runDockerCommand('/synthetic/docker.exe', ['build', '-'], { input, execute: fake.execute });
    assert.equal(result, 'synthetic-output'); assert.equal(fake.seen.options.shell, false);
    assert.equal(fake.seen.options.cwd, '/synthetic'); assert.deepEqual(fake.seen.args, ['build', '-']);
    assert.equal(Buffer.concat(fake.seen.chunks).toString(), typeof input === 'string' ? SECRET : 'part-onepart-two');
    assert.equal(fake.seen.killed, 0);
  }
});

test('runner cannot report success until streaming has completed even if the child exits successfully first', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const fake = fakeExecutor({ processBeforeInput: true }); let resolved = false;
  const running = runDockerCommand('/synthetic/docker.exe', [], { execute: fake.execute, input: (async function* () { yield Buffer.from('first'); await pending; yield Buffer.from('last'); })() }).then(result => { resolved = true; return result; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(resolved, false);
  release(); assert.equal(await running, 'synthetic-output');
});

test('runner kills only its own child and rejects a stream failure even after zero exit', async () => {
  const fake = fakeExecutor({ processBeforeInput: true });
  await assert.rejects(runDockerCommand('/synthetic/docker.exe', [], { execute: fake.execute, input: (async function* () { yield Buffer.from('partial'); throw Error(SECRET); })() }), error => /could not complete/.test(error.message) && !error.message.includes(SECRET));
  assert.equal(fake.seen.killed, 1); assert.equal(fake.seen.options.signal.aborted, true);
});

test('runner rejects and sanitizes child errors, stdin errors and synchronous launch errors', async () => {
  for (const options of [{ exitError: Error(SECRET) }, { stdinError: Error(SECRET) }]) {
    const fake = fakeExecutor(options);
    await assert.rejects(runDockerCommand('/synthetic/docker.exe', [], { execute: fake.execute, input: SECRET }), error => !error.message.includes(SECRET));
    assert.equal(fake.seen.killed, 1); assert.equal(fake.seen.options.signal.aborted, true);
  }
  await assert.rejects(runDockerCommand('/synthetic/docker.exe', [], { execute: () => { throw Error(SECRET); } }), error => !error.message.includes(SECRET));
});

test('runner propagates cancellation to stdin without executing when already cancelled', async () => {
  const before = new AbortController(); before.abort(SECRET); let executed = false;
  await assert.rejects(runDockerCommand('/synthetic/docker.exe', [], { signal: before.signal, execute: () => { executed = true; } }), /cancelled/);
  assert.equal(executed, false);
  const controller = new AbortController(); const fake = fakeExecutor({ processBeforeInput: true });
  let release; const pending = new Promise(resolve => { release = resolve; });
  const running = runDockerCommand('/synthetic/docker.exe', [], { signal: controller.signal, execute: fake.execute, input: (async function* () { yield Buffer.from('first'); await pending; yield Buffer.from('last'); })() });
  await new Promise(resolve => setImmediate(resolve)); controller.abort(SECRET); release();
  await assert.rejects(running, error => !error.message.includes(SECRET));
  assert.equal(fake.seen.options.signal.aborted, true); assert.equal(fake.seen.killed, 1);
});
