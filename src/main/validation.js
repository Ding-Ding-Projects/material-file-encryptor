const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function validateFeatureRequest(feature, action, payload, { browser = false } = {}) {
  const actions = {
    converter: ['catalog','inspect','enqueue','list','control','pickSources','pickDestination','pickDestinationDirectory'],
    workflow: ['documents','pickDocument','pickProject','readDocument','saveDocument','createDocument','templates','editors','pickEditor','openEditor','openInCode','editorDownload','downloads','prepareDownload','startDownload','cancelDownload','accounts','owners','prepareHandoff','exportHandoff','openHandoff'],
    updates: ['status','check','download',...(!browser?['install']:[])],
    ollama: ['status','catalog','refreshCatalog','models','show','deleteModel','copyModel','generate','hardware','cart','addToCart','removeFromCart','retryPull','startPulls','cancel','sessions','session','renameSession','deleteSession','exportSession','chat','profiles','preflight','launch','snapshots','restore','events','runtimeInstall','runtimeStart','chooseRuntimeExecutable','registerProfile'],
    documentation: ['catalog','changelog'], status: ['status'],
    personalization: ['sharedRead','sharedWrite','verifySharedCredential','setSharedCredential','fetchScheduleSource','listFonts',...(!browser?['setScheduleCredential','clearScheduleCredential']:[])],
    ...(!browser ? { access: ['credentialGet','credentialSet','credentialDelete','credentialList','openDataFolder','dataFolder'] } : {}),
  };
  if (!actions[feature]?.includes(action) || !object(payload) || Buffer.byteLength(JSON.stringify(payload)) > 262144) throw new Error('Unsupported feature request.');
  return { feature, action, payload };
}
export function validateRequest(method, value = {}) {
  if (!object(value)) throw new Error('Invalid request.');
  if (method === 'featureRequest') {
    if (Object.keys(value).length !== 3) throw new Error('Unsupported feature request.');
    return validateFeatureRequest(value.feature, value.action, value.payload, { browser: true });
  }
  const schemas = {
    getState: {}, buildMetadata: {}, browserPairing: {}, mount: { driveLetter: 'drive?' }, unmount: {}, chooseFiles: {}, chooseExport: { name: 'path' }, importSelected: { paths: 'paths' }, startImport: { paths: 'paths' }, operations: {}, cancelOperation: { operationId: 'path' }, forceLock: {}, quit: {}, listFiles: { cursor: 'nonnegative?', limit: 'page?', revision: 'nonnegative?' }, listVersionLabels: { entryId: 'path' }, listActivity: { entryId: 'path?', cursor: 'path?', limit: 'page?', action: 'short?', from: 'short?', to: 'short?', fromUtc:'short?',toUtc:'short?',pattern:'short?' }, previewVersion: { versionId: 'path' }, labelVersion: { versionId: 'path', label: 'short' }, exportVersion: { versionId: 'path' }, exportText: { name: 'filename', mime: 'mime', content: 'text' }, fileAction: { id: 'path', action: 'fileAction', destination: 'path?' }, resplitAll: {}, createVault: { storageDir: 'path', cacheDir: 'path', driveLetter: 'drive', password: 'password?', keyFilePath: 'path?', partSizeBytes: 'size', transport: 'transport?', remoteRepository: 'repository?', autoUnlock: 'boolean?' },
    unlockVault: { storageDir: 'path', cacheDir: 'path', driveLetter: 'drive', password: 'password?', keyFilePath: 'path?', transport: 'transport?', remoteRepository: 'repository?', autoUnlock: 'boolean?' },
    lockVault: {}, selectFolder: { kind: 'kind' }, selectKeyFile: {}, createKeyFile: { storageDir: 'path?', cacheDir: 'path?' },
    importFiles: {}, openExplorer: {}, openFile: { path: 'relative' }, exportFile: { path: 'relative' },
    keepOffline: { path: 'relative' }, releaseOffline: { path: 'relative' }, setPartSize: { partSizeBytes: 'size' },
    resplit: { path: 'relative', partSizeBytes: 'size?' }, sync: {}, listVersions: { entryId: 'path?', retentionDays: 'days?' }, saveVersion: { path: 'relative?' }, restoreVersion: { versionId: 'path' }, listDeleted: {}, restoreDeleted: { ids: 'ids' }, emptyRecycleBin: {}, setPreferences: { historyRetentionDays: 'days?', startup: 'boolean?', autoUnlock: 'boolean?', driveLetter: 'drive?', performanceMode: 'performance?' },
    windowControl: { action: 'window' }, openExternal: { url: 'url' }, installDriver: {}, importVocabulary: {},
  };
  schemas.upgradeVault = schemas.createVault;
  if (typeof method !== 'string' || !Object.hasOwn(schemas, method)) throw new Error('Unsupported request.');
  const schema = schemas[method];
  if (!schema || Object.keys(value).some(key => !Object.hasOwn(schema, key))) throw new Error('Unsupported request.');
  for (const [key, specification] of Object.entries(schema)) {
    const optional = specification.endsWith('?'); const type = specification.replace('?', ''); const item = value[key];
    if ((item === undefined || item === null) && optional) continue;
    let valid = false;
    if (type === 'days') valid = item === null || Number.isSafeInteger(item) && item >= 1 && item <= 36500;
    else if (type === 'nonnegative') valid = Number.isSafeInteger(item) && item >= 0;
    else if (type === 'page') valid = Number.isSafeInteger(item) && item >= 1 && item <= 1000;
    else if (type === 'short') valid = typeof item === 'string' && [...item].length <= 256 && !item.includes('\0');
    else if (type === 'filename') valid = typeof item === 'string' && /^[^\\/:*?"<>|\x00-\x1f]{1,160}$/.test(item) && item !== '.' && item !== '..';
    else if (type === 'mime') valid = ['application/json','text/plain','text/markdown','text/csv','text/html'].includes(item);
    else if (type === 'text') valid = typeof item === 'string' && Buffer.byteLength(item, 'utf8') <= 8 * 1024 * 1024;
    else if (type === 'transport') valid = ['folder','privateGit'].includes(item);
    else if (type === 'repository') valid = typeof item === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(item) && !item.endsWith('/.') && !item.endsWith('/..');
    else if (type === 'ids') valid = Array.isArray(item) && item.length > 0 && item.length <= 1000 && new Set(item).size === item.length && item.every(id => typeof id === 'string' && id.length > 0 && id.length <= 32767 && !id.includes('\0'));
    else if (type === 'paths') valid = Array.isArray(item) && item.length <= 1000 && item.every(file => typeof file === 'string' && file.length > 0 && file.length < 32768 && !file.includes('\0'));
    else if (type === 'fileAction') valid = ['open', 'export', 'keepOffline', 'releaseOffline'].includes(item);
    else if (type === 'boolean') valid = typeof item === 'boolean';
    else if (type === 'performance') valid = ['responsive','throughput'].includes(item);
    else if (type === 'size') valid = Number.isSafeInteger(item) && item >= 1024 && item <= 90000000;
    else if (type === 'drive') valid = typeof item === 'string' && /^[D-Z]:?$/i.test(item);
    else if (type === 'kind') valid = ['storage', 'cache'].includes(item);
    else if (type === 'window') valid = ['minimize', 'maximize', 'close'].includes(item);
    else if (type === 'url') valid = ['https://github.com/Ding-Ding-Projects/material-file-encryptor', 'https://winfsp.dev/', 'https://ding-ding-projects.github.io/material-file-encryptor/'].includes(item);
    else if (typeof item === 'string' && !item.includes('\0')) {
      if (type === 'password') valid = item.length > 0 && item.length <= 4096;
      if (type === 'path') valid = item.length > 0 && item.length <= 32767;
      if (type === 'relative') valid = item.length > 0 && item.length <= 32767 && !/^[\\/]|:/.test(item) && item.split(/[\\/]/).every(part => part && part !== '.' && part !== '..');
    }
    if (!valid) throw new Error(`Invalid ${key}.`);
  }
  if (['createVault', 'unlockVault', 'upgradeVault'].includes(method) && Boolean(value.password) === Boolean(value.keyFilePath)) throw new Error('Choose either a password or a key file.');
  if (['createVault','unlockVault','upgradeVault'].includes(method) && value.transport === 'privateGit' && !value.remoteRepository) throw new Error('Enter the private repository as owner/repository.');
  return value.driveLetter === undefined ? value : { ...value, driveLetter: value.driveLetter[0].toUpperCase() + ':' };
}
export function trustedFrame(event, window, rendererURL) {
  return Boolean(window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === rendererURL);
}
