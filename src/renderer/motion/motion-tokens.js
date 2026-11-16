// Token-driven motion layer: element kinds, profiles, strict validation and the CSS custom properties that
// motion-tokens.css and every animated surface read. This module is pure data and logic, with no DOM access, so
// the same code validates stored settings, imported JSON and live edits.

/** Every animated element kind. Defaults are the Expressive profile. */
export const MOTION_KINDS = Object.freeze([
  {id: 'page', name: 'Page entry', yue: '頁面進場', duration: 520, delay: 0, stagger: 0, easing: 'emphasized', distance: 24, scale: 0.96},
  {id: 'list', name: 'List stagger', yue: '清單依次進場', duration: 300, delay: 0, stagger: 40, easing: 'spring', distance: 12, scale: 1},
  {id: 'card', name: 'Cards', yue: '卡片', duration: 420, delay: 0, stagger: 50, easing: 'emphasized', distance: 16, scale: 0.97},
  {id: 'dialog', name: 'Dialogs', yue: '對話框', duration: 360, delay: 0, stagger: 0, easing: 'spring', distance: 16, scale: 0.92},
  {id: 'menu', name: 'Menus', yue: '選單', duration: 240, delay: 0, stagger: 0, easing: 'emphasized', distance: 8, scale: 0.95},
  {id: 'sheet', name: 'Sheets', yue: '底部面板', duration: 420, delay: 0, stagger: 0, easing: 'emphasized', distance: 48, scale: 1},
  {id: 'tooltip', name: 'Tooltips', yue: '提示', duration: 160, delay: 0, stagger: 0, easing: 'standard', distance: 4, scale: 0.96},
  {id: 'toast', name: 'Toasts', yue: '通知', duration: 320, delay: 0, stagger: 0, easing: 'spring', distance: 24, scale: 0.96},
  {id: 'switch', name: 'Switches', yue: '開關', duration: 200, delay: 0, stagger: 0, easing: 'spring', distance: 0, scale: 1.08},
  {id: 'chart', name: 'Charts', yue: '圖表', duration: 1200, delay: 0, stagger: 30, easing: 'emphasized', distance: 0, scale: 0.4},
  {id: 'progress', name: 'Progress', yue: '進度', duration: 1400, delay: 0, stagger: 0, easing: 'linear', distance: 0, scale: 1},
  {id: 'pulse', name: 'Live pulses', yue: '即時脈動', duration: 2400, delay: 0, stagger: 0, easing: 'standard', distance: 0, scale: 1.6},
  {id: 'tab', name: 'Tab changes', yue: '分頁切換', duration: 300, delay: 0, stagger: 0, easing: 'emphasized', distance: 16, scale: 1},
  {id: 'hover', name: 'Hover lift', yue: '懸停浮起', duration: 220, delay: 0, stagger: 0, easing: 'standard', distance: 2, scale: 1.01},
  {id: 'unlock', name: 'Unlock burst', yue: '解鎖爆發', duration: 900, delay: 0, stagger: 40, easing: 'emphasized', distance: 8, scale: 3},
  {id: 'takeover', name: 'Installation takeover', yue: '安裝全螢幕提示', duration: 640, delay: 0, stagger: 60, easing: 'emphasized', distance: 32, scale: 0.9}
]);

export const MOTION_FIELDS = Object.freeze([
  {key: 'duration', min: 0, max: 5000, step: 10, unit: 'ms'},
  {key: 'delay', min: 0, max: 5000, step: 10, unit: 'ms'},
  {key: 'stagger', min: 0, max: 500, step: 5, unit: 'ms'},
  {key: 'distance', min: 0, max: 120, step: 1, unit: 'px'},
  {key: 'scale', min: 0.2, max: 4, step: 0.01, unit: ''}
]);

export const EASING_PRESETS = Object.freeze({
  standard: [0.2, 0, 0, 1],
  emphasized: [0.05, 0.7, 0.1, 1],
  spring: [0.34, 1.56, 0.64, 1],
  linear: [0, 0, 1, 1]
});
export const EASING_NAMES = Object.freeze(Object.keys(EASING_PRESETS));
export const SPEED_RANGE = Object.freeze({min: 0.25, max: 3});
export const MAX_CUSTOM_PROFILES = 12;
export const MAX_IMPORT_BYTES = 65536;
export const STORAGE_KEY = 'mfe.motion-profiles.v1';
const KIND_IDS = new Set(MOTION_KINDS.map(kind => kind.id));
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export const BUILT_IN_PROFILES = Object.freeze([
  {id: 'calm', name: 'Calm', yue: '平靜', durationFactor: 0.75, distanceFactor: 0.5, staggerFactor: 0.5, easing: 'standard', scaleLift: 0.5},
  {id: 'standard', name: 'Standard', yue: '標準', durationFactor: 0.9, distanceFactor: 0.75, staggerFactor: 0.75, easing: 'standard', scaleLift: 0.7},
  {id: 'expressive', name: 'Expressive', yue: '豐富', durationFactor: 1, distanceFactor: 1, staggerFactor: 1, easing: null, scaleLift: 1},
  {id: 'playful', name: 'Playful', yue: '活潑', durationFactor: 1.2, distanceFactor: 1.4, staggerFactor: 1.4, easing: 'spring', scaleLift: 1.5}
]);
export const DEFAULT_PROFILE_ID = 'expressive';

const round = (value, step) => Math.round(value / step) * step;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** The complete value set for one built-in profile. */
export function builtInProfile(id = DEFAULT_PROFILE_ID) {
  const spec = BUILT_IN_PROFILES.find(row => row.id === id) || BUILT_IN_PROFILES.find(row => row.id === DEFAULT_PROFILE_ID);
  const kinds = {};
  for (const kind of MOTION_KINDS) {
    const live = kind.id === 'progress' || kind.id === 'pulse';
    kinds[kind.id] = {
      enabled: true,
      duration: live ? kind.duration : clamp(round(kind.duration * spec.durationFactor, 10), 0, 5000),
      delay: kind.delay,
      stagger: clamp(round(kind.stagger * spec.staggerFactor, 5), 0, 500),
      easing: live || !spec.easing ? kind.easing : spec.easing,
      distance: clamp(Math.round(kind.distance * spec.distanceFactor), 0, 120),
      scale: kind.scale === 1 ? 1 : Number(clamp(1 + (kind.scale - 1) * spec.scaleLift, 0.2, 4).toFixed(2))
    };
  }
  return {version: 1, name: spec.name, master: true, speed: 1, kinds};
}

function checkNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < field.min || value > field.max) throw new Error(`Invalid motion ${field.key}.`);
  return value;
}

/** Strictly validates one easing value: a preset name or four numbers describing a cubic Bezier. */
export function validateEasing(value) {
  if (typeof value === 'string') {
    if (!Object.hasOwn(EASING_PRESETS, value)) throw new Error('Invalid motion easing.');
    return value;
  }
  if (Array.isArray(value) && value.length === 4 && value.every(item => typeof item === 'number' && Number.isFinite(item))) {
    const [x1, y1, x2, y2] = value;
    if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1 || y1 < -2 || y1 > 3 || y2 < -2 || y2 > 3) throw new Error('Invalid motion easing curve.');
    return value.map(item => Number(item.toFixed(3)));
  }
  throw new Error('Invalid motion easing.');
}

export function easingPoints(easing) {
  return typeof easing === 'string' ? EASING_PRESETS[easing] : easing;
}

export function easingCss(easing) {
  const [a, b, c, d] = easingPoints(easing);
  return `cubic-bezier(${a},${b},${c},${d})`;
}

function rejectUnsafeKeys(value, depth = 0) {
  if (depth > 6) throw new Error('Motion profile exceeds the nesting limit.');
  if (!plain(value) && !Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (forbidden.has(key)) throw new Error('Unsafe motion profile key.');
    rejectUnsafeKeys(value[key], depth + 1);
  }
}

/** Validates a profile strictly. Missing kinds and fields fall back to the Expressive profile. Unknown keys are refused. */
export function validateProfile(source, {fallback = builtInProfile()} = {}) {
  rejectUnsafeKeys(source);
  if (!plain(source)) throw new Error('A motion profile must be an object.');
  for (const key of Object.keys(source)) if (!['version', 'name', 'master', 'speed', 'kinds'].includes(key)) throw new Error('Unknown motion profile field.');
  if (source.version !== 1) throw new Error('Unsupported motion profile version.');
  const result = {version: 1, name: fallback.name, master: fallback.master, speed: fallback.speed, kinds: {}};
  if (source.name !== undefined) {
    if (typeof source.name !== 'string' || !source.name.trim() || source.name.length > 40 || /[\x00-\x1f\x7f<>]/.test(source.name)) throw new Error('Invalid motion profile name.');
    result.name = source.name.trim();
  }
  if (source.master !== undefined) {
    if (typeof source.master !== 'boolean') throw new Error('Invalid motion master switch.');
    result.master = source.master;
  }
  if (source.speed !== undefined) {
    if (typeof source.speed !== 'number' || !Number.isFinite(source.speed) || source.speed < SPEED_RANGE.min || source.speed > SPEED_RANGE.max) throw new Error('Invalid motion speed.');
    result.speed = source.speed;
  }
  const incoming = source.kinds === undefined ? {} : source.kinds;
  if (!plain(incoming)) throw new Error('Invalid motion kinds.');
  for (const id of Object.keys(incoming)) if (!KIND_IDS.has(id)) throw new Error('Unknown motion kind.');
  for (const kind of MOTION_KINDS) {
    const base = fallback.kinds[kind.id];
    const row = incoming[kind.id];
    const out = {...base};
    if (row !== undefined) {
      if (!plain(row)) throw new Error('Invalid motion kind.');
      for (const key of Object.keys(row)) if (key !== 'enabled' && key !== 'easing' && !MOTION_FIELDS.some(field => field.key === key)) throw new Error('Unknown motion kind field.');
      if (row.enabled !== undefined) {
        if (typeof row.enabled !== 'boolean') throw new Error('Invalid motion enabled flag.');
        out.enabled = row.enabled;
      }
      for (const field of MOTION_FIELDS) if (row[field.key] !== undefined) out[field.key] = checkNumber(row[field.key], field);
      if (row.easing !== undefined) out.easing = validateEasing(row.easing);
    }
    result.kinds[kind.id] = out;
  }
  return result;
}

/** The persisted state: the working profile plus named profiles the person saved. */
export function defaultState() {
  return {version: 1, activeId: DEFAULT_PROFILE_ID, profile: builtInProfile(), custom: {}};
}

export function validateState(source) {
  rejectUnsafeKeys(source);
  if (!plain(source) || source.version !== 1) throw new Error('Unsupported motion settings.');
  const state = defaultState();
  state.profile = validateProfile(source.profile ?? builtInProfile());
  const ids = new Set(BUILT_IN_PROFILES.map(row => row.id));
  if (source.custom !== undefined) {
    if (!plain(source.custom)) throw new Error('Invalid saved motion profiles.');
    const names = Object.keys(source.custom);
    if (names.length > MAX_CUSTOM_PROFILES) throw new Error('Too many saved motion profiles.');
    for (const name of names) {
      if (!name.trim() || name.length > 40 || /[\x00-\x1f\x7f<>]/.test(name) || ids.has(name.toLowerCase())) throw new Error('Invalid motion profile name.');
      state.custom[name] = validateProfile({...source.custom[name], name});
    }
  }
  state.activeId = typeof source.activeId === 'string' && (ids.has(source.activeId) || source.activeId === 'edited' || Object.hasOwn(state.custom, source.activeId)) ? source.activeId : 'edited';
  return state;
}

/** Parses an imported JSON text. Throws a plain Error for oversized, malformed or unsafe input. */
export function parseProfileJson(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('Choose a motion profile file smaller than 64 KiB.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  return validateProfile(plain(parsed) && parsed.kind === 'motion-profile' ? parsed.profile : parsed);
}

export function exportProfileJson(profile) {
  return JSON.stringify({kind: 'motion-profile', profile: validateProfile(profile)}, null, 2);
}

/**
 * Reduced motion always wins: the operating-system preference, the in-app Motion setting or low stimulation.
 * The returned reason names which one is in force so the editor can say so.
 */
export function reducedMotionReason({media = false, appSetting = 'system', lowStimulation = false} = {}) {
  if (media) return 'system';
  if (appSetting === 'reduced') return 'app';
  if (lowStimulation) return 'low-stimulation';
  return null;
}

/** Effective values for one kind after the master switch, speed multiplier and reduced-motion override. */
export function effectiveKind(profile, id, {reduced = false} = {}) {
  const row = profile.kinds[id];
  const off = reduced || !profile.master || !row.enabled;
  const speed = profile.speed;
  return {
    enabled: !off,
    duration: off ? 0 : Math.round(row.duration / speed),
    delay: off ? 0 : Math.round(row.delay / speed),
    stagger: off ? 0 : Math.round(row.stagger / speed),
    easing: easingCss(row.easing),
    distance: off ? 0 : row.distance,
    scale: off ? 1 : row.scale
  };
}

/** The complete CSS custom property map for a profile. */
export function motionCssVars(profile, {reduced = false} = {}) {
  const vars = {'--motion-enabled': !reduced && profile.master ? '1' : '0', '--motion-speed': String(profile.speed)};
  for (const kind of MOTION_KINDS) {
    const v = effectiveKind(profile, kind.id, {reduced});
    const p = `--motion-${kind.id}`;
    vars[`${p}-enabled`] = v.enabled ? '1' : '0';
    vars[`${p}-duration`] = `${v.duration}ms`;
    vars[`${p}-delay`] = `${v.delay}ms`;
    vars[`${p}-stagger`] = `${v.stagger}ms`;
    vars[`${p}-easing`] = v.easing;
    vars[`${p}-distance`] = `${v.distance}px`;
    vars[`${p}-scale`] = String(v.scale);
  }
  return vars;
}

/** True when two profiles carry the same values regardless of name. */
export function sameProfile(a, b) {
  return JSON.stringify({...a, name: ''}) === JSON.stringify({...b, name: ''});
}

/** Keyframes that show what one kind does with its effective values. */
export function previewKeyframes(kindId, values) {
  const d = values.distance, s = values.scale;
  switch (kindId) {
    case 'tab': return [{opacity: 0, transform: `translateX(${d}px)`}, {opacity: 1, transform: 'none'}];
    case 'sheet': return [{opacity: 0, transform: `translateY(${d}px)`}, {opacity: 1, transform: 'none'}];
    case 'switch': return [{transform: 'scale(1)'}, {transform: `scale(${s})`}];
    case 'chart': return [{opacity: 0.2, transform: `scale(${s})`}, {opacity: 1, transform: 'none'}];
    case 'progress': return [{transform: 'translateX(-60%)'}, {transform: 'translateX(60%)'}];
    case 'pulse': return [{transform: 'scale(1)', opacity: 1}, {transform: `scale(${s})`, opacity: 0.4}];
    case 'hover': return [{transform: 'none'}, {transform: `translateY(-${d}px) scale(${s})`}];
    case 'unlock': return [{transform: 'scale(.5)', opacity: 0.8}, {transform: `scale(${s})`, opacity: 0}];
    default: return [{opacity: 0, transform: `translateY(${d}px) scale(${s})`}, {opacity: 1, transform: 'none'}];
  }
}
