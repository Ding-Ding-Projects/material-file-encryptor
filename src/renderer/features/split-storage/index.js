import './panel.js';
import {SPLIT_METHODS} from './model.js';

export {SPLIT_METHODS};

/** Mounts the Split storage page. Services are the preload `api` methods plus a destructive-action confirmation. */
export function mountSplitStorage(root, options = {}) {
  const panel = document.createElement('mfe-split-storage-panel');
  root.replaceChildren(panel);
  panel.configure(options);
  return {
    focusStart: () => panel.focusStart(),
    refresh: () => panel.load(),
    setVaultState: state => panel.setVaultState(state),
    setLanguage: value => panel.setLanguage(value),
    refreshLabels: () => panel.render(),
    destroy: () => panel.destroy()
  };
}
