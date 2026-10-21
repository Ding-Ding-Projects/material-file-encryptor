import { createHash, randomUUID } from 'node:crypto';

const OCI = 'application/vnd.oci.image.manifest.v1+json';
const CONFIG = 'application/vnd.material-file-encryptor.snapshot.v1+json';
const LAYER = 'application/vnd.material-file-encryptor.encrypted-object.v1';
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const TAG = /^mfe-[a-f0-9]{32}-[a-f0-9]{32}$/;
const OBJECT = /^(?:vault\.json|(?:parts|commits|activity)\/(?:[a-f0-9]{32}|[a-f0-9]{64})\.mfe)$/;
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
const fail = () => Error('Encrypted registry operation could not be verified. Local data is unchanged.');

/** HTTP test endpoints are admitted only by an explicit main-process test capability. */
export function registryDestination({ endpoint = 'https://registry-1.docker.io', repository, testOnly = false }) {
  const url = new URL(endpoint);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (testOnly ? !loopback || url.protocol !== 'http:' : url.origin !== 'https://registry-1.docker.io')) throw fail();
  if (typeof repository !== 'string' || repository.length > 220 ||
      !/^[a-z0-9][a-z0-9_-]{1,38}\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/.test(repository)) throw fail();
  return Object.freeze({ endpoint: url.origin, repository, testOnly });
}

async function bounded(response, limit, signal) {
  if (Number(response.headers.get('content-length') || 0) > limit) throw fail();
  const reader = response.body?.getReader(); if (!reader) throw fail();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > limit) throw fail(); chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => {}); }
}

function descriptor(mediaType, bytes) { return { mediaType, digest: sha(bytes), size: bytes.length }; }
function validDescriptor(value, mediaType, max) {
  return value && value.mediaType === mediaType && DIGEST.test(value.digest) &&
    Number.isSafeInteger(value.size) && value.size >= 0 && value.size <= max;
}
export function validateRegistrySnapshot(value) {
  if (!exact(value, ['schemaVersion', 'kind', 'vaultId', 'deviceId', 'parents', 'files']) || value.schemaVersion !== 1 || value.kind !== 'encrypted-vault-registry-snapshot' ||
      !/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/.test(value.vaultId) || !/^[a-f0-9]{32}$/.test(value.deviceId) ||
      !Array.isArray(value.parents) || value.parents.length > 4096 || new Set(value.parents).size !== value.parents.length || value.parents.some(x => !DIGEST.test(x)) ||
      !Array.isArray(value.files) || value.files.length < 1 || value.files.length > 100000) throw fail();
  const names = new Set(); let total = 0;
  for (const file of value.files) {
    if (!exact(file, ['path', 'mediaType', 'digest', 'size']) || !OBJECT.test(file.path) || names.has(file.path) || !validDescriptor(file, LAYER, 1024 ** 3)) throw fail();
    names.add(file.path); total += file.size;
  }
  if (!names.has('vault.json') || total > 100 * 1024 ** 3) throw fail();
  return value;
}

/** An OCI registry stores each ciphertext object as an independently verifiable layer.
 * Unique snapshot references preserve concurrent heads; no shared mutable tag is used.
 * authorize is main-owned, checks repository privacy, and returns only request headers.
 */
export function createRegistryStorage({ destination, authorize, fetcher = fetch, maxObjectBytes = 1024 ** 3 }) {
  const target = registryDestination(destination);
  if (!Number.isSafeInteger(maxObjectBytes) || maxObjectBytes < 1 || maxObjectBytes > 1024 ** 3) throw fail();
  const base = `${target.endpoint}/v2/${target.repository}`;
  if (!target.testOnly && typeof authorize !== 'function') throw fail();
  let credentials = null, credentialsAt = 0;
  async function authorization(signal, force = false) {
    if (target.testOnly) return {};
    if (force || !credentials || Date.now() - credentialsAt > 30000) { credentials = await authorize(target.repository, signal); credentialsAt = Date.now(); }
    return credentials;
  }
  async function request(url, options = {}, signal) {
    const parsed = new URL(url, target.endpoint);
    if (parsed.origin !== target.endpoint || !parsed.pathname.startsWith(`/v2/${target.repository}/`)) throw fail();
    signal?.throwIfAborted();
    const headers = await authorization(signal);
    const { allowNotFound, ...fetchOptions } = options;
    const result = await fetcher(parsed, { ...fetchOptions, headers: { ...headers, ...options.headers },
      redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000) });
    if (!result.ok && !(allowNotFound && result.status === 404)) { await result.body?.cancel(); throw fail(); }
    return result;
  }
  async function json(url, options, signal) {
    const result = await request(url, options, signal);
    try { return JSON.parse((await bounded(result, 32 * 1024 ** 2, signal)).toString('utf8')); }
    catch { throw fail(); }
  }
  async function putBlob(bytes, mediaType, signal) {
    const item = descriptor(mediaType, bytes);
    const begin = await request(`${base}/blobs/uploads/`, { method: 'POST', body: '' }, signal);
    const location = begin.headers.get('location'); await begin.body?.cancel();
    if (!location) throw fail();
    const upload = new URL(location, target.endpoint);
    if (upload.origin !== target.endpoint || !upload.pathname.startsWith(`/v2/${target.repository}/blobs/uploads/`)) throw fail();
    upload.searchParams.set('digest', item.digest);
    const done = await request(upload.href, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'application/octet-stream' } }, signal);
    const reported = done.headers.get('docker-content-digest'); await done.body?.cancel();
    if (reported && reported !== item.digest) throw fail();
    return item;
  }
  async function getBlob(item, type, signal) {
    if (!validDescriptor(item, type, maxObjectBytes)) throw fail();
    const response = await request(`${base}/blobs/${item.digest}`, {}, signal);
    const bytes = await bounded(response, Math.min(item.size, maxObjectBytes), signal);
    if (bytes.length !== item.size || sha(bytes) !== item.digest) throw fail();
    return bytes;
  }
  async function readRevision(digest, signal) {
    if (!DIGEST.test(digest)) throw fail();
    const response = await request(`${base}/manifests/${digest}`, { headers: { Accept: OCI } }, signal);
    const raw = await bounded(response, 32 * 1024 ** 2, signal);
    if (sha(raw) !== digest) throw fail();
    let manifest; try { manifest = JSON.parse(raw); } catch { throw fail(); }
    if (manifest.schemaVersion !== 2 || manifest.mediaType !== OCI || !validDescriptor(manifest.config, CONFIG, 32 * 1024 ** 2) || !Array.isArray(manifest.layers)) throw fail();
    let config; try { config = validateRegistrySnapshot(JSON.parse(await getBlob(manifest.config, CONFIG, signal))); } catch { throw fail(); }
    if (manifest.layers.length !== config.files.length || manifest.layers.some((item, i) =>
      !validDescriptor(item, LAYER, maxObjectBytes) || item.digest !== config.files[i].digest || item.size !== config.files[i].size)) throw fail();
    return { digest, snapshot: config };
  }
  return {
    target,
    async publish({ vaultId, deviceId, parents = [], files, readFile }, signal) {
      signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(3600000)]) : AbortSignal.timeout(3600000);
      // Capture caller-owned metadata before asynchronous authorization or upload.
      const frozen = structuredClone({ vaultId, deviceId, parents, files });
      const config = { schemaVersion: 1, kind: 'encrypted-vault-registry-snapshot', vaultId: frozen.vaultId,
        deviceId: frozen.deviceId, parents: frozen.parents, files: [] };
      if (!/^[a-f0-9]{32}$/.test(frozen.deviceId) || !Array.isArray(frozen.files)) throw fail();
      const expected = { ...config, files: frozen.files.map(file => ({ path: file.path, mediaType: LAYER, digest: `sha256:${file.sha256}`, size: file.bytes })) };
      validateRegistrySnapshot(expected);
      if (expected.files.some(file => file.size > maxObjectBytes)) throw fail();
      await authorization(signal, true);
      for (const file of frozen.files) {
        if (!OBJECT.test(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > maxObjectBytes || !/^[a-f0-9]{64}$/.test(file.sha256)) throw fail();
        const bytes = await readFile(file.path, signal);
        if (!(bytes instanceof Uint8Array) || bytes.length !== file.bytes || sha(bytes) !== `sha256:${file.sha256}`) throw fail();
        config.files.push({ path: file.path, ...await putBlob(bytes, LAYER, signal) });
      }
      validateRegistrySnapshot(config);
      const configuration = Buffer.from(JSON.stringify(config));
      const manifest = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: OCI,
        config: await putBlob(configuration, CONFIG, signal), layers: config.files.map(({ path, ...item }) => item) }));
      const digest = sha(manifest), tag = `mfe-${frozen.deviceId}-${randomUUID().replaceAll('-', '')}`;
      await authorization(signal, true);
      const result = await request(`${base}/manifests/${tag}`, { method: 'PUT', body: manifest, headers: { 'Content-Type': OCI } }, signal);
      await result.body?.cancel();
      // Verify immutable bytes, then verify the advertised tag points to the same bytes.
      await readRevision(digest, signal);
      const check = await request(`${base}/manifests/${tag}`, { headers: { Accept: OCI } }, signal);
      if (sha(await bounded(check, 32 * 1024 ** 2, signal)) !== digest) throw fail();
      return { digest, tag, repository: target.repository, verified: true };
    },
    async list(signal) {
      signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(3600000)]) : AbortSignal.timeout(3600000);
      await authorization(signal, true);
      const tags = new Set(); let url = `${base}/tags/list?n=100`; const pages = new Set();
      for (let page = 0; url; page++) {
        if (page >= 10 || pages.has(url)) throw fail(); pages.add(url);
        const response = await request(url, { allowNotFound: page === 0 }, signal);
        if (response.status === 404) { await response.body?.cancel(); return []; }
        const link = response.headers.get('link');
        let body; try { body = JSON.parse(await bounded(response, 1024 ** 2, signal)); } catch { throw fail(); }
        if (body.name !== target.repository || (body.tags !== null && !Array.isArray(body.tags))) throw fail();
        for (const tag of body.tags || []) { if (TAG.test(tag)) tags.add(tag); }
        if (tags.size > 1000) throw Error('Snapshot catalogue exceeds this client limit. Narrow the repository before retrying.');
        if (link && !/^<[^>]+>;\s*rel="next"$/.test(link)) throw fail();
        url = link ? new URL(link.match(/^<([^>]+)>/)[1], target.endpoint).href : null;
      }
      const revisions = []; let metadataBytes = 0;
      for (const tag of [...tags].sort()) {
        const response = await request(`${base}/manifests/${tag}`, { headers: { Accept: OCI } }, signal);
        const raw = await bounded(response, 32 * 1024 ** 2, signal);
        const revision = await readRevision(sha(raw), signal);
        metadataBytes += Buffer.byteLength(JSON.stringify(revision.snapshot)) + raw.length;
        if (metadataBytes > 64 * 1024 ** 2) throw Error('Snapshot catalogue exceeds the metadata limit.');
        const { files, ...summary } = revision.snapshot;
        revisions.push({ digest: revision.digest, snapshot: { ...summary, fileCount: files.length }, tag });
      }
      return revisions;
    },
    readRevision,
    async download(digest, writeFile, signal) {
      signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(3600000)]) : AbortSignal.timeout(3600000);
      await authorization(signal, true);
      const revision = await readRevision(digest, signal);
      for (const file of revision.snapshot.files) await writeFile(file.path, await getBlob(file, LAYER, signal), signal);
      return revision;
    },
  };
}
