import { createHash, randomUUID } from 'node:crypto';

const OCI = 'application/vnd.oci.image.manifest.v1+json';
const CONFIG = 'application/vnd.material-file-encryptor.snapshot.v1+json';
const LAYER = 'application/vnd.material-file-encryptor.encrypted-object.v1';
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const TAG = /^mfe-[a-f0-9]{32}-[a-f0-9]{32}$/;
const OBJECT = /^(?:vault\.json|(?:parts|commits|activity)\/(?:[a-f0-9]{32}|[a-f0-9]{64})\.mfe)$/;
const BLOB_DELIVERY_ORIGIN = 'https://production.cloudfront.docker.com';
const BLOB_REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_BLOB_REDIRECTS = 3;
export const DRIVE_NAME_ANNOTATION = 'io.material-file-encryptor.drive-name';
/** When the snapshot was published. Retention uses it; older snapshots without it fall back to other sources. */
export const CREATED_ANNOTATION = 'org.opencontainers.image.created';
/** Reads the created annotation: a bounded ISO 8601 UTC time, or null. */
export function snapshotCreatedAt(value) {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const time = Date.parse(value); return Number.isFinite(time) ? time : null;
}
/** The optional drive name label. It is user text visible to anyone who can read the repository. */
export function cleanDriveNameLabel(value) {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFC').trim();
  return text && [...text].length <= 64 && !/[\x00-\x1f\x7f‪-‮⁦-⁩]/.test(text) ? text : null;
}
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
/**
 * Verified snapshots by manifest digest. A digest names immutable bytes, so a snapshot read and checked once never has
 * to be pulled again: every manifest GET counts against the account's Docker Hub pull limit (200 an hour for a
 * personal account), and listing a busy repository before each backup would otherwise spend it in minutes.
 * Bounded by the number of file entries held, oldest first out.
 * The registry sync service owns one cache and hands it to its clients; other callers read without one.
 */
export function createRevisionCache({ fileLimit = 400000 } = {}) {
  const entries = new Map(); let files = 0;
  return Object.freeze({
    get(endpoint, digest) {
      const key = `${endpoint}|${digest}`, value = entries.get(key);
      if (!value) return null;
      entries.delete(key); entries.set(key, value);
      return structuredClone(value);
    },
    set(endpoint, revision) {
      const key = `${endpoint}|${revision.digest}`;
      if (entries.has(key)) return;
      entries.set(key, structuredClone(revision)); files += revision.snapshot.files.length;
      for (const [oldest, value] of entries) {
        if (files <= fileLimit) break;
        entries.delete(oldest); files -= value.snapshot.files.length;
      }
    },
  });
}
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
const fail = () => Error('Encrypted registry operation could not be verified. Local data is unchanged.');

/** HTTP test endpoints are admitted only by an explicit main-process test capability. */
export function registryDestination({ endpoint = 'https://registry-1.docker.io', repository, testOnly = false, visibility = 'public' }) {
  if (!['private', 'public'].includes(visibility)) throw fail();
  const url = new URL(endpoint);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (testOnly ? !loopback || url.protocol !== 'http:' : url.origin !== 'https://registry-1.docker.io')) throw fail();
  if (typeof repository !== 'string' || repository.length > 220 ||
      !/^[a-z0-9][a-z0-9_-]{1,38}\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/.test(repository)) throw fail();
  return Object.freeze({ endpoint: url.origin, repository, testOnly, visibility });
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
 * authorize is main-owned, checks expected repository visibility, and returns only request headers.
 */
export function createRegistryStorage({ destination, authorize, fetcher = fetch, maxObjectBytes = 1024 ** 3, uploadConcurrency = 4, revisionCache = null }) {
  const cachedRevision = (endpoint, digest) => revisionCache?.get(endpoint, digest) ?? null;
  const rememberRevision = (endpoint, revision) => revisionCache?.set(endpoint, revision);
  const target = registryDestination(destination);
  if (!Number.isSafeInteger(maxObjectBytes) || maxObjectBytes < 1 || maxObjectBytes > 1024 ** 3) throw fail();
  const base = `${target.endpoint}/v2/${target.repository}`;
  if (!target.testOnly && typeof authorize !== 'function') throw fail();
  let credentials = null, credentialsAt = 0;
  async function authorization(signal, force = false) {
    if (target.testOnly) return {};
    if (force || !credentials || Date.now() - credentialsAt > 30000) { credentials = await authorize(target.repository, signal, target.visibility); credentialsAt = Date.now(); }
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
  /** True only when the registry confirms a blob with exactly this digest and size. Any doubt means upload it. */
  async function hasBlob(digest, size, signal) {
    if (!DIGEST.test(digest)) throw fail();
    try {
      const response = await request(`${base}/blobs/${digest}`, { method: 'HEAD', allowNotFound: true }, signal);
      await response.body?.cancel();
      return response.status === 200 && Number(response.headers.get('content-length')) === size && (response.headers.get('docker-content-digest') || digest) === digest;
    } catch (error) { if (signal?.aborted) throw error; return false; }
  }
  async function getBlob(item, type, signal) {
    if (!validDescriptor(item, type, maxObjectBytes)) throw fail();
    const response = await blobResponse(item.digest, signal);
    const bytes = await bounded(response, Math.min(item.size, maxObjectBytes), signal);
    if (bytes.length !== item.size || sha(bytes) !== item.digest) throw fail();
    return bytes;
  }
  async function blobResponse(digest, signal) {
    // Docker documents this delivery host. Only blob GETs may leave the registry;
    // manifest and upload requests retain their original redirect rejection.
    const registryUrl = new URL(`${base}/blobs/${digest}`);
    const hex = digest.slice(7);
    const deliveryPath = `/registry-v2/docker/registry/v2/blobs/sha256/${hex.slice(0, 2)}/${hex}/data`;
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000);
    const headers = await authorization(requestSignal);
    let url = registryUrl, crossedOrigin = false;
    const seen = new Set();
    for (let redirects = 0; ; redirects++) {
      requestSignal.throwIfAborted();
      if (seen.has(url.href)) throw fail();
      seen.add(url.href);
      const response = await fetcher(url, { method: 'GET', headers: crossedOrigin ? {} : headers,
        credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'manual', signal: requestSignal });
      if (!BLOB_REDIRECTS.has(response.status)) {
        if (response.ok) return response;
        await response.body?.cancel(); throw fail();
      }
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (redirects >= MAX_BLOB_REDIRECTS || typeof location !== 'string' || location.length > 16384 || /[\x00-\x20\x7f]/.test(location)) throw fail();
      let next; try { next = new URL(location, url); } catch { throw fail(); }
      if (next.username || next.password || next.hash || next.port ||
          (next.origin === target.endpoint ? next.pathname !== registryUrl.pathname :
            target.testOnly || next.origin !== BLOB_DELIVERY_ORIGIN || next.pathname !== deliveryPath)) throw fail();
      crossedOrigin ||= next.origin !== target.endpoint;
      url = next;
    }
  }
  async function readRevision(digest, signal) {
    if (!DIGEST.test(digest)) throw fail();
    const cached = cachedRevision(target.endpoint, digest); if (cached) return cached;
    const response = await request(`${base}/manifests/${digest}`, { headers: { Accept: OCI } }, signal);
    return parseRevision(digest, await bounded(response, 32 * 1024 ** 2, signal), signal);
  }
  /** Verifies manifest bytes already read against their digest, reads the config and remembers the result. */
  async function parseRevision(digest, raw, signal) {
    if (sha(raw) !== digest) throw fail();
    let manifest; try { manifest = JSON.parse(raw); } catch { throw fail(); }
    if (manifest.schemaVersion !== 2 || manifest.mediaType !== OCI || !validDescriptor(manifest.config, CONFIG, 32 * 1024 ** 2) || !Array.isArray(manifest.layers)) throw fail();
    let config; try { config = validateRegistrySnapshot(JSON.parse(await getBlob(manifest.config, CONFIG, signal))); } catch { throw fail(); }
    if (manifest.layers.length !== config.files.length || manifest.layers.some((item, i) =>
      !validDescriptor(item, LAYER, maxObjectBytes) || item.digest !== config.files[i].digest || item.size !== config.files[i].size)) throw fail();
    const driveName = cleanDriveNameLabel(manifest.annotations?.[DRIVE_NAME_ANNOTATION]);
    const revision = { digest, snapshot: config, driveName, createdAt: snapshotCreatedAt(manifest.annotations?.[CREATED_ANNOTATION]), manifestBytes: raw.length };
    rememberRevision(target.endpoint, revision);
    return revision;
  }
  /** True for each reference that the registry answers with 404. Any other answer counts as still present. */
  async function snapshotGone({ digest, tag }, signal) {
    if (typeof digest !== 'string' || !DIGEST.test(digest) || typeof tag !== 'string' || !TAG.test(tag)) throw fail();
    const gone = async reference => {
      try { const response = await request(`${base}/manifests/${reference}`, { method: 'HEAD', headers: { Accept: OCI }, allowNotFound: true }, signal); await response.body?.cancel(); return response.status === 404; }
      catch (error) { if (signal?.aborted) throw error; return false; }
    };
    const digestGone = await gone(digest), tagGone = await gone(tag);
    return { digestGone, tagGone, removed: digestGone && tagGone };
  }
  // Single-purpose OCI artifacts (shared files) reuse the same authorization, upload, redirect and verification
  // rules. Their tags can never take the drive snapshot form, so drive listing never sees them.
  const ARTIFACT_TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
  const artifacts = Object.freeze({
    async putBlob(bytes, mediaType, signal) {
      if (!(bytes instanceof Uint8Array) || bytes.length > maxObjectBytes || typeof mediaType !== 'string') throw fail();
      await authorization(signal, true);
      return putBlob(bytes, mediaType, signal);
    },
    async putManifest(tag, bytes, signal) {
      if (typeof tag !== 'string' || !ARTIFACT_TAG.test(tag) || tag.startsWith('mfe-') || !(bytes instanceof Uint8Array) || bytes.length > 1024 ** 2) throw fail();
      await authorization(signal, true);
      const result = await request(`${base}/manifests/${tag}`, { method: 'PUT', body: bytes, headers: { 'Content-Type': OCI } }, signal);
      await result.body?.cancel();
      return sha(bytes);
    },
    /** Reads a manifest by digest (verified against it) or by artifact tag. */
    async getManifest(reference, signal) {
      if (typeof reference !== 'string' || !(DIGEST.test(reference) || (ARTIFACT_TAG.test(reference) && !reference.startsWith('mfe-')))) throw fail();
      const response = await request(`${base}/manifests/${reference}`, { headers: { Accept: OCI }, allowNotFound: true }, signal);
      if (response.status === 404) { await response.body?.cancel(); const missing = fail(); missing.code = 'NOT_FOUND'; throw missing; }
      const raw = await bounded(response, 1024 ** 2, signal);
      if (DIGEST.test(reference) && sha(raw) !== reference) throw fail();
      return raw;
    },
    getBlob: (item, mediaType, signal) => getBlob(item, mediaType, signal),
    /** Asks the registry to delete a manifest by digest. Returns false when the registry refuses. */
    async deleteManifest(digest, signal) {
      if (typeof digest !== 'string' || !DIGEST.test(digest)) throw fail();
      await authorization(signal, true);
      try { const result = await request(`${base}/manifests/${digest}`, { method: 'DELETE', allowNotFound: true }, signal); await result.body?.cancel(); return true; }
      catch { return false; }
    },
  });
  return {
    target,
    artifacts,
    // known: layer digests that snapshots in this repository already reference; they are linked, never uploaded again.
    // Any other layer the registry already has (an earlier run that stopped part way) is skipped after a HEAD check.
    async publish({ vaultId, deviceId, parents = [], files, readFile, driveName, onVerifying = null, known = new Set(), onSkipped = null, createdAt = Date.now() }, signal) {
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
      for (const file of frozen.files)
        if (!OBJECT.test(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > maxObjectBytes || !/^[a-f0-9]{64}$/.test(file.sha256)) throw fail();
      const layer = async file => {
        const digest = `sha256:${file.sha256}`;
        if (known.has(digest)) return { path: file.path, mediaType: LAYER, digest, size: file.bytes };
        // Every new object is read and checked before any network request about it.
        const bytes = await readFile(file.path, signal);
        if (!(bytes instanceof Uint8Array) || bytes.length !== file.bytes || sha(bytes) !== digest) throw fail();
        // Large layers left by a run that stopped part way are not sent twice; small ones are cheaper to send.
        if (file.bytes >= 1024 * 1024 && await hasBlob(digest, file.bytes, signal)) {
          try { onSkipped?.(file); } catch { /* Progress never changes publication. */ }
          return { path: file.path, mediaType: LAYER, digest, size: file.bytes };
        }
        return { path: file.path, ...await putBlob(bytes, LAYER, signal) };
      };
      // A few layers travel at once: thousands of small objects are otherwise one slow round trip each.
      // The first failure stops new work; the manifest keeps the original object order.
      const layers = new Array(frozen.files.length); let next = 0, failure = null;
      const worker = async () => {
        while (!failure && next < frozen.files.length) {
          const index = next++;
          try { layers[index] = await layer(frozen.files[index]); } catch (error) { failure ??= error; }
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, Math.min(uploadConcurrency, frozen.files.length)) }, worker));
      if (failure) throw failure;
      config.files.push(...layers);
      validateRegistrySnapshot(config);
      // Every layer is uploaded; what remains is writing and reading back the manifest.
      try { onVerifying?.(); } catch { /* A progress listener never changes publication. */ }
      const configuration = Buffer.from(JSON.stringify(config));
      const manifest = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: OCI,
        config: await putBlob(configuration, CONFIG, signal), layers: config.files.map(({ path, ...item }) => item),
        annotations: { [CREATED_ANNOTATION]: new Date(createdAt).toISOString(), ...(cleanDriveNameLabel(driveName) ? { [DRIVE_NAME_ANNOTATION]: cleanDriveNameLabel(driveName) } : {}) } }));
      const digest = sha(manifest), tag = `mfe-${frozen.deviceId}-${randomUUID().replaceAll('-', '')}`;
      await authorization(signal, true);
      const result = await request(`${base}/manifests/${tag}`, { method: 'PUT', body: manifest, headers: { 'Content-Type': OCI } }, signal);
      await result.body?.cancel();
      // Verify immutable bytes, then verify the advertised tag points to the same bytes.
      await readRevision(digest, signal);
      // The tag check is a HEAD (not a pull) when the registry names the digest; otherwise the bytes are compared.
      const named = await request(`${base}/manifests/${tag}`, { method: 'HEAD', headers: { Accept: OCI } }, signal);
      await named.body?.cancel();
      const advertised = named.headers.get('docker-content-digest');
      if (advertised && advertised !== digest) throw fail();
      if (!advertised) {
        const check = await request(`${base}/manifests/${tag}`, { headers: { Accept: OCI } }, signal);
        if (sha(await bounded(check, 32 * 1024 ** 2, signal)) !== digest) throw fail();
      }
      return { digest, tag, repository: target.repository, verified: true, createdAt: new Date(createdAt).toISOString() };
    },
    /**
     * Removes one drive snapshot by its manifest digest and then confirms that neither the digest nor the tag
     * resolves any more. Encrypted layers are content addressed and may be shared with other snapshots or other
     * drives, so they are left for the registry to collect. The client must hold a delete-scoped token.
     */
    async deleteSnapshot({ digest, tag }, signal) {
      if (typeof digest !== 'string' || !DIGEST.test(digest) || typeof tag !== 'string' || !TAG.test(tag)) throw fail();
      await authorization(signal, true);
      let accepted = false;
      try { const result = await request(`${base}/manifests/${digest}`, { method: 'DELETE', allowNotFound: true }, signal); await result.body?.cancel(); accepted = true; }
      catch (error) { if (signal?.aborted) throw error; }
      return { accepted, ...await snapshotGone({ digest, tag }, signal) };
    },
    snapshotGone,
    // With a vault id, only that drive's snapshots are read, so one repository can hold several drives.
    // includeFiles keeps each revision's object list so a caller can skip what it already has or what is already uploaded.
    async list(signal, { vaultId, includeFiles = false } = {}) {
      if (vaultId !== undefined && !/^[a-f0-9]{32}$/.test(vaultId)) throw fail();
      const prefix = 'mfe-';
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
        for (const tag of body.tags || []) { if (TAG.test(tag) && tag.startsWith(prefix)) tags.add(tag); }
        if (tags.size > 1000) throw Error('Snapshot catalogue exceeds this client limit. Narrow the repository before retrying.');
        if (link && !/^<[^>]+>;\s*rel="next"$/.test(link)) throw fail();
        url = link ? new URL(link.match(/^<([^>]+)>/)[1], target.endpoint).href : null;
      }
      const revisions = [], foreignDevices = new Set(); let metadataBytes = 0;
      for (const tag of [...tags].sort()) {
        // Tags are mfe-<device id>-<revision>, and one device belongs to one drive, so a foreign device is read once.
        if (foreignDevices.has(tag.slice(4, 36))) continue;
        // A HEAD does not count as a pull. When the registry names a digest this client has already verified, the
        // snapshot is taken from memory; otherwise the manifest is read once, checked against that name, and kept.
        // A snapshot removed moments ago can stay in the tag list for a while; its tag already answers 404 and is skipped.
        const head = await request(`${base}/manifests/${tag}`, { method: 'HEAD', headers: { Accept: OCI }, allowNotFound: true }, signal);
        await head.body?.cancel();
        if (head.status === 404) continue;
        const advertised = head.headers.get('docker-content-digest');
        let revision = advertised && DIGEST.test(advertised) ? cachedRevision(target.endpoint, advertised) : null;
        if (!revision) {
          const response = await request(`${base}/manifests/${tag}`, { headers: { Accept: OCI }, allowNotFound: true }, signal);
          if (response.status === 404) { await response.body?.cancel(); continue; }
          const raw = await bounded(response, 32 * 1024 ** 2, signal);
          if (advertised && DIGEST.test(advertised) && sha(raw) !== advertised) throw fail();
          revision = await parseRevision(sha(raw), raw, signal);
        }
        metadataBytes += Buffer.byteLength(JSON.stringify(revision.snapshot)) + revision.manifestBytes;
        if (metadataBytes > 64 * 1024 ** 2) throw Error('Snapshot catalogue exceeds the metadata limit.');
        if (vaultId && revision.snapshot.vaultId !== vaultId) { foreignDevices.add(tag.slice(4, 36)); continue; }
        const { files, ...summary } = revision.snapshot;
        revisions.push({ digest: revision.digest, snapshot: { ...summary, fileCount: files.length }, tag, createdAt: revision.createdAt, ...(includeFiles ? { files: files.map(({ path, digest, size }) => ({ path, digest, size })) } : {}) });
      }
      // Every drive in a repository shares this client's tag limit, so the total travels beside the drive's own list.
      Object.defineProperty(revisions, 'tagCount', { value: tags.size, enumerable: false });
      return revisions;
    },
    readRevision,
    /** Reads one encrypted object of a snapshot, verified against its layer digest and size. */
    async readObject(digest, objectPath, signal) {
      if (!OBJECT.test(objectPath)) throw fail();
      signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(3600000)]) : AbortSignal.timeout(3600000);
      const revision = await readRevision(digest, signal);
      const file = revision.snapshot.files.find(item => item.path === objectPath);
      if (!file) throw fail();
      return getBlob(file, LAYER, signal);
    },
    // only: a set of object paths; the rest of the revision is not fetched.
    async download(digest, writeFile, signal, { only = null } = {}) {
      signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(3600000)]) : AbortSignal.timeout(3600000);
      await authorization(signal, true);
      const revision = await readRevision(digest, signal);
      for (const file of revision.snapshot.files) if (!only || only.has(file.path)) await writeFile(file.path, await getBlob(file, LAYER, signal), signal);
      return revision;
    },
  };
}
