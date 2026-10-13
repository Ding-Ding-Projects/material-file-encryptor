import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfinementProbe,validateNativeReceipt} from '../src/features/converter/windows-sandbox.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);

const proof=()=>({outputs:[],details:{schema:1,workVerified:true,outsideRead:'EACCES',payloadWrite:'EPERM',network:'EACCES'}});
const baseline=()=>({before:true,after:true,connections:2});

test('behavioral admission needs positive baselines and explicit OS denials',()=>{
 assert.equal(validateConfinementProbe(proof(),baseline()),true);
 for(const code of ['connected','ECONNREFUSED','ETIMEDOUT','timeout','ENETUNREACH','ERR_ACCESS_DENIED',false,undefined]){
  const result=proof();result.details.network=code;
  assert.throws(()=>validateConfinementProbe(result,baseline()),/BEHAVIORAL_PROBE_FAILED/);
 }
});
test('behavioral admission rejects file access, missing work proof and extra output',()=>{
 for(const field of ['outsideRead','payloadWrite'])for(const value of ['allowed','ENOENT','ERR_ACCESS_DENIED',undefined]){
  const result=proof();result.details[field]=value;
  assert.throws(()=>validateConfinementProbe(result,baseline()),/BEHAVIORAL_PROBE_FAILED/);
 }
 for(const result of [{outputs:[],details:{}},{...proof(),outputs:[{}]},undefined])
  assert.throws(()=>validateConfinementProbe(result,baseline()),/BEHAVIORAL_PROBE_FAILED/);
 const result=proof();result.details.workVerified=false;
 assert.throws(()=>validateConfinementProbe(result,baseline()),/BEHAVIORAL_PROBE_FAILED/);
});
test('behavioral admission rejects an unavailable listener or any extra connection',()=>{
 for(const controls of [{before:false,after:true,connections:2},{before:true,after:false,connections:2},{before:true,after:true,connections:3},undefined])
  assert.throws(()=>validateConfinementProbe(proof(),controls),/BEHAVIORAL_PROBE_FAILED/);
});
test('startup probe receipt retains identity, resources, hash and sentinel cleanup',()=>{
 const nonce='b'.repeat(64);
 const receipt={schema:1,nonce,isolated:true,exitCode:0,timedOut:false,cancelled:false,killedForStorage:false,profileDeleted:true,networkCapabilities:0,activeProcessLimit:1,memoryBytes:268435456,timeoutMs:30000,appContainerVerified:true,capabilityCount:0,jobLimitsVerified:true,probeSentinelDeleted:true,resultSha256:'c'.repeat(64)};
 assert.equal(validateNativeReceipt(JSON.stringify(receipt),nonce,0,true).probeSentinelDeleted,true);
 for(const changed of [{probeSentinelDeleted:false},{probeSentinelDeleted:undefined},{probeSentinelDeleted:'true'},{resultSha256:undefined},{resultSha256:'invalid'},{appContainerVerified:false},{capabilityCount:1},{networkCapabilities:1},{jobLimitsVerified:false},{profileDeleted:false},{activeProcessLimit:2},{memoryBytes:1},{nonce:'wrong'}])
  assert.throws(()=>validateNativeReceipt(JSON.stringify({...receipt,...changed}),nonce,0,true),/RECEIPT_INVALID/);
});
test('actual unconstrained synthetic worker reports accesses instead of certifying confinement',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'converter-probe-test-'));
 const payload=path.join(root,'payload'),work=path.join(root,'work'),outside=path.join(root,'synthetic-outside.bin');
 await fs.mkdir(payload);await fs.mkdir(work);await fs.writeFile(outside,'synthetic');await fs.writeFile(path.join(payload,'probe-payload.bin'),'synthetic');
 await fs.copyFile(new URL('../src/features/converter/confinement-worker.mjs',import.meta.url),path.join(payload,'worker.mjs'));
 const server=net.createServer(socket=>socket.end());
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});
 const nonce='a'.repeat(64),requestPath=path.join(work,'request.json'),resultPath=path.join(work,'result.json');
 await fs.writeFile(requestPath,JSON.stringify({schema:1,nonce,challenge:nonce,port:server.address().port,outside}));
 await execute(process.execPath,[path.join(payload,'worker.mjs'),'--request',requestPath,'--result',resultPath,'--nonce',nonce],{timeout:5000,windowsHide:true,env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR}});
 const result=JSON.parse(await fs.readFile(resultPath,'utf8'));
 assert.equal(result.nonce,nonce);assert.equal(result.details.workVerified,true);
 assert.equal(result.details.outsideRead,'allowed');assert.equal(result.details.payloadWrite,'allowed');assert.equal(result.details.network,'connected');
 assert.throws(()=>validateConfinementProbe(result,baseline()),/BEHAVIORAL_PROBE_FAILED/);
});
