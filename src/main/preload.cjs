const { contextBridge, ipcRenderer } = require('electron');
const invoke = (method, params = {}) => ipcRenderer.invoke('vault:request', method, params);
const api = {
  status: () => invoke('getState'), mount: (options = {}) => invoke('mount', options), unmount: () => invoke('unmount'),
  upgrade: options => invoke('upgradeVault', options),
  create: options => invoke('createVault', options), unlock: options => invoke('unlockVault', options), lock: () => invoke('lockVault'),
  chooseFolder: (kind = 'storage') => invoke('selectFolder', { kind }), chooseFiles: () => invoke('chooseFiles'),
  chooseExport: name => invoke('chooseExport', { name }), chooseKeyFile: () => invoke('selectKeyFile'),
  generateKeyFile: (options = {}) => invoke('createKeyFile', Object.fromEntries(Object.entries(options).filter(([, value]) => value !== ''))),
  importFiles: paths => invoke('importSelected', { paths }),
  open: id => invoke('fileAction', { id, action: 'open' }), openExplorer: () => invoke('openExplorer'),
  exportFile: ({ id, destination }) => invoke('fileAction', { id, action: 'export', destination }),
  keepOffline: id => invoke('fileAction', { id, action: 'keepOffline' }), releaseOffline: id => invoke('fileAction', { id, action: 'releaseOffline' }),
  history: (options = {}) => invoke('listVersions', options), saveVersion: path => invoke('saveVersion', path === undefined ? {} : { path }),
  restoreVersion: id => invoke('restoreVersion', { versionId: id }), recycled: () => invoke('listDeleted'),
  restoreDeleted: ids => invoke('restoreDeleted', { ids }), emptyRecycleBin: () => invoke('emptyRecycleBin'),
  setHistoryRetention: historyRetentionDays => invoke('setPreferences', { historyRetentionDays }),
  sync: () => invoke('sync'), setPartSize: partSizeBytes => invoke('setPartSize', { partSizeBytes }), resplit: () => invoke('resplitAll'),
  setStartup: startup => invoke('setPreferences', { startup }), setAutoUnlock: autoUnlock => invoke('setPreferences', { autoUnlock }),
  forgetSavedCredential: () => invoke('setPreferences', { autoUnlock: false }),
  windowControl: action => invoke('windowControl', { action }), openExternal: url => invoke('openExternal', { url }),
  installDriver: () => invoke('installDriver'), importVocabulary: () => invoke('importVocabulary'),
  onStatus: callback => {
    if (typeof callback !== 'function') throw new TypeError('A callback is required.');
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('vault:state', listener);
    return () => ipcRenderer.removeListener('vault:state', listener);
  },
};
contextBridge.exposeInMainWorld('drive', Object.freeze(api));
