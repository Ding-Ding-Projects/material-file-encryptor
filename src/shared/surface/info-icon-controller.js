import {mountInfoIcons} from './info-icon-mount.js';

/**
 * Mounts the information icons of one surface inventory and rebuilds them
 * when the interface language changes, because each icon names its target in
 * the active language. Command registration is batched so a command palette
 * is configured once for the whole set instead of once per icon.
 */
export function createInfoIconController(root, {inventory, t = value => value, registerCommands, openHelp, getLanguage = () => 'en', query, pair = false, onReport = () => {}} = {}) {
  if (!inventory?.descriptors) throw Error('An information icon inventory is required.');
  let mounted = null, disposeCommands = null, language = null, destroyed = false;
  function clear() {
    mounted?.destroy(); mounted = null;
    if (typeof disposeCommands === 'function') disposeCommands();
    disposeCommands = null;
  }
  function mount() {
    if (destroyed) return null;
    clear();
    const commands = [];
    language = getLanguage();
    mounted = mountInfoIcons(root, {
      inventory, t, openHelp, pair, ...(query ? {query} : {}),
      registerCommands: rows => { commands.push(...rows); return () => {}; }
    });
    if (commands.length && typeof registerCommands === 'function') disposeCommands = registerCommands(commands);
    onReport({mounted: mounted.mounted.length, missing: mounted.missing, errors: mounted.errors, commands});
    return mounted;
  }
  mount();
  return {
    get report() { return mounted; },
    setLanguage(next) { if (!destroyed && next !== language) mount(); },
    refresh: mount,
    destroy() { destroyed = true; clear(); }
  };
}
