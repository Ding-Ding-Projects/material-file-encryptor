import { randomBytes } from 'node:crypto';
import { createRegistryStorage } from '../registry-storage.js';

/**
 * Shared files are single-layer OCI artifacts in the account's public material-file-encryptor-shares repository.
 * The config blob is a fixed, content-free description; the one layer is the encrypted share. Neither the
 * manifest nor the config carries a file name or any annotation, so the registry sees only the blob size.
 * Tags are share-<32 hex>, which the drive snapshot listing (mfe-<device>-<revision>) never matches.
 */
export const SHARE_MANIFEST_TYPE = 'application/vnd.oci.image.manifest.v1+json';
export const SHARE_CONFIG_TYPE = 'application/vnd.material-file-encryptor.share.v1+json';
export const SHARE_LAYER_TYPE = 'application/vnd.material-file-encryptor.share.v1.encrypted';
export const SHARE_TAG = /^share-[a-f0-9]{32}$/;
const CONFIG = Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'encrypted-file-share' }));
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
const fail = () => { const error = Error('The shared file could not be verified on Docker Hub.'); error.code = 'REGISTRY_UNVERIFIED'; return error; };

export function newShareTag(random = randomBytes) { return 'share-' + random(16).toString('hex'); }

function validManifest(raw, maxObjectBytes) {
  let manifest; try { manifest = JSON.parse(Buffer.from(raw).toString('utf8')); } catch { throw fail(); }
  const descriptor = (value, type, max) => exact(value, ['mediaType', 'digest', 'size']) && value.mediaType === type && DIGEST.test(value.digest) && Number.isSafeInteger(value.size) && value.size >= 0 && value.size <= max;
  if (!exact(manifest, ['schemaVersion', 'mediaType', 'config', 'layers']) || manifest.schemaVersion !== 2 || manifest.mediaType !== SHARE_MANIFEST_TYPE ||
      !descriptor(manifest.config, SHARE_CONFIG_TYPE, 4096) || !Array.isArray(manifest.layers) || manifest.layers.length !== 1 || !descriptor(manifest.layers[0], SHARE_LAYER_TYPE, maxObjectBytes)) throw fail();
  return manifest;
}

/** Uploads one encrypted share and verifies that its tag resolves to the uploaded manifest. */
export async function publishShare({ storage, ciphertext, tag = newShareTag(), signal }) {
  if (!SHARE_TAG.test(tag)) throw fail();
  const config = await storage.artifacts.putBlob(CONFIG, SHARE_CONFIG_TYPE, signal);
  const layer = await storage.artifacts.putBlob(ciphertext, SHARE_LAYER_TYPE, signal);
  const manifest = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: SHARE_MANIFEST_TYPE, config, layers: [layer] }));
  const digest = await storage.artifacts.putManifest(tag, manifest, signal);
  // Read back by digest and by tag; both must be the bytes just written.
  const byDigest = await storage.artifacts.getManifest(digest, signal);
  const byTag = await storage.artifacts.getManifest(tag, signal);
  if (!Buffer.from(byDigest).equals(manifest) || !Buffer.from(byTag).equals(manifest)) throw fail();
  return { digest, tag, repository: storage.target.repository, size: layer.size };
}

/** Downloads one share by manifest digest. The manifest, config and layer are all verified by digest and size. */
export async function fetchShare({ storage, digest, maxObjectBytes = 1024 ** 3, signal }) {
  if (!DIGEST.test(digest)) throw fail();
  try { return await fetchVerified(storage, digest, maxObjectBytes, signal); }
  catch (error) { if (signal?.aborted || ['NOT_FOUND', 'PROVIDER_UNAVAILABLE'].includes(error?.code)) throw error; throw fail(); }
}
async function fetchVerified(storage, digest, maxObjectBytes, signal) {
  const manifest = validManifest(await storage.artifacts.getManifest(digest, signal), maxObjectBytes);
  const config = await storage.artifacts.getBlob(manifest.config, SHARE_CONFIG_TYPE, signal);
  if (!Buffer.from(config).equals(CONFIG)) throw fail();
  return storage.artifacts.getBlob(manifest.layers[0], SHARE_LAYER_TYPE, signal);
}

/**
 * Docker Hub gives anyone a pull token for a public repository. No account, sign-in or stored credential is
 * used; the token is held only for this download.
 */
export function anonymousPullAuthorization({ fetcher = fetch } = {}) {
  return async (repository, signal) => {
    if (typeof repository !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,38}\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/.test(repository)) throw fail();
    const url = new URL('https://auth.docker.io/token');
    url.searchParams.set('service', 'registry.docker.io'); url.searchParams.set('scope', `repository:${repository}:pull`);
    let response;
    try {
      response = await fetcher(url, { redirect: 'error', cache: 'no-store', credentials: 'omit', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
      if (!response.ok) throw Error();
      const reader = response.body.getReader(); const chunks = []; let bytes = 0;
      try { for (;;) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength; if (bytes > 65536) throw Error(); chunks.push(item.value); } }
      finally { await reader.cancel().catch(() => {}); }
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const token = parsed.token || parsed.access_token;
      if (typeof token !== 'string' || !token || token.length > 16384 || /[\s\x00-\x1f\x7f]/.test(token)) throw Error();
      return { Authorization: `Bearer ${token}` };
    } catch { if (signal?.aborted) throw signal.reason; const error = Error('Docker Hub could not be reached to download the shared file.'); error.code = 'PROVIDER_UNAVAILABLE'; throw error; }
  };
}

/** A registry client for the share repository: signed in for publishing, anonymous for receiving. */
export function shareStorage({ repository, authorize, testDestination = null, fetcher, maxObjectBytes, factory = createRegistryStorage }) {
  const destination = testDestination ? { ...testDestination, repository, visibility: 'public' } : { repository, visibility: 'public' };
  return factory({ destination, authorize, ...(fetcher ? { fetcher } : {}), ...(maxObjectBytes ? { maxObjectBytes } : {}) });
}
