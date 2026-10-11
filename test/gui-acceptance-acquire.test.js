import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {stateRoutes,acquisitionCapabilities,makeAcquisitionPlan,acquireMatrix} from '../scripts/gui-acceptance-acquire.mjs';
import {bindingFor,matrixFor} from '../scripts/gui-acceptance.mjs';
import {chooseVerificationDriveLetter} from '../scripts/preview-runtime-fixture.mjs';
const inventory=JSON.parse(await fs.readFile(new URL('../contracts/gui-states.json',import.meta.url)));
const launch={cdp:{port:19222,expectedUrl:'file:///synthetic/resources/index.html'}};
test('native verification never chooses reserved M drive even when available',()=>{
 assert.equal(chooseVerificationDriveLetter(['M:','N:']),'N:');
 assert.throws(()=>chooseVerificationDriveLetter(['M:']));
 assert.throws(()=>chooseVerificationDriveLetter(['C:','m:','M:']));
});
test('every inventoried state has an explicit production navigation route',()=>{
 assert.deepEqual(Object.keys(stateRoutes).sort(),inventory.states.map(state=>state.id).sort());
 const rows=acquisitionCapabilities(inventory);assert.equal(rows.length,74);assert.ok(rows.every(row=>!row.fixture&&!row.observable&&row.missingActions.length));
 const removed={...stateRoutes};delete removed['storage-paused'];assert.notDeepEqual(Object.keys(removed).sort(),inventory.states.map(state=>state.id).sort());
});
test('all 3552 plans retain exact URL proof, scale and real navigation',()=>{
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
