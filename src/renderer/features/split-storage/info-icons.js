import {createInfoIconController} from '../../../shared/surface/info-icon-controller.js';
import {SPLIT_STORAGE_INFO_ICON_INVENTORY} from '../../../shared/local-ux/info-icon-split-storage.js';

/** Mounts the information icons of the Split storage page on its shadow root and rebuilds them when the language changes. */
export function mountSplitInfoIcons(root, {getLanguage = () => 'en'} = {}) {
  const controller = createInfoIconController(root, {inventory: SPLIT_STORAGE_INFO_ICON_INVENTORY, getLanguage, observe: true});
  return {refresh: () => controller.setLanguage(getLanguage()), destroy: () => controller.destroy()};
}
