import test from 'node:test';
import assert from 'node:assert/strict';
import {fixturePreferences,runtimeCompletion} from '../scripts/preview-runtime-fixture.mjs';
import fs from 'node:fs/promises';
import vm from 'node:vm';
test('synchronization completion remains separate from the quiet version interval',()=>{
 const state={operation:null,sync:{running:false,pendingCommits:0},transport:{available:true,pendingSynchronization:false},history:{pendingVersionCount:1}};
 assert.equal(runtimeCompletion(state,{synchronized:true}).ready,true);
 assert.equal(runtimeCompletion({...state,transport:{mode:'privateGit',available:true,pendingPublication:true}},{synchronized:true}).ready,false);
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

test('physical synchronization does not wait for quiet version snapshots and still rejects unpublished private data',()=>{
 const state={operation:null,sync:{running:false,pendingCommits:0},transport:{mode:'folder',available:true},history:{pendingVersionCount:1}};
 assert.equal(runtimeCompletion(state,{synchronized:true}).ready,true);
 assert.equal(runtimeCompletion({...state,sync:{running:false,pendingCommits:1}},{synchronized:true}).ready,false);
 for(const pendingPublication of [true,undefined])assert.equal(runtimeCompletion({...state,transport:{mode:'privateGit',available:true,pendingPublication}},{synchronized:true}).ready,false);
 assert.equal(runtimeCompletion({...state,transport:{mode:'privateGit',available:true,pendingPublication:false}},{synchronized:true}).ready,true);
 assert.equal(runtimeCompletion({...state,sync:{running:false,sourceAvailable:true,pendingCommits:0},transport:{mode:'privateGit',available:false,pendingPublication:false}},{synchronized:true}).ready,false);
});
