export const WAIT_BUDGET_KEY='material-file-encryptor.wait-budget.v1';
const HOUR=3600000;
/** One non-secret budget is shared by element and profile waiting challenges. */
export function createWaitBudget({storage=globalThis.localStorage,key=WAIT_BUDGET_KEY,now=Date.now,withLock}={}){
 const lock=withLock===null?null:withLock||(globalThis.navigator?.locks?.request?((name,run)=>globalThis.navigator.locks.request(name,run)):null);
 function read(){
  if(!storage)throw Error('Persistent waiting budget storage is unavailable.');
  const raw=storage.getItem(key);if(!raw)return {version:1,uses:[]};
  if(raw.length>4096)throw Error('Persistent waiting budget is invalid.');
  let value;try{value=JSON.parse(raw);}catch{throw Error('Persistent waiting budget is invalid.');}
  if(value?.version!==1||!Array.isArray(value.uses)||value.uses.length>3||value.uses.some(use=>!Number.isSafeInteger(use.at)||use.at<0||typeof use.id!=='string'||use.id.length>80))throw Error('Persistent waiting budget is invalid.');
  return {version:1,uses:value.uses.filter(use=>use.at>now()-HOUR)};
 }
 return {
  async status(){const value=read();return {remaining:Math.max(0,3-value.uses.length),nextAvailable:value.uses.length>=3?Math.min(...value.uses.map(use=>use.at))+HOUR:null,persistent:true,canConsume:!!lock};},
  async consume(){
   if(!lock)throw Error('Atomic waiting budget storage is unavailable. Wait for the timer instead.');
   return lock(key,async()=>{const value=read();if(value.uses.length>=3)return false;const id=crypto.randomUUID();value.uses.push({at:now(),id});storage.setItem(key,JSON.stringify(value));const stored=read();if(!stored.uses.some(use=>use.id===id))throw Error('Persistent waiting budget could not be verified.');return true;});
  },
 };
}
