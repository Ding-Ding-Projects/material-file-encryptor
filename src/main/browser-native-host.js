import {spawn} from 'node:child_process';
import path from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {createBrowserDownloadReceiver,createNativeMessageDecoder} from './browser-download-receiver.js';

const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const same=(left,right)=>typeof left==='string'&&typeof right==='string'&&/^[A-Za-z0-9_-]{43}$/.test(left)&&left.length===right.length&&timingSafeEqual(Buffer.from(left),Buffer.from(right));
export function validateBrowserHostConfig(config){
 if(!exact(config,['schemaVersion','host','allowedOrigins','identity'])||config.schemaVersion!==1||config.host!=='org.dingding.material_file_encryptor.downloads'||!exact(config.identity,['extensionId','packageSha256','publicKeySha256'])||!/^[a-p]{32}$/.test(config.identity.extensionId)||!['packageSha256','publicKeySha256'].every(key=>/^[a-f0-9]{64}$/.test(config.identity[key]))||!Array.isArray(config.allowedOrigins)||config.allowedOrigins.length!==1||config.allowedOrigins[0]!==`chrome-extension://${config.identity.extensionId}/`)throw Error('Reviewed browser host configuration is unavailable.');
 return config.allowedOrigins.slice();
}
export function nativeFrame(value){const body=Buffer.from(JSON.stringify(value));if(!body.length||body.length>65536)throw Error('Native message exceeds 64 KiB.');const length=Buffer.alloc(4);length.writeUInt32LE(body.length);return Buffer.concat([length,body]);}

/** Host-only transport. Its caller origin is an allowlist input, never proof of
 * browser provenance. Every pair still requires approval in the unlocked app. */
export function createBrowserNativeBroker({config,hostPath,authorizePair,isUnlocked,onProposal,spawnHost=spawn,now=Date.now}={}){
 if(typeof authorizePair!=='function'||typeof isUnlocked!=='function'||typeof onProposal!=='function')throw Error('Native approval, unlocked admission and host proposal delivery are required.');
 const allowedOrigins=validateBrowserHostConfig(config),sessions=new Map(),proposals=new Map();let child=null,closed=false,ready=false,active=0,starting=null,readyResolve,readyReject;
 const receiver=createBrowserDownloadReceiver({allowedOrigins,authorizePair,isUnlocked,now,onProposal:async item=>{await onProposal(item);proposals.set(item.id,{origin:item.origin,state:'awaiting-confirmation',received:0,total:null});}});
 const revoke=()=>{receiver.revoke();sessions.clear();proposals.clear();};
 const unlocked=()=>{if(closed||isUnlocked()!==true){revoke();throw Error('Unlock the desktop before receiving downloads.');}};
 async function receive(origin,message){
  if(!allowedOrigins.includes(origin)||active>=2)throw Error('Browser caller unavailable or not allowed.');unlocked();active++;
  try{
   if(exact(message,['type','session','id'])&&message.type==='status'){
    const pair=sessions.get(origin);if(!pair||pair.expires<=now()||!same(message.session,pair.session))throw Error('Pair the browser again.');if(!uuid(message.id))throw Error('Invalid browser proposal identifier.');
    const item=proposals.get(message.id);if(!item||item.origin!==origin)throw Error('Browser proposal unavailable.');return{type:'status',id:message.id,state:item.state,received:item.received,total:item.total};
   }
   try{const result=await receiver.receive(origin,message);if(result.type==='paired'){proposals.clear();sessions.set(origin,{session:result.session,expires:now()+result.expiresInSeconds*1000});}return result;}
   catch(error){if(isUnlocked()!==true)revoke();throw error;}
  }finally{active--;}
 }
 function observeDownload(event){
  if(event?.type==='browser-proposal-cancelled'){const item=proposals.get(event.id??event.item?.id);if(item)item.state='cancelled';return;}
  const row=event?.item;if(event?.type!=='download'||!uuid(row?.browserCaptureId))return;const item=proposals.get(row.browserCaptureId);if(!item)return;
  const state={ready:'awaiting-confirmation',downloading:'downloading',completed:'completed',failed:'failed',cancelled:'cancelled'}[row.state];if(!state)return;
  item.state=state;item.received=Number.isSafeInteger(row.received)&&row.received>=0?row.received:0;item.total=Number.isSafeInteger(row.total)&&row.total>=0?row.total:null;
 }
 function stop(error){ready=false;revoke();readyReject?.(error??Error('Native browser broker closed.'));if(child){child.stdin.destroy();child.kill();child=null;}}
 async function start(){
  if(closed)throw Error('Native browser broker is closed.');if(ready)return{started:true,aclVerified:true};if(starting)return starting;
  if(typeof hostPath!=='string'||!path.win32.isAbsolute(hostPath)||path.win32.basename(hostPath)!=='MaterialFileEncryptor.BrowserHost.exe')throw Error('A bundled native browser host is required.');
  starting=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const timer=setTimeout(()=>stop(Error('Native browser broker startup timed out.')),5000);timer.unref?.();
  try{
   const launched=spawnHost(hostPath,['--broker'],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});child=launched;
   const decoder=createNativeMessageDecoder(envelope=>{
    if(exact(envelope,['type','aclVerified'])&&envelope.type==='ready'&&envelope.aclVerified===true&&!ready){ready=true;readyResolve({started:true,aclVerified:true});return;}
    if(!ready||!exact(envelope,['requestId','origin','message'])||!uuid(envelope.requestId))throw Error('Invalid native broker envelope.');
    void receive(envelope.origin,envelope.message).then(response=>write(envelope.requestId,response),()=>write(envelope.requestId,{type:'error',code:'HANDOFF_NOT_ACCEPTED'})).catch(()=>stop(Error('Native broker write failed.')));
   });
   function write(requestId,response){return new Promise((resolve,reject)=>{if(child!==launched||closed)return reject(Error('Native broker closed.'));try{launched.stdin.write(nativeFrame({requestId,response}),error=>error?reject(error):resolve());}catch(error){reject(error);}});}
   launched.stdout.on('data',chunk=>{try{decoder.push(chunk);}catch{stop(Error('Invalid native broker frame.'));}});
   launched.stdout.on('end',()=>{try{decoder.end();}catch{stop(Error('Incomplete native broker frame.'));}});
   // Host diagnostic output is drained, never forwarded or retained.
   launched.stderr.resume();launched.on('error',()=>stop(Error('Native browser host could not start.')));launched.on('exit',()=>{if(child===launched)stop(Error('Native browser host exited.'));});
   return await starting;
  }catch(error){stop(error);throw error;}
  finally{clearTimeout(timer);starting=null;readyResolve=null;readyReject=null;}
 }
 return{start,receive,observeDownload,revoke,get available(){return ready&&!closed;},close(){closed=true;receiver.close();stop();}};
}
