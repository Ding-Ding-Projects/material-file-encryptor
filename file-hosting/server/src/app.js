import { createReadStream, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINK_ID } from './link-store.js';
import { SHARE_REPOSITORY, DIGEST } from './registry-fetch.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(here, '../public');
const ASSETS = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/assets/download.css', ['download.css', 'text/css; charset=utf-8']],
  ['/assets/download.js', ['download.js', 'text/javascript; charset=utf-8']],
  ['/assets/share-open.js', ['share-open.js', 'text/javascript; charset=utf-8']],
  ['/assets/scrypt.js', ['scrypt.js', 'text/javascript; charset=utf-8']],
  ['/assets/icon.svg', ['icon.svg', 'image/svg+xml']]
]);
const DOWNLOAD_PAGE = 'download.html';
const MAX_BODY = 8192;
const YEAR = 366 * 24 * 3600 * 1000;
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

const digestOf = text => createHash('sha256').update(String(text)).digest();
function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(payload), ...extra });
  res.end(payload);
}
const fail = (res, status, code, message) => send(res, status, { error: { code, message } });

async function readJson(req) {
  if (!/^application\/json\b/.test(req.headers['content-type'] || '')) throw Object.assign(Error('Send JSON.'), { status: 415 });
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw Object.assign(Error('The request is too large.'), { status: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(Error('The request is not valid JSON.'), { status: 400 }); }
}

/**
 *   links    the link store            cache   the blob cache          reader   the registry reader
 *   adminToken   the bearer key the desktop app uses (at least 32 characters)
 */
export function createApp({ links, cache, reader, adminToken, version = '1.0.0', now = Date.now, startedAt = Date.now(), log = () => {} }) {
  if (typeof adminToken !== 'string' || adminToken.length < 32) throw Error('An admin key of at least 32 characters is required.');
  const adminDigest = digestOf(adminToken);
  const pages = new Map([...ASSETS.values(), [DOWNLOAD_PAGE]].map(([name]) => [name, readFileSync(path.join(PUBLIC, name))]));
  const inflight = new Map();
  const failures = new Map();

  const publicView = link => ({ size: link.size, expiresAt: link.expiresAt, maxDownloads: link.maxDownloads, downloadsLeft: link.maxDownloads === null ? null : Math.max(0, link.maxDownloads - link.downloads - (inflight.get(link.id) ?? 0)) });
  const adminView = async link => ({ id: link.id, path: `/d/${link.id}`, repository: link.repository, digest: link.digest, size: link.size, createdAt: link.createdAt, expiresAt: link.expiresAt,
    maxDownloads: link.maxDownloads, downloads: link.downloads, state: link.state, endedReason: link.endedReason, cached: await cache.has(link.layer) });
  const live = link => link && link.state === 'active' && link.expiresAt > now();

  async function release(link) {
    // The cached blob goes when no other active link needs it.
    if (!links.active().some(other => other.layer === link.layer && other.id !== link.id && other.expiresAt > now())) await cache.remove(link.layer);
  }
  async function endLink(id, reason) { const link = await links.end(id, reason); if (link) await release(link); return link; }

  function authorized(req, res) {
    const ip = req.socket.remoteAddress || 'unknown', record = failures.get(ip);
    if (record && record.count >= 20 && now() - record.first < 600000) { fail(res, 429, 'SLOW_DOWN', 'Too many wrong admin keys. Wait ten minutes.'); return false; }
    const header = req.headers.authorization || '';
    const ok = header.startsWith('Bearer ') && timingSafeEqual(digestOf(header.slice(7)), adminDigest);
    if (!ok) {
      const next = record && now() - record.first < 600000 ? { first: record.first, count: record.count + 1 } : { first: now(), count: 1 };
      failures.set(ip, next); fail(res, 401, 'UNAUTHORIZED', 'The admin key is missing or wrong.'); return false;
    }
    failures.delete(ip); return true;
  }

  async function createLink(req, res) {
    const body = await readJson(req);
    const allowed = ['repository', 'digest', 'expiresAt', 'maxDownloads', 'prefetch'];
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) return fail(res, 400, 'INVALID', 'Unexpected fields.');
    const { repository, digest, expiresAt, maxDownloads = null, prefetch = true } = body;
    if (!SHARE_REPOSITORY.test(repository || '')) return fail(res, 400, 'FOREIGN_REPOSITORY', 'Only Material File Encryptor share repositories can be hosted.');
    if (!DIGEST.test(digest || '')) return fail(res, 400, 'INVALID', 'The share digest is not valid.');
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now() + 60000 || expiresAt > now() + YEAR) return fail(res, 400, 'INVALID_EXPIRY', 'Choose an expiry between one minute and one year from now.');
    if (maxDownloads !== null && (!Number.isSafeInteger(maxDownloads) || maxDownloads < 1 || maxDownloads > 100000)) return fail(res, 400, 'INVALID_LIMIT', 'The download limit must be between 1 and 100000, or none.');
    if (typeof prefetch !== 'boolean') return fail(res, 400, 'INVALID', 'prefetch must be true or false.');
    const layer = await reader.inspect(repository, digest);
    const link = await links.add({ repository, digest, layer: layer.digest, size: layer.size, expiresAt, maxDownloads });
    if (prefetch) cache.ensure(link).catch(error => log('prefetch failed', error?.code || 'ERROR'));
    send(res, 201, await adminView(link));
  }

  async function streamBlob(req, res, link) {
    if (!live(link)) return fail(res, 410, 'ENDED', 'This link has ended.');
    const reserved = inflight.get(link.id) ?? 0;
    if (link.maxDownloads !== null && link.downloads + reserved >= link.maxDownloads) return fail(res, 410, 'LIMIT', 'This link has no downloads left.');
    inflight.set(link.id, reserved + 1);
    let unpin = null, settled = false;
    const settle = () => { if (settled) return; settled = true; unpin?.(); const left = (inflight.get(link.id) ?? 1) - 1; if (left > 0) inflight.set(link.id, left); else inflight.delete(link.id); };
    try {
      const file = await cache.ensure(link);
      unpin = cache.pin(link.layer);
      if (!live(link)) { settle(); return fail(res, 410, 'ENDED', 'This link has ended.'); }
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'application/octet-stream', 'Content-Length': link.size, 'Cache-Control': 'no-store' });
      let sent = 0;
      const stream = createReadStream(file);
      stream.on('data', chunk => { sent += chunk.length; });
      stream.on('error', () => { settle(); res.destroy(); });
      res.on('close', async () => {
        const complete = res.writableFinished && sent === link.size;
        settle();
        if (!complete) return;
        try { const counted = await links.countDownload(link.id); if (counted?.state === 'ended') await release(counted); }
        catch (error) { log('download count failed', error?.code || 'ERROR'); }
      });
      stream.pipe(res);
    } catch (error) {
      settle();
      if (error?.code === 'NOT_FOUND') { await endLink(link.id, 'missing'); return fail(res, 410, 'MISSING', 'The file was removed from Docker Hub by the person who shared it.'); }
      log('blob failed', error?.code || 'ERROR');
      return fail(res, 502, 'UPSTREAM', 'The file could not be fetched right now. Try again in a minute.');
    }
  }

  /** The header and first encrypted chunk only, so the page can show the file name. It is not a download. */
  async function streamHead(res, link) {
    if (!live(link)) return fail(res, 410, 'ENDED', 'This link has ended.');
    let unpin = null;
    try {
      const file = await cache.ensure(link);
      unpin = cache.pin(link.layer);
      const handle = await fs.open(file, 'r');
      try {
        const header = Buffer.alloc(21);
        await handle.read(header, 0, 21, 0);
        const chunk = Math.min(Math.max(header.readUInt32BE(10), 4096), 16 * 1024 * 1024);
        const length = Math.min(link.size, 21 + chunk + 16);
        const bytes = Buffer.alloc(length);
        await handle.read(bytes, 0, length, 0);
        send(res, 200, bytes, 'application/octet-stream');
      } finally { await handle.close(); }
    } catch (error) {
      if (error?.code === 'NOT_FOUND') { await endLink(link.id, 'missing'); return fail(res, 410, 'MISSING', 'The file was removed from Docker Hub by the person who shared it.'); }
      return fail(res, 502, 'UPSTREAM', 'The file could not be fetched right now. Try again in a minute.');
    } finally { unpin?.(); }
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const route = url.pathname;
    if (req.method === 'GET' && route === '/api/health') return send(res, 200, { ok: true, service: 'material-file-encryptor-hosting', version, uptimeSeconds: Math.floor((now() - startedAt) / 1000) });
    if (req.method === 'GET' && ASSETS.has(route)) { const [name, type] = ASSETS.get(route); return send(res, 200, pages.get(name), type, { 'Cache-Control': 'no-cache' }); }
    let match;
    if (req.method === 'GET' && (match = /^\/d\/([A-Za-z0-9_-]{22})\/?$/.exec(route))) return send(res, 200, pages.get(DOWNLOAD_PAGE), 'text/html; charset=utf-8');
    if (req.method === 'GET' && (match = /^\/api\/links\/([A-Za-z0-9_-]{22})$/.exec(route))) {
      const link = links.get(match[1]);
      if (!link) return fail(res, 404, 'NOT_FOUND', 'This link does not exist.');
      if (!live(link)) return send(res, 410, { error: { code: 'ENDED', message: 'This link has ended.' }, endedReason: link.state === 'active' ? 'expired' : link.endedReason });
      return send(res, 200, publicView(link));
    }
    if (req.method === 'GET' && (match = /^\/api\/links\/([A-Za-z0-9_-]{22})\/head$/.exec(route))) {
      const link = links.get(match[1]);
      if (!link) return fail(res, 404, 'NOT_FOUND', 'This link does not exist.');
      return streamHead(res, link);
    }
    if (req.method === 'GET' && (match = /^\/api\/links\/([A-Za-z0-9_-]{22})\/blob$/.exec(route))) {
      const link = links.get(match[1]);
      if (!link) return fail(res, 404, 'NOT_FOUND', 'This link does not exist.');
      return streamBlob(req, res, link);
    }
    if (route.startsWith('/api/admin/')) {
      if (!authorized(req, res)) return;
      if (req.method === 'GET' && route === '/api/admin/status') return send(res, 200, { version, uptimeSeconds: Math.floor((now() - startedAt) / 1000), cache: await cache.usage(), links: { active: links.active().length, total: links.all().length } });
      if (req.method === 'GET' && route === '/api/admin/links') return send(res, 200, { links: await Promise.all(links.all().sort((a, b) => b.createdAt - a.createdAt).map(adminView)) });
      if (req.method === 'POST' && route === '/api/admin/links') return createLink(req, res);
      if (req.method === 'DELETE' && (match = /^\/api\/admin\/links\/([A-Za-z0-9_-]{22})$/.exec(route))) {
        if (!LINK_ID.test(match[1]) || !links.get(match[1])) return fail(res, 404, 'NOT_FOUND', 'No such link.');
        const link = await endLink(match[1], 'ended');
        if (url.searchParams.get('forget') === '1') { await links.remove(match[1]); return send(res, 200, { removed: true }); }
        return send(res, 200, await adminView(link));
      }
      return fail(res, 404, 'NOT_FOUND', 'Unknown admin request.');
    }
    return fail(res, 404, 'NOT_FOUND', 'Not found.');
  }

  return {
    async handle(req, res) {
      try { await handle(req, res); }
      catch (error) {
        if (res.headersSent) { res.destroy(); return; }
        if (error?.status) return fail(res, error.status, 'INVALID', error.message);
        if (['NOT_FOUND', 'FOREIGN_REPOSITORY', 'REGISTRY_UNVERIFIED', 'PROVIDER_UNAVAILABLE', 'FULL'].includes(error?.code)) return fail(res, error.code === 'PROVIDER_UNAVAILABLE' ? 502 : 400, error.code, error.message);
        log('request failed', error?.code || error?.name || 'ERROR');
        fail(res, 500, 'FAILED', 'The request failed.');
      }
    },
    /** Ends expired links and frees their cache. */
    async sweep() { for (const link of await links.sweep()) await release(link); await cache.trim(); }
  };
}
