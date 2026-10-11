import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const release=JSON.parse(await fs.readFile(new URL('../docs/features/converter/minimal-component-release.json',import.meta.url),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function runBounded(executable,args,{timeoutMs=30000,stage='component-subprocess'}={}){
 if(!['component-subprocess','destination-reparse-check','minimal-archive-extract','archive-package-extract'].includes(stage))throw new Error('Invalid component subprocess stage.');
 await new Promise((resolve,reject)=>{const child=spawn(executable,args,{windowsHide:true,stdio:'ignore'});let timedOut=false;const failure=(code,exitCode=null,signal=null)=>Object.assign(new Error(`Component subprocess failed: ${stage}/${code} (exit ${exitCode===null?'none':exitCode}).`),{code,stage,exitCode,signal:['SIGTERM','SIGKILL','SIGABRT'].includes(signal)?signal:null});const timer=setTimeout(()=>{timedOut=true;child.kill();},timeoutMs);child.once('error',error=>{clearTimeout(timer);reject(failure(['ENOENT','EACCES','EPERM'].includes(error.code)?error.code:'SPAWN_FAILED'));});child.once('exit',(code,signal)=>{clearTimeout(timer);if(timedOut){const error=failure('ETIMEDOUT',code,signal);error.message='Component extraction timed out: '+stage+'.';reject(error);}else if(code!==0)reject(failure('SUBPROCESS_FAILED',code,signal));else resolve();});});
}
export async function assertUnlinkedPath(target){
 const absolute=path.resolve(target);const ancestors=[];let cursor=absolute;
 while(true){try{const stat=await fs.lstat(cursor);if(stat.isSymbolicLink())throw new Error('Linked component destination is forbidden.');ancestors.push(cursor);}catch(error){if(error.code!=='ENOENT')throw error;}const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;}
 if(process.platform==='win32'){
  const literals=ancestors.map(p=>"'"+p.replaceAll("'","''")+"'").join(',');
  const script=`$ErrorActionPreference='Stop'; foreach ($p in @(${literals})) { if (((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { exit 9 } }`;
  await runBounded(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{timeoutMs:10000,stage:'destination-reparse-check'});
 }
 return absolute;
}
export function validateArchiveEntries(buffer){
 let end=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--){if(buffer.readUInt32LE(i)===0x06054b50&&i+22+buffer.readUInt16LE(i+20)===buffer.length){end=i;break;}}
 if(end<0)throw new Error('Invalid component ZIP directory.');
 const count=buffer.readUInt16LE(end+10),size=buffer.readUInt32LE(end+12),start=buffer.readUInt32LE(end+16);
 if(buffer.readUInt16LE(end+4)||buffer.readUInt16LE(end+6)||count!==buffer.readUInt16LE(end+8)||count!==Object.keys(release.files).length+1||start+size!==end)throw new Error('Unexpected component ZIP directory.');
 const seen=new Set();let offset=start,total=0;
 for(let i=0;i<count;i++){
  if(offset+46>end||buffer.readUInt32LE(offset)!==0x02014b50)throw new Error('Invalid component ZIP member.');
  const flags=buffer.readUInt16LE(offset+8),method=buffer.readUInt16LE(offset+10),compressed=buffer.readUInt32LE(offset+20),expanded=buffer.readUInt32LE(offset+24),n=buffer.readUInt16LE(offset+28),extra=buffer.readUInt16LE(offset+30),comment=buffer.readUInt16LE(offset+32),attributes=buffer.readUInt32LE(offset+38),local=buffer.readUInt32LE(offset+42);
  const name=buffer.subarray(offset+46,offset+46+n).toString('utf8');
  if(offset+46+n+extra+comment>end||seen.has(name)||flags&1||![0,8].includes(method)||((attributes>>>16)&0xf000)===0xa000)throw new Error('Unsafe component ZIP member.');
  seen.add(name);const normalized=name.startsWith('./')?name.slice(2):name;
  if(name!=='./'&&(!Object.hasOwn(release.files,normalized)||expanded!==release.files[normalized].bytes))throw new Error('Unexpected component ZIP member.');
  if(local+30>start||buffer.readUInt32LE(local)!==0x04034b50)throw new Error('Invalid local ZIP member.');
  const localN=buffer.readUInt16LE(local+26),localExtra=buffer.readUInt16LE(local+28);
  if(buffer.readUInt16LE(local+6)!==flags||buffer.readUInt16LE(local+8)!==method)throw new Error('Mismatched local ZIP member.');
  if(buffer.subarray(local+30,local+30+localN).toString('utf8')!==name||local+30+localN+localExtra+compressed>start)throw new Error('Mismatched local ZIP member.');
  total+=expanded;offset+=46+n+extra+comment;
 }
 if(offset!==end||total!==Object.values(release.files).reduce((sum,f)=>sum+f.bytes,0))throw new Error('Invalid component ZIP limits.');
 return true;
}
export async function validateMinimalRuntime(directory){
 await assertUnlinkedPath(directory);
 const names=await fs.readdir(directory);if(names.length!==Object.keys(release.files).length||names.some(name=>!Object.hasOwn(release.files,name)))throw new Error('Unexpected component contents.');
 for(const [name,expected]of Object.entries(release.files)){const p=path.join(directory,name);await assertUnlinkedPath(p);const stat=await fs.lstat(p);if(!stat.isFile()||stat.size!==expected.bytes||hash(await fs.readFile(p))!==expected.sha256)throw new Error('Component file hash mismatch: '+name);}
 return {profile:release.profile,ffmpegPath:path.resolve(directory,'ffmpeg.exe'),ffmpegSha256:release.files['ffmpeg.exe'].sha256,ffprobePath:path.resolve(directory,'ffprobe.exe'),ffprobeSha256:release.files['ffprobe.exe'].sha256};
}
export async function publishMinimalRuntime(source,destination,{copyFile=fs.copyFile}={}){
 const target=await assertUnlinkedPath(destination);
 try{await fs.lstat(target);throw new Error('Existing component destination must not be overwritten.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const parent=path.dirname(target);await fs.mkdir(parent,{recursive:true});await assertUnlinkedPath(parent);
 const stage=await fs.mkdtemp(path.join(parent,'.converter-component-'));
 try{for(const name of Object.keys(release.files))await copyFile(path.join(source,name),path.join(stage,name));await validateMinimalRuntime(stage);await assertUnlinkedPath(target);try{await fs.lstat(target);throw new Error('Existing component destination must not be overwritten.');}catch(error){if(error.code!=='ENOENT')throw error;}await fs.rename(stage,target);return await validateMinimalRuntime(target);}finally{await fs.rm(stage,{recursive:true,force:true,maxRetries:3}).catch(()=>{});}
}
export async function prepareMinimalComponent(url,destination){
 const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.hostname!=='github.com'||parsed.username||parsed.password||parsed.search||parsed.hash||!parsed.pathname.includes('/releases/download/')||!parsed.pathname.endsWith('/'+release.asset))throw new Error('An immutable GitHub release asset URL is required.');
 await assertUnlinkedPath(destination);
 let exists=false;try{await fs.lstat(destination);exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}if(exists)return await validateMinimalRuntime(destination);
 const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'converter-component-'));
 try{const response=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!response.ok||!response.body)throw new Error('Component download unavailable.');const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>release.bytes)throw new Error('Component download exceeds expected length.');chunks.push(chunk);}const buffer=Buffer.concat(chunks);if(bytes!==release.bytes||hash(buffer)!==release.sha256)throw new Error('Component archive verification failed.');validateArchiveEntries(buffer);const archive=path.join(scratch,release.asset);await fs.writeFile(archive,buffer);const extracted=path.join(scratch,'runtime');await fs.mkdir(extracted);await runBounded(path.join(process.env.SystemRoot,'System32/tar.exe'),['-xf',archive,'-C',extracted],{stage:'minimal-archive-extract'});await validateMinimalRuntime(extracted);return await publishMinimalRuntime(extracted,destination);
 }finally{await fs.rm(scratch,{recursive:true,force:true,maxRetries:3}).catch(()=>{});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw new Error('Usage: node scripts/converter-minimal-component.mjs <immutable-release-asset-url> <destination>');console.log(JSON.stringify(await prepareMinimalComponent(process.argv[2],process.argv[3])));}
