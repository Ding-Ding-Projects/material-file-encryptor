// Unlock choreography: a ring bursts from the drive badge when a drive unlocks, and the unlock form shakes when the
// password or key is refused. Timing comes from the "Unlock burst" motion tokens, so the animation editor tunes it,
// and nothing moves while reduced motion is in force.
import {effectiveKind} from './motion-tokens.js';

export function createUnlockChoreography({controller, getBadge = () => null, getForm = () => null} = {}) {
  /** Plays the burst ('success') or the shake ('failure'). Returns the animation, or null when nothing moved. */
  function play(kind) {
    const snap = controller.snapshot();
    const reducedMotion = snap.reduced;
    if (reducedMotion) return null;
    const values = effectiveKind(snap.state.profile, 'unlock', {reduced: reducedMotion});
    if (!values.enabled || values.duration <= 0) return null;
    const target = kind === 'success' ? getBadge() : getForm();
    if (!target || typeof target.animate !== 'function') return null;
    if (kind === 'success') {
      const ring = Math.max(8, values.distance * 3);
      return target.animate([
        {boxShadow: '0 0 0 0 color-mix(in srgb, var(--md-sys-color-primary, #52643f) 70%, transparent)', transform: 'scale(1)'},
        {boxShadow: `0 0 0 ${ring}px transparent`, transform: `scale(${(1 + (values.scale - 1) * 0.06).toFixed(3)})`, offset: 0.6},
        {boxShadow: `0 0 0 ${ring}px transparent`, transform: 'scale(1)'}
      ], {duration: values.duration, delay: values.delay, easing: values.easing});
    }
    const shake = Math.max(4, values.distance);
    return target.animate([
      {transform: 'none'}, {transform: `translateX(${-shake}px)`, offset: 0.2}, {transform: `translateX(${shake}px)`, offset: 0.4},
      {transform: `translateX(${-shake}px)`, offset: 0.6}, {transform: `translateX(${shake}px)`, offset: 0.8}, {transform: 'none'}
    ], {duration: Math.round(values.duration * 0.47), delay: values.delay, easing: 'linear'});
  }
  return {play};
}
