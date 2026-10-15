import {timingSafeEqual} from 'node:crypto';
import {TARGET_IDS} from '../features/server-manager/targets.js';

const LIST = 'read-servers', CATALOG = 'read-server-catalog', MANAGE = 'manage-server';
const TYPES = new Set([LIST, CATALOG, MANAGE]);
export const SERVER_ACTIONS = Object.freeze(['create', 'start', 'stop', 'restart', 'change-setting', 'install-plugin']);
export const SERVER_STATES = Object.freeze(['preparing', 'prepared', 'starting', 'running', 'stopping', 'stopped', 'failed', 'unavailable']);
const RESULTS = new Set(['changed', 'unchanged', 'rejected', 'busy', 'unavailable']);
const CHANNELS = new Set(['release', 'snapshot', 'old_beta', 'old_alpha']);
const CATALOGUE_STATES = new Set(['ready', 'not-loaded', 'unavailable']);
export const MAX_SERVERS = 100, MAX_VERSIONS = 100, MAX_FLAVORS = 32;

const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, list) => plain(value) && Reflect.ownKeys(value).length === list.length && list.every(key => Object.hasOwn(value, key));
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && /^[A-Za-z0-9_-]{43}$/.test(a) && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
export const serverId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
export const flavorId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,23}$/.test(value);
export const versionId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._ -]{0,31}$/.test(value);
export const settingKey = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value);
export const pluginId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value);
const settingValue = value => typeof value === 'boolean' || Number.isSafeInteger(value) || typeof value === 'string' && value.length <= 256 && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
const cursorValid = value => value === null || typeof value === 'string' && /^\d{1,5}$/.test(value);

/** Whether a manage request is well formed. Only fixed identifiers and bounded plain values are accepted: no path, URL,
 * host, key, password or command can be expressed, so target credentials can never travel through the browser. */
export function validManageRequest(message) {
  if (!keys(message, ['type', 'session', 'action', 'server', 'options']) || message.type !== MANAGE || !SERVER_ACTIONS.includes(message.action)) return false;
  const {action, server, options} = message;
  if (action === 'create') return server === null && keys(options, ['target', 'flavor', 'version']) && TARGET_IDS.includes(options.target) && flavorId(options.flavor) && versionId(options.version);
  if (!serverId(server)) return false;
  if (action === 'change-setting') return keys(options, ['key', 'value']) && settingKey(options.key) && settingValue(options.value);
  if (action === 'install-plugin') return keys(options, ['plugin']) && pluginId(options.plugin);
  return options === null;
}

function cleanServer(row) {
  if (!keys(row, ['id', 'name', 'target', 'flavor', 'version', 'state']) || !serverId(row.id) || !text(row.name, 80) || !TARGET_IDS.includes(row.target) || !flavorId(row.flavor) || !versionId(row.version) || !SERVER_STATES.includes(row.state)) throw Error('Server list is unavailable.');
  return {id: row.id, name: row.name, target: row.target, flavor: row.flavor, version: row.version, state: row.state};
}
function cleanTargets(rows) {
  if (!Array.isArray(rows) || rows.length !== TARGET_IDS.length) throw Error('Server targets are unavailable.');
  return TARGET_IDS.map(id => { const row = rows.find(item => item?.id === id); if (!keys(row, ['id', 'available']) || typeof row.available !== 'boolean') throw Error('Server targets are unavailable.'); return {id, available: row.available}; });
}

// The native host gives a request 35 seconds. An unanswered prompt is withdrawn before that.
export const PROMPT_TIMEOUT_MS = 30000;

/** Server-manager scopes for the paired extension. The extension is a client of the desktop server manager; it never runs a
 * server itself.
 * read-servers and read-server-catalog need a pairing only. They answer with fixed fields: no path, address, key or log.
 * manage-server is a Re-authenticate scope for create, start, stop, restart, change-setting and install-plugin: it needs a
 * pairing and then a fresh native check in the unlocked desktop (`authenticate`, which resolves to true only after the
 * desktop verified the person; the credential never reaches this module or the browser). The pending prompt is shared with
 * Confirm mode, school mode, element locks and the unlock ladder through `gate`; a second request is answered busy. A
 * locked or hidden desktop, a closing desktop or a missing callback answers unavailable at once and never queues. An
 * action the desktop manager does not implement (`supports` returns false) is answered unavailable without any prompt,
 * so nobody is asked to approve something that cannot happen. A failed adapter call is answered unavailable and never as
 * success. Revoking (lock, disconnect, exit, update preparation) withdraws the pending prompt. A rejection never ends the
 * pairing. SSH and container credentials stay in the desktop: a request can only name a fixed target id. */
export function createBrowserServerMediation({getPair, isUnlocked, canPrompt = () => true, readServers, readServerCatalog, supports = () => true, authenticate, applyServerAction, gate = {held: false}, now = Date.now, promptTimeoutMs = PROMPT_TIMEOUT_MS} = {}) {
  if (typeof getPair !== 'function' || typeof isUnlocked !== 'function') throw Error('Invalid browser server configuration.');
  let closed = false, pending = null;
  const revoke = () => { pending?.abort(); };
  const answer = (state, action, server) => ({type: 'server-managed', schemaVersion: 1, state: RESULTS.has(state) ? state : 'unavailable', action, server: typeof server === 'string' && serverId(server) ? server : null});
  return {
    supports: type => TYPES.has(type),
    revoke,
    close() { closed = true; revoke(); },
    get pending() { return pending ? 1 : 0; },
    async receive(origin, message, checkConnection) {
      const valid = typeof checkConnection === 'function' && (keys(message, ['type', 'session']) && message.type === LIST || keys(message, ['type', 'session', 'cursor']) && message.type === CATALOG && cursorValid(message.cursor) || validManageRequest(message));
      if (!valid) throw Error('Unsupported browser server request.');
      const pair = getPair(origin);
      const check = () => { checkConnection(); if (closed || !pair || getPair(origin) !== pair || pair.expires <= now() || !same(message.session, pair.session)) throw Error('Pair the browser again.'); };
      check();
      if (message.type === LIST) {
        if (typeof readServers !== 'function') return {type: 'servers', schemaVersion: 1, manager: 'unavailable', targets: TARGET_IDS.map(id => ({id, available: false})), servers: []};
        let value;
        try { value = await readServers(); } catch { value = null; }
        check();
        if (!keys(value, ['manager', 'targets', 'servers']) || !['available', 'unavailable'].includes(value.manager) || !Array.isArray(value.servers) || value.servers.length > MAX_SERVERS) throw Error('Servers are unavailable.');
        const servers = value.servers.map(cleanServer);
        if (new Set(servers.map(row => row.id)).size !== servers.length) throw Error('Servers are unavailable.');
        return {type: 'servers', schemaVersion: 1, manager: value.manager, targets: cleanTargets(value.targets), servers};
      }
      if (message.type === CATALOG) {
        if (typeof readServerCatalog !== 'function') return {type: 'server-catalog', schemaVersion: 1, catalogue: 'unavailable', flavors: [], versions: [], total: 0, next: null};
        let value;
        try { value = await readServerCatalog({cursor: message.cursor}); } catch { value = null; }
        check();
        if (!keys(value, ['catalogue', 'flavors', 'versions', 'total', 'next']) || !CATALOGUE_STATES.has(value.catalogue) || !Array.isArray(value.flavors) || value.flavors.length > MAX_FLAVORS || !Array.isArray(value.versions) || value.versions.length > MAX_VERSIONS || !Number.isSafeInteger(value.total) || value.total < 0 || !cursorValid(value.next)) throw Error('The server catalogue is unavailable.');
        const flavors = value.flavors.map(row => {
          if (!keys(row, ['id', 'name', 'targets']) || !flavorId(row.id) || !text(row.name, 40) || !Array.isArray(row.targets) || row.targets.length > TARGET_IDS.length || row.targets.some(id => !TARGET_IDS.includes(id)) || new Set(row.targets).size !== row.targets.length) throw Error('The server catalogue is unavailable.');
          return {id: row.id, name: row.name, targets: TARGET_IDS.filter(id => row.targets.includes(id))};
        });
        if (new Set(flavors.map(row => row.id)).size !== flavors.length) throw Error('The server catalogue is unavailable.');
        const versions = value.versions.map(row => {
          if (!keys(row, ['id', 'channel']) || !versionId(row.id) || !CHANNELS.has(row.channel)) throw Error('The server catalogue is unavailable.');
          return {id: row.id, channel: row.channel};
        });
        return {type: 'server-catalog', schemaVersion: 1, catalogue: value.catalogue, flavors, versions, total: value.total, next: value.next};
      }
      const {action, server} = message;
      const admissible = () => { try { return !closed && isUnlocked() === true && canPrompt() === true; } catch { return false; } };
      let supported = false;
      try { supported = typeof authenticate === 'function' && typeof applyServerAction === 'function' && supports(action) === true; } catch { supported = false; }
      if (!supported || !admissible()) return answer('unavailable', action, server);
      if (pending || gate.held) return answer('busy', action, server);
      const controller = new AbortController();
      pending = controller;
      gate.held = true;
      const deadline = setTimeout(() => controller.abort(), Math.max(1, promptTimeoutMs));
      try {
        let verdict = false;
        try { verdict = await authenticate({origin, action, signal: controller.signal}); } catch { verdict = false; }
        check();
        if (controller.signal.aborted) return answer('rejected', action, server);
        if (verdict === 'unavailable') return answer('unavailable', action, server);
        if (verdict !== true) return answer('rejected', action, server);
        if (!admissible()) return answer('unavailable', action, server);
        let result = null;
        try { result = await applyServerAction({action, server, options: message.options, signal: controller.signal}); } catch { result = null; }
        check();
        if (!plain(result) || !RESULTS.has(result.state)) return answer('unavailable', action, server);
        const created = action === 'create' && typeof result.server === 'string' && serverId(result.server) ? result.server : server;
        return answer(result.state, action, created);
      } finally { clearTimeout(deadline); gate.held = false; if (pending === controller) pending = null; }
    },
  };
}
