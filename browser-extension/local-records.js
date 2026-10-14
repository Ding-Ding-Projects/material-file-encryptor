// Small local records kept beside the preference record: the imported logo and
// the attention modes. Each record is bounded and validated on every read.

export const logoKey = 'mfe-extension-logo-v1';
export const attentionKey = 'mfe-extension-attention-v1';
export const LOGO_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
export const LOGO_MAX_BYTES = 65536;
export const attentionDefaults = Object.freeze({focus: false, reducedStimulus: false, guided: false});

/** Checks a chosen logo file before it is read: type and size only, nothing is decoded yet. */
export function checkLogoFile(file) {
  if (!file) return 'Choose an image file.';
  if (!LOGO_TYPES.includes(file.type)) return 'Use a PNG, JPEG or WebP image.';
  if (file.size > LOGO_MAX_BYTES) return 'Use an image of 64 KB or less.';
  return '';
}

const validLogo = value => typeof value === 'string' && value.length <= Math.ceil(LOGO_MAX_BYTES * 4 / 3) + 64 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value);

export function readLogo(storage) { try { const value = storage?.getItem(logoKey); return validLogo(value) ? value : ''; } catch { return ''; } }
export function saveLogo(storage, value) { if (!validLogo(value)) return false; try { storage?.setItem(logoKey, value); return true; } catch { return false; } }
export function clearLogo(storage) { try { storage?.removeItem(logoKey); return true; } catch { return false; } }

export function readAttention(storage) {
  try {
    const value = JSON.parse(storage?.getItem(attentionKey) || 'null');
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === 'focus,guided,reducedStimulus' && Object.values(value).every(item => typeof item === 'boolean')) return {...value};
  } catch {}
  return {...attentionDefaults};
}
export function saveAttention(storage, value) { const next = {...attentionDefaults, ...value}; for (const key of Object.keys(next)) if (typeof next[key] !== 'boolean' || !Object.hasOwn(attentionDefaults, key)) return null; try { storage?.setItem(attentionKey, JSON.stringify(next)); } catch {} return next; }
