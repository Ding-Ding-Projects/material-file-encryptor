import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createModelReadinessObserver} from '../scripts/gui-acceptance-readiness.mjs';
import {acquireDiagnosticSubset} from '../scripts/gui-acceptance-acquire.mjs';
import {bindingFor,matrixFor} from '../scripts/gui-acceptance.mjs';

const sourceCommit='a'.repeat(40);
const settled={schemaVersion:1,state:'settled',initialization:'settled',inspection:'settled',pendingRequests:0,pendingOperations:0};
const context={binding:{sourceCommit},phase:'initial'};
function fixture(status){
 let closed=false,url='file:///owned/app.asar/src/renderer/index.html',reads=0,active=0,maximum=0,proofs=0;
 const opened={connectionOwned:true,backend:'native-v1',target:{sourceCommit,expectedUrl:url},receipt:{verifierSourceCommit:'b'.repeat(40)},nativeConnection:{route:'native-v1-connected-cdp',expectedUrl:url,prove(){proofs++;}},page:{isClosed:()=>closed,url:()=>url,evaluate:fn=>vm.runInNewContext(`(${fn.toString()})()`,{window:{drive:{async status(){reads++;active++;maximum=Math.max(maximum,active);try{return {modelStartupReadiness:await status(reads)};}finally{active--;}}}}})}};
 return {opened,get reads(){return reads;},get maximum(){return maximum;},get proofs(){return proofs;},setClosed:()=>{closed=true;},changeUrl:()=>{url='file:///unrelated';}};
}

test('initial readiness observes early-zero and pending work before actual settlement without native-proof claims',async()=>{
 const values=[{...settled,state:'not-started',initialization:'not-started',inspection:'not-started'},{...settled,state:'pending',inspection:'not-started'},{...settled,state:'pending',pendingRequests:1},settled];
 const f=fixture(index=>values[index-1]);const observe=createModelReadinessObserver({opened:f.opened,timeoutMs:1000,intervalMs:10});
 const result=await observe(context);assert.equal(result.settled,true);assert.equal(result.observations,4);assert.deepEqual(JSON.parse(JSON.stringify(result.last)),settled);
 assert.equal(result.nativeProof,false);assert.equal(f.maximum,1);assert.equal(f.proofs,0);assert.ok(Date.parse(result.endedAt)>=Date.parse(result.startedAt));
});

test('failed and unavailable startup status remain explicit failed observations',async()=>{
 for(const value of [{...settled,state:'failed',inspection:'failed'},undefined,{...settled,pendingRequests:null}]){
  const f=fixture(()=>value),observe=createModelReadinessObserver({opened:f.opened,timeoutMs:1000,intervalMs:10});
  await assert.rejects(observe(context),error=>{assert.equal(error.readinessEvidence.settled,false);assert.equal(error.readinessEvidence.nativeProof,false);assert.equal(error.readinessEvidence.observations,1);assert.ok(error.readinessEvidence.endedAt);return true;});
  assert.equal(f.reads,1);assert.equal(f.proofs,0);
 }
});

test('a hung status read hits its deadline and cannot overlap a later observation',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve;}),f=fixture(()=>pending);
 const observe=createModelReadinessObserver({opened:f.opened,timeoutMs:30,intervalMs:10});
 await assert.rejects(observe(context),error=>error.code==='READINESS_TIMEOUT'&&error.readinessEvidence.settled===false);
 await assert.rejects(observe(context),/cannot be reused/);assert.equal(f.reads,1);
 finish(settled);await Promise.resolve();assert.equal(f.reads,1);assert.equal(f.maximum,1);
});

test('changed URL or closed admitted target is rejected before and after every read',async()=>{
 for(const change of ['changeUrl','setClosed'])for(const when of ['before','during']){
  let f;f=fixture(()=>{if(when==='during')f[change]();return settled;});if(when==='before')f[change]();
  const observe=createModelReadinessObserver({opened:f.opened,timeoutMs:1000,intervalMs:10});
  await assert.rejects(observe(context),error=>error.code==='READINESS_TARGET_CHANGED'&&error.readinessEvidence.settled===false);
  assert.equal(f.reads,when==='before'?0:1);assert.equal(f.proofs,0);
 }
});

test('readiness cannot be selected for an unowned or non-native connection',()=>{
 for(const patch of [{connectionOwned:false},{backend:'cim'}]){const f=fixture(()=>settled);Object.assign(f.opened,patch);assert.throws(()=>createModelReadinessObserver({opened:f.opened}));}
 const f=fixture(()=>settled);f.opened.nativeConnection.expectedUrl='file:///other';assert.throws(()=>createModelReadinessObserver({opened:f.opened}));
});

test('acquisition prepares the fixture, awaits readiness, then activates setup proof and retains the wait separately',async t=>{
 const inventory=JSON.parse(await fs.readFile(new URL('../contracts/gui-states.json',import.meta.url)));
 const tuple=matrixFor(inventory)[0],state=inventory.states[0],binding=bindingFor({sourceCommit,executableSha256:'b'.repeat(64),resourceSha256:'c'.repeat(64),verifierSha256:'d'.repeat(64),referenceSha256:'e'.repeat(64),inventory});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-initial-readiness-order-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 let release,entered,proofs=0,prepared=0;const ready=new Promise(resolve=>{release=resolve;}),atWait=new Promise(resolve=>{entered=resolve;});
 const adapter={preflight:()=>({declared:true}),prepare:async()=>{prepared++;return{ownedSyntheticFixture:true,sourceCommit};},assertState:async()=>({passed:true,observable:state.observable,evidence:{synthetic:true}}),actions:Object.fromEntries(state.actions.map(id=>[id,async()=>({id,activated:true,observablePassed:true,evidence:{synthetic:true}})])),restore:async()=>({restored:true})};
 const run=acquireDiagnosticSubset({inventory,binding,tuples:[tuple],adapters:{[state.id]:adapter},launch:{cdp:{port:54321,expectedUrl:'file:///owned/app.html'}},receipt:path.join(root,'receipt.json'),outputRoot:root,createProbeEvidence:async()=>({observe(){},persist(){}}),beforeSetup:async value=>{assert.equal(prepared,1);assert.equal(value.phase,'initial');entered();await ready;return{settled:true,nativeProof:false,observations:2};},executePlan:async()=>{proofs++;throw Error('Synthetic stop after setup proof activation');}});
 await atWait;assert.equal(proofs,0);release();const result=await run;assert.equal(proofs,1);
 const record=JSON.parse(await fs.readFile(result.results[0].path));assert.deepEqual(record.readiness.initial,{settled:true,nativeProof:false,observations:2});assert.equal(record.status,'failed');assert.match(record.reason,/Synthetic stop/);
});

test('failed initial readiness prevents setup proof and retains its actual failed evidence',async t=>{
 const inventory=JSON.parse(await fs.readFile(new URL('../contracts/gui-states.json',import.meta.url))),tuple=matrixFor(inventory)[0],state=inventory.states[0];
 const binding=bindingFor({sourceCommit,executableSha256:'b'.repeat(64),resourceSha256:'c'.repeat(64),verifierSha256:'d'.repeat(64),referenceSha256:'e'.repeat(64),inventory});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-readiness-failed-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));let proofs=0;
 const evidence={settled:false,nativeProof:false,code:'READINESS_TIMEOUT',observations:1};
 const adapter={preflight:()=>({declared:true}),prepare:async()=>({ownedSyntheticFixture:true,sourceCommit}),assertState:async()=>{},actions:Object.fromEntries(state.actions.map(id=>[id,async()=>{}])),restore:async()=>({restored:true})};
 const result=await acquireDiagnosticSubset({inventory,binding,tuples:[tuple],adapters:{[state.id]:adapter},launch:{cdp:{port:54321,expectedUrl:'file:///owned/app.html'}},receipt:path.join(root,'receipt.json'),outputRoot:root,createProbeEvidence:async()=>({observe(){},persist(){}}),beforeSetup:async()=>{throw Object.assign(Error('Observed deadline'),{readinessEvidence:evidence});},executePlan:async()=>{proofs++;}});
 assert.equal(proofs,0);const record=JSON.parse(await fs.readFile(result.results[0].path));assert.deepEqual(record.readiness.initial,evidence);assert.equal(record.status,'failed');
});

test('restored fixture readiness also settles before the second setup proof',async t=>{
 const inventory=JSON.parse(await fs.readFile(new URL('../contracts/gui-states.json',import.meta.url))),tuple=matrixFor(inventory)[0],state=inventory.states[0];
 const binding=bindingFor({sourceCommit,executableSha256:'b'.repeat(64),resourceSha256:'c'.repeat(64),verifierSha256:'d'.repeat(64),referenceSha256:'e'.repeat(64),inventory});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-restored-readiness-order-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 let release,entered,proofs=0,preparations=0;const restored=new Promise(resolve=>{release=resolve;}),atWait=new Promise(resolve=>{entered=resolve;});
 const adapter={preflight:()=>({declared:true}),prepare:async()=>{preparations++;return{ownedSyntheticFixture:true,sourceCommit};},assertState:async()=>({passed:true,observable:state.observable,evidence:{synthetic:true}}),actions:Object.fromEntries(state.actions.map(id=>[id,async()=>({id,activated:true,observablePassed:true,evidence:{synthetic:true}})])),restore:async()=>({restored:true})};
 const run=acquireDiagnosticSubset({inventory,binding,tuples:[tuple],adapters:{[state.id]:adapter},launch:{cdp:{port:54321,expectedUrl:'file:///owned/app.html'}},receipt:path.join(root,'receipt.json'),outputRoot:root,createProbeEvidence:async()=>({observe(){},persist(){}}),beforeSetup:async({phase})=>{if(phase==='restored'){assert.equal(preparations,2);entered();await restored;}return{settled:true,nativeProof:false,phase};},executePlan:async()=>{proofs++;if(proofs===2)throw Error('Synthetic stop after restored proof activation');return{ok:true};}});
 await atWait;assert.equal(proofs,1);release();const result=await run;assert.equal(proofs,2);
 const record=JSON.parse(await fs.readFile(result.results[0].path));assert.equal(record.readiness.initial.phase,'initial');assert.equal(record.readiness.restored.phase,'restored');assert.equal(record.readiness.restored.settled,true);
});
