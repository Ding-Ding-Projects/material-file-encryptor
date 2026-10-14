import path from 'node:path';
import {randomUUID} from 'node:crypto';

const TYPES = new Set(['none', 'info', 'error', 'question', 'warning']);
const clean = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';

/** Normalizes dialog.showMessageBox options into the bounded view a dialog page may read. */
export function dialogView(options = {}) {
  const buttons = (Array.isArray(options.buttons) && options.buttons.length ? options.buttons : ['OK']).slice(0, 6).map(label => clean(String(label), 120));
  const index = value => Number.isInteger(value) && value >= 0 && value < buttons.length ? value : null;
  const cancelId = index(options.cancelId) ?? (buttons.length > 1 ? 0 : 0);
  return {
    type: TYPES.has(options.type) ? options.type : 'none',
    title: clean(options.title, 300),
    message: clean(options.message, 2000),
    detail: clean(options.detail, 8000),
    buttons,
    defaultId: index(options.defaultId) ?? 0,
    cancelId,
  };
}

/**
 * Material replacement for dialog.showMessageBox. The prompt runs in a modal
 * child window owned by the main process, so the application renderer can
 * never answer it. Only that window's own web contents, presenting its
 * one-time nonce and an in-range button index, settles the prompt; closing
 * the window settles it with the cancel button. If the window cannot be
 * created the native dialog is used, so a consent prompt never disappears.
 */
export function createMaterialDialogs({BrowserWindow, ipcMain, nativeDialog, preloadPath, pagePath, getTheme = async () => null, onError = () => {}}) {
  const pending = new Map();
  ipcMain.handle('material-dialog:view', event => {
    const entry = pending.get(event.sender.id);
    if (!entry) throw new Error('Dialog is unavailable.');
    return {...entry.view, nonce: entry.nonce};
  });
  ipcMain.on('material-dialog:respond', (event, nonce, index) => {
    const entry = pending.get(event.sender.id);
    if (!entry || nonce !== entry.nonce || !Number.isInteger(index) || index < 0 || index >= entry.view.buttons.length) return;
    entry.finish(index);
  });
  ipcMain.on('material-dialog:resize', (event, height) => {
    const entry = pending.get(event.sender.id);
    if (!entry || !Number.isFinite(height)) return;
    const bounded = Math.max(160, Math.min(720, Math.ceil(height)));
    if (!entry.window.isDestroyed()) entry.window.setContentSize(560, bounded);
  });

  async function showMessageBox(parent, options) {
    if (options === undefined) { options = parent; parent = null; }
    const view = dialogView(options);
    const owner = parent && typeof parent.isDestroyed === 'function' && !parent.isDestroyed() ? parent : null;
    // The dialog follows the application's own theme; anything else falls back to the system scheme.
    const theme = await Promise.race([Promise.resolve().then(() => getTheme(owner)).catch(() => null), new Promise(resolve => setTimeout(() => resolve(null), 1000))]);
    view.theme = theme === 'dark' || theme === 'light' ? theme : null;
    let window;
    try {
      window = new BrowserWindow({
        parent: owner ?? undefined, modal: Boolean(owner), width: 560, height: 260, useContentSize: true,
        resizable: false, minimizable: false, maximizable: false, fullscreenable: false, show: false, frame: false, backgroundColor: view.theme === 'dark' ? '#20261e' : '#e8ece9',
        title: view.title || ' ', autoHideMenuBar: true,
        webPreferences: {preload: preloadPath, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true},
      });
    } catch (error) {
      onError(error);
      return owner ? nativeDialog.showMessageBox(owner, options) : nativeDialog.showMessageBox(options);
    }
    return new Promise(resolve => {
      const id = window.webContents.id, nonce = randomUUID();
      let settled = false;
      const finish = response => {
        if (settled) return;
        settled = true;
        pending.delete(id);
        if (!window.isDestroyed()) window.destroy();
        resolve({response, checkboxChecked: false});
      };
      pending.set(id, {view, nonce, window, finish});
      window.on('closed', () => finish(view.cancelId));
      window.webContents.on('will-navigate', event => event.preventDefault());
      window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
      window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show(); });
      window.loadFile(pagePath).catch(error => { onError(error); finish(view.cancelId); });
    });
  }

  return {showMessageBox, pendingCount: () => pending.size};
}

export const materialDialogPaths = directory => ({
  preloadPath: path.join(directory, 'material-dialog-preload.cjs'),
  pagePath: path.resolve(directory, '../renderer/material-dialog.html'),
});
