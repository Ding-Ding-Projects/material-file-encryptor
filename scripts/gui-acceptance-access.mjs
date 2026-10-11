import assert from 'node:assert/strict';
import {withCdpConnectionProof} from './cdp-connection-plan.mjs';

// Producers own privileged synthetic setup and never return credentials. The
// adapter drives ordinary controls and separately observes the production UI.
const protectedActions=new Set(['set-up-local-profile','unlock-local-profile','begin-unlock','open-target-wizard','save-target-lock','open-picker-without-consumption','choose-once','second-change-denied','invalid-factor','open-picker','select-synthetic-file','export-selected-metadata','export-selected','unlock-history','export-redacted-history','restore-entry']);
export function createAccessAdapters({launch,receipt,inventory,prepareOwnedFixture,fixtures={}}){
 const entries=inventory.states.filter(state=>state.owner==='access'&&state.id.startsWith('access-'));
 const plan=steps=>withCdpConnectionProof({version:1,receipt,endpoint:'http://127.0.0.1:'+launch.cdp.port,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:15000,steps},'control');
 const execute=async(executePlan,id,expression,poll=false)=>{
  const result=await executePlan(plan([{id,op:poll?'poll':'evaluate',expression,...(poll?{equals:true,intervalMs:100}:{})}]));
  assert.equal(result.ok,true,'Access plan failed');assert.equal(result.results?.at(-1)?.value,true,'Access observable did not match');return true;
 };
 const query=selector=>'document.querySelector('+JSON.stringify(selector)+')';
 const visible=selector=>'Boolean('+query(selector)+'?.getClientRects().length)&&!'+query(selector)+'?.closest("[hidden]")';
 const actionSelector=(name,parent='')=>(parent?parent+' ':'')+'[data-access-action="'+name+'"]';
 const click=selector=>'(()=>{const el='+query(selector)+';if(!el||el.disabled||!el.getClientRects().length||el.closest("[hidden]"))throw Error("Active access control unavailable");el.click();return true;})()';
 const change=(selector,value)=>'(()=>{const el='+query(selector)+';if(!el||el.disabled||el.readOnly||!el.getClientRects().length||el.closest("[hidden]"))throw Error("Editable access control unavailable");el.value='+JSON.stringify(value)+';el.dispatchEvent(new Event("input",{bubbles:true,composed:true}));el.dispatchEvent(new Event("change",{bubbles:true,composed:true}));return true;})()';
 const privacy='(()=>{const root=document.querySelector(".access-workspace");if(!root)return false;const privateFields=[...root.querySelectorAll("[type=password],[data-access-field=current-code],[data-access-history-field=history-password]")];const qr=[...root.querySelectorAll("[data-access-qr-preview]")];const videos=[...root.querySelectorAll("video")];const codes=[...root.querySelectorAll("[data-entry-id] output,[data-entry-id] [data-next]")];return privateFields.every(el=>!el.value)&&qr.every(el=>el.hidden&&el.childElementCount===0)&&videos.every(el=>el.hidden&&!el.srcObject)&&codes.every(el=>!el.getClientRects().length);})()';
 function capability(name){const producer=fixtures[name];if(!producer)throw Error('CAPABILITY_UNAVAILABLE: '+name);return producer;}
 function access(){const producer=capability('access');for(const method of ['prepare','perform','observe','restore'])if(typeof producer[method]!=='function')throw Error('CAPABILITY_UNAVAILABLE: access.'+method);return producer;}
 function proof(value,binding){assert.equal(value?.ownedSyntheticFixture,true,'Synthetic ownership missing');assert.equal(value.sourceCommit,binding.sourceCommit,'Source binding changed');assert.equal(value.productionApi,true,'Production fixture route required');}
 async function observeProducer(context,state,action){const value=await access().observe({...context,state,action});assert.equal(value?.passed,true,'Protected access observable failed');assert.equal(value?.privacySafe,true,'Protected access privacy unproven');return {protectedState:true,privacySafe:true};}
 const ordinary={
  'log-out':['log-out','#access-panel-profile','!document.querySelector("[data-access-waiting]")'],
  'logout':['log-out','#access-panel-profile','!document.querySelector("[data-access-waiting]")'],
  'logout-clears-wait':['log-out','#access-panel-profile','!document.querySelector("[data-access-waiting]")'],
  'open-registration':['add-authenticator','#access-panel-authenticator','!document.querySelector(".access-registration").hidden'],
  'cancel-registration':['cancel-editing','.access-registration','document.querySelector(".access-registration").hidden'],
  'cancel-registration-clears-private-fields':['cancel-editing','.access-registration','document.querySelector(".access-registration").hidden'],
  'cancel-target-wizard':['cancel','[data-access-wizard]','document.querySelector("[data-access-wizard]").hidden'],
  'cancel-wizard':['cancel','[data-access-wizard]','document.querySelector("[data-access-wizard]").hidden'],
  'cancel-unlock':['cancel','[data-access-unlock]','!document.querySelector("[data-access-unlock]")'],
  'cancel-wait':['close','[data-access-waiting]','!document.querySelector("[data-access-waiting]")'],
  'cancel-delete':['cancel','[data-access-confirmation]','!document.querySelector("[data-access-confirmation]")']
 };
 async function perform(state,id,context){
  const {executePlan,binding}=context;
  if(protectedActions.has(id)||(id==='cancel-unlock'&&state.id.includes('profile'))){
   if(['open-picker','select-synthetic-file'].includes(id))capability('nativePicker');
   const result=await access().perform({...context,state:state.id,action:id,nativePicker:fixtures.nativePicker});proof(result,binding);
   await observeProducer(context,state.id,id);
   await execute(executePlan,id+'-private-output',privacy,true);
   const expected=id==='open-target-wizard'?visible('[data-access-wizard]'):id==='save-target-lock'?'document.querySelector("[data-access-wizard]").hidden':visible(state.selector);
   await execute(executePlan,id+'-production-state',expected,true);
   // A successful producer must leave only safe booleans in returned evidence.
   return {id,activated:true,observablePassed:true,activation:'owned-production-fixture',evidence:{protectedState:true,privacySafe:true,stateId:state.id,actionId:id,sourceCommit:binding.sourceCommit,planId:id+'-production-state',privateOutputAbsent:true}};
  }
  if(ordinary[id]){
   const [name,parent,expected]=ordinary[id];
   if((id==='log-out'||id==='logout'||id==='logout-clears-wait')&&!state.selector.includes('profile'))await execute(executePlan,id+'-profile-tab',click('#access-tab-profile'));
   await execute(executePlan,id+'-activate',click(actionSelector(name,parent)));await execute(executePlan,id+'-result',expected,true);
  }else if(id==='lock-history'||id==='cancel-history-unlock'){
   await execute(executePlan,id,click('[data-access-history-action=lock-history]'));await execute(executePlan,id+'-result','document.querySelector("[data-access-history] section").hidden',true);await observeProducer(context,state.id,id);
  }else if(id==='open-history-wait'){
   await execute(executePlan,id,click('[data-access-history-action=try-the-waiting-ladder]'));await execute(executePlan,id+'-result',visible('[data-access-waiting=history]'),true);
  }else if(id==='cancel-history-wait'){
   await execute(executePlan,id,click('[data-access-waiting=history] [data-access-action=close]'));await execute(executePlan,id+'-result','!document.querySelector("[data-access-waiting=history]")',true);
  }else if(id==='label-entry'){
   await execute(executePlan,id+'-field',change('[data-access-history-field=entry-label]','Synthetic reviewed label'));await execute(executePlan,id,click('[data-access-history-action=save-label]'));await execute(executePlan,id+'-result','[...document.querySelectorAll("[data-access-history] article span")].some(el=>el.textContent==="Synthetic reviewed label")',true);
  }else if(id==='compare-entries'){
   await execute(executePlan,id+'-select','(()=>{const items=[...document.querySelectorAll("[data-history-entry]")];if(items.length<2)throw Error("Two history entries required");for(const el of items){if(el.disabled||!el.getClientRects().length)throw Error("History selection unavailable");el.checked=false;el.dispatchEvent(new Event("change",{bubbles:true,composed:true}));}for(const el of items.slice(0,2)){el.checked=true;el.dispatchEvent(new Event("change",{bubbles:true,composed:true}));}return true;})()');await execute(executePlan,id,click('[data-access-history-action=compare-selected-entries]'));await execute(executePlan,id+'-result','(()=>{const el=document.querySelector("[data-access-history] output");if(!el?.textContent)return false;const value=JSON.parse(el.textContent);return Array.isArray(value)&&value.every(row=>row.valuesOmitted===true);})()',true);
  }else if(id==='cancel-dialog'){
   await execute(executePlan,id,click('#dialog-cancel'));await execute(executePlan,id+'-result','!document.querySelector("#vault-dialog").open',true);
  }else if(id==='edit-transport'){
   await execute(executePlan,id,change('#remote-repository','synthetic-owner/synthetic-private'));
   await execute(executePlan,id+'-result','document.querySelector("#remote-repository").value==="synthetic-owner/synthetic-private"',true);
  }else if(id==='choose-policy'||id==='choose-session'){
   const index=id==='choose-policy'?0:1,value=id==='choose-policy'?'password':'once';
   const expression='(()=>{const el=document.querySelectorAll("[data-access-wizard] md-outlined-select")['+index+'];if(!el||el.disabled||!el.getClientRects().length)throw Error("Wizard selector unavailable");el.value='+JSON.stringify(value)+';el.dispatchEvent(new Event("change",{bubbles:true,composed:true}));return el.value==='+JSON.stringify(value)+';})()';
   await execute(executePlan,id,expression);await execute(executePlan,id+'-result','document.querySelectorAll("[data-access-wizard] md-outlined-select")['+index+'].value==='+JSON.stringify(value),true);
  }else if(id==='verify-secret-preview-hidden'){
   await execute(executePlan,id,privacy,true);
  }else if(id==='filter-authenticators'){
   await execute(executePlan,id+'-before','(()=>{const rows=[...document.querySelectorAll("#access-panel-authenticator [data-entry-id]")].filter(el=>!el.hidden&&el.getClientRects().length);if(!rows.length)throw Error("Nonempty visible authenticator fixture required");window.__accessFilterIds=rows.map(el=>el.dataset.entryId);return true;})()');
   await execute(executePlan,id,'(()=>{const search=document.querySelector("#access-panel-authenticator mfe-search");const el=search?.shadowRoot?.querySelector("md-outlined-text-field");if(!el||el.disabled)throw Error("Authenticator search unavailable");el.value="no-synthetic-match-acceptance";el.dispatchEvent(new Event("input",{bubbles:true,composed:true}));return true;})()');
   await execute(executePlan,id+'-result','(()=>{const ids=window.__accessFilterIds,rows=[...document.querySelectorAll("#access-panel-authenticator [data-entry-id]")];return Array.isArray(ids)&&ids.length>0&&ids.every(id=>rows.some(el=>el.dataset.entryId===id&&el.hidden));})()',true);
  }else if(id==='create-ticket'){
   await execute(executePlan,id+'-before','(()=>{window.__accessTicketIds=[...document.querySelectorAll("[data-ticket-id]")].map(el=>el.dataset.ticketId);return true;})()');
   await execute(executePlan,id+'-category',change('[data-access-field=category]','Synthetic acceptance'));
   await execute(executePlan,id+'-description',change('[data-access-field=description]','Synthetic local support fixture.'));
   await execute(executePlan,id,click(actionSelector('create-local-ticket','#access-panel-support')));
   await execute(executePlan,id+'-result','(()=>{const before=window.__accessTicketIds,rows=[...document.querySelectorAll("[data-ticket-id]")],added=rows.filter(el=>!before.includes(el.dataset.ticketId));return rows.length===before.length+1&&added.length===1&&added[0].textContent.includes("Synthetic local support fixture.");})()',true);
  }else if(id==='select-visible'){
   await execute(executePlan,id,click(actionSelector('select-visible','#access-panel-support')));
   await execute(executePlan,id+'-result','(()=>{const rows=[...document.querySelectorAll("[data-ticket-id]")].filter(el=>!el.hidden);return rows.length>0&&rows.every(row=>row.querySelector("md-checkbox")?.checked);})()',true);
  }else if(id==='reject-early-confirm'){
   await execute(executePlan,id,'(()=>{const panel=document.querySelector("[data-access-confirmation]"),button=panel?.querySelector("[data-access-action=confirm]");if(!panel||!button||!button.disabled||!panel.getClientRects().length)throw Error("Incomplete confirmation was not blocked");button.click();return true;})()');
   await execute(executePlan,id+'-result',visible('[data-access-confirmation]')+'&&document.querySelector("[data-access-confirmation] [data-access-action=confirm]").disabled',true);
   await observeProducer(context,state.id,id);
  }else if(id==='confirm-delete'){
   await execute(executePlan,id+'-reopen','(()=>{if(document.querySelector("[data-access-confirmation]"))return true;const select=document.querySelector("#access-panel-support [data-access-action=select-visible]"),remove=document.querySelector("#access-panel-support [data-access-action=remove-selected]");if(!select||!remove||select.disabled||remove.disabled||!select.getClientRects().length)throw Error("Ticket selection unavailable");select.click();remove.click();return true;})()');
   await execute(executePlan,id+'-keys','(()=>{const panel=document.querySelector("[data-access-confirmation]");if(!panel||!panel.getClientRects().length)throw Error("Confirmation unavailable");const switches=[...panel.querySelectorAll("md-switch")];if(switches.length!==2)throw Error("Confirmation keys missing");for(const item of switches){if(item.disabled)throw Error("Confirmation key disabled");item.selected=true;item.dispatchEvent(new Event("change",{bubbles:true,composed:true}));}const slider=panel.querySelector("md-slider");if(!slider||slider.disabled)throw Error("Confirmation slider unavailable");slider.value=100;slider.dispatchEvent(new Event("input",{bubbles:true,composed:true}));return true;})()');
   await execute(executePlan,id,click(actionSelector('confirm','[data-access-confirmation]')));
   await execute(executePlan,id+'-result','!document.querySelector("[data-access-confirmation]")',true);await observeProducer(context,state.id,id);
  }else throw Error('CAPABILITY_UNAVAILABLE: access action '+id);
  return {id,activated:true,observablePassed:true,activation:'dom-click-or-control-change',evidence:{observed:true,stateId:state.id,actionId:id,sourceCommit:binding.sourceCommit,planId:id+'-result'}};
 }
 return Object.fromEntries(entries.map(state=>[state.id,{
  async prepare(context){
   const producer=access();if(state.id==='access-once')capability('nativePicker');
   if(typeof prepareOwnedFixture!=='function')throw Error('CAPABILITY_UNAVAILABLE: prepareOwnedFixture');
   const native=await prepareOwnedFixture({...context,state:state.id,requiredDriveState:state.id.startsWith('create-')?'locked':'unchanged'});assert.equal(native.ownedSyntheticFixture,true);assert.equal(native.sourceCommit,context.binding.sourceCommit);
   const result=await producer.prepare({...context,state:state.id,phase:'prepare'});proof(result,context.binding);
   return {ownedSyntheticFixture:true,sourceCommit:context.binding.sourceCommit,productionApi:true};
  },
  async enter(context){
   const result=await access().prepare({...context,state:state.id,phase:'enter'});proof(result,context.binding);
  },
  async assertState(context){
   await execute(context.executePlan,state.id+'-visible',visible(state.selector),true);
   if(state.id.startsWith('access-'))await execute(context.executePlan,state.id+'-privacy',privacy,true);
   await observeProducer(context,state.id,'state');
   return {passed:true,observable:state.observable,evidence:{visible:true,privacySafe:true,productionState:true}};
  },
  actions:Object.fromEntries(state.actions.map(id=>[id,context=>perform(state,id,context)])),
  async restore(context){const result=await access().restore({...context,state:state.id});proof(result,context.binding);assert.equal(result.restored,true);return {restored:true,evidence:{ownedSyntheticFixture:true}};}
 }]));
}
