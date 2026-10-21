import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {REGISTRY_VERIFICATION_STATES,registryContractRows,registryMatrix,REGISTRY_STATE_ROUTES} from '../scripts/gui-acceptance-registry-states.mjs';
import {createRegistryAdapters,registryObservableExpression,registryControlStep,registryClickStep} from '../scripts/gui-acceptance-registry.mjs';
import {validateRegistryFixtureResult} from '../scripts/gui-acceptance-registry-native-fixture.mjs';

const originalRegistry=['unavailable','unconfigured','ready','draft','invalid','running','cancelling','error','empty','revisions','restoring','session-changed'];
const originalConflicts=['unavailable','loading','empty','list','file-review','choice-review','resolving','stale','unsupported','error','resolved','session-changed'];
const additions=['rename-review','deletion-review','divergence-review','recovery-paths','file-keep-current','file-use-preserved','rename-keep-current','rename-keep-both','deletion-apply'];
const launch={cdp:{port:19341,expectedUrl:'file:///C:/owned/resources/app.asar/src/renderer/index.html'}};
const inventory=()=>({states:registryContractRows()});
const provider=()=>Object.fromEntries(['prepare','observeNative','restore','settle','pickRestore','confirmResolution','switchSession','unlock'].map(name=>[name,async()=>{}]));

test('explicit registry inventory retains every original state and each independent conflict choice',()=>{
 const expected=[...originalRegistry.map(id=>'registry-'+id),...originalConflicts.map(id=>'conflicts-'+id),...additions.map(id=>'conflicts-'+id)];
 assert.deepEqual(REGISTRY_VERIFICATION_STATES.map(row=>row.id),expected);assert.equal(new Set(expected).size,33);
 const matrix=registryMatrix();assert.equal(matrix.length,1584);
 for(const id of expected){assert.equal(matrix.filter(row=>row.state===id).length,48);assert.deepEqual(REGISTRY_STATE_ROUTES[id],{view:'storage'});}
 for(const row of registryContractRows()){assert.ok(row.actions.length);assert.match(row.layoutSelector,/^mfe-storage-maintenance >>> mfe-registry-/);assert.ok(row.observable);assert.equal(row.predicate,undefined);}
});
test('missing fixture producers and mismatched state inventory fail before runtime work',()=>{
 const adapters=createRegistryAdapters({launch,receipt:'C:/owned/lifecycle.json',inventory:inventory()});
 assert.throws(()=>adapters['registry-ready'].preflight(),/CAPABILITY_UNAVAILABLE/);
 const changed=inventory();changed.states.find(row=>row.id==='registry-ready').actions=[];
 assert.throws(()=>createRegistryAdapters({launch,receipt:'C:/owned/lifecycle.json',inventory:changed,fixtures:{registry:provider()}}));
 const missing=inventory();missing.states=missing.states.filter(row=>row.id!=='conflicts-deletion-review');assert.throws(()=>createRegistryAdapters({launch,receipt:'C:/owned/lifecycle.json',inventory:missing,fixtures:{registry:provider()}}));
});
test('provider claims without source binding or real evidence cannot prepare an accepted state',async()=>{
 const fixtures=provider();fixtures.prepare=async()=>({prepared:true,ownedSyntheticFixture:true,sourceCommit:'wrong',productionUi:true,rendererInjection:false,route:'supported-native-service',evidence:{receipt:'present'}});
 const adapters=createRegistryAdapters({launch,receipt:'C:/owned/lifecycle.json',inventory:inventory(),fixtures:{registry:fixtures}});
 let executions=0;const context={binding:{sourceCommit:'a'.repeat(40)},executePlan:async()=>{executions++;}};
 await assert.rejects(adapters['registry-ready'].prepare(context));assert.equal(executions,0);
 fixtures.prepare=async()=>({prepared:true,ownedSyntheticFixture:true,sourceCommit:'a'.repeat(40),productionUi:true,rendererInjection:true,route:'supported-native-service',evidence:{receipt:'present'}});
 await assert.rejects(adapters['registry-ready'].prepare(context));assert.equal(executions,0);
});
test('control adapters activate real controls and dispatch input events without replacing services',()=>{
 const events=[];const field={disabled:false,readOnly:false,value:'',getClientRects:()=>[{}],dispatchEvent:event=>events.push(event.type)};
 let clicks=0;const button={disabled:false,hidden:false,getClientRects:()=>[{}],click:()=>clicks++};
 const panel={fields:{repository:field},buttons:{save:button}},document={querySelector:()=>({shadowRoot:{querySelectorAll:()=>[panel]}})};
 const context={document,Event:class{constructor(type){this.type=type;}}};
 const input=registryControlStep('mfe-registry-storage-panel','repository','repository','owner/vault');assert.equal(vm.runInNewContext(input.expression,context),true);assert.equal(field.value,'owner/vault');assert.deepEqual(events,['input','change']);
 const activate=registryClickStep('mfe-registry-storage-panel','save','save');vm.runInNewContext(activate.expression,context);assert.equal(clicks,1);button.disabled=true;assert.throws(()=>vm.runInNewContext(activate.expression,context));
 assert.throws(()=>registryControlStep('mfe-registry-storage-panel','bad','services.x','bad'));
});
test('state observations require actual visible controls rather than merely matching state names',()=>{
 const definition=REGISTRY_VERIFICATION_STATES.find(row=>row.id==='registry-running');
 const panel={isConnected:true,getClientRects:()=>[{}],progress:{hidden:false},buttons:{cancel:{disabled:false}},current:()=>({cancelling:false})};
 const context={document:{querySelector:()=>({shadowRoot:{querySelectorAll:()=>[panel]}})}};
 assert.equal(vm.runInNewContext(registryObservableExpression(definition),context),true);panel.progress.hidden=true;assert.equal(vm.runInNewContext(registryObservableExpression(definition),context),false);
});
test('real native fixture output requires owned paths, expected kind and explicit vault-root recovery',()=>{
 const root=path.join(os.tmpdir(),'mfe-registry-fixture-unit-contract');
 const side={entryId:'a'.repeat(32),path:'file.txt',versionId:'b'.repeat(32),isDirectory:false,isLive:false,historyVersionId:'c'.repeat(32)};
 const value={prepared:true,fixtureRoot:root,scenario:'resolution-divergence',device:'deviceA',storageDir:path.join(root,'A','source'),cacheDir:path.join(root,'gui-cache-deviceA'),keyFilePath:path.join(root,'synthetic-fixture-key.bin'),vaultId:'d'.repeat(32),expectedConflicts:[{conflictId:'e'.repeat(64),kind:'resolution-divergence',current:side,preserved:{...side,entryId:'f'.repeat(32)},supportedChoices:['keep-both'],unsupportedReason:null,recoveryDirectory:''}]};
 assert.equal(validateRegistryFixtureResult(value,{root,scenario:value.scenario}).expectedConflicts.length,1);
 assert.throws(()=>validateRegistryFixtureResult({...value,storageDir:path.dirname(root)},{root,scenario:value.scenario}));
 assert.throws(()=>validateRegistryFixtureResult({...value,expectedConflicts:[{...value.expectedConflicts[0],recoveryDirectory:undefined}]},{root,scenario:value.scenario}));
 assert.throws(()=>validateRegistryFixtureResult({...value,expectedConflicts:[]},{root,scenario:value.scenario}));
});
