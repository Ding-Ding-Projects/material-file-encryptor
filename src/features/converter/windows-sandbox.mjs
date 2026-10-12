import {createArchiveLauncher,ARCHIVE_IDS} from './archive-runtime.mjs';
import {createMediaLauncher, MEDIA_IDS} from './media.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import net from 'node:net';
const require=createRequire(import.meta.url);
const codeDirectory=path.dirname(fileURLToPath(import.meta.url));
async function hash(filename){return createHash('sha256').update(await fs.readFile(filename)).digest('hex');}
async function packageRoot(name){let root=path.dirname(require.resolve(name));while(root!==path.dirname(root)){try{const manifest=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));if(manifest.name===name)return root;}catch{}root=path.dirname(root);}throw new Error('Bundled PDF package unavailable.');}
function nativeFailure(code,phase,details={}){return Object.assign(new Error('Sandbox '+code+'.'),{code,converterPhase:phase,nativeDetails:details});}
export function validateConfinementProbe(result,baselines){
 const proof=result?.details,denied=value=>value==='EACCES'||value==='EPERM';
 if(!Array.isArray(result?.outputs)||result.outputs.length!==0||proof?.schema!==1||proof.workVerified!==true||!denied(proof.outsideRead)||!denied(proof.payloadWrite)||!denied(proof.network)||baselines?.before!==true||baselines.after!==true||baselines.connections!==2)throw nativeFailure('BEHAVIORAL_PROBE_FAILED','provider-probe');
 return true;
}
async function probeEndpoint(runtimePath,runtimeSha256,port,challenge){
 if(await hash(runtimePath)!==runtimeSha256)throw nativeFailure('BEHAVIORAL_PROBE_FAILED','provider-probe');
 const source="const net=require('node:net');const socket=net.connect({host:'127.0.0.1',port:Number(process.argv[1])});let value='';socket.once('connect',()=>socket.write(process.argv[2]));socket.on('data',data=>{value+=data;if(value.length>128){socket.destroy();process.exitCode=1;}});socket.once('end',()=>{if(value!==process.argv[2])process.exitCode=1;else process.stdout.write(value);});socket.once('error',()=>{process.exitCode=1;});socket.setTimeout(2000,()=>{socket.destroy();process.exitCode=1;});";
 return new Promise((resolve,reject)=>{
  const child=spawn(runtimePath,['-e',source,String(port),challenge],{windowsHide:true,stdio:['ignore','pipe','ignore'],env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR}});
  let output='',timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},3000);
  child.stdout.on('data',bytes=>{output+=bytes.toString();if(output.length>128){timedOut=true;child.kill();}});
  child.once('error',()=>{clearTimeout(timer);reject(nativeFailure('BEHAVIORAL_PROBE_FAILED','provider-probe'));});
  child.once('close',code=>{clearTimeout(timer);if(!timedOut&&code===0&&output===challenge)resolve(true);else reject(nativeFailure('BEHAVIORAL_PROBE_FAILED','provider-probe'));});
 });
}
async function verifyConfinement(launch,runtimePath,runtimeSha256){
 const challenge=randomBytes(32).toString('hex'),sockets=new Set();let connections=0;
 const server=net.createServer(socket=>{
  connections++;sockets.add(socket);let value='';socket.setTimeout(3000,()=>socket.destroy());
  socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));
  socket.on('data',bytes=>{if(bytes.length>128||value.length+bytes.length>128){socket.destroy();return;}value+=bytes.toString();if(value===challenge)socket.end(challenge);else if(value.length>=challenge.length)socket.destroy();});
 });
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port,before=await probeEndpoint(runtimePath,runtimeSha256,port,challenge);
  let result,probeError;
  try{result=await launch({inputs:[],adapterId:'hex',options:{}},{port,challenge}).result;}catch(error){probeError=error;}
  const after=await probeEndpoint(runtimePath,runtimeSha256,port,challenge);
  if(probeError)throw probeError;
  validateConfinementProbe(result,{before,after,connections});
 }finally{for(const socket of sockets)socket.destroy();if(server.listening)await new Promise(resolve=>server.close(resolve));}
}
export function validateNativeReceipt(output,nonce,exitCode,confinementProbe=false){
 let value;try{if(typeof output!=='string'||output.length>8192)throw new Error();value=JSON.parse(output);}catch{throw nativeFailure('RECEIPT_INVALID','provider-receipt');}
 if(value?.schema!==1||value.nonce!==nonce)throw nativeFailure('RECEIPT_INVALID','provider-receipt');
 const details={};for(const [key,input]of [['launcherExitCode',exitCode],['workerExitCode',value.exitCode],['nativeError',value.nativeError],['nativeHresult',value.hresult]])if(Number.isSafeInteger(input)&&input>=-2147483648&&input<=4294967295)details[key]=input;
 if(exitCode!==0||value.exitCode!==0||value.isolated!==true)throw nativeFailure('NATIVE_EXIT_FAILED','provider-native',details);
 if(value.timedOut||value.cancelled||value.killedForStorage||value.profileDeleted!==true||value.networkCapabilities!==0||value.activeProcessLimit!==1||value.memoryBytes!==268435456||value.timeoutMs!==30000||value.appContainerVerified!==true||value.capabilityCount!==0||value.jobLimitsVerified!==true)throw nativeFailure('RECEIPT_INVALID','provider-receipt',details);
 if(confinementProbe&&(value.probeSentinelDeleted!==true||!/^[0-9a-f]{64}$/.test(value.resultSha256)))throw nativeFailure('RECEIPT_INVALID','provider-receipt',details);
 return value;
}
/** Call only with package-owned executables whose hashes were verified by the build manifest. */
async function createWindowsSandboxProviderInternal({launcherPath,launcherSha256,runtimePath,runtimeSha256,launcherCompanionHashes={},mediaRuntime,archiveRuntime,onDiagnostic}) {
 if(process.platform!=='win32')throw new Error('AppContainer conversion is supported only on Windows.');
 const companions=[];for(const suffix of ['.dll','.runtimeconfig.json','.deps.json']){const filename=launcherPath.slice(0,-4)+suffix;if(await fs.access(filename).then(()=>true,()=>false)){const expected=launcherCompanionHashes[path.basename(filename)];if(!/^[0-9a-f]{64}$/.test(expected)||await hash(filename)!==expected)throw new Error('Sandbox companion verification failed.');companions.push([filename,expected]);}}
 for(const [filename,expected] of [[launcherPath,launcherSha256],[runtimePath,runtimeSha256]])if(!path.isAbsolute(filename)||!/^[0-9a-f]{64}$/.test(expected)||await hash(filename)!==expected)throw new Error('Sandbox executable verification failed.');
 const initializationDiagnostics=[];const report=(error,component)=>{const diagnostic=safeConverterDiagnostic(error,component);initializationDiagnostics.push(diagnostic);try{onDiagnostic?.(diagnostic);}catch{}};
 let media=null,mediaUnavailableReason='Verified bundled FFmpeg 9.0.2 runtime is unavailable.';if(mediaRuntime){try{media=await createMediaLauncher({launcherPath,launcherSha256,launcherCompanionHashes,...mediaRuntime});}catch(error){report(error,'media');mediaUnavailableReason='Bundled media runtime could not pass executable and AppContainer startup verification.';}}
 let archive=null,archiveUnavailableReason='Verified bundled 7-Zip 26.04 runtime is unavailable.';if(archiveRuntime){try{archive=await createArchiveLauncher({launcherPath,launcherSha256,launcherCompanionHashes,...archiveRuntime});}catch(error){report(error,'archive');archiveUnavailableReason='Bundled archive runtime did not pass executable and AppContainer startup verification.';}}
 const launchIsolated=({inputs,adapterId,options,timeout=30000},confinementProbe=null)=>{
 let child,staging,probeDirectory,stopped=false,providerPhase='provider-verify';const nonce=randomBytes(32).toString('hex');
 const result=(async()=>{try{if((await Promise.all(companions.map(async([p,h])=>await hash(p)===h))).some(ok=>!ok)||await hash(launcherPath)!==launcherSha256||await hash(runtimePath)!==runtimeSha256)throw new Error('Sandbox executable changed.');if(!Array.isArray(inputs)||inputs.reduce((n,b)=>n+b.length,0)>64*1024*1024)throw new Error('Input limit exceeded.');if(JSON.stringify(options||{}).length>65536)throw new Error('Options limit exceeded.');providerPhase='provider-copy';const capacity=await fs.statfs(os.tmpdir());if(Number(capacity.bavail)*Number(capacity.bsize)<384*1024*1024)throw new Error('Insufficient temporary capacity for isolated conversion.');staging=await fs.mkdtemp(path.join(os.tmpdir(),'converter-isolated-'));const payload=path.join(staging,'payload'),work=path.join(staging,'work');await fs.mkdir(path.join(payload,'code'),{recursive:true});await fs.mkdir(work);await fs.copyFile(runtimePath,path.join(payload,'node.exe'));if(await hash(path.join(payload,'node.exe'))!==runtimeSha256)throw new Error('Staged runtime hash mismatch.');await fs.copyFile(path.join(codeDirectory,confinementProbe?'confinement-worker.mjs':'os-worker.mjs'),path.join(payload,'worker.mjs'));if(confinementProbe)await fs.writeFile(path.join(payload,'probe-payload.bin'),'synthetic',{flag:'wx'});for(const name of ['registry.mjs','pdf.mjs','archive.mjs','data.mjs','table.mjs','convert.mjs'])await fs.copyFile(path.join(codeDirectory,name),path.join(payload,'code',name));
 if(adapterId.startsWith('pdf-'))for(const name of ['pdf-lib','@pdf-lib/standard-fonts','@pdf-lib/upng','pako','tslib'])await fs.cp(await packageRoot(name),path.join(payload,'node_modules',name),{recursive:true,dereference:true});
 const names=[];for(let i=0;i<inputs.length;i++){const name=`input-${i}.bin`;await fs.writeFile(path.join(work,name),inputs[i],{flag:'wx',mode:0o600});names.push(name);}await fs.writeFile(path.join(work,'request.json'),JSON.stringify(confinementProbe?{schema:1,nonce,...confinementProbe}:{schema:1,nonce,inputs:names,adapterId,options}),{flag:'wx',mode:0o600});if(confinementProbe)probeDirectory=await fs.mkdtemp(path.join(os.tmpdir(),'converter-probe-parent-'));const manifest={schema:1,nonce,runtime:path.join(payload,'node.exe'),worker:path.join(payload,'worker.mjs'),directory:staging,timeoutMs:Math.min(timeout,30000),memoryBytes:268435456,...(confinementProbe?{confinementProbe:true,probeDirectory}:{})};const manifestPath=path.join(staging,'launcher.json');await fs.writeFile(manifestPath,JSON.stringify(manifest),{flag:'wx',mode:0o600});if(stopped)throw new Error('Cancelled.');
 providerPhase='provider-launch';const receipt=await new Promise((resolve,reject)=>{child=spawn(launcherPath,['--request',manifestPath],{windowsHide:true,stdio:['ignore','pipe','ignore'],env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:os.tmpdir(),TMP:os.tmpdir(),LOCALAPPDATA:process.env.LOCALAPPDATA,APPDATA:process.env.APPDATA,USERPROFILE:process.env.USERPROFILE,HOMEDRIVE:process.env.HOMEDRIVE,HOMEPATH:process.env.HOMEPATH}});let output='';const timer=setTimeout(()=>{child.kill();reject(nativeFailure('PROVIDER_TIMEOUT','provider-native'));},Math.min(timeout,30000)+10000);child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.length>8192){child.kill();reject(nativeFailure('RECEIPT_INVALID','provider-receipt'));}});child.once('error',()=>{clearTimeout(timer);reject(nativeFailure('SPAWN_FAILED','provider-launch'));});child.once('exit',code=>{clearTimeout(timer);try{resolve(validateNativeReceipt(output,nonce,code,Boolean(confinementProbe)));}catch(error){reject(error);}});});
 providerPhase='provider-output';if(!receipt||stopped)throw new Error('Cancelled.');const resultFile=path.join(work,'result.json');if((await fs.stat(resultFile)).size>1024*1024)throw new Error('Result metadata limit.');if(await hash(resultFile)!==receipt.resultSha256)throw new Error('Sandbox result hash mismatch.');const decoded=JSON.parse(await fs.readFile(resultFile,'utf8'));if(decoded.schema!==1||decoded.nonce!==nonce||!Array.isArray(decoded.outputs)||decoded.outputs.length>1000)throw new Error('Invalid sandbox output.');let total=0;const outputs=[];for(const output of decoded.outputs){if(!/^result-\d+\.bin$/.test(output.filename))throw new Error('Invalid sandbox output name.');const p=path.join(work,output.filename),stat=await fs.lstat(p);total+=stat.size;if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==output.bytes||total>128*1024*1024)throw new Error('Sandbox output limit.');outputs.push({name:output.name,bytes:await fs.readFile(p)});}return {outputs,details:decoded.details};
 }catch(error){if(!error.converterPhase)error.converterPhase=providerPhase;let diagnostic;try{diagnostic=JSON.parse(await fs.readFile(path.join(staging,'work','error.json'),'utf8'));}catch{}if(diagnostic&&error.code===undefined)error.code='WORKER_FAILED';throw error;}finally{try{if(probeDirectory)await fs.rm(probeDirectory,{recursive:true,force:true,maxRetries:3});}finally{if(staging)await fs.rm(staging,{recursive:true,force:true,maxRetries:3});}}})();
 return {result,terminate:async()=>{stopped=true;if(staging&&child)await fs.writeFile(path.join(staging,'work','cancel.signal'),'cancel',{flag:'w'}).catch(()=>{});}};
 };
 const provider={initializationDiagnostics,verifiedOsIsolation:false,verifiedArchiveRuntime:Boolean(archive),archiveUnavailableReason,verifiedMediaRuntime:Boolean(media),verifiedMediaProfile:mediaRuntime?.profile||'default',mediaUnavailableReason,previewMedia:media?.preview,launch(request){
  if(provider.verifiedOsIsolation!==true)throw nativeFailure('BEHAVIORAL_PROBE_FAILED','provider-probe');
  if(ARCHIVE_IDS.includes(request.adapterId)){if(!archive)throw new Error(archiveUnavailableReason);return archive.launch(request);}
  if(MEDIA_IDS.includes(request.adapterId)){if(!media)throw new Error('Bundled media runtime verification is missing.');return media.launch(request);}
  return launchIsolated(request);
 }};
 await verifyConfinement(launchIsolated,runtimePath,runtimeSha256);
 const probe=await launchIsolated({inputs:[Buffer.from('sandbox')],adapterId:'hex',options:{}}).result;
 if(probe.outputs.length!==1||probe.outputs[0].bytes.toString()!=='73616e64626f78')throw new Error('Sandbox startup verification failed.');
 provider.verifiedOsIsolation=true;return provider;
}

export function safeConverterDiagnostic(error,component='provider'){
 const codes=new Set(['ENOENT','EACCES','EPERM','EINVAL','ENOTDIR','EISDIR','ENOSPC','ETIMEDOUT','ABORT_ERR','RECEIPT_INVALID','NATIVE_EXIT_FAILED','PROVIDER_TIMEOUT','SPAWN_FAILED','WORKER_FAILED','BEHAVIORAL_PROBE_FAILED']);
 const phases=new Set(['media-probe','media-encode','media-validate','media-initialize','provider-verify','provider-copy','provider-launch','provider-native','provider-receipt','provider-output','provider-probe']);
 const numeric={};for(const key of ['launcherExitCode','workerExitCode','nativeError','nativeHresult']){const value=error?.nativeDetails?.[key];if(Number.isSafeInteger(value)&&value>=-2147483648&&value<=4294967295)numeric[key]=value;}
 return Object.freeze({schema:1,component:['provider','media','archive'].includes(component)?component:'provider',phase:phases.has(error?.converterPhase)?error.converterPhase:'initialize',code:codes.has(error?.code)?error.code:'INITIALIZATION_FAILED',errorName:['Error','TypeError','RangeError','SyntaxError'].includes(error?.name)?error.name:'Error',...numeric});
}
export async function createWindowsSandboxProvider(config){try{return await createWindowsSandboxProviderInternal(config);}catch(error){if(!error.converterPhase)error.converterPhase='provider-verify';const diagnostic=safeConverterDiagnostic(error,'provider');error.converterDiagnostic=diagnostic;try{config?.onDiagnostic?.(diagnostic);}catch{}throw error;}}
