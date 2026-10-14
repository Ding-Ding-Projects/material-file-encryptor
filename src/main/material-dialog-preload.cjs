const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('materialDialog', Object.freeze({
  view: () => ipcRenderer.invoke('material-dialog:view'),
  respond: (nonce, index) => ipcRenderer.send('material-dialog:respond', String(nonce), Number(index)),
  resize: height => ipcRenderer.send('material-dialog:resize', Number(height)),
}));
