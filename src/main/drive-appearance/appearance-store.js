import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * A drive's icon and banner, kept per vault id under the app's data folder. They are chosen by the person, checked by
 * their first bytes (PNG, JPEG or WebP only, never by file name) and size, and are not secret: they are published
 * unencrypted with the drive's backups so a drive can show them before it is unlocked.
 */
export const APPEARANCE_LIMITS = Object.freeze({ icon: 512 * 1024, banner: 1024 * 1024 });
const VAULT_ID = /^(?:[a-f0-9]{32}|[a-f0-9]{64})$/;
const fail = (code, message) => Object.assign(Error(message), { code });

/** The image type from its first bytes, or null. */
export function sniffImage(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export function validateAppearanceImage(kind, bytes) {
  if (!Object.hasOwn(APPEARANCE_LIMITS, kind)) throw fail('INVALID', 'Choose an icon or a banner.');
  const type = sniffImage(bytes);
  if (!type) throw fail('UNSUPPORTED_IMAGE', 'Use a PNG, JPEG or WebP image.');
  if (bytes.length > APPEARANCE_LIMITS[kind]) throw fail('IMAGE_TOO_LARGE', kind === 'icon' ? 'The icon can be up to 512 KB.' : 'The banner can be up to 1 MB.');
  return type;
}

export async function readVaultId(storageDir) {
  try { const id = JSON.parse(await fs.readFile(path.join(storageDir, 'vault.json'), 'utf8')).VaultId; return VAULT_ID.test(id || '') ? id : null; }
  catch { return null; }
}

export function createDriveAppearanceStore({ root }) {
  const folder = vaultId => { if (!VAULT_ID.test(vaultId || '')) throw fail('INVALID', 'Unknown drive.'); return path.join(root, vaultId); };
  async function readMeta(vaultId) { folder(vaultId); try { return JSON.parse(await fs.readFile(path.join(folder(vaultId), 'appearance.json'), 'utf8')); } catch { return { version: 1 }; } }
  async function writeMeta(vaultId, meta) {
    await fs.mkdir(folder(vaultId), { recursive: true });
    const file = path.join(folder(vaultId), 'appearance.json'), temporary = file + '.part';
    await fs.writeFile(temporary, JSON.stringify(meta)); await fs.rename(temporary, file);
  }
  async function get(vaultId) {
    const meta = await readMeta(vaultId), out = { icon: null, banner: null, acknowledgedAt: meta.acknowledgedAt ?? null };
    for (const kind of ['icon', 'banner']) {
      const item = meta[kind]; if (!item) continue;
      try {
        const bytes = new Uint8Array(await fs.readFile(path.join(folder(vaultId), `${kind}.bin`)));
        if (sniffImage(bytes) !== item.type || createHash('sha256').update(bytes).digest('hex') !== item.sha256) continue;
        out[kind] = { type: item.type, sha256: item.sha256, bytes };
      } catch { /* a missing file is simply no image */ }
    }
    return out;
  }
  return {
    get,
    /** Saves an image. The person must have acknowledged that it is public. */
    async set(vaultId, kind, bytes, { acknowledged }) {
      if (acknowledged !== true) throw fail('NOT_ACKNOWLEDGED', 'Confirm that the icon and banner are public first.');
      const type = validateAppearanceImage(kind, bytes);
      await fs.mkdir(folder(vaultId), { recursive: true });
      const file = path.join(folder(vaultId), `${kind}.bin`);
      await fs.writeFile(file + '.part', bytes); await fs.rename(file + '.part', file);
      const meta = await readMeta(vaultId);
      meta[kind] = { type, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
      meta.acknowledgedAt = new Date().toISOString(); meta.changedAt = meta.acknowledgedAt;
      await writeMeta(vaultId, meta);
      return { type, size: bytes.length };
    },
    async remove(vaultId, kind) {
      if (!Object.hasOwn(APPEARANCE_LIMITS, kind)) throw fail('INVALID', 'Choose an icon or a banner.');
      const meta = await readMeta(vaultId); delete meta[kind]; meta.changedAt = new Date().toISOString();
      await fs.rm(path.join(folder(vaultId), `${kind}.bin`), { force: true });
      await writeMeta(vaultId, meta);
      return { removed: true };
    },
    /** Small data: URLs for the renderer. */
    async view(vaultId) {
      const value = await get(vaultId), url = item => item ? `data:${item.type};base64,${Buffer.from(item.bytes).toString('base64')}` : null;
      return { icon: url(value.icon), banner: url(value.banner) };
    }
  };
}
