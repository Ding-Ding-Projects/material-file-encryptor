import './dialog.js';
import { HUB_DRIVE_COPY } from './copy.js';

export { HUB_DRIVE_COPY };

/**
 * Mounts the Docker Hub drive dialog once and returns a small controller. The dialog is opened from the create and
 * unlock dialogs, the command palette and the New tab catalog, never as a page of its own.
 */
export function mountHubDriveDialog(root, options = {}) {
  const dialog = document.createElement('mfe-hub-drive-dialog');
  root.append(dialog);
  dialog.configure(options);
  return {
    openCreate: () => dialog.open('create'),
    /** The easy path: Docker Hub is already chosen, so it goes to sign-in (when needed) and then one details screen. */
    openCreateDirect: () => dialog.open('create', {direct: true}),
    openExisting: () => dialog.open('open'),
    setLanguage: value => dialog.setLanguage(value),
    onUseThisComputer: listener => dialog.addEventListener('hub-use-this-computer', listener),
    destroy: () => { dialog.destroy(); dialog.remove(); }
  };
}
