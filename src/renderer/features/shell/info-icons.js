import {createInfoIconController} from '../../../shared/surface/info-icon-controller.js';
import {DESKTOP_INFO_ICON_INVENTORY} from '../../../shared/local-ux/info-icon-desktop.js';
import {DESKTOP_DYNAMIC_INFO_ICON_INVENTORY} from '../../../shared/local-ux/info-icon-desktop-dynamic.js';
import {INFO_ICON_COPY} from '../../../shared/local-ux/info-icon-inventory.js';

export {INFO_ICON_COPY};

/** Static descriptors plus the descriptors of controls created after start-up, in one inventory. */
export const SHELL_INVENTORY = Object.freeze({...DESKTOP_INFO_ICON_INVENTORY, descriptors: Object.freeze([...DESKTOP_INFO_ICON_INVENTORY.descriptors, ...DESKTOP_DYNAMIC_INFO_ICON_INVENTORY.descriptors])});

/**
 * Mounts the desktop control help in hint presentation: no information icon is drawn in the layout. Each control's
 * help text becomes its tooltip and accessible description, and shows inline under it while help mode is on.
 * The guided operation and full explanation of every control stay reachable from the command palette.
 * The static markup is covered at start-up; controls the shell and its views create later are covered as they appear.
 */
export function createShellInfoIcons(root, options = {}) {
  return createInfoIconController(root, {inventory: SHELL_INVENTORY, observe: true, presentation: 'hint', ...options});
}
