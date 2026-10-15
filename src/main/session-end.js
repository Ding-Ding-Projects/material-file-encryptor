// Session-end and suspend handling for a mounted encrypted drive.
//
// When Windows ends the session (shutdown, restart, sign-out) the application is
// given only a few seconds, so everything here is bounded by a deadline and never
// blocks the shutdown. Every acknowledged write is already in the encrypted
// journal; this step makes the end state clean (work cancelled, descriptors
// released, drive dismounted, journal committed) rather than relying on replay.
// When the lock cannot be confirmed in time the interrupted-session marker is
// kept, so the next start opens locked and recovery replays the journal.

const DEFAULT_DEADLINE_MS = 4000;

function withDeadline(task, milliseconds) {
  let timer;
  const deadline = new Promise(resolve => { timer = setTimeout(() => resolve({ timedOut: true }), milliseconds); timer.unref?.(); });
  return Promise.race([Promise.resolve().then(task).then(value => ({ value }), error => ({ error })), deadline])
    .finally(() => clearTimeout(timer));
}

/**
 * @param {object} options
 * @param {(options: {timeoutMs: number}) => Promise<{locked?: boolean}>} options.forceLock Native force lock.
 * @param {() => Promise<unknown>} options.flushJournal Native journal commit without dismounting.
 * @param {() => boolean} options.isMounted True while a drive is unlocked or mounted.
 * @param {() => void | Promise<void>} options.clearMarker Removes the interrupted-session marker.
 * @param {() => void} [options.beforeLock] Revokes browser and local-adapter authority.
 * @param {number} [options.deadlineMs]
 */
export function createSessionEnd({ forceLock, flushJournal, isMounted, clearMarker, beforeLock = () => {}, deadlineMs = DEFAULT_DEADLINE_MS }) {
  let ending = null;
  return {
    // The session is ending. Idempotent: Windows can report it twice.
    end() {
      ending ??= (async () => {
        if (!isMounted()) { await clearMarker(); return { locked: true, reason: 'already-locked' }; }
        try { beforeLock(); } catch { /* Authority revocation must never stop the lock. */ }
        const outcome = await withDeadline(() => forceLock({ timeoutMs: Math.max(0, deadlineMs - 1000) }), deadlineMs);
        const locked = outcome.value?.locked === true;
        if (locked) await clearMarker();
        return { locked, reason: locked ? 'locked' : outcome.timedOut ? 'deadline' : outcome.error ? 'error' : 'busy' };
      })();
      return ending;
    },
    // The machine is going to sleep. The drive stays mounted so work continues on
    // resume; committing the journal means a power loss during sleep replays from
    // a committed state.
    async suspend() {
      if (!isMounted()) return { flushed: false, reason: 'already-locked' };
      const outcome = await withDeadline(() => flushJournal(), deadlineMs);
      return { flushed: outcome.value?.flushed === true, reason: outcome.timedOut ? 'deadline' : outcome.error ? 'error' : 'flushed' };
    },
    get ending() { return ending !== null; },
  };
}
