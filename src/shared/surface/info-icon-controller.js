import {mountInfoIcons} from './info-icon-mount.js';

/**
 * Mounts the information icons of one surface inventory and rebuilds them
 * when the interface language changes, because each icon names its target in
 * the active language. Command registration is batched so a command palette
 * is configured once for the whole set instead of once per icon.
 */
export function createInfoIconController(root, {inventory, t = value => value, registerCommands, openHelp, getLanguage = () => 'en', query, pair = false, presentation = 'icon', onReport = () => {}, observe = false, ObserverImpl = globalThis.MutationObserver, schedule = callback => setTimeout(callback, 50), cancel = id => clearTimeout(id)} = {}) {
  if (!inventory?.descriptors) throw Error('An information icon inventory is required.');
  let mounted = null, disposeCommands = null, language = null, destroyed = false, observer = null, timer = null;
  const late = [];
  function clear() {
    mounted?.destroy(); mounted = null;
    for (const batch of late.splice(0)) { batch.mounted.destroy(); if (typeof batch.dispose === 'function') batch.dispose(); }
    if (typeof disposeCommands === 'function') disposeCommands();
    disposeCommands = null;
  }
  function mount() {
    if (destroyed) return null;
    clear();
    const commands = [];
    language = getLanguage();
    mounted = mountInfoIcons(root, {
      inventory, t, openHelp, pair, presentation, ...(query ? {query} : {}),
      registerCommands: rows => { commands.push(...rows); return () => {}; }
    });
    if (commands.length && typeof registerCommands === 'function') disposeCommands = registerCommands(commands);
    onReport({mounted: mounted.mounted.length, missing: mounted.missing, errors: mounted.errors, commands});
    return mounted;
  }
  /**
   * Mounts icons for controls that appeared after the first pass (rows, dialogs and feature panels that render later).
   * Targets that already carry their icon are skipped by the mounting step, so a repeated pass never doubles an icon.
   * Returns how many icons were added.
   */
  function mountLate() {
    if (destroyed) return 0;
    const commands = [];
    const batch = mountInfoIcons(root, {
      inventory, t, openHelp, pair, presentation, ...(query ? {query} : {}),
      registerCommands: rows => { commands.push(...rows); return () => {}; }
    });
    const added = batch.modules.length;
    if (!added) { batch.destroy(); return 0; }
    late.push({mounted: batch, dispose: commands.length && typeof registerCommands === 'function' ? registerCommands(commands) : null});
    onReport({mounted: added, missing: batch.missing, errors: batch.errors, commands, late: true});
    return added;
  }
  function watch() {
    if (!observe || typeof ObserverImpl !== 'function' || observer) return;
    observer = new ObserverImpl(records => {
      if (destroyed || timer !== null) return;
      if (!records.some(record => record.addedNodes && record.addedNodes.length)) return;
      timer = schedule(() => { timer = null; mountLate(); });
    });
    observer.observe(root, {childList: true, subtree: true});
  }
  mount();
  watch();
  return {
    get report() { return mounted; },
    get lateCount() { return late.reduce((sum, batch) => sum + batch.mounted.modules.length, 0); },
    setLanguage(next) { if (!destroyed && next !== language) mount(); },
    refresh: mount,
    refreshLate: mountLate,
    destroy() { destroyed = true; observer?.disconnect(); observer = null; if (timer !== null) cancel(timer); timer = null; clear(); }
  };
}
