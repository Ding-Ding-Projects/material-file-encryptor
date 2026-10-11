// Explicit recovery of one retained partial launch, with no new process launch.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {command,createRendererCdpTransport,verifyConnectedRenderer} from './test-renderer-browser.mjs';
import {inspectPackagedRendererTarget} from './packaged-renderer-runtime.mjs';

const scriptRoot=fileURLToPath(new URL('./',import.meta.url));
const sourceFiles=['supplemental-renderer-runtime.mjs','supplemental-renderer-recovery.py','renderer-process-snapshot.py','test-renderer-browser.mjs','packaged-renderer-runtime.mjs'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function hashes(){const result={};for(const name of sourceFiles)result[name]=hash(await fs.readFile(path.join(scriptRoot,name)));return result;}
async function bounded(promise,label,timeoutMs) {
 let timer;
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} outcome remains unknown after its bounded wait.`)),timeoutMs);})]);}
 finally{clearTimeout(timer);}
}

export async function attachSupplementalRenderer({admissionPath,admissionSha256,verifierSourceCommit,verifierHashes,evidenceRoot},runtime={}) {
 if(!path.isAbsolute(admissionPath||'')||!path.isAbsolute(evidenceRoot||'')||!/^[a-f0-9]{64}$/.test(admissionSha256||'')||!/^[a-f0-9]{40}$/.test(verifierSourceCommit||''))throw new Error('Exact supplemental receipt and verifier identities are required.');
 const read=runtime.readFile||fs.readFile,write=runtime.writeFile||fs.writeFile;
 const sourceHashes=runtime.hashes||hashes;
 const initial=await sourceHashes();
 if(JSON.stringify(initial)!==JSON.stringify(verifierHashes))throw new Error('Supplemental verifier hashes differ.');
 const bytes=await read(admissionPath);
 if(hash(bytes)!==admissionSha256)throw new Error('Supplemental admission receipt hash differs.');
 const admission=JSON.parse(bytes);
 if(admission.kind!=='supplemental-partial-launch-recovery'||admission.originalResourcesAbsent!==false||admission.connectionOwned!==false||admission.pageActionsAllowed!==false)throw new Error('Supplemental admission boundary differs.');
 const request=structuredClone(admission.request);
 request.verifierSourceCommit=verifierSourceCommit;
 const expected={...request.target,executable:request.target.files.executable};
 const inspect=runtime.inspectTarget||inspectPackagedRendererTarget;
 await inspect(expected);
 await (runtime.mkdir||fs.mkdir)(evidenceRoot,{recursive:true});
 const receiptPath=path.join(evidenceRoot,'supplemental-fresh-admission.json');
 const adapter=path.join(scriptRoot,'supplemental-renderer-recovery.py');
 const env={...process.env,PYTHONUTF8:'1',MFE_RENDERER_NODE_EXECUTABLE:process.execPath};
 const python=process.env.MFE_LOWLEVEL_PYTHON;
 if(!runtime.command&&!python)throw new Error('Installed Lowlevel Python path is required.');
 const outcomes=[];
 const call=(operation,input)=>(runtime.command||command)(python,[adapter,operation,receiptPath],input,env,outcome=>outcomes.push(outcome));
 const validate=async()=>{
  if(hash(await read(admissionPath))!==admissionSha256||JSON.stringify(await sourceHashes())!==JSON.stringify(initial))throw new Error('Recovery receipt or verifier bytes changed.');
  await inspect(expected);
 };
 await validate();
 const prepared=await call('prepare',request);
 const fresh=prepared?.recovery;
 if(fresh?.connectionOwned!==false||fresh?.pageActionsAllowed!==false||fresh?.originalResourcesAbsent!==false||fresh?.targetProof?.targetCount!==1||fresh.targetProof.exactUrl!==request.target.expectedUrl)throw new Error('Fresh supplemental admission is incomplete.');
 const freshSha=hash(await read(receiptPath));
 const checked=async(operation,input)=>{
  await validate();
  if(hash(await read(receiptPath))!==freshSha)throw new Error('Fresh supplemental receipt bytes changed.');
  return call(operation,input);
 };
 let browser,transport,connectionOwned=false,closed=false;
 const boundClient=await checked('bind-client',{clientPid:process.pid});
 if(boundClient?.clientBinding?.clientIdentity?.pid!==process.pid)throw new Error('Actual Node client binding is unavailable.');
 const proofInput={clientPid:process.pid,targetId:fresh.targetProof.targetId,clientBinding:boundClient.clientBinding};
 const retain=async(value)=>write(path.join(evidenceRoot,'supplemental-connection-final.json'),JSON.stringify({...value,admissionSha256,freshAdmissionSha256:freshSha,verifierSourceCommit,verifierHashes:initial,originalResourcesAbsent:false,outcomes},null,2),{flag:'wx'});
 try {
  transport=await (runtime.createTransport||createRendererCdpTransport)(`http://127.0.0.1:${request.port}`);
  const chromium=runtime.chromium||(await import('playwright')).chromium;
  browser=await chromium.connectOverCDP(transport.transport);
  await verifyConnectedRenderer(browser,{expectedUrl:request.target.expectedUrl,targetId:proofInput.targetId},input=>checked('prove-connected',{...input,clientBinding:proofInput.clientBinding}));
  await validate();
  if(hash(await read(receiptPath))!==freshSha)throw new Error('Fresh admission changed after connection proof.');
  connectionOwned=true;
  const pages=browser.contexts().flatMap(context=>context.pages());
  if(pages.length!==1||pages[0].url()!==request.target.expectedUrl)throw new Error('Proved connection has an unexpected page inventory.');
  const close=async()=>{
   if(closed)throw new Error('Supplemental closure already attempted.');
   closed=true;
   let closure={resourcesAbsent:false},error,closeSendError,detachError;
   const protocolTimeout=Math.min(5000,Math.max(1,runtime.protocolTimeoutMs??5000));
   const validateCloseBytes=async()=>{await validate();if(hash(await read(receiptPath))!==freshSha)throw new Error('Fresh supplemental receipt bytes changed before closure.');};
   try {
    const before=await checked('prepare-close',proofInput);
    if(!Array.isArray(before.exitProcesses)||!before.exitProcesses.length)throw new Error('Fresh native exit snapshot is unavailable.');
    await validateCloseBytes();
    const session=await bounded(browser.newBrowserCDPSession(),'Closure session creation',protocolTimeout);
    try {
     await validateCloseBytes();
     try {await bounded(session.send('Browser.close'),'Browser.close',protocolTimeout);}catch(value){closeSendError=value.message;if(value.message.includes('outcome remains unknown'))error=value;}
    }finally{
     try{await bounded(session.detach(),'Closure session detach',protocolTimeout);}catch(value){detachError=value.message;error ||= value;}
    }
    closure=await checked('confirm-exit',{exitProcesses:before.exitProcesses});
    if(closure.resourcesAbsent!==true)throw new Error('Supplemental process, port or desktop absence remains unverified.');
   }catch(value){error=value;}
   try{await bounded(transport.disconnect(),'Owned socket disconnect',3500);}catch(value){error ||= value;}
   await retain({connectionOwned,closure,error:error?.message,closeSendError,detachError,pixelsInspected:false,nativeCaptureVerified:false});
   if(error)throw error;
   return closure;
  };
  return {page:pages[0],close,disconnect:()=>transport.disconnect(),receiptPath,connectionOwned:true,request};
 }catch(error){
  // A rejected transport is disconnected only. Never send Browser.close here.
  let disconnectError;
  try{await transport?.disconnect();}catch(value){disconnectError=value.message;}
  await retain({connectionOwned:false,closure:{resourcesAbsent:false},error:error.message,disconnectError});
  throw error;
 }
}
