import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Reads one encrypted share from a public Docker Hub repository, anonymously, and writes its layer to disk.
 * Only repositories named <account>/material-file-encryptor-shares are accepted, the manifest is fetched by digest
 * and checked byte for byte, and the layer is hashed while it streams so a changed or cut-off file never lands in
 * the cache. The server never holds a key: the blob is ciphertext and stays that way.
 */
export const SHARE_REPOSITORY = /^[a-z0-9][a-z0-9_-]{1,38}\/material-file-encryptor-shares$/;
export const DIGEST = /^sha256:[a-f0-9]{64}$/;
const MANIFEST_TYPE = 'application/vnd.oci.image.manifest.v1+json';
const CONFIG_TYPE = 'application/vnd.material-file-encryptor.share.v1+json';
const LAYER_TYPE = 'application/vnd.material-file-encryptor.share.v1.encrypted';
const CONFIG = Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'encrypted-file-share' }));
const MAX_MANIFEST = 64 * 1024;

export function registryError(code, message) { const error = Error(message); error.code = code; return error; }
const unverified = () => registryError('REGISTRY_UNVERIFIED', 'The shared file could not be verified on Docker Hub.');
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));

async function readLimited(response, limit) {
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) throw unverified(); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

/**
 *   registry   { endpoint: 'https://registry-1.docker.io', auth: 'https://auth.docker.io/token', service: 'registry.docker.io' }
 *              Tests point endpoint at a loopback fake and set auth to null.
 */
export function createRegistryReader({ registry = { endpoint: 'https://registry-1.docker.io', auth: 'https://auth.docker.io/token', service: 'registry.docker.io' }, fetcher = fetch, maxBlobBytes = 1024 ** 3 + 1024 * 1024, timeoutMs = 30000 } = {}) {
  const signalFor = signal => signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  async function token(repository, signal) {
    if (!registry.auth) return {};
    const url = new URL(registry.auth);
    url.searchParams.set('service', registry.service); url.searchParams.set('scope', `repository:${repository}:pull`);
    let response;
    try { response = await fetcher(url, { redirect: 'error', cache: 'no-store', signal: signalFor(signal) }); } catch { throw registryError('PROVIDER_UNAVAILABLE', 'Docker Hub could not be reached.'); }
    if (!response.ok) throw registryError('PROVIDER_UNAVAILABLE', 'Docker Hub refused an anonymous download token.');
    const parsed = JSON.parse((await readLimited(response, 65536)).toString('utf8'));
    const value = parsed.token || parsed.access_token;
    if (typeof value !== 'string' || !value || value.length > 16384 || /[\s\x00-\x1f\x7f]/.test(value)) throw unverified();
    return { Authorization: `Bearer ${value}` };
  }
  function check(repository, digest) {
    if (!SHARE_REPOSITORY.test(repository || '')) throw registryError('FOREIGN_REPOSITORY', 'Only Material File Encryptor share repositories can be hosted.');
    if (!DIGEST.test(digest || '')) throw registryError('INVALID', 'The share digest is not valid.');
  }
  async function get(repository, path, headers, signal, accept) {
    let response;
    try { response = await fetcher(`${registry.endpoint}/v2/${repository}/${path}`, { headers: { ...headers, ...(accept ? { Accept: accept } : {}) }, redirect: 'manual', cache: 'no-store', signal: signalFor(signal) }); }
    catch { throw registryError('PROVIDER_UNAVAILABLE', 'Docker Hub could not be reached.'); }
    // Blobs redirect to a storage host. Follow one hop without the registry token: it must never leave Docker Hub.
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw unverified();
      const target = new URL(location, registry.endpoint);
      if (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(target.hostname))) throw unverified();
      try { response = await fetcher(target, { redirect: 'error', cache: 'no-store', signal: signalFor(signal) }); }
      catch { throw registryError('PROVIDER_UNAVAILABLE', 'The Docker Hub storage host could not be reached.'); }
    }
    if (response.status === 404 || response.status === 401) { await response.body?.cancel().catch(() => {}); throw registryError('NOT_FOUND', 'The shared file is no longer on Docker Hub.'); }
    if (!response.ok) { await response.body?.cancel().catch(() => {}); throw registryError('PROVIDER_UNAVAILABLE', 'Docker Hub did not return the shared file.'); }
    return response;
  }

  /** Resolves and checks the manifest. Returns the layer descriptor { digest, size }. */
  async function inspect(repository, digest, signal) {
    check(repository, digest);
    const headers = await token(repository, signal);
    const raw = await readLimited(await get(repository, `manifests/${digest}`, headers, signal, MANIFEST_TYPE), MAX_MANIFEST);
    if ('sha256:' + createHash('sha256').update(raw).digest('hex') !== digest) throw unverified();
    let manifest; try { manifest = JSON.parse(raw.toString('utf8')); } catch { throw unverified(); }
    const descriptor = (value, type, max) => exact(value, ['mediaType', 'digest', 'size']) && value.mediaType === type && DIGEST.test(value.digest) && Number.isSafeInteger(value.size) && value.size >= 0 && value.size <= max;
    if (!exact(manifest, ['schemaVersion', 'mediaType', 'config', 'layers']) || manifest.schemaVersion !== 2 || manifest.mediaType !== MANIFEST_TYPE ||
        !descriptor(manifest.config, CONFIG_TYPE, 4096) || !Array.isArray(manifest.layers) || manifest.layers.length !== 1 || !descriptor(manifest.layers[0], LAYER_TYPE, maxBlobBytes)) throw unverified();
    const config = await readLimited(await get(repository, `blobs/${manifest.config.digest}`, headers, signal), 4096);
    if (!config.equals(CONFIG)) throw unverified();
    return { headers, layer: { digest: manifest.layers[0].digest, size: manifest.layers[0].size } };
  }

  /** Streams the layer into `file` (written as file + '.part', renamed only after the hash and size match). */
  async function download(repository, digest, file, signal) {
    const { headers, layer } = await inspect(repository, digest, signal);
    const response = await get(repository, `blobs/${layer.digest}`, headers, signal);
    const part = file + '.part';
    const hash = createHash('sha256'); let size = 0;
    const counted = async function* (source) {
      for await (const chunk of source) { size += chunk.length; if (size > layer.size) throw unverified(); hash.update(chunk); yield chunk; }
    };
    try {
      await pipeline(Readable.fromWeb(response.body), counted, createWriteStream(part, { mode: 0o600 }), { signal });
      if (size !== layer.size || 'sha256:' + hash.digest('hex') !== layer.digest) throw unverified();
      await fs.rename(part, file);
    } catch (error) { await fs.rm(part, { force: true }).catch(() => {}); throw error?.code ? error : unverified(); }
    return layer;
  }
  return { inspect: (repository, digest, signal) => inspect(repository, digest, signal).then(result => result.layer), download };
}
