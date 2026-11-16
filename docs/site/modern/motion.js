// Site motion model: Full / Reduced / Off, four profiles, a speed multiplier and per-kind tuning.
// The resolved values are written as CSS custom properties, so every effect updates live without a reload.
import {readJson, writeJson, removeKey} from './storage.js';
export const MOTION_KEY = 'mfe.site.motion.v1';
export const EASING = Object.freeze({standard: 'cubic-bezier(.2,0,0,1)', emphasized: 'cubic-bezier(.05,.7,.1,1)', spring: 'cubic-bezier(.34,1.56,.64,1)', linear: 'linear'});
export const KINDS = Object.freeze(['page', 'stagger', 'reveal', 'card', 'popup', 'toast', 'draw', 'transition']);
const BASE = {page: {dur: 560, dist: 18}, stagger: {dur: 520, dist: 22}, reveal: {dur: 640, dist: 28}, card: {dur: 240, dist: 4}, popup: {dur: 260, dist: 10}, toast: {dur: 420, dist: 16}, draw: {dur: 1100, dist: 0}, transition: {dur: 360, dist: 0}};
const PROFILE_SHAPE = {calm: {speed: .9, dur: 1.3, dist: .5, ease: 'standard'}, standard: {speed: 1, dur: 1, dist: 1, ease: 'emphasized'}, expressive: {speed: 1, dur: 1.1, dist: 1.5, ease: 'emphasized'}, playful: {speed: 1.15, dur: 1, dist: 1.4, ease: 'spring'}};
export const PROFILE_NAMES = Object.freeze(Object.keys(PROFILE_SHAPE));
/** Builds the per-kind table for a profile. */
export function profileKinds(name) {
 const shape = PROFILE_SHAPE[name] || PROFILE_SHAPE.standard;
 return Object.fromEntries(KINDS.map(kind => [kind, {on: true, dur: Math.round(BASE[kind].dur * shape.dur), dist: Math.round(BASE[kind].dist * shape.dist), ease: kind === 'card' || kind === 'transition' || kind === 'draw' ? 'standard' : shape.ease}]));
}
export const defaultMotion = () => ({mode: 'full', profile: 'standard', speed: 1, kinds: profileKinds('standard'), vars: {}});
export const clamp = (value, low, high, fallback) => Number.isFinite(Number(value)) ? Math.min(high, Math.max(low, Number(value))) : fallback;
export function loadMotion() {
 const stored = readJson(MOTION_KEY, defaultMotion());
 const kinds = profileKinds(PROFILE_NAMES.includes(stored.profile) ? stored.profile : 'standard');
 for (const kind of KINDS) {
  const saved = stored.kinds?.[kind];
  if (saved) kinds[kind] = {on: saved.on !== false, dur: clamp(saved.dur, 0, 3000, kinds[kind].dur), dist: clamp(saved.dist, 0, 80, kinds[kind].dist), ease: EASING[saved.ease] ? saved.ease : kinds[kind].ease};
 }
 return {mode: ['full', 'reduced', 'off'].includes(stored.mode) ? stored.mode : 'full', profile: PROFILE_NAMES.includes(stored.profile) ? stored.profile : 'standard', speed: clamp(stored.speed, .25, 2, 1), kinds, vars: {}};
}
/** Resolves the CSS values for a state. A disabled kind resolves to zero duration and zero travel. */
export function resolveVars(state) {
 const vars = {'--m-speed': String(state.speed)};
 const value = kind => {
  const k = state.kinds[kind];
  const live = state.mode === 'full' && k.on;
  return {dur: live ? Math.round(k.dur / state.speed) : 0, dist: live ? k.dist : 0, ease: EASING[k.ease]};
 };
 for (const kind of KINDS) {
  const v = value(kind);
  vars[`--m-${kind}-dur`] = v.dur + 'ms';
  vars[`--m-${kind}-ease`] = v.ease;
  if (kind !== 'popup' && kind !== 'draw' && kind !== 'transition') vars[`--m-${kind}-dist`] = v.dist + 'px';
 }
 vars['--m-popup-scale'] = String(Math.min(1, 1 - value('popup').dist / 100));
 vars['--m-stagger-step'] = Math.round(60 / state.speed) + 'ms';
 return vars;
}
const prefersReduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const motionAllowed = state => state.mode === 'full' && !prefersReduced();
const listeners = new Set();
let current = loadMotion();
export const getMotion = () => current;
export const onMotionChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
/** Applies the state to the document: mode attributes, CSS variables and the motion-on class. */
export function applyMotion(state = current) {
 const root = document.documentElement;
 root.dataset.motionMode = state.mode;
 if (state.mode !== 'full') { if (!root.dataset.motion) { root.dataset.motion = 'reduced'; root.dataset.motionBy = 'site'; } }
 else if (root.dataset.motionBy === 'site') { delete root.dataset.motion; delete root.dataset.motionBy; }
 const vars = resolveVars(state);
 for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
 const allowed = motionAllowed(state);
 root.classList.toggle('motion-on', allowed);
 root.classList.toggle('js-reveal', allowed && 'IntersectionObserver' in window);
 state.vars = vars;
 writeJson(MOTION_KEY, state);
}
export function setMotion(patch) {
 current = {...current, ...patch, kinds: patch.kinds || current.kinds};
 applyMotion(current);
 for (const fn of listeners) fn(current);
}
export function selectProfile(name) { setMotion({profile: name, speed: PROFILE_SHAPE[name].speed, kinds: profileKinds(name)}); }
export function setKind(kind, patch) { setMotion({kinds: {...current.kinds, [kind]: {...current.kinds[kind], ...patch}}}); }
export function resetMotion() { removeKey(MOTION_KEY); current = defaultMotion(); applyMotion(current); for (const fn of listeners) fn(current); }

/** Scroll reveals: content stays visible unless script opted the page into motion. */
let revealObserver = null;
export function initReveal() {
 const targets = [...document.querySelectorAll('main .section, main .surface-band, .diagram, .settings-group, .hub-quiet, .start-here, .next-steps')];
 for (const node of targets) if (!node.hasAttribute('data-reveal')) node.setAttribute('data-reveal', '');
 if (!('IntersectionObserver' in window)) return;
 revealObserver?.disconnect();
 revealObserver = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-in'); revealObserver.unobserve(entry.target); } }, {rootMargin: '0px 0px -8% 0px', threshold: .08});
 for (const node of document.querySelectorAll('[data-reveal]:not(.is-in)')) revealObserver.observe(node);
}
/** Sets the transform origin of a popup to its trigger so it grows from where it opened. */
export function setOrigin(popup, trigger) {
 if (!popup || !trigger) return;
 const a = popup.getBoundingClientRect(), b = trigger.getBoundingClientRect();
 if (!a.width) return;
 popup.style.setProperty('--origin-x', Math.round(b.left + b.width / 2 - a.left) + 'px');
 popup.style.setProperty('--origin-y', Math.round(b.top + b.height / 2 - a.top) + 'px');
}
export function mountMotion() {
 applyMotion(current);
 initReveal();
 window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => applyMotion(current));
 // A reduced or off setting skips the cross-document view transition on arrival.
 window.addEventListener('pagereveal', event => { if (event.viewTransition && !motionAllowed(current)) event.viewTransition.skipTransition(); });
 const exploreToggle = document.getElementById('explore-toggle'), menu = document.getElementById('explore-links');
 if (exploreToggle && menu) {
  menu.classList.add('popup');
  new MutationObserver(() => { const open = exploreToggle.getAttribute('aria-expanded') === 'true'; menu.classList.toggle('is-open', open); if (open) setOrigin(menu, exploreToggle); }).observe(exploreToggle, {attributes: true, attributeFilter: ['aria-expanded']});
 }
 const dialog = document.getElementById('preferences-dialog');
 document.addEventListener('click', event => {
  const trigger = event.target.closest?.('#preferences-open, #preferences-footer, #open-preferences');
  if (trigger && dialog) requestAnimationFrame(() => requestAnimationFrame(() => setOrigin(dialog, trigger)));
 }, true);
}
/** Plays one effect of the given kind inside a preview element, using the same resolved values as the page. */
export function previewKind(kind, element) {
 const k = current.kinds[kind], live = motionAllowed(current) && k.on;
 element.hidden = false;
 if (!live || !element.animate) return false;
 const dur = Math.max(1, Math.round(k.dur / current.speed)), easing = EASING[k.ease];
 const frames = kind === 'popup' ? [{opacity: 0, transform: `scale(${1 - k.dist / 100})`}, {opacity: 1, transform: 'none'}]
  : kind === 'card' ? [{transform: 'none'}, {transform: `translateY(-${k.dist}px)`}, {transform: 'none'}]
  : kind === 'draw' || kind === 'transition' ? [{opacity: 0}, {opacity: 1}]
  : [{opacity: 0, transform: `translateY(${k.dist}px)`}, {opacity: 1, transform: 'none'}];
 element.animate(frames, {duration: dur, easing});
 return true;
}
