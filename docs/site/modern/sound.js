// Short synthesized action cues. Everything is generated locally with WebAudio: no files, no network, no host audio settings touched.
import {readJson, writeJson, removeKey} from './storage.js';
export const SOUND_KEY = 'mfe.site.sound.v1';
const DEFAULTS = {on: true, volume: .5};
// Each note: frequency in Hz, start offset and duration in seconds, waveform.
const CUES = {
 tap: [[880, 0, .05, 'sine']],
 toggle: [[660, 0, .06, 'triangle']],
 copy: [[740, 0, .07, 'sine'], [988, .07, .1, 'sine']],
 success: [[523, 0, .12, 'triangle'], [659, .1, .12, 'triangle'], [784, .2, .14, 'triangle'], [1047, .32, .34, 'triangle']],
 invalid: [[196, 0, .14, 'square'], [147, .13, .24, 'square']]
};
let state = readJson(SOUND_KEY, DEFAULTS), context = null, lastAt = 0;
export const getSound = () => ({...state});
export function setSound(patch) {
 state = {on: patch.on ?? state.on, volume: Math.min(1, Math.max(0, Number(patch.volume ?? state.volume) || 0))};
 writeJson(SOUND_KEY, state);
}
export function resetSound() { removeKey(SOUND_KEY); state = {...DEFAULTS}; }
export const soundAvailable = () => !!(window.AudioContext || window.webkitAudioContext);
/** Plays a cue. Returns false when sound is off, the page asks for reduced motion, throttled, or audio is unavailable. */
export function playCue(name, {force = false} = {}) {
 if (!force && !state.on) return false;
 const notes = CUES[name];
 if (!notes || !soundAvailable()) return false;
 const now = performance.now();
 if (!force && now - lastAt < 90) return false;
 lastAt = now;
 try {
  context ||= new (window.AudioContext || window.webkitAudioContext)();
  if (context.state === 'suspended') context.resume();
  const master = context.createGain();
  master.gain.value = state.volume * .25;
  master.connect(context.destination);
  const t0 = context.currentTime;
  for (const [frequency, start, duration, type] of notes) {
   const osc = context.createOscillator(), gain = context.createGain();
   osc.type = type; osc.frequency.value = frequency;
   gain.gain.setValueAtTime(0, t0 + start);
   gain.gain.linearRampToValueAtTime(1, t0 + start + .008);
   gain.gain.exponentialRampToValueAtTime(.001, t0 + start + duration);
   osc.connect(gain); gain.connect(master);
   osc.start(t0 + start); osc.stop(t0 + start + duration + .02);
  }
  return true;
 } catch { return false; }
}
/** Quiet tap feedback for ordinary controls. Delegated so generated pages need no wiring. */
export function mountSound() {
 document.addEventListener('click', event => {
  const target = event.target.closest?.('.task-card, .chip, .btn, .copy-button');
  if (target && !target.hasAttribute('data-cue-test') && !target.classList.contains('copy-button')) playCue('tap');
 }, true);
}
