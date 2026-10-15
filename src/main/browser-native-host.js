import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
import {createBrowserDownloadReceiver,createNativeMessageDecoder} from './browser-download-receiver.js';
import {createBrowserProtectedMediation} from './browser-protected-mediation.js';
import {createBrowserWorkflowMediation} from './browser-workflow-mediation.js';
import {createBrowserConverterMediation} from './browser-converter.js';
import {createBrowserStatusMediation} from './browser-status-mediation.js';
import {createBrowserConfirmMediation} from './browser-confirm-mediation.js';
import {createBrowserSchoolMediation} from './browser-school-mediation.js';
import {createBrowserElementLockMediation} from './browser-element-lock-mediation.js';
import {createBrowserUnlockLadderMediation} from './browser-unlock-ladder-mediation.js';

const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const same=(left,right)=>typeof left==='string'&&typeof right==='string'&&/^[A-Za-z0-9_-]{43}$/.test(left)&&left.length===right.length&&timingSafeEqual(Buffer.from(left),Buffer.from(right));
export function validateBrowserHostConfig(config){
 if(!exact(config,['schemaVersion','host','allowedOrigins','identity'])||config.schemaVersion!==1||config.host!=='org.dingding.material_file_encryptor.downloads'||!exact(config.identity,['extensionId','packageSha256','publicKeySha256'])||!/^[a-p]{32}$/.test(config.identity.extensionId)||!['packageSha256','publicKeySha256'].every(key=>/^[a-f0-9]{64}$/.test(config.identity[key]))||!Array.isArray(config.allowedOrigins)||config.allowedOrigins.length!==1||config.allowedOrigins[0]!==`chrome-extension://${config.identity.extensionId}/`)throw Error('Reviewed browser host configuration is unavailable.');
 return config.allowedOrigins.slice();
}
export function nativeFrame(value){const body=Buffer.from(JSON.stringify(value));if(!body.length||body.length>65536)throw Error('Native message exceeds 64 KiB.');const length=Buffer.alloc(4);length.writeUInt32LE(body.length);return Buffer.concat([length,body]);}

async function readHostConfiguration(filename){
 const handle=await fs.open(filename,'r');try{const info=await handle.stat();if(!info.isFile()||info.size>8192)throw Error('Browser host configuration exceeds its limit.');const bytes=Buffer.alloc(8193);let offset=0;while(offset<bytes.length){const read=await handle.read(bytes,offset,bytes.length-offset,offset);if(!read.bytesRead)break;offset+=read.bytesRead;}if(offset>8192)throw Error('Browser host configuration exceeds its limit.');const {parseStrictJson}=await import('../shared/personal-vocabulary.js');return parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,offset)));}finally{await handle.close();}
}

/** Desktop integration uses only bundled configuration, never renderer input. */
export function createBrowserHandoffLifecycle({hostDirectory,pairingCodes,platform=process.platform,verificationMode=false,readConfiguration=readHostConfiguration,createBroker=createBrowserNativeBroker,authorizePair,isUnlocked,canAdmit=()=>true,onProposal,readProtectionStatus,readUpdateState,openEditor,browserConversion,disposeBrowserConversion,authenticateProfile,validateAuthority,readProfileSummary,revokeProfileAuthority,confirmAction,focusAuthenticator,hasVisibleWindow,readSchoolMode,authenticateSchoolMode,applySchoolMode,readElementLocks,authenticateElementLock,applyElementLock,readUnlockLadder,authenticateUnlockStep}={}){
 let broker=null,closed=false,starting=null,lastReceipt=null;let state={available:false,configured:false,reason:'NOT_INITIALIZED',installation:'not-performed'};
 const admitted=()=>!closed&&canAdmit()===true&&isUnlocked()===true;
 const status=()=>({...state,available:broker?.available===true&&!closed,closeReceipt:lastReceipt});
 async function initialize(){
  if(closed)throw Error('Browser handoff lifecycle is closed.');if(starting)return starting;if(broker)return status();
  starting=(async()=>{
   if(platform!=='win32'||verificationMode){state={...state,reason:verificationMode?'VERIFICATION_MODE_NATIVE_HANDOFF_DISABLED':'WINDOWS_NATIVE_HOST_REQUIRED'};return status();}
   let config;try{config=await readConfiguration(path.join(hostDirectory,'browser-host-config.json'));validateBrowserHostConfig(config);}catch{state={...state,reason:'REVIEWED_EXTENSION_IDENTITY_UNAVAILABLE'};return status();}
   if(closed)return status();
   state={...state,configured:true,reason:'STARTING'};
   broker=createBroker({config,pairingCodes,confirmAction,focusAuthenticator,hasVisibleWindow,readSchoolMode,authenticateSchoolMode,applySchoolMode,readElementLocks,authenticateElementLock,applyElementLock,readUnlockLadder,authenticateUnlockStep,readProtectionStatus,readUpdateState,openEditor,browserConversion,disposeBrowserConversion,authenticateProfile,validateAuthority,readProfileSummary,revokeProfileAuthority,hostPath:path.join(hostDirectory,'MaterialFileEncryptor.BrowserHost.exe'),authorizePair:async context=>admitted()&&await authorizePair(context)===true&&admitted(),isUnlocked:admitted,onProposal:item=>{if(!admitted())throw Error('Unlock the desktop before receiving downloads.');return onProposal(item);}});
   try{await broker.start();state={...state,reason:null};}catch{lastReceipt=await broker.close();state={...state,reason:'NATIVE_BROKER_START_UNVERIFIED'};}
   if(closed){lastReceipt=await broker.close();state={...state,reason:'CLOSED'};}return status();
  })();try{return await starting;}finally{starting=null;}
 }
 return{initialize,status,observeDownload:event=>broker?.observeDownload(event),revoke(){pairingCodes?.clear();broker?.revoke();},get pending(){return broker?.pending||0;},async close(){closed=true;pairingCodes?.clear();broker?.revoke();if(starting)await starting;if(broker)lastReceipt=await broker.close();else lastReceipt={closed:true,processExited:true,stdioClosed:true,pendingRequests:0,pendingResponses:0,pendingDisposals:0,verified:true,deadlineMs:0};state={...state,reason:'CLOSED'};return lastReceipt;}};
}

/** Host-only transport. Its caller origin is an allowlist input, never proof of
 * browser provenance. Every pair still requires approval in the unlocked app. */
export function createBrowserNativeBroker({config,hostPath,pairingCodes,authorizePair,isUnlocked,onProposal,readProtectionStatus,readUpdateState,authenticateProfile,validateAuthority,readProfileSummary,openEditor,browserConversion,disposeBrowserConversion,revokeProfileAuthority,confirmAction,focusAuthenticator,hasVisibleWindow,readSchoolMode,authenticateSchoolMode,applySchoolMode,readElementLocks,authenticateElementLock,applyElementLock,readUnlockLadder,authenticateUnlockStep,spawnHost=spawn,now=Date.now,closeTimeoutMs=3000}={}){
 if(typeof authorizePair!=='function'||typeof isUnlocked!=='function'||typeof onProposal!=='function')throw Error('Native approval, unlocked admission and host proposal delivery are required.');
 if(!Number.isSafeInteger(closeTimeoutMs)||closeTimeoutMs<25||closeTimeoutMs>5000)throw Error('Native close timeout must be between 25 and 5000 milliseconds.');
 const allowedOrigins=validateBrowserHostConfig(config),sessions=new Map(),connections=new Map(),currentConnections=new Map(),proposals=new Map(),owners=new Set(),jobs=new Set();let child=null,closed=false,ready=false,active=0,starting=null,readyResolve,readyReject,closing=null;
 const receiver=createBrowserDownloadReceiver({allowedOrigins,authorizePair,isUnlocked,pairingCodes,now,onProposal:async item=>{if(closed)throw Error('Native browser broker is closed.');await onProposal(item);unlocked();proposals.set(item.id,{origin:item.origin,state:'awaiting-confirmation',received:0,total:null});}});
 const mediation=createBrowserProtectedMediation({allowedOrigins,getPair:origin=>sessions.get(origin),isUnlocked,authenticateProfile,validateAuthority,readProfileSummary,now});
 const workflows=createBrowserWorkflowMediation({getPair:origin=>sessions.get(origin),isUnlocked,openEditor,now});
 const conversions=createBrowserConverterMediation({getPair:origin=>sessions.get(origin),isUnlocked,adapter:browserConversion,dispose:disposeBrowserConversion,now});
 const statuses=createBrowserStatusMediation({getPair:origin=>sessions.get(origin),isUnlocked,readUpdateState,now});
 // One native prompt at a time across Confirm mode and school mode changes.
 const promptGate={held:false};
 const confirms=createBrowserConfirmMediation({getPair:origin=>sessions.get(origin),isUnlocked,canPrompt:()=>hasVisibleWindow?.()===true,confirm:confirmAction,focusAuthenticator,gate:promptGate,now});
 const schools=createBrowserSchoolMediation({getPair:origin=>sessions.get(origin),isUnlocked,canPrompt:()=>hasVisibleWindow?.()===true,readSchoolMode,authenticate:authenticateSchoolMode,applySchoolMode,gate:promptGate,now});
 const elementLocks=createBrowserElementLockMediation({getPair:origin=>sessions.get(origin),isUnlocked,canPrompt:()=>hasVisibleWindow?.()===true,readElementLocks,authenticate:authenticateElementLock,applyElementLock,gate:promptGate,now});
 const unlockLadders=createBrowserUnlockLadderMediation({getPair:origin=>sessions.get(origin),isUnlocked,canPrompt:()=>hasVisibleWindow?.()===true,readUnlockLadder,authenticate:authenticateUnlockStep,gate:promptGate,now});
 const revoke=()=>{confirms.revoke();schools.revoke();elementLocks.revoke();unlockLadders.revoke();revokeProfileAuthority?.();conversions.revoke();receiver.revoke();mediation.revoke();workflows.revoke();sessions.clear();currentConnections.clear();proposals.clear();};
 function disconnectConnection(connectionId){
  const origin=connections.get(connectionId);connections.delete(connectionId);
  if(origin&&currentConnections.get(origin)===connectionId)revoke();
 }
 const unlocked=()=>{if(closed||isUnlocked()!==true){revoke();pairingCodes?.clear();throw Error('Unlock the desktop before receiving downloads.');}};
 async function receive(origin,message,connectionId=null){
  if(!allowedOrigins.includes(origin)||active>=2)throw Error('Browser caller unavailable or not allowed.');unlocked();active++;
  try{
   if(connectionId!==null&&(!uuid(connectionId)||connections.get(connectionId)!==origin))throw Error('Native browser connection is unavailable.');
   if(connectionId!==null&&(exact(message,['type'])||exact(message,['type','code']))&&message.type==='pair'&&currentConnections.get(origin)!==connectionId){revoke();currentConnections.set(origin,connectionId);}
   const liveConnection=()=>{if(connectionId!==null&&(connections.get(connectionId)!==origin||currentConnections.get(origin)!==connectionId))throw Error('Native browser connection is unavailable.');};
   if(conversions.supports(message?.type)){
    if(connectionId===null)throw Error('Native browser connection identity is unavailable.');
    const check=()=>{unlocked();liveConnection();if(sessions.get(origin)?.connectionId!==connectionId)throw Error('Pair the browser again.');};check();return await conversions.receive(origin,message,check);
   }
   if(statuses.supports(message?.type)){
    if(connectionId===null)throw Error('Native browser connection identity is unavailable.');
    const check=()=>{unlocked();liveConnection();if(sessions.get(origin)?.connectionId!==connectionId)throw Error('Pair the browser again.');};check();return await statuses.receive(origin,message,check);
   }
   if(confirms.supports(message?.type)){
    if(connectionId===null)throw Error('Native browser connection identity is unavailable.');
    const check=()=>{unlocked();liveConnection();if(sessions.get(origin)?.connectionId!==connectionId)throw Error('Pair the browser again.');};check();return await confirms.receive(origin,message,check);
   }
   if(schools.supports(message?.type)){
    if(connectionId===null)throw Error('Native browser connection identity is unavailable.');
    const check=()=>{unlocked();liveConnection();if(sessions.get(origin)?.connectionId!==connectionId)throw Error('Pair the browser again.');};check();return await schools.receive(origin,message,check);
   }
   if(elementLocks.supports(message?.type)){
    if(connectionId===null)throw Error('Native browser connection identity is unavailable.');
    const check=()=>{unlocked();liveConnection();if(sessions.get(origin)?.connectionId!==connectionId)throw Error('Pair the browser again.');};check();return await elementLocks.receive(origin,message,check);
   }
   if(unlockLadders.supports(message?.type)){
    if(connectionId===null)throw Error('Native browser connection identity is unavailable.');
    const check=()=>{unlocked();liveConnection();if(sessions.get(origin)?.connectionId!==connectionId)throw Error('Pair the browser again.');};check();return await unlockLadders.receive(origin,message,check);
   }
   if(workflows.supports(message?.type)){
    if(connectionId===null)throw Error('Native browser connection identity is unavailable.');
    const check=()=>{unlocked();liveConnection();if(sessions.get(origin)?.connectionId!==connectionId)throw Error('Pair the browser again.');};check();return await workflows.receive(origin,message,check);
   }
   if(mediation.supports(message?.type)){
    if(connectionId===null){if(exact(message,['type','session'])&&message.type==='protected-discover'){const pair=sessions.get(origin);if(!pair||pair.expires<=now()||!same(message.session,pair.session))throw Error('Pair the browser again.');return{type:'protected-capabilities',schemaVersion:1,authentication:'unavailable',operations:[]};}throw Error('Protected browser connection identity is unavailable.');}
    liveConnection();if(sessions.get(origin)?.connectionId!==connectionId)throw Error('Pair the browser again.');const response=await mediation.receive(origin,message);if(response.type==='protected-revoked')revokeProfileAuthority?.();return response;
   }
   if(message?.type!=='pair')liveConnection();
   if(exact(message,['type','session'])&&message.type==='protection-status'){
    const pair=sessions.get(origin);if(!pair||pair.expires<=now()||!same(message.session,pair.session))throw Error('Pair the browser again.');
    if(typeof readProtectionStatus!=='function')throw Error('Protection observations are unavailable.');
    const value=await readProtectionStatus();unlocked();
    if(sessions.get(origin)!==pair||pair.expires<=now())throw Error('Pair the browser again.');
    if(!exact(value,['schemaVersion','profile','sharedMode','browserPermission'])||value.schemaVersion!==1||!['authenticated','locked','expired','unknown'].includes(value.profile)||!['active','inactive','unknown'].includes(value.sharedMode)||value.browserPermission!=='unavailable')throw Error('Protection observation is invalid.');
    return {type:'protection-status',schemaVersion:1,profile:value.profile,sharedMode:value.sharedMode,browserPermission:'unavailable'};
   }
   if(exact(message,['type','session','id'])&&message.type==='status'){
    const pair=sessions.get(origin);if(!pair||pair.expires<=now()||!same(message.session,pair.session))throw Error('Pair the browser again.');if(!uuid(message.id))throw Error('Invalid browser proposal identifier.');
    const item=proposals.get(message.id);if(!item||item.origin!==origin)throw Error('Browser proposal unavailable.');return{type:'status',id:message.id,state:item.state,received:item.received,total:item.total};
   }
   try{const result=await receiver.receive(origin,message);liveConnection();if(result.type==='paired'){revokeProfileAuthority?.();mediation.revoke();workflows.revoke();conversions.revoke();proposals.clear();sessions.set(origin,{session:result.session,expires:now()+result.expiresInSeconds*1000,connectionId});}return result;}
   catch(error){if(isUnlocked()!==true)revoke();throw error;}
  }finally{active--;}
 }
 function observeDownload(event){
  if(event?.type==='browser-proposal-cancelled'){const item=proposals.get(event.id??event.item?.id);if(item)item.state='cancelled';return;}
  const row=event?.item;if(event?.type!=='download'||!uuid(row?.browserCaptureId))return;const item=proposals.get(row.browserCaptureId);if(!item)return;
  const state={ready:'awaiting-confirmation',downloading:'downloading',completed:'completed',failed:'failed',cancelled:'cancelled'}[row.state];if(!state)return;
  item.state=state;item.received=Number.isSafeInteger(row.received)&&row.received>=0?row.received:0;item.total=Number.isSafeInteger(row.total)&&row.total>=0?row.total:null;
 }
 function stop(error){ready=false;revoke();connections.clear();readyReject?.(error??Error('Native browser broker closed.'));if(child){const owned=child;child=null;owned.stdin.destroy();if(owned.exitCode===null||owned.exitCode===undefined)owned.kill();}}
 async function start(){
  if(closed)throw Error('Native browser broker is closed.');if(ready)return{started:true,aclVerified:true};if(starting)return starting;
  if(typeof hostPath!=='string'||!path.win32.isAbsolute(hostPath)||path.win32.basename(hostPath)!=='MaterialFileEncryptor.BrowserHost.exe')throw Error('A bundled native browser host is required.');
  starting=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const timer=setTimeout(()=>stop(Error('Native browser broker startup timed out.')),5000);timer.unref?.();
  try{
   const launched=spawnHost(hostPath,['--broker'],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});child=launched;
   let terminate;const owner={processExited:false,stdioClosed:false,spawnFailed:false,promise:new Promise(resolve=>{terminate=resolve;})};owners.add(owner);
   launched.once('exit',()=>{owner.processExited=true;});
   launched.once('close',()=>{owner.stdioClosed=true;terminate();});
   const decoder=createNativeMessageDecoder(envelope=>{
    if(child!==launched||closed)return;
    if(exact(envelope,['type','aclVerified'])&&envelope.type==='ready'&&envelope.aclVerified===true&&!ready){ready=true;readyResolve({started:true,aclVerified:true});return;}
    if(ready&&exact(envelope,['type','connectionId'])&&envelope.type==='disconnected'&&uuid(envelope.connectionId)){disconnectConnection(envelope.connectionId);return;}
    const identified=exact(envelope,['requestId','connectionId','origin','message'])&&uuid(envelope.connectionId);
    if(!ready||!(identified||exact(envelope,['requestId','origin','message']))||!uuid(envelope.requestId))throw Error('Invalid native broker envelope.');
    if(identified){if(!allowedOrigins.includes(envelope.origin)||connections.has(envelope.connectionId)&&connections.get(envelope.connectionId)!==envelope.origin||!connections.has(envelope.connectionId)&&connections.size>=2)throw Error('Invalid native connection identity.');connections.set(envelope.connectionId,envelope.origin);}
    const job=receive(envelope.origin,envelope.message,identified?envelope.connectionId:null).then(response=>write(envelope.requestId,response),()=>write(envelope.requestId,{type:'error',code:'HANDOFF_NOT_ACCEPTED'})).catch(()=>stop(Error('Native broker write failed.')));jobs.add(job);job.finally(()=>jobs.delete(job));
   });
   function write(requestId,response){return new Promise((resolve,reject)=>{if(child!==launched||closed)return reject(Error('Native broker closed.'));try{launched.stdin.write(nativeFrame({requestId,response}),error=>error?reject(error):resolve());}catch(error){reject(error);}});}
   launched.stdout.on('data',chunk=>{if(child!==launched||closed)return;try{decoder.push(chunk);}catch{stop(Error('Invalid native broker frame.'));}});
   launched.stdout.on('end',()=>{try{decoder.end();}catch{stop(Error('Incomplete native broker frame.'));}});
   // Host diagnostic output is drained, never forwarded or retained.
   launched.stdin.on('error',()=>{if(child===launched)stop(Error('Native broker input closed.'));});
   launched.stderr.resume();launched.on('error',()=>{owner.spawnFailed=typeof launched.pid!=='number';if(child===launched)stop(Error('Native browser host could not start.'));});launched.on('exit',()=>{if(child===launched)stop(Error('Native browser host exited.'));});
   return await starting;
  }catch(error){stop(error);throw error;}
  finally{clearTimeout(timer);starting=null;readyResolve=null;readyReject=null;}
 }
 function close(){
  if(closing)return closing;closed=true;receiver.close();mediation.close();workflows.close();statuses.close();confirms.close();schools.close();elementLocks.close();unlockLadders.close();conversions.close();stop();
  closing=(async()=>{
   let timer;try{await Promise.race([Promise.all([...owners].map(owner=>owner.promise).concat([...jobs],conversions.disposePending())),new Promise(resolve=>{timer=setTimeout(resolve,closeTimeoutMs);})]);}finally{clearTimeout(timer);}
   // A process 'close' event observes exit plus closure of all inherited stdio.
   // Drain completed response jobs without waiting indefinitely on native consent.
   await Promise.resolve();
   const processExited=[...owners].every(owner=>owner.processExited||owner.spawnFailed),stdioClosed=[...owners].every(owner=>owner.stdioClosed),pendingRequests=active,pendingResponses=jobs.size,pendingDisposals=conversions.pendingDisposals;
   return{closed:true,processExited,stdioClosed,pendingRequests,pendingResponses,pendingDisposals,verified:processExited&&stdioClosed&&pendingRequests===0&&pendingResponses===0&&pendingDisposals===0,deadlineMs:closeTimeoutMs};
  })();const current=closing;current.then(receipt=>{if(!receipt.verified&&closing===current)closing=null;},()=>{if(closing===current)closing=null;});return current;
 }
 return{start,receive,observeDownload,revoke,get available(){return ready&&!closed;},get pending(){return active;},close};
}
