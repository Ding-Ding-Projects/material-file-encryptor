import test from 'node:test';
import assert from 'node:assert/strict';
import {NESTED_APPEARANCE_GUIDANCE,nestedAppearanceGuidance,invokeNestedAppearanceControl} from '../src/shared/local-ux/nested-appearance-guidance.js';
import {assertGuidanceCoverage,createGuidanceSession} from '../src/shared/surface/control-guidance.js';

// This independently authored list is intentionally narrower than editor coverage.
const REQUIRED=['select-state','select-layer','toggle-visible','toggle-locked','open-group','parent-group','logo-file','logo-fit','logo-x','logo-y','logo-reset'];
test('explicit nested inventory has unique bilingual explanations and typed defaults',()=>{
 assert.deepEqual(NESTED_APPEARANCE_GUIDANCE.map(row=>row.key),REQUIRED);
 for(const language of ['en','yue']){
  const rows=REQUIRED.map(key=>nestedAppearanceGuidance(key,{language}));assertGuidanceCoverage(rows,rows);
  assert.throws(()=>assertGuidanceCoverage(rows,rows.slice(1)),/Missing guidance/);
  for(const row of rows){assert.equal(row.sourceId,'docs/features/interface/nested-appearance-guidance.md');assert.match(row.help,new RegExp('#'+row.concept+'$'));assert.notEqual(row.options,row.validation);}
 }
 assert.equal(nestedAppearanceGuidance('logo-x').defaultValue,.5);
 assert.equal(nestedAppearanceGuidance('toggle-visible').defaultValue,true);
 assert.equal(nestedAppearanceGuidance('logo-file').defaultValue,null);
 assert.throws(()=>nestedAppearanceGuidance('unregistered'),/Unregistered/);
 const context={get value(){throw Error('Secret value read');}};assert.doesNotThrow(()=>nestedAppearanceGuidance('logo-file',context));
 assert.notEqual(nestedAppearanceGuidance('select-layer',{instance:'first'}).id,nestedAppearanceGuidance('select-layer',{instance:'second'}).id);
});

test('guided execution admits only the original event consumer and awaits its validation',async()=>{
 const target=new EventTarget();target.isConnected=true;let flight=null,writes=0,release;
 target.addEventListener('change',event=>{if(event.defaultPrevented)return;flight=new Promise(resolve=>release=()=>{writes++;resolve('stored');});});
 const adapter={eventType:'change',resetFlight:()=>flight=null,getFlight:()=>flight};
 const session=createGuidanceSession({steps:['Review focal point'],run:()=>invokeNestedAppearanceControl(target,adapter)});
 const operation=session.next();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(writes,0);assert.equal(session.state,'running');release();await operation;assert.equal(writes,1);assert.equal(session.state,'finished');
 const blocked=new EventTarget();blocked.addEventListener('click',event=>event.preventDefault());
 await assert.rejects(invokeNestedAppearanceControl(blocked,{resetFlight:()=>flight=null,getFlight:()=>flight}),/did not admit/);assert.equal(writes,1);
 target.disabled=true;await assert.rejects(invokeNestedAppearanceControl(target,adapter),/unavailable/);target.disabled=false;
 target.readOnly=true;await assert.rejects(invokeNestedAppearanceControl(target,adapter),/unavailable/);target.readOnly=false;
 target.isConnected=false;await assert.rejects(invokeNestedAppearanceControl(target,adapter),/unavailable/);
 await assert.rejects(invokeNestedAppearanceControl(new EventTarget()),/admission adapter/);
 for(const invalidFlight of [{pending:true},'pending',true]){
  const noConsumer=new EventTarget();
  await assert.rejects(invokeNestedAppearanceControl(noConsumer,{resetFlight(){},getFlight:()=>invalidFlight}),/did not admit/);
 }
 const invalid=new EventTarget();invalid.addEventListener('change',()=>{flight=Promise.reject(Error('Original validator rejected draft'));});
 await assert.rejects(invokeNestedAppearanceControl(invalid,adapter),/Original validator rejected draft/);assert.equal(writes,1);
});
