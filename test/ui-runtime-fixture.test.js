import test from 'node:test';
import assert from 'node:assert/strict';
import {fixturePreferences} from '../scripts/preview-runtime-fixture.mjs';
import fs from 'node:fs/promises';
import vm from 'node:vm';
test('owned fixture preferences contain paths and DPAPI opt-in without credential material',()=>{
 const value=fixturePreferences({storageDir:'owned/storage',cacheDir:'owned/cache',driveLetter:'M:',password:'must-not-copy',keyFilePath:'must-not-copy'});
 assert.deepEqual(value,{startup:false,autoUnlock:true,storageDir:'owned/storage',cacheDir:'owned/cache',driveLetter:'M:',transport:'folder',historyRetentionDays:null});assert.equal(Object.hasOwn(value,'password'),false);assert.equal(Object.hasOwn(value,'keyFilePath'),false);
});
test('verification quit uses its dedicated channel without accepting arbitrary operations',async()=>{
 let api;const calls=[];vm.runInNewContext(await fs.readFile(new URL('../src/main/preload.cjs',import.meta.url),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>{api=value;}},ipcRenderer:{invoke:(...args)=>{calls.push(args);return Promise.resolve();}}})});await api.verificationQuit();assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['vault:verification-quit']]);
});
