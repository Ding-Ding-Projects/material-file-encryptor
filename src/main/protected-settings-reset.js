import {randomUUID} from 'node:crypto';
import {DEFAULTS,validateSettings} from '../shared/local-ux/store.js';

export const RESET_PREFERENCES_KEY='profile:preferences:v1';
export const RESET_DISPLAY_KEY='profile:access-display-name:v1';
const JOURNAL='profile:preferences-reset-journal:v1';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=value=>structuredClone(value);
const fields=Object.keys(DEFAULTS).filter(key=>!['version','school','displayName'].includes(key));
const summary=value=>({language:value.language,theme:value.theme,density:value.density,
 funnyEnglish:value.funnyEnglish,funnyCantonese:value.funnyCantonese,emoji:value.emoji,
 seed:value.seed,fontScale:value.fontScale,fontWeight:value.fontWeight,motion:value.motion,
 narratorEnabled:value.narrator.enabled,attentionEnabled:Object.entries(value.attention).filter(([key,item])=>typeof item==='boolean'&&item).map(([key])=>key),
 scheduleCount:value.schedules.length,textValuesOmitted:true});

/** Native coordinator, deliberately not a localStorage transaction.
 * authorize returns a recheck function bound to the trusted actor and profile
 * revision. audit must append the authorized encrypted display-name history.
 * The caller must adopt native preferences for ALL desktop preference writers
 * before exposing this capability in a production renderer. */
export function createProtectedSettingsReset({credentials,getActor,authorize,audit,now=Date.now,ttl=120000}={}){
 if(!credentials||['readVersioned','compareAndSetVersioned','compareAndSetBatchVersioned'].some(key=>typeof credentials[key]!=='function')||typeof getActor!=='function'||typeof authorize!=='function'||typeof audit!=='function')throw Error('Protected settings reset is unavailable.');
 let closed=false,chain=Promise.resolve();const prepared=new Map();
 const serial=run=>{const result=chain.catch(()=>{}).then(run);chain=result;return result;};
 const actor=()=>{const who=getActor();if(closed||typeof who!=='string'||!who)throw Error('Trusted reset actor is unavailable.');return who;};
 async function recover(){
  const record=await credentials.readVersioned(JOURNAL);let intent=record.value,journalRevision=record.revision;
  if(!intent)return {state:'idle'};
  if(intent.version!==1||!['prepared','applied','conflict'].includes(intent.state)||!Array.isArray(intent.changes)||!intent.changes.length||intent.changes.length>2||new Set(intent.changes.map(row=>row.key)).size!==intent.changes.length||intent.changes.some(row=>![RESET_PREFERENCES_KEY,RESET_DISPLAY_KEY].includes(row.key)))throw Error('Settings reset recovery record is invalid.');
  if(intent.state==='conflict')return {state:'conflict',conflicts:clone(intent.conflicts||[])};
  if(intent.state==='prepared'){
   const cleared=await credentials.compareAndSetVersioned(JOURNAL,record.revision,null);
   return {state:cleared.updated?'aborted':'conflict'};
  }
  if(!intent.written||intent.changes.some(row=>typeof intent.written[row.key]!=='string'))throw Error('Settings reset recovery ownership is unavailable.');
  // Each restoration and its exact new revision share one atomic journal
  // update. A restart can distinguish our restored value from a later ABA
  // writer without treating equality of the visible value as ownership.
  const conflicts=[];
  for(const row of intent.changes){
   if(intent.restored?.[row.key]){const current=await credentials.readVersioned(row.key);if(current.revision!==intent.restored[row.key])conflicts.push(row.key);continue;}
   const restored=await credentials.compareAndSetBatchVersioned([{key:row.key,expectedRevision:intent.written[row.key],replacement:row.before}],{key:JOURNAL,expectedRevision:journalRevision,replacement:intent,receiptField:'restored'});
   if(!restored.updated){const current=await credentials.readVersioned(JOURNAL);if(current.revision!==journalRevision)return {state:'conflict',conflicts};conflicts.push(row.key);continue;}
   intent={...intent,restored:{...intent.restored,...restored.revisions}};journalRevision=restored.journalRevision;
  }
  if(conflicts.length){await credentials.compareAndSetVersioned(JOURNAL,journalRevision,{...intent,state:'conflict',conflicts});return {state:'conflict',conflicts};}
  const conditions=Object.entries(intent.restored??{}).map(([key,expectedRevision])=>({key,expectedRevision}));
  const cleared=await credentials.compareAndSetBatchVersioned([{key:JOURNAL,expectedRevision:journalRevision,replacement:null}],null,conditions);
  if(cleared.updated)return {state:'restored',conflicts};
  // A writer may advance a restored row after it was inspected above. Do not
  // discard the recovery record without rechecking all its owned revisions.
  const latest=await credentials.readVersioned(JOURNAL);if(latest.revision!==journalRevision)return {state:'conflict',conflicts};
  for(const [key,revision] of Object.entries(intent.restored??{}))if((await credentials.readVersioned(key)).revision!==revision)conflicts.push(key);
  await credentials.compareAndSetVersioned(JOURNAL,journalRevision,{...intent,state:'conflict',conflicts});
  return {state:'conflict',conflicts};
 }
 return {
  recover:()=>serial(recover),
  prepare({includeDisplayName=false}={}){return serial(async()=>{
   const who=actor(),check=await authorize(who);await check();
   const recovery=await recover();await check();if(recovery.state==='conflict')throw Error('Settings reset recovery has a concurrent change. Review preferences before retrying.');
   const prefs=await credentials.readVersioned(RESET_PREFERENCES_KEY);await check();
   if(prefs.value===null)throw Error('Native preferences have not been adopted. Coordinated settings reset is unavailable.');
   const before=validateSettings(prefs.value);if(!equal(before,prefs.value))throw Error('Native preferences are not in the canonical settings format.');
   const after=clone(before);for(const key of fields)after[key]=clone(DEFAULTS[key]);
   const changes=[];if(!equal(before,after))changes.push({key:RESET_PREFERENCES_KEY,expectedRevision:prefs.revision,before:prefs.value,replacement:after});
   let name=null;if(includeDisplayName){name=await credentials.readVersioned(RESET_DISPLAY_KEY);await check();after.displayName=DEFAULTS.displayName;
    const replacement={value:DEFAULTS.displayName};if(!equal(name.value,replacement))changes.push({key:RESET_DISPLAY_KEY,expectedRevision:name.revision,before:name.value,replacement});
    const prefsRow=changes.find(row=>row.key===RESET_PREFERENCES_KEY);if(prefsRow)prefsRow.replacement=after;else if(!equal(before,after))changes.push({key:RESET_PREFERENCES_KEY,expectedRevision:prefs.revision,before:prefs.value,replacement:after});
   }
   const id=randomUUID(),expires=now()+Math.min(120000,Math.max(1000,ttl));
   const entry={id,who,check,conditions:clone(check.conditions??[]),expires,changes,preferencesRevision:prefs.revision,displayRevision:name?.revision??null,includeDisplayName};prepared.set(id,entry);
   return {id,expires,scope:{preferences:fields,displayName:includeDisplayName,sharedMode:false},before:summary(before),after:summary(after),displayName:includeDisplayName?{before:name?.value?.value??before.displayName,after:DEFAULTS.displayName}:null,changedKeys:changes.map(row=>row.key),preserved:['Vault contents','Credentials','Authenticator entries','Shared mode','Personal vocabulary','Custom images','Unrelated history']};
  });},
  abort(id){const entry=prepared.get(id);if(entry&&entry.who===actor()){prepared.delete(id);return {state:'aborted'};}return {state:'unavailable'};},
  commit(id){return serial(async()=>{
   const who=actor(),entry=prepared.get(id);if(!entry||entry.who!==who)throw Error('Settings reset approval is unavailable.');prepared.delete(id);
   const check=async()=>{if(actor()!==who||now()>=entry.expires)throw Error('Settings reset approval expired or was cancelled.');await entry.check();if(actor()!==who||now()>=entry.expires)throw Error('Settings reset approval expired or was cancelled.');};await check();
   const prefs=await credentials.readVersioned(RESET_PREFERENCES_KEY);await check();if(prefs.revision!==entry.preferencesRevision)throw Error('Preferences changed after the reset preview.');
   if(entry.includeDisplayName){const name=await credentials.readVersioned(RESET_DISPLAY_KEY);await check();if(name.revision!==entry.displayRevision)throw Error('Display name changed after the reset preview.');}
   if(!entry.changes.length)return {state:'unchanged'};
   const journal=await credentials.readVersioned(JOURNAL);await check();if(journal.value!==null)throw Error('Settings reset recovery is pending.');
   const intent={version:1,id,state:'prepared',changes:entry.changes};
   const saved=await credentials.compareAndSetBatchVersioned([{key:JOURNAL,expectedRevision:journal.revision,replacement:intent}],null,entry.conditions);if(!saved.updated)throw Error('Settings reset recovery or profile authorization changed concurrently.');
   try{
    await check();const installed=await credentials.compareAndSetBatchVersioned(entry.changes.map(({key,expectedRevision,replacement})=>({key,expectedRevision,replacement})),{key:JOURNAL,expectedRevision:saved.revisions[JOURNAL],replacement:{...intent,state:'applied'}},entry.conditions);
    if(!installed.updated)throw Error('Settings or profile authorization changed after the reset preview.');await check();
    await audit({id,changes:clone(entry.changes),check});await check();
    // This atomic, revision-conditioned clear is the completion point. A
    // subsequent profile change does not retroactively authorize or undo it.
    const cleared=await credentials.compareAndSetBatchVersioned([{key:JOURNAL,expectedRevision:installed.journalRevision,replacement:null}],null,entry.conditions);if(!cleared.updated)throw Error('Settings reset recovery or profile authorization changed concurrently.');
    return {state:'committed',preferences:clone(entry.changes.find(row=>row.key===RESET_PREFERENCES_KEY)?.replacement??prefs.value)};
   }catch(error){const result=await recover();if(result.state==='conflict')throw Error('Settings reset encountered a concurrent change. Newer records were preserved; local review is required.');throw error;}
  });},
  close(){closed=true;prepared.clear();},
 };
}
