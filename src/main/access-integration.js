import fs from 'node:fs/promises';
import path from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createAccessHost,ACCESS_HOST_ACTIONS,validateAccessHostRequest} from './access-host.js';
import {createForgeToolResolver} from './forge-transport.js';
import {accessGitEnvironment} from './access-git-environment.js';
import {LOCK_POLICIES} from '../renderer/features/access/locks.js';
import {validateOtp} from '../renderer/features/access/crypto.js';

const executeFile=promisify(execFile),credentialActions=new Set(['credentialGet','credentialSet','credentialDelete','credentialList']);
const keyAllowed=key=>typeof key==='string'&&(/^(?:authenticator:|history:)[a-zA-Z0-9:_.-]{1,160}$/.test(key)||key==='local-profile:v1'||/^element-lock:[^\x00-\x1f\x7f]{1,256}$/.test(key));
const object=value=>value&&Object.getPrototypeOf(value)===Object.prototype;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function bounded(value){const encoded=JSON.stringify(value);if(typeof encoded!=='string'||Buffer.byteLength(encoded)>262144)throw Error('Protected record exceeds its limit.');const visit=(v,depth)=>{if(depth>12)throw Error('Protected record exceeds its limit.');if(v&&typeof v==='object')for(const [key,item]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(key))throw Error('Invalid protected record.');visit(item,depth+1);}};visit(value,0);}
function verifier(value){return object(value)&&[1,2].includes(value.version)&&(value.version!==2||value.purpose==='password-verifier')&&Number.isInteger(value.iterations)&&value.iterations>=100000&&value.iterations<=2000000&&typeof value.salt==='string'&&/^[A-Za-z0-9+/]{22}==$/.test(value.salt)&&typeof value.hash==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(value.hash);}
function validateRecord(key,value){
 bounded(value);
 if(key==='authenticator:index:v1'){if(!Array.isArray(value)||value.length>1000||value.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_.-]{1,160}$/.test(id))||new Set(value).size!==value.length)throw Error('Invalid authenticator index.');return;}
 if(key.startsWith('authenticator:')){if(!object(value))throw Error('Invalid authenticator record.');validateOtp(value);return;}
 if(key==='local-profile:v1'){if(!verifier(value)||Object.keys(value).some(k=>!['version','purpose','iterations','salt','hash'].includes(k)))throw Error('Invalid local profile record.');return;}
 if(key.startsWith('element-lock:')){if(!object(value)||Object.keys(value).some(k=>!['version','id','policy','factors','sessionMode','duration','revision'].includes(k))||value.version!==1||value.id!==key.slice(13)||!Object.hasOwn(LOCK_POLICIES,value.policy)||!object(value.factors)||!['once','timed'].includes(value.sessionMode||'timed')||!Number.isFinite(value.duration)||value.duration<0||value.duration>1440||typeof value.revision!=='string'||value.revision.length>80)throw Error('Invalid element lock record.');const factors=LOCK_POLICIES[value.policy];if(Object.keys(value.factors).length!==factors.length||factors.some(f=>!Object.hasOwn(value.factors,f)))throw Error('Invalid element lock record.');for(const factor of factors){if(factor==='totp')validateOtp(value.factors[factor]);else if(!verifier(value.factors[factor]))throw Error('Invalid element lock record.');}}
}
function validateCredentialRequest(action,payload){
 const fields={credentialGet:['key'],credentialSet:['key','value'],credentialDelete:['key'],credentialList:['prefix']}[action];
 if(!object(payload)||Reflect.ownKeys(payload).length!==fields.length||fields.some(key=>!Object.hasOwn(payload,key)))throw Error('Unsupported protected record payload.');
 if(action==='credentialList'){if(!['element-lock:','authenticator:','history:'].includes(payload.prefix))throw Error('This protected record prefix is reserved for the native process.');}
 else if(!keyAllowed(payload.key))throw Error('This protected record is reserved for the native process.');
 if(action==='credentialSet')validateRecord(payload.key,payload.value);
}

/** Main-process adapter. senderFrame is an opaque trusted transport identity,
 * never a serialized value or a renderer-provided payload property. */
export function createAccessIntegration({dataDirectory,toolsDirectory,credentials,getMainFrame,recordMutation,execute=executeFile,now=Date.now}={}){
 if(!path.isAbsolute(dataDirectory||'')||typeof getMainFrame!=='function'||!credentials||['get','set','delete','list','readVersioned','compareAndSetVersioned'].some(name=>typeof credentials[name]!=='function'))throw Error('Protected access integration is unavailable.');
 const lifetime=new AbortController(),context=new AsyncLocalStorage(),actors=new WeakMap(),grants=new Map(),creations=new Map(),epochs=new Map(),resolveTool=createForgeToolResolver(toolsDirectory);let closed=false,queue=Promise.resolve();
 const actor=()=>{const entry=context.getStore(),frame=getMainFrame();if(closed||!entry||entry.frame!==frame||frame?.detached===true||typeof frame?.isDestroyed==='function'&&frame.isDestroyed())throw Error('Trusted access actor is unavailable.');return entry.actor;};
 const identity=(who,key)=>JSON.stringify([who,key]),targetFor=key=>key==='local-profile:v1'?'profile':key.startsWith('element-lock:')?'element:'+key.slice(13):null;
 const generation=(who,target)=>epochs.get(identity(who,target))||0;
 const current=(who,target,version)=>{if(actor()!==who||generation(who,target)!==version)throw Error('Protected access operation was cancelled.');};
 const serialize=fn=>{const work=queue.catch(()=>{}).then(fn);queue=work;return work;};
 async function readSchool(){
  const filename=path.join(dataDirectory,'shared-settings.json');let info;try{info=await fs.lstat(filename);}catch(error){if(error.code==='ENOENT')return false;throw Error('Trusted shared settings are unavailable.');}
  if(!info.isFile()||info.isSymbolicLink()||info.size>262144)throw Error('Trusted shared settings are unavailable.');
  let value;try{value=JSON.parse(await fs.readFile(filename,'utf8'));}catch{throw Error('Trusted shared settings are unavailable.');}
  if(!object(value)||typeof value.enabled!=='boolean')throw Error('Trusted shared settings are unavailable.');return value.enabled;
 }
 const host=createAccessHost({dataDirectory,credentials,now,getActor:actor,getSchoolMode:readSchool,executeGit:async(name,args,options)=>{
  actor();if(name!=='git')throw Error('Unsupported access history executable.');
  const executable=await resolveTool('git');actor();const env=accessGitEnvironment();const version=await execute(executable,['--version'],{...options,env,windowsHide:true,shell:false,timeout:15000,maxBuffer:8192,signal:lifetime.signal});
  if(version.stdout.trim()!=='git version 2.56.0.windows.2')throw Error('Verified bundled Git version is unavailable.');
  actor();return execute(executable,['-c','core.fsmonitor=false','-c','core.attributesFile=/dev/null',...args],{...options,env,windowsHide:true,shell:false,signal:lifetime.signal});
 }});
 async function profileGrant(who){const id=identity(who,'profile'),grant=grants.get(id),epoch=generation(who,'profile');const check=()=>{current(who,'profile',epoch);if(!grant||grants.get(id)!==grant||grant.expires<=now())throw Error('Unlock the local profile before accessing private history.');};check();const record=await credentials.readVersioned('local-profile:v1');check();if(record.revision!==grant.revision){grants.delete(id);throw Error('Unlock the local profile before accessing private history.');}return check;}
 async function privateHistoryMutation(who,action,key,value){const check=await profileGrant(who),before=await credentials.readVersioned(key);check();const written=await credentials.compareAndSetVersioned(key,before.revision,action==='credentialSet'?value:null);if(!written.updated)throw Error('Protected access record changed concurrently.');try{check();return true;}catch(error){const restored=await credentials.compareAndSetVersioned(key,written.revision,before.value);if(!restored.updated)throw Error('Protected access record changed concurrently. Local recovery is required.');throw error;}}
 async function mutateCredential(who,action,key,value){
  if(key.startsWith('authenticator:'))return action==='credentialSet'?host.setCredential(key,value):host.deleteCredential(key);
  if(key.startsWith('history:'))return privateHistoryMutation(who,action,key,value);
  if(typeof recordMutation!=='function')throw Error('Local mutation history is unavailable.');
  const target=targetFor(key),epoch=generation(who,target),before=await credentials.readVersioned(key);current(who,target,epoch);
  if(action==='credentialSet'&&before.value!==null)throw Error('An existing credential cannot be replaced through creation. Authenticate and use its supported removal workflow.');
  if(action==='credentialDelete'&&before.value===null)return true;
  if(action==='credentialDelete'){const verified=grants.get(identity(who,target)),created=creations.get(identity(who,key));if(!(verified&&verified.expires>now()&&verified.revision===before.revision)&&!(created&&created.expires>now()&&created.revision===before.revision))throw Error('Verify the current credential before removing it.');}
  const result=await credentials.compareAndSetVersioned(key,before.revision,action==='credentialSet'?value:null);if(!result.updated)throw Error('Protected access record changed concurrently.');
  try{current(who,target,epoch);await recordMutation({version:1,action:action==='credentialSet'?'access-credential-created':'access-credential-removed',target:target,at:new Date(now()).toISOString()});current(who,target,epoch);}
  catch(error){const restored=await credentials.compareAndSetVersioned(key,result.revision,before.value);if(!restored.updated)throw Error('Protected access record changed concurrently. Local recovery is required.');try{await recordMutation({version:1,action:'access-credential-rolled-back',target,at:new Date(now()).toISOString()});}catch{throw Error('Local mutation history is unavailable.');}throw error;}
  if(action==='credentialSet')creations.set(identity(who,key),{revision:result.revision,expires:now()+300000});else creations.delete(identity(who,key));
  grants.delete(identity(who,target));return true;
 }
 async function protectionStatus(){
  const frame=getMainFrame(),who=frame&&typeof frame==='object'?actors.get(frame):null;
  const live=()=>!closed&&frame&&typeof frame==='object'&&frame===getMainFrame()&&frame?.detached!==true&&!(typeof frame?.isDestroyed==='function'&&frame.isDestroyed());
  let profile='locked',sharedMode='unknown';
  const grant=who?grants.get(identity(who,'profile')):null,epoch=who?generation(who,'profile'):null;
  if(!live())return {schemaVersion:1,profile:'unknown',sharedMode:'unknown',browserPermission:'unavailable'};
  try{const before=await readSchool(),after=await readSchool();if(before===after)sharedMode=after?'active':'inactive';}catch{}
  if(grant){
   if(grant.expires<=now())profile='expired';
   else try{const record=await credentials.readVersioned('local-profile:v1');if(live()&&generation(who,'profile')===epoch&&grants.get(identity(who,'profile'))===grant){if(grant.expires<=now())profile='expired';else if(record.revision===grant.revision)profile='authenticated';else {grants.delete(identity(who,'profile'));profile='locked';}}else profile='unknown';}catch{profile='unknown';}
  }
  try{const after=await readSchool();if(sharedMode!==(after?'active':'inactive'))sharedMode='unknown';}catch{sharedMode='unknown';}
  if(profile==='authenticated')try{
   const record=await credentials.readVersioned('local-profile:v1');
   if(!live()||generation(who,'profile')!==epoch||grants.get(identity(who,'profile'))!==grant)profile='unknown';
   else if(grant.expires<=now())profile='expired';
   else if(record.revision!==grant.revision){grants.delete(identity(who,'profile'));profile='locked';}
  }catch{profile='unknown';}
  try{const after=await readSchool();if(sharedMode!==(after?'active':'inactive'))sharedMode='unknown';}catch{sharedMode='unknown';}
  if(profile==='authenticated'){
   if(grants.get(identity(who,'profile'))!==grant)profile='unknown';
   else if(grant.expires<=now())profile='expired';
  }
  if(!live()||who&&generation(who,'profile')!==epoch)return {schemaVersion:1,profile:'unknown',sharedMode:'unknown',browserPermission:'unavailable'};
  return {schemaVersion:1,profile,sharedMode,browserPermission:'unavailable'};
 }
 return {
  protectionStatus,
  request(senderFrame,action,payload={}){
   if(closed||!senderFrame||typeof senderFrame!=='object'||senderFrame!==getMainFrame())return Promise.reject(Error('Trusted access actor is unavailable.'));
   if(credentialActions.has(action))validateCredentialRequest(action,payload);else validateAccessHostRequest(action,payload);
   payload=structuredClone(payload);
   if(!actors.has(senderFrame))actors.set(senderFrame,randomUUID());const who=actors.get(senderFrame);
   return context.run({frame:senderFrame,actor:who},async()=>{
    const response=await (async()=>{actor();
    if(action==='waitCancel'){epochs.set(identity(who,payload.target),generation(who,payload.target)+1);grants.delete(identity(who,payload.target));return host.request(action,payload);}
    if(credentialActions.has(action))return serialize(async()=>{actor();if(action==='credentialGet'){const check=payload.key.startsWith('history:')?await profileGrant(who):()=>{};check();const value=await credentials.get(payload.key);check();return value;}if(action==='credentialList'){const check=payload.prefix==='history:'?await profileGrant(who):()=>{};check();const value=await credentials.list(payload.prefix);check();return value;}return mutateCredential(who,action,payload.key,payload.value);});
    if(action==='localVerify'){const target=payload.target,key=target==='profile'?'local-profile:v1':target.startsWith('element:')?'element-lock:'+target.slice(8):null,start=generation(who,target),before=key?await credentials.readVersioned(key):null,result=await host.request(action,payload);current(who,target,start);if(key&&result.ok){const after=await credentials.readVersioned(key);current(who,target,start);if(before.revision!==after.revision||!same(before.value,after.value))throw Error('Protected access record changed concurrently.');grants.set(identity(who,target),{revision:after.revision,expires:now()+600000});}else grants.delete(identity(who,target));return result;}
    return host.request(action,payload);
    })();actor();return response;
   });
  },
  supports(action){return credentialActions.has(action)||ACCESS_HOST_ACTIONS.includes(action);},
  close(){closed=true;lifetime.abort();host.close();grants.clear();creations.clear();epochs.clear();},
 };
}
