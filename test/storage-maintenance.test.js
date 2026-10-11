import test from 'node:test';
import assert from 'node:assert/strict';
import {partBytes, operationProgress, activePacking} from '../src/renderer/features/storage-maintenance/model.js';
import {validateRequest} from '../src/main/validation.js';
import {LOCAL_ADAPTER_ACTIONS} from '../src/main/local-adapter.js';

test('physical MiB conversion keeps the 80 MiB default and enforces the physical maximum',()=>{
 assert.equal(partBytes('80'),83886080);assert.equal(partBytes('85.8306884765625'),90000000);
 for(const value of ['',0,-1,86,'NaN',Infinity,'0.0000001'])assert.throws(()=>partBytes(value));
});
test('packing admission accepts defaults and rejects traversal, unexpected fields and oversized parts',()=>{
 assert.deepEqual(validateRequest('startPacking',{}),{});
 assert.deepEqual(validateRequest('startPacking',{path:'folder/file.bin',partSizeBytes:83886080}),{path:'folder/file.bin',partSizeBytes:83886080});
 for(const payload of [{path:'../file'},{path:'C:\\file'},{path:'/file'},{partSizeBytes:90000001},{partSizeBytes:1.5},{destination:'elsewhere'}])assert.throws(()=>validateRequest('startPacking',payload));
 assert.deepEqual(validateRequest('storageDiagnostics',{}),{});assert.throws(()=>validateRequest('storageDiagnostics',{path:'file'}));
 assert.ok(LOCAL_ADAPTER_ACTIONS.includes('startPacking'));assert.ok(LOCAL_ADAPTER_ACTIONS.includes('storageDiagnostics'));
});
test('progress never fabricates a percentage before totals exist and cancellation uses only active packing',()=>{
 assert.equal(operationProgress({bytesCompleted:10,totalBytes:0}),null);assert.equal(operationProgress({bytesCompleted:50,totalBytes:100}),.5);assert.equal(operationProgress({bytesCompleted:200,totalBytes:100}),1);
 for(const state of ['queued','running','cancelling'])assert.equal(activePacking({kind:'packing',state}),true);
 assert.equal(activePacking({kind:'import',state:'running'}),false);assert.equal(activePacking({kind:'packing',state:'completed'}),false);
});
