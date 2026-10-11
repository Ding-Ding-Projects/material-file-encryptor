import {mountPersonalization} from '../../src/renderer/features/personalization/index.js';
import {createSettingsStore,DEFAULTS} from '../../src/shared/local-ux/store.js';
import {validateRule} from '../../src/shared/local-ux/schedules.js';

export const VISITOR_PREFIX='material-file-encryptor.visitor.';

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
export function createVisitorSettings({storage,onUnavailable,onChange=()=>{},history=()=>{}}={}) {
 const local=createVisitorStorage(storage,onUnavailable);
 const store=createSettingsStore({storage:local,history});
 const off=store.subscribe(onChange);
 return {store,storage:local,
  addLocalSchedule(rule){const next=validateRule(rule);if(next.source?.type&&next.source.type!=='local')throw Error('External settings require a trusted local provider. Local schedules remain available.');store.update({schedules:[...store.get().schedules,next]},'local schedule added');return next.id;},
  destroy:off};
}

export function mountVisitorPersonalization(container,options={}) {
 const {foundation,onChange=()=>{},historyCredentialStore,credentialCapabilities={},provenance}=options;
 const doc=container.ownerDocument,win=doc.defaultView;
 let supplied=options.storage;
 if(supplied===undefined)try{supplied=win.localStorage;}catch{supplied=null;}
 let alive=true;
 const notify=message=>foundation?.notify?.({title:'Website preferences',message,level:'warning'});
 const controller=createVisitorSettings({storage:supplied,onUnavailable:()=>notify('Browser storage is unavailable. Changes apply to this page only and will be lost after reload.'),history:record=>options.history?.(record)});
 const updateSettings=controller.store.update.bind(controller.store);
 controller.store.update=(patch,action)=>{
  if(patch.schedules&&!credentialCapabilities.fetchScheduleSource&&patch.schedules.some(rule=>rule.source?.type&&rule.source.type!=='local'))throw Error('External settings are unavailable on this static website. Choose Local; no provider request or credential was sent.');
  return updateSettings(patch,action);
 };
 const attachSearch=(input,area)=>{
  const search=doc.createElement('mfe-search');search.setAttribute('label',input.getAttribute('aria-label')||'Search website settings');search.setAttribute('scope','visitor-personalization');input.hidden=true;input.before(search);let generation=0;
  const update=async()=>{const current=++generation;const nodes=[...area.querySelectorAll('.local-ux-field')];if(typeof search.filter!=='function'){notify('The settings search component is unavailable. All settings remain visible.');return;}const rows=await search.filter(nodes.map((node,index)=>({id:String(index),text:node.textContent})));if(!alive||current!==generation||rows===null)return;const visible=new Set(rows.map(row=>row.id));nodes.forEach((node,index)=>node.hidden=!visible.has(String(index)));};
  search.addEventListener('search-change',update);
  return()=>{generation++;search.removeEventListener('search-change',update);search.remove();input.hidden=false;};
 };
 const externalUnavailable=async()=>{throw Error('External settings are unavailable on this static website. Use a local schedule; no provider request or credential was sent.');};
 const module=mountPersonalization(container,{
  storage:controller.storage,store:controller.store,surfaceRoot:doc.documentElement,attentionHost:options.attentionHost||doc.body,
  attachSearch,notify,historyCredentialStore,historyManager:options.historyManager,history:options.history,
  vocabulary:{isAuthenticated:()=>false,replace:value=>value},
 verifySharedCredential:credentialCapabilities.verifySharedCredential||(async()=>false),
 setSharedCredential:credentialCapabilities.setSharedCredential||(async()=>{throw Error('Connect the local access capability before setting an unlock credential. Website appearance and local schedules do not require it.');}),
  fetchScheduleSource:credentialCapabilities.fetchScheduleSource||externalUnavailable,
  setScheduleCredential:credentialCapabilities.setScheduleCredential,
  clearScheduleCredential:credentialCapabilities.clearScheduleCredential,
  sharedSettings:{read:async()=>controller.store.get().school,write:async school=>{if(school.enabled!==controller.store.get().school.enabled&&!credentialCapabilities.verifySharedCredential)throw Error('The local access capability is unavailable. Mode activation is unavailable until its unlock credential can be verified. Other visitor settings remain usable.');}},
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
  destroy(){if(!alive)return;alive=false;win.removeEventListener('storage',storageChanged);module.destroy();controller.destroy();}};
}

export {DEFAULTS};
