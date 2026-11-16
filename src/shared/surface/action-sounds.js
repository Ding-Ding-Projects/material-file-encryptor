// Short action sound effects, synthesized locally with Web Audio.
//
// Nothing here touches the network or ships a recorded sample: every cue is a few sine or triangle
// notes shaped by an envelope. The service is deliberately defensive:
//   * a playback failure never throws and never changes the result of the action that asked for it;
//   * the audio context is created lazily, on the first cue that is actually allowed to play;
//   * cues respect the switch, volume, mute, reduced-sound and quiet-hours settings;
//   * cues never pile up: a quieter cue is dropped while a louder one is sounding, and the same cue
//     is debounced, so a burst of actions cannot become a wall of noise.

/** Priority decides which cue wins while another is still sounding. */
export const CUE_PRIORITY = Object.freeze({ toggle: 1, copy: 1, delete: 2, sync: 2, upload: 2, lock: 2, unlock: 2, success: 2, installSuccess: 3, warning: 3, error: 4, installError: 4, celebration: 5 });

// Each note: frequency in Hz (or [from, to] for a glide), start offset and length in seconds, peak gain 0..1.
const NOTE = (f, at, dur, gain = 1, type = 'sine') => ({ f, at, dur, gain, type });

export const CUES = Object.freeze({
  success: [NOTE(660, 0, .09, .8), NOTE(880, .08, .14, 1)],
  warning: [NOTE(440, 0, .1, .9, 'triangle'), NOTE(440, .13, .12, .9, 'triangle')],
  error: [NOTE(330, 0, .13, 1, 'triangle'), NOTE(247, .12, .2, 1, 'triangle')],
  unlock: [NOTE(523, 0, .08, .8), NOTE(659, .07, .08, .9), NOTE(784, .14, .16, 1)],
  lock: [NOTE(784, 0, .08, .8), NOTE(587, .07, .08, .9), NOTE(392, .14, .16, 1)],
  upload: [NOTE([520, 780], 0, .12, .9), NOTE(990, .12, .14, 1)],
  sync: [NOTE(587, 0, .07, .7), NOTE(740, .07, .07, .8), NOTE(880, .14, .12, 1)],
  delete: [NOTE([520, 260], 0, .16, .9, 'triangle')],
  copy: [NOTE(1100, 0, .05, .7), NOTE(1480, .045, .06, .8)],
  toggle: [NOTE(900, 0, .04, .6)],
  installSuccess: [NOTE(523, 0, .09, .8), NOTE(659, .09, .09, .9), NOTE(784, .18, .09, 1), NOTE(1047, .27, .22, 1)],
  installError: [NOTE(311, 0, .14, 1, 'triangle'), NOTE(233, .14, .14, 1, 'triangle'), NOTE(185, .28, .24, 1, 'triangle')],
  // A tada-style fanfare: a quick rising arpeggio that lands on a held chord.
  celebration: [
    NOTE(523, 0, .09, .8), NOTE(659, .08, .09, .85), NOTE(784, .16, .09, .9),
    NOTE(1047, .26, .5, 1), NOTE(784, .26, .5, .6), NOTE(659, .26, .5, .5),
  ],
});

export const CUE_NAMES = Object.freeze(Object.keys(CUES));

export const DEFAULT_SOUND_SETTINGS = Object.freeze({
  enabled: true,
  volume: 60, // percent, 0..100
  muted: false,
  reducedSound: false,
  quietHours: Object.freeze({ enabled: false, start: '22:00', end: '07:00' }),
});

const MASTER_CEILING = 0.28; // Even at 100% the cues stay well below clipping and below speech.

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Clamps untrusted stored settings to a safe, complete object. */
export function normalizeSoundSettings(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const hours = source.quietHours && typeof source.quietHours === 'object' ? source.quietHours : {};
  const time = (value, fallback) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)) ? String(value) : fallback);
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_SOUND_SETTINGS.enabled,
    volume: Number.isFinite(Number(source.volume)) && source.volume !== null && source.volume !== '' ? clamp(Math.round(Number(source.volume)), 0, 100) : DEFAULT_SOUND_SETTINGS.volume,
    muted: source.muted === true,
    reducedSound: source.reducedSound === true,
    quietHours: {
      enabled: hours.enabled === true,
      start: time(hours.start, DEFAULT_SOUND_SETTINGS.quietHours.start),
      end: time(hours.end, DEFAULT_SOUND_SETTINGS.quietHours.end),
    },
  };
}

const minutes = value => { const [h, m] = String(value).split(':').map(Number); return h * 60 + m; };

/** True when the clock falls inside the quiet window. A window that ends before it starts crosses midnight. */
export function inQuietHours(quiet, date) {
  if (!quiet?.enabled) return false;
  const start = minutes(quiet.start), end = minutes(quiet.end), now = date.getHours() * 60 + date.getMinutes();
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** The reason a cue was or was not played, for tests and for the Settings "test" control. */
export const PLAY = Object.freeze({ PLAYED: 'played', DISABLED: 'disabled', MUTED: 'muted', QUIET: 'quiet-hours', UNKNOWN: 'unknown-cue', BUSY: 'busy', DEBOUNCED: 'debounced', UNAVAILABLE: 'unavailable', FAILED: 'failed' });

export function createActionSounds({
  Context = globalThis.AudioContext || globalThis.webkitAudioContext,
  settings = DEFAULT_SOUND_SETTINGS,
  clock = () => Date.now(),
  date = () => new Date(),
  debounceMs = 90,
  prefersReducedSound = () => false,
} = {}) {
  let current = normalizeSoundSettings(settings), context = null, busyUntil = 0, busyPriority = 0, last = new Map(), nodes = new Set(), failed = false;

  const gate = name => {
    if (!Object.hasOwn(CUES, name)) return PLAY.UNKNOWN;
    if (!current.enabled) return PLAY.DISABLED;
    if (current.muted || current.volume <= 0) return PLAY.MUTED;
    if (inQuietHours(current.quietHours, date())) return PLAY.QUIET;
    if (!Context || failed) return PLAY.UNAVAILABLE;
    return PLAY.PLAYED;
  };

  function release(node) { nodes.delete(node); try { node.disconnect(); } catch { /* already detached */ } }

  function schedule(ctx, name, reduced) {
    const volume = current.volume / 100 * MASTER_CEILING * (reduced ? .5 : 1);
    const notes = reduced ? CUES[name].slice(0, 1) : CUES[name];
    let end = 0;
    for (const note of notes) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      const start = ctx.currentTime + note.at, stop = start + note.dur, peak = Math.max(.0001, volume * note.gain);
      osc.type = note.type;
      const [from, to] = Array.isArray(note.f) ? note.f : [note.f, note.f];
      osc.frequency.setValueAtTime?.(from, start);
      if (from !== to) osc.frequency.exponentialRampToValueAtTime?.(to, stop);
      if (!osc.frequency.setValueAtTime) osc.frequency.value = from;
      // A quick attack and an exponential release keep every note click-free.
      gain.gain.setValueAtTime?.(.0001, start);
      gain.gain.exponentialRampToValueAtTime?.(peak, start + Math.min(.012, note.dur / 3));
      gain.gain.exponentialRampToValueAtTime?.(.0001, stop);
      if (!gain.gain.setValueAtTime) gain.gain.value = peak;
      osc.connect(gain); gain.connect(ctx.destination);
      nodes.add(osc); nodes.add(gain);
      osc.onended = () => { release(osc); release(gain); };
      osc.start(start); osc.stop(stop + .02);
      end = Math.max(end, note.at + note.dur);
    }
    return end;
  }

  return {
    /** Plays one cue. Always returns a result object and never throws. */
    play(name) {
      try {
        const verdict = gate(name);
        if (verdict !== PLAY.PLAYED) return { played: false, reason: verdict };
        const now = clock(), priority = CUE_PRIORITY[name] || 1;
        if (last.has(name) && now - last.get(name) < debounceMs) return { played: false, reason: PLAY.DEBOUNCED };
        if (now < busyUntil && priority <= busyPriority) return { played: false, reason: PLAY.BUSY };
        context ??= new Context();
        if (context.state === 'suspended') Promise.resolve(context.resume?.()).catch(() => {});
        const reduced = current.reducedSound || prefersReducedSound() === true;
        const seconds = schedule(context, name, reduced);
        last.set(name, now); busyUntil = now + seconds * 1000; busyPriority = priority;
        return { played: true, reason: PLAY.PLAYED };
      } catch {
        failed = true; // One broken context is not retried on every action.
        return { played: false, reason: PLAY.FAILED };
      }
    },
    /** Replaces the settings. Turning sounds off or muting also silences anything still sounding. */
    configure(next) {
      current = normalizeSoundSettings({ ...current, ...(next || {}) });
      failed = false;
      if (!current.enabled || current.muted) this.silence();
      return { ...current, quietHours: { ...current.quietHours } };
    },
    get settings() { return { ...current, quietHours: { ...current.quietHours } }; },
    /** Stops every sounding note at once. */
    silence() { for (const node of [...nodes]) { try { node.stop?.(); } catch { /* already stopped */ } release(node); } busyUntil = 0; busyPriority = 0; },
    destroy() { this.silence(); try { context?.close?.(); } catch { /* ignore */ } context = null; last = new Map(); },
  };
}

export const ACTION_CUE_EVENT = 'mfe:action-cue';

/** Lets a feature module ask for a cue without importing the service. The shell owns the listener. */
export function requestCue(target, name) {
  try { target?.dispatchEvent?.(new CustomEvent(ACTION_CUE_EVENT, { detail: { cue: name } })); } catch { /* a cue is never required */ }
}
