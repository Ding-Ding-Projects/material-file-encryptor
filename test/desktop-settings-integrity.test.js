import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopSettingsIntegrity} from '../src/shared/local-ux/settings-integrity.js';
import {createPrivateHistory} from '../src/shared/local-ux/history.js';
const storage=()=>{const rows=new Map();return{getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,String(value))};};
const capabilities={verifyCredential:async value=>value==='synthetic',setCredential:async()=>true,writeSharedMode:async()=>true};
test('injected desktop store records actual settings consumers once into the same encrypted history manager',async()=>{
 const disk=storage(),manager=createPrivateHistory({storage:disk});await manager.setup('synthetic independent history');let authenticated=true;
 const integrity=createDesktopSettingsIntegrity({storage:disk,isAuthenticated:()=>authenticated,...capabilities});integrity.connectHistory(manager);
 integrity.store.update({theme:'dark'},'theme changed');await integrity.flushHistory();assert.equal((await manager.list()).length,1);
 integrity.store.update({theme:'dark'},'theme changed');await integrity.flushHistory();assert.equal((await manager.list()).length,1);
 authenticated=false;integrity.store.update({density:'compact'});await integrity.flushHistory();assert.equal((await manager.list()).length,1);
 authenticated=true;manager.lock();integrity.store.update({fontScale:1.25});await integrity.flushHistory();await manager.unlock('synthetic independent history');assert.equal((await manager.list()).length,1);
 integrity.destroy();manager.destroy();
});
test('import, reset and actual encrypted restore cannot change protected mode before privileged verification and write',async()=>{
 const disk=storage(),manager=createPrivateHistory({storage:disk});await manager.setup('synthetic history');const integrity=createDesktopSettingsIntegrity({storage:disk,isAuthenticated:()=>true,...capabilities});integrity.connectHistory(manager);
 integrity.store.update({theme:'dark'},'base');await integrity.flushHistory();const baseline=(await manager.list())[0].id;
 const enabled={enabled:true,name:'Presentation'};
 assert.throws(()=>integrity.store.update({school:enabled},'settings imported'),/Verify/);
 await assert.rejects(integrity.writeSchool(enabled),/Verify/);
 await integrity.setSharedCredential('synthetic');await integrity.writeSchool(enabled);integrity.store.update({school:enabled});await integrity.flushHistory();
 assert.throws(()=>integrity.store.reset(),/Verify/);assert.throws(()=>integrity.store.update({school:{enabled:true,name:'Renamed'}}),/Verify/);
 await assert.rejects(manager.restore(baseline,snapshot=>integrity.store.update(snapshot,'settings restored')),/Verify/);
 assert.equal(integrity.store.get().school.enabled,true);assert.equal((await manager.list()).length,2);
 assert.equal(await integrity.verifySharedCredential('wrong'),false);await assert.rejects(integrity.writeSchool({enabled:false,name:'Presentation'}),/Verify/);
 assert.equal(await integrity.verifySharedCredential('synthetic'),true);await integrity.writeSchool({enabled:false,name:'Presentation'});integrity.store.update({school:{enabled:false,name:'Presentation'}});assert.equal(integrity.store.get().school.enabled,false);
 assert.throws(()=>integrity.store.update({school:enabled}),/Verify/);await integrity.flushHistory();integrity.destroy();manager.destroy();
});
test('failed privileged write cannot authorize renderer transition and trusted host synchronization stays distinct from imports',async()=>{
 const integrity=createDesktopSettingsIntegrity({storage:storage(),...capabilities,writeSharedMode:async()=>{throw Error('host unavailable');}});const enabled={enabled:true,name:'Presentation'};
 await integrity.setSharedCredential('synthetic');await assert.rejects(integrity.writeSchool(enabled),/host unavailable/);assert.throws(()=>integrity.store.update({school:enabled}),/Verify/);
 integrity.store.update({school:integrity.fromHost(enabled)},'shared mode synchronized');assert.equal(integrity.store.get().school.enabled,true);assert.throws(()=>integrity.store.reset(),/Verify/);integrity.fromHost({enabled:false,name:'Presentation'});integrity.store.update({theme:'dark'});assert.throws(()=>integrity.store.update({school:{enabled:false,name:'Presentation'}}),/Verify/);integrity.destroy();
});


test('approval helper never reports operation completion and lifetime cancels history mutation on auth loss or cached navigation',async()=>{
 const previous={HTMLElement:globalThis.HTMLElement,document:globalThis.document};
 class Node{constructor(){this.children=[];this.listeners={};this.selected=false;this.value=0;}append(...nodes){this.children.push(...nodes);}setAttribute(){}addEventListener(name,fn){this.listeners[name]=fn;}show(){}remove(){this.removed=true;}}
 const doc={activeElement:{focus(){}},createElement:()=>new Node(),addEventListener(name,fn){this[name]=fn;},removeEventListener(name){delete this[name];}};
 globalThis.HTMLElement=class{};globalThis.document=doc;
 try{
  const {requestSuperConfirmation}=await import('../src/shared/surface/workflow-confirm.js');
  const {createSettingsConfirmationLifetime}=await import('../src/shared/local-ux/settings-integrity.js');
  for(const cancellation of ['emergency','auth','pagehide','during-prune']){
   const disk=storage(),manager=createPrivateHistory({storage:disk});await manager.setup('synthetic history');await manager.append('retained',{theme:'dark'});
   let authenticated=true;const target=new EventTarget(),lifetime=createSettingsConfirmationLifetime({target,isAuthenticated:()=>authenticated,isHistoryUnlocked:()=>manager.unlocked});
   const signal=lifetime.signal,validate=()=>lifetime.validate(signal,{history:true}),host=new Node();host.ownerDocument=doc;
   let runs=0;const approval=requestSuperConfirmation(host,{action:'Prune',affected:'expired entries',signal,confirmationOnly:true,validateConfirmation:validate,run:()=>{runs++;}});
   const dialog=host.children[0],content=dialog.children[1],first=content.children[2],second=content.children[3],slider=content.children[4],status=content.children[5],execute=dialog.children[3],cancel=dialog.children[2];
   first.selected=true;second.selected=true;first.listeners.change();slider.value=100;slider.listeners.input();
   if(cancellation==='emergency')cancel.listeners.click();
   await execute.listeners.click();
   assert.notEqual(status.textContent,'Operation completed.');assert.equal(runs,0);
   const before=disk.getItem('material-file-encryptor.private-history.v1');
   if(cancellation==='auth'){authenticated=false;lifetime.cancel();manager.lock();}
   if(cancellation==='pagehide')target.dispatchEvent(new Event('pagehide'));
   const consume=async()=>{const result=await approval;if(!result.confirmed)return;validate();await manager.prune({confirmed:true,signal,validate});};
   if(cancellation==='during-prune'){const pending=consume();await Promise.resolve();await Promise.resolve();target.dispatchEvent(new Event('pagehide'));await assert.rejects(pending,/cancelled|Unlock/);}
   else if(cancellation==='emergency')await consume();
   else await assert.rejects(consume(),/Unlock/);
   assert.equal(disk.getItem('material-file-encryptor.private-history.v1'),before);lifetime.destroy();manager.destroy();
  }
 }finally{for(const[key,value]of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
