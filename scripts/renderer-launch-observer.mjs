import process from 'node:process';
// Durable observation of one launch. Caller deadlines never terminate it.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fileSha(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}

export function assertGuiExecutable(bytes) {
 if(bytes.length<64||bytes.toString('ascii',0,2)!=='MZ')throw new Error('GUI interpreter PE header missing.');
 const pe=bytes.readUInt32LE(60);
 if(pe+94>bytes.length||bytes.toString('ascii',pe,pe+4)!=='PE\0\0'||bytes.readUInt16LE(pe+92)!==2)throw new Error('GUI-subsystem interpreter required.');
}
export async function quietInterpreter(python) {
 const launcher=path.join(path.dirname(python),'pythonw.exe');
 const cfg=path.join(path.dirname(path.dirname(python)),'pyvenv.cfg');
 const values=Object.fromEntries((await fs.readFile(cfg,'utf8')).split(/\r?\n/).filter(line=>line.includes(' = ')).map(line=>line.split(' = ',2)));
 if(values['include-system-site-packages']!=='false'||!path.isAbsolute(values.home||''))throw new Error('Isolated interpreter configuration required.');
 const base=path.join(values.home,'pythonw.exe');
 const hashes={};for(const file of [launcher,base]){const bytes=await fs.readFile(file);assertGuiExecutable(bytes);hashes[file]=sha(bytes);}hashes[cfg]=await fileSha(cfg);
 return {launcher,base,hashes};
}
export async function startQuietObserver({python,workerPath,intentPath,journal,env,spawnImpl=spawn}) {
 if(path.basename(python).toLowerCase()!=='pythonw.exe')throw new Error('GUI observer executable name required.');
 assertGuiExecutable(await fs.readFile(python));
 const stdout=await fs.open(path.join(journal,'stdout.log'),'wx'),stderr=await fs.open(path.join(journal,'stderr.log'),'wx');
 let child;try{child=spawnImpl(python,[workerPath,intentPath],{env,windowsHide:true,detached:false,stdio:['ignore','pipe','pipe']});}catch(error){await stdout.close();await stderr.close();throw error;}
 const errors=[];const drains=[child.stdout,child.stderr].map(async(stream,index)=>{const file=index?stderr:stdout;let count=0;try{for await(const chunk of stream){count+=chunk.length;if(count<=64*1024*1024)await file.writeFile(chunk);else if(!errors.includes('Observer output exceeded bound.'))errors.push('Observer output exceeded bound.');}}catch(error){errors.push(error.message);}finally{await file.close();}});
 let spawnError;const exit=new Promise(resolve=>{child.once('error',error=>{spawnError=error;});child.once('close',async(code,signal)=>{await Promise.all(drains);const result={code,signal,spawnError:spawnError?.message??null,streamErrors:errors};try{await fs.writeFile(path.join(journal,'observer-exit.json'),JSON.stringify(result,null,2),{flag:'wx'});}catch(error){result.streamErrors.push(error.message);}resolve(result);});});
 return {child,exit,getSpawnError:()=>spawnError};
}

export async function observeRendererLaunch(python,args,input,env,onOutcome,{timeoutMs=30000,workerPath=fileURLToPath(new URL('./renderer-launch-observer.py',import.meta.url)),spawnImpl=spawn}={}) {
 if(args[1]!=='launch'||args[2]!=='--state'||!path.isAbsolute(input?.runRoot||'')||!path.isAbsolute(input?.executable||''))throw new Error('Durable observer requires an explicit renderer launch.');
 const interpreter=await quietInterpreter(python);
 const journal=path.join(input.runRoot,'launch-observation');
 await fs.mkdir(journal,{recursive:false});
 const request={...input,desktop:`MFE-${randomUUID()}`};
 const verifierHashes={};
 for(const name of ['renderer-launch-observer.mjs','renderer-launch-observer.py','supplemental-renderer-recovery.py','renderer-process-snapshot.py']){const file=fileURLToPath(new URL(name,import.meta.url));verifierHashes[file]=await fileSha(file);}
 const intent={observerInterpreter:interpreter,version:1,kind:'renderer-launch-observation',observedAt:new Date().toISOString(),declaredClientPid:process.pid,request,statePath:args[3],sourceCommit:env.MFE_RENDERER_SOURCE_COMMIT,verifierHashes,executableSha256:await fileSha(input.executable),workerSha256:sha(await fs.readFile(workerPath)),adapterPath:args[0],adapterSha256:sha(await fs.readFile(args[0]))};
 const intentPath=path.join(journal,'000-intent.json');
 const handle=await fs.open(intentPath,'wx');try{await handle.writeFile(JSON.stringify(intent,null,2));await handle.sync();}finally{await handle.close();}
 const observer=await startQuietObserver({python:interpreter.launcher,workerPath,intentPath,journal,env:{...env,MFE_LOWLEVEL_PYTHON:interpreter.launcher,MFE_RENDERER_NODE_EXECUTABLE:process.execPath},spawnImpl});
 const child=observer.child;
 const deadline=Date.now()+timeoutMs;
 while(true){
  let terminal;
  try{terminal=JSON.parse(await fs.readFile(path.join(journal,'terminal.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(terminal){
   let timer;const observerExit=await Promise.race([observer.exit,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),Math.max(1,deadline-Date.now()));})]);clearTimeout(timer);
   if(!observerExit){const error=new Error('Observer exit remains pending after terminal publication.');error.launchPending=true;error.journalPath=journal;throw error;}
   if(observerExit.code!==0||observerExit.spawnError||observerExit.streamErrors.length)throw new Error('Observer exit or log drain was unsuccessful.');
   const observation={observerExit,operation:'launch',exitCode:terminal.client_ok?0:1,journalPath:journal,result:terminal,stdout:'',stderr:''};onOutcome?.(observation);
   if(terminal.client_ok!==true){const error=new Error('Durable renderer launch observer failed; retained journal is authoritative.');error.lifecycleObservation=observation;error.launchPending=true;throw error;}
   return terminal;
  }
  if(observer.getSpawnError()||Date.now()>=deadline){
   const observation={operation:'launch',exitCode:null,journalPath:journal,observerSpawnPid:child.pid??null,pending:true,stdout:'',stderr:'',reason:observer.getSpawnError()?.message||'Caller deadline reached; launch observer retained.'};onOutcome?.(observation);
   const pendingPath=path.join(journal,'caller-pending.json');const pending=await fs.open(pendingPath,'wx');try{await pending.writeFile(JSON.stringify(observation));await pending.sync();}finally{await pending.close();}
   const error=new Error(observation.reason);error.lifecycleObservation=observation;error.launchPending=true;throw error;
  }
  await new Promise(resolve=>setTimeout(resolve,20));
 }
}
