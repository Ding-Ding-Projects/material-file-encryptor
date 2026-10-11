import assert from 'node:assert/strict';
import {withCdpConnectionProof} from './cdp-connection-plan.mjs';

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
 const make=(id,expression,actions)=>({
  prepare:async context=>{const result=await prepareOwnedFixture({...context,state:id,requiredDriveState:id==='drive-locked'||id.startsWith('create-')?'locked':'unchanged'});assert.equal(result.ownedSyntheticFixture,true);assert.equal(result.sourceCommit,context.binding.sourceCommit);return result;},
  assertState:async({executePlan})=>({passed:Boolean(await check(executePlan,id+'-state',expression)),observable:inventory.states.find(state=>state.id===id).observable}),actions
 });
 return {
  'drive-locked':make('drive-locked',"!document.querySelector('#locked-state').hidden&&!document.querySelector('#create-button').disabled&&!document.querySelector('#unlock-button').disabled",dialogActions),
  'settings-default':make('settings-default',"!document.querySelector('#view-settings').hidden",{
   'change-theme':async context=>{const temporary=context.tuple.theme==='light'?'dark':'light';const change=action('change-theme',[field('change-theme','#theme-setting',temporary)],`document.documentElement.dataset.theme===${JSON.stringify(temporary)}`);return change(context);},
   'change-language':async context=>{const temporary=context.tuple.language==='en'?'yue':'en';return action('change-language',[field('change-language','#language-setting',temporary)],`document.querySelector('#language-setting').value===${JSON.stringify(temporary)}`)(context);}
  }),
  'create-password':make('create-password',dialogOpen+"&&document.querySelector('#password-input').type==='password'",{
   // Nonsecret path field deliberately avoids retaining credential input.
   'edit-field':action('edit-field',[field('edit-storage','#storage-input','Synthetic acceptance location')],"document.querySelector('#storage-input').value==='Synthetic acceptance location'"),
   'clear-field':action('clear-field',[click('clear-storage','.clearable-field:has(#storage-input) > .field-clear')],"document.querySelector('#storage-input').value===''") ,
   'cancel-dialog':action('cancel-dialog',[click('cancel-dialog','#dialog-cancel')],dialogClosed)
  })
 };
}
