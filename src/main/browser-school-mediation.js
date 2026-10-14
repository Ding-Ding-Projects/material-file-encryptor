import {timingSafeEqual} from 'node:crypto';

const READ = 'read-school-mode', SET = 'set-school-mode';
const TYPES = new Set([READ, SET]);
const STATES = new Set(['changed', 'unchanged', 'rejected', 'busy', 'unavailable']);
const DEFAULT_NAME = 'School mode';
const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, list) => plain(value) && Reflect.ownKeys(value).length === list.length && list.every(key => Object.hasOwn(value, key));
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && /^[A-Za-z0-9_-]{43}$/.test(a) && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The display name of the mode is plain text of bounded length: control, line-separator and format characters
 * (including bidirectional overrides) are removed and runs of spaces collapse. */
export function cleanModeName(value) {
  if (typeof value !== 'string') return DEFAULT_NAME;
  const text = value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
  return text && text.length <= 80 ? text : text ? text.slice(0, 80).trim() : DEFAULT_NAME;
}

// The native host gives a request 35 seconds. An unanswered prompt is withdrawn before that, so the browser
// always receives an answer and a forgotten prompt never leaves later requests stuck on busy.
export const PROMPT_TIMEOUT_MS = 30000;

/** School-mode scopes.
 * read-school-mode needs a pairing only and answers with the mode's name and on/off state.
 * set-school-mode is a Re-authenticate scope: it needs a pairing and then a fresh native check in the unlocked
 * desktop (`authenticate`, which resolves to true only after the desktop verified the person). The credential is
 * entered in the desktop and never reaches this module or the browser. At most one prompt is pending and it is
 * shared with Confirm mode through `gate`; a second request is answered busy. A locked or hidden desktop, a
 * closing desktop or a missing callback answers unavailable at once and never queues. Revoking (lock,
 * disconnect, exit, update preparation) withdraws the pending prompt. A rejection never ends the pairing.
 * Responses carry fixed fields only: no credential, profile data or path. */
export function createBrowserSchoolMediation({getPair, isUnlocked, canPrompt = () => true, readSchoolMode, authenticate, applySchoolMode, gate = {held: false}, now = Date.now, promptTimeoutMs = PROMPT_TIMEOUT_MS} = {}) {
  if (typeof getPair !== 'function' || typeof isUnlocked !== 'function') throw Error('Invalid browser school mode configuration.');
  let closed = false, pending = null;
  const revoke = () => { pending?.abort(); };
  const answer = (state, enabled) => ({type: 'school-mode-set', schemaVersion: 1, state: STATES.has(state) ? state : 'unavailable', enabled: typeof enabled === 'boolean' ? enabled : null});
  const current = async () => { try { const value = await readSchoolMode(); return typeof value?.enabled === 'boolean' ? value.enabled : null; } catch { return null; } };
  return {
    supports: type => TYPES.has(type),
    revoke,
    close() { closed = true; revoke(); },
    get pending() { return pending ? 1 : 0; },
    async receive(origin, message, checkConnection) {
      const valid = typeof checkConnection === 'function' && (keys(message, ['type', 'session']) && message.type === READ || keys(message, ['type', 'session', 'enabled']) && message.type === SET && typeof message.enabled === 'boolean');
      if (!valid) throw Error('Unsupported browser school mode request.');
      const pair = getPair(origin);
      const check = () => { checkConnection(); if (closed || !pair || getPair(origin) !== pair || pair.expires <= now() || !same(message.session, pair.session)) throw Error('Pair the browser again.'); };
      check();
      if (message.type === READ) {
        if (typeof readSchoolMode !== 'function') throw Error('School mode is unavailable.');
        const value = await readSchoolMode();
        check();
        if (typeof value?.enabled !== 'boolean') throw Error('School mode is unavailable.');
        return {type: 'school-mode', schemaVersion: 1, enabled: value.enabled, name: cleanModeName(value.name)};
      }
      const admissible = () => { try { return !closed && isUnlocked() === true && canPrompt() === true; } catch { return false; } };
      if (typeof authenticate !== 'function' || typeof applySchoolMode !== 'function' || typeof readSchoolMode !== 'function' || !admissible()) return answer('unavailable', null);
      if (pending || gate.held) return answer('busy', await current());
      const controller = new AbortController();
      pending = controller;
      gate.held = true;
      const deadline = setTimeout(() => controller.abort(), Math.max(1, promptTimeoutMs));
      try {
        let verdict = false;
        try { verdict = await authenticate({origin, signal: controller.signal}); } catch { verdict = false; }
        check();
        if (controller.signal.aborted) return answer('rejected', await current());
        if (verdict === 'unavailable') return answer('unavailable', await current());
        if (verdict !== true) return answer('rejected', await current());
        if (!admissible()) return answer('unavailable', null);
        let result = null;
        try { result = await applySchoolMode({enabled: message.enabled, signal: controller.signal}); } catch { result = null; }
        check();
        if (!plain(result) || !['changed', 'unchanged', 'rejected'].includes(result.state) || typeof result.enabled !== 'boolean') return answer('unavailable', await current());
        return answer(result.state, result.enabled);
      } finally { clearTimeout(deadline); gate.held = false; if (pending === controller) pending = null; }
    },
  };
}
