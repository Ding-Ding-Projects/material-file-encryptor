import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRegistryStorage } from '../src/main/registry-storage.js';

const registry = 'https://registry-1.docker.io';
const delivery = 'https://production.cloudfront.docker.com';
const repository = 'test/redirect-vault';
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const configType = 'application/vnd.material-file-encryptor.snapshot.v1+json';
const layerType = 'application/vnd.material-file-encryptor.encrypted-object.v1';
const manifestType = 'application/vnd.oci.image.manifest.v1+json';
const payload = Buffer.from('synthetic encrypted object');
const file = { path: 'vault.json', mediaType: layerType, digest: sha(payload), size: payload.length };
const config = Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'encrypted-vault-registry-snapshot', vaultId: 'a'.repeat(32), deviceId: 'b'.repeat(32), parents: [], files: [file] }));
const manifest = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: manifestType, config: { mediaType: configType, digest: sha(config), size: config.length }, layers: [{ mediaType: layerType, digest: sha(payload), size: payload.length }] }));
const deliveryUrl = digest => `${delivery}/registry-v2/docker/registry/v2/blobs/sha256/${digest.slice(7, 9)}/${digest.slice(7)}/data?synthetic=1`;

function fixture(redirect) {
  const calls = []; let cancelled = 0;
  const redirectResponse = (location, status = 307) => new Response(new ReadableStream({ cancel() { cancelled++; } }), { status, headers: { Location: location } });
  const client = createRegistryStorage({ destination: { repository, visibility: 'public' }, authorize: async () => ({ Authorization: 'Bearer synthetic', Cookie: 'synthetic=private' }),
    fetcher: async (input, options) => {
      const url = new URL(input); calls.push({ url, options });
      if (url.pathname.includes('/manifests/')) { assert.equal(options.redirect, 'error'); return new Response(manifest); }
      const digest = url.origin === registry ? url.pathname.split('/blobs/')[1] : 'sha256:' + url.pathname.split('/').at(-2);
      return redirect({ url, options, digest, calls, redirectResponse, bytes: digest === sha(config) ? config : payload });
    } });
  return { client, calls, cancellations: () => cancelled };
}

test('documented blob delivery strips credentials and preserves immutable verification and one deadline', async () => {
  const f = fixture(({ url, digest, redirectResponse, bytes }) => url.origin === registry ? redirectResponse(deliveryUrl(digest)) : new Response(bytes));
  const received = new Map(); await f.client.download(sha(manifest), async (name, bytes) => received.set(name, bytes));
  assert.deepEqual(received.get('vault.json'), payload);
  const blobs = f.calls.filter(call => !call.url.pathname.includes('/manifests/'));
  assert.equal(blobs.length, 4); assert.equal(f.cancellations(), 2);
  for (let i = 0; i < blobs.length; i += 2) {
    const [original, redirected] = blobs.slice(i, i + 2);
    assert.equal(original.options.headers.Authorization, 'Bearer synthetic');
    assert.deepEqual(redirected.options.headers, {});
    assert.equal(redirected.options.credentials, 'omit');
    assert.equal(redirected.options.referrerPolicy, 'no-referrer');
    assert.equal(redirected.options.redirect, 'manual');
    assert.equal(original.options.signal, redirected.options.signal);
  }
});

test('blob redirects reject unsafe targets before a second network request and cancel intermediate bodies', async () => {
  const safe = deliveryUrl(sha(config));
  for (const location of [safe.replace('https:', 'http:'), safe.replace('production.cloudfront.docker.com', 'evil.invalid'),
    safe.replace('production.cloudfront.docker.com', '127.0.0.1'), safe.replace('https://', 'https://user:pass@'),
    safe.replace('.com/', '.com:444/'), safe + '#fragment', safe.replace(sha(config).slice(7), 'c'.repeat(64)),
    `${registry}/v2/other/vault/blobs/${sha(config)}`, `${delivery}/unrelated`, 'https://[']) {
    const f = fixture(({ redirectResponse }) => redirectResponse(location));
    await assert.rejects(f.client.readRevision(sha(manifest)));
    assert.equal(f.calls.length, 2); assert.equal(f.cancellations(), 1);
  }
});

test('same-registry blob hops keep scope but a delivery hop never regains authentication', async () => {
  const f = fixture(({ url, digest, redirectResponse, bytes }) => {
    const original = `${registry}/v2/${repository}/blobs/${digest}`;
    if (url.searchParams.has('returned')) return new Response(bytes);
    if (url.origin === delivery) return redirectResponse(original + '?returned=1');
    if (url.searchParams.has('same')) return redirectResponse(deliveryUrl(digest));
    return redirectResponse(original + '?same=1');
  });
  await f.client.readRevision(sha(manifest));
  const blobs = f.calls.slice(1);
  assert.equal(blobs.length, 4); assert.equal(f.cancellations(), 3);
  assert.equal(blobs[0].options.headers.Authorization, 'Bearer synthetic');
  assert.equal(blobs[1].options.headers.Authorization, 'Bearer synthetic');
  assert.deepEqual(blobs[2].options.headers, {}); assert.deepEqual(blobs[3].options.headers, {});
  for (const call of blobs) assert.equal(call.options.signal, blobs[0].options.signal);
});

test('blob redirects reject a loop and enforce a finite hop budget', async () => {
  for (const loop of [true, false]) {
    const f = fixture(({ digest, redirectResponse, calls }) => redirectResponse(deliveryUrl(digest) + (loop ? '' : `&hop=${calls.length}`)));
    await assert.rejects(f.client.readRevision(sha(manifest)));
    assert.equal(f.calls.length, loop ? 3 : 5);
    assert.equal(f.cancellations(), loop ? 2 : 4);
  }
});

test('cancellation between redirect hops stops delivery and releases the intermediate body', async () => {
  const controller = new AbortController();
  const f = fixture(({ digest, redirectResponse }) => { controller.abort(); return redirectResponse(deliveryUrl(digest)); });
  await assert.rejects(f.client.readRevision(sha(manifest), controller.signal));
  assert.equal(f.calls.length, 2); assert.equal(f.cancellations(), 1);
});

test('redirected bytes still require exact digest and descriptor length', async () => {
  for (const replacement of [Buffer.alloc(config.length, 32), config.subarray(1), Buffer.concat([config, Buffer.from('x')])]) {
    const f = fixture(({ url, digest, redirectResponse }) => url.origin === registry ? redirectResponse(deliveryUrl(digest)) : new Response(replacement));
    await assert.rejects(f.client.readRevision(sha(manifest)));
    assert.equal(f.calls.length, 3);
  }
});

test('manifest and upload requests retain redirect rejection', async () => {
  for (const operation of ['manifest', 'upload']) {
    const calls = [];
    const client = createRegistryStorage({ destination: { repository }, authorize: async () => ({ Authorization: 'Bearer synthetic' }), fetcher: async (input, options) => {
      calls.push({ input, options }); assert.equal(options.redirect, 'error');
      return new Response('', { status: 307, headers: { Location: deliveryUrl(sha(config)) } });
    } });
    if (operation === 'manifest') await assert.rejects(client.readRevision(sha(manifest)));
    else await assert.rejects(client.publish({ vaultId: 'a'.repeat(32), deviceId: 'b'.repeat(32), files: [{ path: 'vault.json', bytes: payload.length, sha256: sha(payload).slice(7) }], readFile: async () => payload }));
    assert.equal(calls.length, 1);
  }
});
