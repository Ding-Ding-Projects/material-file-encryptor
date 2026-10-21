import { squirrelHandled } from './squirrel-hook-entry.js';
import {createProfileAuthenticationDialog} from './profile-authentication-dialog.js';
import {createBrowserConfirmPrompt} from './browser-confirm-prompt.js';
import {readRuntimeAccessibility} from './startup-photo-service.js';
import { selectVerificationRestartContext } from './verification-restart-context.js';
import { readFileSync } from 'node:fs';
import { app, autoUpdater, BrowserWindow, dialog, ipcMain, Menu, powerMonitor, safeStorage, shell, Tray } from 'electron'
import { createMaterialDialogs, materialDialogPaths } from './material-dialog.js'
import { describePending, shutdownPrompt } from './shutdown-pending.js';
import { createTrayNotice } from './tray-notice.js';
import { createWindowCloseHandler, closeChoiceFromResponse } from './window-close.js';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exportDialogOptions, chosenExportPath } from './export-dialog.js';
import { NativeClient } from './native-client.js';
import { VaultSessions } from './vault-sessions.js';
import { createVaultSessionSettings } from './vault-session-settings.js';
import { createVaultImageService } from './vault-image-service.js';
import { createRegistrySyncService } from './registry-sync-service.js';
import { createRegistryBackground } from './registry-background.js';
import { createDockerImageTransport } from './vault-image-docker.js';
import { registryVerificationDestination } from './registry-verification.js';
import { createRegistryConflictRequests, REGISTRY_CONFLICT_METHODS } from './registry-conflict-requests.js';
import { createVaultImageRequests, VAULT_IMAGE_METHODS } from './vault-image-requests.js';
import { validateRequest, validateFeatureRequest, validateWorkflowAdmission, trustedFrame } from './validation.js';
import { parseVocabulary, MAX_VOCABULARY_BYTES } from '../shared/personal-vocabulary.js';
import { createFeatureServices } from './feature-services.js';
import {MODEL_STARTUP_NOT_STARTED} from './model-startup-readiness.js';
import { createLocalAdapter } from './local-adapter.js';
import { explorerCopyPath } from './explorer-command.js';
import { createUpdateService } from './update-service.js';
import { createRestartPreparation } from './restart-preparation.js';
import { createBrowserHandoffLifecycle } from './browser-native-host.js';
import { repairNativeHostRegistration, fixedManifestDirectory } from './browser-host-registration.js';
import { DEFAULT_DRIVE_NAME, normalizeDriveName } from '../shared/drive-name.js';
import { createPairingCodes } from './browser-pairing-code.js';
import { createSessionEnd } from './session-end.js';

import { desktopIconPath, brandedBrowserWindow } from './desktop-icons.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const desktopIcon = desktopIconPath({packaged: app.isPackaged, resourcesPath: process.resourcesPath, applicationRoot: path.resolve(directory, '../..')});
const DesktopBrowserWindow = brandedBrowserWindow(BrowserWindow, desktopIcon);
const rendererPath = path.resolve(directory, '../renderer/index.html');
// Message boxes render as Material dialogs in main-owned windows; file pickers stay native.
const materialDialogs = createMaterialDialogs({ BrowserWindow: DesktopBrowserWindow, ipcMain, nativeDialog: dialog, ...materialDialogPaths(directory), getTheme: async parent => { const source = parent ?? window; if (!source || source.isDestroyed()) return null; return source.webContents.executeJavaScript('document.documentElement.dataset.theme || ""', true); }, getLanguage: async parent => { const source = parent ?? window; if (!source || source.isDestroyed()) return null; return source.webContents.executeJavaScript('document.documentElement.getAttribute("data-control-language") || ""', true); }, onError: error => console.error('Material dialog fell back to the native dialog:', error?.message) });
const uiDialog = Object.freeze({ showMessageBox: (...args) => materialDialogs.showMessageBox(...args), showOpenDialog: (...args) => dialog.showOpenDialog(...args), showSaveDialog: (...args) => dialog.showSaveDialog(...args), showErrorBox: (...args) => dialog.showErrorBox(...args) });
const nativeProfileDialog=createProfileAuthenticationDialog({BrowserWindow:DesktopBrowserWindow,ipcMain,directory,getWindow:()=>window,getLanguage:async()=>window&&!window.isDestroyed()?window.webContents.executeJavaScript('document.documentElement.getAttribute("data-control-language")',true):'en',getTheme:async()=>window&&!window.isDestroyed()?window.webContents.executeJavaScript('document.documentElement.dataset.theme',true):'system'});
const browserConfirm=createBrowserConfirmPrompt({showMessageBox:(...args)=>materialDialogs.showMessageBox(...args),getWindow:()=>window,getLanguage:async()=>window&&!window.isDestroyed()?window.webContents.executeJavaScript('document.documentElement.getAttribute("data-control-language")',true):'en'});
const rendererURL = pathToFileURL(rendererPath).href;
const testMode = !app.isPackaged && process.argv.includes('--desktop-check');
const restartContext = selectVerificationRestartContext({ executable: process.execPath, packaged: app.isPackaged, version: app.getVersion(), readBuildMetadata: () => JSON.parse(readFileSync(path.resolve(directory, '../shared/build-metadata.json'), 'utf8')) });
if (restartContext) {
  const declaredProfile = process.argv.find(argument => argument.startsWith('--verification-profile='))?.slice('--verification-profile='.length);
  if (declaredProfile && declaredProfile !== restartContext.profile) throw new Error('Verification profile does not match restart context.');
  if (app.commandLine.hasSwitch('remote-debugging-pipe')) throw new Error('Verification debugging transport does not match restart context.');
  const declaredPort = app.commandLine.getSwitchValue('remote-debugging-port');
  const declaredHost = app.commandLine.getSwitchValue('remote-debugging-address');
  if ((declaredPort && declaredPort !== String(restartContext.debugPort)) || (declaredHost && declaredHost !== restartContext.debugHost)) throw new Error('Verification debugging does not match restart context.');
  app.commandLine.appendSwitch('remote-debugging-address', restartContext.debugHost);
  app.commandLine.appendSwitch('remote-debugging-port', String(restartContext.debugPort));
}
const verificationProfile = restartContext?.profile || process.argv.find(argument => argument.startsWith('--verification-profile='))?.slice('--verification-profile='.length);
if (verificationProfile) {
  if ((!restartContext && !process.argv.includes('--desktop-check')) || !path.isAbsolute(verificationProfile)) throw new Error('Verification requires an explicit absolute profile directory and desktop-check mode.');
  app.setPath('userData', verificationProfile);
} else if (testMode) app.setPath('userData', path.resolve('out/desktop-profile'));
const verificationMode = Boolean(restartContext || verificationProfile && process.argv.includes('--desktop-check'));
const registryTestDestination = registryVerificationDestination({ argv: process.argv, verificationMode, profile: verificationProfile });
function startupReadbackOptions(executable) {
  // The pinned Windows runtime parses the lookup path as a command line.
  // Quote only the getter input so spaces remain part of the executable path.
  const bare = executable.startsWith('"') && executable.endsWith('"') ? executable.slice(1, -1) : executable;
  return { path: '"' + bare + '"', args: ['--startup'] };
}
function createVerificationStartup() {
  // Isolated verification never registers a login item, including on shutdown.
  // This reports suppression, not a successful native startup-toggle check.
  const read = () => ({ verificationOnly: true, enabled: false, originalEnabled: false, restored: true, mutationSuppressed: true, reason: 'VERIFICATION_STARTUP_DISABLED' });
  return { read, restore: read };
}
let verificationStartup;
function applyStartup(enabled) {
  if (verificationMode) return;
  if (app.isPackaged && process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: ['--startup'] });
}
function startupRegistration() {
  if (verificationMode) return (verificationStartup || createVerificationStartup()).read();
  if (process.platform !== 'win32') return { enabled: false, verificationOnly: false, restored: false };
  const settings = app.getLoginItemSettings(startupReadbackOptions(process.execPath));
  return { enabled: settings.openAtLogin, verificationOnly: false, restored: false };
}
const configPath = () => path.join(app.getPath('userData'), 'preferences.json');
const sessionMarkerPath = () => path.join(app.getPath('userData'), 'session-open.json');
// One-time, non-blocking tray balloon the first time closing the window leaves the app running in the tray.
const trayNotice = createTrayNotice({
  markerPath: () => path.join(app.getPath('userData'), 'tray-notice-shown.json'),
  getLanguage: async () => window && !window.isDestroyed() ? window.webContents.executeJavaScript('document.documentElement.getAttribute("data-control-language") || ""', true) : 'en',
  show: ({title, content}) => { if (tray && typeof tray.displayBalloon === 'function') tray.displayBalloon({title, content, iconType: 'info', noSound: true}); }
});
const selectedImports = new Set();
const selectedExports = new Set();
const selectedExportFolders = new Set();
let sessionEnd, window, tray, helper, features, localAdapter, browserHandoff, updates, shuttingDown = false, operation = null, quitPending = false, updateInstallLease = false, updateLanguage = 'en', interruptedSession = false;
let cachedStartupRegistration = { enabled: false, verificationOnly: false, restored: false };
const buildMetadata = { version: app.getVersion(), builtAt: null };
let preferences = { startup: true, autoUnlock: false, driveLetter: 'M:', driveName: DEFAULT_DRIVE_NAME, transport: 'folder', historyRetentionDays: null, performanceMode: 'responsive' };
let state = { locked: true, mounted: false, files: [], availableDriveLetters: [], sync: { running: false, lastSync: null, error: null }, driver: { available: false, checking: true, error: 'Checking WinFsp availability.' } };
const vaultSessions = new VaultSessions({ initialState: state, initialPreferences: preferences, cacheRoot: id => path.join(app.getPath('userData'), 'VaultCaches', id) });
const sessionSettings = createVaultSessionSettings({ filePath: () => path.join(app.getPath('userData'), 'vault-sessions.json') });
let sessionSettingsError = null;
const vaultImages = createVaultImageService({ workRoot: path.join(app.getPath('userData'), 'VaultImages'), nativeRequest: (method, params, sessionId) => vaultSessions.request(method, params, sessionId) });
const imageRequest = createVaultImageRequests({ service: vaultImages, confirm: options => uiDialog.showMessageBox(window, options), available: () => Boolean(helper) && !verificationMode && !testMode, exiting: () => quitPending || shuttingDown || updateInstallLease });
const registryRoot = path.join(app.getPath('userData'), 'RegistrySync');
const registryDocker = createDockerImageTransport();
const registrySync = createRegistrySyncService({ root: registryRoot,
  testDestination: registryTestDestination,
  contexts: id => id === undefined ? [...vaultSessions.rows] : (() => { const row = vaultSessions.rows.get(id); return row && { storageDir: row.state.storageDir || row.preferences.storageDir, transport: row.preferences.transport || 'folder' }; })(),
  nativeRequest: (method, params, id) => vaultSessions.request(method, params, id),
  authorize: (repository, signal) => registryDocker.registryAuthorization(repository, signal),
  chooseRestore: async () => { const result = await uiDialog.showOpenDialog(window, { title: 'Choose a parent folder for a new restored vault · 選擇還原磁碟嘅上層資料夾', properties: ['openDirectory', 'createDirectory'] }); if (result.canceled) return null; return safeDestination(result.filePaths[0], [...vaultSessions.rows.values()].flatMap(row => [row.state.storageDir, row.preferences.storageDir, row.state.cacheDir, row.preferences.cacheDir])); },
  backgroundRegistration: createRegistryBackground({ root: registryRoot, executable: process.execPath, packaged: app.isPackaged && !verificationMode && Boolean(fixedManifestDirectory(process.execPath)) }) });
const REGISTRY_METHODS = new Set(['registryStorageStatus', 'configureRegistryStorage', 'syncRegistryStorage', 'listRegistrySnapshots', 'restoreRegistrySnapshot', 'cancelRegistryStorage']);
const conflictRequest = createRegistryConflictRequests({
  nativeRequest: (method, params, id) => vaultSessions.request(method, params, id),
  confirm: options => uiDialog.showMessageBox(window, options),
  available: () => Boolean(helper) && state.locked === false && state.lockVerified !== false,
  exiting: () => quitPending || shuttingDown || updateInstallLease,
  busy: () => registrySync.pending, selectedSession: () => vaultSessions.selectedId, language: () => preferences.language,
});
let registryTimer;
async function runRegistryDue() { if (helper && (!verificationMode || registryTestDestination) && !testMode && !shuttingDown && !quitPending && !updateInstallLease) await registrySync.tick(); }
const inside = (parent, child) => { const rel = path.relative(parent, child); return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)); };
const nativeState = value => ({ ...value, driver: { ...value.driver, checking: false } });
const snapshot = () => ({
  ...state,
  sessionId: vaultSessions.selectedId,
  sessions: vaultSessions.inventory(),
  storageDir: state.storageDir || preferences.storageDir,
  cacheDir: state.cacheDir || preferences.cacheDir || path.join(app.getPath('userData'), 'EncryptedCache'),
  driveLetter: state.locked ? preferences.driveLetter : state.driveLetter,
  driveName: state.locked ? preferences.driveName : state.driveName,
  transport: state.locked ? { ...state.transport, mode: preferences.transport, remoteRepository: preferences.remoteRepository } : state.transport,
  sync: { ...state.sync, error: sessionSettingsError || state.sync?.error },
  operation,
  modelStartupReadiness:features?.modelStartupReadiness()||{...MODEL_STARTUP_NOT_STARTED},
  build: buildMetadata,
  browserDownloadHandoff: browserHandoff?.status() || { available: false, configured: false, reason: 'NOT_INITIALIZED', installation: 'not-performed' },
  startupRegistration: cachedStartupRegistration,
  defaults: { cacheDir: preferences.cacheDir || path.join(app.getPath('userData'), 'EncryptedCache'), driveLetter: preferences.driveLetter, driveName: preferences.driveName },
  preferences: { ...preferences, startup: vaultSessions.rows.get('main').preferences.startup },
});
function publish() { vaultSessions.remember(state, preferences); if(state.locked||state.lockVerified===false)browserHandoff?.revoke('lock');updateTray(); if (window && !window.isDestroyed()) window.webContents.send('vault:state', snapshot()); }
async function closeBrowserHandoff(){const receipt=await browserHandoff?.close();if(receipt&&receipt.verified!==true)throw new Error('Native browser handoff exit is unverified. Resolve pending pairing approval and retry Quit.');return receipt;}
async function handleStartupFailure(){
  try{await closeBrowserHandoff();app.exit(1);return{exited:true};}
  catch{
    state={...state,recoveryRequired:true,sync:{...state.sync,error:'Startup failed and native browser handoff exit is unverified. The application remains running. Resolve pending pairing approval, then retry shutdown.'}};
    if(window&&!window.isDestroyed()){
      try{
        showWindow();publish();
        const answer=await uiDialog.showMessageBox(window,{type:'error',buttons:['Keep running · 保持運行','Retry shutdown · 重試關閉'],defaultId:0,cancelId:0,title:'Startup shutdown is unverified · 啟動失敗後關閉未核實',message:'The owned native browser process has not confirmed safe exit. · 自行管理嘅瀏覽器原生程序未確認安全離開。',detail:'The desktop remains running. Resolve any pending pairing approval and choose Retry shutdown to check the same process and stream evidence again. No unrelated process will be terminated.\n桌面程式會保持運行。請先處理未完成配對同意，再選擇重試關閉，重新核對同一程序同串流證據。唔會終止無關程序。'});
        if(answer.response===1)return handleStartupFailure();
      }catch{console.error('Startup recovery surface is unavailable; the application remains running with unverified native shutdown.');}
    }else console.error('Startup shutdown is unverified; the application remains running for recovery.');
    return{exited:false,reason:'NATIVE_HANDOFF_EXIT_UNVERIFIED'};
  }
}
async function savePreferences() {
  vaultSessions.remember(state, preferences);
  // Credentials never enter preferences. Additional sessions are deliberately
  // reopened explicitly after restart, rather than silently mounting more drives.
  const primary = vaultSessions.rows.get('main').preferences;
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(primary), { mode: 0o600 });
  await sessionSettings.save(vaultSessions.savedSessions());
}
async function backend(method, params = {}) {
  if (!helper) throw new Error('The mounted drive is available on Windows.');
  const result = await helper.request(method, params);
  if (result && typeof result.locked === 'boolean') state = nativeState(result);
  else state = nativeState(await helper.request('statusSummary'));
  if(state.locked)localAdapter?.revoke();
  void features?.checkpoint('Drive state changed.',null);
  publish(); return snapshot();
}
async function perform(label, task) {
  if (operation) throw new Error('Wait for the current drive operation to finish.');
  operation = label; publish();
  try { return await task(); } finally { operation = null; publish(); }
}
let lastExportDirectory = null;
/** A name inside a chosen export folder that never replaces an existing file. */
async function uniqueExportName(folder, name) {
  const extension = path.extname(name), stem = name.slice(0, name.length - extension.length);
  for (let index = 0; index < 1000; index += 1) {
    const candidate = path.join(folder, index ? `${stem} (${index + 1})${extension}` : name);
    try { await fs.lstat(candidate); } catch (error) { if (error.code === 'ENOENT') return candidate; throw error; }
  }
  throw new Error('Too many files share this name in the export folder.');
}
async function safeDestination(filename, forbidden) {
  forbidden = [...forbidden, ...[...vaultSessions.rows.values()].flatMap(row => [row.state.storageDir, row.state.cacheDir, row.preferences.storageDir, row.preferences.cacheDir, row.state.mounted && /^[D-Z]:$/.test(row.state.driveLetter || '') ? row.state.driveLetter + '\\' : null])];
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
async function forceLockDrive(language = 'en') {
  const text = (en, yue) => language === 'yue' ? yue : language === 'bilingual' ? `${en} · ${yue}` : en;
  const title = text('Force Lock', '強制鎖定');
  const answer = await uiDialog.showMessageBox(window, {
    type: 'warning', buttons: [text('Keep running', '繼續運行'), title], defaultId: 0, cancelId: 0, title,
    message: text('Lock this drive now?', '而家鎖定呢個磁碟？'),
    detail: text('Force lock cancels active transfers and synchronization, closes the files and folders that other programs still have open on this drive, and then locks it. Save your work in those programs first, because they lose access to the drive. Everything already saved stays safe in the encrypted journal. Other programs may keep plaintext they already read.', '強制鎖定會取消進行緊嘅傳輸同同步，關閉其他程式仍然開住嘅檔案同資料夾，然後鎖定磁碟。請先喺嗰啲程式儲存你嘅工作，否則佢哋會失去磁碟存取。已經儲存嘅內容會安全留喺加密日誌入面。其他程式可能仍保留之前讀取過嘅明文。'),
  });
  if (answer.response !== 1) return {cancelled: true};
  browserHandoff?.revoke('lock');
  const result = await helper.request('forceLock');
  if (result.locked) { state = nativeState(await helper.request('statusSummary')); publish(); }
  else if (result.busy) {
    // Force lock has already cancelled what it can and waited; this is what is left.
    if (result.code === 'operations-active') throw new Error(text('Force Lock waited, but a command on the drive did not finish in time. The drive is still mounted. Wait a moment and try again.', '強制鎖定已等候，但磁碟上嘅指令未能及時完成。磁碟仍然掛載，請稍等一陣再試。'));
    if (result.code === 'crypto-active') throw new Error(text('Force Lock waited, but the drive was still busy encrypting or decrypting data. The drive is still mounted. Wait a moment and try again.', '強制鎖定已等候，但磁碟仍然忙緊加密或解密資料。磁碟仍然掛載，請稍等一陣再試。'));
    if (result.code === 'filesystem-handles-active') throw new Error(text('Force Lock could not close all open files because the drive was still reading or writing. The drive is still mounted. Try again.', '強制鎖定未能關閉所有開啟嘅檔案，因為磁碟仍然讀寫緊資料。磁碟仍然掛載，請再試一次。'));
    throw new Error(text('Force Lock could not finish while the drive was busy. The drive is still mounted. Try again.', '磁碟忙緊，強制鎖定未能完成。磁碟仍然掛載，請再試一次。'));
  }
  else throw new Error(text('Force Lock did not confirm that the drive was detached and locked.', '強制鎖定未能確認磁碟已卸載及鎖定。'));
  return result;
}
async function request(method, params, context, expectedSessionId) {
  if (['addSession', 'selectSession', 'removeSession'].includes(method)) {
    params = validateRequest(method, params);
    if (expectedSessionId !== undefined && expectedSessionId !== vaultSessions.selectedId)
      throw new Error('The selected vault changed. Review it and try again.');
    return vaultSessions.change(async () => {
      if (!helper || quitPending || shuttingDown || updateInstallLease || operation || (method !== 'selectSession' && registrySync.pending) || browserHandoff?.pending || await features?.pending())
        throw new Error('Finish the current action before changing vault sessions.');
      vaultSessions.remember(state, preferences);
      await browserHandoff?.revoke('vault-selection');
      localAdapter?.revoke(); pairingCodes.clear();
      if (method === 'addSession') await vaultSessions.add(preferences);
      else if (method === 'selectSession') vaultSessions.select(params.sessionId);
      else { await vaultImages.discard(params.sessionId); await vaultSessions.remove(params.sessionId); }
      ({ state, preferences } = vaultSessions.selected);
      selectedImports.clear(); selectedExports.clear(); selectedExportFolders.clear();
      try { if (method !== 'selectSession') await savePreferences(); }
      finally { publish(); }
      return snapshot();
    });
  }
  return vaultSessions.run(() => dispatchRequest(method, params, context), expectedSessionId);
}
async function dispatchRequest(method, params, context) {
  params = validateRequest(method, params);
  if (method === 'featureRequest') return featureRequest(params.feature,params.action,params.payload,context);
  if (updateInstallLease && !['getState','buildMetadata','operations','windowControl'].includes(method)) throw new Error('The application is preparing an update. Wait for it to finish.');
  if (REGISTRY_CONFLICT_METHODS.has(method)) {
    const id = vaultSessions.selectedId;
    if (method === 'listRegistryConflicts') return conflictRequest(method, params, id);
    return perform(method, async () => {
      const result = await conflictRequest(method, params, id);
      if (result?.resolved === true) { state = nativeState(await vaultSessions.request('statusSummary', {}, id)); publish(); }
      return result;
    });
  }
  if (REGISTRY_METHODS.has(method)) {
    if (!helper || (verificationMode || testMode) && !registryTestDestination) throw Error('Registry synchronization requires the native vault helper.');
    const id = vaultSessions.selectedId;
    if (method === 'registryStorageStatus') return registrySync.status(id);
    if (method === 'cancelRegistryStorage') return registrySync.cancel(id);
    if (quitPending || shuttingDown || updateInstallLease) throw Error('The application is preparing to close.');
    if (method === 'configureRegistryStorage') return registrySync.configure(id, params);
    if (method === 'syncRegistryStorage') return registrySync.sync(id);
    if (method === 'listRegistrySnapshots') return registrySync.list(id);
    if (method === 'restoreRegistrySnapshot') return registrySync.restore(id, params.digest);
  }
  if (registrySync.pending && ['createVault', 'unlockVault', 'upgradeVault', 'lockVault', 'forceLock', 'unmount', 'mount', 'setPreferences'].includes(method)) throw Error('Wait for registry synchronization before changing the vault session.');
  if (VAULT_IMAGE_METHODS.has(method)) return imageRequest(method, params, vaultSessions.selectedId);
  if (method === 'getState') return snapshot();
  if (method === 'buildMetadata') return buildMetadata;
  if (method === 'browserPairing') { if(state.locked||state.lockVerified===false)throw Error('Unlock the drive before pairing the browser.');await localAdapter.start();return{address:localAdapter.address,...localAdapter.pairingCode()}; }
  if (method === 'quit') return quit(true);
  if (['listVersions', 'listVersionLabels', 'listDeleted', 'listFiles', 'listActivity', 'previewVersion', 'labelVersion', 'operations', 'cancelOperation'].includes(method)) {
    if (!helper) throw new Error('Unlock a Windows vault to browse its history.');
    return helper.request(method, params);
  }
  if (method === 'storageDiagnostics' || method === 'startPacking') {
    if (!helper || state.locked) throw new Error('Unlock the drive before maintaining storage.');
    if (method === 'startPacking' && (quitPending || shuttingDown)) throw new Error('The application is waiting to quit.');
    return helper.request(method, params);
  }
  if (method === 'forceLock') return forceLockDrive(params.language);
  if (method === 'exportText') {
    const picked=await dialog.showSaveDialog(window,exportDialogOptions(params,{lastDirectory:lastExportDirectory,documentsDirectory:app.getPath('documents')}));
    if(picked.canceled||!picked.filePath)return null;
    const target=await safeDestination(chosenExportPath(picked.filePath,params.name),[state.storageDir,state.cacheDir,state.mounted?mountedPath():null]);
    lastExportDirectory=path.dirname(target);
    await fs.writeFile(target,params.content,{encoding:'utf8',mode:0o600});return {saved:true};
  }
  if (method === 'exportVersion') {
    const picked=await dialog.showSaveDialog(window,{title:'Export saved version'});if(picked.canceled)return null;
    const destination=await safeDestination(picked.filePath,[state.storageDir,state.cacheDir,state.mounted?mountedPath():null]);
    if (quitPending) throw new Error('The application is waiting to quit.');
    return helper.request('startExport',{versionId:params.versionId,destination});
  }
  if (['saveVersion', 'restoreVersion', 'restoreDeleted', 'emptyRecycleBin'].includes(method)) return perform(method, () => backend(method, params));
  if (method === 'chooseFiles') { const picked = await dialog.showOpenDialog(window, { title: 'Import files into encrypted storage', properties: ['openFile', 'multiSelections'] }); if (picked.canceled) return []; for (const filename of picked.filePaths) selectedImports.add(filename); return picked.filePaths; }
  if (method === 'chooseExportFolder') { const picked = await dialog.showOpenDialog(window, { title: 'Export readable copies to a folder', properties: ['openDirectory', 'createDirectory'] }); if (picked.canceled || !picked.filePaths[0]) return null; selectedExportFolders.add(picked.filePaths[0]); return picked.filePaths[0]; }
  if (method === 'chooseExport') { const picked = await dialog.showSaveDialog(window, { title: 'Export a readable copy', defaultPath: path.win32.basename(params.name) }); if (picked.canceled) return null; selectedExports.add(picked.filePath); return picked.filePath; }
  if (method === 'importSelected' || method === 'startImport') { if (quitPending) throw new Error('The application is waiting to quit.'); if (params.paths.some(filename => !selectedImports.has(filename))) throw new Error('Choose files using the file picker.'); for (const filename of params.paths) selectedImports.delete(filename); return helper.request('startImport', { paths: params.paths }); }
  if (method === 'fileAction') { const entry = await helper.request('getFile',{entryId:params.id}); if (!entry) throw new Error('Select a current file.'); if (params.action === 'open') return openPath(mountedPath(entry.path)); if (params.action === 'delete') return perform('delete', async () => { await fs.rm(mountedPath(entry.path), { force: false, recursive: false }); return backend('statusSummary'); }); if (params.action === 'export') { const folderExport = !selectedExports.has(params.destination) && selectedExportFolders.has(path.dirname(params.destination || '')); if (!folderExport && !selectedExports.delete(params.destination)) throw new Error('Choose an export destination using the file picker.'); const wanted = folderExport ? await uniqueExportName(path.dirname(params.destination), path.basename(params.destination)) : params.destination; const target = await safeDestination(wanted, [state.storageDir, state.cacheDir, mountedPath()]); if (quitPending || shuttingDown) throw new Error('The application is waiting to quit.'); return helper.request('startExport', {path:entry.path,destination:target}); } return perform(params.action, () => backend(params.action, { path: entry.path })); }
  if (method === 'resplitAll') return perform('resplit', async () => { for (const file of await currentFileInventory()) await backend('resplit', { path: file.path, partSizeBytes: state.partSizeBytes }); return snapshot(); });
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
  if (method === 'importVocabulary') { const picked = await dialog.showOpenDialog(window, { title: 'Import vocabulary JSON', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] }); if (picked.canceled) return null; const stat = await fs.stat(picked.filePaths[0]); if (stat.size > MAX_VOCABULARY_BYTES) throw new Error('Vocabulary JSON must be no larger than 256 KiB.'); return parseVocabulary(await fs.readFile(picked.filePaths[0], 'utf8')); }
  if (method === 'installDriver') {
    const root = app.isPackaged ? process.resourcesPath : path.resolve(directory, '../..');
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'dependencies.json'), 'utf8'));
    const installer = path.join(root, app.isPackaged ? 'driver' : '.cache/driver', `winfsp-${manifest.winfsp.version}.msi`);
    if (createHash('sha256').update(await fs.readFile(installer)).digest('hex') !== manifest.winfsp.sha256) throw new Error('Driver installer integrity check failed. Reinstall the application.');
    await openPath(installer); return;
  }
  if (method === 'setPreferences') {
    if (params.performanceMode !== undefined && helper) await backend('setPerformanceMode', { mode: params.performanceMode });
    if (params.autoUnlock !== undefined && params.autoUnlock !== preferences.autoUnlock) {
      if (params.autoUnlock && vaultSessions.selectedId !== 'main') throw new Error('Automatic startup unlock is available only for the primary vault.');
      if (params.autoUnlock && state.locked) throw new Error('Unlock the drive before enabling automatic unlock.');
      await backend(params.autoUnlock ? 'setAutoUnlock' : 'forgetSavedCredential', params.autoUnlock ? { enabled: true } : { storageDir: preferences.storageDir, cacheDir: preferences.cacheDir });
    }
    if (params.historyRetentionDays !== undefined && !state.locked) await backend('setHistoryRetention', { days: params.historyRetentionDays });
    if (params.startup !== undefined) vaultSessions.rows.get('main').preferences.startup = params.startup;
    Object.assign(preferences, params); await savePreferences();
    applyStartup(vaultSessions.rows.get('main').preferences.startup);
    cachedStartupRegistration = startupRegistration();
    publish(); return snapshot();
  }
  if (method === 'openExplorer') return openPath(mountedPath());
  if (method === 'openFile') return openPath(mountedPath(params.path));
  if (method === 'exportFile') {
    const picked = await dialog.showSaveDialog(window, { title: 'Export a readable copy', defaultPath: path.win32.basename(params.path) }); if (picked.canceled) return null;
    const target = await safeDestination(picked.filePath, [state.storageDir, state.cacheDir, mountedPath()]);
    if (quitPending || shuttingDown) throw new Error('The application is waiting to quit.');
    return helper.request('startExport',{path:params.path,destination:target});
  }
  if (method === 'importFiles') { const picked = await dialog.showOpenDialog(window, { title: 'Import files into encrypted storage', properties: ['openFile', 'multiSelections'] }); if (picked.canceled) return snapshot(); return helper.request('startImport', { paths: picked.filePaths }); }
  if (method === 'createVault' || method === 'unlockVault' || method === 'upgradeVault') {
    if (params.autoUnlock && vaultSessions.selectedId !== 'main') throw new Error('Automatic startup unlock is available only for the primary vault.');
    return perform(method === 'upgradeVault' ? 'upgrading' : 'mounting', async () => {
      await vaultImages.discard(vaultSessions.selectedId);
      if (params.keyFilePath) await safeDestination(params.keyFilePath, [params.storageDir, params.cacheDir]);
      await backend(method === 'upgradeVault' ? 'copyUpgrade' : method === 'createVault' ? 'create' : 'unlock', params);
      preferences = { ...preferences, storageDir: params.storageDir, cacheDir: params.cacheDir, driveLetter: params.driveLetter, driveName: params.driveName ?? preferences.driveName ?? DEFAULT_DRIVE_NAME, autoUnlock: Boolean(params.autoUnlock), transport: params.transport || 'folder', remoteRepository: params.remoteRepository };
      await savePreferences();
      await backend('setPerformanceMode', { mode: preferences.performanceMode || 'responsive' });
      await backend('setHistoryRetention', { days: preferences.historyRetentionDays });
      const response = await backend('mount', { driveLetter: params.driveLetter, driveName: preferences.driveName });
      return { ...response, preferences: { ...preferences } };
    });
  }
  const commands = { mount: 'mount', unmount: 'unmount', lockVault: 'lock', keepOffline: 'keepOffline', releaseOffline: 'releaseOffline', setPartSize: 'setPartSize', resplit: 'resplit', sync: 'sync' };
  if(['lockVault','unmount'].includes(method))browserHandoff?.revoke('lock');
  return perform(['lockVault', 'unmount'].includes(method) ? 'unmounting' : method === 'mount' ? 'mounting' : method, () => backend(commands[method], params));
}
async function currentFileInventory() {
  const files=[];let cursor=0,revision;
  do {
    const page=await helper.request('listFiles',{cursor,limit:1000,...(revision===undefined?{}:{revision})});
    if(page.resetRequired || (revision!==undefined&&page.revision!==revision))throw new Error('The file list changed. Retry the operation.');
    revision=page.revision;files.push(...page.items);
    if(page.nextCursor===null)return files;
    if(!Number.isSafeInteger(page.nextCursor)||page.nextCursor<=cursor)throw new Error('The file list could not be read completely.');
    cursor=page.nextCursor;
  } while(true);
}
function showWindow() { window.show(); window.focus(); }
async function handleExplorerCopy(argumentsList){
 let source;try{source=explorerCopyPath(argumentsList);}catch{return;}if(!source)return;showWindow();
 if(quitPending)return;
 if(state.locked){await uiDialog.showMessageBox(window,{type:'info',title:'Unlock the encrypted drive',message:'Unlock the drive, then choose Copy to encrypted drive again.'});return;}
 try{if(!(await fs.stat(source)).isFile())throw Error('Choose a regular file.');const result=await uiDialog.showMessageBox(window,{type:'question',buttons:['Cancel','Copy file'],defaultId:0,cancelId:0,title:'Copy to encrypted drive',message:'Import the selected file into encrypted storage?',detail:'The copy uses encrypted staging. Cancel from the workspace or tray to discard the unfinished file.'});if(result.response===1&&!quitPending&&!shuttingDown)await helper.request('startImport',{paths:[source]});}catch(error){await uiDialog.showMessageBox(window,{type:'error',title:'File could not be imported',message:error.message});}
}
const activeTransfers = () => [...vaultSessions.rows].flatMap(([sessionId, row]) => (row.state.operations || []).filter(item => ['queued','running','cancelling'].includes(item.state)).map(item => ({ ...item, sessionId })));
async function lockAllVaults() {
  vaultSessions.remember(state, preferences);
  try { await vaultSessions.each('lock'); }
  finally { state = vaultSessions.selected.state; publish(); }
  if (!vaultSessions.safelyLocked) throw new Error('One or more vaults could not lock. Close their open files and retry.');
}
async function hasActiveWork() {
  if (restartPreparation.started) return false;
  const active=await vaultSessions.operations();
  return Boolean(operation || registrySync.pending || vaultImages.pending || browserHandoff?.pending || await features?.pending() || active.some(item=>['queued','running','cancelling'].includes(item.state)));
}
async function updateStatus() {
  const snapshot=updates?.status()||{state:'unavailable',reason:'NOT_INITIALIZED'};
  const activeWork=await hasActiveWork();
  return {...snapshot,activeWork,desktopAvailable:process.platform==='win32'&&app.isPackaged,canInstall:snapshot.state==='ready'&&!activeWork&&!updateInstallLease};
}
// The one-time browser pairing code lives only here. Lock, exit and update preparation reach it through browserHandoff.revoke().
const pairingCodes=createPairingCodes();
function browserPairingRequest(action){
  if(action==='clear'){pairingCodes.clear();return{cleared:true};}
  if(action!=='issue')throw new Error('Unsupported pairing action.');
  if(state.locked||state.lockVerified===false||quitPending||shuttingDown||updateInstallLease){pairingCodes.clear();throw new Error('Unlock the drive before pairing a browser.');}
  if(browserHandoff?.status().available!==true)throw new Error('The browser receiver is not running on this desktop.');
  return pairingCodes.issue();
}
async function featureRequest(feature,action,payload,context) {
  if(feature==='browser-pairing')return browserPairingRequest(action);
  if(feature==='workflow')validateWorkflowAdmission(action,{locked:state.locked,lockVerified:state.lockVerified,quitPending,shuttingDown,updateInstallLease});
  if(feature!=='updates')return features.request(feature,action,payload,context);
  if(Object.keys(payload).some(key=>key!=='language') || (payload.language!==undefined&&!['en','yue','bilingual'].includes(payload.language)))throw new Error('Invalid update options.');
  if(payload.language)updateLanguage=payload.language;
  if(action==='status')return updateStatus();
  if(!updates)throw new Error('Updates are not available.');
  if(action==='check')await updates.check();
  else if(action==='download')await updates.download();
  else if(action==='install')await updates.installWhenSafe(window);
  else throw new Error('Unsupported update action.');
  return updateStatus();
}
async function acquireUpdateLease() {
  if(quitPending||shuttingDown||updateInstallLease)return null;
  updateInstallLease=true;quitPending=true;await browserHandoff?.revoke('update');features.beginExit();
  const release=()=>{updateInstallLease=false;if(!shuttingDown){quitPending=false;features.endExit();}};
  try {
    if(await hasActiveWork())throw new Error('Active work prevents update installation.');
    if(helper)await lockAllVaults();
    if(!vaultSessions.safelyLocked)throw new Error('The drive must confirm that it is locked before updating.');
    return release;
  } catch(error) {release();throw error;}
}
const restartPreparation=createRestartPreparation({
  verify:async()=>{if(!updateInstallLease||!vaultSessions.safelyLocked||await hasActiveWork())throw new Error('The application is not ready to restart safely.');},
  preflight:async()=>{verificationStartup?.restore();},
  closeServices:async()=>{await closeBrowserHandoff();await localAdapter?.close();await features?.close();registrySync.close();await vaultImages.close();},
  clearMarker:()=>fs.rm(sessionMarkerPath(),{force:true}),
  disposeHelper:async()=>{helper?.dispose();},
  prepared:()=>{shuttingDown=true;}
});
async function prepareUpdateRestart() { await restartPreparation.run(); }
function updateTray() {
  if (!tray) return;
  const active = activeTransfers();
  tray.setToolTip(active.length ? `Material File Encryptor: ${active.length} active transfer(s)` : 'Material File Encryptor');
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'Reopen Material File Encryptor',click:showWindow},
    ...active.map(item=>({label:`${item.state}: ${item.completedFiles}/${item.totalFiles} files`,enabled:false})),
    ...(active.length?[{label:'Cancel unfinished transfers',click:()=>Promise.all(active.map(item=>vaultSessions.request('cancelOperation',{operationId:item.operationId},item.sessionId))).catch(()=>showWindow())}]:[]),
    {label:'Lock selected drive',click:()=>request('lockVault',{}).catch(()=>showWindow())},
    {label:'Lock all drives',click:()=>vaultSessions.run(() => perform('unmounting',lockAllVaults)).catch(()=>showWindow())},
    {type:'separator'},{label:'Quit',click:()=>void quit()}
  ]));
}
async function quit(ownRequest = false) {
  if (vaultSessions.switching || vaultSessions.foreground > (ownRequest ? 1 : 0)) {
    showWindow();
    await uiDialog.showMessageBox(window, { type: 'info', title: 'Finish the current action', message: 'Close pending file dialogs and let the current action finish before quitting.' });
    return;
  }
  if (updateInstallLease && updates?.status().state==='manual-restart-required') {
    try { await prepareUpdateRestart(); await updates.dispose({shutdown:true}); setImmediate(()=>app.quit()); }
    catch { showWindow(); await uiDialog.showMessageBox(window,{type:'error',title:'Exit is not complete',message:'Safe shutdown could not finish. Work remains blocked. Retry Quit after the storage or service problem is resolved.'}); }
    return;
  }
  if (quitPending || shuttingDown) return;
  quitPending=true;await browserHandoff?.revoke('exit');
  try {
    let active=await vaultSessions.operations();
    if (operation || registrySync.pending || await features.pending() || active.some(item=>['queued','running','cancelling'].includes(item.state))) {
      const transfers=(operation?1:0)+active.filter(item=>['queued','running','cancelling'].includes(item.state)).length;
      showWindow();
      const prompt=shutdownPrompt(describePending(await features.pendingDetail(),transfers));
      const answer=await uiDialog.showMessageBox(window,{type:'question',buttons:['Keep running','Finish then quit','Cancel unfinished work then quit'],defaultId:0,cancelId:0,title:prompt.title,message:'What should happen to unfinished work?',detail:prompt.detail});
      if(answer.response===0)return;
      features.beginExit();
      if(answer.response===2)await Promise.all(active.filter(item=>['queued','running','cancelling'].includes(item.state)).map(item=>vaultSessions.request('cancelOperation',{operationId:item.operationId},item.sessionId)));
      if(answer.response===2){await features.cancelAll();if(registrySync.pending)await registrySync.cancel(registrySync.activeSessionId);}
      while(operation || registrySync.pending || await features.pending() || active.some(item=>['queued','running','cancelling'].includes(item.state))) { await new Promise(resolve=>setTimeout(resolve,200));active=await vaultSessions.operations(); }
    }
    features.beginExit();
    if (helper) await perform('unmounting', lockAllVaults);
    if (!vaultSessions.safelyLocked) throw new Error('All vaults must confirm that they are locked.');
    await closeBrowserHandoff();await updates?.dispose();await localAdapter?.close();await features?.close();registrySync.close();await vaultImages.close(); verificationStartup?.restore();await fs.rm(sessionMarkerPath(),{force:true});shuttingDown = true; helper?.dispose(); setImmediate(() => app.quit());
  } catch (error) { showWindow(); await uiDialog.showMessageBox(window, { type: 'error', title: 'Application is still running', message: error.message }); }
  finally {quitPending=false;if(!shuttingDown)features.endExit();}
}
// Squirrel lifecycle arguments were already handled, with a bounded exit, by the first import.
if (squirrelHandled || !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event,args) => {if(args.includes('--registry-sync')){void runRegistryDue().catch(()=>{});return;}if(window){showWindow();void vaultSessions.run(() => handleExplorerCopy(args)).catch(() => showWindow());}});
  app.whenReady().then(async () => {
    interruptedSession=await fs.access(sessionMarkerPath()).then(()=>true,()=>false);
    await fs.mkdir(app.getPath('userData'),{recursive:true});
    await fs.writeFile(sessionMarkerPath(),JSON.stringify({schemaVersion:1,startedAt:new Date().toISOString()}),{mode:0o600});
    if (verificationMode && process.platform === 'win32') verificationStartup = createVerificationStartup();
    try {
      const saved = JSON.parse(await fs.readFile(configPath(), 'utf8'));
      for (const key of ['startup', 'autoUnlock']) if (typeof saved[key] === 'boolean') preferences[key] = saved[key];
      for (const key of ['storageDir', 'cacheDir', 'driveLetter', 'remoteRepository']) if (typeof saved[key] === 'string') preferences[key] = saved[key];
      if (normalizeDriveName(saved.driveName) !== null) preferences.driveName = normalizeDriveName(saved.driveName);
      if (['folder', 'privateGit'].includes(saved.transport)) preferences.transport = saved.transport;
      if (['responsive', 'throughput'].includes(saved.performanceMode)) preferences.performanceMode = saved.performanceMode;
      if (saved.historyRetentionDays === null || (Number.isInteger(saved.historyRetentionDays) && saved.historyRetentionDays >= 1 && saved.historyRetentionDays <= 36500)) preferences.historyRetentionDays = saved.historyRetentionDays;
    } catch { /* First launch or invalid settings uses defaults. */ }
    try { vaultSessions.setSavedSessions(await sessionSettings.load()); }
    catch { sessionSettingsError = 'Saved vault session settings could not be read safely. The original file was preserved. Keep the original encrypted cache folders and repair the settings before saving session changes.'; }
    applyStartup(vaultSessions.rows.get('main').preferences.startup);
    cachedStartupRegistration=startupRegistration();
    try { Object.assign(buildMetadata, JSON.parse(await fs.readFile(path.resolve(directory,'../shared/build-metadata.json'),'utf8'))); } catch { /* Development builds have no invented build date. */ }
    features=createFeatureServices({isPackaged:app.isPackaged,nativeProfilePrompt:context=>nativeProfileDialog.authenticate(context),cancelNativeProfilePrompt:()=>nativeProfileDialog.cancelAll(),nativeRequest:(method,params)=>{if(verificationMode||testMode||!helper)throw Error('Protected native server supervision is unavailable.');if(typeof method==='string'&&method.startsWith('managedOllama.')&&!['managedOllama.start','managedOllama.status','managedOllama.stop','managedOllama.close'].includes(method))throw new Error('The native runtime ownership service is unavailable.');return helper.request(method,params);},accessibilityState:()=>readRuntimeAccessibility(app),dataDirectory:app.getPath('userData'),applicationRoot:path.resolve(directory,'../..'),sandboxDirectory:app.isPackaged?path.join(process.resourcesPath,'converter'):path.resolve('out/converter'),safeStorage,dialog:uiDialog,getWindow:()=>window,getMainFrame:()=>window?.webContents.mainFrame,openPath,openExternal:url=>shell.openExternal(url),onConverterDiagnostic:record=>console.warn('Converter initialization:',JSON.stringify(record)),emit:(feature,data)=>{if(feature==='workflow')browserHandoff?.observeDownload(data);window?.webContents.send('feature:event',feature,data);}});
    app.on('accessibility-support-changed', () => { if(!shuttingDown)window?.webContents.send('feature:event','personalization',{type:'accessibilityState',state:readRuntimeAccessibility(app)}); });
    updates=createUpdateService({app,autoUpdater,dialog:uiDialog,isActiveWork:hasActiveWork,acquireInstallLease:acquireUpdateLease,prepareRestart:prepareUpdateRestart,getLanguage:()=>updateLanguage});
    updates.on('status',()=>{void updateStatus().then(snapshot=>window?.webContents.send('feature:event','updates',{snapshot})).catch(()=>{});});
    localAdapter=createLocalAdapter({isAuthenticated:()=>!state.locked&&state.lockVerified!==false,authorizePair:async({origin})=>(await uiDialog.showMessageBox(window,{type:'question',buttons:['Reject','Pair browser'],defaultId:0,cancelId:0,title:'Pair browser tools',message:'Allow this browser to use local tools?',detail:origin+' will be able to operate approved workflows until the drive locks or the session expires.'})).response===1,dispatch:request});
    window = new DesktopBrowserWindow({ width: 1180, height: 850, minWidth: 880, minHeight: 650, frame: false, show: false, backgroundColor: '#f7f9f8', webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if(url!==rendererURL)event.preventDefault(); });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    let rendererRecoveries=0;
    window.webContents.on('render-process-gone',()=>{if(!shuttingDown&&rendererRecoveries++<3)void window.loadFile(rendererPath);});
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    browserHandoff=createBrowserHandoffLifecycle({pairingCodes,...features.browserProfileAdapters,...features.browserSchoolAdapters,...features.browserElementLockAdapters,...features.browserServerAdapters,...features.browserUnlockLadderAdapters,...features.browserPublishAdapters,...features.browserStatusAdapters,confirmAction:context=>browserConfirm.confirm(context),hasVisibleWindow:()=>Boolean(window&&!window.isDestroyed()&&window.isVisible()&&!window.isMinimized()),focusAuthenticator:()=>{showWindow();window.webContents.send('feature:event','access',{type:'focusAuthenticator'});},revokeProfileAuthority:()=>features.revokeBrowserProfileAuthority(),readUpdateState:()=>({desktopVersion:app.getVersion(),status:updates?.status()}),disposeBrowserConversion:pair=>features.disposeBrowserConversion(pair),browserConversion:(message,context)=>features.browserConversion(message,context),openEditor:context=>features.openBrowserEditor(context),readProtectionStatus:()=>features.readBrowserProtectionStatus(),hostDirectory:app.isPackaged?path.join(process.resourcesPath,'browser-host'):path.resolve('out/browser-host'),verificationMode:verificationMode||testMode,isUnlocked:()=>!state.locked&&state.lockVerified!==false,canAdmit:()=>!quitPending&&!shuttingDown&&!updateInstallLease,onProposal:item=>features.receiveBrowserProposal(item),authorizePair:async({origin,codeMatched})=>{
      if(!window||window.isDestroyed())return false;
      const answer=await uiDialog.showMessageBox(window,{type:'question',buttons:['Reject · 拒絕','Pair downloads · 配對下載'],defaultId:0,cancelId:0,title:'Pair browser downloads · 配對瀏覽器下載',message:'Allow download proposals from this origin? · 允許此來源提出下載建議？',detail:origin+(codeMatched===true?'\nThe extension entered the code shown on this desktop.\n擴充功能輸入咗呢部桌面顯示嘅代碼。':'')+'\nThis origin allowlist cannot authenticate a manually launched same-user process. Pairing lasts up to 15 minutes and ends when the drive locks. Each download still needs its own destination choice and Start confirmation.\n來源允許清單無法驗證手動啟動嘅同用戶程序。配對最多維持 15 分鐘，磁碟鎖定就撤銷。每次下載仍要獨立選擇目的地同確認開始。'});return answer.response===1;
    }});
    // Self-healing: after an update whose installer hook did not finish, the registered manifest can still name a removed version's host.
    // The manifest folder is fixed inside the Squirrel install root, so the profile in use never moves the registry keys; outside that layout nothing is touched.
    if (process.platform === 'win32' && app.isPackaged && !verificationMode) { try { const manifestDirectory = fixedManifestDirectory(process.execPath); if (manifestDirectory) repairNativeHostRegistration({ hostDirectory: path.win32.join(process.resourcesPath, 'browser-host'), installRoot: path.win32.dirname(process.execPath), manifestDirectory, legacyUserData: app.getPath('userData') }); } catch { /* pairing reports its own unavailable state */ } }
    await browserHandoff.initialize();
    ipcMain.handle('vault:request', async (event, method, params, sessionId) => { if (!trustedFrame(event, window, rendererURL)) throw new Error('Untrusted request source.'); return request(method, params,{senderFrame:event.senderFrame},sessionId); });
    ipcMain.handle('feature:request', async (event, feature, action, params) => { if (!trustedFrame(event, window, rendererURL)) throw new Error('Untrusted request source.'); const request = validateFeatureRequest(feature, action, params); return vaultSessions.run(() => featureRequest(request.feature, request.action, request.payload,{senderFrame:event.senderFrame})); });
    ipcMain.handle('vault:verification-quit', async event => {
      if (!verificationMode || !verificationStartup || !trustedFrame(event, window, rendererURL)) throw new Error('Verification quit is unavailable.');
      const active=await vaultSessions.operations();
      if (operation || registrySync.pending || await features.pending() || active.some(item=>['queued','running','cancelling'].includes(item.state))) throw new Error('Wait for the current work to finish.');
      if (helper) await perform('unmounting', lockAllVaults);
      const proof = verificationStartup.restore();
      if (!vaultSessions.safelyLocked) throw new Error('All vaults must confirm that they are locked.');
      await closeBrowserHandoff();await updates?.dispose();await localAdapter?.close();await features.close();registrySync.close();await vaultImages.close();await fs.rm(sessionMarkerPath(),{force:true});shuttingDown = true; helper?.dispose();
      setTimeout(() => app.quit(), 250);
      return proof;
    });
    window.on('close', createWindowCloseHandler({
      isShuttingDown: () => shuttingDown, isTestMode: () => testMode, liveServers: () => features?.liveServers() ?? [], hideWindow: () => { window.hide(); void trayNotice.maybeShow(); }, quit: () => quit(),
      askChoice: async servers => {
        const names = servers.slice(0, 5).map(item => '• ' + item.name).join('\n') + (servers.length > 5 ? '\n• +' + (servers.length - 5) : '');
        const answer = await uiDialog.showMessageBox(window, {
          type: 'question', buttons: ['Keep running in the tray · 保持喺系統匣運行', 'Stop servers and quit · 停止伺服器並結束', 'Cancel · 取消'], defaultId: 0, cancelId: 2,
          title: 'A server is still running · 仲有伺服器運行緊', message: 'What should happen to the running Minecraft server? · 運行緊嘅 Minecraft 伺服器要點處理？',
          detail: names + '\n\nServers running in a container or on an SSH host keep running after you quit. · 容器或者 SSH 主機上面嘅伺服器喺結束之後會繼續運行。'
        });
        return closeChoiceFromResponse(answer.response);
      }
    }));
    // Windows ends the session (shutdown, restart, sign-out): lock the drive in
    // the few seconds available. The query phase can still be vetoed by another
    // program, so it only commits the journal; the definitive event locks.
    sessionEnd = createSessionEnd({
      forceLock: async options => {
        const results = await vaultSessions.each('forceLock', options);
        state = vaultSessions.selected.state; publish();
        return { locked: results.every(result => result?.locked === true) && vaultSessions.safelyLocked };
      },
      flushJournal: async () => ({ flushed: (await vaultSessions.each('flushJournal')).every(result => result?.flushed === true) }),
      isMounted: () => Boolean(helper) && !vaultSessions.safelyLocked,
      clearMarker: () => fs.rm(sessionMarkerPath(), { force: true }),
      beforeLock: () => { browserHandoff?.revoke('lock'); localAdapter?.revoke(); }
    });
    window.on('query-session-end', () => { void sessionEnd.suspend(); });
    window.on('session-end', () => { void sessionEnd.end(); });
    powerMonitor.on('suspend', () => { void sessionEnd.suspend(); });
    powerMonitor.on('shutdown', () => { void sessionEnd.end(); });
    tray = new Tray(desktopIcon); updateTray(); tray.on('double-click', showWindow);
    await window.loadFile(rendererPath);
    if ((!process.argv.includes('--startup') && !process.argv.includes('--registry-sync')) || testMode) showWindow();
    if (process.platform === 'win32') {
      const executable = app.isPackaged ? path.join(process.resourcesPath, 'native/MaterialFileEncryptor.Host.exe') : path.resolve('out/native/MaterialFileEncryptor.Host.exe');
      const nativeClient = new NativeClient(executable,{managedDataRoot:app.getPath('userData')});
      vaultSessions.client = nativeClient;
      helper = { request: (method, params) => vaultSessions.request(method, params), dispose: () => nativeClient.dispose() };
      nativeClient.on('slow', warning => {
        // Do not attribute an unidentified slow response to a different vault.
        if (window && !window.isDestroyed()) window.webContents.send('vault:state', { ...snapshot(), nativeWarning: warning.message });
      });
      nativeClient.on('status', (result, sessionId) => {
        if (result && typeof result.locked === 'boolean') {
          if (vaultSessions.accept(sessionId, nativeState(result))) state = vaultSessions.selected.state;
          publish();
        }
      });
      nativeClient.on('exit', () => { vaultSessions.failAll(); state = vaultSessions.selected.state; publish(); });
      try { await vaultSessions.run(() => vaultSessions.restore(preferences)); }
      catch { sessionSettingsError = 'Some saved vault sessions could not be restored. Their encrypted storage and cache choices were retained; restart to retry. No secondary vault was automatically unlocked.'; }
      try { await vaultSessions.run(async () => { await backend('statusSummary'); await backend('setPerformanceMode', { mode: preferences.performanceMode }); if(interruptedSession){state.recoveryRequired=true;state.sync.error='An interrupted session was detected. Recovery starts locked; unlock explicitly to review encrypted records.';publish();} if (!process.argv.includes('--registry-sync') && !interruptedSession && preferences.autoUnlock && preferences.storageDir) { await backend('autoUnlock', { storageDir: preferences.storageDir, cacheDir: preferences.cacheDir, driveLetter: preferences.driveLetter, transport: preferences.transport, remoteRepository: preferences.remoteRepository }); await backend('setHistoryRetention', { days: preferences.historyRetentionDays }); await backend('mount', { driveLetter: preferences.driveLetter }); } }); } catch (error) { state.driver.checking = false; state.sync.error = error.message; publish(); }
    } else { state.driver.checking = false; state.driver.error = 'Windows and WinFsp are required to mount a drive.'; publish(); }
    if (!verificationMode && !testMode) {
      try { await registrySync.initialize(); }
      catch { sessionSettingsError = 'Registry schedule settings could not be read safely. The original configuration was retained for recovery.'; publish(); }
      if (!process.argv.includes('--registry-sync')) void runRegistryDue().catch(() => {});
      registryTimer = setInterval(() => { void runRegistryDue().catch(() => {}); }, 30000); registryTimer.unref();
      if (process.argv.includes('--registry-sync')) {
        try { await runRegistryDue(); } finally { if (!registrySync.pending && vaultSessions.safelyLocked) await quit(); }
      }
    }
    await handleExplorerCopy(process.argv);
  }).catch(handleStartupFailure);
  app.on('before-quit', event => {
    if (shuttingDown || testMode) return;
    event.preventDefault();
    // During session end there is no time for the interactive quit flow: finish
    // the bounded lock, then leave.
    if (sessionEnd?.ending) void sessionEnd.end().finally(() => { shuttingDown = true; helper?.dispose(); setImmediate(() => app.quit()); });
    else void quit();
  });
  app.on('window-all-closed', async () => { if (testMode) {await closeBrowserHandoff();verificationStartup?.restore(); shuttingDown = true; helper?.dispose(); app.quit(); } });
}
