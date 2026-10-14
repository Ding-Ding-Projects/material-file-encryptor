import {timingSafeEqual} from 'node:crypto';
import {EXTENSION_LOCK_TABS, isExtensionLockTab} from '../shared/extension-lock-targets.js';

const READ = 'read-element-locks', SET = 'set-element-lock';
const TYPES = new Set([READ, SET]);
const STATES = new Set(['changed', 'unchanged', 'rejected', 'busy', 'unavailable']);
const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, list) => plain(value) && Reflect.ownKeys(value).length === list.length && list.every(key => Object.hasOwn(value, key));
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && /^[A-Za-z0-9_-]{43}$/.test(a) && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// The native host gives a request 35 seconds. An unanswered prompt is withdrawn before that.
export const PROMPT_TIMEOUT_MS = 30000;

/** Element-lock scopes for the reviewed extension targets.
 * read-element-locks needs a pairing only and answers with the tab ids that currently have a desktop lock record.
 * set-element-lock is a Re-authenticate scope for both locking and unlocking: it needs a pairing and then a fresh
 * native check in the unlocked desktop (`authenticate`, which resolves to true only after the desktop verified the
 * person; the credential never reaches this module or the browser). The pending prompt is shared with Confirm mode
 * and school mode through `gate`; a second request is answered busy. A locked or hidden desktop, a closing desktop
 * or a missing callback answers unavailable at once and never queues. Revoking (lock, disconnect, exit, update
 * preparation) withdraws the pending prompt. A rejection never ends the pairing. Targets outside the reviewed list
 * are refused before anything else happens. Responses carry fixed fields only: no credential, record or path. */
export function createBrowserElementLockMediation({getPair, isUnlocked, canPrompt = () => true, readElementLocks, authenticate, applyElementLock, gate = {held: false}, now = Date.now, promptTimeoutMs = PROMPT_TIMEOUT_MS} = {}) {
  if (typeof getPair !== 'function' || typeof isUnlocked !== 'function') throw Error('Invalid browser element lock configuration.');
  let closed = false, pending = null;
  const revoke = () => { pending?.abort(); };
  const answer = (state, target, locked) => ({type: 'element-lock-set', schemaVersion: 1, state: STATES.has(state) ? state : 'unavailable', target, locked: typeof locked === 'boolean' ? locked : null});
  const lockedNow = async target => { try { const list = await readElementLocks(); return Array.isArray(list) ? list.includes(target) : null; } catch { return null; } };
  return {
    supports: type => TYPES.has(type),
    revoke,
    close() { closed = true; revoke(); },
    get pending() { return pending ? 1 : 0; },
    async receive(origin, message, checkConnection) {
      const valid = typeof checkConnection === 'function' && (keys(message, ['type', 'session']) && message.type === READ || keys(message, ['type', 'session', 'target', 'locked']) && message.type === SET && isExtensionLockTab(message.target) && typeof message.locked === 'boolean');
      if (!valid) throw Error('Unsupported browser element lock request.');
      const pair = getPair(origin);
      const check = () => { checkConnection(); if (closed || !pair || getPair(origin) !== pair || pair.expires <= now() || !same(message.session, pair.session)) throw Error('Pair the browser again.'); };
      check();
      if (message.type === READ) {
        if (typeof readElementLocks !== 'function') throw Error('Element locks are unavailable.');
        const list = await readElementLocks();
        check();
        if (!Array.isArray(list)) throw Error('Element locks are unavailable.');
        return {type: 'element-locks', schemaVersion: 1, locked: EXTENSION_LOCK_TABS.filter(tab => list.includes(tab))};
      }
      const target = message.target;
      const admissible = () => { try { return !closed && isUnlocked() === true && canPrompt() === true; } catch { return false; } };
      if (typeof authenticate !== 'function' || typeof applyElementLock !== 'function' || typeof readElementLocks !== 'function' || !admissible()) return answer('unavailable', target, null);
      if (pending || gate.held) return answer('busy', target, await lockedNow(target));
      const controller = new AbortController();
      pending = controller;
      gate.held = true;
      const deadline = setTimeout(() => controller.abort(), Math.max(1, promptTimeoutMs));
      try {
        let verdict = false;
        try { verdict = await authenticate({origin, target, signal: controller.signal}); } catch { verdict = false; }
        check();
        if (controller.signal.aborted) return answer('rejected', target, await lockedNow(target));
        if (verdict === 'unavailable') return answer('unavailable', target, await lockedNow(target));
        if (verdict !== true) return answer('rejected', target, await lockedNow(target));
        if (!admissible()) return answer('unavailable', target, null);
        let result = null;
        try { result = await applyElementLock({target, locked: message.locked, signal: controller.signal}); } catch { result = null; }
        check();
        if (!plain(result) || !['changed', 'unchanged', 'rejected'].includes(result.state) || typeof result.locked !== 'boolean') return answer('unavailable', target, await lockedNow(target));
        return answer(result.state, target, result.locked);
      } finally { clearTimeout(deadline); gate.held = false; if (pending === controller) pending = null; }
    },
  };
}
