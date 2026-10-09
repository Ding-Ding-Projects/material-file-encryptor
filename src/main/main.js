import squirrelStartup from 'electron-squirrel-startup';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NativeClient } from './native-client.js';
import { validateRequest, trustedFrame } from './validation.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const rendererPath = path.resolve(directory, '../renderer/index.html');
const rendererURL = pathToFileURL(rendererPath).href;
const testMode = !app.isPackaged && process.argv.includes('--desktop-check');
const verificationProfile = process.argv.find(argument => argument.startsWith('--verification-profile='))?.slice('--verification-profile='.length);
if (verificationProfile) {
  if (!process.argv.includes('--desktop-check') || !path.isAbsolute(verificationProfile)) throw new Error('Verification requires an explicit absolute profile directory and desktop-check mode.');
  app.setPath('userData', verificationProfile);
} else if (testMode) app.setPath('userData', path.resolve('out/desktop-profile'));
const verificationMode = Boolean(verificationProfile && process.argv.includes('--desktop-check'));
function createVerificationStartup(loginApp, executable, name) {
  const options = { path: executable, args: ['--startup'] };
  const find = () => (loginApp.getLoginItemSettings(options).launchItems || []).find(item => item.name === name);
  if (find()) throw new Error('Verification startup registration already exists.');
  let restored = false;
  return {
    read: () => ({ name, verificationOnly: true, enabled: Boolean(find()?.enabled), originalEnabled: false, restored }),
    set: enabled => { loginApp.setLoginItemSettings({ ...options, name, openAtLogin: enabled, enabled }); restored = false; },
    restore: () => {
      loginApp.setLoginItemSettings({ ...options, name, openAtLogin: false });
      if (find()) throw new Error('Verification startup registration could not be restored.');
      restored = true;
      return { name, verificationOnly: true, enabled: false, originalEnabled: false, restored };
    },
  };
}
let verificationStartup;
function applyStartup(enabled) {
  if (verificationStartup) verificationStartup.set(enabled);
  else if (app.isPackaged && process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: ['--startup'] });
}
function startupRegistration() {
  if (verificationStartup) return verificationStartup.read();
  if (process.platform !== 'win32') return { enabled: false, verificationOnly: false, restored: false };
  const settings = app.getLoginItemSettings({ path: process.execPath, args: ['--startup'] });
  return { enabled: settings.openAtLogin, verificationOnly: false, restored: false };
}
const configPath = () => path.join(app.getPath('userData'), 'preferences.json');
const selectedImports = new Set();
const selectedExports = new Set();
let window, tray, helper, shuttingDown = false, operation = null;
let preferences = { startup: true, autoUnlock: false, driveLetter: 'M:', transport: 'folder', historyRetentionDays: null };
let state = { locked: true, mounted: false, files: [], availableDriveLetters: [], sync: { running: false, lastSync: null, error: null }, driver: { available: false, checking: true, error: 'Checking WinFsp availability.' } };
const inside = (parent, child) => { const rel = path.relative(parent, child); return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)); };
const nativeState = value => ({ ...value, driver: { ...value.driver, checking: false } });
const snapshot = () => ({ ...state, operation, startupRegistration: startupRegistration(), defaults: { cacheDir: preferences.cacheDir || path.join(app.getPath('userData'), 'EncryptedCache'), driveLetter: preferences.driveLetter }, preferences: { ...preferences }, cacheDir: state.cacheDir || preferences.cacheDir || path.join(app.getPath('userData'), 'EncryptedCache') });
function publish() { if (window && !window.isDestroyed()) window.webContents.send('vault:state', snapshot()); }
async function savePreferences() { await fs.mkdir(app.getPath('userData'), { recursive: true }); await fs.writeFile(configPath(), JSON.stringify(preferences), { mode: 0o600 }); }
async function backend(method, params = {}) {
  if (!helper) throw new Error('The mounted drive is available on Windows.');
  const result = await helper.request(method, params);
  if (result && typeof result.locked === 'boolean') state = nativeState(result);
  else state = nativeState(await helper.request('status'));
  publish(); return snapshot();
}
async function perform(label, task) {
  if (operation) throw new Error('Wait for the current drive operation to finish.');
  operation = label; publish();
  try { return await task(); } finally { operation = null; publish(); }
}
async function safeDestination(filename, forbidden) {
  const parent = await fs.realpath(path.dirname(filename));
  const resolved = path.join(parent, path.basename(filename));
  for (const root of forbidden.filter(Boolean)) {
    let real = path.resolve(root); try { real = await fs.realpath(root); } catch { /* Folder may not exist yet. */ }
    if (inside(real, resolved)) throw new Error('Choose a location outside encrypted storage, cache, and the mounted drive.');
  }
  try { if ((await fs.lstat(resolved)).isSymbolicLink()) throw new Error('Symbolic link destinations are not supported.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return resolved;
}
function mountedPath(relative = '') {
  if (!state.mounted || !/^[A-Z]:?$/i.test(state.driveLetter || '')) throw new Error('Mount the drive first.');
  return path.win32.join(state.driveLetter.replace(/:$/, '') + ':\\', relative);
}
async function openPath(filename) { const error = await shell.openPath(filename); if (error) throw new Error(error); }
async function request(method, params) {
  params = validateRequest(method, params);
  if (method === 'getState') return snapshot();
  if (method === 'listVersions' || method === 'listDeleted') {
    if (!helper) throw new Error('Unlock a Windows vault to browse its history.');
    return helper.request(method, params);
  }
  if (['saveVersion', 'restoreVersion', 'restoreDeleted', 'emptyRecycleBin'].includes(method)) return perform(method, () => backend(method, params));
  if (method === 'chooseFiles') { const picked = await dialog.showOpenDialog(window, { title: 'Import files into encrypted storage', properties: ['openFile', 'multiSelections'] }); if (picked.canceled) return []; for (const filename of picked.filePaths) selectedImports.add(filename); return picked.filePaths; }
  if (method === 'chooseExport') { const picked = await dialog.showSaveDialog(window, { title: 'Export a readable copy', defaultPath: path.win32.basename(params.name) }); if (picked.canceled) return null; selectedExports.add(picked.filePath); return picked.filePath; }
  if (method === 'importSelected') { if (params.paths.some(filename => !selectedImports.has(filename))) throw new Error('Choose files using the file picker.'); for (const filename of params.paths) selectedImports.delete(filename); return perform('importing', () => backend('importFiles', { paths: params.paths })); }
  if (method === 'fileAction') { const entry = state.files.find(file => file.id === params.id); if (!entry) throw new Error('Select a current file.'); if (params.action === 'open') return openPath(mountedPath(entry.path)); if (params.action === 'export') { if (!selectedExports.delete(params.destination)) throw new Error('Choose an export destination using the file picker.'); const target = await safeDestination(params.destination, [state.storageDir, state.cacheDir, mountedPath()]); await fs.copyFile(mountedPath(entry.path), target); return target; } return perform(params.action, () => backend(params.action, { path: entry.path })); }
  if (method === 'resplitAll') return perform('resplit', async () => { for (const file of state.files.filter(file => !file.isDirectory)) await backend('resplit', { path: file.path, partSizeBytes: state.partSizeBytes }); return snapshot(); });
  if (method === 'windowControl') { if (params.action === 'minimize') window.minimize(); if (params.action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize(); if (params.action === 'close') window.close(); return; }
  if (method === 'openExternal') return shell.openExternal(params.url);
  if (method === 'selectFolder') { const picked = await dialog.showOpenDialog(window, { title: params.kind === 'storage' ? 'Choose encrypted storage folder' : 'Choose encrypted cache folder', properties: ['openDirectory', 'createDirectory'] }); return picked.canceled ? null : picked.filePaths[0]; }
  if (method === 'selectKeyFile') { const picked = await dialog.showOpenDialog(window, { title: 'Choose your key file', properties: ['openFile'] }); return picked.canceled ? null : picked.filePaths[0]; }
  if (method === 'createKeyFile') {
    const picked = await dialog.showSaveDialog(window, { title: 'Save your new key file outside encrypted storage', defaultPath: 'MaterialDrive.key' });
    if (picked.canceled) return null;
    const target = await safeDestination(picked.filePath, [params.storageDir, params.cacheDir, state.storageDir, state.cacheDir]);
    const key = randomBytes(32); try { await fs.writeFile(target, key, { flag: 'wx', mode: 0o600 }); } finally { key.fill(0); } return target;
  }
  if (method === 'importVocabulary') { const picked = await dialog.showOpenDialog(window, { title: 'Import vocabulary JSON', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] }); if (picked.canceled) return null; const stat = await fs.stat(picked.filePaths[0]); if (stat.size > 131072) throw new Error('Vocabulary JSON must be no larger than 128 KB.'); return JSON.parse(await fs.readFile(picked.filePaths[0], 'utf8')); }
  if (method === 'installDriver') {
    const root = app.isPackaged ? process.resourcesPath : path.resolve(directory, '../..');
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'dependencies.json'), 'utf8'));
    const installer = path.join(root, app.isPackaged ? 'driver' : '.cache/driver', `winfsp-${manifest.winfsp.version}.msi`);
    if (createHash('sha256').update(await fs.readFile(installer)).digest('hex') !== manifest.winfsp.sha256) throw new Error('Driver installer integrity check failed. Reinstall the application.');
    await openPath(installer); return;
  }
  if (method === 'setPreferences') {
    if (params.autoUnlock !== undefined && params.autoUnlock !== preferences.autoUnlock) {
      if (params.autoUnlock && state.locked) throw new Error('Unlock the drive before enabling automatic unlock.');
      await backend(params.autoUnlock ? 'setAutoUnlock' : 'forgetSavedCredential', params.autoUnlock ? { enabled: true } : { storageDir: preferences.storageDir, cacheDir: preferences.cacheDir });
    }
    if (params.historyRetentionDays !== undefined && !state.locked) await backend('setHistoryRetention', { days: params.historyRetentionDays });
    Object.assign(preferences, params); await savePreferences();
    applyStartup(preferences.startup);
    publish(); return snapshot();
  }
  if (method === 'openExplorer') return openPath(mountedPath());
  if (method === 'openFile') return openPath(mountedPath(params.path));
  if (method === 'exportFile') {
    const source = mountedPath(params.path);
    const picked = await dialog.showSaveDialog(window, { title: 'Export a readable copy', defaultPath: path.win32.basename(params.path) }); if (picked.canceled) return null;
    const target = await safeDestination(picked.filePath, [state.storageDir, state.cacheDir, mountedPath()]); await fs.copyFile(source, target); return target;
  }
  if (method === 'importFiles') { const picked = await dialog.showOpenDialog(window, { title: 'Import files into encrypted storage', properties: ['openFile', 'multiSelections'] }); if (picked.canceled) return snapshot(); return perform('importing', () => backend('importFiles', { paths: picked.filePaths })); }
  if (method === 'createVault' || method === 'unlockVault' || method === 'upgradeVault') {
    return perform(method === 'upgradeVault' ? 'upgrading' : 'mounting', async () => {
      if (params.keyFilePath) await safeDestination(params.keyFilePath, [params.storageDir, params.cacheDir]);
      await backend(method === 'upgradeVault' ? 'copyUpgrade' : method === 'createVault' ? 'create' : 'unlock', params);
      preferences = { ...preferences, storageDir: params.storageDir, cacheDir: params.cacheDir, driveLetter: params.driveLetter, autoUnlock: Boolean(params.autoUnlock), transport: params.transport || 'folder', remoteRepository: params.remoteRepository };
      await savePreferences();
      await backend('setHistoryRetention', { days: preferences.historyRetentionDays });
      const response = await backend('mount', { driveLetter: params.driveLetter });
      return { ...response, preferences: { ...preferences } };
    });
  }
  const commands = { mount: 'mount', unmount: 'unmount', lockVault: 'lock', keepOffline: 'keepOffline', releaseOffline: 'releaseOffline', setPartSize: 'setPartSize', resplit: 'resplit', sync: 'sync' };
  return perform(['lockVault', 'unmount'].includes(method) ? 'unmounting' : method === 'mount' ? 'mounting' : method, () => backend(commands[method], params));
}
function showWindow() { window.show(); window.focus(); }
async function quit() {
  try { if (helper && !state.locked) await perform('unmounting', () => backend('lock')); verificationStartup?.restore(); shuttingDown = true; helper?.dispose(); setImmediate(() => app.quit()); }
  catch (error) { showWindow(); await dialog.showMessageBox(window, { type: 'error', title: 'Close open drive files first', message: error.message }); }
}
if (process.platform === 'win32' && process.argv.includes('--squirrel-uninstall')) {
  app.setLoginItemSettings({ openAtLogin: false, path: process.execPath, args: ['--startup'] });
}
if (squirrelStartup || !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => window && showWindow());
  app.whenReady().then(async () => {
    if (verificationMode && process.platform === 'win32') verificationStartup = createVerificationStartup(app, process.execPath, 'MaterialFileEncryptorVerification-' + randomBytes(16).toString('hex'));
    try {
      const saved = JSON.parse(await fs.readFile(configPath(), 'utf8'));
      for (const key of ['startup', 'autoUnlock']) if (typeof saved[key] === 'boolean') preferences[key] = saved[key];
      for (const key of ['storageDir', 'cacheDir', 'driveLetter', 'remoteRepository']) if (typeof saved[key] === 'string') preferences[key] = saved[key];
      if (['folder', 'privateGit'].includes(saved.transport)) preferences.transport = saved.transport;
      if (saved.historyRetentionDays === null || (Number.isInteger(saved.historyRetentionDays) && saved.historyRetentionDays >= 1 && saved.historyRetentionDays <= 36500)) preferences.historyRetentionDays = saved.historyRetentionDays;
    } catch { /* First launch or invalid settings uses defaults. */ }
    applyStartup(preferences.startup);
    window = new BrowserWindow({ width: 1180, height: 850, minWidth: 880, minHeight: 650, frame: false, show: false, backgroundColor: '#f7f9f8', webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    ipcMain.handle('vault:request', async (event, method, params) => { if (!trustedFrame(event, window, rendererURL)) throw new Error('Untrusted request source.'); return request(method, params); });
    ipcMain.handle('vault:verification-quit', async event => {
      if (!verificationMode || !verificationStartup || !trustedFrame(event, window, rendererURL)) throw new Error('Verification quit is unavailable.');
      if (operation) throw new Error('Wait for the current drive operation to finish.');
      if (helper && !state.locked) await perform('unmounting', () => backend('lock'));
      const proof = verificationStartup.restore();
      shuttingDown = true; helper?.dispose();
      setTimeout(() => app.quit(), 250);
      return proof;
    });
    window.on('close', event => { if (!shuttingDown && !testMode) { event.preventDefault(); window.hide(); } });
    const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIElEQVQ4T2NkqLj/n4ECwESJ5lEDRg0YNWDUgFEDBg0AAEZ7JPE/MhwBAAAAAElFTkSuQmCC');
    tray = new Tray(icon); tray.setToolTip('Material File Encryptor'); tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open Material File Encryptor', click: showWindow }, { label: 'Lock drive', click: () => request('lockVault', {}).catch(() => showWindow()) }, { type: 'separator' }, { label: 'Quit', click: quit }])); tray.on('double-click', showWindow);
    await window.loadFile(rendererPath);
    if (!process.argv.includes('--startup') || testMode) showWindow();
    if (process.platform === 'win32') {
      const executable = app.isPackaged ? path.join(process.resourcesPath, 'native/MaterialFileEncryptor.Host.exe') : path.resolve('out/native/MaterialFileEncryptor.Host.exe');
      helper = new NativeClient(executable); helper.on('slow', warning => { state = { ...state, sync: { ...state.sync, error: warning.message } }; publish(); }); helper.on('status', result => { if (result && typeof result.locked === 'boolean') { state = nativeState(result); publish(); } }); helper.on('exit', () => { state = { ...state, mounted: false, locked: true, files: [], sync: { ...state.sync, error: 'The native helper stopped. Reopen the application.' } }; publish(); });
      try { await backend('status'); if (preferences.autoUnlock && preferences.storageDir) { await backend('autoUnlock', { storageDir: preferences.storageDir, cacheDir: preferences.cacheDir, driveLetter: preferences.driveLetter, transport: preferences.transport, remoteRepository: preferences.remoteRepository }); await backend('setHistoryRetention', { days: preferences.historyRetentionDays }); await backend('mount', { driveLetter: preferences.driveLetter }); } } catch (error) { state.driver.checking = false; state.sync.error = error.message; publish(); }
    } else { state.driver.checking = false; state.driver.error = 'Windows and WinFsp are required to mount a drive.'; publish(); }
  }).catch(() => { app.exit(1); });
  app.on('before-quit', event => { if (!shuttingDown && !testMode) { event.preventDefault(); void quit(); } });
  app.on('window-all-closed', () => { if (testMode) { verificationStartup?.restore(); shuttingDown = true; helper?.dispose(); app.quit(); } });
}
