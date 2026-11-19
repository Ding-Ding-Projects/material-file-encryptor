import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { openLinkStore } from './link-store.js';
import { createBlobCache } from './blob-cache.js';
import { createRegistryReader } from './registry-fetch.js';

/**
 * Configuration (environment):
 *   PORT               listening port inside the container (default 8080)
 *   DATA_DIR           links.json and the cache folder (default /data)
 *   ADMIN_TOKEN_FILE   file holding the admin key the desktop app uses (preferred), or ADMIN_TOKEN
 *   CACHE_MAX_GB       cache size limit in GB (default 10)
 *   TEST_REGISTRY      only for tests: an http://127.0.0.1 registry with no token service
 */
const version = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const env = process.env;
const port = Number(env.PORT || 8080);
const dataDir = path.resolve(env.DATA_DIR || '/data');
const adminToken = (env.ADMIN_TOKEN_FILE ? fs.readFileSync(env.ADMIN_TOKEN_FILE, 'utf8') : env.ADMIN_TOKEN || '').trim();
const cacheMax = Math.round(Math.min(Math.max(Number(env.CACHE_MAX_GB || 10), 0.1), 10000) * 1024 ** 3);
const log = (...parts) => console.log(new Date().toISOString(), ...parts);

let registry;
if (env.TEST_REGISTRY) {
  const target = new URL(env.TEST_REGISTRY);
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(target.hostname)) throw Error('TEST_REGISTRY must be a loopback address.');
  registry = { endpoint: target.origin, auth: null, service: null };
}

if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw Error('PORT is not valid.');
const reader = createRegistryReader(registry ? { registry } : {});
const links = await openLinkStore({ file: path.join(dataDir, 'links.json') });
const cache = createBlobCache({ directory: path.join(dataDir, 'cache'), maxBytes: cacheMax, reader });
const app = createApp({ links, cache, reader, adminToken, version, log });

const server = http.createServer((req, res) => { void app.handle(req, res); });
server.requestTimeout = 0; server.headersTimeout = 30000;
server.listen(port, '0.0.0.0', () => log(`file hosting ${version} listening on ${port}`));
await app.sweep();
const timer = setInterval(() => { app.sweep().catch(error => log('sweep failed', error?.code || 'ERROR')); }, 60000);
const stop = () => { clearInterval(timer); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
