import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {stateRoutes,acquisitionCapabilities,makeAcquisitionPlan,acquireMatrix} from '../scripts/gui-acceptance-acquire.mjs';
import {bindingFor,matrixFor} from '../scripts/gui-acceptance.mjs';
import {chooseVerificationDriveLetter} from '../scripts/preview-runtime-fixture.mjs';
import {ownedFixturePreparation} from '../scripts/gui-acceptance-baseline.mjs';
const inventory=JSON.parse(await fs.readFile(new URL('../contracts/gui-states.json',import.meta.url)));
const launch={cdp:{port:19222,expectedUrl:'file:///synthetic/resources/index.html'}};
const frozenBaseline='drive-locked drive-empty drive-populated drive-selected drive-busy drive-error drive-overflow drive-search drive-notifications offline-populated history-populated recycle-selected tools-default settings-default help-default create-password create-key-file create-private-repository converter-source converter-formats converter-options converter-queue ollama-model-store ollama-pull-cart ollama-chat ollama-profiles ollama-help server-prepare server-progress p-language p-school-enabled p-narrator p-appearance p-schedules-draft p-attention p-history-locked p-history-unlocked appearance-context-pointer appearance-context-keyboard appearance-edit-normal appearance-edit-layer-locked appearance-edit-image appearance-motion-track appearance-motion-transition appearance-history-rollback storage-busy storage-running storage-unavailable storage-invalid-size file-details-versions file-details-preview access-profile access-locks access-once access-authenticators access-support access-removal access-waiting access-profile-locked access-profile-unlocked access-locks-empty access-lock-wizard access-unlock access-authenticator-list access-authenticator-registration access-qr-hidden access-confirmation p-schedule-narrator p-schedule-attention p-schedule-appearance-ref p-schedule-logo-ref p-schedule-active-override p-schedule-restored-base storage-paused'.split(' ');
test('matrix expansion preserves all 74 frozen IDs and binds ten owner additions',()=>{
 assert.equal(frozenBaseline.length,74);assert.deepEqual(inventory.states.slice(0,74).map(state=>state.id),frozenBaseline);
 const added=inventory.states.slice(74);assert.equal(added.length,10);
 for(const state of added){assert.match(state.addition.sourceCommit,/^[a-f0-9]{40}$/);assert.ok(state.addition.reason);assert.match(state.id,/^p-(history|logo)-/);}
 assert.equal(matrixFor(inventory).length,4032);
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
 const rows=acquisitionCapabilities(inventory);assert.equal(rows.length,84);assert.ok(rows.every(row=>!row.fixture&&!row.observable&&row.missingActions.length));
 const removed={...stateRoutes};delete removed['storage-paused'];assert.notDeepEqual(Object.keys(removed).sort(),inventory.states.map(state=>state.id).sort());
 assert.equal(stateRoutes['ollama-help'].tab,'#ollama-panel-5-tab');
 assert.deepEqual(inventory.states.find(state=>state.id==='ollama-help').actions,['open-help']);
});
test('all 4032 plans retain exact URL proof, scale and real navigation',()=>{
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
 let calls=0;const result=await acquireMatrix({inventory,binding,launch,receipt:path.resolve('receipt.json'),outputRoot:root,executePlan:async()=>{calls++;},probeEvidence:{},adapters:{},tuples:[matrixFor(inventory)[0]]});
 assert.equal(calls,0);assert.equal(result.results[0].status,'unavailable');assert.equal(result.accepted,false);
 await fs.rmdir(root);
});
