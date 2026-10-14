import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createBrowserStatusMediation} from '../src/main/browser-status-mediation.js';
import {createBrowserNativeBroker,nativeFrame} from '../src/main/browser-native-host.js';

const origin='chrome-extension://'+'a'.repeat(32)+'/',session='s'.repeat(43),connectionId='11111111-1111-1111-1111-111111111111';
const config={schemaVersion:1,host:'org.dingding.material_file_encryptor.downloads',allowedOrigins:[origin],identity:{extensionId:'a'.repeat(32),packageSha256:'0'.repeat(64),publicKeySha256:'1'.repeat(64)}};
const sources={
 current:{desktopVersion:'0.2.0',status:{state:'current',currentVersion:'0.2.0',update:null,reason:null}},
 downloading:{desktopVersion:'0.2.0',status:{state:'downloading',update:{version:'0.3.0',tag:'v0.3.0',releaseUrl:'https://example.invalid/release',bytes:5},reason:null}},
 ready:{desktopVersion:'0.2.0',status:{state:'ready',update:{version:'0.3.0',tag:'v0.3.0',sourceCommit:'a'.repeat(40)},stagedHashVerified:true}},
};
function fixture(options={}){
 let time=1000,unlocked=true,pair={session,expires:901000},checks=0,source=sources.current;
 const service=createBrowserStatusMediation({getPair:()=>pair,isUnlocked:()=>unlocked,readUpdateState:async()=>source,now:()=>time,...options});
 const check=()=>{checks++;};
 return {service,lockState:()=>service.receive(origin,{type:'read-lock-state',session},check),updateState:()=>service.receive(origin,{type:'read-update-state',session},check),setSource:value=>{source=value;},lock:()=>{unlocked=false;},disconnect:()=>{pair=null;},setTime:value=>{time=value;},get checks(){return checks;}};
}

test('lock state is returned for a paired caller with an exact fixed shape',async()=>{
 const f=fixture();assert.deepEqual(await f.lockState(),{type:'lock-state',schemaVersion:1,state:'unlocked'});assert.ok(f.checks>0);
 f.lock();assert.deepEqual(await f.lockState(),{type:'lock-state',schemaVersion:1,state:'locked'});
 const broken=fixture({isUnlocked:()=>{throw Error('C:\\private\\path');}});assert.deepEqual(await broken.lockState(),{type:'lock-state',schemaVersion:1,state:'unavailable'});
});
test('update state is derived from the service state without urls, tags, commits or paths',async()=>{
 const f=fixture();
 assert.deepEqual(await f.updateState(),{type:'update-state',schemaVersion:1,desktopVersion:'0.2.0',availableVersion:null,phase:'idle',progress:null});
 f.setSource(sources.downloading);assert.deepEqual(await f.updateState(),{type:'update-state',schemaVersion:1,desktopVersion:'0.2.0',availableVersion:'0.3.0',phase:'downloading',progress:null});
 f.setSource(sources.ready);const ready=await f.updateState();assert.deepEqual(ready,{type:'update-state',schemaVersion:1,desktopVersion:'0.2.0',availableVersion:'0.3.0',phase:'ready',progress:1});
 const text=JSON.stringify(ready);for(const forbidden of ['http','v0.3.0','aaaa','\\\\','/'])assert.ok(!text.includes(forbidden),forbidden);
 f.setSource({desktopVersion:'0.2.0',status:{state:'failed',reason:'C:\\secret\\feed'}});const failed=await f.updateState();assert.equal(failed.phase,'unavailable');assert.equal(failed.availableVersion,null);assert.ok(!JSON.stringify(failed).includes('secret'));
 f.setSource({desktopVersion:'not a version',status:{state:'current'}});assert.deepEqual(await f.updateState(),{type:'update-state',schemaVersion:1,desktopVersion:'unknown',availableVersion:null,phase:'unavailable',progress:null});
 f.setSource({desktopVersion:'0.2.0',status:{state:'available',update:{version:'../../etc'}}});assert.equal((await f.updateState()).availableVersion,null);
 const throwing=fixture({readUpdateState:async()=>{throw Error('C:\\private');}});assert.equal((await throwing.updateState()).phase,'unavailable');
});
test('unpaired, expired, mismatched or unknown-field requests are refused before any state is read',async()=>{
 let reads=0;const f=fixture({readUpdateState:async()=>{reads++;return sources.current;}});
 f.disconnect();await assert.rejects(f.lockState(),/Pair the browser again/);await assert.rejects(f.updateState(),/Pair the browser again/);
 const g=fixture({readUpdateState:async()=>{reads++;return sources.current;}});
 for(const message of [{type:'read-lock-state',session:'x'.repeat(43)},{type:'read-lock-state',session:'short'},{type:'read-update-state',session,extra:1},{type:'read-update-state'},{type:'read-update-state',session,[Symbol('x')]:1},Object.assign(Object.create({session}),{type:'read-update-state'}),{type:'read-profile-summary',session}])await assert.rejects(g.service.receive(origin,message,()=>{}));
 g.setTime(901000);await assert.rejects(g.lockState(),/Pair the browser again/);
 await assert.rejects(g.service.receive(origin,{type:'read-lock-state',session}),/Unsupported/);
 assert.equal(reads,0);
});
test('a lost connection or a replaced pairing during the read withholds the answer',async()=>{
 let pairRef={session,expires:901000},replace;const service=createBrowserStatusMediation({getPair:()=>pairRef,isUnlocked:()=>true,readUpdateState:async()=>{pairRef={session,expires:901000};return sources.current;},now:()=>1000});
 await assert.rejects(service.receive(origin,{type:'read-update-state',session},()=>{}),/Pair the browser again/);
 const closing=createBrowserStatusMediation({getPair:()=>pairRef,isUnlocked:()=>true,readUpdateState:async()=>sources.current,now:()=>1000});
 await assert.rejects(closing.receive(origin,{type:'read-lock-state',session},()=>{throw Error('connection gone');}),/connection gone/);
 closing.close();await assert.rejects(closing.receive(origin,{type:'read-lock-state',session},()=>{}),/Pair the browser again/);
 void replace;
});

test('native framed status scopes need the live paired connection and revoke with the lock',async()=>{
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>queueMicrotask(()=>{child.emit('exit',0);child.emit('close',0);});
 let unlocked=true,time=0;
 const broker=createBrowserNativeBroker({config,now:()=>time,hostPath:'C:\\Fixture\\MaterialFileEncryptor.BrowserHost.exe',authorizePair:async()=>true,isUnlocked:()=>unlocked,onProposal(){},readUpdateState:async()=>sources.ready,spawnHost:()=>child});
 const start=broker.start();child.stdout.write(nativeFrame({type:'ready',aclVerified:true}));await start;
 const send=(message,id=connectionId)=>new Promise(resolve=>{child.stdin.once('data',bytes=>resolve(JSON.parse(bytes.subarray(4)).response));child.stdout.write(nativeFrame({requestId:'22222222-2222-2222-2222-222222222222',connectionId:id,origin,message}));});
 try{
  assert.deepEqual(await send({type:'read-lock-state',session}),{type:'error',code:'HANDOFF_NOT_ACCEPTED'});
  assert.deepEqual(await send({type:'read-update-state',session}),{type:'error',code:'HANDOFF_NOT_ACCEPTED'});
  const pair=await send({type:'pair'});assert.equal(pair.type,'paired');
  assert.deepEqual(await send({type:'read-lock-state',session:pair.session}),{type:'lock-state',schemaVersion:1,state:'unlocked'});
  assert.deepEqual(await send({type:'read-update-state',session:pair.session}),{type:'update-state',schemaVersion:1,desktopVersion:'0.2.0',availableVersion:'0.3.0',phase:'ready',progress:1});
  assert.equal((await send({type:'read-lock-state',session:pair.session,extra:true})).type,'error');
  await assert.rejects(broker.receive(origin,{type:'read-lock-state',session:pair.session}),/connection identity/);
  unlocked=false;assert.equal((await send({type:'read-lock-state',session:pair.session})).type,'error');
  unlocked=true;assert.equal((await send({type:'read-lock-state',session:pair.session})).type,'error','the lock revoked the pairing, so the caller stays unpaired');
  assert.equal((await send({type:'pair'})).type,'paired');
 }finally{await broker.close();}
});

test('extension background relays both scopes, validates each answer and rejects extra fields',async()=>{
 let listener,receive,nativeResponses=[];const sent=[];
 const chrome={runtime:{id:'fixture',getURL:p=>'chrome-extension://fixture/'+p,onInstalled:{addListener(){}},onMessage:{addListener(fn){listener=fn;}},connectNative:()=>({onDisconnect:{addListener(){}},onMessage:{addListener(fn){receive=fn;}},disconnect(){},postMessage(message){sent.push(message);queueMicrotask(()=>receive(message.type==='pair'?{type:'paired',session:'s'.repeat(43)}:nativeResponses.shift()));}})},contextMenus:{onClicked:{addListener(){}}}};
 const context=vm.createContext({chrome,URL,setTimeout,clearTimeout,queueMicrotask});vm.runInContext(await fs.readFile(new URL('../browser-extension/background.js',import.meta.url),'utf8'),context);
 context.deliver=message=>new Promise(resolve=>listener(message,{id:'fixture',url:chrome.runtime.getURL('options.html'),frameId:0},resolve));
 const send=async message=>JSON.parse(JSON.stringify(await vm.runInContext('deliver('+JSON.stringify(message)+')',context)));
 assert.deepEqual(await send({type:'desktop-status'}),{paired:false});assert.equal(sent.length,0);
 await send({type:'pair'});const before=sent.length;
 const lock={type:'lock-state',schemaVersion:1,state:'unlocked'},update={type:'update-state',schemaVersion:1,desktopVersion:'0.2.0',availableVersion:'0.3.0',phase:'downloading',progress:0.5};
 nativeResponses=[lock,update];assert.deepEqual(await send({type:'desktop-status'}),{schemaVersion:1,lock:'unlocked',update:{desktopVersion:'0.2.0',availableVersion:'0.3.0',phase:'downloading',progress:0.5}});
 assert.deepEqual(sent.slice(before).map(item=>item.type),['read-lock-state','read-update-state']);
 for(const bad of [[{...lock,path:'C:\\x'},update],[{...lock,state:'maybe'},update],[lock,{...update,url:'https://example.invalid'}],[lock,{...update,progress:2}],[lock,{...update,phase:'installing'}],[lock,{...update,desktopVersion:'<b>'}]]){nativeResponses=bad;assert.ok((await send({type:'desktop-status'})).error);}
 const count=sent.length;assert.ok((await send({type:'desktop-status',session:'x'})).error);assert.equal(sent.length,count);
});

test('the status scopes add no storage, listener or secret to the desktop module',async()=>{
 const source=await fs.readFile(new URL('../src/main/browser-status-mediation.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/localStorage|writeFile|randomBytes|fetch\(|process\.env|child_process/);
});
