import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createNativeProfileAdapter} from '../features/ollama/native-profiles.js';
import {createVerifiedRuntimeLauncher,OFFICIAL_INSTALL_PAGE} from '../features/ollama/runtime.js';
const execute=promisify(execFile);
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const inside=(root,target)=>{const relative=path.relative(root,target);return !relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
const officialSource=url=>typeof url==='string'&&/^https:\/\/(?:github\.com\/ollama\/ollama\/(?:releases|blob)\/[^\s?#]+|docs\.ollama\.com\/[a-z0-9/_-]+)$/.test(url);
export async function inspectAuthenticode(executable,{executeFile=execute,systemRoot=process.env.SystemRoot,platform=process.platform}={}){
  if(platform!=='win32'||typeof systemRoot!=='string'||!/^[A-Za-z]:\\Windows$/i.test(systemRoot))return {valid:false,publisher:null};
  // Base64 is data, not PowerShell syntax. The target is inspected, never run.
  const encoded=Buffer.from(executable,'utf16le').toString('base64');
  const command="$ErrorActionPreference='Stop'; $p=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('"+encoded+"')); $s=Get-AuthenticodeSignature -LiteralPath $p; @{valid=($s.Status -eq 'Valid');publisher=$s.SignerCertificate.Subject;thumbprint=$s.SignerCertificate.Thumbprint}|ConvertTo-Json -Compress";
  try{const {stdout}=await executeFile(path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:10000,maxBuffer:32768,encoding:'utf8'});const value=JSON.parse(stdout.replace(/^\uFEFF/,''));return {valid:value.valid===true,publisher:typeof value.publisher==='string'?value.publisher:null,thumbprint:typeof value.thumbprint==='string'?value.thumbprint:null};}catch{return {valid:false,publisher:null};}
}
function normalizeManifest(value){
  if(!value||Object.keys(value).some(k=>!['sha256','bytes','version','sourceUrl','artifactSha256','member'].includes(k))||!/^([a-f0-9]{64})$/.test(value.sha256)||!Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>1024*1024*1024||typeof value.version!=='string'||value.version.length>80||!officialSource(value.sourceUrl)||value.member!=='ollama.exe'||!/^([a-f0-9]{64})$/.test(value.artifactSha256))throw new Error('Invalid reviewed executable manifest.');
  const manifest={sha256:value.sha256,bytes:value.bytes,version:value.version,sourceUrl:value.sourceUrl,artifactSha256:value.artifactSha256,member:value.member};
  return {...manifest,id:createHash('sha256').update(JSON.stringify(manifest)).digest('hex')};
}
export function createNativeOllamaHost({dialog,getWindow=()=>null,openExternal,credentials,dataDirectory,reviewedManifests=[],publisherPolicies=[],signatureInspector=inspectAuthenticode,filesystem=fs,executeProfile,spawnRuntime}={}){
  if(!path.isAbsolute(dataDirectory||''))throw new Error('An absolute application data directory is required.');
  const ownedRoot=path.join(dataDirectory,'local-models','profiles');
  const manifests=reviewedManifests.map(normalizeManifest);
  for(const policy of publisherPolicies)if(!policy||typeof policy.publisher!=='string'||!policy.publisher||policy.publisher.length>512||!officialSource(policy.sourceUrl)||Object.keys(policy).some(k=>!['publisher','sourceUrl','thumbprint'].includes(k))||(policy.thumbprint!==undefined&&!/^[A-Fa-f0-9]{40,64}$/.test(policy.thumbprint)))throw new Error('Invalid established publisher policy.');
  const policies=publisherPolicies.map(policy=>({...policy}));
  async function canonical(location,{file=false}={}){
    if(typeof location!=='string'||location.length>2048||!path.isAbsolute(location)||/[\x00-\x1f]/.test(location))throw new Error('Invalid native selection.');
    const resolved=await filesystem.realpath(location),stat=await filesystem.lstat(location);
    if(stat.isSymbolicLink()||!samePath(path.resolve(location),resolved)||(file?!stat.isFile():!stat.isDirectory()))throw new Error('Selection must be a real regular file or directory without redirection.');
    return {resolved,stat};
  }
  async function executableIdentity(location){
    const first=await canonical(location,{file:true});if(path.basename(first.resolved).toLowerCase()!=='ollama.exe'||first.stat.size<1||first.stat.size>1024*1024*1024)throw new Error('Select a bounded regular ollama.exe file.');
    const handle=await filesystem.open(first.resolved,'r');const hash=createHash('sha256');let bytes=0;
    try{for await(const chunk of handle.createReadStream({autoClose:false})){bytes+=chunk.length;if(bytes>1024*1024*1024)throw new Error('Executable exceeds its verification limit.');hash.update(chunk);}}finally{await handle.close();}
    const after=await canonical(first.resolved,{file:true});if(bytes!==first.stat.size||after.stat.size!==first.stat.size||after.stat.mtimeMs!==first.stat.mtimeMs||after.stat.ino!==first.stat.ino)throw new Error('Executable changed during verification.');
    return {path:first.resolved,sha256:hash.digest('hex'),bytes};
  }
  async function initialize(){const data=await canonical(dataDirectory);let parent=data.resolved;for(const segment of ['local-models','profiles']){const child=path.join(parent,segment);try{await filesystem.mkdir(child,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}const checked=await canonical(child);if(!inside(data.resolved,checked.resolved))throw new Error('Profile root escaped application data.');parent=checked.resolved;}return parent;}
  const message=async options=>{if(!dialog?.showMessageBox)throw new Error('Native confirmation is unavailable.');const window=getWindow();return window?dialog.showMessageBox(window,options):dialog.showMessageBox(options);};
  async function approval(identity){
    const signature=await signatureInspector(identity.path);
    if(signature.valid&&policies.some(p=>p.publisher===signature.publisher&&(!p.thumbprint||p.thumbprint.toLowerCase()===signature.thumbprint?.toLowerCase())))return {kind:'authenticode'};
    const manifest=manifests.find(m=>m.sha256===identity.sha256&&m.bytes===identity.bytes);if(!manifest)return null;
    const saved=await credentials?.get('profile:ollama-trust:'+manifest.id);
    if(saved?.sha256===identity.sha256&&saved?.manifestId===manifest.id&&samePath(saved?.path||'',identity.path))return {kind:'reviewed-pinned-manifest',manifest};
    return null;
  }
  async function verifyExecutable(location){try{const before=await executableIdentity(location);if(!await approval(before))return false;const after=await executableIdentity(location);return before.sha256===after.sha256&&samePath(before.path,after.path);}catch{return false;}}
  async function pickExecutable(){
    if(!dialog?.showOpenDialog)throw new Error('Native executable picker is unavailable.');
    const options={title:'Select a trusted Ollama executable',properties:['openFile'],filters:[{name:'Ollama executable',extensions:['exe']}]};const window=getWindow();const selected=window?await dialog.showOpenDialog(window,options):await dialog.showOpenDialog(options);
    if(selected.canceled||selected.filePaths?.length!==1)return null;const before=await executableIdentity(selected.filePaths[0]);
    if(await approval(before))return before.path;
    const manifest=manifests.find(m=>m.sha256===before.sha256&&m.bytes===before.bytes);
    if(!manifest){await message({type:'warning',title:'Executable remains untrusted',message:'No established publisher or reviewed executable hash matches this file.',detail:'Selecting a file does not establish trust. Obtain a reviewed executable manifest from the official release provenance before retrying.',buttons:['Close'],defaultId:0,cancelId:0});return null;}
    if(!credentials?.set)throw new Error('Protected trust storage is unavailable.');
    const answer=await message({type:'warning',title:'Review pinned executable trust',message:'Trust only these exact reviewed executable bytes?',detail:`File: ${before.path}\nVersion: ${manifest.version}\nSHA-256: ${before.sha256}\nSource: ${manifest.sourceUrl}\nSource artifact SHA-256: ${manifest.artifactSha256}\nMember: ${manifest.member}\nThis is explicit pinned-file trust, not a claim that an unverified publisher signature is valid.`,buttons:['Trust exact bytes','Cancel'],defaultId:1,cancelId:1,noLink:true});
    if(answer.response!==0)return null;const after=await executableIdentity(before.path);if(before.sha256!==after.sha256)throw new Error('Executable changed during trust review.');
    await credentials.set('profile:ollama-trust:'+manifest.id,{path:after.path,sha256:after.sha256,manifestId:manifest.id});return after.path;
  }
  async function pickOwnedDirectory(){const root=await initialize();if(!dialog?.showOpenDialog)throw new Error('Native directory picker is unavailable.');const options={title:'Select a working folder within the owned profile directory',defaultPath:root,properties:['openDirectory']};const window=getWindow();const selected=window?await dialog.showOpenDialog(window,options):await dialog.showOpenDialog(options);if(selected.canceled||selected.filePaths?.length!==1)return null;const directory=await canonical(selected.filePaths[0]);if(!inside(root,directory.resolved))throw new Error('Choose a folder within the application-owned profile directory.');return directory.resolved;}
  async function openOfficialPage(url){if(url!==OFFICIAL_INSTALL_PAGE)throw new Error('Only the fixed official installation page is permitted.');if(!openExternal)throw new Error('External navigation is unavailable.');const answer=await message({type:'question',title:'Open official Ollama installation page?',message:'Open the official Windows download page in your browser?',detail:'This application will not download or execute an installer.',buttons:['Open official page','Cancel'],defaultId:1,cancelId:1,noLink:true});if(answer.response===0)await openExternal(OFFICIAL_INSTALL_PAGE);return {opened:answer.response===0};}
  const profiles=createNativeProfileAdapter({pickExecutable,pickOwnedDirectory,verifyExecutable,...(executeProfile?{executeFile:executeProfile}:{})});
  const runtimeOptions={pickExecutable,verifyExecutable,openOfficialPage,launchVerified:createVerifiedRuntimeLauncher({verifyExecutable,...(spawnRuntime?{spawnImpl:spawnRuntime}:{})})};
  return {initialize,ownedRoot,verifyExecutable,pickExecutable,pickOwnedDirectory,openOfficialPage,runtimeOptions,profileOptions:profiles,serviceOptions:{profileOwnedRoots:[ownedRoot],profilePicker:profiles.pickProfile,profileLauncher:profiles.launcher,profileHealthCheck:profiles.healthCheck,verifyExecutable,validateProfile:profiles.validateProfile},trustStatus(){return {establishedPublisherPolicies:policies.length,reviewedManifests:manifests.length,automaticTrust:policies.length>0,limitation:policies.length||manifests.length?null:'No official publisher identity or reviewed executable manifest is configured. Execution remains disabled.'};}};
}
