import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, scrypt as nodeScrypt, randomBytes } from 'node:crypto';
import { sealShare, wrapShareKey } from '../src/main/share/share-crypto.js';
import { createApp } from '../file-hosting/server/src/app.js';
import { openLinkStore } from '../file-hosting/server/src/link-store.js';
import { createBlobCache } from '../file-hosting/server/src/blob-cache.js';
import { createRegistryReader } from '../file-hosting/server/src/registry-fetch.js';
import { parseSecret, unwrapKey, openShareStream } from '../file-hosting/server/public/share-open.js';
import { scrypt } from '../file-hosting/server/public/scrypt.js';

const REPO = 'tester/material-file-encryptor-shares';
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const ADMIN = 'a'.repeat(40);

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

/** A fake registry holding one share; blobs answer with a redirect, as Docker Hub does. */
async function fakeRegistry(blob) {
  const config = Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'encrypted-file-share' }));
  const manifest = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: { mediaType: 'application/vnd.material-file-encryptor.share.v1+json', digest: sha(config), size: config.length },
    layers: [{ mediaType: 'application/vnd.material-file-encryptor.share.v1.encrypted', digest: sha(blob), size: blob.length }] }));
  const objects = new Map([[sha(config), config], [sha(blob), blob]]);
  const state = { blobGets: 0, present: true, authSeenOnStorage: false };
  const registry = await listen((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/storage/')) { if (req.headers.authorization) state.authSeenOnStorage = true; state.blobGets++; const body = objects.get(url.pathname.slice(9)); res.writeHead(200, { 'Content-Length': body.length }); return res.end(body); }
    if (!state.present) { res.writeHead(404); return res.end(); }
    if (url.pathname === `/v2/${REPO}/manifests/${sha(manifest)}`) { res.writeHead(200, { 'Content-Type': 'application/vnd.oci.image.manifest.v1+json' }); return res.end(manifest); }
    const blobMatch = /^\/v2\/[^]+\/blobs\/(sha256:[a-f0-9]{64})$/.exec(url.pathname);
    if (blobMatch && objects.has(blobMatch[1])) { res.writeHead(307, { Location: `/storage/${blobMatch[1]}` }); return res.end(); }
    res.writeHead(404); res.end();
  });
  return { ...registry, digest: sha(manifest), state };
}

async function setup(blob, { now = () => Date.now() } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-hosting-'));
  const registry = await fakeRegistry(blob);
  const reader = createRegistryReader({ registry: { endpoint: registry.url, auth: null, service: null } });
  const links = await openLinkStore({ file: path.join(directory, 'links.json'), now });
  const cache = createBlobCache({ directory: path.join(directory, 'cache'), maxBytes: 1024 ** 3, reader, now });
  const app = createApp({ links, cache, reader, adminToken: ADMIN, now });
  const site = await listen((req, res) => void app.handle(req, res));
  const admin = (route, init = {}) => fetch(site.url + route, { ...init, headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  return { directory, registry, app, site, admin, links, cache,
    async close() { await new Promise(resolve => setTimeout(resolve, 30)); await links.flush().catch(() => {}); site.server.close(); registry.server.close(); await fs.rm(directory, { recursive: true, force: true, maxRetries: 5 }); } };
}

async function makeShare(content, { passphrase = null, name = 'Report final.pdf' } = {}) {
  const key = randomBytes(32);
  const blob = await sealShare({ key, source: [content], name, size: content.length, chunkSize: 4096 });
  const secret = passphrase ? 'p:' + (await wrapShareKey(key, passphrase)).toString('base64url') : key.toString('base64url');
  return { blob, secret };
}

async function decrypt(site, id, secret, total, passphrase) {
  const parsed = parseSecret('#' + secret);
  const key = parsed.key ?? await unwrapKey(parsed.wrapped, passphrase);
  const response = await fetch(`${site.url}/api/links/${id}/blob`);
  assert.equal(response.status, 200);
  const parts = []; let metadata;
  await openShareStream({ reader: response.body.getReader(), total, key, onMetadata: value => { metadata = value; }, onContent: piece => parts.push(Buffer.from(piece)) });
  return { metadata, content: Buffer.concat(parts) };
}

test('a link serves the cached ciphertext and the browser code decrypts it', async () => {
  const content = randomBytes(20000);
  const { blob, secret } = await makeShare(content);
  const env = await setup(blob);
  try {
    const created = await env.admin('/api/admin/links', { method: 'POST', body: JSON.stringify({ repository: REPO, digest: env.registry.digest, expiresAt: Date.now() + 3600000, maxDownloads: null, prefetch: false }) });
    assert.equal(created.status, 201);
    const link = await created.json();
    assert.match(link.id, /^[A-Za-z0-9_-]{22}$/);
    assert.equal(link.size, blob.length);
    const meta = await (await fetch(`${env.site.url}/api/links/${link.id}`)).json();
    assert.deepEqual({ size: meta.size, downloadsLeft: meta.downloadsLeft }, { size: blob.length, downloadsLeft: null });
    const page = await fetch(`${env.site.url}/d/${link.id}`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
    // Preview: only the first chunk, and it names the file.
    const head = await fetch(`${env.site.url}/api/links/${link.id}/head`);
    const headBytes = Buffer.from(await head.arrayBuffer());
    assert.ok(headBytes.length < blob.length);
    let named;
    await openShareStream({ reader: new Response(headBytes).body.getReader(), total: blob.length, key: parseSecret(secret).key, stopAfterMetadata: true, onMetadata: value => { named = value.name; } });
    assert.equal(named, 'Report final.pdf');
    const first = await decrypt(env.site, link.id, secret, blob.length);
    assert.equal(first.metadata.name, 'Report final.pdf');
    assert.ok(first.content.equals(content));
    await decrypt(env.site, link.id, secret, blob.length);
    // Config at creation, then config and layer once when the cache fills; both downloads come from the cache.
    assert.equal(env.registry.state.blobGets, 3, 'the layer is fetched once, then served from the cache');
    assert.equal(env.registry.state.authSeenOnStorage, false);
    await new Promise(resolve => setTimeout(resolve, 50));
    const listed = await (await env.admin('/api/admin/links')).json();
    assert.equal(listed.links[0].downloads, 2);
    assert.equal(listed.links[0].cached, true);
  } finally { await env.close(); }
});

test('a download limit ends the link and removes the cached file', async () => {
  const { blob, secret } = await makeShare(randomBytes(9000));
  const env = await setup(blob);
  try {
    const link = await (await env.admin('/api/admin/links', { method: 'POST', body: JSON.stringify({ repository: REPO, digest: env.registry.digest, expiresAt: Date.now() + 3600000, maxDownloads: 1, prefetch: false }) })).json();
    await decrypt(env.site, link.id, secret, blob.length);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal((await fetch(`${env.site.url}/api/links/${link.id}/blob`)).status, 410);
    assert.equal((await fetch(`${env.site.url}/api/links/${link.id}`)).status, 410);
    assert.deepEqual((await fs.readdir(path.join(env.directory, 'cache'))).filter(name => name.endsWith('.blob')), []);
  } finally { await env.close(); }
});

test('expiry ends a link at the sweep and frees its cache', async () => {
  let clock = Date.now();
  const { blob } = await makeShare(randomBytes(5000));
  const env = await setup(blob, { now: () => clock });
  try {
    const link = await (await env.admin('/api/admin/links', { method: 'POST', body: JSON.stringify({ repository: REPO, digest: env.registry.digest, expiresAt: clock + 120000, prefetch: true }) })).json();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await env.cache.has(env.links.get(link.id).layer), true);
    clock += 130000;
    await env.app.sweep();
    assert.equal(env.links.get(link.id).endedReason, 'expired');
    assert.equal(await env.cache.has(env.links.get(link.id).layer), false);
  } finally { await env.close(); }
});

test('admin requests need the key, and only share repositories are accepted', async () => {
  const { blob } = await makeShare(randomBytes(100));
  const env = await setup(blob);
  try {
    assert.equal((await fetch(`${env.site.url}/api/admin/links`, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await fetch(`${env.site.url}/api/admin/links`)).status, 401);
    const foreign = await env.admin('/api/admin/links', { method: 'POST', body: JSON.stringify({ repository: 'tester/other', digest: env.registry.digest, expiresAt: Date.now() + 3600000 }) });
    assert.equal(foreign.status, 400);
    const late = await env.admin('/api/admin/links', { method: 'POST', body: JSON.stringify({ repository: REPO, digest: env.registry.digest, expiresAt: Date.now() + 400 * 86400000 }) });
    assert.equal(late.status, 400);
    const extra = await env.admin('/api/admin/links', { method: 'POST', body: JSON.stringify({ repository: REPO, digest: env.registry.digest, expiresAt: Date.now() + 3600000, name: 'x' }) });
    assert.equal(extra.status, 400);
    assert.equal((await fetch(`${env.site.url}/api/links/${'A'.repeat(22)}`)).status, 404);
  } finally { await env.close(); }
});

test('a share removed from Docker Hub ends its link with a plain reason', async () => {
  const { blob } = await makeShare(randomBytes(100));
  const env = await setup(blob);
  try {
    const link = await (await env.admin('/api/admin/links', { method: 'POST', body: JSON.stringify({ repository: REPO, digest: env.registry.digest, expiresAt: Date.now() + 3600000, prefetch: false }) })).json();
    env.registry.state.present = false;
    const response = await fetch(`${env.site.url}/api/links/${link.id}/blob`);
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error.code, 'MISSING');
  } finally { await env.close(); }
});

test('the browser scrypt matches Node for small parameters', async () => {
  const password = Buffer.from('correct horse'), salt = randomBytes(16);
  const ours = await scrypt(password, salt, { N: 1024, r: 8, p: 1, length: 32 });
  const theirs = await new Promise((resolve, reject) => nodeScrypt(password, salt, 32, { N: 1024, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key)));
  assert.ok(Buffer.from(ours).equals(theirs));
});

test('a passphrase share opens in the browser code with the real parameters', async () => {
  const content = Buffer.from('passphrase protected content');
  const { blob, secret } = await makeShare(content, { passphrase: 'a long passphrase' });
  const env = await setup(blob);
  try {
    const link = await (await env.admin('/api/admin/links', { method: 'POST', body: JSON.stringify({ repository: REPO, digest: env.registry.digest, expiresAt: Date.now() + 3600000, prefetch: false }) })).json();
    await assert.rejects(unwrapKey(parseSecret(secret).wrapped, 'wrong passphrase'), { code: 'WRONG_PASSPHRASE' });
    const opened = await decrypt(env.site, link.id, secret, blob.length, 'a long passphrase');
    assert.ok(opened.content.equals(content));
  } finally { await env.close(); }
});

test('a changed byte or a wrong key is refused', async () => {
  const { blob, secret } = await makeShare(randomBytes(10000));
  const key = parseSecret(secret).key;
  const tampered = Buffer.from(blob); tampered[tampered.length - 40] ^= 1;
  await assert.rejects(openShareStream({ reader: new Response(tampered).body.getReader(), total: tampered.length, key }), { code: 'TAMPERED' });
  const wrong = randomBytes(32);
  await assert.rejects(openShareStream({ reader: new Response(blob).body.getReader(), total: blob.length, key: wrong }), { code: 'INVALID_KEY' });
  await assert.rejects(openShareStream({ reader: new Response(blob.subarray(0, blob.length - 4100)).body.getReader(), total: blob.length - 4100, key }), error => ['TRUNCATED', 'TAMPERED'].includes(error.code));
  assert.throws(() => parseSecret('#short'), { code: 'INVALID_LINK' });
});
