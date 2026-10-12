import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {safeArchiveName} from '../features/converter/archive.mjs';
export const INSTALL_LIMITS=Object.freeze({archiveBytes:2*1024**3,expandedBytes:8*1024**3,entryBytes:4*1024**3,entries:4096,listingBytes:8*1024**2,downloadMs:30*60*1000});
export function installationError(code){return Object.assign(new Error('Managed runtime operation did not complete.'),{installationCode:code});}
export async function canonicalInstallPath(filename,{directory=false,missing=false}={}){
 if(!path.isAbsolute(filename))throw installationError('PATH');
 for(let current=path.resolve(filename);;current=path.dirname(current)){
  try{const info=await fs.lstat(current);if(info.isSymbolicLink()||path.resolve(await fs.realpath(current)).toLowerCase()!==current.toLowerCase())throw installationError('PATH');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(path.dirname(current)===current)break;
 }
 let info;try{info=await fs.lstat(filename);}catch(error){if(missing&&error.code==='ENOENT')return null;throw error;}
 if(directory?!info.isDirectory():!info.isFile())throw installationError('PATH');return info;
}
export async function hashInstallFile(filename,maxBytes=INSTALL_LIMITS.entryBytes){
 await canonicalInstallPath(filename);const handle=await fs.open(filename,'r'),hash=createHash('sha256');let total=0;
 try{const before=await handle.stat();if(before.size>maxBytes)throw installationError('SIZE');const buffer=Buffer.alloc(1024*1024);
  for(;;){const{bytesRead}=await handle.read(buffer,0,buffer.length,null);if(!bytesRead)break;total+=bytesRead;if(total>maxBytes)throw installationError('SIZE');hash.update(buffer.subarray(0,bytesRead));}
  const after=await handle.stat(),current=await canonicalInstallPath(filename);if(total!==before.size||!['dev','ino','size','mtimeMs','ctimeMs'].every(key=>before[key]===after[key]&&before[key]===current[key]))throw installationError('CHANGED');
  return {sha256:hash.digest('hex'),bytes:total};
 }finally{await handle.close();}
}
export async function downloadRuntimeArchive(manifest,cache,{signal,fetchImpl=fetch,onProgress=()=>{}}={}){
 if(!/^[a-f0-9]{64}$/.test(manifest.sha256)||!/^v\d+\.\d+\.\d+$/.test(manifest.version)||!Number.isSafeInteger(manifest.bytes)||manifest.bytes<1||manifest.bytes>INSTALL_LIMITS.archiveBytes||!/^ollama-windows-(amd64|arm64)\.zip$/.test(manifest.name)||manifest.sourceUrl!==`https://github.com/ollama/ollama/releases/download/${manifest.version}/${manifest.name}`)throw installationError('MANIFEST');
 await canonicalInstallPath(cache,{directory:true});const destination=path.join(cache,manifest.sha256+'.zip');
 if(await canonicalInstallPath(destination,{missing:true})){
  const existing=await hashInstallFile(destination,INSTALL_LIMITS.archiveBytes);if(existing.sha256===manifest.sha256&&existing.bytes===manifest.bytes){onProgress(manifest.bytes);return destination;}
  await fs.rename(destination,destination+'.rejected-'+randomUUID());
 }
 const temporary=path.join(cache,'.download-'+randomUUID()+'.partial');await canonicalInstallPath(temporary,{missing:true});const handle=await fs.open(temporary,'wx',0o600);let response,reader,total=0;
 const lifetime=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(INSTALL_LIMITS.downloadMs)]);
 try{
  let url=new URL(manifest.sourceUrl);
  for(let redirect=0;redirect<=5;redirect++){
   if(url.protocol!=='https:'||url.username||url.password||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname))throw installationError('SOURCE');
   response=await fetchImpl(url.href,{redirect:'manual',signal:lifetime});
   if(![301,302,303,307,308].includes(response.status))break;
   const location=response.headers.get('location');await response.body?.cancel();if(!location||redirect===5)throw installationError('SOURCE');url=new URL(location,url);
  }
  if(response.status!==200||!response.body)throw installationError('DOWNLOAD');
  const declared=response.headers.get('content-length');if(declared!==null&&Number(declared)!==manifest.bytes)throw installationError('SIZE');
  reader=response.body.getReader();let reported=0,last=0;
  for(;;){lifetime.throwIfAborted();const item=await reader.read();if(item.done)break;total+=item.value.byteLength;if(total>manifest.bytes)throw installationError('SIZE');await handle.writeFile(item.value);if(total-reported>=256*1024||Date.now()-last>150){onProgress(total);reported=total;last=Date.now();}}
  await handle.sync();await handle.close();if(total!==manifest.bytes)throw installationError('SIZE');const actual=await hashInstallFile(temporary,INSTALL_LIMITS.archiveBytes);
  if(actual.sha256!==manifest.sha256||actual.bytes!==manifest.bytes)throw installationError('HASH');lifetime.throwIfAborted();onProgress(total);
  if(await canonicalInstallPath(destination,{missing:true}))throw installationError('CACHE_CONFLICT');await fs.rename(temporary,destination);return destination;
 }catch(error){throw signal?.aborted?installationError('CANCELLED'):error.installationCode?error:installationError('DOWNLOAD');}
 finally{await reader?.cancel().catch(()=>{});await handle.close().catch(()=>{});}
}
export async function listRuntimeTree(root,{signal}={}){
 await canonicalInstallPath(root,{directory:true});const rows=[];let total=0;
 async function walk(relative=''){
  for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})){signal?.throwIfAborted();const name=relative?relative+'/'+entry.name:entry.name;safeArchiveName(name);const filename=path.join(root,name);
   if(entry.isDirectory()){await canonicalInstallPath(filename,{directory:true});await walk(name);}else{await canonicalInstallPath(filename);const identity=await hashInstallFile(filename);total+=identity.bytes;rows.push({path:name,...identity});if(rows.length>INSTALL_LIMITS.entries||total>INSTALL_LIMITS.expandedBytes)throw installationError('SIZE');}
  }
 }await walk();return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
const extractionScript=await fs.readFile(new URL('./ollama-install-extract.ps1',import.meta.url),'utf8');
const expectedArchives=JSON.parse(await fs.readFile(new URL('./ollama-runtime-files.json',import.meta.url),'utf8')).archives;
export function runtimeArchiveAdmitted(manifest){return expectedArchives.some(value=>value.architecture===manifest?.architecture&&value.version===manifest?.version&&value.archiveSha256===manifest?.sha256&&value.sourceUrl===manifest?.sourceUrl);}
export async function verifyExtractionHost(){const root=process.env.SystemRoot;if(!root||!path.win32.isAbsolute(root))throw installationError('TOOLS');await canonicalInstallPath(path.win32.join(root,'System32','WindowsPowerShell','v1.0','powershell.exe'));}
export async function extractRuntimeArchive(archive,stage,_toolsRoot,{signal,manifest,spawnImpl=spawn,reviewedArchive}={}){
 const expected=reviewedArchive||expectedArchives.find(value=>value.architecture===manifest?.architecture&&value.version===manifest?.version&&value.archiveSha256===manifest?.sha256&&value.sourceUrl===manifest?.sourceUrl);
 if(!expected)throw installationError('TRUST');await canonicalInstallPath(archive);await canonicalInstallPath(stage,{directory:true});
 const systemRoot=process.env.SystemRoot;if(!systemRoot||!path.win32.isAbsolute(systemRoot))throw installationError('TOOLS');
 const capacity=await fs.statfs(stage);if(Number(capacity.bavail)*Number(capacity.bsize)<expected.expandedBytes+64*1024**2)throw installationError('SPACE');
 const cancelPath=path.join(path.dirname(stage),'.cancel-'+randomUUID());const configuration=JSON.stringify({schemaVersion:1,archive,stage,cancelPath,bytes:manifest.bytes,sha256:manifest.sha256,expandedBytes:expected.expandedBytes,files:expected.files});if(configuration.length>30000)throw installationError('SIZE');
 const child=spawnImpl(path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(extractionScript,'utf16le').toString('base64')],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],env:{SystemRoot:systemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,MFE_OLLAMA_EXTRACTION_CONFIGURATION:configuration}});
 let markerIdentity=null,marker=Promise.resolve(),output='',initialized=false,ready=false,cancelRequested=Boolean(signal?.aborted);const requestCancel=()=>{cancelRequested=true;if(!ready)return;marker=marker.then(async()=>{if(markerIdentity)return;await canonicalInstallPath(path.dirname(cancelPath),{directory:true});const handle=await fs.open(cancelPath,'wx',0o600);try{await handle.writeFile('cancel');await handle.sync();markerIdentity=await handle.stat();}finally{await handle.close();}}).catch(()=>{});};
 signal?.addEventListener('abort',requestCancel,{once:true});const timeout=setTimeout(requestCancel,INSTALL_LIMITS.downloadMs);
 try{
  await new Promise((resolve,reject)=>{let spawnError=false;child.once('error',()=>{spawnError=true;});child.stderr.on('data',()=>{});child.stdout.on('data',data=>{output+=data.toString('utf8');if(output.length>128){requestCancel();return;}if(!initialized&&output.includes('INITIALIZED')){initialized=true;child.stdin.end();}if(!ready&&output.includes('READY')){ready=true;if(cancelRequested)requestCancel();}if(output.includes('COMPLETE')||output.includes('FAILED'))child.stdin.end();});child.once('close',code=>{if(spawnError)reject(installationError('TOOLS'));else if(cancelRequested)reject(installationError('CANCELLED'));else if(code===0&&output.replace(/\r/g,'')==='INITIALIZED\nREADY\nCOMPLETE\n')resolve();else reject(installationError('TRUST'));});child.stdin.on('error',()=>{});});
 }finally{clearTimeout(timeout);signal?.removeEventListener('abort',requestCancel);child.stdin.end();await marker;if(markerIdentity){await canonicalInstallPath(path.dirname(cancelPath),{directory:true});const info=await canonicalInstallPath(cancelPath);if(info.dev!==markerIdentity.dev||info.ino!==markerIdentity.ino||info.size!==6||(await hashInstallFile(cancelPath,6)).sha256!==createHash('sha256').update('cancel').digest('hex'))throw installationError('PATH');await fs.unlink(cancelPath);}}
 const files=await listRuntimeTree(stage,{signal});const target=[...expected.files].sort((a,b)=>a.path.localeCompare(b.path));
 if(files.length!==target.length||files.some((row,i)=>row.path!==target[i].path||row.bytes!==target[i].bytes||row.sha256!==target[i].sha256))throw installationError('TRUST');return files;
}
