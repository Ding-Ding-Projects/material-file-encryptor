// Decides how much of the window must be refreshed after the effective settings change.
// Language, vocabulary, narration and similar settings re-label and re-render every view.
// Appearance-only settings (theme, density, accent, fonts, motion, attention) are applied
// by the personalization feature as attributes and custom properties on the document root,
// so refreshing every view for them only stalls the renderer.

export const APPEARANCE_ONLY_KEYS = Object.freeze(['theme', 'density', 'seed', 'fontFamily', 'fontScale', 'fontWeight', 'motion', 'attention']);

/** Returns 'none', 'appearance' or 'full'. */
export function preferenceChangeScope(previous, next) {
  if (!previous || !next) return 'full';
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  let appearance = false;
  for (const key of keys) {
    if (JSON.stringify(previous[key]) === JSON.stringify(next[key])) continue;
    if (!APPEARANCE_ONLY_KEYS.includes(key)) return 'full';
    appearance = true;
  }
  return appearance ? 'appearance' : 'none';
}
