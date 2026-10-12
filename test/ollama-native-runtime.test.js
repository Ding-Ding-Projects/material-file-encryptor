import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagedOllamaRuntimeAdapter} from '../src/main/ollama-native-runtime.js';
const id='a'.repeat(32);
const status=(extra={})=>({available:true,startAvailable:true,operationId:id,phase:'running',processId:12,activeProcesses:1,exitVerified:false,leaseReleased:false,...extra});
const stopped=()=>status({phase:'stopped',activeProcesses:0,exitVerified:true,leaseReleased:true});
test('concurrent launch is rejected and close retains delayed startup until exact settlement',async()=>{
 let resolveStart;const calls=[];
 const adapter=createManagedOllamaRuntimeAdapter({nativeRequest:async(method,payload)=>{calls.push([method,payload]);if(method==='managedOllama.start')return new Promise(resolve=>{resolveStart=resolve;});return stopped();}});
 const launch=adapter.launch();const rejected=assert.rejects(launch,/did not start/);
 await assert.rejects(adapter.launch(),/settle/);
 const close=adapter.close();assert.equal(adapter.pending,1);resolveStart(status());await rejected;await close;
 assert.equal(adapter.pending,0);assert.equal(calls.filter(([method])=>method==='managedOllama.start').length,1);
 assert.deepEqual(calls[0][1],{port:11434});
});
test('unknown tree exit retains ownership and close can retry without another launch',async()=>{
 let settled=false;const adapter=createManagedOllamaRuntimeAdapter({nativeRequest:async method=>method==='managedOllama.start'?status():settled?stopped():status({phase:'unknown'})});
 const handle=await adapter.launch();await assert.rejects(handle.stop(),/confirmed exit/);assert.equal(adapter.pending,1);
 await assert.rejects(adapter.close(),/active or unknown/);assert.equal(adapter.pending,1);settled=true;await adapter.close();assert.equal(adapter.pending,0);
});
test('concurrent stop and close share exact settlement without retired identity requests',async()=>{
 let finish;const calls=[];const adapter=createManagedOllamaRuntimeAdapter({nativeRequest:async method=>{calls.push(method);if(method==='managedOllama.start')return status();if(method==='managedOllama.stop')return new Promise(resolve=>{finish=()=>resolve(stopped());});return stopped();}});
 const handle=await adapter.launch();const stop=handle.stop();const close=adapter.close();finish();await Promise.all([stop,close]);assert.equal(calls.filter(method=>method==='managedOllama.close').length,1);assert.equal(adapter.pending,0);
});
test('bounded snapshots reject malformed identity and suppress native diagnostic paths',async()=>{
 const adapter=createManagedOllamaRuntimeAdapter({nativeRequest:async()=>{throw new Error('private-path-fixture');}});await assert.rejects(adapter.launch(),error=>!error.message.includes('private-path-fixture'));assert.equal(await adapter.available(),false);
 const invalid=createManagedOllamaRuntimeAdapter({nativeRequest:async()=>status({operationId:'bad'})});await assert.rejects(invalid.launch(),/could not complete/);
});
test('proven no-child startup releases ownership without inventing process exit proof',async()=>{
 let starts=0;const noChild=()=>status({phase:'stopped',processId:null,activeProcesses:0,leaseReleased:true,exitVerified:false});
 const adapter=createManagedOllamaRuntimeAdapter({nativeRequest:async method=>{if(method==='managedOllama.start')starts++;return noChild();}});
 await assert.rejects(adapter.launch(),/did not start/);assert.equal(adapter.pending,0);
 await assert.rejects(adapter.launch(),/did not start/);assert.equal(starts,2);assert.equal(adapter.pending,0);await adapter.close();
});
