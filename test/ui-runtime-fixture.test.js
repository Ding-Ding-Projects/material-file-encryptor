import test from 'node:test';
import assert from 'node:assert/strict';
import {fixturePreferences,runtimeCompletion,prepareGuiVaultFixture,retireGuiVaultKey,makeGuiVaultFormSteps} from '../scripts/preview-runtime-fixture.mjs';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import os from 'node:os';
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
