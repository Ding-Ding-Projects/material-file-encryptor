import assert from 'node:assert/strict';
import {withCdpConnectionProof} from './cdp-connection-plan.mjs';

export function ownedFixturePreparation({launch,receipt,fixture}){
 assert.ok(fixture.prepared===true);assert.ok(fixture.root&&fixture.storageDir&&fixture.cacheDir);assert.match(fixture.driveLetter,/^[D-Z]:$/);assert.notEqual(fixture.driveLetter,'M:');
 const plan=steps=>withCdpConnectionProof({version:1,receipt,endpoint:`http://127.0.0.1:${launch.cdp.port}`,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:30000,steps},'control');
 const observe=async executePlan=>{
  const response=await executePlan(plan([
   {id:'fixture-status-start',op:'evaluate',expression:"window.__guiAcceptanceStatus={done:false};window.drive.status().then(value=>{window.__guiAcceptanceStatus={done:true,value:{storageDir:value.storageDir,cacheDir:value.cacheDir,driveLetter:value.driveLetter,locked:value.locked,mounted:value.mounted,operation:value.operation}}},()=>{window.__guiAcceptanceStatus={done:true,failed:true}});true"},
   {id:'fixture-status-ready',op:'poll',expression:'window.__guiAcceptanceStatus.done',equals:true,intervalMs:100},
   {id:'fixture-status-read',op:'evaluate',expression:'window.__guiAcceptanceStatus'}
  ]));assert.equal(response.ok,true);const observed=response.results.at(-1).value;assert.equal(observed.done,true);assert.notEqual(observed.failed,true);
  for(const key of ['storageDir','cacheDir','driveLetter'])assert.equal(observed.value[key],fixture[key],'Native fixture identity changed');return observed.value;
 };
 return async({requiredDriveState,binding,executePlan})=>{
  const before=await observe(executePlan);
  // Close an earlier owned dialog through its ordinary cancel control. No DOM
  // replacement or direct dialog-state assignment is used for restoration.
  const cancel=await executePlan(plan([{id:'fixture-cancel-dialog',op:'evaluate',expression:"(()=>{const dialog=document.querySelector('#vault-dialog');if(dialog?.open){const cancel=document.querySelector('#dialog-cancel');if(!cancel||cancel.disabled)throw Error('Dialog cannot be cancelled');cancel.click();}return !dialog?.open;})()"}]));assert.equal(cancel.ok,true);
  if(requiredDriveState==='locked'&&!before.locked){
   const locked=await executePlan(plan([{id:'fixture-lock',op:'evaluate',expression:"(()=>{const button=document.querySelector('#lock-button');if(!button||button.disabled)throw Error('Owned drive cannot be locked');button.click();return true;})()"},{id:'fixture-lock-ready',op:'poll',expression:"document.querySelector('#vault-badge').dataset.state==='locked'",equals:true,intervalMs:100}]));assert.equal(locked.ok,true);
  }
  const after=await observe(executePlan);if(requiredDriveState==='locked'){assert.equal(after.locked,true);assert.equal(after.mounted,false);}assert.ok(after.operation==null,'Owned fixture still has an active operation');
  return {ownedSyntheticFixture:true,sourceCommit:binding.sourceCommit,fixtureRoot:fixture.root,before,after};
 };
}

// Native fixture ownership is established by the existing launch producer.
// This adapter never creates a replacement window.drive or edits renderer DOM.
export function baselineAdapters({launch,receipt,prepareOwnedFixture,inventory}){
 const plan=steps=>withCdpConnectionProof({version:1,receipt,endpoint:`http://127.0.0.1:${launch.cdp.port}`,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:30000,steps},'control');
 const check=async(executePlan,id,expression)=>{
  const result=await executePlan(plan([{id,op:'poll',expression,equals:true,intervalMs:100}]));
  assert.equal(result.ok,true);assert.equal(result.results?.at(-1)?.value,true);return result;
 };
 const click=(id,selector)=>({id,op:'click',selector});
 const action=(id,steps,expression)=>async({executePlan})=>{
  const result=await executePlan(plan(steps));assert.equal(result.ok,true);
  const observation=await check(executePlan,id+'-observable',expression);
  return {id,activated:true,observablePassed:true,activation:'cdp-click-or-control-change',result,observation};
 };
 const field=(id,selector,value)=>({id,op:'evaluate',expression:`(()=>{const field=document.querySelector(${JSON.stringify(selector)});if(!field||field.disabled||field.readOnly)throw Error('Editable field unavailable');field.value=${JSON.stringify(value)};field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`});
 const dialogOpen="document.querySelector('#vault-dialog').open",dialogClosed="!document.querySelector('#vault-dialog').open";
 const dialogActions={
  'open-create':action('open-create',[click('open-create','#create-button')],dialogOpen),
  'cancel-create':action('cancel-create',[click('cancel-create','#dialog-cancel')],dialogClosed),
  'open-unlock':action('open-unlock',[click('open-unlock','#unlock-button')],dialogOpen),
  'cancel-unlock':action('cancel-unlock',[click('cancel-unlock','#dialog-cancel')],dialogClosed)
 };
 const attentionToggle=(id,fieldId,attribute)=>async({executePlan})=>{
  const selector='#'+fieldId;
  const read=await executePlan(plan([{id:id+'-before',op:'evaluate',expression:`(()=>{const field=document.querySelector(${JSON.stringify(selector)});if(!field||field.disabled)throw Error('Attention control unavailable');return {checked:field.checked,root:document.documentElement.dataset[${JSON.stringify(attribute)}]};})()`}]));assert.equal(read.ok,true);
  const before=read.results.at(-1).value;assert.equal(before.root,String(before.checked));
  const first=await action(id,[click(id+'-toggle',selector)],`document.documentElement.dataset[${JSON.stringify(attribute)}]===${JSON.stringify(String(!before.checked))}`)({executePlan});
  const restored=await action(id,[click(id+'-restore',selector)],`document.documentElement.dataset[${JSON.stringify(attribute)}]===${JSON.stringify(String(before.checked))}`)({executePlan});
  return {...first,restoration:restored,before};
 };
 const make=(id,expression,actions)=>({
  prepare:async context=>{const result=await prepareOwnedFixture({...context,state:id,requiredDriveState:id==='drive-locked'||id.startsWith('create-')?'locked':'unchanged'});assert.equal(result.ownedSyntheticFixture,true);assert.equal(result.sourceCommit,context.binding.sourceCommit);return result;},
  assertState:async({executePlan})=>({passed:Boolean(await check(executePlan,id+'-state',expression)),observable:inventory.states.find(state=>state.id===id).observable}),actions
 });
 return {
  'p-attention':make('p-attention',"!document.querySelector('#view-personalization').hidden&&['local-ux-focus','local-ux-low-stimulation','local-ux-one-thing-at-a-time'].every(id=>document.getElementById(id)?.getClientRects().length>0)",{
   'toggle-focus':attentionToggle('toggle-focus','local-ux-focus','focusMode'),
   'toggle-low-stimulation':attentionToggle('toggle-low-stimulation','local-ux-low-stimulation','lowStimulation'),
   'toggle-one-thing':attentionToggle('toggle-one-thing','local-ux-one-thing-at-a-time','oneThing')
  }),
  'ollama-help':make('ollama-help',"!document.querySelector('#ollama-panel-5').hidden&&document.querySelector('#ollama-panel-5 p').textContent.trim().length>0",{
   'open-help':action('open-help',[click('leave-help','#ollama-panel-1-tab'),click('open-help','#ollama-panel-5-tab')],"!document.querySelector('#ollama-panel-5').hidden&&document.querySelector('#ollama-panel-5-tab').getAttribute('aria-selected')==='true'")
  }),
  'drive-locked':make('drive-locked',"!document.querySelector('#locked-state').hidden&&!document.querySelector('#create-button').disabled&&!document.querySelector('#unlock-button').disabled",dialogActions),
  'settings-default':make('settings-default',"!document.querySelector('#view-settings').hidden",{
   'change-theme':async context=>{const temporary=context.tuple.theme==='light'?'dark':'light';const change=action('change-theme',[field('change-theme','#theme-setting',temporary)],`document.documentElement.dataset.theme===${JSON.stringify(temporary)}`);return change(context);},
   'change-language':async context=>{const temporary=context.tuple.language==='en'?'yue':'en';return action('change-language',[field('change-language','#language-setting',temporary)],`document.querySelector('#language-setting').value===${JSON.stringify(temporary)}`)(context);}
  }),
  'create-password':make('create-password',dialogOpen+"&&document.querySelector('#password-input').type==='password'",{
   // Nonsecret path field deliberately avoids retaining credential input.
   'edit-field':action('edit-field',[field('edit-storage','#storage-input','Synthetic acceptance location')],"document.querySelector('#storage-input').value==='Synthetic acceptance location'"),
   'clear-field':action('clear-field',[click('clear-storage','#storage-input > md-icon-button[slot="trailing-icon"]')],"document.querySelector('#storage-input').value===''") ,
   'cancel-dialog':action('cancel-dialog',[click('cancel-dialog','#dialog-cancel')],dialogClosed)
  })
 };
}
