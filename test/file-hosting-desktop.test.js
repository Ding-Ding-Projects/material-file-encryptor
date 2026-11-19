import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateSettings, instanceFiles, composeArgs, quickTunnelUrl, lanAddress, remoteWrite, remoteDocker, sshForwardArgs, DEFAULT_IMAGE, SERVER_VERSION, linkBase } from '../src/main/file-hosting/hosting-plan.js';
import { validateHostingRequest, HOSTING_METHODS } from '../src/main/file-hosting/ipc.js';
import { createHostingService } from '../src/main/file-hosting/hosting-service.js';
import { createHostingStore } from '../src/main/file-hosting/hosting-store.js';
import { validateRequest } from '../src/main/validation.js';

const base = { name: 'files', target: 'local', port: 8790, cacheGb: 10, tunnel: 'none' };

test('settings are validated with field-specific messages', () => {
  assert.deepEqual(validateSettings(base), { ...base, publicUrl: null, image: DEFAULT_IMAGE, ssh: null });
  assert.equal(DEFAULT_IMAGE, `ghcr.io/ding-ding-projects/material-file-encryptor-hosting:${SERVER_VERSION}`);
  for (const [patch, field] of [[{ name: 'X' }, 'name'], [{ name: 'a;b' }, 'name'], [{ port: 80 }, 'port'], [{ target: 'cloud' }, 'target'], [{ cacheGb: 0 }, 'cacheGb'],
    [{ tunnel: 'named', publicUrl: 'http://files.example.com' }, 'publicUrl'], [{ tunnel: 'named', publicUrl: 'https://u:p@files.example.com' }, 'publicUrl'],
    [{ target: 'ssh', ssh: { host: '-oProxyCommand=x', user: 'docker' } }, 'ssh'], [{ target: 'ssh', ssh: { host: 'box', user: 'docker', keyPath: '-i' } }, 'ssh']]) {
    assert.throws(() => validateSettings({ ...base, ...patch }), error => error.code === 'INVALID_SETTINGS' && error.field === field, JSON.stringify(patch));
  }
  assert.equal(validateSettings({ ...base, tunnel: 'named', publicUrl: 'https://files.example.com/' }).publicUrl, 'https://files.example.com');
});

test('instance files keep secrets in their own env files and never in compose.yaml', () => {
  const settings = validateSettings({ ...base, tunnel: 'named', publicUrl: 'https://files.example.com' });
  const files = instanceFiles(settings, { adminToken: 'k'.repeat(43), tunnelToken: 'eyJ' + 't'.repeat(60) });
  assert.match(files['hosting.env'], /^ADMIN_TOKEN=k{43}\n$/);
  assert.match(files['tunnel.env'], /^TUNNEL_TOKEN=eyJt+\n$/);
  assert.match(files['.env'], /INSTANCE=mfe-files\nPORT=8790\nCACHE_MAX_GB=10\nFILE_HOSTING_IMAGE=/);
  assert.ok(!files['compose.yaml'].includes('k'.repeat(43)));
  assert.throws(() => instanceFiles(settings, { adminToken: 'short' }));
  assert.throws(() => instanceFiles(settings, { adminToken: 'k'.repeat(43) }), { field: 'tunnelToken' });
  assert.equal(instanceFiles(validateSettings(base), { adminToken: 'k'.repeat(43) })['tunnel.env'], undefined);
});

test('compose and ssh commands are exact and quoted', () => {
  const quick = validateSettings({ ...base, tunnel: 'quick' });
  assert.deepEqual(composeArgs(quick, 'up'), ['compose', '--profile', 'quick-tunnel', 'up', '-d', '--remove-orphans']);
  assert.deepEqual(composeArgs(validateSettings(base), 'down'), ['compose', 'down', '--volumes', '--remove-orphans']);
  const ssh = validateSettings({ ...base, target: 'ssh', ssh: { host: '192.168.50.59', user: 'docker', port: 22 } });
  assert.equal(remoteDocker(ssh, ['compose', 'ps']), "cd 'material-file-encryptor-hosting/files' && docker 'compose' 'ps'");
  assert.match(remoteWrite(ssh, 'hosting.env'), /^umask 077 && mkdir -p 'material-file-encryptor-hosting\/files' && cd .+ && tee -- 'hosting\.env\.part' > \/dev\/null && mv 'hosting\.env\.part' 'hosting\.env'$/);
  assert.throws(() => remoteWrite(ssh, '../x'));
  assert.deepEqual(sshForwardArgs(ssh, 40001).slice(0, 5), ['-N', '-o', 'ExitOnForwardFailure=yes', '-L', '127.0.0.1:40001:127.0.0.1:8790']);
});

test('the quick tunnel address and the LAN address are found', () => {
  assert.equal(quickTunnelUrl('INF |  https://calm-river-4821.trycloudflare.com  |\nother https://api.trycloudflare.com'), 'https://api.trycloudflare.com');
  assert.equal(quickTunnelUrl('nothing yet'), null);
  assert.equal(lanAddress({ 'vEthernet (WSL)': [{ family: 'IPv4', address: '172.20.0.1', internal: false }], Ethernet: [{ family: 'IPv4', address: '10.0.0.5', internal: false }], 'Wi-Fi': [{ family: 'IPv4', address: '192.168.50.24', internal: false }], lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }] }), '192.168.50.24');
  assert.equal(linkBase({ publicUrl: null, quickUrl: 'https://q.trycloudflare.com', lanUrl: 'http://192.168.1.2:8790' }), 'https://q.trycloudflare.com');
});

test('ipc requests are shape-checked and reach the main validator', () => {
  for (const method of HOSTING_METHODS) assert.ok(typeof method === 'string');
  assert.throws(() => validateHostingRequest('hostingAction', { id: '00000000-0000-4000-8000-000000000000', action: 'rm -rf' }));
  assert.throws(() => validateHostingRequest('hostingCreateLink', { instanceId: 'x', shareId: 'y', expiresAt: 1 }));
  assert.throws(() => validateHostingRequest('hostingDeploy', { settings: { ...base, extra: 1 } }));
  assert.deepEqual(validateRequest('hostingLinkUrl', { instanceId: '00000000-0000-4000-8000-000000000000', linkId: 'A'.repeat(22) }), { instanceId: '00000000-0000-4000-8000-000000000000', linkId: 'A'.repeat(22) });
});

function memoryProtection() { return { available: () => true, encrypt: text => Buffer.from('sealed:' + text), decrypt: bytes => bytes.toString().slice(7) }; }

async function harness({ healthy = true } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-hosting-desktop-'));
  const calls = [], revoked = [];
  const serverLinks = new Map();
  const store = createHostingStore({ file: path.join(directory, 'hosting.bin'), protection: memoryProtection() });
  const shareEntry = { id: '11111111-1111-4111-8111-111111111111', name: 'Report.pdf', state: 'active', repository: 'tester/material-file-encryptor-shares', digest: 'sha256:' + 'a'.repeat(64), passphrase: false };
  const fetcher = async (url, init = {}) => {
    const route = new URL(url).pathname;
    if (route === '/api/health') return new Response(JSON.stringify(healthy ? { ok: true, version: '1.0.0', uptimeSeconds: 5 } : { ok: false }), { status: healthy ? 200 : 503 });
    if (init.headers?.Authorization !== `Bearer ${(await store.instances())[0]?.adminToken}`) return new Response('{"error":{"code":"UNAUTHORIZED"}}', { status: 401 });
    if (route === '/api/admin/status') return new Response(JSON.stringify({ cache: { bytes: 0, files: 0, maxBytes: 1 }, links: { active: 0, total: 0 } }));
    if (route === '/api/admin/links' && init.method === 'POST') { const body = JSON.parse(init.body); const link = { id: 'L'.repeat(22), ...body, state: 'active', downloads: 0, cached: false }; serverLinks.set(link.id, link); return new Response(JSON.stringify(link), { status: 201 }); }
    if (route === '/api/admin/links') return new Response(JSON.stringify({ links: [...serverLinks.values()] }));
    if (route.startsWith('/api/admin/links/') && init.method === 'DELETE') { const link = serverLinks.get(route.slice(17)); link.state = 'ended'; link.endedReason = 'ended'; return new Response(JSON.stringify(link)); }
    return new Response('{}', { status: 404 });
  };
  const service = createHostingService({
    store, fetcher, userDir: directory, sleep: async () => {}, healthTimeoutMs: 1000,
    interfaces: () => ({ 'Wi-Fi': [{ family: 'IPv4', address: '192.168.50.24', internal: false }] }),
    exec: async (command, args) => { calls.push([command, ...args].join(' ')); return { stdout: '', stderr: '' }; },
    spawn: () => { throw Error('no ssh in this test'); },
    shares: { entry: async id => id === shareEntry.id ? shareEntry : null, command: async () => `mfe-share:v1:registry-1.docker.io/${shareEntry.repository}@${shareEntry.digest}#${'K'.repeat(43)}`, revoke: async id => { revoked.push(id); } }
  });
  return { directory, service, store, calls, revoked, shareEntry, async close() { await fs.rm(directory, { recursive: true, force: true }); } };
}

test('a local deployment writes owner files, pulls, starts, checks health and records the LAN link', async () => {
  const h = await harness();
  try {
    const result = await h.service.deploy({ settings: base });
    assert.equal(result.instance.lanUrl, 'http://192.168.50.24:8790');
    assert.equal(result.instance.hasTunnelToken, false);
    assert.ok(!JSON.stringify(result).includes((await h.store.instances())[0].adminToken), 'the admin key never reaches the renderer');
    assert.deepEqual(h.calls, ['docker version --format {{.Server.Version}}', 'docker compose pull --quiet', 'docker compose up -d --remove-orphans']);
    const env = await fs.readFile(path.join(h.directory, 'files', 'hosting.env'), 'utf8');
    assert.match(env, /^ADMIN_TOKEN=[A-Za-z0-9_-]{43}\n$/);
    // Redeploying keeps the same admin key so existing links keep working.
    const before = (await h.store.instances())[0].adminToken;
    await h.service.deploy({ settings: { ...base, cacheGb: 20 } });
    assert.equal((await h.store.instances()).length, 1);
    assert.equal((await h.store.instances())[0].adminToken, before);
    await assert.rejects(h.service.deploy({ settings: { ...base, name: 'other' } }), { code: 'PORT_TAKEN' });
  } finally { await h.close(); }
});

test('an unhealthy start is reported, not claimed', async () => {
  const h = await harness({ healthy: false });
  try { await assert.rejects(h.service.deploy({ settings: base }), { code: 'UNHEALTHY' }); }
  finally { await h.close(); }
});

test('a link carries the share key only after #, and ending it removes the share from Docker Hub when asked', async () => {
  const h = await harness();
  try {
    const { instance } = await h.service.deploy({ settings: base });
    const created = await h.service.createLink({ instanceId: instance.id, shareId: h.shareEntry.id, expiresAt: Date.now() + 86400000, maxDownloads: 3, removeFromHub: true, prefetch: true });
    assert.equal(created.url, `http://192.168.50.24:8790/d/${'L'.repeat(22)}#${'K'.repeat(43)}`);
    const listed = await h.service.links(instance.id);
    assert.equal(listed.links[0].state, 'active');
    assert.ok(!JSON.stringify(listed).includes('K'.repeat(43)), 'the list never carries the key');
    await h.service.endLink(instance.id, created.linkId);
    assert.deepEqual(h.revoked, [h.shareEntry.id]);
    assert.equal((await h.service.links(instance.id)).links[0].hubRemoved, true);
    assert.equal((await h.service.linkUrl(instance.id, created.linkId)).url, created.url);
    await assert.rejects(h.service.createLink({ instanceId: instance.id, shareId: '22222222-2222-4222-8222-222222222222', expiresAt: Date.now() + 86400000 }), { code: 'SHARE_NOT_ACTIVE' });
  } finally { await h.close(); }
});
