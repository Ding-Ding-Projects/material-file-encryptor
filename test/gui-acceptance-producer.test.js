import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {sha256} from '../scripts/gui-acceptance.mjs';
import {readPackagedBuildBinding,createPackagedAdapters,createPackagedAccessFixture,acquirePackagedBaseline,acquirePackagedDiagnosticSubset,runEvidenceJson} from '../scripts/gui-acceptance-producer.mjs';
import {createPlanRecorder} from '../scripts/local-headless-desktop-check.mjs';

test('all 122 inventoried states compose once with every exact action and no fixture side effects',async()=>{
 const inventory=JSON.parse(await fs.readFile(new URL('../contracts/gui-states.json',import.meta.url)));
 let mutations=0;
 const adapters=createPackagedAdapters({inventory,launch:{cdp:{port:54321,expectedUrl:'file:///owned/app.asar/src/renderer/index.html'}},receipt:path.resolve('owned-receipt.json'),prepareOwnedFixture:async()=>{mutations++;},fixtures:{}});
 assert.equal(mutations,0);assert.equal(Object.keys(adapters).length,122);assert.deepEqual(Object.keys(adapters).sort(),inventory.states.map(state=>state.id).sort());
 for(const state of inventory.states)assert.deepEqual(Object.keys(adapters[state.id].actions).sort(),[...state.actions].sort(),state.id);
});

test('copied package binding requires the successful original build and unchanged bytes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-package-build-binding-'));
 const files=Object.fromEntries(['executable','asar','nativeHost'].map(key=>[key,path.join(root,key)])),hashes={};
 for(const [key,file]of Object.entries(files)){await fs.writeFile(file,key);hashes[key]=sha256(key);}
 const target={sourceCommit:'a'.repeat(40),executable:files.executable,files,hashes};
 const receipt=path.join(root,'build.json');
 const build={sourceCommit:target.sourceCommit,sourceEndCommit:target.sourceCommit,sourceClean:true,buildExitCode:0,artifactSha256:hashes.executable,asarSha256:hashes.asar,artifactPath:'original-build-location'};
 const write=value=>fs.writeFile(receipt,JSON.stringify(value));
 try{
  await write(build);assert.equal((await readPackagedBuildBinding(target,receipt)).artifactPath,files.executable);
  for(const patch of [{sourceEndCommit:'b'.repeat(40)},{sourceClean:false},{buildExitCode:1},{asarSha256:'c'.repeat(64)}]){await write({...build,...patch});await assert.rejects(readPackagedBuildBinding(target,receipt));}
  await write(build);await fs.writeFile(files.nativeHost,'changed');await assert.rejects(readPackagedBuildBinding(target,receipt));
 }finally{for(const file of [...Object.values(files),receipt])await fs.unlink(file);await fs.rmdir(root);}
});

test('default access fixture wiring is lazy and preserves explicit caller providers',()=>{
 let inspected=0;const opened=new Proxy({}, {get(){inspected++;throw Error('Baseline must not inspect access session');}});
 const fixture=createPackagedAccessFixture({opened});assert.equal(inspected,0);assert.equal(typeof fixture.prepare,'function');
 const supplied={prepare(){throw Error('Not called during composition');}};assert.equal(createPackagedAccessFixture({opened,fixtures:{access:supplied}}),supplied);assert.equal(inspected,0);
 assert.equal(createPackagedAccessFixture({opened,fixtures:{access:null}}),null);assert.equal(inspected,0);
 assert.throws(()=>fixture.assertCapabilities('access-profile-locked',['begin-unlock']),/CAPABILITY_UNAVAILABLE: access requires a verified owned packaged session/);assert.ok(inspected>0);
});
test('actual packaged session shape admits supported capabilities without control or filesystem work',()=>{
 let touched=0;const opened={connectionOwned:true,receipt:{launched:true,connectionOwned:true},runRoot:path.resolve('owned-run'),statePath:path.resolve('owned-run/lifecycle.json'),receiptPath:path.resolve('owned-run/packaged-runtime-binding.json'),target:{kind:'extracted-packaged-runtime',sourceCommit:'a'.repeat(40)},fixture:{prepared:true,driveLetter:'Q:'},page:{evaluate(){touched++;throw Error('Capability declaration must not drive controls');}}};
 const fixture=createPackagedAccessFixture({opened});fixture.assertCapabilities('access-profile-locked',['begin-unlock','cancel-unlock']);assert.equal(touched,0);
 assert.throws(()=>fixture.assertCapabilities('access-history-unlocked',['restore-entry']),/CAPABILITY_UNAVAILABLE/);assert.equal(touched,0);
});

test('packaged producer rejects an implicit or partial full request before reading its live session',async()=>{
 const inventory=JSON.parse(await fs.readFile(new URL('../contracts/gui-states.json',import.meta.url)));let touched=0;const opened=new Proxy({}, {get(){touched++;throw Error('Unexpected session read');}});
 await assert.rejects(acquirePackagedBaseline({opened,inventory}),/Explicit nonempty/);
 await assert.rejects(acquirePackagedDiagnosticSubset({opened,inventory}),/Explicit nonempty/);
 assert.equal(touched,0);
});

test('default producer audit includes registry states as unavailable until real providers are supplied',async()=>{
 const {acquisitionCapabilities}=await import('../scripts/gui-acceptance-acquire.mjs');
 const {createMountedFoundationFixtures,createKeyboardFoundationFixtures}=await import('../scripts/gui-acceptance-native-files.mjs');
 const inventory=JSON.parse(await fs.readFile(new URL('../contracts/gui-states.json',import.meta.url)));let touched=0;
 const opened={connectionOwned:true,receipt:{launched:true,connectionOwned:true},runRoot:path.resolve('owned-run'),statePath:path.resolve('owned-run/lifecycle.json'),receiptPath:path.resolve('owned-run/packaged-runtime-binding.json'),target:{kind:'extracted-packaged-runtime',sourceCommit:'a'.repeat(40)},fixture:{prepared:true,driveLetter:'Q:'},page:{evaluate(){touched++;throw Error('No runtime in preflight');}}};
 const fixtures={access:createPackagedAccessFixture({opened}),foundation:{...createMountedFoundationFixtures({opened}),...createKeyboardFoundationFixtures({opened})}};
 const adapters=createPackagedAdapters({inventory,launch:{cdp:{port:54321,expectedUrl:'file:///owned/app.asar/src/renderer/index.html'}},receipt:opened.statePath,prepareOwnedFixture:()=>{touched++;throw Error('No fixture mutation');},fixtures});
 const audit=acquisitionCapabilities(inventory,adapters,{inspectProviders:true});
 const declared='drive-locked drive-populated drive-selected drive-overflow drive-search offline-populated tools-default settings-default help-default create-password create-private-repository ollama-help p-language p-schedules-draft p-attention access-removal access-profile-locked access-profile-unlocked access-authenticator-registration access-qr-hidden access-confirmation p-schedule-narrator p-schedule-attention'.split(' ');
 assert.deepEqual(audit.filter(row=>row.provider==='declared').map(row=>row.state),declared);assert.equal(audit.filter(row=>row.provider==='unavailable').length,66+33);assert.equal(touched,0);
 for(const row of audit.filter(row=>row.provider==='unavailable'))assert.match(row.reason,/^CAPABILITY_UNAVAILABLE:/);
 delete fixtures.foundation['drive-overflow']['open-context'];const missing=acquisitionCapabilities(inventory,adapters,{inspectProviders:true}).find(row=>row.state==='drive-overflow');assert.equal(missing.provider,'unavailable');assert.match(missing.reason,/open-context/);assert.equal(touched,0);
 const doc=await fs.readFile('scripts/gui-acquisition-providers.md','utf8');for(const row of audit)assert.ok(doc.includes('| '+String.fromCharCode(96)+row.state+String.fromCharCode(96)+' |'),'Missing documented state '+row.state);
});

test('failed helper output retains its bounded structured cause and exit code in the plan receipt',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-helper-failure-'));
 const payload={ok:false,code:'SYNTHETIC_POLL_FAILURE',error:'ready: predicate remained false',results:[{id:'ready',op:'poll',value:{matched:false,value:false,attempts:2}}]};
 const plan={steps:[{id:'ready',op:'poll'}]};
 const record=createPlanRecorder(root,input=>runEvidenceJson(process.execPath,['-e',`process.stdout.write(${JSON.stringify(JSON.stringify(payload))});process.exitCode=1;`],input));
 try{
  await assert.rejects(record(plan),error=>error.helperCode===payload.code&&error.helperStep.id==='ready'&&error.helperDetails.processExitCode===1);
  const stored=JSON.parse((await fs.readFile(path.join(root,'step-receipts.jsonl'),'utf8')).trim());
  assert.deepEqual(stored.result,payload);assert.equal(stored.failure.processExitCode,1);assert.deepEqual(stored.failure.step,{id:'ready',op:'poll'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
