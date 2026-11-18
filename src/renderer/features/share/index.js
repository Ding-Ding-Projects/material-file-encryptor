import './dialog.js';
import { SHARE_COPY, SHARE_UI_COPY } from './copy.js';

export { SHARE_COPY, SHARE_UI_COPY };

/**
 * Mounts the share dialog once and returns a small controller. It is opened from the drive command bar, the file
 * context menu, the command palette and the New tab catalog, and when a share link arrives from the main process.
 */
export function mountShareDialog(root, options = {}) {
  const dialog = document.createElement('mfe-share-dialog');
  root.append(dialog);
  dialog.configure(options);
  return {
    share: file => dialog.openShare(file),
    receive: (detail = {}) => dialog.openReceive(detail),
    list: () => dialog.openList(),
    setLanguage: value => dialog.setLanguage(value),
    destroy: () => { dialog.destroy(); dialog.remove(); }
  };
}
