import {mountPersonalization} from '../../src/renderer/features/personalization/index.js';
import {createSettingsStore,DEFAULTS} from '../../src/shared/local-ux/store.js';
import {validateRule} from '../../src/shared/local-ux/schedules.js';
import {createPrivateHistory} from '../../src/shared/local-ux/history.js';
import {createTranslator} from '../../src/shared/local-ux/language.js';

export const VISITOR_PREFIX='material-file-encryptor.visitor.';
export const VISITOR_COPY={
 'Website preferences':'網站偏好設定',
 'Search website settings':'搜尋網站設定',
 'Browser storage is unavailable. Changes apply to this page only and will be lost after reload.':'瀏覽器儲存無法使用。修改只會套用至本頁，重新載入後便會失去。',
 'The settings search component is unavailable. All settings remain visible.':'設定搜尋元件無法使用。所有設定仍然顯示。',
 'External settings are unavailable on this static website. Choose Local; no provider request or credential was sent.':'此靜態網站無法使用外部設定。請選擇本機；沒有發送來源請求或憑證。',
 'External settings are unavailable on this static website. Use a local schedule; no provider request or credential was sent.':'此靜態網站無法使用外部設定。請使用本機排程；沒有發送來源請求或憑證。',
 'Verify the local mode credential before changing its enabled state. Imports, reset and history restore cannot remove this requirement.':'修改模式啟用狀態前，請核對本機模式憑證。匯入、重設及歷史還原都不能免除此步驟。',
 'The local mode credential could not be verified.':'未能核對本機模式憑證。',
 'Unlock the local profile before setting its mode credential.':'設定模式憑證前，請先解鎖本機設定檔。',
 'The local profile was locked before credential setup completed.':'憑證設定完成前，本機設定檔已鎖定。',
 'Unlock the local profile and history before recording settings history.':'記錄設定歷史前，請先解鎖本機設定檔及歷史。',
};

/** Fall back to this page's memory after storage becomes unavailable. Never
 * claim that a session-only update survived a reload. */
export function createVisitorStorage(storage,onUnavailable=()=>{}) {
 const memory=new Map();let persistent=!!storage,reported=false;
 const failed=()=>{persistent=false;if(!reported){reported=true;onUnavailable();}};
 return {
  get persistent(){return persistent;},
  getItem(key){const name=VISITOR_PREFIX+key;if(!persistent)return memory.get(name)??null;try{const value=storage.getItem(name);memory.set(name,value);return value;}catch{failed();return memory.get(name)??null;}},
  setItem(key,value){const name=VISITOR_PREFIX+key,text=String(value);memory.set(name,text);if(persistent)try{storage.setItem(name,text);}catch{failed();}},
  removeItem(key){const name=VISITOR_PREFIX+key;memory.set(name,null);if(persistent)try{storage.removeItem(name);}catch{failed();}},
 };
}

/** Pure controller shared by the UI and focused behavioral tests. */
export function createVisitorSettings({storage,onUnavailable,onChange=()=>{},history=()=>{},historyManager,isAuthenticated=()=>false,credentialCapabilities={},onError=()=>{}}={}) {
 const local=createVisitorStorage(storage,onUnavailable);
 let authorization=null,historyFlight=Promise.resolve();
 const record=change=>{
  history(change);
  if(isAuthenticated()&&historyManager?.unlocked)historyFlight=historyFlight.catch(()=>{}).then(()=>{
   if(!isAuthenticated()||!historyManager.unlocked)throw Error('Unlock the local profile and history before recording settings history.');
   return historyManager.append(change.action,change.after,{at:change.at});
  }).catch(error=>onError(error.message));
 };
 const store=createSettingsStore({storage:local,history:record});
 const update=store.update.bind(store);
 store.update=(patch,action)=>{
  const before=store.get(),enabled=patch.school?.enabled??before.school.enabled;
  if(enabled!==before.school.enabled){
   const allowed=authorization===enabled&&isAuthenticated();authorization=null;
   if(!allowed)throw Error('Verify the local mode credential before changing its enabled state. Imports, reset and history restore cannot remove this requirement.');
  }
  if(JSON.stringify({...before,...patch})===JSON.stringify(before))return before;
  return update(patch,action);
 };
 const authorizeModeChange=async(enabled,password)=>{
  authorization=null;
  if(!isAuthenticated()||!credentialCapabilities.verifySharedCredential||!await credentialCapabilities.verifySharedCredential(password)||!isAuthenticated())throw Error('The local mode credential could not be verified.');
  authorization=enabled===true;return true;
 };
 const setSharedCredential=async password=>{
  authorization=null;
  if(!isAuthenticated()||!credentialCapabilities.setSharedCredential)throw Error('Unlock the local profile before setting its mode credential.');
  await credentialCapabilities.setSharedCredential(password);
  if(!isAuthenticated())throw Error('The local profile was locked before credential setup completed.');
  authorization=true;
 };
 const off=store.subscribe(onChange);
 return {store,storage:local,
  authorizeModeChange,setSharedCredential,flushHistory:()=>historyFlight,
  addLocalSchedule(rule){const next=validateRule(rule);if(next.source?.type&&next.source.type!=='local')throw Error('External settings require a trusted local provider. Local schedules remain available.');store.update({schedules:[...store.get().schedules,next]},'local schedule added');return next.id;},
  destroy(){authorization=null;off();}};
}

export function mountVisitorPersonalization(container,options={}) {
 const {foundation,onChange=()=>{},historyCredentialStore,credentialCapabilities={},provenance}=options;
 const doc=container.ownerDocument,win=doc.defaultView;
 let supplied=options.storage;
 if(supplied===undefined)try{supplied=win.localStorage;}catch{supplied=null;}
 let alive=true;
 let controller;
 const translate=createTranslator(()=>controller?.store.get()||DEFAULTS,{dictionary:VISITOR_COPY});
 const notify=message=>foundation?.notify?.({title:translate('Website preferences'),message:translate(message),level:'warning'});
 const sharedHistory=options.historyManager||createPrivateHistory({storage:createVisitorStorage(supplied),credentialStore:historyCredentialStore});
 controller=createVisitorSettings({storage:supplied,onUnavailable:()=>notify('Browser storage is unavailable. Changes apply to this page only and will be lost after reload.'),history:record=>options.history?.(record),historyManager:sharedHistory,isAuthenticated:options.isAuthenticated||(()=>false),credentialCapabilities,onError:notify});
 const updateSettings=controller.store.update.bind(controller.store);
 controller.store.update=(patch,action)=>{
  if(patch.schedules&&!credentialCapabilities.fetchScheduleSource&&patch.schedules.some(rule=>rule.source?.type&&rule.source.type!=='local'))throw Error('External settings are unavailable on this static website. Choose Local; no provider request or credential was sent.');
  return updateSettings(patch,action);
 };
 const attachSearch=(input,area)=>{
  const search=doc.createElement('mfe-search');search.setAttribute('label',input.getAttribute('aria-label')||translate('Search website settings'));search.setAttribute('scope','visitor-personalization');search.language=controller.store.get().language;input.hidden=true;input.before(search);let generation=0;
  const update=async()=>{const current=++generation;const nodes=[...area.querySelectorAll('.local-ux-field')];if(typeof search.filter!=='function'){notify('The settings search component is unavailable. All settings remain visible.');return;}const rows=await search.filter(nodes.map((node,index)=>({id:String(index),text:node.textContent})));if(!alive||current!==generation||rows===null)return;const visible=new Set(rows.map(row=>row.id));nodes.forEach((node,index)=>node.hidden=!visible.has(String(index)));};
  search.addEventListener('search-change',update);
  return()=>{generation++;search.removeEventListener('search-change',update);search.remove();input.hidden=false;};
 };
 const externalUnavailable=async()=>{throw Error('External settings are unavailable on this static website. Use a local schedule; no provider request or credential was sent.');};
 const module=mountPersonalization(container,{
  storage:controller.storage,store:controller.store,surfaceRoot:doc.documentElement,attentionHost:options.attentionHost||doc.body,
  attachSearch,notify,dictionary:VISITOR_COPY,historyCredentialStore,historyManager:sharedHistory,history:options.history,
  vocabulary:{isAuthenticated:()=>false,replace:value=>value},
 verifySharedCredential:password=>controller.authorizeModeChange(false,password),
 setSharedCredential:controller.setSharedCredential,
  fetchScheduleSource:credentialCapabilities.fetchScheduleSource||externalUnavailable,
  setScheduleCredential:credentialCapabilities.setScheduleCredential,
  clearScheduleCredential:credentialCapabilities.clearScheduleCredential,
  sharedSettings:{read:async()=>controller.store.get().school,write:async()=>{}},
  confirmDestructive:options.confirmDestructive,onLock:options.onLock,
  onLogoChange:options.onLogoChange,isScreenReaderActive:options.isScreenReaderActive,
  onChange:settings=>{foundation?.setLanguage?.(settings.school.enabled?'en':settings.language);onChange(settings,{persistent:controller.storage.persistent,provenance});},
 });
 const storageChanged=event=>{if(event.key===VISITOR_PREFIX+'material-file-encryptor.local-ux.v1'&&controller.storage.persistent)controller.store.refresh();};
 win.addEventListener('storage',storageChanged);
 if(!controller.storage.persistent)notify('Browser storage is unavailable. Changes apply to this page only and will be lost after reload.');
 // The shared renderer still uses native controls in several nested editors.
 // Preserve their semantics rather than replacing them with decorative tags.
 return {store:controller.store,storage:controller.storage,apply:module.apply,
  getSettings:()=>controller.store.get(),open:module.open,narrator:module.narrator,appearance:module.appearance,history:module.history,
  addLocalSchedule:controller.addLocalSchedule,
  authorizeModeChange:controller.authorizeModeChange,flushHistory:controller.flushHistory,
  destroy(){if(!alive)return;alive=false;win.removeEventListener('storage',storageChanged);module.destroy();controller.destroy();}};
}

export {DEFAULTS};
