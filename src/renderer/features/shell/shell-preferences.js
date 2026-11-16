/** Device-local presentation preferences owned by the workspace shell: row density, text size and high contrast. */
export const SHELL_STORAGE_KEY = 'mfe.shell.v1';
export const TEXT_SCALE_MIN = 90;
export const TEXT_SCALE_MAX = 200;
export const SHELL_DEFAULTS = Object.freeze({density: 'compact', textScale: 100, highContrast: false});

/** Accepts only known values so a damaged record can never reach the document. */
export function normalizeShellPreferences(value) {
  const result = {...SHELL_DEFAULTS};
  if (!value || typeof value !== 'object') return result;
  if (value.density === 'compact' || value.density === 'comfortable') result.density = value.density;
  const scale = Number(value.textScale);
  if (Number.isFinite(scale)) result.textScale = Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, Math.round(scale / 5) * 5));
  if (typeof value.highContrast === 'boolean') result.highContrast = value.highContrast;
  return result;
}

export function loadShellPreferences(storage) {
  try {
    const source = storage?.getItem(SHELL_STORAGE_KEY);
    if (!source || source.length > 2000) return {...SHELL_DEFAULTS};
    return normalizeShellPreferences(JSON.parse(source));
  } catch {
    return {...SHELL_DEFAULTS};
  }
}

/** Returns false when the device could not keep the choice, so the caller can say it is for this session only. */
export function saveShellPreferences(storage, preferences) {
  try {
    storage.setItem(SHELL_STORAGE_KEY, JSON.stringify(normalizeShellPreferences(preferences)));
    return true;
  } catch {
    return false;
  }
}

/** Writes the preferences onto the root element as attributes and one custom property. */
export function applyShellPreferences(root, preferences) {
  const prefs = normalizeShellPreferences(preferences);
  root.dataset.density = prefs.density;
  root.dataset.contrast = prefs.highContrast ? 'high' : 'auto';
  root.style.setProperty('--mfe-text-scale', String(prefs.textScale / 100));
  return prefs;
}
