import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {createNativePlanExecutor,NativePlanObservation,validateNativeCapturePath,NATIVE_PLAN_ROUTE} from '../scripts/gui-acceptance-native-plan.mjs';

async function fixture(t,{send,proofChange,createSession}={}) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'mfe-native-plan-unit-'))),outputRoot=path.join(root,'output');await fs.mkdir(outputRoot);
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const expectedUrl='file:///owned/app.asar/src/renderer/index.html',targetId='owned-target',receiptPath=path.join(root,'lifecycle.json');
 const receipt={created:true,cleaned:false,runRoot:root,outputRoot,cdp:{port:54321,expectedUrl}};await fs.writeFile(receiptPath,JSON.stringify(receipt));
 const session=new EventEmitter(),calls=[];let proofs=0;
 session.send=async(method,params)=>{calls.push({method,params});if(send)return send(method,params,session);return method==='Runtime.evaluate'?{result:{value:true}}:{};};
 const proof=()=>({client_ok:true,clientIdentity:{pid:process.pid},establishedPeerPair:{clientPid:process.pid},targetId,exactUrl:expectedUrl});
 const opened={connectionOwned:true,backend:'native-v1',runRoot:root,statePath:receiptPath,target:{expectedUrl},nativeConnection:{route:'native-v1-connected-cdp',expectedUrl,targetId,async prove(){proofs++;return proofChange?proofChange(proof(),proofs):proof();},async createPageSession(options){return createSession?createSession(session,options):session;},observeInterruptions(fn){session.on('test-interruption',fn);return()=>session.off('test-interruption',fn);}}};
 const executor=await createNativePlanExecutor({opened});
 const plan=steps=>({version:1,receipt:receiptPath,endpoint:'http://127.0.0.1:54321',expectedUrl,allowEvaluate:true,timeoutMs:1000,steps});
 return {root,outputRoot,receipt,receiptPath,session,calls,executor,plan,get proofs(){return proofs;}};
}

test('native plans retain full proof and exact poll envelope without claiming post-modal proof',async t=>{
 const f=await fixture(t);const result=await f.executor.execute(f.plan([{id:'ready',op:'poll',expression:'true',equals:true,intervalMs:10}]));
 assert.equal(f.proofs,1);assert.equal(result.driverRoute,NATIVE_PLAN_ROUTE);assert.equal(result.proofCoverage,'before-plan-and-before-capture');
 assert.deepEqual(result.results[0].value,{matched:true,attempts:1,value:true});assert.equal(result.ok,true);
 assert.equal(f.calls.some(row=>row.method==='Target.getTargets'),false,'Native connection owns complete target proof');
});

test('missing peer, changed target and rejected native proof prevent every page command',async t=>{
 for(const patch of [value=>({...value,client_ok:false}),value=>({...value,establishedPeerPair:{clientPid:process.pid+1}}),value=>({...value,targetId:'other'}),value=>({...value,exactUrl:'file:///other'})]){
  const f=await fixture(t,{proofChange:patch});await assert.rejects(f.executor.execute(f.plan([{id:'action',op:'evaluate',expression:'true'}])));assert.equal(f.calls.length,0);
 }
});

test('changed immutable receipt and escaped endpoint fail before commands',async t=>{
 const f=await fixture(t);const bad=f.plan([]);bad.endpoint='http://127.0.0.1:54322';await assert.rejects(f.executor.execute(bad));
 await fs.writeFile(f.receiptPath,JSON.stringify({...f.receipt,desktop:'changed'}));await assert.rejects(f.executor.execute(f.plan([])));assert.equal(f.calls.length,0);
});

test('capture has fresh ownership proof, exclusive bounded output and real byte hash',async t=>{
 const bytes=Buffer.from('89504e470d0a1a0a00000000','hex');
 const f=await fixture(t,{send:async method=>method==='Page.captureScreenshot'?{data:bytes.toString('base64')}:{}});
 const destination=path.join(f.outputRoot,'capture.png'),plan=f.plan([{id:'capture',op:'capture',path:destination,overwrite:false}]);
 const result=await f.executor.execute(plan);assert.equal(f.proofs,2);assert.deepEqual(await fs.readFile(destination),bytes);assert.match(result.results[0].value.sha256,/^[a-f0-9]{64}$/);
 await assert.rejects(f.executor.execute(plan));assert.equal(f.calls.filter(row=>row.method==='Page.captureScreenshot').length,1);
 await assert.rejects(validateNativeCapturePath(path.join(f.root,'escape.png'),f.receipt));
});

test('a timed out command poisons the executor and retains the exact failing step',async t=>{
 const f=await fixture(t,{send:async method=>method==='Runtime.evaluate'?new Promise(()=>{}):{}});
 const plan={...f.plan([{id:'held',op:'evaluate',expression:'true'}]),timeoutMs:30};
 await assert.rejects(f.executor.execute(plan),error=>error.code==='PLAN_TIMEOUT'&&error.helperResult.step==='held'&&error.helperResult.ok===false);
 const count=f.calls.length;await assert.rejects(f.executor.execute(f.plan([])));assert.equal(f.calls.length,count);
});

test('prospective events use exact mapping and malformed events remain incomplete',()=>{
 let clock=1000;const o=new NativePlanObservation(()=>clock);o.activate();
 o.observe('Runtime.consoleAPICalled',{type:'error',timestamp:999});o.observe('Runtime.consoleAPICalled',{type:'assert',timestamp:1001});
 o.observe('Runtime.exceptionThrown',{timestamp:1002});o.observe('Log.entryAdded',{entry:{level:'error',timestamp:1003}});clock=1010;
 const result=o.finish(true);assert.equal(result.complete,true);assert.equal(result.historicalEventsExcluded,1);
 assert.deepEqual([result.consoleErrorCount,result.unhandledExceptionCount,result.pageErrorCount],[1,1,1]);
 const invalid=new NativePlanObservation(()=>clock);invalid.activate();invalid.observe('Runtime.consoleAPICalled',{});assert.equal(invalid.finish(true).complete,false);
});

test('observed plan binds actual helper and receipt hashes and unregisters listeners',async t=>{
 const f=await fixture(t,{send:async(method,_params,session)=>{if(method==='Runtime.evaluate'){session.emit('Runtime.consoleAPICalled',{type:'error',timestamp:Date.now()});return{result:{value:true}};}return{};}});
 const result=await f.executor.execute({...f.plan([{id:'observe',op:'evaluate',expression:'true'}]),observeRuntime:true});
 assert.equal(result.runtimeObservation.complete,true);assert.equal(result.runtimeObservation.consoleErrorCount,1);assert.match(result.runtimeObservation.binding.helperSha256,/^[a-f0-9]{64}$/);assert.match(result.runtimeObservation.binding.launchReceiptSha256,/^[a-f0-9]{64}$/);
 assert.equal(f.session.listenerCount('Runtime.consoleAPICalled'),0);
});

test('connection interruption prevents a complete runtime observation even after a returned command',async t=>{
 const f=await fixture(t,{send:async(method,_params,session)=>{if(method==='Runtime.evaluate'){session.emit('test-interruption','WEBSOCKET_CLOSED');return{result:{value:true}};}return{};}});
 const result=await f.executor.execute({...f.plan([{id:'observe',op:'evaluate',expression:'true'}]),observeRuntime:true});
 assert.equal(result.runtimeObservation.complete,false);assert.equal(result.runtimeObservation.interruptionCode,'WEBSOCKET_CLOSED');assert.equal(f.session.listenerCount('test-interruption'),0);
});

test('initial proof and session creation share the deadline and cannot perform late UI actions',async t=>{
 for(const stage of ['proof','session']) {
  let release,signal;
  const held=new Promise(resolve=>{release=resolve;});
  const f=await fixture(t,stage==='proof'?{proofChange:async value=>{await held;return value;}}:{createSession:async(value,options)=>{signal=options.signal;await held;signal.throwIfAborted();return value;}});
  await assert.rejects(f.executor.execute({...f.plan([{id:'never',op:'evaluate',expression:'true'}]),timeoutMs:30}),error=>error.code==='PLAN_TIMEOUT');
  assert.equal(f.calls.length,0);if(signal)assert.equal(signal.aborted,true);
  release();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(f.calls.length,0);
  await assert.rejects(f.executor.execute(f.plan([])));assert.equal(f.calls.length,0);
 }
});

test('aggregate result cap rejects many individually valid outputs before 8 MiB is retained',async t=>{
 const value='x'.repeat(1024*1024);
 const f=await fixture(t,{send:async method=>method==='Runtime.evaluate'?{result:{value}}:{}});
 const steps=Array.from({length:12},(_,index)=>({id:'large-'+index,op:'evaluate',expression:'large'}));
 await assert.rejects(f.executor.execute({...f.plan(steps),timeoutMs:10000}),error=>{
  assert.equal(error.code,'RESULT_TOO_LARGE');assert.equal(error.helperResult.step,'large-7');assert.equal(error.helperResult.results.length,7);
  assert.ok(Buffer.byteLength(JSON.stringify(error.helperResult))<8*1024*1024);return true;
 });
 assert.equal(f.calls.filter(row=>row.method==='Runtime.evaluate').length,8);
});
