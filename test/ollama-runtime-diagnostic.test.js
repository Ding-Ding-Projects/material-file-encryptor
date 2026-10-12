import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeDiagnostic} from '../src/features/ollama/runtime-diagnostic.js';
import {createManagedOllamaRuntimeAdapter} from '../src/main/ollama-native-runtime.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRuntimeController} from '../src/features/ollama/runtime.js';
test('diagnostics project only fixed categories and bounded numeric native codes',()=>{
 const result=runtimeDiagnostic({stage:'process-create',category:'native-call',nativeCode:5,message:'private-message',path:'private-path',stack:'private-stack',environment:'private-env'});
 assert.deepEqual(result,{stage:'process-create',category:'native-call',nativeCode:5});assert.equal(Object.isFrozen(result),true);
 for(const value of [{stage:'private-stage',category:'native-call'},{stage:'process-create',category:'private-category'},null])assert.equal(runtimeDiagnostic(value),null);
 for(const nativeCode of [Infinity,2**40,'5',{}])assert.equal(runtimeDiagnostic({stage:'process-create',category:'native-call',nativeCode}).nativeCode,null);
 assert.equal(runtimeDiagnostic({stage:'environment',category:'state',nativeCode:5}).nativeCode,null);
});
test('failed no-child launch preserves sanitized diagnostics without adopting ownership',async()=>{
 const adapter=createManagedOllamaRuntimeAdapter({nativeRequest:async method=>{if(method==='managedOllama.start')throw new Error('private-error');return {available:true,startAvailable:true,operationId:null,phase:'idle',processId:null,activeProcesses:null,exitVerified:false,leaseReleased:false,diagnostic:{stage:'runtime-inventory',category:'access',nativeCode:null,message:'private-message'}};}});
 await assert.rejects(adapter.launch(),/could not complete/);assert.equal(adapter.pending,0);assert.deepEqual(adapter.diagnostic,{stage:'runtime-inventory',category:'access',nativeCode:null});await adapter.close();
});
test('native startup stages retain original settlement and omit exception text',async()=>{
 const source=await fs.readFile(new URL('../native/MaterialFileEncryptor.Host/OllamaRuntimeBroker.cs',import.meta.url),'utf8');
 assert.match(source,/diagnostic=Diagnostic\(owner.StartStage\?\?stage,error\)/);
 assert.match(source,/if\(!owner.ReleaseBeforeSpawnIfKnown\(\)\)\{owner.Stop\(\);await Settle\(owner\);\}/);
 const projection=source.slice(source.indexOf('private static object Diagnostic'),source.indexOf('#if OLLAMA_LIFETIME_VERIFIER'));
 assert.doesNotMatch(projection,/\.Message|\.StackTrace|\.ToString\(/);assert.match(projection,/native.NativeErrorCode/);
});

test('production controller inspection carries only the projected native diagnostic',async()=>{
 const controller=createRuntimeController({candidatePaths:[path.resolve('fixture/ollama.exe')],filesystem:{realpath:async p=>p,stat:async()=>({isFile:()=>true})},platform:'win32',processProbe:async()=>[],verifyExecutable:async()=>true,apiProbe:async()=>({healthy:false,reachable:false}),runtimeDiagnostics:()=>({stage:'job-assign',category:'native-call',nativeCode:5,message:'private-message',path:'private-path'})});
 const result=await controller.inspect();assert.deepEqual(result.diagnostic,{stage:'job-assign',category:'native-call',nativeCode:5});assert.equal(JSON.stringify(result).includes('private-message'),false);assert.equal(JSON.stringify(result).includes('private-path'),false);assert.equal(result.ownedManaged,false);
});

test('rejected startup recovers opaque owner and close targets that exact operation',async()=>{
 for(const phase of ['running','unknown']){
 const id='b'.repeat(32),calls=[];let released=false;
 const adapter=createManagedOllamaRuntimeAdapter({nativeRequest:async(method,payload)=>{calls.push([method,payload]);if(method==='managedOllama.start')throw new Error('private-start-error');if(method==='managedOllama.close')released=true;return {available:true,startAvailable:false,operationId:id,phase:released?'stopped':phase,processId:12,activeProcesses:released?0:1,exitVerified:released,leaseReleased:released};}});
 await assert.rejects(adapter.launch());assert.equal(adapter.pending,1);await assert.rejects(adapter.launch(),/settle/);await adapter.close();assert.equal(adapter.pending,0);assert.deepEqual(calls.find(([method])=>method==='managedOllama.close')[1],{operationId:id});
 }
});
test('unavailable startup recovery retains pending until a later exact idle observation',async()=>{
 let recover=false;const adapter=createManagedOllamaRuntimeAdapter({nativeRequest:async method=>{if(method==='managedOllama.start'||!recover)throw new Error('private-native-error');return {available:true,startAvailable:true,operationId:null,phase:'idle',processId:null,activeProcesses:null,exitVerified:false,leaseReleased:false};}});
 await assert.rejects(adapter.launch());assert.equal(adapter.pending,1);await assert.rejects(adapter.close());assert.equal(adapter.pending,1);recover=true;await adapter.close();assert.equal(adapter.pending,0);
});
