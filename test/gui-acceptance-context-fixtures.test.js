import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createContextFoundationFixture} from '../scripts/gui-acceptance-context-fixtures.mjs';
import {createFoundationAdapters} from '../scripts/gui-acceptance-foundation.mjs';
import {createMountedFoundationFixtures} from '../scripts/gui-acceptance-native-files.mjs';
import './gui-acceptance-native-files.test.js';

const sourceCommit='a'.repeat(40),context={binding:{sourceCommit}};
function fixture({wrongTarget=false,renders=1,wrongFocus=false,startupReady=true,activationKey='Enter'}={}){
 const calls=[];let menu=false,editor=false,selected=[],focus='b',size={width:1180,height:850};
 const page={
  keyboard:{async press(key){calls.push(key);if(key==='Enter'||key==='Space'){menu=false;editor=true;}if(key==='Escape'){menu=false;editor=false;}}},
  locator(selector){return {async click(options){if(selector==='mfe-context-menu mfe-search md-outlined-text-field')throw Error('Strict locator: four search fields including hidden builder controls');calls.push({selector,...options});if(options?.button==='right')menu=true;else if(selector.includes('data-file-id'))selected=['a'];}};},
  async waitForFunction(){},
  async setViewportSize(value){calls.push({resize:value});size=value;menu=false;},
  async evaluate(fn){const text=String(fn);
   if(fn.name==='observeContextStartupReadiness')return startupReady;
   if(text.includes('focusRow'))return {count:menu?1:0,targetId:menu?(wrongTarget?'foreign':'b'):null,selectedIds:selected,focusConnected:true,focusFileId:wrongFocus?'a':focus};
   if(text.includes('index:nodes.filter'))return {index:0,label:'Select Acceptance B.txt',query:''};
   if(text.includes('width:innerWidth'))return size;
   if(text.includes('requestAnimationFrame'))return;
   if(text.includes('contains(document.activeElement)'))return editor;
   if(text.includes("querySelectorAll('mfe-context-menu')"))return menu||editor;
   if(text.includes("querySelectorAll('.appearance-editor')"))return editor;
   throw Error('Unexpected observation: '+text);
  },
  async evaluateHandle(){return {async evaluate(){return {renders,headings:['Appearance: Select Acceptance B.txt']};},async dispose(){calls.push('disposed');}};}
 };
 const owned={opened:{page,target:{sourceCommit}},prepare:async()=>{calls.push('native-prepare');return {ownedSyntheticFixture:true,sourceCommit};},restore:async()=>{calls.push('native-restore');return{restored:true};},identity:async c=>assert.equal(c.binding.sourceCommit,sourceCommit),list:async()=>({more:false,rows:[{id:'a',path:'Acceptance A.txt'},{id:'b',path:'Acceptance B.txt'}]}),removeTarget:async(c,id)=>{assert.equal(id,'b');menu=false;calls.push('native-remove-b');return {removedId:id,remainingId:'a'};}};
 return {producer:createContextFoundationFixture({...owned,activationKey}),calls,page,removeRow(){menu=false;}};
}
test('context fixture uses actual input interface and retains distinct target, one render and focus evidence',async()=>{
 const {producer,calls}=fixture();await producer.prepare(context);
 const opened=await producer['open-context'](context);assert.equal(opened.selectedId,'a');assert.equal(opened.capturedTargetId,'b');
 const proof=await producer['select-action'](context);assert.equal(proof.effect.count,1);assert.equal(proof.focusRestored,true);
 assert.ok(calls.some(call=>call.button==='right'));assert.ok(calls.includes('ArrowDown'));assert.ok(calls.includes('Enter'));assert.ok(calls.includes('disposed'));
 await producer['open-context'](context);const resize=await producer.resize(context);assert.equal(resize.physicalDpiVerified,false);assert.deepEqual(resize.viewportRestored,{width:1180,height:850});
 await producer['open-context'](context);const removed=await producer['target-removal'](context);assert.equal(removed.removal.removedId,'b');assert.ok(calls.includes('native-remove-b'));
 await producer.restore(context);
});
test('wrong captured identity, duplicate editor render and wrong restoration focus cannot produce proof',async()=>{
 const wrong=fixture({wrongTarget:true});await assert.rejects(wrong.producer['open-context'](context));
 const duplicate=fixture({renders:2});await duplicate.producer['open-context'](context);await assert.rejects(duplicate.producer['select-action'](context),/exactly one/);assert.ok(duplicate.calls.includes('disposed'));
 const focus=fixture({wrongFocus:true});await focus.producer['open-context'](context);await assert.rejects(focus.producer.resize(context),/restore target focus/);
});
test('source identity is checked before pointer input',async()=>{
 const {producer,calls}=fixture();await assert.rejects(producer['open-context']({binding:{sourceCommit:'b'.repeat(40)}}));assert.equal(calls.length,0);
});
test('foundation consumer requires complete action evidence when native fixture requests it',async()=>{
 const inventory=JSON.parse(await fs.readFile(new URL('../contracts/gui-states.json',import.meta.url),'utf8'));
 const native={requireActionProof:true};
 const adapters=createFoundationAdapters({launch:{cdp:{port:12345,expectedUrl:'file:///fixture'}},receipt:'fixture',inventory,prepareOwnedFixture:async()=>{},fixtures:{foundation:{'drive-overflow':native}}});
 const action=adapters['drive-overflow'].actions['select-action'];
 await assert.rejects(action(context),/CAPABILITY_UNAVAILABLE/);
 native['select-action']=async()=>({ownedSyntheticFixture:true,sourceCommit,activated:true,activation:'cdp-key',capturedTargetId:'b',selectedId:'a',effect:{kind:'appearance-editor-render',count:2,targetMatches:true},focusInEditor:true,focusRestored:true});
 await assert.rejects(action(context));
 const original=native['select-action'];native['select-action']=async()=>({...await original(),effect:{kind:'appearance-editor-render',count:1,targetMatches:true}});
 const accepted=await action(context);assert.equal(accepted.observablePassed,true);assert.equal(accepted.evidence.capturedTargetId,'b');
});
test('mounted context removal verifies owned bytes and recreates only its deliberate deletion',async()=>{
 const fake=fixture(),data=new Map(),base=fake.page.evaluate;
 const state={driveLetter:'N:',storageDir:'owned',cacheDir:'cache',locked:false,mounted:true,operation:null};
 const paths=['N:\\Acceptance A.txt','N:\\Acceptance B.txt'];
 fake.page.url=()=> 'file:///owned';
 fake.page.evaluate=async fn=>{const text=String(fn);if(text.includes('window.drive.listFiles'))return {more:false,rows:paths.filter(p=>data.has(p)).map(p=>({id:p===paths[0]?'a':'b',path:p.slice(3)}))};if(text.includes('window.drive.sync'))return {done:true};if(text.includes('window.drive.status'))return state;return base(fn);};
 const io={async writeFile(p,text,options){assert.equal(options.flag,'wx');assert.equal(data.has(p),false);data.set(p,text);},async readFile(p){assert.ok(data.has(p));return Buffer.from(data.get(p));},async unlink(p){assert.equal(data.delete(p),true);fake.removeRow();}};
 const opened={connectionOwned:true,fixture:state,page:fake.page,target:{kind:'extracted-packaged-runtime',sourceCommit,expectedUrl:'file:///owned'}};
 const producer=createMountedFoundationFixtures({opened,io})['drive-overflow'];
 await producer.prepare(context);await producer['open-context'](context);
 data.set(paths[1],'Changed externally');await assert.rejects(producer['target-removal'](context),/bytes changed/);assert.equal(data.size,2);
 data.set(paths[1],'Synthetic beta.\n');await producer['target-removal'](context);assert.equal(data.has(paths[1]),false);
 data.set('N:\\foreign.txt','untouched');
 // The native list independently exposes unexpected files before another write.
 const prior=fake.page.evaluate;fake.page.evaluate=async fn=>String(fn).includes('window.drive.listFiles')?{more:false,rows:[{id:'a',path:'Acceptance A.txt'},{id:'x',path:'foreign.txt'}]}:prior(fn);
 await assert.rejects(producer.prepare(context),/Unexpected files/);assert.equal(data.has(paths[1]),false);data.delete('N:\\foreign.txt');fake.page.evaluate=prior;
 await producer.prepare(context);assert.equal(data.get(paths[1]),'Synthetic beta.\n');await producer.restore(context);assert.equal(data.size,0);
});
test('restoration attempts viewport and native cleanup even when dismissal and viewport fail',async()=>{
 const fake=fixture({wrongFocus:true});let nativeCalls=0,viewportCalls=0;
 const producer=createContextFoundationFixture({opened:{page:fake.page,target:{sourceCommit}},identity:async c=>assert.equal(c.binding.sourceCommit,sourceCommit),prepare:async()=>{},restore:async()=>{nativeCalls++;return {restored:true};},list:async()=>({more:false,rows:[{id:'a',path:'Acceptance A.txt'},{id:'b',path:'Acceptance B.txt'}]}),removeTarget:async()=>{}});
 await producer['open-context'](context);await assert.rejects(producer.resize(context),/restore target focus/);
 fake.page.evaluate=async()=>{throw Error('Dismissal observation unavailable');};
 fake.page.setViewportSize=async()=>{viewportCalls++;throw Error('Viewport restoration unavailable');};
 let result;try{await producer.restore(context);}catch(error){result=error;}
 assert.equal(nativeCalls,1,'Native restoration must still run');assert.equal(viewportCalls,1,'Viewport restoration must still run');
 assert.ok(result instanceof AggregateError);assert.equal(result.errors.length,2);
});
test('restoration retains all failures and does not mutate after identity rejection',async()=>{
 const fake=fixture();let nativeCalls=0;
 const producer=createContextFoundationFixture({opened:{page:fake.page,target:{sourceCommit}},identity:async c=>assert.equal(c.binding.sourceCommit,sourceCommit),restore:async()=>{nativeCalls++;throw Error('Native ownership changed');}});
 fake.page.evaluate=async()=>{throw Error('Dismissal unavailable');};
 await assert.rejects(producer.restore(context),error=>error instanceof AggregateError&&error.errors.length===2);assert.equal(nativeCalls,1);
 await assert.rejects(producer.restore({binding:{sourceCommit:'foreign'}}));assert.equal(nativeCalls,1);
});
test('native context action retains bounded route and removal receipts beside the final observable',async()=>{
 const inventory=JSON.parse(await fs.readFile(new URL('../contracts/gui-states.json',import.meta.url),'utf8'));
 const observation={count:0,targetId:null,selectedIds:['a'],focusConnected:true,focusFileId:'b'};
 const common={ownedSyntheticFixture:true,sourceCommit,activated:true,activation:'production-api',capturedTargetId:'b',observation};
 const native={requireActionProof:true,'open-context':async()=>({ownedSyntheticFixture:true,sourceCommit}),resize:async()=>({...common,inputRoute:'browser-viewport-resize',physicalDpiVerified:false,viewportRestored:{width:1180,height:850}}),'target-removal':async()=>({...common,inputRoute:'owned-native-filesystem',removal:{removedId:'b',remainingId:'a'}})};
 const actions=createFoundationAdapters({launch:{cdp:{port:12345,expectedUrl:'file:///fixture'}},receipt:'fixture',inventory,fixtures:{foundation:{'drive-overflow':native}}})['drive-overflow'].actions;
 const c={...context,executePlan:async plan=>({ok:true,results:plan.steps.map(step=>({id:step.id,value:true}))})};
 const resized=JSON.parse(JSON.stringify(await actions.resize(c)));
 assert.equal(resized.evidence.passed,true);assert.equal(resized.evidence.providerReceipt.physicalDpiVerified,false);assert.equal(resized.evidence.providerReceipt.inputRoute,'browser-viewport-resize');assert.deepEqual(resized.evidence.providerReceipt.viewportRestored,{width:1180,height:850});
 const removed=await actions['target-removal'](c);assert.deepEqual(removed.evidence.providerReceipt.removal,{removedId:'b',remainingId:'a'});assert.equal(removed.evidence.providerReceipt.observation.count,0);
 native.resize=async()=>common;await assert.rejects(actions.resize(c),/receipt/);
 native.requireActionProof=false;const legacy=await actions.resize(c);assert.equal(Object.hasOwn(legacy.evidence,'providerReceipt'),false);
 native.resize=async()=>({...common,inputRoute:'browser-viewport-resize',physicalDpiVerified:false,capturedTargetId:'x'.repeat(300),viewportRestored:{width:1180,height:850}});await assert.rejects(actions.resize(c),/receipt/);
});

test('Space uses the same owned target and render proof, and unknown keys fail before input',async()=>{
 const {producer,calls}=fixture({activationKey:'Space'});await producer.prepare(context);await producer['open-context'](context);
 const proof=await producer['select-action'](context);assert.equal(proof.activationKey,'Space');assert.equal(proof.effect.count,1);assert.equal(proof.focusInEditor,true);assert.equal(proof.focusRestored,true);assert.ok(calls.includes('Space'));assert.equal(calls.includes('Enter'),false);
 await producer.restore(context);assert.throws(()=>fixture({activationKey:'Escape'}),/Unsupported context activation key/);
});

test('unready registered startup controls stop context preparation before native files',async()=>{
 const {producer,calls}=fixture({startupReady:false});await assert.rejects(producer.prepare(context),/startup select and appearance readiness/);assert.equal(calls.includes('native-prepare'),false);
});

test('retained editor route is explicit and never claims focus was restored',async()=>{
 const {producer,calls}=fixture();await producer.prepare(context);await producer['open-context'](context);const proof=await producer['open-editor'](context);assert.equal(proof.editorRetained,true);assert.equal(proof.focusInEditor,true);assert.equal(Object.hasOwn(proof,'focusRestored'),false);await producer.restore(context);
});

test('unproved pre-fill ownership retains native synthetic files during outer restoration',async()=>{
 const f=fixture(),evaluate=f.page.evaluate,locator=f.page.locator;let observations=0;
 f.page.locator=selector=>({...locator(selector),evaluate:async()=>true});
 f.page.evaluate=async fn=>{
  if(fn.name==='observeContextAppearance'){
   observations++;const changed=observations>1;
   return{targetId:'b',appearanceId:changed?'target':null,connected:true,opacity:1,editorOpen:changed,fieldValue:'1',fieldDisabled:false,state:changed?{elements:{target:{color:'#abcdef'}}}:null,journal:changed?[{id:'r1'}]:[]};
  }
  return evaluate(fn);
 };
 await f.producer.prepare(context);await assert.rejects(f.producer['verify-persistence'](context));assert.equal(observations,3);
 await assert.rejects(f.producer.restore(context));assert.equal(f.calls.includes('native-restore'),false);
});
