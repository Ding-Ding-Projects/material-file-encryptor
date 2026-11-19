import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createDriveAppearanceStore, sniffImage, validateAppearanceImage, readVaultId } from '../src/main/drive-appearance/appearance-store.js';
import { publishAppearance, readAppearance, appearanceTag } from '../src/main/drive-appearance/appearance-publish.js';
import { validateAppearanceRequest } from '../src/main/drive-appearance/ipc.js';

const VAULT = 'a'.repeat(32);
const png = (extra = 32) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(extra).fill(7)]);
const jpeg = () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(40).fill(3)]);

test('images are recognised by their bytes and limited in size', () => {
  assert.equal(sniffImage(png()), 'image/png');
  assert.equal(sniffImage(jpeg()), 'image/jpeg');
  assert.equal(sniffImage(Uint8Array.from(Buffer.from('RIFF0000WEBPVP8 '))), 'image/webp');
  assert.equal(sniffImage(Uint8Array.from(Buffer.from('<svg onload=alert(1)></svg>'))), null);
  assert.throws(() => validateAppearanceImage('icon', Uint8Array.from(Buffer.from('GIF89a........'))), { code: 'UNSUPPORTED_IMAGE' });
  assert.throws(() => validateAppearanceImage('icon', png(512 * 1024)), { code: 'IMAGE_TOO_LARGE' });
  assert.equal(validateAppearanceImage('banner', png(512 * 1024)), 'image/png');
});

test('the store needs the public acknowledgement, keeps images per drive and removes them', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-appearance-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = createDriveAppearanceStore({ root });
  await assert.rejects(store.set(VAULT, 'icon', png(), { acknowledged: false }), { code: 'NOT_ACKNOWLEDGED' });
  await store.set(VAULT, 'icon', png(), { acknowledged: true });
  await store.set(VAULT, 'banner', jpeg(), { acknowledged: true });
  const view = await store.view(VAULT);
  assert.match(view.icon, /^data:image\/png;base64,/);
  assert.match(view.banner, /^data:image\/jpeg;base64,/);
  // A file changed on disk is not shown.
  await fs.writeFile(path.join(root, VAULT, 'icon.bin'), png(10));
  assert.equal((await store.get(VAULT)).icon, null);
  await store.remove(VAULT, 'banner');
  assert.equal((await store.view(VAULT)).banner, null);
  await assert.rejects(store.get('../escape'), { code: 'INVALID' });
  const drive = path.join(root, 'drive'); await fs.mkdir(drive);
  await fs.writeFile(path.join(drive, 'vault.json'), JSON.stringify({ VaultId: VAULT }));
  assert.equal(await readVaultId(drive), VAULT);
});

function fakeArtifacts() {
  const blobs = new Map(), manifests = new Map(); let puts = 0;
  const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  return { blobs, manifests, get puts() { return puts; }, artifacts: {
    async putBlob(bytes, mediaType) { blobs.set(sha(bytes), Buffer.from(bytes)); return { mediaType, digest: sha(bytes), size: bytes.length }; },
    async putManifest(tag, bytes) { puts++; manifests.set(tag, Buffer.from(bytes)); return sha(bytes); },
    async getManifest(tag) { if (!manifests.has(tag)) throw Object.assign(Error('missing'), { code: 'NOT_FOUND' }); return manifests.get(tag); },
    async getBlob(item) { return blobs.get(item.digest); }
  } };
}

test('the appearance is published as its own tag, skipped when unchanged, and read back', async () => {
  const fake = fakeArtifacts();
  const appearance = { icon: { type: 'image/png', bytes: png() }, banner: null };
  assert.equal((await publishAppearance({ storage: fake, vaultId: VAULT, appearance })).published, true);
  assert.ok(fake.manifests.has(appearanceTag(VAULT)));
  assert.equal((await publishAppearance({ storage: fake, vaultId: VAULT, appearance })).reason, 'unchanged');
  assert.equal(fake.puts, 1);
  const read = await readAppearance({ storage: fake, vaultId: VAULT });
  assert.deepEqual(Buffer.from(read.icon.bytes), Buffer.from(png()));
  assert.equal(read.banner, null);
  // Removing both replaces the artifact with an empty one.
  await publishAppearance({ storage: fake, vaultId: VAULT, appearance: { icon: null, banner: null } });
  assert.deepEqual(await readAppearance({ storage: fake, vaultId: VAULT }), { icon: null, banner: null });
  // A drive that never had images publishes nothing.
  const fresh = fakeArtifacts();
  assert.equal((await publishAppearance({ storage: fresh, vaultId: VAULT, appearance: { icon: null, banner: null } })).reason, 'none');
  assert.equal(fresh.puts, 0);
});

test('requests are shape-checked and choosing requires the acknowledgement', () => {
  assert.deepEqual(validateAppearanceRequest('driveAppearanceChoose', { sessionId: 'main', kind: 'icon', acknowledged: true }), { sessionId: 'main', kind: 'icon', acknowledged: true });
  assert.throws(() => validateAppearanceRequest('driveAppearanceChoose', { sessionId: 'main', kind: 'icon' }));
  assert.throws(() => validateAppearanceRequest('driveAppearanceRemove', { sessionId: 'main', kind: 'logo' }));
  assert.throws(() => validateAppearanceRequest('driveAppearanceRemove', { sessionId: '../x', kind: 'icon' }));
});
