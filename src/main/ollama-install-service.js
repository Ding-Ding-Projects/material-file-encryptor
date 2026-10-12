import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {OLLAMA_RUNTIME_ARCHIVES} from './ollama-provenance.js';
import {canonicalInstallPath,downloadRuntimeArchive,extractRuntimeArchive,listRuntimeTree,installationError,verifyExtractionHost,runtimeArchiveAdmitted} from './ollama-install-archive.js';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reasons=Object.freeze({unavailable:'Managed Ollama installation is unavailable on this platform.',cancelled:'Installation cancelled. Existing runtimes were not changed.',failed:'Installation could not complete. Verified existing runtimes were retained.',tools:'Verified archive tools are unavailable.',trust:'The runtime publisher or complete file tree could not be verified.',space:'Insufficient storage for the verified runtime.',installed:'Managed runtime installed. Start it separately when ready.'});
export function runtimeArchitecture(machine=os.machine()){const value=machine.toLowerCase();return ['arm64','aarch64'].includes(value)?'arm64':['x86_64','amd64','x64'].includes(value)?'x64':null;}
export function createManagedOllamaInstaller({dataDirectory,toolsRoot,credentials,confirmInstall,signatureInspector,publisherPolicies=[],platform=process.platform,architecture=runtimeArchitecture(),archives=OLLAMA_RUNTIME_ARCHIVES,download=downloadRuntimeArchive,extract=extractRuntimeArchive,inspectTools=verifyExtractionHost,admitArchive=runtimeArchiveAdmitted}={}){
 if(!path.isAbsolute(dataDirectory||''))throw installationError('PATH');
 const manifest=archives[architecture],enabled=platform==='win32'&&Boolean(manifest&&admitArchive(manifest)&&path.isAbsolute(toolsRoot||'')&&credentials?.get&&credentials?.set&&confirmInstall&&signatureInspector&&publisherPolicies.length);
 const root=path.join(dataDirectory,'local-models','managed-runtime'),cache=path.join(root,'cache');
 const destination=manifest?path.join(root,manifest.version+'-'+architecture+'-'+manifest.sha256.slice(0,16)):null;
 const credentialKey=manifest?'profile:ollama-managed:'+manifest.sha256:null,listeners=new Set();let active=null,closed=false,installed=false;
 let current=Object.freeze({operationId:null,phase:'idle',receivedBytes:0,totalBytes:manifest?.bytes||0,cancellable:false,outcome:null,reason:enabled?null:reasons.unavailable,version:manifest?.version||null,architecture,installed:false});
 function publish(update){current=Object.freeze({...current,...update,installed});for(const listener of listeners)try{listener(current);}catch{}return current;}
 async function directory(filename){await canonicalInstallPath(filename,{directory:true,missing:true});await fs.mkdir(filename,{recursive:true,mode:0o700});await canonicalInstallPath(filename,{directory:true});}
 async function admittedReceipt(){
  if(!enabled)return null;await canonicalInstallPath(destination,{directory:true});const filename=path.join(destination,'managed-runtime.json'),info=await canonicalInstallPath(filename);if(info.size>2*1024**2)throw installationError('TRUST');
  const receipt=JSON.parse(await fs.readFile(filename,'utf8'));const keys=['schemaVersion','version','architecture','archiveSha256','sourceUrl','files','treeSha256'];
  if(!receipt||Object.keys(receipt).some(key=>!keys.includes(key))||receipt.schemaVersion!==1||receipt.version!==manifest.version||receipt.architecture!==architecture||receipt.archiveSha256!==manifest.sha256||receipt.sourceUrl!==manifest.sourceUrl||!Array.isArray(receipt.files)||receipt.files.length<2||receipt.files.length>4096||digest(receipt.files)!==receipt.treeSha256)throw installationError('TRUST');
  const saved=await credentials.get(credentialKey);if(saved?.treeSha256!==receipt.treeSha256||saved?.archiveSha256!==manifest.sha256||saved?.directory!==path.basename(destination))throw installationError('TRUST');
  const names=new Set();for(const row of receipt.files){if(!row||Object.keys(row).some(key=>!['path','sha256','bytes'].includes(key))||typeof row.path!=='string'||!row.path||row.path.startsWith('/')||row.path.includes('\\')||row.path.split('/').some(part=>!part||part==='.'||part==='..')||!/^([a-f0-9]{64})$/.test(row.sha256)||!Number.isSafeInteger(row.bytes)||row.bytes<0||names.has(row.path.toLowerCase()))throw installationError('TRUST');names.add(row.path.toLowerCase());}
  if(!names.has('ollama.exe')||!receipt.files.some(row=>row.path.startsWith('lib/ollama/')))throw installationError('TRUST');return receipt;
 }
 async function publisher(filename){const result=await signatureInspector(filename);return result?.valid===true&&publisherPolicies.some(policy=>policy.publisher===result.publisher&&(!policy.thumbprint||policy.thumbprint.toLowerCase()===result.thumbprint?.toLowerCase()));}
 async function getExecutable({verifyTree=false}={}){
  try{const receipt=await admittedReceipt();if(!receipt)return null;const filename=path.join(destination,'ollama.exe');await canonicalInstallPath(filename);
   if(verifyTree){const files=(await listRuntimeTree(destination)).filter(row=>row.path!=='managed-runtime.json');if(JSON.stringify(files)!==JSON.stringify(receipt.files)||!await publisher(filename))throw installationError('TRUST');}
   installed=true;current=Object.freeze({...current,installed:true});return filename;
  }catch{installed=false;current=Object.freeze({...current,installed:false});return null;}
 }
 async function work(entry){
  let stage;const signal=entry.controller.signal;const check=()=>signal.throwIfAborted();
  try{
   publish({phase:'checking',cancellable:true});await directory(root);await directory(cache);check();
   if(await getExecutable({verifyTree:true})){publish({phase:'complete',outcome:'installed-stopped',reason:reasons.installed,cancellable:false});return;}
   await inspectTools(toolsRoot);check();publish({phase:'awaiting-consent'});if(!await confirmInstall({version:manifest.version,architecture,bytes:manifest.bytes,signal}))throw installationError('CANCELLED');check();
   publish({phase:'downloading'});const archive=await download(manifest,cache,{signal,onProgress:receivedBytes=>{if(active===entry&&!signal.aborted)publish({receivedBytes});}});check();publish({phase:'verifying',receivedBytes:manifest.bytes});
   stage=path.join(root,'.staging-'+randomUUID());await canonicalInstallPath(stage,{missing:true});await fs.mkdir(stage,{mode:0o700});check();publish({phase:'extracting'});
   const files=await extract(archive,stage,toolsRoot,{signal,manifest});check();
   if(!await publisher(path.join(stage,'ollama.exe')))throw installationError('TRUST');check();const treeSha256=digest(files);
   const receipt={schemaVersion:1,version:manifest.version,architecture,archiveSha256:manifest.sha256,sourceUrl:manifest.sourceUrl,files,treeSha256};
   await fs.writeFile(path.join(stage,'managed-runtime.json'),JSON.stringify(receipt),{flag:'wx',mode:0o600});check();
   if(await canonicalInstallPath(destination,{directory:true,missing:true}))throw installationError('DESTINATION_EXISTS');check();
   // Publishing and protected trust persistence settle together without cancellation.
   publish({phase:'registering',cancellable:false});await fs.rename(stage,destination);
   await credentials.set(credentialKey,{archiveSha256:manifest.sha256,treeSha256,directory:path.basename(destination)});
   publish({phase:'checking-installation'});if(!await getExecutable({verifyTree:true}))throw installationError('TRUST');publish({phase:'complete',outcome:'installed-stopped',reason:reasons.installed});
  }catch(error){const cancelled=current.cancellable&&(signal.aborted||error.installationCode==='CANCELLED');publish({phase:'complete',outcome:cancelled?'cancelled':'failed',cancellable:false,reason:cancelled?reasons.cancelled:error.installationCode==='TOOLS'?reasons.tools:error.installationCode==='TRUST'?reasons.trust:error.installationCode==='SPACE'?reasons.space:reasons.failed});}
 }
 return Object.freeze({enabled,destination,
  status:()=>current,
  subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
  getExecutable,
  async verifyExecutable(filename,{verifyTree=true}={}){if(!destination||path.resolve(filename).toLowerCase()!==path.join(destination,'ollama.exe').toLowerCase())return null;return Boolean(await getExecutable({verifyTree}));},
  start(){if(closed)throw installationError('CLOSED');if(active)throw installationError('BUSY');if(!enabled)return publish({phase:'complete',outcome:'unavailable',reason:reasons.unavailable,cancellable:false});
   const entry={id:randomUUID(),controller:new AbortController(),done:null};active=entry;entry.done=Promise.resolve().then(()=>work(entry)).finally(()=>{if(active===entry)active=null;});publish({operationId:entry.id,phase:'checking',receivedBytes:0,cancellable:true,outcome:null,reason:null});return current;},
  async cancel(operationId){if(!active||typeof operationId!=='string'||active.id!==operationId)throw installationError('OPERATION');const entry=active;if(current.cancellable)entry.controller.abort();await entry.done;return current;},
  async cancelAll(){const entry=active;if(!entry)return current;if(current.cancellable)entry.controller.abort();await entry.done;return current;},
  get pending(){return active?1:0;},
  async close(){closed=true;const entry=active;if(entry){if(current.cancellable)entry.controller.abort();await entry.done;}listeners.clear();}
 });
}
