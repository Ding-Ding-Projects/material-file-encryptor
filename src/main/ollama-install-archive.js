import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {safeArchiveName} from '../features/converter/archive.mjs';
const execute=promisify(execFile);
export const INSTALL_LIMITS=Object.freeze({archiveBytes:2*1024**3,expandedBytes:8*1024**3,entryBytes:4*1024**3,entries:4096,listingBytes:8*1024**2,downloadMs:30*60*1000});
const toolHashes={'7z.exe':'95fff19b73eff77c87c0d7bd32822e43fb90dd2932459f962eb532d8dfb6ba53','7z.dll':'899cd73d7fc60e1c1c35c7de0f5bed3dc69bfe2cecbd48014d868a347970a0b1'};
export async function holdRuntimeArchive(archive,manifest,{signal,spawnImpl=spawn}={}){
 if(!manifest||!Number.isSafeInteger(manifest.bytes)||manifest.bytes<1||manifest.bytes>INSTALL_LIMITS.archiveBytes||!/^[a-f0-9]{64}$/.test(manifest.sha256))throw installationError('HASH');
 const systemRoot=process.env.SystemRoot;if(!systemRoot||!path.win32.isAbsolute(systemRoot))throw installationError('TOOLS');
 const encoded=Buffer.from(archive,'utf8').toString('base64');
 // The read-sharing handle prevents archive writes and replacement while the extractor reads it.
 const command=`$ErrorActionPreference='Stop';try{$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'));$f=[IO.File]::Open($p,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);try{if($f.Length -ne ${manifest.bytes}){throw 'size'};$h=[Security.Cryptography.SHA256]::Create();try{$d=([BitConverter]::ToString($h.ComputeHash($f))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()};if($d -ne '${manifest.sha256}'){throw 'hash'};[Console]::Out.WriteLine('READY');[Console]::Out.Flush();[void][Console]::In.ReadLine()}finally{$f.Dispose()}}catch{exit 1}`;
 const child=spawnImpl(path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
 let released=false,ready=false,output='';const completion=new Promise(resolve=>child.once('close',code=>resolve(code)));const abort=()=>child.kill();signal?.addEventListener('abort',abort,{once:true});
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(installationError('HASH'));},120000);const fail=()=>{clearTimeout(timer);reject(installationError('HASH'));};child.once('error',fail);child.once('close',()=>{if(!ready)fail();});child.stderr.on('data',()=>{});child.stdout.on('data',data=>{output+=data.toString('utf8');if(output.length>32){child.kill();fail();}else if(output==='READY\r\n'||output==='READY\n'){ready=true;clearTimeout(timer);resolve();}});});signal?.throwIfAborted();
  return {assertHeld(){if(released||child.exitCode!==null||child.signalCode!==null||signal?.aborted)throw installationError('HASH');},async release(){if(released)return;released=true;signal?.removeEventListener('abort',abort);child.stdin.end('\n');const timer=setTimeout(()=>child.kill(),5000);await completion;clearTimeout(timer);}};
 }catch{signal?.removeEventListener('abort',abort);child.kill();await completion;throw installationError(signal?.aborted?'CANCELLED':'HASH');}
}
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
export function parseRuntimeArchiveListing(text){
 if(Buffer.byteLength(text)>INSTALL_LIMITS.listingBytes)throw installationError('ARCHIVE');const split=text.replace(/\r\n/g,'\n').split('\n----------\n');if(split.length!==2)throw installationError('ARCHIVE');
 const rows=[],names=new Map();let expanded=0;
 for(const block of split[1].replace(/^\n+|\n+$/g,'').split(/\n\n+/)){
  const fields={};for(const line of block.split('\n')){const index=line.indexOf(' = ');if(index<1)throw installationError('ARCHIVE');const key=line.slice(0,index);if(Object.hasOwn(fields,key))throw installationError('ARCHIVE');fields[key]=line.slice(index+3);}
  const name=safeArchiveName(fields.Path);if(name!==fields.Path.replace(/\\/g,'/')||fields['Symbolic Link']||fields['Hard Link']||fields.Encrypted!=='-'||!['+','-'].includes(fields.Folder)||(fields.Attributes||'').split(/\s+/).some(value=>/^[lbcpsoh][rwxstST-]{9}$/.test(value)))throw installationError('ARCHIVE');
  const directory=fields.Folder==='+';const bytes=Number(fields.Size);if(!Number.isSafeInteger(bytes)||bytes<0||bytes>INSTALL_LIMITS.entryBytes||directory&&bytes!==0||name.endsWith('/')&&!directory)throw installationError('ARCHIVE');
  const normalized=name.replace(/\/$/,'');if(names.has(normalized.toLowerCase()))throw installationError('ARCHIVE');names.set(normalized.toLowerCase(),directory);rows.push({path:normalized,bytes,directory});expanded+=bytes;
  if(rows.length>INSTALL_LIMITS.entries||expanded>INSTALL_LIMITS.expandedBytes)throw installationError('ARCHIVE');
 }
 for(const row of rows){const parts=row.path.split('/');for(let i=1;i<parts.length;i++)if(names.get(parts.slice(0,i).join('/').toLowerCase())===false)throw installationError('ARCHIVE');}
 if(rows.filter(row=>row.path==='ollama.exe'&&!row.directory).length!==1||!rows.some(row=>row.path.startsWith('lib/ollama/')&&!row.directory)||names.has('managed-runtime.json'))throw installationError('ARCHIVE');return rows;
}
export async function verifyArchiveTools(root){
 await canonicalInstallPath(root,{directory:true});const directory=path.join(root,'archive');await canonicalInstallPath(directory,{directory:true});
 for(const [name,sha256]of Object.entries(toolHashes))if((await hashInstallFile(path.join(directory,name),64*1024**2)).sha256!==sha256)throw installationError('TOOLS');return path.join(directory,'7z.exe');
}
export async function listRuntimeTree(root,{signal}={}){
 await canonicalInstallPath(root,{directory:true});const rows=[];let total=0;
 async function walk(relative=''){
  for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})){signal?.throwIfAborted();const name=relative?relative+'/'+entry.name:entry.name;safeArchiveName(name);const filename=path.join(root,name);
   if(entry.isDirectory()){await canonicalInstallPath(filename,{directory:true});await walk(name);}else{await canonicalInstallPath(filename);const identity=await hashInstallFile(filename);total+=identity.bytes;rows.push({path:name,...identity});if(rows.length>INSTALL_LIMITS.entries||total>INSTALL_LIMITS.expandedBytes)throw installationError('SIZE');}
  }
 }await walk();return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
export async function extractRuntimeArchive(archive,stage,toolsRoot,{signal,manifest,executeFile=execute,holdArchive=holdRuntimeArchive}={}){
 const executable=await verifyArchiveTools(toolsRoot);await canonicalInstallPath(archive);await canonicalInstallPath(stage,{directory:true});if((await fs.readdir(stage)).length)throw installationError('ARCHIVE');
 const held=await holdArchive(archive,manifest,{signal});try{held.assertHeld();
 const options={windowsHide:true,shell:false,timeout:10*60*1000,maxBuffer:INSTALL_LIMITS.listingBytes,encoding:'utf8',signal,cwd:path.dirname(executable)};
 const {stdout}=await executeFile(executable,['l','-slt','-sccUTF-8','--',archive],options);held.assertHeld();const listed=parseRuntimeArchiveListing(stdout);
 const capacity=await fs.statfs(stage);if(Number(capacity.bavail)*Number(capacity.bsize)<listed.reduce((sum,row)=>sum+row.bytes,0)+64*1024**2)throw installationError('SPACE');
 await verifyArchiveTools(toolsRoot);await executeFile(executable,['x','-y','-bd','-bb0','-sccUTF-8','-o'+stage,'--',archive],options);await verifyArchiveTools(toolsRoot);
 const files=await listRuntimeTree(stage,{signal});const expected=listed.filter(row=>!row.directory).sort((a,b)=>a.path.localeCompare(b.path));
 held.assertHeld();if(files.length!==expected.length||files.some((row,i)=>row.path!==expected[i].path||row.bytes!==expected[i].bytes))throw installationError('ARCHIVE');return files;
 }finally{await held.release();}
}
