import { createHash } from 'node:crypto';

/**
 * Publishes a drive's icon and banner as one small public OCI artifact, tagged appearance-<vault id>, in the same
 * repository as its backups. Backup snapshots are untouched, so older versions of the app keep reading them. The
 * images are not encrypted: that is what lets a drive show them before it is unlocked, and the person confirmed it.
 * Removing both images replaces the artifact with an empty one, so readers stop showing them.
 */
export const APPEARANCE_CONFIG_TYPE = 'application/vnd.material-file-encryptor.drive-appearance.v1+json';
const MANIFEST_TYPE = 'application/vnd.oci.image.manifest.v1+json';
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

export const appearanceTag = vaultId => `appearance-${String(vaultId).slice(0, 64)}`;

/** The exact config bytes for an appearance; equal appearances give equal bytes, so an unchanged one is not re-sent. */
export function appearanceConfig(vaultId, appearance) {
  const part = item => item ? { type: item.type, digest: sha(item.bytes), size: item.bytes.length } : null;
  return Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'drive-appearance', vaultId, icon: part(appearance.icon), banner: part(appearance.banner) }));
}

export async function publishAppearance({ storage, vaultId, appearance, signal }) {
  const artifacts = storage?.artifacts;
  if (!artifacts) return { published: false, reason: 'unsupported' };
  const tag = appearanceTag(vaultId), config = appearanceConfig(vaultId, appearance);
  // Skip when the registry already holds this exact appearance.
  try {
    const current = JSON.parse(Buffer.from(await artifacts.getManifest(tag, signal)).toString('utf8'));
    if (current?.config?.digest === sha(config)) return { published: false, reason: 'unchanged' };
  } catch (error) { if (error?.code !== 'NOT_FOUND' && signal?.aborted) throw error; }
  if (!appearance.icon && !appearance.banner) {
    // Nothing was ever published and nothing is chosen: there is nothing to replace.
    try { await artifacts.getManifest(tag, signal); } catch (error) { if (error?.code === 'NOT_FOUND') return { published: false, reason: 'none' }; }
  }
  const configDescriptor = await artifacts.putBlob(config, APPEARANCE_CONFIG_TYPE, signal);
  const layers = [];
  for (const item of [appearance.icon, appearance.banner]) if (item) layers.push(await artifacts.putBlob(item.bytes, item.type, signal));
  const manifest = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: MANIFEST_TYPE, config: configDescriptor, layers }));
  const digest = await artifacts.putManifest(tag, manifest, signal);
  return { published: true, tag, digest };
}

/** Reads a published appearance anonymously. Returns { icon, banner } as { type, bytes } or null. */
export async function readAppearance({ storage, vaultId, signal, maxBytes = 1024 * 1024 }) {
  const artifacts = storage?.artifacts;
  if (!artifacts) return { icon: null, banner: null };
  let manifest;
  try { manifest = JSON.parse(Buffer.from(await artifacts.getManifest(appearanceTag(vaultId), signal)).toString('utf8')); }
  catch (error) { if (error?.code === 'NOT_FOUND') return { icon: null, banner: null }; throw error; }
  if (manifest?.config?.mediaType !== APPEARANCE_CONFIG_TYPE || !Array.isArray(manifest.layers) || manifest.layers.length > 2) return { icon: null, banner: null };
  const config = JSON.parse(Buffer.from(await artifacts.getBlob(manifest.config, APPEARANCE_CONFIG_TYPE, signal)).toString('utf8'));
  if (config?.kind !== 'drive-appearance' || config.vaultId !== vaultId) return { icon: null, banner: null };
  const out = { icon: null, banner: null };
  for (const kind of ['icon', 'banner']) {
    const wanted = config[kind]; if (!wanted) continue;
    const layer = manifest.layers.find(item => item.digest === wanted.digest && item.size === wanted.size && item.size <= maxBytes);
    if (!layer || !['image/png', 'image/jpeg', 'image/webp'].includes(layer.mediaType)) continue;
    const bytes = await artifacts.getBlob(layer, layer.mediaType, signal);
    if (sha(Buffer.from(bytes)) === wanted.digest) out[kind] = { type: layer.mediaType, bytes: new Uint8Array(bytes) };
  }
  return out;
}
