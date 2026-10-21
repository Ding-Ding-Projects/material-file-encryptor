import assert from 'node:assert/strict';
import {withCdpConnectionProof} from './cdp-connection-plan.mjs';
import {REGISTRY_VERIFICATION_STATES} from './gui-acceptance-registry-states.mjs';

const q=JSON.stringify;
const panelExpression=tag=>`(()=>{const host=document.querySelector('mfe-storage-maintenance');const rows=host?.shadowRoot?.querySelectorAll(${q(tag)});if(rows?.length!==1)throw Error('Expected one production storage component');return rows[0];})()`;
export function registryObservableExpression(state){
 return `(()=>{const p=${panelExpression(state.selector)};if(!p.isConnected||!p.getClientRects().length)return false;return Boolean(${state.predicate});})()`;
}
export function registryControlStep(tag,id,key,value){
 assert.match(key,/^[A-Za-z][A-Za-z0-9]*$/);assert.ok(['string','boolean'].includes(typeof value));
 return {id,op:'evaluate',expression:`(()=>{const p=${panelExpression(tag)},node=p.fields?.[${q(key)}];if(!node||node.disabled||node.readOnly||!node.getClientRects().length)throw Error('Editable production control unavailable');node.${typeof value==='boolean'?'checked':'value'}=${q(value)};node.dispatchEvent(new Event('input',{bubbles:true,composed:true}));node.dispatchEvent(new Event('change',{bubbles:true,composed:true}));return true;})()`};
}
export function registryClickStep(tag,id,key){
 assert.match(key,/^[A-Za-z][A-Za-z0-9]*$/);
 return {id,op:'evaluate',expression:`(()=>{const p=${panelExpression(tag)},node=p.buttons?.[${q(key)}];if(!node||node.disabled||node.hidden||!node.getClientRects().length)throw Error('Production action unavailable');node.click();return {activation:'dom-click',count:1};})()`};
}
const transferActions=new Set(['run-sync','cancel-sync','wait-transfer','restore-revision','complete-restore-picker']);
const conflictActions=new Set(['apply-conflict','settle-resolution']);
const extraCapabilities={ 'restore-revision':'pickRestore','complete-restore-picker':'pickRestore','apply-conflict':'confirmResolution','settle-resolution':'confirmResolution','switch-owned-session':'switchSession','unlock-owned-vault':'unlock' };

// Fits acquireMatrix's existing adapter contract. It never launches a process,
// substitutes services, mutates component state, or invents provider evidence.
// A real task-owned native/provider fixture producer is required explicitly.
export function createRegistryAdapters({launch,receipt,inventory,fixtures={}}){
 assert.ok(launch?.cdp?.expectedUrl?.startsWith('file:'));assert.ok(Number.isInteger(launch.cdp.port)&&launch.cdp.port>=1024&&launch.cdp.port<=65535);assert.ok(receipt);
 const provider=fixtures.registry;
 const requireCapability=name=>{if(typeof provider?.[name]!=='function')throw Error('CAPABILITY_UNAVAILABLE: registry.'+name);};
 const plan=steps=>withCdpConnectionProof({version:1,receipt,endpoint:`http://127.0.0.1:${launch.cdp.port}`,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:30000,steps},'control');
 async function execute(context,steps){const result=await context.executePlan(plan(steps));assert.equal(result?.ok,true);for(const step of steps){const found=result.results?.find(row=>row.id===step.id);assert.ok(found,'Missing CDP result');assert.notEqual(found.ok,false);assert.ok(!found.error);}return result;}
 const poll=(id,expression)=>({id,op:'poll',expression,equals:true,intervalMs:100});
 const producerReceipt=(value,context)=>{assert.equal(value?.ownedSyntheticFixture,true);assert.equal(value.sourceCommit,context.binding.sourceCommit);assert.equal(value.productionUi,true);assert.equal(value.rendererInjection,false);assert.ok(['supported-native-service','approved-loopback-provider'].includes(value.route));assert.ok(value.evidence&&typeof value.evidence==='object'&&Object.keys(value.evidence).length);return value;};
 return Object.fromEntries(REGISTRY_VERIFICATION_STATES.map(definition=>{
  const state=inventory.states.find(row=>row.id===definition.id);assert.ok(state,'Missing registry state: '+definition.id);assert.deepEqual(state.actions,definition.actions);assert.equal(state.observable,definition.observable);assert.equal(state.layoutSelector,definition.layoutSelector);assert.equal(state.selector,definition.selector);assert.equal(state.owner,definition.owner);
  let fixture=null;
  const invoke=async(name,context,extra={})=>{requireCapability(name);return producerReceipt(await provider[name]({...context,state:state.id,fixture,...extra}),context);};
  const observe=async(context,action)=>{const native=await invoke('observeNative',context,{action});assert.equal(native.verified,true,'Independent native observation unavailable');return native;};
  const waitIdle=context=>execute(context,[poll('registry-operation-idle',`(()=>{const p=${panelExpression(state.selector)};return !p.current()?.pending;})()`)]);
  const click=(context,key)=>execute(context,[registryClickStep(state.selector,'registry-'+key,key)]);
  async function selectConflict(context){
   assert.ok(fixture?.conflictId,'Owned conflict identity required');
   return execute(context,[{id:'select-owned-conflict',op:'evaluate',expression:`(()=>{const p=${panelExpression(state.selector)},rows=p.current()?.rows,index=rows?.findIndex(row=>row.conflictId===${q(fixture.conflictId)});if(index<0||index===undefined)throw Error('Owned conflict absent');const node=p.records.children[index];if(!node||node.disabled)throw Error('Conflict selection unavailable');node.click();return true;})()`},poll('owned-conflict-selected',`(()=>{const p=${panelExpression(state.selector)};return p.current()?.selected?.conflictId===${q(fixture.conflictId)};})()`)]);
  }
  async function choose(context,choice){return execute(context,[{id:'choose-owned-resolution',op:'evaluate',expression:`(()=>{const p=${panelExpression(state.selector)},node=p.choiceInputs?.get(${q(choice)});if(!node||node.disabled||!node.getClientRects().length)throw Error('Advertised resolution unavailable');node.click();return true;})()`},poll('resolution-choice-visible',`(()=>{const p=${panelExpression(state.selector)};return p.current()?.choice===${q(choice)}&&!p.buttons.apply.disabled;})()`)]);}
  async function nativePicker(context,name,activate){let activated=false;const result=await invoke(name,context,{activate:async()=>{activated=true;return activate();}});assert.equal(activated,true,'Native producer must activate actual control');assert.equal(result.completed,true);return result;}
  async function action(context,id){
   assert.ok(fixture,'Prepared owned fixture required');let activation;
   if(id==='configure-calendar'){
    assert.match(fixture.repository,/^[a-z0-9][a-z0-9_-]{1,38}\/[a-z0-9][a-z0-9._-]*$/);
    activation=await execute(context,[registryControlStep(state.selector,'destination','repository',fixture.repository),registryControlStep(state.selector,'calendar','mode','calendar'),registryControlStep(state.selector,'times','times','02:00, 14:30'),registryControlStep(state.selector,'zone','timeZone','UTC'),registryControlStep(state.selector,'retry','retryMinutes','15'),registryControlStep(state.selector,'missed','missed','skip'),registryClickStep(state.selector,'save-calendar','save')]);await waitIdle(context);
   }else if(id==='correct-destination'){
    assert.ok(fixture.repository);activation=await execute(context,[registryControlStep(state.selector,'correct-destination','repository',fixture.repository),registryClickStep(state.selector,'save-corrected','save')]);await waitIdle(context);
   }else if(['refresh-status','refresh-draft','refresh-conflicts','refresh-revisions'].includes(id)){activation=await click(context,id==='refresh-revisions'?'list':'refresh');await waitIdle(context);
   }else if(id==='run-sync'){activation=await click(context,'sync');await invoke('settle',context,{action:id});await waitIdle(context);
   }else if(id==='cancel-sync'){activation=await click(context,'cancel');await invoke('settle',context,{action:id});await waitIdle(context);
   }else if(id==='wait-transfer'){activation=await invoke('settle',context,{action:id});await waitIdle(context);
   }else if(id==='select-revision'){
    assert.match(fixture.digest,/^sha256:[a-f0-9]{64}$/);activation=await execute(context,[{id,op:'evaluate',expression:`(()=>{const p=${panelExpression(state.selector)},node=p.revision;if(!node||node.disabled)throw Error('Revision selector unavailable');if(!p.current()?.snapshots?.some(row=>row.digest===${q(fixture.digest)}))throw Error('Owned digest absent');node.value=${q(fixture.digest)};node.dispatchEvent(new Event('change',{bubbles:true,composed:true}));return true;})()`}]);
   }else if(id==='restore-revision'){activation=await nativePicker(context,'pickRestore',()=>click(context,'restore'));await waitIdle(context);
   }else if(id==='complete-restore-picker'){activation=await invoke('pickRestore',context,{alreadyActivated:true});assert.equal(activation.completed,true);await waitIdle(context);
   }else if(id==='select-conflict'){activation=await selectConflict(context);
   }else if(id.startsWith('choose-')){activation=await choose(context,{'choose-keep-both':'keep-both','choose-preserved':'use-preserved','choose-keep-change':'keep-change','choose-keep-current':'keep-current','choose-apply-deletion':'apply-deletion'}[id]);
   }else if(id==='apply-conflict'){activation=await nativePicker(context,'confirmResolution',()=>click(context,'apply'));await waitIdle(context);
   }else if(id==='settle-resolution'){activation=await invoke('confirmResolution',context,{alreadyActivated:true});assert.equal(activation.completed,true);await waitIdle(context);
   }else if(id==='cancel-review'){activation=await click(context,'cancel');
   }else if(id==='switch-owned-session'){activation=await invoke('switchSession',context);assert.equal(activation.completed,true);
   }else if(id==='unlock-owned-vault'){activation=await invoke('unlock',context);assert.equal(activation.completed,true);
   }else if(id==='add-vault'){activation=await execute(context,[{id,op:'click',selector:'#add-vault-session'}]);
   }else throw Error('Unknown registry action');
   const observation=await observe(context,id);
   return{id,activated:true,observablePassed:true,activation:transferActions.has(id)||conflictActions.has(id)?'production-control-and-native-readback':'production-control',evidence:{activation,observation}};
  }
  return[state.id,{
   preflight(){for(const name of ['prepare','observeNative','restore'])requireCapability(name);provider.assertCapabilities?.(state.id);for(const id of state.actions){if(extraCapabilities[id])requireCapability(extraCapabilities[id]);if(['run-sync','cancel-sync','wait-transfer'].includes(id))requireCapability('settle');}return{declared:true,executed:false};},
   async prepare(context){this.preflight();fixture=await invoke('prepare',context);assert.equal(fixture.prepared,true);return fixture;},
   async enter(context){
    // Native producers establish the actual state through supported APIs and
    // owned external conditions. Only controls are changed here.
    if(state.id==='registry-draft')await execute(context,[registryControlStep(state.selector,'unsaved-destination','repository',fixture.draftRepository)]);
    if(state.id==='registry-invalid')await execute(context,[registryControlStep(state.selector,'invalid-destination','repository','not a repository'),registryClickStep(state.selector,'validate-destination','save')]);
    if(['conflicts-file-review','conflicts-rename-review','conflicts-deletion-review','conflicts-divergence-review','conflicts-unsupported','conflicts-choice-review','conflicts-file-keep-current','conflicts-file-use-preserved','conflicts-rename-keep-current','conflicts-rename-keep-both','conflicts-deletion-apply'].includes(state.id)){await click(context,'refresh');await waitIdle(context);await selectConflict(context);if(state.id==='conflicts-choice-review')await choose(context,'keep-both');}
   },
   async assertState(context){const expression=registryObservableExpression(definition),result=await execute(context,[poll('registry-exact-state',expression)]);assert.equal(result.results.at(-1).value,true);const native=await observe(context,'state');return{passed:true,observable:state.observable,evidence:{result,native}};},
   actions:Object.fromEntries(state.actions.map(id=>[id,context=>action(context,id)])),
   async restore(context){if(!fixture)return{restored:true,neverPrepared:true};const result=await invoke('restore',context);assert.equal(result.restored,true);assert.equal(result.operationsSettled,true);fixture=null;return result;}
  }];
 }));
}
