import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createForgeToolResolver} from './forge-transport.js';
import {accessGitEnvironment} from './access-git-environment.js';

const executeFile=promisify(execFile),actions=new Set(['access-credential-created','access-credential-removed','access-credential-rolled-back']);
const filenamePattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[a-f0-9]{64}\.json$/;

export function validateAccessMutationEvent(value){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==4||!['version','action','target','at'].every(key=>Object.hasOwn(value,key))||value.version!==1||!actions.has(value.action)||typeof value.target!=='string'||!(value.target==='profile'||/^element:[^\x00-\x1f\x7f]{1,256}$/.test(value.target))||typeof value.at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.at)||!Number.isFinite(Date.parse(value.at))||new Date(value.at).toISOString()!==value.at)throw Error('Invalid redacted access mutation event.');
 return {version:1,action:value.action,target:value.target,at:value.at};
}
/** Host-only, local application-data journal. It needs no profile/history grant
 * because it contains only fixed redacted lifecycle metadata. A later manager
 * discovers these records through list() after its own host authorization, not
 * by exposing arbitrary files or adding a renderer credential-key exception.
 * This journal never supplies authentication or replaces encrypted snapshots. */
export function createAccessMutationHistory({dataDirectory,toolsDirectory,execute=executeFile}={}){
 if(typeof dataDirectory!=='string'||!path.isAbsolute(dataDirectory))throw Error('Local mutation history is unavailable.');
 const directory=path.join(dataDirectory,'access-mutations'),records=path.join(directory,'records'),pending=path.join(directory,'pending'),resolveTool=createForgeToolResolver(toolsDirectory),lifetime=new AbortController();let closed=false,initialized=false,chain=Promise.resolve();
 const open=()=>{if(closed)throw Error('Local mutation history is closed.');};
 const serial=operation=>{const result=chain.catch(()=>{}).then(async()=>{open();return operation();});chain=result;return result;};
 const git=async args=>{open();const executable=await resolveTool('git');open();const options={cwd:directory,env:accessGitEnvironment(),windowsHide:true,shell:false,signal:lifetime.signal,timeout:15000,maxBuffer:1024*1024};const version=await execute(executable,['--version'],options);open();if(version.stdout.trim()!=='git version 2.56.0.windows.2')throw Error('Verified bundled Git version is unavailable.');const result=await execute(executable,['-c','core.fsmonitor=false','-c','core.attributesFile=/dev/null','-c','core.hooksPath='+(process.platform==='win32'?'NUL':'/dev/null'),'-c','commit.gpgsign=false','-c','user.name=Material File Encryptor','-c','user.email=local@material-file-encryptor.invalid',...args],options);open();return result;};
 async function ensureDirectory(folder){await fs.mkdir(folder,{recursive:true,mode:0o700});const info=await fs.lstat(folder);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Local mutation history storage is invalid.');}
 async function readEvent(file){const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>16384)throw Error('Local mutation history record is invalid.');const bytes=await fs.readFile(file,'utf8');if(!filenamePattern.test(path.basename(file))||createHash('sha256').update(bytes).digest('hex')!==path.basename(file).slice(37,101))throw Error('Local mutation history record integrity check failed.');let event;try{event=validateAccessMutationEvent(JSON.parse(bytes));}catch{throw Error('Local mutation history record is invalid.');}return {bytes,event};}
 async function commitPending(name){
  open();if(!filenamePattern.test(name))throw Error('Local mutation history pending record is invalid.');
  const stage=path.join(pending,name),final=path.join(records,name),owned=await readEvent(stage);open();
  try{await fs.link(stage,final);}catch(error){if(error.code!=='EEXIST')throw Error('Local mutation history could not retain its record.');const existing=await readEvent(final);if(existing.bytes!==owned.bytes)throw Error('Local mutation history record changed. Recovery is required.');}
  open();const relative='records/'+name;let revision=(await git(['log','-1','--format=%H','--all','--',relative])).stdout.trim();
  if(!revision){await git(['add','--',relative]);await git(['commit','--quiet','-m','Record local access credential lifecycle','--',relative]);revision=(await git(['log','-1','--format=%H','--all','--',relative])).stdout.trim();}
  if(!/^[a-f0-9]{40,64}$/.test(revision))throw Error('Local mutation history commit is unavailable.');
  const committed=(await git(['show',revision+':'+relative])).stdout;if(committed!==owned.bytes)throw Error('Local mutation history committed record changed. Recovery is required.');
  const current=await readEvent(stage),currentFinal=await readEvent(final);open();if(current.bytes!==owned.bytes||currentFinal.bytes!==owned.bytes)throw Error('Local mutation history record changed. Recovery is required.');
  await fs.unlink(stage);open();return {recorded:true,id:name.slice(0,36),commit:revision};
 }
 async function initialize(){
  if(!initialized){await ensureDirectory(directory);await ensureDirectory(records);await ensureDirectory(pending);open();await git(['init','--quiet']);initialized=true;}
  const names=await fs.readdir(pending);if(names.length>1000)throw Error('Local mutation history pending limit reached.');
  for(const name of names){if(!filenamePattern.test(name))throw Error('Local mutation history has an unknown pending file.');await commitPending(name);}
 }
 async function recordInventory(){const names=await fs.readdir(records);if(names.length>10000||names.some(name=>!filenamePattern.test(name)))throw Error('Local mutation history record limit or format is invalid.');return names;}
 return {
  record(value){const event=validateAccessMutationEvent(value),bytes=JSON.stringify(event);return serial(async()=>{await initialize();const names=await recordInventory();if(names.length>=10000)throw Error('Local mutation history record limit reached.');open();const name=randomUUID()+'-'+createHash('sha256').update(bytes).digest('hex')+'.json',file=await fs.open(path.join(pending,name),'wx',0o600);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}open();return commitPending(name);});},
  list({limit=1000}={}){if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Local mutation history list limit is invalid.');return serial(async()=>{await initialize();const names=await recordInventory(),rows=[];for(const name of names){const {event}=await readEvent(path.join(records,name));rows.push({id:name.slice(0,-5),...event});}open();return rows.sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id)).slice(0,limit);});},
  close(){closed=true;lifetime.abort();},
 };
}
