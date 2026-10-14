const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('profileAuthentication',Object.freeze({
 view:()=>ipcRenderer.invoke('profile-authentication:view'),
 submit:(nonce,password)=>ipcRenderer.invoke('profile-authentication:submit',{nonce,password}),
 cancel:nonce=>ipcRenderer.send('profile-authentication:cancel',nonce),
 onClear:callback=>{if(typeof callback==='function')ipcRenderer.on('profile-authentication:clear',()=>callback());},
}));
