import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { parseStrictJson } from '../shared/personal-vocabulary.js';
import { validateRequest } from './validation.js';

export const LOCAL_ADAPTER_ACTIONS = Object.freeze(['getState', 'mount', 'unmount', 'chooseFiles', 'chooseExport', 'importSelected', 'fileAction', 'lockVault', 'openExplorer', 'openFile', 'exportFile', 'keepOffline', 'releaseOffline', 'setPartSize', 'resplit', 'sync', 'listVersions', 'saveVersion', 'restoreVersion', 'listDeleted', 'restoreDeleted', 'emptyRecycleBin', 'setPreferences']);
const trustedOrigin = 'https://ding-ding-projects.github.io';
const equal = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const exact = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
function body(request) {
  return new Promise((resolve, reject) => {
    let bytes = 0, oversized = false;
    const chunks = [];
    request.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 65536) { oversized = true; chunks.length = 0; return; }
      if (!oversized) chunks.push(chunk);
    });
    request.on('end', () => {
      if (oversized) return reject(Object.assign(new Error(), { status: 413 }));
      try { resolve(parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); }
      catch { reject(Object.assign(new Error(), { status: 400 })); }
    });
    request.on('error', reject);
  });
}

// Credentials exist only in this closure. The desktop owns consent and lock events.
export function createLocalAdapter({ allowedOrigins = [trustedOrigin], authorizePair, dispatch, isAuthenticated } = {}) {
  if (!Array.isArray(allowedOrigins) || !allowedOrigins.length || allowedOrigins.some(origin => origin !== trustedOrigin) || typeof authorizePair !== 'function' || typeof dispatch !== 'function' || typeof isAuthenticated !== 'function') throw new Error('Invalid local adapter configuration.');
  const origins = new Set(allowedOrigins), sessions = new Map();
  let server, address = null, code = null, codeExpires = 0, generation = 0, active = 0;
  let rateStart = 0, requests = 0, pairs = 0;
  const revoke = () => { generation++; sessions.clear(); code = null; codeExpires = 0; };
  const authenticated = () => { if (isAuthenticated() !== true) { revoke(); return false; } return true; };
  const reply = (response, status, value) => {
    const data = JSON.stringify(value);
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(data);
  };
  const handle = async (request, response) => {
    const origin = request.headers.origin;
    if (!address || request.headers.host !== new URL(address).host || request.socket.remoteAddress !== '127.0.0.1' || !origins.has(origin)) return reply(response, 403, { error: 'Request rejected.' });
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    if (!['/pair', '/status', '/request'].includes(request.url)) return reply(response, 404, { error: 'Unknown endpoint.' });
    if (request.method === 'OPTIONS') {
      const requested = String(request.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
      if (request.headers['access-control-request-method'] !== 'POST' || requested.some(header => !['content-type', 'authorization'].includes(header))) return reply(response, 403, { error: 'Request rejected.' });
      response.setHeader('Access-Control-Allow-Methods', 'POST');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      response.setHeader('Access-Control-Allow-Private-Network', 'true');
      response.writeHead(204); response.end(); return;
    }
    if (request.method !== 'POST') return reply(response, 405, { error: 'POST required.' });
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] || '')) return reply(response, 415, { error: 'JSON required.' });
    const now = Date.now();
    if (now - rateStart >= 60000) { rateStart = now; requests = 0; pairs = 0; }
    if (++requests > 120 || request.url === '/pair' && ++pairs > 5 || active >= 4) return reply(response, 429, { error: 'Try again later.' });
    active++;
    try {
      const payload = await body(request);
      if (!authenticated()) return reply(response, 401, { error: 'Unlock the desktop profile.' });
      if (request.url === '/pair') {
        if (!exact(payload, ['code']) || !code || Date.now() > codeExpires || !equal(payload.code, code)) return reply(response, 401, { error: 'Pairing code unavailable or invalid.' });
        code = null; codeExpires = 0;
        const pairingGeneration = generation;
        if (await authorizePair({ origin }) !== true || !authenticated() || generation !== pairingGeneration) return reply(response, 403, { error: 'Pairing was not approved.' });
        const token = randomBytes(32).toString('base64url');
        for (const [oldToken, session] of sessions) if (session.expires <= Date.now()) sessions.delete(oldToken);
        if (sessions.size >= 16) sessions.delete(sessions.keys().next().value);
        sessions.set(token, { origin, expires: Date.now() + 15 * 60000 });
        return reply(response, 200, { token, expiresInSeconds: 900 });
      }
      const authorization = request.headers.authorization || '';
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      let session;
      for (const [candidate, value] of sessions) if (equal(token, candidate)) session = value;
      if (!session || session.origin !== origin || Date.now() >= session.expires) return reply(response, 401, { error: 'Pair the desktop again.' });
      if (request.url === '/status') {
        if (!exact(payload, [])) return reply(response, 400, { error: 'Invalid request.' });
        return reply(response, 200, { authenticated: true, actions: LOCAL_ADAPTER_ACTIONS });
      }
      if (!exact(payload, ['action', 'params']) || !LOCAL_ADAPTER_ACTIONS.includes(payload.action)) return reply(response, 400, { error: 'Unsupported action.' });
      const params = validateRequest(payload.action, payload.params);
      const requestGeneration = generation;
      const result = await dispatch(payload.action, params);
      if (payload.action === 'lockVault') revoke();
      if (requestGeneration !== generation || !authenticated()) return reply(response, 401, { error: 'Desktop profile locked.' });
      return reply(response, 200, { result });
    } catch (error) { if (!response.headersSent) reply(response, error.status === 413 ? 413 : 400, { error: 'Request could not be completed.' }); }
    finally { active--; }
  };
  return {
    get address() { return address; },
    pairingCode() {
      if (!address || !authenticated()) throw new Error('Unlock and start the desktop adapter first.');
      code = randomBytes(12).toString('hex'); codeExpires = Date.now() + 120000;
      return { code, expiresAt: codeExpires };
    },
    async start() {
      if (address) return address;
      if (server) throw new Error('Adapter start already pending.');
      server = http.createServer((request,response) => { void handle(request,response); });
      server.requestTimeout = 10000; server.headersTimeout = 5000; server.maxHeadersCount = 32;
      await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
      address = `http://127.0.0.1:${server.address().port}`;
      return address;
    },
    revoke,
    async close() { revoke(); address = null; if (server) { const closing = server; server = null; closing.closeAllConnections(); await new Promise(resolve => closing.close(resolve)); } },
  };
}
