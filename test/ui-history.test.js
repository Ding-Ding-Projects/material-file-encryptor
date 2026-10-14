import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRequest} from '../src/main/validation.js';
test('history requests reject traversal, invalid retention, duplicate restore IDs and transport credentials',()=>{
 assert.deepEqual(validateRequest('listVersions',{retentionDays:null}),{retentionDays:null});
 assert.deepEqual(validateRequest('saveVersion',{}),{});
 assert.deepEqual(validateRequest('restoreDeleted',{ids:['one','two']}),{ids:['one','two']});
 for(const value of [0,-1,1.5,36501,'30'])assert.throws(()=>validateRequest('listVersions',{retentionDays:value}));
 for(const ids of [[],['one','one'],['bad\0'],[5]])assert.throws(()=>validateRequest('restoreDeleted',{ids}));
 assert.throws(()=>validateRequest('saveVersion',{path:'../outside'}));
 const base={storageDir:'storage',cacheDir:'cache',driveLetter:'M',password:'example',transport:'privateGit'};
 assert.throws(()=>validateRequest('unlockVault',base));
 assert.throws(()=>validateRequest('unlockVault',{...base,remoteRepository:'https://github.com/owner/repo'}));
 assert.equal(validateRequest('unlockVault',{...base,remoteRepository:'owner/repo'}).driveLetter,'M:');
 assert.deepEqual(validateRequest('restoreVersion',{versionId:'a'.repeat(32)}),{versionId:'a'.repeat(32)});
 assert.throws(()=>validateRequest('restoreVersion',{id:'wrong-key'}));
 assert.throws(()=>validateRequest('setPartSize',{partSizeBytes:90000001}));
});

import fs from 'node:fs/promises';
import vm from 'node:vm';
test('preload maps history and recycle actions to exact bounded IPC parameter names',async()=>{
 let api;const calls=[];
 const electron={contextBridge:{exposeInMainWorld:(_name,value)=>{api=value;}},ipcRenderer:{invoke:(...args)=>{calls.push(args);return Promise.resolve([]);}}};
 vm.runInNewContext(await fs.readFile(new URL('../src/main/preload.cjs',import.meta.url),'utf8'),{require:()=>electron});
 await api.history({entryId:'entry',retentionDays:30});await api.saveVersion();await api.saveVersion('notes.txt');await api.restoreVersion('version');await api.recycled();await api.restoreDeleted(['one','two']);await api.emptyRecycleBin();await api.setHistoryRetention(null);
 assert.deepEqual(JSON.parse(JSON.stringify(calls)),[
 ['vault:request','listVersions',{entryId:'entry',retentionDays:30}],['vault:request','saveVersion',{}],['vault:request','saveVersion',{path:'notes.txt'}],['vault:request','restoreVersion',{versionId:'version'}],['vault:request','listDeleted',{}],['vault:request','restoreDeleted',{ids:['one','two']}],['vault:request','emptyRecycleBin',{}],['vault:request','setPreferences',{historyRetentionDays:null}]]);
});
test('regex worker returns matching IDs and rejects malformed expressions without returning paths',async()=>{
 let result;const self={postMessage:value=>{result=value;}};
 vm.runInNewContext(await fs.readFile(new URL('../src/renderer/search-worker.js',import.meta.url),'utf8'),{self});
 self.onmessage({data:{pattern:'^report\\.txt$',flags:'iu',rows:[{id:'one',path:'Report.txt'},{id:'two',path:'other.txt'}]}});
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{ids:['one']});
 self.onmessage({data:{pattern:'[',flags:'u',rows:[]}});assert.equal(result.error,'Invalid regular expression.');
});

import {buildSearchPattern} from '../src/renderer/scoped-search.js';
test('guided regex searches escape punctuation while custom expressions retain explicit meaning',()=>{
 const sample='notes[1].txt'; const exact=new RegExp(buildSearchPattern(sample,'Exact match'),'u');
 assert.equal(exact.test(sample),true);assert.equal(exact.test('notes1Xtxt'),false);assert.equal(exact.test('prefix'+sample),false);
 assert.equal(buildSearchPattern('^report.*','Custom expression'),'^report.*');
});

test('copy upgrade uses create-level validation and rejects omitted credentials or unknown keys',()=>{
 const options={storageDir:'new-storage',cacheDir:'new-cache',driveLetter:'M',password:'example',partSizeBytes:10485760,transport:'folder'};
 assert.equal(validateRequest('upgradeVault',options).driveLetter,'M:');
 assert.throws(()=>validateRequest('upgradeVault',{...options,password:undefined}));
 assert.throws(()=>validateRequest('upgradeVault',{...options,overwrite:true}));
});

import {deletedDescendantCandidates} from '../src/renderer/recycle-selection.js';
test('folder restoration offers only identity-linked descendants and preserves explicit original selections',()=>{
 const rows=[{id:'folder',path:'folder',isDirectory:true,descendantIds:['child','older','unknown']},{id:'child',path:'renamed.txt'},{id:'older',path:'folder/older.txt'},{id:'unrelated',path:'folder/path-is-not-proof.txt'}];
 assert.deepEqual(deletedDescendantCandidates(rows,['folder']).map(row=>row.id),['child','older']);
 assert.deepEqual(deletedDescendantCandidates(rows,['folder','child']).map(row=>row.id),['older']);
 assert.deepEqual(deletedDescendantCandidates(rows,['unrelated']),[]);
});

test('shared non-dialog error stays outside hidden views and bootstrap keeps that owner',async()=>{
 const html=await fs.readFile(new URL('../src/renderer/index.html',import.meta.url),'utf8');
 // The workspace host became the mfe-main-workspace component; the shared alert must still be its first child.
 assert.ok(/<(?:main|mfe-main-workspace)>\s*<div id="main-error"[^>]*role="alert"[^>]*hidden>/.test(html),'Shared alert must be a direct workspace child before the view containers');
 const source=await fs.readFile(new URL('../src/renderer/app.js',import.meta.url),'utf8');
 const relocation=source.match(/^\$\('view-drive'\)\.prepend\([^\n]+/m)?.[0];assert.ok(relocation);
 const operation={owner:'initial'},alert={owner:'main'};
 const nodes={'operation':operation,'main-error':alert,'view-drive':{prepend(...items){for(const item of items)item.owner='view-drive';}}};
 vm.runInNewContext(relocation,{$:id=>nodes[id]});assert.equal(operation.owner,'view-drive');assert.equal(alert.owner,'main','Bootstrap must not reparent the shared alert into a view');
 const show=source.slice(source.indexOf('function showError('),source.indexOf('function toast('));
 assert.match(show,/inDialog \? 'dialog-error' : 'main-error-text'/);assert.match(show,/inDialog \? 'dialog-error' : 'main-error'/);assert.doesNotMatch(show,/changeView|activate\(/);
 assert.match(source,/listen\('dismiss-error','click',\(\) => \{ \$\('main-error'\)\.hidden = true; \}\)/);
});
