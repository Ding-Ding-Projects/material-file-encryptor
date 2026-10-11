import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {attachSupplementalRenderer} from '../scripts/supplemental-renderer-runtime.mjs';

function fixture({proofFails=false,closeFails=false,byteChange=false,wrongTarget=false,changeDuringPrepareClose=false,changeDuringSession=false,hangClose=false,hangDetach=false}={}) {
 const events=[],writes=new Map(),root=path.join(os.tmpdir(),'supplemental-mocked-only');
 const targetId='page1',url='file:///packaged/app.asar/src/renderer/index.html';
 const admission={kind:'supplemental-partial-launch-recovery',originalResourcesAbsent:false,connectionOwned:false,pageActionsAllowed:false,request:{port:9222,target:{expectedUrl:url,files:{executable:'exact.exe'}}}};
 const bytes=Buffer.from(JSON.stringify(admission)),fresh=Buffer.from('fresh receipt');
 const admissionPath=path.join(root,'old.json'),evidenceRoot=path.join(root,'new');
 const hashes={wrapper:'a'.repeat(64)};
 let changed=false;
 const input={admissionPath,admissionSha256:createHash('sha256').update(bytes).digest('hex'),verifierSourceCommit:'b'.repeat(40),verifierHashes:hashes,evidenceRoot};
 const browser={
  async newBrowserCDPSession(){const closing=events.includes('prepare-close');if(closing&&changeDuringSession)changed=true;return {async send(name){events.push(name);if(name==='Target.getTargets')return {targetInfos:[{targetId,type:'page',url:wrongTarget?'file:///other':url}]};if(name==='Browser.close'&&hangClose)return new Promise(()=>{});if(name==='Browser.close'&&closeFails)throw new Error('close transport stopped');return {};},async detach(){events.push('detach');if(closing&&hangDetach)return new Promise(()=>{});}};},
  contexts(){events.push('pages');return [{pages(){return [{url:()=>url,evaluate(){events.push('evaluate');},screenshot(){events.push('capture');}}];}}];}
 };
 const runtime={
  readFile:async p=>p===admissionPath?(changed?Buffer.from('changed'):bytes):fresh,
  writeFile:async(p,value)=>{assert.equal(writes.has(p),false);writes.set(p,JSON.parse(value));},
  mkdir:async()=>{},hashes:async()=>hashes,inspectTarget:async()=>{events.push('inspect');},protocolTimeoutMs:10,
  createTransport:async()=>({transport:{},async disconnect(){events.push('disconnect');}}),
  chromium:{async connectOverCDP(){events.push('connect');return browser;}},
  async command(exe,args,input){const operation=args[1];events.push(operation);
   if(operation==='prepare')return {recovery:{originalResourcesAbsent:false,connectionOwned:false,pageActionsAllowed:false,targetProof:{targetCount:1,targetId,exactUrl:url}}};
   if(operation==='bind-client')return {clientBinding:{clientIdentity:{pid:process.pid}}};
   if(operation==='prove-connected'){if(proofFails)throw new Error('peer identity differs');if(byteChange)changed=true;return {client_ok:true,clientIdentity:{pid:process.pid},establishedPeerPair:{clientPid:process.pid},targetId,exactUrl:url};}
   if(operation==='prepare-close'){if(changeDuringPrepareClose)changed=true;return {exitProcesses:[{pid:77}]};}
   if(operation==='confirm-exit')return {resourcesAbsent:!closeFails,originalResourcesAbsent:false};
  }
 };
 return {input,runtime,events,writes};
}

test('actual supplemental wrapper returns page only after connected proof and confirms closure separately',async()=>{
 const f=fixture();const opened=await attachSupplementalRenderer(f.input,f.runtime);
 assert.ok(f.events.indexOf('pages')>f.events.indexOf('prove-connected'));
 assert.equal(opened.connectionOwned,true);
 const closure=await opened.close();assert.equal(closure.resourcesAbsent,true);
 assert.ok(f.events.indexOf('Browser.close')>f.events.indexOf('prepare-close'));
 assert.ok(f.events.indexOf('confirm-exit')>f.events.indexOf('Browser.close'));
 assert.equal([...f.writes.values()][0].originalResourcesAbsent,false);
});

test('actual wrapper rejects wrong receipt, peer, byte race and target before any page action or close',async()=>{
 for(const option of [{wrongReceipt:true},{proofFails:true},{byteChange:true},{wrongTarget:true}]){
  const f=fixture(option);if(option.wrongReceipt)f.input.admissionSha256='0'.repeat(64);
  await assert.rejects(attachSupplementalRenderer(f.input,f.runtime));
  for(const prohibited of ['pages','evaluate','capture','Browser.close','prepare-close'])assert.equal(f.events.includes(prohibited),false,prohibited);
  if(!option.wrongReceipt)assert.equal(f.events.includes('disconnect'),true);
 }
});

test('actual wrapper retains failed graceful closure and never substitutes termination or desktop close',async()=>{
 const f=fixture({closeFails:true});const opened=await attachSupplementalRenderer(f.input,f.runtime);
 await assert.rejects(opened.close(),/absence remains unverified/);
 const receipt=[...f.writes.values()][0];assert.equal(receipt.closure.resourcesAbsent,false);assert.equal(receipt.originalResourcesAbsent,false);
 assert.equal(f.events.filter(e=>e==='Browser.close').length,1);
 assert.equal(f.events.includes('confirm-exit'),true);
 assert.equal(f.events.includes('disconnect'),true);
});

test('receipt races during close preparation and session creation prevent every close send',async()=>{
 for(const option of [{changeDuringPrepareClose:true},{changeDuringSession:true}]){
  const f=fixture(option);const opened=await attachSupplementalRenderer(f.input,f.runtime);
  await assert.rejects(opened.close(),/bytes changed/);
  assert.equal(f.events.includes('Browser.close'),false);
  assert.equal(f.events.includes('disconnect'),true);
  assert.equal([...f.writes.values()][0].closure.resourcesAbsent,false);
 }
});

test('hung close and detach settle as unknown without duplicate close or missing socket teardown',async()=>{
 for(const option of [{hangClose:true},{hangDetach:true},{hangClose:true,hangDetach:true}]){
  const f=fixture(option);const opened=await attachSupplementalRenderer(f.input,f.runtime);
  await assert.rejects(opened.close(),/outcome remains unknown/);
  assert.equal(f.events.filter(e=>e==='Browser.close').length,1);
  assert.equal(f.events.includes('confirm-exit'),true);
  assert.equal(f.events.includes('disconnect'),true);
  assert.match([...f.writes.values()][0].error,/outcome remains unknown/);
  await assert.rejects(opened.close(),/already attempted/);
  assert.equal(f.events.filter(e=>e==='Browser.close').length,1);
 }
});
