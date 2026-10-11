import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRecordsAdapters,RECORD_STATE_IDS} from '../scripts/gui-acceptance-records.mjs';

// Source-only fixtures for adapter rejection paths. These tests are never
// packaged runtime, native writer, picker, mounted-volume or screenshot proof.
const actions={
 'storage-busy':['refresh-diagnostics'],'storage-running':['cancel-packing','observe-cancelling'],
 'storage-unavailable':['retry-diagnostics'],'storage-invalid-size':['submit-invalid-size'],
 'storage-paused':['resume-packing','verify-pause-cleared'],
 'file-details-versions':['filter-versions','label-version','restore-version'],
 'file-details-preview':['open-preview','close-preview']
};
const inventory={states:RECORD_STATE_IDS.map(id=>({id,observable:'Exact '+id,actions:actions[id]}))};
const binding={sourceCommit:'a'.repeat(40)},identity={storageDir:'synthetic-storage',cacheDir:'synthetic-cache',driveLetter:'Z:',locked:false};
const owned={ownedSyntheticFixture:true,sourceCommit:binding.sourceCommit,after:identity};
function setup(overrides={}){
 let prepared=0,produced=0;const plans=[];
 const observed={identity:{...identity},diagnostics:{pendingPackingFiles:2,activeWriters:1,packingPaused:false,targetPartSizeBytes:83886080},operations:[{operationId:'synthetic-op',state:'completed',kind:'packing'}],versions:[]};
 const rendered={counts:['target','current','history','temporary','2','1'],message:'Packing waits for active writers to release their files.',primaryDisabled:false,operationCount:1};
 const executePlan=async plan=>{plans.push(plan);const step=plan.steps[0];let value=true;if(step.id.endsWith('-read'))value={done:true,value:structuredClone(observed)};else if(step.id.startsWith('records-ui-'))value=structuredClone(rendered);else if(step.id.includes('refresh')&&!step.id.endsWith('admission')&&!step.id.endsWith('settled'))value={activation:'dom-click'};return{ok:true,results:[{id:step.id,value}]};};
 const fixtures={records:{supportedStates:[...RECORD_STATE_IDS],prepareNativeState:async()=>{produced++;return{ownedSyntheticFixture:true,sourceCommit:binding.sourceCommit};},restoreNativeState:async()=>({restored:true})}};
 const options={launch:{cdp:{port:9223,expectedUrl:'file:///synthetic/index.html'}},receipt:'C:/synthetic/receipt.json',inventory,prepareOwnedFixture:async()=>{prepared++;return structuredClone(owned);},fixtures,...overrides};
 return{adapters:createRecordsAdapters(options),context:{tuple:{state:'storage-busy',language:'en'},binding,executePlan},observed,rendered,plans,fixtures,counts:()=>({prepared,produced})};
}
test('source-only: all seven adapters retain every exact action and require native capability before any preparation',async()=>{
 const s=setup({fixtures:{}});assert.deepEqual(Object.keys(s.adapters),RECORD_STATE_IDS);
 for(const id of RECORD_STATE_IDS){assert.deepEqual(Object.keys(s.adapters[id].actions),actions[id]);await assert.rejects(s.adapters[id].prepare({...s.context,tuple:{state:id}}),new RegExp('CAPABILITY_UNAVAILABLE: records.native-state.'+id));}
 assert.deepEqual(s.counts(),{prepared:0,produced:0});assert.equal(s.plans.length,0);
});
test('source-only: restore confirmation and native text capability are required before mutating a versions fixture',async()=>{
 const s=setup();await assert.rejects(s.adapters['file-details-versions'].prepare(s.context),/CAPABILITY_UNAVAILABLE: records.completeRestoreConfirmation/);assert.deepEqual(s.counts(),{prepared:0,produced:0});
});
test('source-only: wrong source and forbidden drive stop before native producer work',async()=>{
 for(const invalid of [{...owned,sourceCommit:'b'.repeat(40)},{...owned,after:{...identity,driveLetter:'M:'}}]){const s=setup({prepareOwnedFixture:async()=>invalid});await assert.rejects(s.adapters['storage-busy'].prepare(s.context));assert.equal(s.counts().produced,0);assert.equal(s.plans.length,0);}
});
test('source-only: native identity mismatch and missing driver result cannot be accepted',async()=>{
 const s=setup();s.observed.identity.storageDir='different';await assert.rejects(s.adapters['storage-busy'].prepare(s.context),/Owned native identity changed/);
 const absent=setup();await assert.rejects(absent.adapters['storage-busy'].prepare({...absent.context,executePlan:async()=>({ok:true,results:[]})}),/Missing actual step result/);
});
test('source-only: actual native counts must match busy state independently of completion text',async()=>{
 const s=setup();await s.adapters['storage-busy'].prepare(s.context);const result=await s.adapters['storage-busy'].assertState(s.context);assert.equal(result.observable,'Exact storage-busy');assert.equal(result.passed,true);
 s.observed.diagnostics.pendingPackingFiles=0;s.rendered.counts[4]='0';await assert.rejects(s.adapters['storage-busy'].assertState(s.context));
 assert.ok(s.plans.every(plan=>plan.startupOwnershipAttempts===3&&plan.receipt==='C:/synthetic/receipt.json'&&plan.expectedUrl==='file:///synthetic/index.html'&&plan.allowEvaluate===true));
});
test('source-only: hidden or disabled production controls cannot produce action success',async()=>{
 for(const mode of ['hidden','disabled','absent']){const s=setup();await s.adapters['storage-busy'].prepare(s.context);let clicked=0;const button=mode==='absent'?null:{disabled:mode==='disabled',getClientRects:()=>mode==='hidden'?[]:[{}],getAttribute:()=>null,click(){clicked++;}};
  const shadow={querySelector:()=>button,querySelectorAll:()=>[]},host={shadowRoot:shadow,getClientRects:()=>[{}]},document={querySelectorAll:selector=>selector==='mfe-storage-maintenance'||selector==='*'?[host]:[]};
  const executePlan=async plan=>{const step=plan.steps[0],value=vm.runInNewContext(step.expression,{document});return{ok:true,results:[{id:step.id,value}]};};
  await assert.rejects(s.adapters['storage-busy'].actions['refresh-diagnostics']({...s.context,executePlan}));assert.equal(clicked,0);
 }
});
test('source-only: restoration must explicitly confirm and repeat preparation cannot ignore a failed restore',async()=>{
 const s=setup();await s.adapters['storage-busy'].prepare(s.context);s.fixtures.records.restoreNativeState=async()=>({restored:false});await assert.rejects(s.adapters['storage-busy'].prepare(s.context),/Native fixture restoration unverified/);await assert.rejects(s.adapters['storage-busy'].restore(s.context),/Native fixture restoration unverified/);
});
test('source-only: unavailable diagnostics must disable packing and show an honest read error',async()=>{
 const s=setup();s.observed.diagnostics=null;s.rendered.primaryDisabled=true;s.rendered.message='Storage could not be read. Retry after unlocking the drive.';await s.adapters['storage-unavailable'].prepare(s.context);assert.equal((await s.adapters['storage-unavailable'].assertState(s.context)).passed,true);s.rendered.primaryDisabled=false;await assert.rejects(s.adapters['storage-unavailable'].assertState(s.context));
});
test('source-only: inventory action drift fails closed at factory construction',()=>{
 const changed=structuredClone(inventory);changed.states[0].actions.push('unimplemented-action');assert.throws(()=>setup({inventory:changed}),/Action inventory drift/);
});
test('source-only: a claimed successful restore fails when actual native target was not restored',async()=>{
 const s=setup();await s.adapters['storage-busy'].prepare(s.context);s.observed.diagnostics.targetPartSizeBytes=1048576;await assert.rejects(s.adapters['storage-busy'].restore(s.context),/Fixture targetPartSizeBytes was not restored/);
});
test('source-only: paused text cannot substitute for actual durable pause and retained queue',async()=>{
 const s=setup();s.rendered.primaryText='Resume packing';s.rendered.message='Packing is paused. Queued files are retained.';await s.adapters['storage-paused'].prepare(s.context);await assert.rejects(s.adapters['storage-paused'].assertState(s.context));s.observed.diagnostics.packingPaused=true;assert.equal((await s.adapters['storage-paused'].assertState(s.context)).passed,true);s.observed.diagnostics.pendingPackingFiles=0;s.rendered.counts[4]='0';await assert.rejects(s.adapters['storage-paused'].assertState(s.context));
});
