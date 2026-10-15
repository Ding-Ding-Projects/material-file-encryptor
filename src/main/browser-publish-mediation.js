import {timingSafeEqual} from 'node:crypto';
import {validateRequest, RESULT_STATES} from '../shared/publication-request.js';

const TYPE = 'publish-progress';
const exact = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === 3 && Object.hasOwn(value, 'type') && Object.hasOwn(value, 'session') && Object.hasOwn(value, 'request');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && /^[A-Za-z0-9_-]{43}$/.test(a) && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const answer = state => ({type: 'publish-progress-result', schemaVersion: 1, state: RESULT_STATES.includes(state) ? state : 'unavailable'});

/** Confirm-mode scope for progress and publication notes. The request has already been sanitized by the browser and
 * is validated again here, so an unsanitized or malformed note is refused as an error and never shown or forwarded.
 * It needs a valid pairing, an unlocked desktop with a visible window and a publishing route (`publishProgress`).
 * Without a route the answer is a fixed `unavailable` and no prompt is shown, so nothing pretends to publish. At most
 * one prompt is pending and it shares the single prompt gate; a second request is answered `busy`. Revoking (lock,
 * disconnect, exit, update preparation) withdraws the pending prompt as rejected. Responses carry a fixed state word
 * only: no note text, link, account name, secret or path comes back. */
export const PUBLISH_PROMPT_TIMEOUT_MS = 30000;
export function createBrowserPublishMediation({getPair, isUnlocked, canPrompt = () => true, confirm, publishProgress, gate = {held: false}, now = Date.now, promptTimeoutMs = PUBLISH_PROMPT_TIMEOUT_MS} = {}) {
  if (typeof getPair !== 'function' || typeof isUnlocked !== 'function') throw Error('Invalid browser publication configuration.');
  let closed = false, pending = null;
  const revoke = () => { pending?.abort(); };
  return {
    supports: type => type === TYPE,
    revoke,
    close() { closed = true; revoke(); },
    get pending() { return pending ? 1 : 0; },
    async receive(origin, message, checkConnection) {
      if (!exact(message) || message.type !== TYPE || typeof checkConnection !== 'function') throw Error('Unsupported browser publication request.');
      const pair = getPair(origin);
      const check = () => { checkConnection(); if (closed || !pair || getPair(origin) !== pair || pair.expires <= now() || !same(message.session, pair.session)) throw Error('Pair the browser again.'); };
      check();
      if (!validateRequest(message.request).ok) throw Error('Invalid browser publication request.');
      const request = Object.freeze({...message.request, links: Object.freeze(message.request.links.slice())});
      const admissible = () => { try { return !closed && isUnlocked() === true && canPrompt() === true; } catch { return false; } };
      if (typeof confirm !== 'function' || typeof publishProgress !== 'function' || !admissible()) return answer('unavailable');
      if (pending || gate.held) return answer('busy');
      const controller = new AbortController();
      pending = controller;
      gate.held = true;
      const deadline = setTimeout(() => controller.abort(), Math.max(1, promptTimeoutMs));
      try {
        let approved = false;
        try { approved = await confirm({origin, action: TYPE, signal: controller.signal, request}) === true; } catch { approved = false; }
        check();
        if (!approved || controller.signal.aborted) return answer('rejected');
        if (!admissible()) return answer('unavailable');
        let accepted = false;
        try { accepted = await publishProgress(request, {signal: controller.signal}) === true; } catch { accepted = false; }
        check();
        return answer(accepted ? 'approved' : 'unavailable');
      } finally { clearTimeout(deadline); gate.held = false; if (pending === controller) pending = null; }
    },
  };
}
