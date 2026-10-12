import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {pbkdf2Sync} from 'node:crypto';
import {command,proveStableRendererTree} from './test-renderer-browser.mjs';
import {inspectPackagedRendererTarget} from './packaged-renderer-runtime.mjs';
import {sha256} from './gui-acceptance.mjs';

export async function runPreparedComparison({prepare,compare,validate,retain}){
 const binding=await prepare();
 const result=await compare();
 validate(result);
 return retain(result,binding);
}

export async function retainMainComparison({comparison,binding,evidenceRoot,attest}){
 const provisional={schemaVersion:1,scope:'packaged-main-webcrypto',...binding,...comparison,postProofVerified:false,derivedBytesRetained:false,rendererProbed:false};
 await fs.writeFile(path.join(evidenceRoot,'main-crypto-provisional.json'),JSON.stringify(provisional,null,2),{flag:'wx'});
 const proof=await attest();
 const receipt={...provisional,...proof,postProofVerified:true};
 await fs.writeFile(path.join(evidenceRoot,'main-crypto.json'),JSON.stringify(receipt,null,2),{flag:'wx'});return receipt;
}

export async function probePackagedMainCrypto({opened,port,evidenceRoot}){
 assert.equal(opened.connectionOwned,true);assert.equal(opened.target.kind,'extracted-packaged-runtime');
 const target=opened.target;await inspectPackagedRendererTarget(target);
 const scriptRoot=fileURLToPath(new URL('./',import.meta.url)),cli=process.env.MFE_LOWLEVEL_CLI;assert.ok(cli);
 const python=process.env.MFE_LOWLEVEL_PYTHON||path.join(path.dirname(cli),'python.exe');
 const env={...process.env,PYTHONUTF8:'1',MFE_LOWLEVEL_CLIENT:path.join(os.homedir(),'.agents/skills/run-lowlevel-headless-app/scripts/lowlevel_mcp_client.py'),MFE_LOWLEVEL_CLI:cli,MFE_LOWLEVEL_PYTHON:python,MFE_RENDERER_NODE_EXECUTABLE:process.execPath,MFE_RENDERER_PROCESS_BACKEND:'native-v1',MFE_RENDERER_SOURCE_COMMIT:opened.receipt.verifierSourceCommit};
 const input={receipt:opened.statePath,port,verifierSourceCommit:opened.receipt.verifierSourceCommit,executableSha256:target.hashes.executable};
 const helper=path.join(scriptRoot,'gui-acceptance-main-inspector.py');
 await fs.mkdir(evidenceRoot,{recursive:true});let proofNumber=0;
 const prove=value=>proveStableRendererTree(async()=>{const number=++proofNumber;let outcome;try{return await command(python,[helper],value,env,result=>{outcome=result;},{timeoutMs:30000});}finally{if(outcome)await fs.writeFile(path.join(evidenceRoot,`main-proof-${number}.json`),JSON.stringify(outcome,null,2),{flag:'wx'});}});
 const before=await prove(input);
 const clientBinding=(await command(python,[path.join(scriptRoot,'test-renderer-browser-cli.py'),'bind-client',opened.statePath],{clientPid:process.pid},env)).clientBinding;
 const socket=new WebSocket(before.target.webSocketDebuggerUrl),pending=new Map();let nextId=0;
 const rejectPending=()=>{for(const value of pending.values()){clearTimeout(value.timer);value.reject(Error('Main inspector transport closed'));}pending.clear();};
 socket.addEventListener('close',rejectPending);socket.addEventListener('error',rejectPending);
 socket.addEventListener('message',event=>{if(typeof event.data!=='string'||event.data.length>1048576){socket.close();return;}let message;try{message=JSON.parse(event.data);}catch{socket.close();return;}const entry=pending.get(message.id);if(!entry)return;pending.delete(message.id);clearTimeout(entry.timer);if(message.error)entry.reject(Error('Main inspector command failed'));else entry.resolve(message.result);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error('Main inspector command exceeded its bound'));},60000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
 let reference;
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Main inspector connection timed out')),10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Main inspector connection failed'));},{once:true});});
  const connected=await prove({...input,clientPid:process.pid,clientBinding,targetId:before.target.id});
  assert.equal(connected.peer?.clientPid,process.pid);assert.equal(connected.peer.serverPid,before.root.pid);
  reference=pbkdf2Sync('synthetic',Buffer.alloc(16,7),310000,32,'sha256');
  const expression=`(async()=>{if(process.type!=='browser'||process.execPath.toLowerCase()!==${JSON.stringify(target.executable.toLowerCase())})throw Error('Unexpected main context');const subtle=globalThis.crypto?.subtle||process.getBuiltinModule?.('crypto')?.webcrypto?.subtle;if(!subtle)throw Error('Main WebCrypto unavailable');const expected=${JSON.stringify([...reference])};const key=await subtle.importKey('raw',new TextEncoder().encode('synthetic'),'PBKDF2',false,['deriveBits']);let completed=0,firstMismatch=null;for(let i=0;i<100;i++){const bytes=new Uint8Array(await subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new Uint8Array(16).fill(7),iterations:310000},key,256));const matched=bytes.length===expected.length&&bytes.every((value,index)=>value===expected[index]);bytes.fill(0);completed++;if(!matched){firstMismatch=i+1;break;}}expected.fill(0);return{completed,firstMismatch,allMatched:firstMismatch===null,mainContext:true,runtime:{node:process.versions.node,v8:process.versions.v8,openssl:process.versions.openssl,desktopRuntime:process.versions.electron}};})()`;
  return await runPreparedComparison({
   prepare:async()=>({sourceCommit:target.sourceCommit,executableSha256:target.hashes.executable,resourceSha256:target.hashes.asar,proofHelperSha256:sha256(await fs.readFile(helper)),referenceRuntime:{node:process.version,executableSha256:sha256(await fs.readFile(process.execPath))},maximumDerivations:100,iterationsPerDerivation:310000}),
   compare:async()=>{const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw Error('Main synthetic comparison returned an exception');return response.result?.value;},
   validate:result=>{assert.equal(result?.mainContext,true);assert.ok(Number.isInteger(result.completed)&&result.completed>=1&&result.completed<=100);assert.equal(result.allMatched,result.firstMismatch===null);if(result.allMatched)assert.equal(result.completed,100);else assert.equal(result.completed,result.firstMismatch);},
   retain:(result,binding)=>retainMainComparison({comparison:result,binding,evidenceRoot,attest:async()=>{
    const after=await prove({...input,clientPid:process.pid,clientBinding,targetId:before.target.id});assert.deepEqual(after.root,before.root);assert.deepEqual(after.peer,connected.peer);await inspectPackagedRendererTarget(target);return {before,connected,after};
   }})
  });
 }finally{reference?.fill(0);socket.close();rejectPending();}
}
