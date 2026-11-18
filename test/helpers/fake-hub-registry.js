import { createHash } from 'node:crypto';

const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

/**
 * An in-memory stand-in for the OCI registry endpoint. It stores blobs and manifests exactly as
 * the real registry would, so snapshots published through the real storage client can be read back.
 * Every request path is recorded so tests can prove what was (and was not) fetched.
 */
export function createFakeRegistry(repository) {
  const blobs = new Map(), manifests = new Map(), tags = new Map(), requests = [];
  const fetcher = async (input, options = {}) => {
    const url = new URL(input); requests.push(`${options.method || 'GET'} ${url.pathname}`);
    const prefix = `/v2/${repository}/`;
    if (!url.pathname.startsWith(prefix)) return new Response('', { status: 404 });
    const rest = url.pathname.slice(prefix.length);
    if (options.method === 'POST' && rest === 'blobs/uploads/') return new Response('', { status: 202, headers: { Location: `${prefix}blobs/uploads/owned` } });
    if (options.method === 'PUT' && rest.startsWith('blobs/uploads/')) { blobs.set(url.searchParams.get('digest'), Buffer.from(options.body)); return new Response('', { status: 201, headers: { 'Docker-Content-Digest': url.searchParams.get('digest') } }); }
    if (rest.startsWith('blobs/')) { const bytes = blobs.get(rest.slice(6)); return bytes ? new Response(bytes) : new Response('', { status: 404 }); }
    if (options.method === 'PUT' && rest.startsWith('manifests/')) {
      const bytes = Buffer.from(options.body), digest = sha(bytes); manifests.set(digest, bytes); tags.set(rest.slice(10), digest);
      return new Response('', { status: 201 });
    }
    if (options.method === 'DELETE' && rest.startsWith('manifests/')) {
      const digest = rest.slice(10); if (!manifests.delete(digest)) return new Response('', { status: 404 });
      for (const [tag, value] of tags) if (value === digest) tags.delete(tag);
      return new Response('', { status: 202 });
    }
    if (rest.startsWith('manifests/')) { const key = rest.slice(10); const bytes = manifests.get(tags.get(key) ?? key); return bytes ? new Response(bytes) : new Response('', { status: 404 }); }
    if (rest === 'tags/list') return new Response(JSON.stringify({ name: repository, tags: [...tags.keys()].sort() }));
    return new Response('', { status: 404 });
  };
  return { fetcher, blobs, manifests, tags, requests, destination: { endpoint: 'http://127.0.0.1:15221', repository, testOnly: true } };
}

/** Publishes one snapshot through the real storage client into the fake registry and returns its tag and digest. */
export async function publishFake(createRegistryStorage, registry, { vaultId, deviceId, label = 'ciphertext', annotations } = {}) {
  const storage = createRegistryStorage({ destination: registry.destination, fetcher: registry.fetcher });
  const bytes = Buffer.from(`${label}-${vaultId}-${deviceId}`);
  return storage.publish({ vaultId, deviceId, annotations, files: [{ path: 'vault.json', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }], readFile: async () => bytes });
}
