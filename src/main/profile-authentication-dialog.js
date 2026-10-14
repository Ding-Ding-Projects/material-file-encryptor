import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

/** Credential input stays in one main-owned child. Only its exact main frame and
 * nonce can submit. The browser and application renderer cannot answer it. */
export function createProfileAuthenticationDialog({BrowserWindow,ipcMain,directory,getWindow,getLanguage=async()=> 'en',getTheme=async()=> 'system'}={}){
 const pending=new Map(),page=path.join(directory,'profile-authentication-view.html'),url=pathToFileURL(page).href;
 const exact=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
 const trusted=event=>{const entry=pending.get(event.sender?.id);return entry&&event.sender===entry.window.webContents&&event.senderFrame===entry.window.webContents.mainFrame&&event.senderFrame?.url===url&&!entry.window.isDestroyed()?entry:null;};
 ipcMain.handle('profile-authentication:view',event=>{const entry=trusted(event);if(!entry)throw Error('Authentication view unavailable.');return {...entry.view,nonce:entry.nonce};});
 ipcMain.handle('profile-authentication:submit',async(event,payload)=>{
  const entry=trusted(event);if(!entry||!exact(payload,['nonce','password'])||payload.nonce!==entry.nonce||typeof payload.password!=='string'||payload.password.length<1||payload.password.length>4096||entry.busy)return {state:'unavailable'};
  let password=payload.password;payload.password='';entry.busy=true;
  try{entry.check();const result=await entry.verify(password,{signal:entry.controller.signal});password='';entry.check();
   if(result?.ok===true&&result.proof){entry.finish(null,result.proof);return {state:'accepted'};}
   if(result?.ok!==false||!Number.isSafeInteger(result.until)||result.until<0)throw Error('Invalid authentication result.');
   return {state:'not-verified',until:result.until};
  }catch{entry.finish(Error('Native profile authentication cancelled.'));return {state:'unavailable'};}
  finally{password='';entry.busy=false;}
 });
 ipcMain.on('profile-authentication:cancel',(event,nonce)=>{const entry=trusted(event);if(entry&&nonce===entry.nonce)entry.finish(Error('Native profile authentication cancelled.'));});
 function cancelAll(){for(const entry of [...pending.values()])entry.finish(Error('Native profile authentication cancelled.'));}
 async function authenticate({origin,signal,status,verify,check=()=>{}}){
  if(pending.size||signal?.aborted||typeof verify!=='function')throw Error('Native profile authentication unavailable.');check();
  const parent=getWindow();if(!parent||parent.isDestroyed())throw Error('Native profile owner unavailable.');
  let timer;const presentation=await Promise.race([Promise.all([getLanguage(),getTheme()]).catch(()=>['en','system']),new Promise(resolve=>{timer=setTimeout(()=>resolve(['en','system']),1000);})]).finally(()=>clearTimeout(timer));check();if(signal?.aborted||pending.size)throw Error('Native profile authentication cancelled.');
  const language=['en','yue','bilingual'].includes(presentation[0])?presentation[0]:'en',theme=['light','dark'].includes(presentation[1])?presentation[1]:'system';
  const child=new BrowserWindow({parent,modal:true,width:580,height:490,minWidth:420,minHeight:420,resizable:true,minimizable:false,maximizable:false,fullscreenable:false,show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(directory,'profile-authentication-preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});
  child.webContents.setWindowOpenHandler(()=>({action:'deny'}));child.webContents.session.setPermissionRequestHandler((_contents,_permission,reply)=>reply(false));
  return new Promise((resolve,reject)=>{
   const controller=new AbortController(),nonce=randomUUID();let settled=false;
   const abort=()=>entry.finish(Error('Native profile authentication cancelled.'));
   const entry={window:child,nonce,controller,busy:false,verify,view:{origin,language,theme,configured:status.configured===true,until:Number.isSafeInteger(status.until)?status.until:0},
    check(){if(settled||controller.signal.aborted||signal?.aborted||child.isDestroyed()||parent.isDestroyed())throw Error('Native profile authentication cancelled.');check();},
    finish(error,proof){if(settled)return;settled=true;pending.delete(child.webContents.id);signal?.removeEventListener('abort',abort);parent.removeListener('closed',abort);if(error)controller.abort();try{if(!child.isDestroyed()){try{child.webContents.send('profile-authentication:clear');}finally{child.destroy();}}}finally{if(error)reject(error);else resolve(proof);}},
   };
   pending.set(child.webContents.id,entry);signal?.addEventListener('abort',abort,{once:true});parent.once('closed',abort);
   child.once('closed',abort);child.webContents.on('render-process-gone',abort);child.webContents.on('will-navigate',event=>{event.preventDefault();abort();});child.webContents.on('will-attach-webview',event=>event.preventDefault());
   child.once('ready-to-show',()=>{try{entry.check();child.show();}catch{abort();}});child.loadFile(page).catch(abort);if(signal?.aborted)abort();
  });
 }
 return {authenticate,cancelAll,get pending(){return pending.size;}};
}
