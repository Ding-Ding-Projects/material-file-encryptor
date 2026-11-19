import './dialog.js';

/** Mounts the drive icon and banner dialog once; opened from drive details, the drive table and the command palette. */
export function mountDriveAppearanceDialog(root, options = {}) {
  const dialog = document.createElement('mfe-drive-appearance-dialog');
  root.append(dialog);
  dialog.configure(options);
  return {
    open: detail => dialog.open(detail),
    setLanguage: value => dialog.setLanguage(value),
    destroy: () => { dialog.destroy(); dialog.remove(); }
  };
}
