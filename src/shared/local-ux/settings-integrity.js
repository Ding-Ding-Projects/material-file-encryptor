import {createSettingsStore,validateSettings} from './store.js';

/** Desktop settings share one mutation boundary even when a renderer receives
 * an existing store. Credentials remain with the privileged host capability. */
export function createDesktopSettingsIntegrity({storage,isAuthenticated=()=>false,onError=()=>{},verifyCredential,setCredential,writeSharedMode}={}) {
 let manager=null,historyFlight=Promise.resolve(),verified=false,permit=null,hostNameHistoryPermit=null;
 const modeKey=value=>JSON.stringify({enabled:value.enabled===true,name:value.name});
 const requiresPermission=(before,next)=>modeKey(before)!==modeKey(next)&&(before.enabled||next.enabled);
 const store=createSettingsStore({storage,onError,history:record=>{
  if(hostNameHistoryPermit&&record.action===hostNameHistoryPermit){hostNameHistoryPermit=null;return;}
  if(!isAuthenticated()||!manager?.unlocked)return;
  const consumer=manager;
  historyFlight=historyFlight.catch(()=>{}).then(()=>{
   if(!isAuthenticated()||!consumer.unlocked)throw Error('Unlock the local profile and private history before recording settings history.');
   return consumer.append(record.action,record.after,{at:record.at});
  }).catch(error=>onError(error.message));
 }});
 const update=store.update.bind(store);
 const assertCanUpdate=patch=>{const before=store.get(),next=validateSettings({...before,...patch});if(requiresPermission(before.school,next.school)&&!(permit?.before===modeKey(before.school)&&permit?.after===modeKey(next.school)))throw Error('Verify and change the shared mode through its control before importing, resetting or restoring a different protected mode state.');return next;};
 store.update=(patch,action)=>{
  const before=store.get(),next=validateSettings({...before,...patch});
  if(requiresPermission(before.school,next.school)){
   const allowed=permit?.before===modeKey(before.school)&&permit?.after===modeKey(next.school);permit=null;
   if(!allowed)throw Error('Verify and change the shared mode through its control before importing, resetting or restoring a different protected mode state.');
  }
  permit=null;
  if(JSON.stringify(before)===JSON.stringify(next))return before;
  return update(next,action);
 };
 return {store,assertCanUpdate,
  applyDisplayNameFromHost(value){
   if(value===null)return store.get();
   if(typeof value!=='string'||!value.trim()||value.length>160||/[\x00-\x1f]/.test(value))throw Error('The host returned an invalid display name.');
   const previous=hostNameHistoryPermit,own=Symbol('trusted display name');hostNameHistoryPermit=own;
   try{return store.update({displayName:value},own);}finally{hostNameHistoryPermit=previous;}
  },
  connectHistory(value){manager=value;},flushHistory:()=>historyFlight,
  async verifySharedCredential(password){verified=false;permit=null;const result=await verifyCredential?.(password);verified=result===true;return verified;},
  async setSharedCredential(password){verified=false;permit=null;if(!setCredential)throw Error('Protected mode credential storage is unavailable.');const result=await setCredential(password);if(result===false)throw Error('The mode credential was not stored.');verified=true;return result;},
  async writeSchool(value){
   const next=validateSettings({...store.get(),school:value}).school;
   if(requiresPermission(store.get().school,next)&&!verified)throw Error('Verify the shared mode credential before changing the protected mode.');
   verified=false;permit=null;
   if(!writeSharedMode)throw Error('The privileged shared mode adapter is unavailable.');
   const result=await writeSharedMode(next);if(result===false)throw Error('The shared mode was not changed.');
   permit=modeKey(store.get().school)===modeKey(next)?null:{before:modeKey(store.get().school),after:modeKey(next)};return result;
  },
  // Only trusted host read/subscription callbacks call this method. A public
  // import or history restore never obtains an authorization through it.
  fromHost(value){permit=value?{before:modeKey(store.get().school),after:modeKey(validateSettings({...store.get(),school:value}).school)}:null;return value;},
  destroy(){verified=false;permit=null;manager=null;},
 };
}



/** A navigation or authentication change invalidates approval, including a page
 * entering the back-forward cache. Callers recheck after every approval await. */
export function createSettingsConfirmationLifetime({target,isAuthenticated,isHistoryUnlocked=()=>true}={}) {
 let controller=new AbortController(),closed=false;
 const cancel=()=>{controller.abort();controller=new AbortController();};
 target?.addEventListener('pagehide',cancel);
 return {get signal(){return controller.signal;},cancel,
  validate(signal,{history=false}={}){if(closed||signal.aborted||!isAuthenticated()||(history&&!isHistoryUnlocked()))throw Error('Unlock the local profile and private history before confirming this action.');},
  destroy(){closed=true;cancel();target?.removeEventListener('pagehide',cancel);}
 };
}
