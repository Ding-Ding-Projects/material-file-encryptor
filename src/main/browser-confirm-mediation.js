import {timingSafeEqual} from 'node:crypto';

const TYPES = new Set(['focus-authenticator']);
const STATES = new Set(['shown', 'rejected', 'busy', 'unavailable']);
const exact = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === 2 && Object.hasOwn(value, 'type') && Object.hasOwn(value, 'session');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && /^[A-Za-z0-9_-]{43}$/.test(a) && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const answer = state => ({type: 'authenticator-focused', schemaVersion: 1, state: STATES.has(state) ? state : 'unavailable'});

/** Confirm-mode scopes. Each request needs a valid pairing and then a native
 * approval in the unlocked desktop. At most one prompt is pending; a second
 * request is answered busy. A locked desktop, a hidden window, a closing
 * desktop or a missing approval callback refuses at once and never queues.
 * Revoking (lock, disconnect, exit, update preparation) withdraws the pending
 * prompt as rejected. A rejection never ends the pairing. Responses carry a
 * fixed state word only: no code, account name, secret or path. */
// The native host gives a request 35 seconds. An unanswered prompt is withdrawn as rejected before that, so the
// browser always receives an answer and a forgotten prompt never leaves later requests stuck on busy.
export const PROMPT_TIMEOUT_MS = 30000;
export function createBrowserConfirmMediation({getPair, isUnlocked, canPrompt = () => true, confirm, focusAuthenticator, now = Date.now, promptTimeoutMs = PROMPT_TIMEOUT_MS} = {}) {
  if (typeof getPair !== 'function' || typeof isUnlocked !== 'function') throw Error('Invalid browser confirmation configuration.');
  let closed = false, pending = null;
  const revoke = () => { pending?.abort(); };
  return {
    supports: type => TYPES.has(type),
    revoke,
    close() { closed = true; revoke(); },
    get pending() { return pending ? 1 : 0; },
    async receive(origin, message, checkConnection) {
      if (!exact(message) || !TYPES.has(message.type) || typeof checkConnection !== 'function') throw Error('Unsupported browser confirmation request.');
      const pair = getPair(origin);
      const check = () => { checkConnection(); if (closed || !pair || getPair(origin) !== pair || pair.expires <= now() || !same(message.session, pair.session)) throw Error('Pair the browser again.'); };
      check();
      const admissible = () => { try { return !closed && isUnlocked() === true && canPrompt() === true; } catch { return false; } };
      if (typeof confirm !== 'function' || typeof focusAuthenticator !== 'function' || !admissible()) return answer('unavailable');
      if (pending) return answer('busy');
      const controller = new AbortController();
      pending = controller;
      const deadline = setTimeout(() => controller.abort(), Math.max(1, promptTimeoutMs));
      try {
        let approved = false;
        try { approved = await confirm({origin, action: message.type, signal: controller.signal}) === true; } catch { approved = false; }
        check();
        if (!approved || controller.signal.aborted) return answer('rejected');
        if (!admissible()) return answer('unavailable');
        try { await focusAuthenticator(); } catch { return answer('unavailable'); }
        check();
        return answer('shown');
      } finally { clearTimeout(deadline); if (pending === controller) pending = null; }
    },
  };
}
