// Derives the Material colour roles that follow the chosen accent colour.
// The same contrast arithmetic as browser-extension/accent.js is used, so the
// desktop shell and the extension agree on what "readable on the accent" means.
// Every returned pair is checked: if a pair cannot reach the minimum contrast
// the lightness is walked toward the safe end until it does.

const MINIMUM_CONTRAST = 4.5;

export function parseHex(value) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(value || ''));
  return match ? {r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16)} : null;
}

const toHex = ({r, g, b}) => '#' + [r, g, b].map(channel => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('');

function toHsl({r, g, b}) {
  const red = r / 255, green = g / 255, blue = b / 255;
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue), delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return {h: 0, s: 0, l: lightness};
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return {h: (hue * 60 + 360) % 360, s: saturation, l: lightness};
}

function fromHsl({h, s, l}) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  const [red, green, blue] = h < 60 ? [chroma, x, 0] : h < 120 ? [x, chroma, 0] : h < 180 ? [0, chroma, x] : h < 240 ? [0, x, chroma] : h < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return {r: (red + m) * 255, g: (green + m) * 255, b: (blue + m) * 255};
}

const luminance = ({r, g, b}) => {
  const linear = channel => { const c = channel / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

export function contrastRatio(first, second) {
  const [high, low] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const WHITE = {r: 255, g: 255, b: 255};
const hexColour = hex => parseHex(hex);

/** Walks lightness from `start` in `step` until the colour reaches the contrast against `against`. */
function tone(hue, saturation, start, step, against, minimum = MINIMUM_CONTRAST) {
  let lightness = start;
  for (let guard = 0; guard < 80; guard += 1) {
    const colour = fromHsl({h: hue, s: saturation, l: lightness});
    if (contrastRatio(colour, against) >= minimum) return colour;
    lightness += step;
    if (lightness <= 0 || lightness >= 1) break;
  }
  return step < 0 ? {r: 0, g: 0, b: 0} : WHITE;
}

/**
 * The four primary roles for one theme. Returns null for a value that is not #rrggbb.
 * `ratio` is the lowest contrast among the two text-on-colour pairs.
 */
export function accentRoles(seed, dark = false) {
  const rgb = parseHex(seed);
  if (!rgb) return null;
  const {h, s} = toHsl(rgb);
  const hue = h, saturation = Math.min(0.75, Math.max(0.22, s));
  let primary, onPrimary, container, onContainer;
  if (dark) {
    const surface = hexColour('#141813');
    onPrimary = fromHsl({h: hue, s: Math.min(saturation, 0.45), l: 0.13});
    primary = tone(hue, saturation, 0.74, 0.02, onPrimary);
    container = fromHsl({h: hue, s: Math.min(saturation, 0.4), l: 0.24});
    onContainer = tone(hue, Math.min(saturation, 0.6), 0.86, 0.02, container);
    if (contrastRatio(primary, surface) < 3) primary = tone(hue, saturation, 0.8, 0.02, surface, 3);
  } else {
    primary = tone(hue, saturation, 0.4, -0.01, WHITE);
    onPrimary = WHITE;
    container = fromHsl({h: hue, s: Math.min(saturation, 0.55), l: 0.86});
    onContainer = tone(hue, Math.min(saturation, 0.55), 0.22, -0.01, container, 7);
  }
  const ratio = Math.min(contrastRatio(primary, onPrimary), contrastRatio(container, onContainer));
  return {
    primary: toHex(primary), onPrimary: toHex(onPrimary),
    primaryContainer: toHex(container), onPrimaryContainer: toHex(onContainer),
    ratio: Math.round(ratio * 10) / 10, passes: ratio >= MINIMUM_CONTRAST
  };
}

const NAMES = ['primary', 'on-primary', 'primary-container', 'on-primary-container'];
const KEYS = ['primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer'];

/**
 * Writes both theme variants as custom properties and flags the root, so a later
 * light/dark switch only flips `data-theme` and the stylesheet picks the right set.
 * A seed equal to `defaultSeed` (or an invalid one) clears the override and
 * leaves the stock palette in place.
 */
export function applyAccentRoles(root, seed, defaultSeed) {
  const style = root?.style;
  if (!style?.setProperty) return null;
  const light = String(seed).toLowerCase() === String(defaultSeed).toLowerCase() ? null : accentRoles(seed, false);
  const dark = light ? accentRoles(seed, true) : null;
  for (const mode of ['light', 'dark']) for (const name of NAMES) style.removeProperty?.(`--local-ux-accent-${mode}-${name}`);
  if (!light || !dark) { root.removeAttribute?.('data-local-accent'); return null; }
  KEYS.forEach((key, index) => {
    style.setProperty(`--local-ux-accent-light-${NAMES[index]}`, light[key]);
    style.setProperty(`--local-ux-accent-dark-${NAMES[index]}`, dark[key]);
  });
  root.setAttribute?.('data-local-accent', '');
  return {light, dark};
}
