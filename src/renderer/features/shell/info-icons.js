import {createInfoIconController} from '../../../shared/surface/info-icon-controller.js';
import {DESKTOP_INFO_ICON_INVENTORY} from '../../../shared/local-ux/info-icon-desktop.js';
import {DESKTOP_DYNAMIC_INFO_ICON_INVENTORY} from '../../../shared/local-ux/info-icon-desktop-dynamic.js';
import {INFO_ICON_COPY} from '../../../shared/local-ux/info-icon-inventory.js';

export {INFO_ICON_COPY};

/** Static descriptors plus the descriptors of controls created after start-up, in one inventory. */
export const SHELL_INVENTORY = Object.freeze({...DESKTOP_INFO_ICON_INVENTORY, descriptors: Object.freeze([...DESKTOP_INFO_ICON_INVENTORY.descriptors, ...DESKTOP_DYNAMIC_INFO_ICON_INVENTORY.descriptors])});

/** Mounts the desktop information icons: one compact icon immediately before each capable shell control. */
export function createShellInfoIcons(root, options = {}) {
  // Controls in a wrapping flex row keep their icon beside them. Containers whose own styles address their children are left alone.
  // The static markup is covered at start-up. Controls the shell and its views create later are covered as they appear.
  return createInfoIconController(root, {inventory: SHELL_INVENTORY, observe: true, pair: {skipParents: '.setting-row,.folder-input,.split-form,.password-field'}, ...options});
}
