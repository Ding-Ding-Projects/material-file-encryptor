import './dialog.js';
import { HOSTING_COPY } from './copy.js';

export { HOSTING_COPY };

/**
 * Mounts the file hosting dialog once. It opens from the command palette and the New tab catalog (File hosting,
 * Set up file hosting, Create a download link) and from the Web link action on each active shared file.
 */
export function mountFileHostingDialog(root, options = {}) {
  const dialog = document.createElement('mfe-file-hosting-dialog');
  root.append(dialog);
  dialog.configure(options);
  return {
    manage: () => dialog.openManage(),
    setup: () => dialog.openSetup(),
    link: (detail = {}) => dialog.openLink(detail),
    setLanguage: value => dialog.setLanguage(value),
    destroy: () => { dialog.destroy(); dialog.remove(); }
  };
}
