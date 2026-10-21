import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {stateRoutes,acquisitionCapabilities,makeAcquisitionPlan,modelReadinessSettled,modelReadinessSteps,acquireMatrix,acquireDiagnosticSubset,validateAcquisitionRequest,composeAdapters,settledComposedMotion,validateStateObservation} from '../scripts/gui-acceptance-acquire.mjs';
import {bindingFor,matrixFor,tupleKey,sha256} from '../scripts/gui-acceptance.mjs';
import {chooseVerificationDriveLetter} from '../scripts/preview-runtime-fixture.mjs';
import {ownedFixturePreparation} from '../scripts/gui-acceptance-baseline.mjs';
const inventory=JSON.parse(await fs.readFile(new URL('../contracts/gui-states.json',import.meta.url)));
const launch={cdp:{port:19222,expectedUrl:'file:///synthetic/resources/index.html'}};
const settledModel={schemaVersion:1,state:'settled',initialization:'settled',inspection:'settled',pendingRequests:0,pendingOperations:0};

test('model setup readiness rejects early zero, active work and failed settlement',()=>{
 assert.equal(modelReadinessSettled(settledModel),true);
 for(const patch of [{state:'not-started',initialization:'not-started',inspection:'not-started'},{state:'pending',inspection:'not-started'},{pendingRequests:1},{pendingOperations:1}])assert.equal(modelReadinessSettled({...settledModel,...patch}),false);
 for(const patch of [{state:'failed'},{inspection:'failed'},{initialization:'failed'},{pendingRequests:null}])assert.throws(()=>modelReadinessSettled({...settledModel,...patch}));
 assert.throws(()=>modelReadinessSettled(undefined));
});

test('setup observes actual status settlement with one read in flight and no extra ready-state read',async()=>{
 const steps=modelReadinessSteps('synthetic');let reads=0,release;
 const context={window:{drive:{status:()=>{reads++;return new Promise(resolve=>{release=resolve;});}}},structuredClone};
 const run=index=>vm.runInNewContext(steps[index].expression,context);
 assert.equal(run(0),true);assert.equal(run(1),false);assert.equal(run(1),false);assert.equal(reads,1);
 release({modelStartupReadiness:{...settledModel,state:'pending',inspection:'not-started'}});await Promise.resolve();assert.equal(run(1),false);assert.equal(reads,2);
 release({modelStartupReadiness:settledModel});await Promise.resolve();assert.equal(run(1),true);assert.equal(reads,2);assert.deepEqual(run(2),settledModel);
});

test('unchanged preference controls emit no change events and setup ends with real readiness',()=>{
 const tuple=matrixFor(inventory)[0],state=inventory.states[0],plan=makeAcquisitionPlan({launch,receipt:path.resolve('receipt.json'),tuple,state,outputRoot:path.resolve('captures')});
 const nodes={'#theme-setting':{value:tuple.theme,disabled:false},'#language-setting':{value:tuple.language,disabled:false}};let events=0;
 for(const node of Object.values(nodes))node.dispatchEvent=()=>events++;
 const context={document:{querySelector:selector=>nodes[selector]},Event:class{constructor(type){this.type=type;}}};
 const settings=plan.steps.filter(step=>step.id.endsWith('-theme')||step.id.endsWith('-language'));
 for(const step of settings)assert.equal(vm.runInNewContext(step.expression,context),true);assert.equal(events,0);
 nodes['#theme-setting'].value='different';vm.runInNewContext(settings[0].expression,context);assert.equal(events,1);assert.equal(nodes['#theme-setting'].value,tuple.theme);
 assert.ok(plan.steps.some(step=>step.id.endsWith('-tuple')));assert.match(plan.steps.at(-1).id,/-model-readiness-result$/);
});
test('restored capture state requires the exact observable and retained evidence',()=>{
 const state=inventory.states[0];assert.throws(()=>validateStateObservation({passed:true,observable:'different state',evidence:{observed:true}},state));
 assert.throws(()=>validateStateObservation({passed:true,observable:state.observable,evidence:{}},state));
 assert.throws(()=>validateStateObservation({passed:false,observable:state.observable,evidence:{observed:true}},state));
});
test('motion admission includes animated descendants across an open shadow root',()=>{
 const target={getClientRects:()=>[{}],getRootNode:()=>({})};const shadowChild={getClientRects:()=>[{}],getRootNode:()=>({host:target})};
 const animation={effect:{target:shadowChild},playState:'running',pending:false};
 const context={document:{querySelectorAll:()=>[target],getAnimations:()=>[animation]}};
 const run=()=>vm.runInNewContext(`(${settledComposedMotion.toString()})('#target')`,context);
 assert.equal(run(),false);animation.playState='finished';assert.equal(run(),true);animation.pending=true;assert.equal(run(),false);
 context.document.getAnimations=()=>[];target.shadowRoot={querySelectorAll:()=>[],getAnimations:()=>[animation]};assert.equal(run(),false);
});
test('area composition rejects duplicate ownership and unlisted state adapters',()=>{
 const adapter={prepare:async()=>{},assertState:async()=>{},actions:{}};
 assert.throws(()=>composeAdapters(inventory,{'drive-locked':adapter},{'drive-locked':adapter}),/Duplicate state adapter/);
 assert.throws(()=>composeAdapters(inventory,{'not-in-inventory':adapter}),/no inventoried state/);
 assert.throws(()=>composeAdapters(inventory,{'drive-locked':{}}),/Missing fixture preparation/);
});
const frozenBaseline='drive-locked drive-empty drive-populated drive-selected drive-busy drive-error drive-overflow drive-search drive-notifications offline-populated history-populated recycle-selected tools-default settings-default help-default create-password create-key-file create-private-repository converter-source converter-formats converter-options converter-queue ollama-model-store ollama-pull-cart ollama-chat ollama-profiles ollama-help server-prepare server-progress p-language p-school-enabled p-narrator p-appearance p-schedules-draft p-attention p-history-locked p-history-unlocked appearance-context-pointer appearance-context-keyboard appearance-edit-normal appearance-edit-layer-locked appearance-edit-image appearance-motion-track appearance-motion-transition appearance-history-rollback storage-busy storage-running storage-unavailable storage-invalid-size file-details-versions file-details-preview access-profile access-locks access-once access-authenticators access-support access-removal access-waiting access-profile-locked access-profile-unlocked access-locks-empty access-lock-wizard access-unlock access-authenticator-list access-authenticator-registration access-qr-hidden access-confirmation p-schedule-narrator p-schedule-attention p-schedule-appearance-ref p-schedule-logo-ref p-schedule-active-override p-schedule-restored-base storage-paused'.split(' ');
const previousAdditions='p-history-bulk-all p-history-bulk-invert p-history-bulk-range p-history-export-selected p-history-export-filtered p-history-export-format p-logo-preset p-logo-crop p-logo-safe-area p-logo-background access-history-locked access-history-unlocked access-history-waiting p-logo-reopened-recipe p-logo-title-preview'.split(' ');
const registryAdditions='registry-unavailable registry-unconfigured registry-ready registry-draft registry-invalid registry-running registry-cancelling registry-error registry-empty registry-revisions registry-restoring registry-session-changed conflicts-unavailable conflicts-loading conflicts-empty conflicts-list conflicts-file-review conflicts-choice-review conflicts-resolving conflicts-stale conflicts-unsupported conflicts-error conflicts-resolved conflicts-session-changed conflicts-rename-review conflicts-deletion-review conflicts-divergence-review conflicts-recovery-paths conflicts-file-keep-current conflicts-file-use-preserved conflicts-rename-keep-current conflicts-rename-keep-both conflicts-deletion-apply'.split(' ');
test('matrix expansion preserves 74 frozen IDs, fifteen prior additions and 33 registry additions',()=>{
 assert.equal(frozenBaseline.length,74);assert.deepEqual(inventory.states.slice(0,74).map(state=>state.id),frozenBaseline);
 assert.equal(previousAdditions.length,15);assert.equal(registryAdditions.length,33);
 const added=inventory.states.slice(74,89);assert.equal(added.length,15);assert.deepEqual(added.map(state=>state.id),previousAdditions);
 for(const state of added){assert.match(state.addition.sourceCommit,/^[a-f0-9]{40}$/);assert.ok(state.addition.reason);assert.match(state.id,/^(p-(history|logo)|access-history)-/);}
 assert.deepEqual(inventory.states.slice(89).map(state=>state.id),registryAdditions);
 assert.equal(new Set([...frozenBaseline,...previousAdditions,...registryAdditions]).size,122);
 for(const state of inventory.states.slice(89)){assert.equal(state.owner,'registry');assert.deepEqual(stateRoutes[state.id],{view:'storage'});}
 assert.equal(matrixFor(inventory).length,5856);
});
test('native verification never chooses reserved M drive even when available',()=>{
 assert.equal(chooseVerificationDriveLetter(['M:','N:']),'N:');
 assert.throws(()=>chooseVerificationDriveLetter(['M:']));
 assert.throws(()=>chooseVerificationDriveLetter(['C:','m:','M:']));
});
test('native preparation stops before UI mutation when another drive identity appears',async()=>{
 const fixture={prepared:true,root:'owned',storageDir:'owned/storage',cacheDir:'owned/cache',driveLetter:'N:'};
 const prepare=ownedFixturePreparation({launch,receipt:path.resolve('receipt.json'),fixture});let calls=0;
 await assert.rejects(prepare({requiredDriveState:'locked',binding:{sourceCommit:'a'.repeat(40)},executePlan:async()=>{calls++;return {ok:true,results:[{value:{done:true,value:{...fixture,storageDir:'unrelated/storage',locked:false}}}]};}}),/Native fixture identity changed/);
 assert.equal(calls,1);
 assert.throws(()=>ownedFixturePreparation({launch,receipt:path.resolve('receipt.json'),fixture:{...fixture,driveLetter:'M:'}}));
});
test('every inventoried state has an explicit production navigation route',()=>{
 assert.deepEqual(Object.keys(stateRoutes).sort(),inventory.states.map(state=>state.id).sort());
 const rows=acquisitionCapabilities(inventory);assert.equal(rows.length,122);assert.ok(rows.every(row=>!row.fixture&&!row.observable&&row.missingActions.length));
 const removed={...stateRoutes};delete removed['storage-paused'];assert.notDeepEqual(Object.keys(removed).sort(),inventory.states.map(state=>state.id).sort());
 assert.equal(stateRoutes['ollama-help'].tab,'#ollama-panel-5-tab');
 assert.deepEqual(inventory.states.find(state=>state.id==='ollama-help').actions,['open-help']);
});
test('all 5856 plans retain exact URL proof, scale and real navigation',()=>{
 for(const tuple of matrixFor(inventory)){
  const state=inventory.states.find(state=>state.id===tuple.state);
  const plan=makeAcquisitionPlan({launch,receipt:path.resolve('receipt.json'),tuple,state,outputRoot:path.resolve('captures')});
  assert.equal(plan.expectedUrl,launch.cdp.expectedUrl);assert.equal(plan.startupOwnershipAttempts,3);
  assert.equal(plan.steps[0].scale,tuple.scale);assert.ok(plan.steps.some(step=>step.id.endsWith('-state-navigation')));
  assert.ok(!JSON.stringify(plan).includes('window.drive='));assert.ok(!JSON.stringify(plan).includes('replaceChildren'));
 }
});
test('missing action adapters fail closed before any packaged acquisition',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'gui-acquisition-test-'));
 const binding=bindingFor({sourceCommit:'a'.repeat(40),executableSha256:'b'.repeat(64),resourceSha256:'c'.repeat(64),verifierSha256:'d'.repeat(64),referenceSha256:'e'.repeat(64),inventory});
 let calls=0;const result=await acquireDiagnosticSubset({inventory,binding,launch,receipt:path.resolve('receipt.json'),outputRoot:root,executePlan:async()=>{calls++;},probeEvidence:{},adapters:{},tuples:[matrixFor(inventory)[0]]});
 assert.equal(calls,0);assert.equal(result.results[0].status,'unavailable');assert.equal(result.accepted,false);
 await fs.rmdir(root);
});
test('admitted unchanged evidence resumes without acquiring a live capability',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'gui-resume-test-'));
 try{
  const binding=bindingFor({sourceCommit:'a'.repeat(40),executableSha256:'b'.repeat(64),resourceSha256:'c'.repeat(64),verifierSha256:'d'.repeat(64),referenceSha256:'e'.repeat(64),inventory});
  const tuple=matrixFor(inventory)[0],state=inventory.states[0],file={path:'proof.json',sha256:sha256('proof')};await fs.writeFile(path.join(root,file.path),'proof');
  const row={schemaVersion:1,status:'passed',tuple,binding,route:'cheap-lowlevel-headless',captureKind:'packaged-renderer',scaleProof:'renderer-emulation',capture:file,layout:file,referenceCapture:file,sideBySide:file,visualDiff:file,inspection:{inspected:true,privacyPassed:true,correctState:true,referenceReviewed:true,designParityPassed:true},layoutResult:{outerFrameScroll:false,clipped:[]},primitiveAudit:{genericControls:[],unregisteredControls:[]},motionSettled:true,resourceGraphVerified:true,cspVerified:true,fixtureIdentityVerified:true,stateObservable:state.observable,actions:state.actions.map(id=>({id,activated:true,observablePassed:true,evidencePath:file.path,evidenceSha256:file.sha256}))};
  const run=()=>acquireDiagnosticSubset({inventory,binding,launch,receipt:path.resolve('receipt.json'),outputRoot:root,executePlan:()=>{throw Error('Must not acquire');},adapters:{},tuples:[tuple],resume:new Map([[tupleKey(tuple),row]])});
  assert.equal((await run()).results[0].status,'reused');
  await fs.writeFile(path.join(root,file.path),'changed');assert.equal((await run()).results[0].status,'unavailable');
 }finally{await fs.unlink(path.join(root,'proof.json'));await fs.rmdir(root);}
});

test('full acquisition rejects omitted, shortened, duplicate and unknown tuples before runtime',async()=>{
 const all=matrixFor(inventory),binding=bindingFor({sourceCommit:'a'.repeat(40),executableSha256:'b'.repeat(64),resourceSha256:'c'.repeat(64),verifierSha256:'d'.repeat(64),referenceSha256:'e'.repeat(64),inventory});let touched=0;const rejectRun=tuples=>acquireMatrix({inventory,binding,tuples,adapters:{},launch,receipt:path.resolve('receipt.json'),outputRoot:path.resolve('uncreated-rejected-acquisition'),executePlan:()=>{touched++;},createProbeEvidence:()=>{touched++;}});
 for(const [tuples,reason] of [[undefined,/Explicit nonempty/],[[],/Explicit nonempty/],[all.slice(1),/Complete matrix/],[[...all,all[0]],/Duplicate matrix/],[[...all.slice(0,-1),{...all.at(-1),state:'unknown-state'}],/Unknown matrix/]])await assert.rejects(rejectRun(tuples),reason);
 assert.equal(touched,0);assert.equal(validateAcquisitionRequest({inventory,tuples:all}).requested,5856);
 assert.throws(()=>validateAcquisitionRequest({inventory:{...inventory,states:inventory.states.slice(1)},tuples:all.slice(48)}),/Complete current state inventory/);
 assert.throws(()=>validateAcquisitionRequest({inventory,tuples:[{...all[0],extra:true}],mode:'diagnostic-subset'}),/Unknown matrix tuple/);
 assert.equal(validateAcquisitionRequest({inventory,tuples:[all[0]],mode:'diagnostic-subset'}).complete,false);
});
test('a late invalid diagnostic tuple cannot execute an earlier valid tuple',async()=>{
 let touched=0;await assert.rejects(acquireDiagnosticSubset({inventory,tuples:[matrixFor(inventory)[0],{state:'unknown-state'}],executePlan:()=>{touched++;}}),/Unknown matrix tuple/);assert.equal(touched,0);
});
