import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareEmptyLegacyGuiVault,fixturePreferences,runtimeCompletion,prepareGuiVaultFixture,retireGuiVaultKey,makeGuiVaultFormSteps,actionPollSteps,forgetRuntimeFixture} from '../scripts/preview-runtime-fixture.mjs';
import {EventEmitter} from 'node:events';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import os from 'node:os';
test('UI rejection ends its wait and preserves a separate negative result',()=>{
 const steps=actionPollSteps('sync','#sync-button','ready');
 for(const [hidden,ready,expected]of [[true,false,false],[true,true,true],[false,false,true]]){
  const document={querySelector:()=>({hidden,textContent:'Backend rejected the operation'})};
  assert.equal(vm.runInNewContext(steps[1].expression,{document,ready}),expected);
  assert.equal(vm.runInNewContext(steps[2].expression,{document}).applicationError,!hidden);
 }
});
test('failed-run retirement covers registered GUI and legacy identities and owned key only',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'mfe-retirement-test-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const fixture={root,driveLetter:'M:',storageDir:path.join(root,'storage'),cacheDir:path.join(root,'cache'),nativeExecutable:'owned-helper'};
 await fs.mkdir(fixture.storageDir);await fs.mkdir(fixture.cacheDir);await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify(fixture));const gui=await prepareGuiVaultFixture(fixture);
 for(const folder of [gui.storageDir,gui.cacheDir])await fs.writeFile(path.join(folder,'vault.json'),JSON.stringify({Format:2}));
 const legacy=(await prepareEmptyLegacyGuiVault(gui,{locked:true,mounted:false,emptyBeforeLock:true})).gui;
 const calls=[];const createClient=()=>({child:new EventEmitter(),async request(method,args){calls.push({method,args});},dispose(){this.child.emit('exit',0);}});
 const result=await forgetRuntimeFixture(fixture,{createClient});assert.deepEqual(result.ownedFixtureCredentialsForgotten,['gui','legacy']);assert.equal(result.ownedKeyRetired,true);
 assert.deepEqual(calls.map(c=>c.args.storageDir),[fixture.storageDir,gui.storageDir,legacy.storageDir]);assert.ok(calls.every(c=>c.method==='forgetSavedCredential'));await assert.rejects(fs.access(gui.keyFilePath),{code:'ENOENT'});
 const manifest=path.join(root,'owned-gui-fixture.json');const record=JSON.parse(await fs.readFile(manifest));record.storageDir=path.dirname(root);await fs.writeFile(manifest,JSON.stringify(record));calls.length=0;await assert.rejects(forgetRuntimeFixture(fixture,{createClient}));assert.equal(calls.length,0);
});
test('synchronization completion remains separate from the quiet version interval',()=>{
 const state={operation:null,sync:{running:false,pendingCommits:0},transport:{available:true,pendingSynchronization:false},history:{pendingVersionCount:1}};
 assert.equal(runtimeCompletion(state,{synchronized:true}).ready,true);
 assert.equal(runtimeCompletion({...state,transport:{...state.transport,pendingSynchronization:true}},{synchronized:true}).ready,false);
 assert.equal(runtimeCompletion({...state,sync:{...state.sync,running:true}}).ready,true);
 assert.equal(runtimeCompletion({...state,operation:'restoreDeleted'}).ready,false);
 assert.equal(runtimeCompletion(state,{applicationError:true}).failed,true);
});
test('owned fixture preferences contain paths and DPAPI opt-in without credential material',()=>{
 const value=fixturePreferences({storageDir:'owned/storage',cacheDir:'owned/cache',driveLetter:'M:',password:'must-not-copy',keyFilePath:'must-not-copy'});
 assert.deepEqual(value,{startup:false,autoUnlock:true,storageDir:'owned/storage',cacheDir:'owned/cache',driveLetter:'M:',transport:'folder',historyRetentionDays:null});assert.equal(Object.hasOwn(value,'password'),false);assert.equal(Object.hasOwn(value,'keyFilePath'),false);
});
test('verification quit uses its dedicated channel without accepting arbitrary operations',async()=>{
 let api;const calls=[];vm.runInNewContext(await fs.readFile(new URL('../src/main/preload.cjs',import.meta.url),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>{api=value;}},ipcRenderer:{invoke:(...args)=>{calls.push(args);return Promise.resolve();}}})});await api.verificationQuit();assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['vault:verification-quit']]);
});
test('GUI vault plans use real controls, capture each input, and normalize manual drive letters',()=>{
 const root=path.join(os.tmpdir(),'owned-gui-fixture');const gui={root,storageDir:path.join(root,'gui-storage'),cacheDir:path.join(root,'gui-cache'),keyFilePath:path.join(root,'gui-verification.key'),driveLetter:'M:'};
 for(const mode of ['create','unlock']) {
  const steps=makeGuiVaultFormSteps(gui,mode,path.join(root,'captures'));assert.ok(steps.length<=100);
  for(const [index,step]of steps.entries())if(['click','type'].includes(step.op)){assert.equal(steps[index+1].op,'poll');assert.equal(steps[index+2].op,'capture');assert.equal(steps[index+2].overwrite,false);}
  assert.equal(steps.some(step=>step.selector?.includes('password')),false);assert.equal(JSON.stringify(steps).includes('window.drive.'),false);
  assert.equal(steps.find(step=>step.selector==='#storage-input').text,gui.storageDir);assert.equal(steps.find(step=>step.selector==='#cache-input').text,gui.cacheDir);assert.equal(steps.find(step=>step.selector==='#key-path').text,gui.keyFilePath);
  if(mode==='create'){assert.ok(steps.some(step=>step.selector==='#drive-letter-toggle'));assert.ok(steps.some(step=>step.selector==='#drive-letter-options button[data-letter="M"]'));}
  else {assert.equal(steps.find(step=>step.selector==='#drive-letter').text,'m:');assert.ok(steps.some(step=>step.expression?.includes('value === "M:"')));}
 }
});
test('GUI fixture preserves its generated key until exact owned-path retirement',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-gui-fixture-test-'));
 try {
  const fixture={root,driveLetter:'M:'};await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify(fixture));const gui=await prepareGuiVaultFixture(fixture);
  assert.equal(path.dirname(gui.storageDir),root);assert.equal(path.dirname(gui.cacheDir),root);assert.equal(path.dirname(gui.keyFilePath),root);assert.notEqual(path.dirname(gui.keyFilePath),gui.storageDir);assert.notEqual(path.dirname(gui.keyFilePath),gui.cacheDir);
  assert.equal((await fs.lstat(gui.keyFilePath)).isFile(),true);
  await assert.rejects(retireGuiVaultKey({...gui,keyFilePath:path.join(root,'unowned.key')}));await fs.access(gui.keyFilePath);
  await assert.rejects(retireGuiVaultKey({...gui,cacheDir:path.join(path.dirname(root),'unowned-cache')}));await fs.access(gui.keyFilePath);
  assert.deepEqual(await retireGuiVaultKey(gui),{ownedKeyRetired:true});await assert.rejects(fs.access(gui.keyFilePath),error=>error.code==='ENOENT');
 }finally{await fs.rm(root,{recursive:true});}
});

test('legacy conversion rejects mounted, nonempty, foreign and unexpected-format fixtures before writing',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-legacy-test-'));const gui={root,storageDir:path.join(root,'gui-storage'),cacheDir:path.join(root,'gui-cache')};
 try {
  for(const folder of [gui.storageDir,gui.cacheDir]){await fs.mkdir(folder);await fs.writeFile(path.join(folder,'vault.json'),JSON.stringify({Format:2,marker:'preserved'}));}
  for(const observed of [{locked:false,mounted:false,emptyBeforeLock:true},{locked:true,mounted:true,emptyBeforeLock:true},{locked:true,mounted:false,emptyBeforeLock:false}])await assert.rejects(prepareEmptyLegacyGuiVault(gui,observed));
  const observed={locked:true,mounted:false,emptyBeforeLock:true};await assert.rejects(prepareEmptyLegacyGuiVault({...gui,storageDir:path.dirname(root)},observed));
  await fs.writeFile(path.join(gui.cacheDir,'vault.json'),JSON.stringify({Format:1}));await assert.rejects(prepareEmptyLegacyGuiVault(gui,observed));assert.equal(JSON.parse(await fs.readFile(path.join(gui.storageDir,'vault.json'),'utf8')).Format,2);
  await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify({root,nativeExecutable:'owned-helper'}));
  await fs.writeFile(path.join(gui.cacheDir,'vault.json'),JSON.stringify({Format:2,marker:'preserved'}));
  const converted=await prepareEmptyLegacyGuiVault(gui,observed);assert.equal(converted.format,1);
  for(const folder of [gui.storageDir,gui.cacheDir])assert.deepEqual(JSON.parse(await fs.readFile(path.join(folder,'vault.json'),'utf8')),{Format:2,marker:'preserved'});
  for(const folder of [converted.gui.storageDir,converted.gui.cacheDir]){assert.notEqual(folder,gui.storageDir);assert.notEqual(folder,gui.cacheDir);assert.deepEqual(JSON.parse(await fs.readFile(path.join(folder,'vault.json'),'utf8')),{Format:1,marker:'preserved'});assert.deepEqual(await fs.readdir(folder),['vault.json']);}
  await assert.rejects(prepareEmptyLegacyGuiVault(gui,observed),{code:'EEXIST'});
 } finally {await fs.rm(root,{recursive:true});}
});
test('registered empty upgrade pair is never-created but nonempty missing-header target remains unverified',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'mfe-empty-retirement-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const fixture={root,storageDir:path.join(root,'storage'),cacheDir:path.join(root,'cache'),nativeExecutable:'owned-helper'};
 for(const directory of [fixture.storageDir,fixture.cacheDir,path.join(root,'upgrade-storage'),path.join(root,'upgrade-cache')])await fs.mkdir(directory);
 await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify(fixture));
 const target={version:1,root,nativeExecutable:fixture.nativeExecutable,storageDir:path.join(root,'upgrade-storage'),cacheDir:path.join(root,'upgrade-cache')};
 await fs.writeFile(path.join(root,'owned-upgrade-fixture.json'),JSON.stringify(target));
 const calls=[];const createClient=()=>({child:new EventEmitter(),async request(method,args){calls.push(args);if(args.storageDir===target.storageDir)throw Object.assign(new Error('Missing header'),{code:'ENOENT'});},dispose(){this.child.emit('exit',0);}});
 let result=await forgetRuntimeFixture(fixture,{createClient});assert.equal(result.ownedCredentialForgotten,true);assert.equal(result.targetRetirement[1].status,'never-created');assert.equal(calls.length,1);
 for(const directory of [target.storageDir,target.cacheDir]){
  const file=path.join(directory,'unexpected');await fs.writeFile(file,'preserve');calls.length=0;
  result=await forgetRuntimeFixture(fixture,{createClient});assert.equal(result.ownedCredentialForgotten,false);assert.equal(result.targetRetirement[1].status,'failed');assert.equal(calls.length,2);assert.equal(await fs.readFile(file,'utf8'),'preserve');await fs.unlink(file);
 }
 await fs.writeFile(path.join(target.storageDir,'vault.json'),'corrupt');result=await forgetRuntimeFixture(fixture,{createClient});assert.equal(result.ownedCredentialForgotten,false);
 // A noncanonical link is rejected before any native mutation, even when its destination is empty.
 await fs.unlink(path.join(target.storageDir,'vault.json'));await fs.rmdir(target.storageDir);const other=path.join(root,'other-empty');await fs.mkdir(other);await fs.symlink(other,target.storageDir,'junction');calls.length=0;
 await assert.rejects(forgetRuntimeFixture(fixture,{createClient}));assert.equal(calls.length,0);
});
test('one credential error does not suppress later registered targets or owned key retirement',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'mfe-partial-retirement-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const fixture={root,driveLetter:'M:',storageDir:path.join(root,'storage'),cacheDir:path.join(root,'cache'),nativeExecutable:'owned-helper'};
 await fs.mkdir(fixture.storageDir);await fs.mkdir(fixture.cacheDir);await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify(fixture));const gui=await prepareGuiVaultFixture(fixture);await fs.writeFile(path.join(gui.storageDir,'vault.json'),'existing');
 const calls=[];const createClient=()=>({child:new EventEmitter(),async request(method,args){calls.push(args);if(args.storageDir===fixture.storageDir)throw Object.assign(new Error('Unavailable'),{code:'EACCES'});},dispose(){this.child.emit('exit',0);}});
 const result=await forgetRuntimeFixture(fixture,{createClient});assert.equal(result.ownedCredentialForgotten,false);assert.equal(result.targetRetirement[0].code,'EACCES');assert.equal(result.targetRetirement[1].status,'forgotten');assert.equal(calls.length,2);assert.equal(result.ownedKeyRetired,true);await assert.rejects(fs.access(gui.keyFilePath),{code:'ENOENT'});
});
