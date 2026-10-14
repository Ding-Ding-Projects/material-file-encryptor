// Accent colour for the extension pages. The stored value is #rrggbb or
// #rrggbbaa; opacity is composited over the page surface, and the text colour
// on the accent is whichever of white or black gives the higher contrast.

export const ACCENT_PRESETS = Object.freeze(['#476333', '#2f6b5e', '#335f8a', '#6a4c93', '#8a4f2b', '#9c3f4a']);
const SURFACE = {light: '#f8faf1', dark: '#11150e'};

export function parseAccent(value) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/.exec(String(value || ''));
  if (!match) return null;
  return {r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16), a: match[4] ? parseInt(match[4], 16) / 255 : 1};
}

const hex = ({r, g, b}) => '#' + [r, g, b].map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('');
const luminance = ({r, g, b}) => { const linear = channel => { const c = channel / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b); };
export const contrastRatio = (first, second) => { const [high, low] = [luminance(first), luminance(second)].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); };

/** The opaque accent, its text colour and contrast for a theme, or null for an invalid value. */
export function accentPalette(value, dark = false) {
  const colour = parseAccent(value);
  if (!colour) return null;
  const surface = parseAccent(SURFACE[dark ? 'dark' : 'light']);
  const mix = (top, bottom, amount) => ({r: top.r * amount + bottom.r * (1 - amount), g: top.g * amount + bottom.g * (1 - amount), b: top.b * amount + bottom.b * (1 - amount)});
  const primary = mix(colour, surface, colour.a);
  const white = {r: 255, g: 255, b: 255}, black = {r: 0, g: 0, b: 0};
  const onWhite = contrastRatio(primary, white), onBlack = contrastRatio(primary, black);
  const onPrimary = onWhite >= onBlack ? white : black;
  const ratio = Math.max(onWhite, onBlack);
  return {primary: hex(primary), onPrimary: hex(onPrimary), container: hex(mix(primary, surface, 0.22)), ratio: Math.round(ratio * 10) / 10, passes: ratio >= 4.5};
}

/** Applies or clears the accent tokens on the page root. */
export function applyAccent(root, value, dark = false) {
  const style = root?.style;
  if (!style?.setProperty) return null;
  const palette = value ? accentPalette(value, dark) : null;
  for (const name of ['--md-sys-color-primary', '--md-sys-color-on-primary', '--md-sys-color-secondary-container']) style.removeProperty(name);
  if (!palette) return null;
  style.setProperty('--md-sys-color-primary', palette.primary);
  style.setProperty('--md-sys-color-on-primary', palette.onPrimary);
  style.setProperty('--md-sys-color-secondary-container', palette.container);
  return palette;
}
