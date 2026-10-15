import {createHash} from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

/** Shared bounded HTTP helpers for the flavor catalogues and the plugin repositories.
 * Every request is HTTPS only, limited to an exact host allow list, never follows an unlisted redirect, has a hard
 * response size ceiling and a timeout. The fetch implementation is always injectable so tests never touch a network. */
export const USER_AGENT = 'Ding-Ding-Projects/material-file-encryptor (server-manager)';
export const MAX_JSON_BYTES = 8 * 1024 * 1024;
export const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 30000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

export function assertAllowedUrl(value, hosts) {
  let url;
  try { url = new URL(value); } catch { throw Error('Untrusted server source.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !hosts.includes(url.hostname)) throw Error('Untrusted server source.');
  return url;
}

function combine(signal, ms) {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** Fetches with manual redirect handling so a redirect can only land on another allowed host. */
async function allowedFetch(fetchImpl, value, hosts, {signal, ms, headers = {}} = {}) {
  let current = assertAllowedUrl(value, hosts).href;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetchImpl(current, {redirect: 'manual', signal: combine(signal, ms), headers: {'user-agent': USER_AGENT, ...headers}});
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers?.get?.('location');
      if (!location) throw Error('Server source redirect is invalid.');
      current = assertAllowedUrl(new URL(location, current).href, hosts).href;
      continue;
    }
    return response;
  }
  throw Error('Server source redirected too many times.');
}

async function readBounded(response, maxBytes, signal) {
  const length = response.headers?.get?.('content-length');
  if (length !== null && length !== undefined && Number(length) > maxBytes) throw Error('Server source response exceeds its size bound.');
  if (!response.body) throw Error('Server source returned no body.');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    signal?.throwIfAborted();
    size += chunk.byteLength;
    if (size > maxBytes) throw Error('Server source response exceeds its size bound.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function fetchJson(fetchImpl, value, hosts, {signal, maxBytes = MAX_JSON_BYTES, headers} = {}) {
  const response = await allowedFetch(fetchImpl, value, hosts, {signal, ms: REQUEST_TIMEOUT_MS, headers});
  if (!response.ok) throw Error('Server source is unavailable.');
  const body = await readBounded(response, maxBytes, signal);
  try { return JSON.parse(body.toString('utf8')); } catch { throw Error('Server source returned invalid JSON.'); }
}

export async function fetchText(fetchImpl, value, hosts, {signal, maxBytes = 4096} = {}) {
  const response = await allowedFetch(fetchImpl, value, hosts, {signal, ms: REQUEST_TIMEOUT_MS});
  if (response.status === 404) return null;
  if (!response.ok) throw Error('Server source is unavailable.');
  return (await readBounded(response, maxBytes, signal)).toString('utf8');
}

const DIGEST_LENGTH = {md5: 32, sha1: 40, sha256: 64, sha512: 128};
export const digestLength = algorithm => DIGEST_LENGTH[algorithm];

/** Streams a download to `destination`, enforcing the byte ceiling while writing and comparing the upstream digest
 * (when the source published one). The SHA-256 of the received bytes is always computed so the caller can pin it. */
export async function downloadToFile(fetchImpl, value, hosts, destination, {signal, maxBytes, hashAlgorithm = null, hash = null, expectedSize = null, onProgress} = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw Error('A download size bound is required.');
  if (hash !== null && (!DIGEST_LENGTH[hashAlgorithm] || !new RegExp('^[a-f0-9]{' + DIGEST_LENGTH[hashAlgorithm] + '}$').test(hash))) throw Error('Upstream digest is malformed.');
  const response = await allowedFetch(fetchImpl, value, hosts, {signal, ms: DOWNLOAD_TIMEOUT_MS});
  if (!response.ok || !response.body) throw Error('Server download is unavailable.');
  const length = response.headers?.get?.('content-length');
  if (length !== null && length !== undefined && Number(length) > maxBytes) throw Error('Server download exceeds its size bound.');
  const upstream = hashAlgorithm && hash ? createHash(hashAlgorithm) : null, sha256 = createHash('sha256');
  const file = await fsp.open(destination, 'wx');
  let size = 0;
  try {
    for await (const chunk of response.body) {
      signal?.throwIfAborted();
      size += chunk.byteLength;
      if (size > maxBytes || expectedSize !== null && size > expectedSize) throw Error('Server download exceeds its size bound.');
      upstream?.update(chunk); sha256.update(chunk);
      await file.writeFile(chunk);
      onProgress?.(size);
    }
    await file.sync();
  } finally { await file.close(); }
  const fail = async message => { await fsp.rm(destination, {force: true}); throw Error(message); };
  if (expectedSize !== null && size !== expectedSize) await fail('Server download size differs from its metadata.');
  if (upstream && upstream.digest('hex') !== hash) await fail('Server download integrity mismatch.');
  return {size, sha256: sha256.digest('hex'), upstreamVerified: upstream !== null, hashAlgorithm: upstream ? hashAlgorithm : null};
}

export async function sha256OfFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
