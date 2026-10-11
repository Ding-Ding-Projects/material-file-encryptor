import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {preparePackagedProfile,proveStableRendererTree} from '../scripts/test-renderer-browser.mjs';
import {createPackagedFixturePreparation,observeOwnedPackagedFixture} from '../scripts/gui-acceptance-packaged.mjs';

test('packaged profile hook requires fresh ownership and rechecks source bytes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-profile-hook-'));const profile=path.join(root,'profile');await fs.mkdir(profile);
 let checks=0,calls=0;const target={kind:'extracted-packaged-runtime',sourceCommit:'a'.repeat(40),revalidate:async()=>{checks++;}};
 try{
  await assert.rejects(preparePackagedProfile({runtime:{prepareProfile:async()=>{calls++;}},runRoot:root}),/validated packaged/);assert.equal(calls,0);
  await fs.writeFile(path.join(profile,'existing'),'owned test');
  await assert.rejects(preparePackagedProfile({runtime:{prepareProfile:async()=>{calls++;}},packagedTarget:target,runRoot:root}),/fresh/);assert.equal(calls,0);await fs.unlink(path.join(profile,'existing'));
  await assert.rejects(preparePackagedProfile({runtime:{prepareProfile:async()=>({ownedSyntheticFixture:true,sourceCommit:'b'.repeat(40)})},packagedTarget:target,runRoot:root}),/source binding/);
  checks=0;
  const result=await preparePackagedProfile({runtime:{prepareProfile:async input=>{assert.equal(input.profile,profile);return {ownedSyntheticFixture:true,sourceCommit:target.sourceCommit};}},packagedTarget:target,runRoot:root});
  assert.equal(checks,2);assert.equal(result.profilePrepared,true);
 }finally{await fs.rmdir(profile);await fs.rmdir(root);}
});

test('native producer rejects reserved drive and repeated preparation',async()=>{
 const context={profile:'profile',target:{kind:'extracted-packaged-runtime',sourceCommit:'a'.repeat(40),executable:'executable'}};
 const bad=createPackagedFixturePreparation({prepare:async()=>({prepared:true,driveLetter:'M:'})});await assert.rejects(bad.prepareProfile(context));
 const good=createPackagedFixturePreparation({prepare:async()=>({prepared:true,driveLetter:'N:'})});assert.equal((await good.prepareProfile(context)).ownedSyntheticFixture,true);await assert.rejects(good.prepareProfile(context),/only be prepared once/);
});

test('packaged observation refuses unrelated native storage before capture',async()=>{
 const fixture={storageDir:'owned',cacheDir:'cache',driveLetter:'N:'};
 await assert.rejects(observeOwnedPackagedFixture({evaluate:async()=>({...fixture,storageDir:'other'})},fixture),/identity changed/);
 assert.equal((await observeOwnedPackagedFixture({evaluate:async()=>({...fixture,locked:true,mounted:false})},fixture)).locked,true);
});
test('transient child inventory gets at most three full proofs without weakening identity errors',async()=>{
 let calls=0;const churn=()=>Object.assign(new Error('helper'),{lifecycleObservation:{stderr:'renderer_snapshot.SnapshotError: Process ancestry changed during inventory.'}});
 assert.equal(await proveStableRendererTree(async()=>{calls++;if(calls<2)throw churn();return 'proved';},{wait:async()=>{}}),'proved');assert.equal(calls,2);
 calls=0;await assert.rejects(proveStableRendererTree(async()=>{calls++;throw churn();},{wait:async()=>{}}));assert.equal(calls,3);
 calls=0;await assert.rejects(proveStableRendererTree(async()=>{calls++;throw Object.assign(new Error('identity'),{lifecycleObservation:{stderr:'Process identity changed during inventory.'}});},{wait:async()=>{}}));assert.equal(calls,1);
});
