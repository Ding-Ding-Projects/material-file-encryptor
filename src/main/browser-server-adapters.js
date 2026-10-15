import {TARGET_IDS} from '../features/server-manager/targets.js';
import {FLAVOR_IDS, FLAVOR_NAMES} from '../features/server-manager/flavors.js';

const CHANNELS = new Set(['release', 'snapshot', 'old_beta', 'old_alpha']);
const LIFECYCLE = new Map([['running', 'running'], ['started', 'running'], ['starting', 'starting'], ['stopping', 'stopping'], ['stopped', 'stopped'], ['exited', 'stopped'], ['failed', 'failed']]);
const MANAGED_STATES = new Set(['preparing', 'prepared', 'starting', 'running', 'stopping', 'stopped', 'failed']);
// Targets a paired browser may ask the desktop to create. SSH needs a host, user and key chosen in the desktop, so an SSH server
// can be managed from the browser once it exists but never created from it.
export const BROWSER_CREATE_TARGETS = Object.freeze(['local-process', 'local-container']);
// Every flavor the desktop server manager can prepare: Vanilla, Paper, Purpur, Fabric, Forge and NeoForge.
export const DESKTOP_FLAVORS = Object.freeze(FLAVOR_IDS.map(id => ({id, name: FLAVOR_NAMES[id], targets: [...BROWSER_CREATE_TARGETS]})));
export const SUPPORTED_SERVER_ACTIONS = Object.freeze(['create', 'start', 'stop', 'restart', 'change-setting', 'install-plugin']);
const VERSION_ROW = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,31}$/;
const isManaged = id => typeof id === 'string' && id.startsWith('managed-');
// Failures that mean "this request cannot be done for this server" rather than "the manager is broken".
const REJECTED = /owned managed server|license acceptance|Stop the server|not editable|fixed when|Invalid server setting|No compatible release|SHA-512|size bound|no plugin or mod|Invalid extension|limit was reached|port is already in use/i;

/** Maps the desktop server manager host onto the fixed rows the browser channel exposes. Nothing here reads a path,
 * address, log line, key or credential: only identifiers, version names and a state word leave the desktop. Verified-download
 * preparation servers (`server-<uuid>`) and managed servers on any target (`managed-<uuid>`) are both listed; the managed
 * flavors, container and SSH targets, settings and Modrinth plugin installs are offered, and whatever a target cannot do is
 * answered unavailable. */
export function createBrowserServerAdapters({dispatch, ensureOpen = () => {}, authenticate} = {}) {
  if (typeof dispatch !== 'function') throw Error('Invalid browser server adapter configuration.');
  const stateOf = view => {
    const word = typeof view?.lifecycle?.state === 'string' ? view.lifecycle.state : typeof view?.lifecycle?.status === 'string' ? view.lifecycle.status : null;
    if (word && LIFECYCLE.has(word)) return LIFECYCLE.get(word);
    if (view?.status === 'prepared') return 'prepared';
    if (view?.status === 'admitting' || view?.status === 'downloading') return 'preparing';
    return 'failed';
  };
  const row = view => ({id: view.serverId, name: ('Vanilla ' + view.version).slice(0, 80), target: 'local-process', flavor: 'vanilla', version: String(view.version).slice(0, 32), state: stateOf(view)});
  const managedRow = view => ({id: view.serverId, name: String(view.name).slice(0, 80), target: view.target, flavor: view.flavor, version: String(view.version).slice(0, 32), state: MANAGED_STATES.has(view.state) ? view.state : 'failed'});
  const targetRows = (snapshot, managedTargets) => TARGET_IDS.map(id => ({id, available: Array.isArray(managedTargets) ? managedTargets.some(item => item?.id === id && item.available === true) : Array.isArray(snapshot?.targets) && snapshot.targets.some(item => item?.id === id && item.available === true)}));
  async function managedOverview() {
    try { const value = await dispatch('targets', {}); return Array.isArray(value?.targets) && Array.isArray(value?.servers) ? value : null; } catch { return null; }
  }
  async function owned(id) {
    const snapshot = await dispatch('snapshot', {});
    return snapshot.operations?.find(item => item.serverId === id && item.bytesVerified === true) ?? null;
  }
  const guarded = async (work, server) => {
    try { return await work(); } catch (error) {
      const message = String(error?.message);
      if (/already active/i.test(message)) return {state: 'busy', server: server ?? null};
      if (REJECTED.test(message)) return {state: 'rejected', server: server ?? null};
      throw error;
    }
  };
  return {
    async readServers() {
      ensureOpen();
      const snapshot = await dispatch('snapshot', {});
      const overview = await managedOverview();
      ensureOpen();
      const operations = Array.isArray(snapshot.operations) ? snapshot.operations : [];
      const legacy = operations.filter(item => typeof item?.serverId === 'string' && typeof item.version === 'string').map(row);
      const managed = (overview?.servers ?? []).filter(item => typeof item?.serverId === 'string' && VERSION_ROW.test(String(item.version)) && TARGET_IDS.includes(item.target) && FLAVOR_IDS.includes(item.flavor)).map(managedRow);
      return {manager: 'available', targets: targetRows(snapshot, overview?.targets), servers: [...legacy, ...managed].slice(0, 100)};
    },
    async readServerCatalog({cursor} = {}) {
      ensureOpen();
      const snapshot = await dispatch('snapshot', {});
      ensureOpen();
      const catalogueId = snapshot.catalogue?.sourceSha256;
      if (typeof catalogueId !== 'string') return {catalogue: 'not-loaded', flavors: DESKTOP_FLAVORS.map(item => ({...item, targets: [...item.targets]})), versions: [], total: 0, next: null};
      const page = await dispatch('versions', {catalogueId, cursor: cursor ?? '0'});
      ensureOpen();
      return {catalogue: 'ready', flavors: DESKTOP_FLAVORS.map(item => ({...item, targets: [...item.targets]})), versions: page.versions.filter(item => CHANNELS.has(item.channel)).map(item => ({id: item.id, channel: item.channel})), total: page.total, next: page.next};
    },
    supportsServerAction: action => SUPPORTED_SERVER_ACTIONS.includes(action),
    authenticateServerAction: authenticate,
    async applyServerAction({action, server, options}) {
      ensureOpen();
      if (!SUPPORTED_SERVER_ACTIONS.includes(action)) return {state: 'unavailable', server: null};
      return guarded(async () => {
        if (action === 'create') {
          if (!BROWSER_CREATE_TARGETS.includes(options.target) || !FLAVOR_IDS.includes(options.flavor)) return {state: 'unavailable', server: null};
          const overview = await managedOverview();
          ensureOpen();
          if (!overview?.targets.some(item => item?.id === options.target && item.available === true)) return {state: 'unavailable', server: null};
          const view = await dispatch('createServer', {target: options.target, flavor: options.flavor, version: options.version});
          ensureOpen();
          return {state: 'changed', server: view.serverId};
        }
        if (isManaged(server)) {
          if (action === 'change-setting') await dispatch('changeServerSetting', {serverId: server, key: options.key, value: options.value});
          else if (action === 'install-plugin') await dispatch('installExtension', {serverId: server, source: 'modrinth', project: options.plugin});
          else await dispatch({start: 'startServer', stop: 'stopServer', restart: 'restartServer'}[action], {serverId: server});
          ensureOpen();
          return {state: 'changed', server};
        }
        // The verified-download preparation servers have no settings or plugin surface.
        if (action === 'change-setting' || action === 'install-plugin') return {state: 'unavailable', server: null};
        if (!await owned(server)) return {state: 'rejected', server};
        if (action === 'restart') await dispatch('stop', {serverId: server});
        ensureOpen();
        await dispatch(action === 'stop' ? 'stop' : 'start', {serverId: server});
        ensureOpen();
        return {state: 'changed', server};
      }, server);
    },
  };
}
