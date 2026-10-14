import {timingSafeEqual} from 'node:crypto';

const READ = 'read-unlock-ladder', STEP = 'request-unlock-step';
const TYPES = new Set([READ, STEP]);
const STATES = new Set(['advanced', 'cooldown', 'complete', 'rejected', 'busy', 'unavailable']);
const RECOVERY = new Set(['none', 'available', 'required']);
const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, list) => plain(value) && Reflect.ownKeys(value).length === list.length && list.every(key => Object.hasOwn(value, key));
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && /^[A-Za-z0-9_-]{43}$/.test(a) && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// The native host gives a request 35 seconds. An unanswered prompt is withdrawn before that.
export const PROMPT_TIMEOUT_MS = 30000;

/** The desktop's waiting period doubles from 30 seconds per escalation level and reaches its one hour cap at level 8,
 * so the ordered ladder has nine positions and every higher stored level reads as the last one. */
export const UNLOCK_LADDER_LEVELS = Object.freeze(Array.from({length: 9}, (_, index) => 'level-' + index));
const TOP = UNLOCK_LADDER_LEVELS.length - 1;

/** Normalizes the desktop's own waiting state into the fixed public shape, or null when it is not plausible. */
function describe(raw, now) {
  if (!plain(raw) || !Number.isSafeInteger(raw.level) || raw.level < 0 || !Number.isSafeInteger(raw.until) || raw.until < 0) return null;
  const index = Math.min(raw.level, TOP), cooling = raw.until > now();
  return {index, level: UNLOCK_LADDER_LEVELS[index], cooldownUntil: cooling ? raw.until : null, recovery: RECOVERY.has(raw.recovery) ? raw.recovery : 'none'};
}

/** Unlock-ladder scopes.
 * read-unlock-ladder needs a pairing only. It reports the desktop's own escalation level among the ordered levels, the
 * end of the shared cooldown when one is running, and the recovery state. Nothing secret is returned and no prompt is
 * shown.
 * request-unlock-step is a Re-authenticate scope. A running cooldown is reported and never bypassed: no prompt is shown
 * and nothing is attempted until it ends. Without escalation there is nothing to climb and the answer is complete. Only
 * when the cooldown has ended and a level is still recorded does the desktop run its own credential check in its own
 * native dialog (`authenticate`, which resolves to true only after the desktop verified the person; the credential and
 * every challenge stay in the desktop and never reach this module or the browser). The desktop's own state machine then
 * clears the escalation, and the answer reports the level read back afterwards. The pending prompt is shared with
 * Confirm mode, school mode and element locks through `gate`; a second request is answered busy. A locked or hidden
 * desktop, a closing desktop or a missing callback answers unavailable at once and never queues. Revoking (lock,
 * disconnect, exit, update preparation) withdraws the pending prompt. A rejection never ends the pairing. Responses
 * carry fixed fields only. */
export function createBrowserUnlockLadderMediation({getPair, isUnlocked, canPrompt = () => true, readUnlockLadder, authenticate, gate = {held: false}, now = Date.now, promptTimeoutMs = PROMPT_TIMEOUT_MS} = {}) {
  if (typeof getPair !== 'function' || typeof isUnlocked !== 'function') throw Error('Invalid browser unlock ladder configuration.');
  let closed = false, pending = null;
  const revoke = () => { pending?.abort(); };
  const read = async () => { try { return typeof readUnlockLadder === 'function' ? describe(await readUnlockLadder(), now) : null; } catch { return null; } };
  const answer = (state, view) => ({type: 'unlock-step', schemaVersion: 1, state: STATES.has(state) ? state : 'unavailable', level: view ? view.level : null, cooldownUntil: view ? view.cooldownUntil : null});
  return {
    supports: type => TYPES.has(type),
    revoke,
    close() { closed = true; revoke(); },
    get pending() { return pending ? 1 : 0; },
    async receive(origin, message, checkConnection) {
      const valid = typeof checkConnection === 'function' && keys(message, ['type', 'session']) && TYPES.has(message.type);
      if (!valid) throw Error('Unsupported browser unlock ladder request.');
      const pair = getPair(origin);
      const check = () => { checkConnection(); if (closed || !pair || getPair(origin) !== pair || pair.expires <= now() || !same(message.session, pair.session)) throw Error('Pair the browser again.'); };
      check();
      if (message.type === READ) {
        const view = await read();
        check();
        if (!view) throw Error('The unlock ladder is unavailable.');
        return {type: 'unlock-ladder', schemaVersion: 1, level: view.level, levels: [...UNLOCK_LADDER_LEVELS], cooldownUntil: view.cooldownUntil, recovery: view.recovery};
      }
      const admissible = () => { try { return !closed && isUnlocked() === true && canPrompt() === true; } catch { return false; } };
      if (typeof authenticate !== 'function' || typeof readUnlockLadder !== 'function' || !admissible()) return answer('unavailable', null);
      const before = await read();
      check();
      if (!before) return answer('unavailable', null);
      if (before.cooldownUntil !== null) return answer('cooldown', before);
      if (before.index === 0) return answer('complete', before);
      if (pending || gate.held) return answer('busy', before);
      const controller = new AbortController();
      pending = controller;
      gate.held = true;
      const deadline = setTimeout(() => controller.abort(), Math.max(1, promptTimeoutMs));
      try {
        let verdict = false;
        try { verdict = await authenticate({origin, signal: controller.signal}); } catch { verdict = false; }
        check();
        if (controller.signal.aborted) return answer('rejected', await read());
        if (verdict === 'unavailable') return answer('unavailable', await read());
        if (verdict !== true) return answer('rejected', await read());
        if (!admissible()) return answer('unavailable', null);
        const after = await read();
        check();
        if (!after) return answer('unavailable', null);
        if (after.cooldownUntil !== null) return answer('cooldown', after);
        return answer(after.index < before.index ? 'advanced' : 'rejected', after);
      } finally { clearTimeout(deadline); gate.held = false; if (pending === controller) pending = null; }
    },
  };
}
