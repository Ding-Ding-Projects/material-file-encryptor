// Durable observation of one launch. Caller deadlines never terminate it.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fileSha(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export async function observeRendererLaunch(python,args,input,env,onOutcome,{timeoutMs=30000,workerPath=fileURLToPath(new URL('./renderer-launch-observer.py',import.meta.url)),spawnImpl=spawn}={}) {
 if(args[1]!=='launch'||args[2]!=='--state'||!path.isAbsolute(input?.runRoot||'')||!path.isAbsolute(input?.executable||''))throw new Error('Durable observer requires an explicit renderer launch.');
 const journal=path.join(input.runRoot,'launch-observation');
 await fs.mkdir(journal,{recursive:false});
 const request={...input,desktop:`MFE-${randomUUID()}`};
 const verifierHashes={};
 for(const name of ['renderer-launch-observer.mjs','renderer-launch-observer.py','supplemental-renderer-recovery.py','renderer-process-snapshot.py']){const file=fileURLToPath(new URL(name,import.meta.url));verifierHashes[file]=await fileSha(file);}
 const intent={version:1,kind:'renderer-launch-observation',observedAt:new Date().toISOString(),declaredClientPid:process.pid,request,statePath:args[3],sourceCommit:env.MFE_RENDERER_SOURCE_COMMIT,verifierHashes,executableSha256:await fileSha(input.executable),workerSha256:sha(await fs.readFile(workerPath)),adapterPath:args[0],adapterSha256:sha(await fs.readFile(args[0]))};
 const intentPath=path.join(journal,'000-intent.json');
 const handle=await fs.open(intentPath,'wx');try{await handle.writeFile(JSON.stringify(intent,null,2));await handle.sync();}finally{await handle.close();}
 const stdout=await fs.open(path.join(journal,'stdout.log'),'wx'),stderr=await fs.open(path.join(journal,'stderr.log'),'wx');
 let child;
 try{child=spawnImpl(python,[workerPath,intentPath],{env:{...env,MFE_LOWLEVEL_PYTHON:python,MFE_RENDERER_NODE_EXECUTABLE:process.execPath},windowsHide:true,detached:true,stdio:['ignore',stdout.fd,stderr.fd]});}
 finally{await stdout.close();await stderr.close();}
 let spawnError;
 child.on('error',error=>{spawnError=error;});child.unref();
 const deadline=Date.now()+timeoutMs;
 while(true){
  let terminal;
  try{terminal=JSON.parse(await fs.readFile(path.join(journal,'terminal.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(terminal){
   const observation={operation:'launch',exitCode:terminal.client_ok?0:1,journalPath:journal,result:terminal,stdout:'',stderr:''};onOutcome?.(observation);
   if(terminal.client_ok!==true){const error=new Error('Durable renderer launch observer failed; retained journal is authoritative.');error.lifecycleObservation=observation;error.launchPending=true;throw error;}
   return terminal;
  }
  if(spawnError||Date.now()>=deadline){
   const observation={operation:'launch',exitCode:null,journalPath:journal,observerSpawnPid:child.pid??null,pending:true,stdout:'',stderr:'',reason:spawnError?.message||'Caller deadline reached; launch observer retained.'};onOutcome?.(observation);
   const pendingPath=path.join(journal,'caller-pending.json');const pending=await fs.open(pendingPath,'wx');try{await pending.writeFile(JSON.stringify(observation));await pending.sync();}finally{await pending.close();}
   const error=new Error(observation.reason);error.lifecycleObservation=observation;error.launchPending=true;throw error;
  }
  await new Promise(resolve=>setTimeout(resolve,20));
 }
}
