import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {createToolsAdapters,TOOLS_CAPABILITIES} from '../scripts/gui-acceptance-tools.mjs';

// Source-only contract tests. These mocked plans are never packaged evidence.
const rows=[
 ['converter-source','#converter-panel-0',['choose-source']],['converter-formats','#converter-panel-1',['select-adapter']],['converter-options','#converter-panel-2',['choose-destination','enqueue']],['converter-queue','#converter-panel-3',['cancel-queued-operation']],
 ['ollama-model-store','#ollama-panel-1',['filter-models','select-model']],['ollama-pull-cart','#ollama-panel-2',['remove-cart-item']],['ollama-chat','#ollama-panel-3',['choose-synthetic-attachment']],['ollama-profiles','#ollama-panel-4',['save-profile','reload-profile']],
 ['server-prepare','.server-preparation',['filter-versions','select-version','review-license']],['server-progress','.server-operation',['cancel-preparation']]
];
const inventory={states:rows.map(([id,selector,actions])=>({id,selector,actions,observable:'Frozen observable: '+id}))};
const sourceCommit='a'.repeat(40),launch={cdp:{port:12345,expectedUrl:'file:///owned/app/index.html'}},receipt='owned-launch-receipt.json';
function setup(){
 const calls=[],fixture={ownedSyntheticFixture:true,sourceCommit,productionUi:true,noRealDownloads:true,route:'supported-native-service',adapterId:'json-pretty',adapterName:'Format JSON',modelTag:'synthetic:1',versionId:'synthetic-version',operationId:'owned-operation'};
 const fixtures={};for(const area of ['converter','ollama','server'])fixtures[area]={prepare:async()=>{calls.push(area+'.prepare');return{...fixture};},restore:async()=>{calls.push(area+'.restore');return{restored:true,draftsPreserved:true,operationsSettled:true};}};
 fixtures.converter.sourcePicker=async({activate})=>{await activate();return{completed:true};};
 fixtures.converter.destinationPicker=async({phase})=>{calls.push('destination.'+phase);return{armed:true,open:true,completed:true,ownedSyntheticDestination:true,cancelled:true,operationId:'owned-operation'};};
 fixtures.converter.cancelOwnedOperation=fixtures.server.cancelOwnedOperation=async({activate})=>{await activate();return{completed:true};};
 fixtures.ollama.approvedProvider=async()=>({approved:true,noOutboundNetwork:true});fixtures.server.approvedCatalogue=async({phase,activate})=>{if(phase==='refresh'){await activate();return{completed:true};}return{approved:true,noOutboundNetwork:true};};
 fixtures.ollama.attachmentPicker=async({activate})=>{await activate();return{completed:true,ownedSyntheticImage:true};};fixtures.ollama.profilePicker=async({activate})=>{await activate();return{completed:true,profileId:'owned-profile'};};
 const prepareOwnedFixture=async()=>{calls.push('ownership');return{ownedSyntheticFixture:true,sourceCommit};};
 const plans=[];const executePlan=async plan=>{plans.push(plan);return{ok:true,results:plan.steps.map(step=>({id:step.id,value:step.id.endsWith('-read')?{done:true,value:step.id.includes('native-adapter')?{id:'json-pretty',enabled:true}:step.id.includes('native-model')?{present:true,installed:true}:{version:'synthetic-version',licenseAccepted:false}}:step.op==='poll'||step.id.endsWith('-start')||step.id.includes('drafts')?true:{activation:'dom-click',count:1}}))};};
 const adapters=createToolsAdapters({launch,receipt,inventory,prepareOwnedFixture,fixtures});
 return{adapters,fixtures,calls,plans,prepareOwnedFixture,executePlan,context:id=>({tuple:{state:id,language:'en'},binding:{sourceCommit},executePlan})};
}
test('exact ten frozen states are implemented without duplicating baseline help',()=>{const {adapters}=setup();assert.deepEqual(Object.keys(adapters),rows.map(row=>row[0]));assert.equal(adapters['ollama-help'],undefined);for(const [id,,actions]of rows)assert.deepEqual(Object.keys(adapters[id].actions),actions);});
test('each absent capability fails before ownership or producer mutation',async()=>{
 for(const [id,names]of Object.entries(TOOLS_CAPABILITIES))for(const name of names){const state=setup(),[area,key]=name.split('.');delete state.fixtures[area][key];const adapters=createToolsAdapters({launch,receipt,inventory,prepareOwnedFixture:state.prepareOwnedFixture,fixtures:state.fixtures});await assert.rejects(adapters[id].prepare(state.context(id)),error=>error.message==='CAPABILITY_UNAVAILABLE: '+name);assert.deepEqual(state.calls,[],name);assert.deepEqual(state.plans,[],name);}
});
test('native readback rejects an optimistic fixture whose real adapter is unavailable',async()=>{const state=setup(),context=state.context('converter-source');context.executePlan=async plan=>({ok:true,results:plan.steps.map(step=>({id:step.id,value:step.id.endsWith('-read')?{done:true,value:{enabled:false}}:true}))});await assert.rejects(state.adapters['converter-source'].prepare(context),/Native observable failed/);});
test('unapproved external provider stops before model fixture preparation',async()=>{const state=setup();state.fixtures.ollama.approvedProvider=async()=>({approved:true,noOutboundNetwork:false});await assert.rejects(state.adapters['ollama-chat'].prepare(state.context('ollama-chat')),/isolated from external/);assert.deepEqual(state.calls,['ownership']);});
test('wrong visible state cannot pass from a successful transport envelope',async()=>{const state=setup(),context=state.context('converter-source');await state.adapters['converter-source'].prepare(context);context.executePlan=async plan=>({ok:true,results:plan.steps.map(step=>({id:step.id,value:false}))});await assert.rejects(state.adapters['converter-source'].assertState(context),/Observable failed/);});
test('absent and disabled actual controls do not produce action success',async()=>{
 for(const disabled of [null,true]){const state=setup(),context=state.context('converter-source');await state.adapters['converter-source'].prepare(context);context.executePlan=async plan=>{const node=disabled===null?null:{isConnected:true,disabled,getClientRects:()=>[{}],closest:()=>null,matches:()=>true,getAttribute:()=>null,click(){throw Error('Disabled action must not run');}};const document={querySelectorAll:()=>node?[node]:[],querySelector:()=>({querySelectorAll:()=>node?[node]:[]})};return{ok:true,results:plan.steps.map(step=>({id:step.id,value:vm.runInNewContext(step.expression,{document,window:{}})}))};};await assert.rejects(state.adapters['converter-source'].actions['choose-source'](context),disabled===null?/Expected one visible action/:/Inactive action/);}
});
test('picker producer cannot report success without activating its production control',async()=>{const state=setup(),context=state.context('converter-source');state.fixtures.converter.sourcePicker=async()=>({completed:true});await state.adapters['converter-source'].prepare(context);await assert.rejects(state.adapters['converter-source'].actions['choose-source'](context),/did not activate production picker/);});
test('pending destination is cancelled before restoration and unproven restoration fails',async()=>{
 const state=setup(),context=state.context('converter-options'),adapter=state.adapters['converter-options'];await adapter.prepare(context);await assert.rejects(adapter.actions.enqueue(context),/Destination selection must precede/);await adapter.actions['choose-destination'](context);await adapter.restore(context);assert.ok(state.calls.indexOf('destination.cancel')<state.calls.indexOf('converter.restore'));
 const other=setup(),ctx=other.context('converter-source');await other.adapters['converter-source'].prepare(ctx);other.fixtures.converter.restore=async()=>({restored:true,draftsPreserved:false,operationsSettled:true});await assert.rejects(other.adapters['converter-source'].restore(ctx));
});
test('every plan retains source target ownership proof and no service replacement exists',async()=>{const state=setup(),context=state.context('converter-source');await state.adapters['converter-source'].prepare(context);await state.adapters['converter-source'].assertState(context);for(const plan of state.plans){assert.equal(plan.receipt,receipt);assert.equal(plan.expectedUrl,launch.cdp.expectedUrl);assert.equal(plan.endpoint,'http://127.0.0.1:12345');assert.equal(plan.startupOwnershipAttempts,3);assert.equal(plan.allowEvaluate,true);assert.equal(plan.timeoutMs,30000);}const source=await fs.readFile(new URL('../scripts/gui-acceptance-tools.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/window\.drive\s*=|mountConverter\(|mountOllama\(|mountServerPreparation\(|Date\s*=/);assert.match(source,/window\.drive\.featureRequest/);});

test('active queue and preparation states reject stale terminal native records',async()=>{
 for(const [id,native]of [['converter-queue',{state:'completed',adapterId:'json-pretty'}],['server-progress',{status:'prepared',licenseAccepted:false}],['ollama-pull-cart',{present:false}]]){
  const state=setup(),context=state.context(id);await state.adapters[id].prepare(context);
  context.executePlan=async plan=>({ok:true,results:plan.steps.map(step=>({id:step.id,value:step.id.endsWith('-read')?{done:true,value:native}:true}))});
  await assert.rejects(state.adapters[id].assertState(context),/Native observable failed/);
 }
});
