import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {prepareRuntimeFixture,forgetRuntimeFixture} from './preview-runtime-fixture.mjs';

// The existing native producer creates only a fresh owned vault. It writes the
// application's supported preferences before launch, never a replacement bridge.
export function createPackagedFixturePreparation({prepare=prepareRuntimeFixture}={}) {
 let fixture;
 return {
  get fixture(){return fixture;},
  async prepareProfile({profile,target}){
   assert.equal(target.kind,'extracted-packaged-runtime');
   assert.match(target.sourceCommit,/^[a-f0-9]{40}$/);
   assert.equal(fixture,undefined,'A native fixture may only be prepared once');
   fixture=await prepare({executable:target.executable,profile});
   assert.equal(fixture.prepared,true);assert.notEqual(fixture.driveLetter,'M:');
   return {ownedSyntheticFixture:true,sourceCommit:target.sourceCommit};
  }
 };
}

export async function observeOwnedPackagedFixture(page,fixture){
 const value=await page.evaluate(async()=>{
  const state=await window.drive.status();
  return {storageDir:state.storageDir,cacheDir:state.cacheDir,driveLetter:state.driveLetter,locked:state.locked,mounted:state.mounted,operation:state.operation};
 });
 for(const key of ['storageDir','cacheDir','driveLetter'])assert.equal(value[key],fixture[key],'Packaged native fixture identity changed');
 assert.notEqual(value.driveLetter,'M:');return value;
}

// Caller injects the existing inspected package opener so tests never import or
// launch a browser. A closure error is preserved even when its later receipt
// proves absence; credential retirement needs that exact retained proof.
export async function openGuiAcceptancePackage({expected,evidenceRoot,runtime,openTarget,prepare,retire=forgetRuntimeFixture}){
 assert.equal(typeof openTarget,'function');assert.ok(path.isAbsolute(evidenceRoot));
 const producer=createPackagedFixturePreparation({prepare});let opened;
 try{
  opened=await openTarget(expected,{evidenceRoot,runtime:{...runtime,prepareProfile:context=>producer.prepareProfile(context)}});
  assert.ok(producer.fixture,'Packaged opener did not prepare the owned fixture');
  await opened.page.waitForFunction(()=>typeof window.drive?.status==='function');
  await observeOwnedPackagedFixture(opened.page,producer.fixture);
 }catch(error){
  if(opened)try{await opened.close();}catch{/* Exact lifecycle evidence remains with its owner. */}
  throw error;
 }
 let closed=false;
 return {...opened,fixture:producer.fixture,async close(){
  assert.equal(closed,false,'Packaged fixture closure has already been attempted');closed=true;
  let failure,closure;
  try{closure=await opened.close();}catch(error){failure=error;}
  const result={schemaVersion:1,sourceCommit:expected.sourceCommit,fixtureRetained:true,closureVerified:false};
  const absent=closure?.closure?.closure?.resourcesAbsent===true||closure?.closure?.resourcesAbsent===true;
  if(absent){result.closureVerified=true;result.retirement=await retire(producer.fixture);}
  else result.retirementPending='Exact owned process absence is not yet established';
  await fs.writeFile(path.join(evidenceRoot,'native-fixture-retirement.json'),JSON.stringify(result,null,2),{flag:'wx'});
  if(failure)throw failure;
  assert.equal(result.closureVerified,true,'Owned process absence remains unverified');
  assert.equal(result.retirement?.ownedCredentialForgotten,true,'Owned fixture credential retirement remains incomplete');
  return {...result,closure};
 }};
}
