import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {sha256} from './gui-acceptance.mjs';
import {observeOwnedPackagedFixture} from './gui-acceptance-packaged.mjs';

const ticketKey='material-file-encryptor.local-support-tickets.v1';
// Public, synthetic test input. Never use a user-supplied credential here.
const syntheticPassword='Acceptance fixture only 2026!';
const supported=Object.freeze({
 'access-profile-locked':['begin-unlock','cancel-unlock'],
 'access-profile-unlocked':['logout'],
 'access-removal':['reject-early-confirm','cancel-delete','confirm-delete'],
 'access-confirmation':['reject-early-confirm','cancel-delete','confirm-delete'],
 'access-authenticator-registration':['open-registration','cancel-registration-clears-private-fields'],
 'access-qr-hidden':['verify-secret-preview-hidden']
});
const unsupported=name=>{throw Error('CAPABILITY_UNAVAILABLE: access fixture '+name);};

// Runs in the actual packaged page. It changes only registered input controls,
// dispatches their ordinary events, or activates their existing click handlers.
export function accessControl({selector,operation,value}){
 const matches=[...document.querySelectorAll(selector)];
 if(matches.length!==1)throw Error('Exactly one access control is required');
 const el=matches[0];
 if(!el.getClientRects().length||el.closest('[hidden]')||el.disabled||el.getAttribute('aria-disabled')==='true')throw Error('Active access control unavailable');
 if(!/^(MD-|MFE-)/.test(el.tagName))throw Error('Registered access control required');
 if(operation==='click'){el.click();return true;}
 if(operation!=='value'||el.readOnly||!('value' in el))throw Error('Editable access control unavailable');
 el.value=value;el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));el.dispatchEvent(new Event('change',{bubbles:true,composed:true}));return true;
}

// Returns only bounded synthetic identities and boolean observations, never a
// credential record, verifier, password, QR value, or generated code.
export async function accessObservation({ticketKey}){
 const root=document.querySelector('.access-workspace');
 if(!root)throw Error('Production access workspace unavailable');
 const request=(action,payload={})=>window.drive.featureRequest('access',action,payload);
 const configured=(await request('credentialGet',{key:'local-profile:v1'}))!==null;
 const wait=await request('waitStatus',{target:'profile'});
 let profileGrant=false;
 try{await request('credentialList',{prefix:'history:'});profileGrant=true;}catch(error){if(!String(error?.message).includes('Unlock the local profile before accessing private history.'))throw Error('Native profile grant observation unavailable');}
 const saved=JSON.parse(localStorage.getItem(ticketKey)||'[]');
 if(!Array.isArray(saved)||saved.length>10)throw Error('Unexpected synthetic ticket inventory');
 if(saved.some(row=>row.category!=='Synthetic acceptance'||!['Synthetic local support fixture.','Synthetic edited local support fixture.'].includes(row.description)||row.stage!==0))throw Error('Non-synthetic ticket data prevents access preparation');
 const tickets=saved.map(row=>({id:row.id,category:row.category,description:row.description,stage:row.stage}));
 const rowIds=[...root.querySelectorAll('[data-ticket-id]')].map(el=>el.dataset.ticketId);
 const panel=root.querySelector('[data-access-confirmation]');
 const privateEmpty=[...root.querySelectorAll('[type=password],[data-access-field=current-code],[data-access-history-field=history-password]')].every(el=>!el.value);
 const registrationFields=['authenticator-uri','manual-base32-secret','current-code','issuer','account','group'].map(name=>root.querySelector('.access-registration [data-access-field=\"'+name+'\"]'));
 const registrationFieldsPresent=registrationFields.every(Boolean),registrationFieldsEmpty=registrationFieldsPresent&&registrationFields.every(el=>!el.value),registrationFieldsPopulated=registrationFieldsPresent&&registrationFields.every(el=>Boolean(el.value));
 const privacySafe=privateEmpty&&[...root.querySelectorAll('[data-access-qr-preview]')].every(el=>el.hidden&&el.childElementCount===0)&&[...root.querySelectorAll('video')].every(el=>el.hidden&&!el.srcObject)&&[...root.querySelectorAll('[data-entry-id] output,[data-entry-id] [data-next]')].every(el=>!el.getClientRects().length);
 return {registrationFieldsEmpty,registrationFieldsPopulated,configured,profileGrant,wait:{failures:wait.failures,level:wait.level,until:wait.until},tickets,rowIds,privacySafe,confirmation:Boolean(panel),confirmDisabled:panel?.querySelector('[data-access-action=confirm]')?.disabled===true,registrationOpen:root.querySelector('.access-registration')?.hidden===false,waiting:!!root.querySelector('[data-access-waiting]'),unlocks:root.querySelectorAll('[data-access-unlock]').length,authenticatorCount:root.querySelectorAll('[data-entry-id]').length,lockCount:root.querySelectorAll('[data-lock-record]').length};
}

export function createAccessFixtures({opened,io=fs}){
 assert.equal(opened.connectionOwned,true);assert.equal(opened.target.kind,'extracted-packaged-runtime');
 assert.equal(opened.receipt.launched,true);assert.equal(opened.receipt.connectionOwned,true);
 const {page,target,fixture}=opened;
 assert.equal(fixture.prepared,true);assert.notEqual(fixture.driveLetter,'M:');
 assert.match(target.sourceCommit,/^[a-f0-9]{40}$/);
 const session={runRoot:path.resolve(opened.runRoot),statePath:path.resolve(opened.statePath),profile:path.join(path.resolve(opened.runRoot),'profile'),receiptPath:path.resolve(opened.receiptPath)};
 let admitted=false,configured=false,activeState=null,expectedTicket=null,receiptHash=null,initialNative=null,lifecycleIdentity=null,profileCreationAttempted=false,registrationAction=null;
 const proof=extra=>({ownedSyntheticFixture:true,sourceCommit:target.sourceCommit,productionApi:true,...extra});
 const validateState=state=>{if(!Object.hasOwn(supported,state))unsupported(state);};
 async function identity(context){
  assert.equal(context.binding.sourceCommit,target.sourceCommit,'Source binding changed');
  assert.equal(page.url(),target.expectedUrl,'Packaged target changed');
  const dataFolder=await page.evaluate(()=>window.drive.featureRequest('access','dataFolder'));assert.equal(path.resolve(dataFolder),session.profile,'Native profile is not the owned isolated profile');
  assert.equal(opened.receipt.closed,undefined,'Owned session is closed');
  assert.equal(await io.realpath(session.runRoot),session.runRoot);
  assert.equal(await io.realpath(session.profile),session.profile);
  for(const name of ['runRoot','profile']){const info=await io.lstat(session[name]);assert.equal(info.isDirectory(),true);assert.equal(info.isSymbolicLink(),false);}
  assert.equal(path.dirname(session.statePath),session.runRoot,'Foreign lifecycle receipt');
  for(const filename of [session.statePath,session.receiptPath]){const info=await io.lstat(filename);assert.equal(info.isFile(),true);assert.equal(info.isSymbolicLink(),false);assert.equal(await io.realpath(filename),filename);}
  const bytes=await io.readFile(session.receiptPath),receipt=JSON.parse(bytes);
  assert.equal(receipt.runRoot,session.runRoot);assert.equal(receipt.statePath,session.statePath);assert.equal(receipt.launched,true);assert.equal(receipt.connectionOwned,true);assert.deepEqual(receipt.target,target);
  if(receiptHash!==null)assert.equal(sha256(bytes),receiptHash,'Package session receipt changed');else receiptHash=sha256(bytes);
  const lifecycle=JSON.parse(await io.readFile(session.statePath));
  assert.equal(lifecycle.created,true);assert.notEqual(lifecycle.cleaned,true);assert.equal(lifecycle.runRoot,session.runRoot);assert.equal(lifecycle.process.executablePath,target.executable);
  const currentIdentity=JSON.stringify({process:lifecycle.process,desktop:lifecycle.desktop,hwnd:lifecycle.hwnd});if(lifecycleIdentity!==null)assert.equal(currentIdentity,lifecycleIdentity,'Owned lifecycle process changed');else lifecycleIdentity=currentIdentity;
  for(const [key,filename] of Object.entries(target.files))assert.equal(sha256(await io.readFile(filename)),target.hashes[key],'Package bytes changed');
  const native=await observeOwnedPackagedFixture(page,fixture);assert.equal(native.operation,null);
  if(initialNative)assert.deepEqual(native,initialNative,'Access fixture changed native drive state');else initialNative=native;
 }
 const read=()=>page.evaluate(accessObservation,{ticketKey});
 const control=(selector,operation='click',value)=>page.evaluate(accessControl,{selector,operation,value});
 const action=(name,parent='#access-panel-profile')=>control(parent+' [data-access-action="'+name+'"]');
 const tab=name=>control('#access-tab-'+name);
 async function settled(predicate,description){
  // Observe host responses on every bounded attempt; never accept only a timer.
  const until=Date.now()+15000;
  do{const value=await read();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,75));}while(Date.now()<until);
  throw Error('Access observable unavailable: '+description);
 }
 function safe(value){assert.equal(value.privacySafe,true,'Private output remains visible');assert.equal(value.authenticatorCount,0,'Unexpected authenticator data');assert.equal(value.lockCount,0,'Unexpected element lock');assert.deepEqual([...value.rowIds].sort(),value.tickets.map(row=>row.id).sort(),'Ticket storage and rendered rows differ');
  for(const row of value.tickets){assert.equal(row.id,expectedTicket,'Unexpected ticket identity');assert.equal(row.category,'Synthetic acceptance');assert.ok(['Synthetic local support fixture.','Synthetic edited local support fixture.'].includes(row.description));assert.equal(row.stage,0);}
 }
 async function authenticate(create=false){
  await tab('profile');
  await control('[data-access-field=profile-password]','value',syntheticPassword);
  if(create)profileCreationAttempted=true;await action(create?'set-up-local-profile':'unlock-local-profile');
  const result=await settled(value=>value.configured&&value.profileGrant&&value.privacySafe&&value.wait.failures===0&&value.wait.until===0,'authenticated profile with cleared fields');
  configured=true;safe(result);return result;
 }
 async function logout(){await tab('profile');await action('log-out');return settled(value=>!value.profileGrant&&value.privacySafe&&!value.waiting,'logged out');}
 async function clearConfirmation(){const value=await read();if(value.confirmation){await tab('support');await action('cancel','[data-access-confirmation]');await settled(value=>!value.confirmation,'confirmation cancelled');}}
 async function removeTicket(){
  const before=await read();safe(before);if(!before.tickets.length)return;
  await tab('support');await clearConfirmation();await action('select-visible','#access-panel-support');await action('remove-selected','#access-panel-support');
  await page.evaluate(()=>{const panel=document.querySelector('[data-access-confirmation]');if(!panel||!panel.getClientRects().length)throw Error('Confirmation unavailable');const keys=[...panel.querySelectorAll('md-switch')];if(keys.length!==2)throw Error('Two confirmation keys required');for(const key of keys){if(key.disabled)throw Error('Confirmation key disabled');key.selected=true;key.dispatchEvent(new Event('change',{bubbles:true,composed:true}));}const slider=panel.querySelector('md-slider');if(!slider||slider.disabled)throw Error('Confirmation progress unavailable');slider.value=100;slider.dispatchEvent(new Event('input',{bubbles:true,composed:true}));});
  await action('confirm','[data-access-confirmation]');await settled(value=>!value.confirmation&&value.tickets.length===0&&value.rowIds.length===0,'ticket removal persisted');expectedTicket=null;
 }
 async function baseline(){
  const initial=await read();safe(initial);if(initial.configured&&!configured){assert.equal(profileCreationAttempted,true,'Unexpected configured profile');configured=true;}await clearConfirmation();await tab('authenticator');const current=await read();if(current.registrationOpen)await action('cancel-editing','.access-registration');
  await removeTicket();if(configured)await authenticate();await logout();const after=await read();safe(after);assert.equal(after.wait.failures,0);assert.equal(after.wait.until,0);return after;
 }
 async function makeTicket(){
  await tab('support');const before=await read();assert.equal(before.tickets.length,0);assert.equal(before.rowIds.length,0);
  await control('[data-access-field=category]','value','Synthetic acceptance');await control('[data-access-field=description]','value','Synthetic local support fixture.');await action('create-local-ticket','#access-panel-support');
  const created=await settled(value=>value.tickets.length===1&&value.rowIds.length===1,'ticket created and persisted');expectedTicket=created.tickets[0].id;assert.match(expectedTicket,/^[a-zA-Z0-9-]{1,80}$/);safe(created);
  // Prove the existing Edit flow mutates the same durable identity, not a new row.
  await action('edit','[data-ticket-id="'+expectedTicket+'"]');await control('[data-access-field=description]','value','Synthetic edited local support fixture.');await action('create-local-ticket','#access-panel-support');
  const edited=await settled(value=>value.tickets.length===1&&value.tickets[0].description==='Synthetic edited local support fixture.','ticket edit persisted');safe(edited);
  await action('select-visible','#access-panel-support');await action('remove-selected','#access-panel-support');
  return settled(value=>value.confirmation&&value.confirmDisabled,'two-key confirmation');
 }
 return {
  supportedStates:Object.keys(supported),
  assertCapabilities(state,actions=[]){validateState(state);for(const action of actions)if(!supported[state].includes(action))unsupported(state+'.'+action);},
  async prepare(context){
   validateState(context.state);await identity(context);
   if(context.phase==='prepare'){
    // Navigation is owned by acquisition; defer controls until its enter phase.
    activeState=context.state;return proof({sessionBound:true});
   }
   assert.equal(context.phase,'enter','Unknown access preparation phase');assert.equal(activeState,context.state,'Access preparation order changed');
   const before=await read();
   if(!admitted){assert.equal(before.configured,false,'Fresh unconfigured owned profile required');assert.equal(before.profileGrant,false);assert.equal(before.wait.failures,0);assert.equal(before.wait.level,0);assert.equal(before.wait.until,0);assert.equal(before.tickets.length,0);safe(before);admitted=true;}
   else {safe(before);await baseline();}
   if(context.state.startsWith('access-profile')){if(!configured)await authenticate(true);else await authenticate();if(context.state==='access-profile-locked')await logout();}
   if(['access-removal','access-confirmation'].includes(context.state))await makeTicket();
   if(['access-authenticator-registration','access-qr-hidden'].includes(context.state)){await tab('authenticator');if(context.state==='access-authenticator-registration')await action('add-authenticator','#access-panel-authenticator');}
   return proof({sessionBound:true,profileRetained:configured});
  },
  async beforeAction(context){
   validateState(context.state);await identity(context);assert.equal(activeState,context.state);assert.equal(admitted,true);
   if(context.state!=='access-authenticator-registration')return;
   registrationAction=null;
   if(context.action==='open-registration'){
    await tab('authenticator');const before=await read();safe(before);
    if(before.registrationOpen)await action('cancel-editing','.access-registration');
    const closed=await settled(value=>!value.registrationOpen&&value.registrationFieldsEmpty&&value.privacySafe,'registration closed before Add');safe(closed);
    registrationAction={action:context.action,closedBefore:true};
   }else if(context.action==='cancel-registration-clears-private-fields'){
    const before=await read();safe(before);assert.equal(before.registrationOpen,true,'Open registration required before population');
    // These public synthetic strings are only field input. No Save, QR reveal,
    // camera start, credential-store write, or capture occurs during this step.
    for(const [name,value] of [['authenticator-uri','synthetic-acceptance-uri'],['manual-base32-secret','SYNTHETICFIXTURE'],['current-code','000000'],['issuer','Synthetic issuer'],['account','Synthetic account'],['group','Synthetic group']])await control('.access-registration [data-access-field="'+name+'"]','value',value);
    const populated=await read();assert.equal(populated.registrationOpen,true);assert.equal(populated.registrationFieldsPopulated,true,'All registration fields must be populated before Cancel');assert.equal(populated.privacySafe,false,'Sensitive-field precondition was not exercised');
    registrationAction={action:context.action,populatedBefore:true};
   }
  },
  async perform(context){
   validateState(context.state);await identity(context);assert.equal(activeState,context.state);const name=context.action;
   if(name==='begin-unlock'){
    assert.equal(context.state,'access-profile-locked');const before=await read();safe(before);assert.equal(before.profileGrant,false);assert.equal(before.wait.failures,0);assert.equal(before.wait.until,0);
    await control('[data-access-field=profile-password]','value','Incorrect synthetic acceptance input');await action('unlock-local-profile');
    const after=await settled(value=>!value.profileGrant&&value.wait.failures===1&&value.wait.until===0&&value.privacySafe,'native wrong-attempt persistence');safe(after);
   }else if(name==='cancel-unlock'){assert.equal(context.state,'access-profile-locked');await authenticate();await logout();}
   else unsupported(context.state+'.'+name);
   return proof({sessionBound:true});
  },
  async observe(context){
   validateState(context.state);await identity(context);const value=await read();safe(value);
   if(context.action==='state'){
    if(context.state==='access-profile-locked'){assert.equal(value.configured,true);assert.equal(value.profileGrant,false);assert.equal(value.wait.failures,0);}
    if(context.state==='access-profile-unlocked'){assert.equal(value.configured,true);assert.equal(value.profileGrant,true);}
    if(['access-confirmation','access-removal'].includes(context.state)){assert.equal(value.confirmation,true);assert.equal(value.confirmDisabled,true);assert.equal(value.tickets.length,1);}
    if(context.state==='access-authenticator-registration')assert.equal(value.registrationOpen,true);
   }
   if(context.action==='begin-unlock'){assert.equal(value.profileGrant,false);assert.equal(value.wait.failures,1);}
   if(context.action==='cancel-unlock'){assert.equal(value.profileGrant,false);assert.equal(value.wait.failures,0);}
   if(context.action==='reject-early-confirm'){assert.equal(value.tickets.length,1);assert.equal(value.confirmation,true);assert.equal(value.confirmDisabled,true);}
   if(['logout','log-out','cancel-unlock'].includes(context.action))assert.equal(value.profileGrant,false);
   if(context.action==='cancel-delete'){assert.equal(value.confirmation,false);assert.equal(value.tickets.length,1);}
   if(context.action==='cancel-registration-clears-private-fields'){assert.equal(registrationAction?.action,context.action,'Registration action preparation missing');assert.equal(registrationAction.populatedBefore,true);assert.equal(value.registrationOpen,false);assert.equal(value.registrationFieldsEmpty,true,'Cancel did not clear every registration field');registrationAction=null;}
   if(context.action==='open-registration'){assert.equal(registrationAction?.action,context.action,'Registration action preparation missing');assert.equal(registrationAction.closedBefore,true);assert.equal(value.registrationOpen,true,'Add did not open closed registration');registrationAction=null;}
   if(context.action==='confirm-delete'){assert.equal(value.tickets.length,0);assert.equal(value.rowIds.length,0);assert.equal(value.confirmation,false);expectedTicket=null;}
   return {passed:true,privacySafe:true,sessionBound:true,durableReadback:true};
  },
  async restore(context){
   await identity(context);if(!admitted)return proof({restored:true,mutated:false});
   const after=await baseline();assert.equal(after.tickets.length,0);assert.equal(after.profileGrant,false);assert.equal(after.registrationOpen,false);assert.equal(after.confirmation,false);assert.equal(after.unlocks,0);await identity(context);activeState=null;
   return proof({restored:true,sessionBound:true,profileRetained:configured,profileRetirement:'owned-session-lifecycle',nativeDriveUnchanged:true});
  }
 };
}
