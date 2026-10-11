import squirrelStartup from 'electron-squirrel-startup';
import { app, autoUpdater, BrowserWindow, dialog, ipcMain, Menu, nativeImage, safeStorage, shell, Tray } from 'electron';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NativeClient } from './native-client.js';
import { validateRequest, validateFeatureRequest, trustedFrame } from './validation.js';
import { parseVocabulary, MAX_VOCABULARY_BYTES } from '../shared/personal-vocabulary.js';
import { createFeatureServices } from './feature-services.js';
import { createLocalAdapter } from './local-adapter.js';
import { explorerCopyPath, registerExplorerCommand } from './explorer-command.js';
import { createUpdateService } from './update-service.js';

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
function startupReadbackOptions(executable) {
  // The pinned Windows runtime parses the lookup path as a command line.
  // Quote only the getter input so spaces remain part of the executable path.
  const bare = executable.startsWith('"') && executable.endsWith('"') ? executable.slice(1, -1) : executable;
  return { path: '"' + bare + '"', args: ['--startup'] };
}
function createVerificationStartup(loginApp, executable, name) {
  const options = { path: executable, args: ['--startup'] };
  const find = () => (loginApp.getLoginItemSettings(startupReadbackOptions(executable)).launchItems || []).find(item => item.name === name);
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
  const settings = app.getLoginItemSettings(startupReadbackOptions(process.execPath));
  return { enabled: settings.openAtLogin, verificationOnly: false, restored: false };
}
const configPath = () => path.join(app.getPath('userData'), 'preferences.json');
const sessionMarkerPath = () => path.join(app.getPath('userData'), 'session-open.json');
const selectedImports = new Set();
const selectedExports = new Set();
let window, tray, helper, features, localAdapter, updates, shuttingDown = false, operation = null, quitPending = false, updateInstallLease = false, updateLanguage = 'en', interruptedSession = false;
let cachedStartupRegistration = { enabled: false, verificationOnly: false, restored: false };
const buildMetadata = { version: app.getVersion(), builtAt: null };
let preferences = { startup: true, autoUnlock: false, driveLetter: 'M:', transport: 'folder', historyRetentionDays: null, performanceMode: 'responsive' };
let state = { locked: true, mounted: false, files: [], availableDriveLetters: [], sync: { running: false, lastSync: null, error: null }, driver: { available: false, checking: true, error: 'Checking WinFsp availability.' } };
const inside = (parent, child) => { const rel = path.relative(parent, child); return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)); };
const nativeState = value => ({ ...value, driver: { ...value.driver, checking: false } });
const snapshot = () => ({ ...state, operation, build: buildMetadata, startupRegistration: cachedStartupRegistration, defaults: { cacheDir: preferences.cacheDir || path.join(app.getPath('userData'), 'EncryptedCache'), driveLetter: preferences.driveLetter }, preferences: { ...preferences }, cacheDir: state.cacheDir || preferences.cacheDir || path.join(app.getPath('userData'), 'EncryptedCache') });
function publish() { updateTray(); if (window && !window.isDestroyed()) window.webContents.send('vault:state', snapshot()); }
async function savePreferences() { await fs.mkdir(app.getPath('userData'), { recursive: true }); await fs.writeFile(configPath(), JSON.stringify(preferences), { mode: 0o600 }); }
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
  if (method === 'featureRequest') return featureRequest(params.feature,params.action,params.payload);
  if (updateInstallLease && !['getState','buildMetadata','operations','windowControl'].includes(method)) throw new Error('The application is preparing an update. Wait for it to finish.');
  if (method === 'getState') return snapshot();
  if (method === 'buildMetadata') return buildMetadata;
  if (method === 'browserPairing') { if(state.locked||state.lockVerified===false)throw Error('Unlock the drive before pairing the browser.');await localAdapter.start();return{address:localAdapter.address,...localAdapter.pairingCode()}; }
  if (method === 'quit') return quit();
  if (['listVersions', 'listVersionLabels', 'listDeleted', 'listFiles', 'listActivity', 'previewVersion', 'labelVersion', 'operations', 'cancelOperation'].includes(method)) {
    if (!helper) throw new Error('Unlock a Windows vault to browse its history.');
    return helper.request(method, params);
  }
  if (method === 'forceLock') {
    const answer = await dialog.showMessageBox(window, {type:'warning',buttons:['Keep running','Force Lock'],defaultId:0,cancelId:0,title:'Force Lock',message:'Disconnect idle open files and lock this drive?',detail:'Save and close open files first. Encryption, decryption, queued work and pending content prevent Force Lock. Forced disconnection invalidates open handles and mapped views. Changes still buffered by another application may be lost, and later access may report an error or terminate that application. Other applications may retain plaintext they already read.'});
    if (answer.response !== 1) return {cancelled:true};
    const result = await helper.request('forceLock');
    if (result.locked) { state = nativeState(await helper.request('statusSummary')); publish(); }
    else if (result.busy) throw new Error('Force Lock could not start because encryption, decryption or pending content is active. Try again after the operation finishes.');
    else throw new Error('Force Lock did not confirm that the drive was detached and locked.');
    return result;
  }
  if (method === 'exportText') {
    const picked=await dialog.showSaveDialog(window,{title:'Export original records',defaultPath:params.name});
    if(picked.canceled)return null;
    const target=await safeDestination(picked.filePath,[state.storageDir,state.cacheDir,state.mounted?mountedPath():null]);
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
  if (method === 'chooseExport') { const picked = await dialog.showSaveDialog(window, { title: 'Export a readable copy', defaultPath: path.win32.basename(params.name) }); if (picked.canceled) return null; selectedExports.add(picked.filePath); return picked.filePath; }
  if (method === 'importSelected' || method === 'startImport') { if (quitPending) throw new Error('The application is waiting to quit.'); if (params.paths.some(filename => !selectedImports.has(filename))) throw new Error('Choose files using the file picker.'); for (const filename of params.paths) selectedImports.delete(filename); return helper.request('startImport', { paths: params.paths }); }
  if (method === 'fileAction') { const entry = await helper.request('getFile',{entryId:params.id}); if (!entry) throw new Error('Select a current file.'); if (params.action === 'open') return openPath(mountedPath(entry.path)); if (params.action === 'export') { if (!selectedExports.delete(params.destination)) throw new Error('Choose an export destination using the file picker.'); const target = await safeDestination(params.destination, [state.storageDir, state.cacheDir, mountedPath()]); if (quitPending || shuttingDown) throw new Error('The application is waiting to quit.'); return helper.request('startExport', {path:entry.path,destination:target}); } return perform(params.action, () => backend(params.action, { path: entry.path })); }
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
      if (params.autoUnlock && state.locked) throw new Error('Unlock the drive before enabling automatic unlock.');
      await backend(params.autoUnlock ? 'setAutoUnlock' : 'forgetSavedCredential', params.autoUnlock ? { enabled: true } : { storageDir: preferences.storageDir, cacheDir: preferences.cacheDir });
    }
    if (params.historyRetentionDays !== undefined && !state.locked) await backend('setHistoryRetention', { days: params.historyRetentionDays });
    Object.assign(preferences, params); await savePreferences();
    applyStartup(preferences.startup);
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
 if(state.locked){await dialog.showMessageBox(window,{type:'info',title:'Unlock the encrypted drive',message:'Unlock the drive, then choose Copy to encrypted drive again.'});return;}
 try{if(!(await fs.stat(source)).isFile())throw Error('Choose a regular file.');const result=await dialog.showMessageBox(window,{type:'question',buttons:['Cancel','Copy file'],defaultId:0,cancelId:0,title:'Copy to encrypted drive',message:'Import the selected file into encrypted storage?',detail:'The copy uses encrypted staging. Cancel from the workspace or tray to discard the unfinished file.'});if(result.response===1&&!quitPending&&!shuttingDown)await helper.request('startImport',{paths:[source]});}catch(error){await dialog.showMessageBox(window,{type:'error',title:'File could not be imported',message:error.message});}
}
const activeTransfers = () => (state.operations || []).filter(item => ['queued','running','cancelling'].includes(item.state));
async function hasActiveWork() {
  const active=helper?await helper.request('operations'):[];
  return Boolean(operation || await features?.pending() || active.some(item=>['queued','running','cancelling'].includes(item.state)));
}
async function updateStatus() {
  const snapshot=updates?.status()||{state:'unavailable',reason:'NOT_INITIALIZED'};
  const activeWork=await hasActiveWork();
  return {...snapshot,activeWork,desktopAvailable:process.platform==='win32'&&app.isPackaged,canInstall:snapshot.state==='ready'&&!activeWork&&!updateInstallLease};
}
async function featureRequest(feature,action,payload) {
  if(feature!=='updates')return features.request(feature,action,payload);
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
  updateInstallLease=true;quitPending=true;features.beginExit();
  const release=()=>{updateInstallLease=false;if(!shuttingDown){quitPending=false;features.endExit();}};
  try {
    if(await hasActiveWork())throw new Error('Active work prevents update installation.');
    if(helper&&!state.locked)await backend('lock');
    if(!state.locked||state.lockVerified===false)throw new Error('The drive must confirm that it is locked before updating.');
    return release;
  } catch(error) {release();throw error;}
}
async function prepareUpdateRestart() {
  if(!updateInstallLease||!state.locked||state.lockVerified===false||await hasActiveWork())throw new Error('The application is not ready to restart safely.');
  await localAdapter?.close();await features?.close();verificationStartup?.restore();
  await fs.rm(sessionMarkerPath(),{force:true});helper?.dispose();shuttingDown=true;
}
function updateTray() {
  if (!tray) return;
  const active = activeTransfers();
  tray.setToolTip(active.length ? `Material File Encryptor: ${active.length} active transfer(s)` : 'Material File Encryptor');
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'Reopen Material File Encryptor',click:showWindow},
    ...active.map(item=>({label:`${item.state}: ${item.completedFiles}/${item.totalFiles} files`,enabled:false})),
    ...(active.length?[{label:'Cancel unfinished transfers',click:()=>Promise.all(active.map(item=>helper.request('cancelOperation',{operationId:item.operationId}))).catch(()=>showWindow())}]:[]),
    {label:'Lock drive',click:()=>request('lockVault',{}).catch(()=>showWindow())},
    {type:'separator'},{label:'Quit',click:()=>void quit()}
  ]));
}
async function quit() {
  if (quitPending || shuttingDown) return;
  quitPending=true;
  try {
    let active=helper?await helper.request('operations'):[];
    if (operation || await features.pending() || active.some(item=>['queued','running','cancelling'].includes(item.state))) {
      const answer=await dialog.showMessageBox(window,{type:'question',buttons:['Keep running','Finish then quit','Cancel unfinished work then quit'],defaultId:0,cancelId:0,title:'Transfers are still active',message:'What should happen to unfinished work?',detail:'Completed files remain available. The application exits only after pending work settles and the drive locks successfully.'});
      if(answer.response===0)return;
      features.beginExit();
      if(answer.response===2)await Promise.all(active.filter(item=>['queued','running','cancelling'].includes(item.state)).map(item=>helper.request('cancelOperation',{operationId:item.operationId})));
      if(answer.response===2)await features.cancelAll();
      while(operation || await features.pending() || active.some(item=>['queued','running','cancelling'].includes(item.state))) { await new Promise(resolve=>setTimeout(resolve,200));active=helper?await helper.request('operations'):[]; }
    }
    features.beginExit();
    if (helper && !state.locked) await perform('unmounting', () => backend('lock'));
    if (!state.locked) throw new Error('The drive has not confirmed that it is locked.');
    await updates?.dispose();await localAdapter?.close();await features?.close(); verificationStartup?.restore();await fs.rm(sessionMarkerPath(),{force:true});shuttingDown = true; helper?.dispose(); setImmediate(() => app.quit());
  } catch (error) { showWindow(); await dialog.showMessageBox(window, { type: 'error', title: 'Application is still running', message: error.message }); }
  finally {quitPending=false;if(!shuttingDown)features.endExit();}
}
if (process.platform === 'win32' && process.argv.includes('--squirrel-uninstall')) {
  app.setLoginItemSettings({ openAtLogin: false, path: process.execPath, args: ['--startup'] });
  registerExplorerCommand(process.execPath,{remove:true});
}
if(process.platform==='win32'&&process.argv.some(arg=>['--squirrel-install','--squirrel-updated'].includes(arg)))registerExplorerCommand(process.execPath);
if (squirrelStartup || !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event,args) => {if(window){showWindow();void handleExplorerCopy(args);}});
  app.whenReady().then(async () => {
    interruptedSession=await fs.access(sessionMarkerPath()).then(()=>true,()=>false);
    await fs.mkdir(app.getPath('userData'),{recursive:true});
    await fs.writeFile(sessionMarkerPath(),JSON.stringify({schemaVersion:1,startedAt:new Date().toISOString()}),{mode:0o600});
    if (verificationMode && process.platform === 'win32') verificationStartup = createVerificationStartup(app, process.execPath, 'MaterialFileEncryptorVerification-' + randomBytes(16).toString('hex'));
    try {
      const saved = JSON.parse(await fs.readFile(configPath(), 'utf8'));
      for (const key of ['startup', 'autoUnlock']) if (typeof saved[key] === 'boolean') preferences[key] = saved[key];
      for (const key of ['storageDir', 'cacheDir', 'driveLetter', 'remoteRepository']) if (typeof saved[key] === 'string') preferences[key] = saved[key];
      if (['folder', 'privateGit'].includes(saved.transport)) preferences.transport = saved.transport;
      if (['responsive', 'throughput'].includes(saved.performanceMode)) preferences.performanceMode = saved.performanceMode;
      if (saved.historyRetentionDays === null || (Number.isInteger(saved.historyRetentionDays) && saved.historyRetentionDays >= 1 && saved.historyRetentionDays <= 36500)) preferences.historyRetentionDays = saved.historyRetentionDays;
    } catch { /* First launch or invalid settings uses defaults. */ }
    applyStartup(preferences.startup);
    cachedStartupRegistration=startupRegistration();
    try { Object.assign(buildMetadata, JSON.parse(await fs.readFile(path.resolve(directory,'../shared/build-metadata.json'),'utf8'))); } catch { /* Development builds have no invented build date. */ }
    features=createFeatureServices({dataDirectory:app.getPath('userData'),applicationRoot:path.resolve(directory,'../..'),sandboxDirectory:app.isPackaged?path.join(process.resourcesPath,'converter'):path.resolve('out/converter'),safeStorage,dialog,getWindow:()=>window,openPath,openExternal:url=>shell.openExternal(url),emit:(feature,data)=>window?.webContents.send('feature:event',feature,data)});
    updates=createUpdateService({app,autoUpdater,dialog,isActiveWork:hasActiveWork,acquireInstallLease:acquireUpdateLease,prepareRestart:prepareUpdateRestart,getLanguage:()=>updateLanguage});
    updates.on('status',()=>{void updateStatus().then(snapshot=>window?.webContents.send('feature:event','updates',{snapshot})).catch(()=>{});});
    localAdapter=createLocalAdapter({isAuthenticated:()=>!state.locked&&state.lockVerified!==false,authorizePair:async({origin})=>(await dialog.showMessageBox(window,{type:'question',buttons:['Reject','Pair browser'],defaultId:0,cancelId:0,title:'Pair browser tools',message:'Allow this browser to use local tools?',detail:origin+' will be able to operate approved workflows until the drive locks or the session expires.'})).response===1,dispatch:request});
    window = new BrowserWindow({ width: 1180, height: 850, minWidth: 880, minHeight: 650, frame: false, show: false, backgroundColor: '#f7f9f8', webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    let rendererRecoveries=0;
    window.webContents.on('render-process-gone',()=>{if(!shuttingDown&&rendererRecoveries++<3)void window.loadFile(rendererPath);});
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    ipcMain.handle('vault:request', async (event, method, params) => { if (!trustedFrame(event, window, rendererURL)) throw new Error('Untrusted request source.'); return request(method, params); });
    ipcMain.handle('feature:request', async (event, feature, action, params) => { if (!trustedFrame(event, window, rendererURL)) throw new Error('Untrusted request source.'); const request = validateFeatureRequest(feature, action, params); return featureRequest(request.feature, request.action, request.payload); });
    ipcMain.handle('vault:verification-quit', async event => {
      if (!verificationMode || !verificationStartup || !trustedFrame(event, window, rendererURL)) throw new Error('Verification quit is unavailable.');
      const active=helper?await helper.request('operations'):[];
      if (operation || await features.pending() || active.some(item=>['queued','running','cancelling'].includes(item.state))) throw new Error('Wait for the current work to finish.');
      if (helper && !state.locked) await perform('unmounting', () => backend('lock'));
      const proof = verificationStartup.restore();
      if (!state.locked) throw new Error('The drive has not confirmed that it is locked.');
      await updates?.dispose();await localAdapter?.close();await features.close();await fs.rm(sessionMarkerPath(),{force:true});shuttingDown = true; helper?.dispose();
      setTimeout(() => app.quit(), 250);
      return proof;
    });
    window.on('close', event => { if (!shuttingDown && !testMode) { event.preventDefault(); window.hide(); } });
    const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIElEQVQ4T2NkqLj/n4ECwESJ5lEDRg0YNWDUgFEDBg0AAEZ7JPE/MhwBAAAAAElFTkSuQmCC');
    tray = new Tray(icon); updateTray(); tray.on('double-click', showWindow);
    await window.loadFile(rendererPath);
    if (!process.argv.includes('--startup') || testMode) showWindow();
    if (process.platform === 'win32') {
      const executable = app.isPackaged ? path.join(process.resourcesPath, 'native/MaterialFileEncryptor.Host.exe') : path.resolve('out/native/MaterialFileEncryptor.Host.exe');
      helper = new NativeClient(executable); helper.on('slow', warning => { state = { ...state, sync: { ...state.sync, error: warning.message } }; publish(); }); helper.on('status', result => { if (result && typeof result.locked === 'boolean') { state = nativeState(result); publish(); } }); helper.on('exit', () => { state = { ...state, mounted: false, lockVerified:false, files: [], sync: { ...state.sync, error: 'The native helper stopped. Drive teardown is unverified. Reopen the application for locked recovery.' } }; publish(); });
      try { await backend('statusSummary'); await backend('setPerformanceMode', { mode: preferences.performanceMode }); if(interruptedSession){state.recoveryRequired=true;state.sync.error='An interrupted session was detected. Recovery starts locked; unlock explicitly to review encrypted records.';publish();} if (!interruptedSession && preferences.autoUnlock && preferences.storageDir) { await backend('autoUnlock', { storageDir: preferences.storageDir, cacheDir: preferences.cacheDir, driveLetter: preferences.driveLetter, transport: preferences.transport, remoteRepository: preferences.remoteRepository }); await backend('setHistoryRetention', { days: preferences.historyRetentionDays }); await backend('mount', { driveLetter: preferences.driveLetter }); } } catch (error) { state.driver.checking = false; state.sync.error = error.message; publish(); }
    } else { state.driver.checking = false; state.driver.error = 'Windows and WinFsp are required to mount a drive.'; publish(); }
    await handleExplorerCopy(process.argv);
  }).catch(() => { app.exit(1); });
  app.on('before-quit', event => { if (!shuttingDown && !testMode) { event.preventDefault(); void quit(); } });
  app.on('window-all-closed', () => { if (testMode) { verificationStartup?.restore(); shuttingDown = true; helper?.dispose(); app.quit(); } });
}
