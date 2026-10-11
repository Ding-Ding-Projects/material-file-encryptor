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

