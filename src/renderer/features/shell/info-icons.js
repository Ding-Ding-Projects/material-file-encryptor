import {createInfoIconController} from '../../../shared/surface/info-icon-controller.js';
import {DESKTOP_INFO_ICON_INVENTORY} from '../../../shared/local-ux/info-icon-desktop.js';
import {INFO_ICON_COPY} from '../../../shared/local-ux/info-icon-inventory.js';

export {INFO_ICON_COPY};

/** Mounts the desktop information icons: one compact icon immediately before each capable shell control. */
export function createShellInfoIcons(root, options = {}) {
  // Controls in a wrapping flex row keep their icon beside them. Containers whose own styles address their children are left alone.
  return createInfoIconController(root, {inventory: DESKTOP_INFO_ICON_INVENTORY, pair: {skipParents: '.setting-row,.folder-input,.split-form,.password-field'}, ...options});
}
