import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';

const exec=promisify(execFile);
const EULA_URL='https://www.minecraft.net/en-us/eula';
const hashFile=async(file,algorithm='sha256')=>{const hash=createHash(algorithm);const handle=await fs.open(file,'r');try{for await(const chunk of handle.createReadStream({autoClose:false}))hash.update(chunk);return hash.digest('hex');}finally{await handle.close();}};
async function regular(file){const stat=await fs.lstat(file);if(stat.isSymbolicLink()||!stat.isFile())throw new Error('A regular owned file is required.');return stat;}
async function safeDirectory(directory){let current=path.resolve(directory);while(true){const stat=await fs.lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Linked server directories are not allowed.');const parent=path.dirname(current);if(parent===current)break;current=parent;}return fs.realpath(directory);}
function validDistribution(d){
  if(d?.state!=='resolved'||typeof d.version!=='string'||!d.version||!/^[a-f0-9]{40}$/.test(d.metadataSha1)||!/^[a-f0-9]{40}$/.test(d.sha1)||!Number.isSafeInteger(d.size)||d.size<=0||d.size>1024*1024*1024)throw new Error('Verified bounded distribution metadata is required.');
  const url=new URL(d.url);if(url.protocol!=='https:'||!['piston-data.mojang.com','launcher.mojang.com'].includes(url.hostname)||url.username||url.password||url.port||url.hash)throw new Error('Untrusted server download source.');
  const metadata=new URL(d.metadataUrl);if(metadata.protocol!=='https:'||!['piston-meta.mojang.com','launchermeta.mojang.com'].includes(metadata.hostname)||metadata.username||metadata.password||metadata.port)throw new Error('Untrusted version metadata source.');
  return structuredClone(d);
}
export async function windowsProcessIdentity(pid){
  if(process.platform!=='win32'||!Number.isSafeInteger(pid)||pid<=0)throw new Error('Native Windows process identity is unavailable.');
  const command=`$ErrorActionPreference='Stop';$p=Get-Process -Id ${pid};try{[pscustomobject]@{pid=$p.Id;creationTime=$p.StartTime.ToUniversalTime().Ticks.ToString();executablePath=$p.Path}|ConvertTo-Json -Compress}finally{$p.Dispose()}`;
  const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:10000,maxBuffer:16384});
  const value=JSON.parse(stdout);if(value.pid!==pid||typeof value.creationTime!=='string'||!/^\d+$/.test(value.creationTime)||typeof value.executablePath!=='string'||!value.executablePath)throw new Error('Exact native process identity is unavailable.');return value;
}
export class LocalProcessServerAdapter {
  constructor({baseRoot,fetchImpl=fetch,resolveRuntime=async()=>null,approveNetwork=async()=>null,acquireFileLease=async()=>null,processFactory=spawn,identityReader=windowsProcessIdentity,now=()=>new Date().toISOString()}){
    this.baseRoot=path.resolve(baseRoot);this.fetch=fetchImpl;this.resolveRuntime=resolveRuntime;this.approveNetwork=approveNetwork;this.acquireFileLease=acquireFileLease;this.spawn=processFactory;this.identity=identityReader;this.now=now;this.owned=new Map();
  }
  async persist(entry){const snapshot=structuredClone(entry.state);const operation=(entry.persistenceTail??Promise.resolve()).catch(()=>{}).then(async()=>{const file=path.join(entry.root,'state.json');const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});await fs.rename(temp,file);});entry.persistenceTail=operation;return operation;}
  entry(id){const value=this.owned.get(id);if(!value)throw new Error('Server root is not owned by this adapter session; explicit recovery is required.');return value;}
  async create({id,distribution,signal}){
    if(typeof id!=='string'||! /^[a-z0-9][a-z0-9-]{0,63}$/.test(id))throw new Error('Invalid server identity.');
    const selected=validDistribution(distribution);const base=await safeDirectory(this.baseRoot);const root=path.join(base,id);await fs.mkdir(root);
    const state={schemaVersion:1,id,target:'local-process',version:selected.version,distribution:selected,status:'creating',createdAt:this.now(),license:{accepted:false,url:EULA_URL},runtimeVerified:false};
    const entry={root,state,child:null,identity:null};this.owned.set(id,entry);await this.persist(entry);
    const staging=path.join(root,'.staging-'+randomUUID());await fs.mkdir(staging);
    try{
      signal?.throwIfAborted();const response=await this.fetch(selected.url,{redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
      if(!response.ok||!response.body)throw new Error('Server download is unavailable.');
      const length=response.headers.get('content-length');if(length!==null&&Number(length)!==selected.size)throw new Error('Server download size differs from metadata.');
      const target=path.join(staging,'server.jar');const file=await fs.open(target,'wx');const sha1=createHash('sha1'),sha256=createHash('sha256');let size=0;
      try{for await(const chunk of response.body){signal?.throwIfAborted();size+=chunk.byteLength;if(size>selected.size)throw new Error('Server download exceeded its exact size.');sha1.update(chunk);sha256.update(chunk);await file.writeFile(chunk);}await file.sync();}finally{await file.close();}
      if(size!==selected.size||sha1.digest('hex')!==selected.sha1)throw new Error('Server download integrity mismatch.');
      signal?.throwIfAborted();await fs.writeFile(path.join(staging,'eula.txt'),'eula=false\n',{flag:'wx'});await fs.rename(staging,path.join(root,'server'));
      state.distributionSha256=sha256.digest('hex');state.status='prepared';state.bytesVerified=true;await this.persist(entry);return this.status(id);
    }catch(error){state.status=signal?.aborted?'canceled':'creation-failed';state.reason=state.status==='canceled'?'Creation canceled; retained owned staging requires recovery.':'Download or publication failed; retained owned staging requires recovery.';await this.persist(entry);throw error;}
  }
  licenseContract(id){const entry=this.entry(id);return {serverId:id,version:entry.state.version,distributionSha256:entry.state.distributionSha256,url:EULA_URL,accepted:entry.state.license.accepted,requiresExplicitConsent:true};}
  async acceptLicense(id,consent){const entry=this.entry(id);if(entry.state.status!=='prepared'||consent?.accepted!==true||consent.serverId!==id||consent.version!==entry.state.version||consent.distributionSha256!==entry.state.distributionSha256||consent.url!==EULA_URL)throw new Error('Exact server license consent is required.');await safeDirectory(path.join(entry.root,'server'));const eula=path.join(entry.root,'server','eula.txt');await regular(eula);const temp=eula+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,'eula=true\n',{flag:'wx'});await fs.rename(temp,eula);entry.state.license={accepted:true,url:EULA_URL,acceptedAt:this.now()};await this.persist(entry);}
  async verifyFiles(entry){await safeDirectory(entry.root);await safeDirectory(path.join(entry.root,'server'));const jar=path.join(entry.root,'server','server.jar');const stat=await regular(jar);if(stat.size!==entry.state.distribution.size||await hashFile(jar)!==entry.state.distributionSha256)throw new Error('Owned server distribution changed.');return jar;}
  async start(id,{signal}={}){
    const entry=this.entry(id);if(entry.startPending||entry.child||entry.state.status!=='prepared'||entry.state.license.accepted!==true)throw new Error('Prepared bytes and explicit license consent are required.');
    entry.startPending=true;entry.state.startup={status:'admitting',generatedConfiguration:entry.generatedConfig===true};let lease;
    try{
      signal?.throwIfAborted();const jar=await this.verifyFiles(entry);const expectedMajor=entry.state.distribution.runtime?.state==='specified'?entry.state.distribution.runtime.majorVersion:null;
      const selectedRuntime=await this.resolveRuntime({majorVersion:expectedMajor,version:entry.state.version});
      if(!expectedMajor||selectedRuntime?.verified!==true||selectedRuntime.majorVersion!==expectedMajor||typeof selectedRuntime.executable!=='string'||!/^[a-f0-9]{64}$/.test(selectedRuntime.sha256)){entry.state.runtimeAvailability='unavailable';throw new Error('A verified compatible Java runtime is unavailable.');}
      const runtime=structuredClone(selectedRuntime);
      await regular(runtime.executable);if(await hashFile(runtime.executable)!==runtime.sha256)throw new Error('Verified Java runtime bytes changed.');signal?.throwIfAborted();
      const network=await this.approveNetwork({version:entry.state.version,distributionSha256:entry.state.distributionSha256});
      signal?.throwIfAborted();
      if(network?.verified!==true||network.version!==entry.state.version||network.distributionSha256!==entry.state.distributionSha256||network.host!=='127.0.0.1'||!Number.isSafeInteger(network.port)||network.port<1024||network.port>65535||network.portAvailable!==true||network.propertySchemaVerified!==true)throw new Error('Version-bound loopback configuration and available port proof are required.');
      const files=[{path:jar,sha256:entry.state.distributionSha256},{path:runtime.executable,sha256:runtime.sha256}];
      lease=await this.acquireFileLease({files:structuredClone(files),signal});
      if(lease?.kind!=='windows-deny-write-delete'||typeof lease.assertHeld!=='function'||typeof lease.release!=='function'||JSON.stringify(lease.files)!==JSON.stringify(files))throw new Error('A trusted native deny-write/delete file lease is unavailable.');
      await lease.assertHeld();signal?.throwIfAborted();
      // Recheck after every asynchronous provider admission, while the native lease protects both files.
      await this.verifyFiles(entry);await regular(runtime.executable);if(await hashFile(runtime.executable)!==runtime.sha256)throw new Error('Verified Java runtime bytes changed during admission.');
      signal?.throwIfAborted();
      const config=path.join(entry.root,'server','server.properties');const configText='server-ip=127.0.0.1\nserver-port='+network.port+'\n';
      if(entry.generatedConfig){await regular(config);if(await fs.readFile(config,'utf8')!==configText)throw new Error('Owned startup configuration changed; explicit recovery is required.');}
      else {await fs.writeFile(config,configText,{flag:'wx'});entry.generatedConfig=true;}
      signal?.throwIfAborted();await lease.assertHeld();signal?.throwIfAborted();
      const child=this.spawn(runtime.executable,['-Xmx512M','-jar',jar,'nogui'],{cwd:path.join(entry.root,'server'),shell:false,windowsHide:true,stdio:['pipe','ignore','ignore']});entry.child=child;entry.lease=lease;entry.state.status='starting';entry.state.network={host:network.host,port:network.port};entry.state.runtime={executable:runtime.executable,sha256:runtime.sha256,majorVersion:runtime.majorVersion};
      entry.exited=new Promise(resolve=>{let settled=false,spawnObserved=false,provenSpawnFailure=false;const settle=(status,exit)=>{if(settled)return;settled=true;entry.state.status=status;entry.state.startup.status=status==='stopped'?'exited':'never-spawned';if(exit)entry.state.exit=exit;entry.child=null;entry.exitPersistence=(async()=>{await lease.release();entry.lease=null;await this.persist(entry);})();entry.exitPersistence.catch(()=>{entry.state.status='persistence-or-lease-release-failed';});resolve();};child.once('spawn',()=>{spawnObserved=true;});child.once('exit',(code,exitSignal)=>settle('stopped',{code,signal:exitSignal}));child.once('error',error=>{if(settled)return;provenSpawnFailure=!spawnObserved&&!Number.isSafeInteger(child.pid)&&['ENOENT','EACCES','ENOEXEC'].includes(error.code);entry.state.status='process-error';entry.state.startup.status='process-error';entry.errorPersistence=this.persist(entry);entry.errorPersistence.catch(()=>{entry.state.status='persistence-failed';});});child.once('close',()=>{if(provenSpawnFailure&&!spawnObserved&&!Number.isSafeInteger(child.pid))settle('launch-failed');});});
      if(!Number.isSafeInteger(child.pid)||child.pid<=0)throw new Error('Spawned process identity is unavailable.');entry.identity=await this.identity(child.pid);if(entry.identity.pid!==child.pid||path.resolve(entry.identity.executablePath).toLowerCase()!==path.resolve(runtime.executable).toLowerCase()||child.exitCode!==null||!entry.child)throw new Error('Spawned process identity does not match the verified runtime.');entry.state.process={...entry.identity,parentPid:process.pid};entry.state.status='running';entry.state.startup.status='admitted';entry.state.readiness='not-verified';await this.persist(entry);if(signal?.aborted)await this.stop(id);return this.status(id);
    }catch(error){
      if(entry.child)entry.state.status='ownership-unverified';
      else {entry.state.startup={status:signal?.aborted?'canceled':'admission-failed',generatedConfiguration:entry.generatedConfig===true,reason:'No process was admitted; an unchanged owned startup configuration may be reused by a fresh attempt.'};if(lease&&!entry.lease)await lease.release?.();}
      await this.persist(entry);throw error;
    }finally{entry.startPending=false;}
  }
  async status(id){const entry=this.entry(id);if(entry.child){try{const current=await this.identity(entry.child.pid);if(JSON.stringify(current)!==JSON.stringify(entry.identity)||entry.child.exitCode!==null)throw new Error('Process identity changed.');}catch{entry.state.status='ownership-unverified';}}return structuredClone(entry.state);}
  async stop(id,{timeoutMs=10000}={}){const entry=this.entry(id);if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new Error('Invalid bounded stop timeout.');if(!entry.child)return this.status(id);if(entry.state.status!=='running'||JSON.stringify(await this.identity(entry.child.pid))!==JSON.stringify(entry.identity))throw new Error('Normal stop requires the exact owned running process.');entry.state.status='stopping';await this.persist(entry);await new Promise((resolve,reject)=>entry.child.stdin.write('stop\n',error=>error?reject(error):resolve()));let timer;const settled=await Promise.race([entry.exited.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);clearTimeout(timer);if(!settled){entry.state.status='stop-timeout';await this.persist(entry);throw new Error('Owned server did not stop normally within the bound; no force termination attempted.');}await entry.exitPersistence;return this.status(id);}
}
