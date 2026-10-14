import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createBrowserNativeBroker,nativeFrame} from '../src/main/browser-native-host.js';
import {createBrowserConverterAdapter} from '../src/main/browser-converter.js';

test('native close reports pending grant disposal and verifies later without repeating release or termination',async()=>{
 const origin='chrome-extension://'+'a'.repeat(32)+'/',connectionId='11111111-1111-1111-1111-111111111111';
 const config={schemaVersion:1,host:'org.dingding.material_file_encryptor.downloads',allowedOrigins:[origin],identity:{extensionId:'a'.repeat(32),packageSha256:'0'.repeat(64),publicKeySha256:'1'.repeat(64)}};
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();let terminations=0,releases=0,finish;
 child.kill=()=>{terminations++;queueMicrotask(()=>{child.emit('exit',0);child.emit('close',0);});};
 const adapter=createBrowserConverterAdapter({getService:async()=>({catalog:()=>[],inspect:async()=>[{type:'text',bytes:2}],closeOwnedScan:async()=>{}}),pickSource:async()=> 'owned-unaccepted-source',pickDestination:async()=>null,confirm:async()=>true,releaseGrant:async id=>{assert.equal(id,'owned-unaccepted-source');releases++;await new Promise(resolve=>finish=resolve);}});
 const broker=createBrowserNativeBroker({config,hostPath:'C:\\Fixture\\MaterialFileEncryptor.BrowserHost.exe',closeTimeoutMs:25,authorizePair:async()=>true,isUnlocked:()=>true,onProposal(){},browserConversion:adapter,disposeBrowserConversion:adapter.dispose,spawnHost:()=>child});
 const starting=broker.start();child.stdout.write(nativeFrame({type:'ready',aclVerified:true}));await starting;
 const send=message=>new Promise(resolve=>{child.stdin.once('data',bytes=>resolve(JSON.parse(bytes.subarray(4)).response));child.stdout.write(nativeFrame({requestId:'22222222-2222-2222-2222-222222222222',connectionId,origin,message}));});
 const pair=await send({type:'pair'});assert.equal((await send({type:'converter-prepare',session:pair.session,language:'en'})).outcome,'selected');
 try{
  const first=await broker.close();assert.equal(first.processExited,true);assert.equal(first.stdioClosed,true);assert.equal(first.pendingDisposals,1);assert.equal(first.verified,false);assert.equal(releases,1);assert.equal(terminations,1);
  finish();const settled=await broker.close();assert.equal(settled.pendingDisposals,0);assert.equal(settled.verified,true);assert.equal(await broker.close(),settled);assert.equal(releases,1);assert.equal(terminations,1);
 }finally{finish?.();await broker.close();}
});
