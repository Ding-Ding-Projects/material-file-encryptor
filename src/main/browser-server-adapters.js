import {TARGET_IDS} from '../features/server-manager/targets.js';

const CHANNELS = new Set(['release', 'snapshot', 'old_beta', 'old_alpha']);
const LIFECYCLE = new Map([['running', 'running'], ['started', 'running'], ['starting', 'starting'], ['stopping', 'stopping'], ['stopped', 'stopped'], ['exited', 'stopped'], ['failed', 'failed']]);
// Flavors the desktop server manager can really prepare. Every other flavor is absent, not listed as unavailable-with-a-promise.
export const DESKTOP_FLAVORS = Object.freeze([{id: 'vanilla', name: 'Vanilla', targets: ['local-process']}]);
export const SUPPORTED_SERVER_ACTIONS = Object.freeze(['create', 'start', 'stop', 'restart']);

/** Maps the desktop server manager host onto the fixed rows the browser channel exposes. Nothing here reads a path,
 * address, log line or credential: only identifiers, version names and a state word leave the desktop. Every operation the
 * host does not implement (settings, plugins, containers, SSH) is simply not offered, and the channel answers unavailable. */
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
  const targetRows = snapshot => TARGET_IDS.map(id => ({id, available: Array.isArray(snapshot?.targets) && snapshot.targets.some(item => item?.id === id && item.available === true)}));
  async function owned(id) {
    const snapshot = await dispatch('snapshot', {});
    return snapshot.operations?.find(item => item.serverId === id && item.bytesVerified === true) ?? null;
  }
  return {
    async readServers() {
      ensureOpen();
      const snapshot = await dispatch('snapshot', {});
      ensureOpen();
      const operations = Array.isArray(snapshot.operations) ? snapshot.operations : [];
      return {manager: 'available', targets: targetRows(snapshot), servers: operations.filter(item => typeof item?.serverId === 'string' && typeof item.version === 'string').slice(0, 100).map(row)};
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
      try {
        if (action === 'create') {
          if (options.target !== 'local-process' || options.flavor !== 'vanilla') return {state: 'unavailable', server: null};
          const snapshot = await dispatch('snapshot', {});
          const catalogueId = snapshot.catalogue?.sourceSha256;
          if (typeof catalogueId !== 'string') return {state: 'unavailable', server: null};
          const selection = await dispatch('resolveVersion', {catalogueId, versionId: options.version});
          ensureOpen();
          if (selection.preparable !== true) return {state: 'unavailable', server: null};
          const view = await dispatch('prepare', {selectionId: selection.selectionId});
          ensureOpen();
          return {state: 'changed', server: view.serverId};
        }
        if (!await owned(server)) return {state: 'rejected', server};
        if (action === 'restart') await dispatch('stop', {serverId: server});
        ensureOpen();
        await dispatch(action === 'stop' ? 'stop' : 'start', {serverId: server});
        ensureOpen();
        return {state: 'changed', server};
      } catch (error) {
        if (/already active/i.test(String(error?.message))) return {state: 'busy', server: server ?? null};
        throw error;
      }
    },
  };
}
