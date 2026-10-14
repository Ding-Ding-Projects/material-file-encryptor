import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createBrowserNativeBroker,nativeFrame} from '../src/main/browser-native-host.js';
const origin='chrome-extension://'+'a'.repeat(32)+'/',connectionId='11111111-1111-1111-1111-111111111111';
const config={schemaVersion:1,host:'org.dingding.material_file_encryptor.downloads',allowedOrigins:[origin],identity:{extensionId:'a'.repeat(32),packageSha256:'0'.repeat(64),publicKeySha256:'1'.repeat(64)}};
test('native framed editor operation requires the live paired connection and returns no paths',async()=>{
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>queueMicrotask(()=>{child.emit('exit',0);child.emit('close',0);});
 let launches=0;const broker=createBrowserNativeBroker({config,hostPath:'C:\\Fixture\\MaterialFileEncryptor.BrowserHost.exe',authorizePair:async()=>true,isUnlocked:()=>true,onProposal(){},openEditor:async({check})=>{check();launches++;return {outcome:'opened'};},spawnHost:()=>child});
 const start=broker.start();child.stdout.write(nativeFrame({type:'ready',aclVerified:true}));await start;
 const send=message=>new Promise(resolve=>{child.stdin.once('data',bytes=>resolve(JSON.parse(bytes.subarray(4)).response));child.stdout.write(nativeFrame({requestId:'22222222-2222-2222-2222-222222222222',connectionId,origin,message}));});
 try{const pair=await send({type:'pair'});assert.equal((await send({type:'workflow-discover',session:pair.session})).externalEditor,true);assert.deepEqual(await send({type:'workflow-editor-open',session:pair.session}),{type:'workflow-editor-result',schemaVersion:1,outcome:'opened'});assert.equal(launches,1);assert.equal((await send({type:'workflow-editor-open',session:pair.session,path:'C:\\wrong'})).type,'error');await assert.rejects(broker.receive(origin,{type:'workflow-editor-open',session:pair.session}),/connection identity/);}finally{await broker.close();}
});
test('extension workflow transport validates both message shape and native response',async()=>{
 let listener,nativeResponse,receive;const sent=[];const chrome={runtime:{id:'fixture',getURL:p=>'chrome-extension://fixture/'+p,onInstalled:{addListener(){}},onMessage:{addListener(fn){listener=fn;}},connectNative:()=>({onDisconnect:{addListener(){}},onMessage:{addListener(fn){receive=fn;}},disconnect(){},postMessage(message){sent.push(message);queueMicrotask(()=>receive(message.type==='pair'?{type:'paired',session:'s'.repeat(43)}:nativeResponse));}})},contextMenus:{onClicked:{addListener(){}}}};
 const context=vm.createContext({chrome,URL,setTimeout,clearTimeout,queueMicrotask});vm.runInContext(await fs.readFile(new URL('../browser-extension/background.js',import.meta.url),'utf8'),context);
 context.deliver=message=>new Promise(resolve=>listener(message,{id:'fixture',url:chrome.runtime.getURL('options.html'),frameId:0},resolve));
 const send=message=>vm.runInContext('deliver('+JSON.stringify(message)+')',context);
 await send({type:'pair'});nativeResponse={type:'workflow-capabilities',schemaVersion:1,externalEditor:true};assert.equal((await send({type:'workflow-discover'})).externalEditor,true);
 nativeResponse={type:'workflow-editor-result',schemaVersion:1,outcome:'opened',path:'private'};assert.ok((await send({type:'workflow-editor-open'})).error);
 const count=sent.length;assert.ok((await send({type:'workflow-editor-open',path:'arbitrary'})).error);assert.equal(sent.length,count);
 nativeResponse={type:'workflow-editor-result',schemaVersion:1,outcome:'cancelled'};assert.equal((await send({type:'workflow-editor-open'})).outcome,'cancelled');
});
