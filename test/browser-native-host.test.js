import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {extensionId,verifyExtensionIdentity,createRegistrationPlan} from '../scripts/browser-native-registration.mjs';
import {createBrowserNativeBroker,nativeFrame,validateBrowserHostConfig} from '../src/main/browser-native-host.js';
import {createNativeMessageDecoder} from '../src/main/browser-download-receiver.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function integer(value){const bytes=[];do{let byte=value&127;value=Math.floor(value/128);if(value)byte|=128;bytes.push(byte);}while(value);return Buffer.from(bytes);}
const field=(number,bytes)=>Buffer.concat([integer(number*8+2),integer(bytes.length),bytes]);
function signedFixture(){
 const pair=generateKeyPairSync('rsa',{modulusLength:2048}),key=pair.publicKey.export({format:'der',type:'spki'}),signed=field(1,createHash('sha256').update(key).digest().subarray(0,16));
 const payload=Buffer.from([0x50,0x4b,0x03,0x04,0,0,0,0]),length=Buffer.alloc(4);length.writeUInt32LE(signed.length);
 const signature=sign('sha256',Buffer.concat([Buffer.from('CRX3 SignedData\0'),length,signed,payload]),pair.privateKey);
 const header=Buffer.concat([field(2,Buffer.concat([field(1,key),field(2,signature)])),field(10000,signed)]),prefix=Buffer.alloc(12);prefix.write('Cr24');prefix.writeUInt32LE(3,4);prefix.writeUInt32LE(header.length,8);
 const bytes=Buffer.concat([prefix,header,payload]),receipt={schemaVersion:1,format:'CRX3',signatureVerified:true,extensionId:extensionId(key),publicKeyDerBase64:key.toString('base64'),packageSha256:hash(bytes),publicKeySha256:hash(key)};
 return{bytes,receipt};
}
const fixture=signedFixture(),plan=createRegistrationPlan({packageBytes:fixture.bytes,receipt:fixture.receipt,hostPath:'C:\\OwnedFixture\\MaterialFileEncryptor.BrowserHost.exe',manifestPath:'C:\\OwnedFixture\\downloads.json'}),origin=plan.config.allowedOrigins[0];
const proposal={url:'https://example.com/file.bin',filename:'file.bin',browserDownloadId:1};
const factory=options=>createBrowserNativeBroker({config:plan.config,authorizePair:async()=>true,isUnlocked:()=>true,onProposal:()=>{},...options});

test('signed CRX3 bytes determine identity and generate Chrome/Edge HKCU plan without mutation',()=>{
 assert.equal(verifyExtensionIdentity(fixture.bytes,fixture.receipt).origin,origin);assert.equal(plan.registration.length,2);assert.ok(plan.registration.every(row=>row.key.startsWith('HKCU\\Software\\')));assert.equal(plan.registryMutation,'not-performed');assert.equal(plan.installation,'not-performed');assert.deepEqual(validateBrowserHostConfig(plan.config),[origin]);
 const altered=Buffer.from(fixture.bytes);altered[altered.length-1]^=1;assert.throws(()=>verifyExtensionIdentity(altered,{...fixture.receipt,packageSha256:hash(altered)}),/signature/);
 for(const receipt of [{...fixture.receipt,signatureVerified:false},{...fixture.receipt,extensionId:'a'.repeat(32)},{...fixture.receipt,extra:1},{...fixture.receipt,publicKeySha256:'0'.repeat(64)}])assert.throws(()=>verifyExtensionIdentity(fixture.bytes,receipt));
 assert.throws(()=>createRegistrationPlan({packageBytes:fixture.bytes,receipt:fixture.receipt,hostPath:'C:\\OwnedFixture\\..\\MaterialFileEncryptor.BrowserHost.exe',manifestPath:'C:\\OwnedFixture\\downloads.json'}),/absolute/);
 assert.throws(()=>createRegistrationPlan({packageBytes:fixture.bytes,receipt:fixture.receipt,hostPath:'relative.exe',manifestPath:'relative.json'}),/absolute/);
});
test('native broker keeps pairing explicit and reports pending, active and completion with host-only events',async()=>{
 let approved=0;const captures=[];const broker=factory({authorizePair:async()=>{approved++;return true;},onProposal:item=>captures.push(item)});
 const pair=await broker.receive(origin,{type:'pair'});assert.equal(approved,1);const result=await broker.receive(origin,{type:'propose',session:pair.session,proposal});assert.equal(result.id,captures[0].id);
 const status=()=>broker.receive(origin,{type:'status',session:pair.session,id:result.id});assert.equal((await status()).state,'awaiting-confirmation');
 broker.observeDownload({type:'download',item:{browserCaptureId:result.id,state:'downloading',received:2,total:4}});assert.deepEqual(await status(),{type:'status',id:result.id,state:'downloading',received:2,total:4});
 broker.observeDownload({type:'download',item:{browserCaptureId:result.id,state:'completed',received:4,total:4}});assert.equal((await status()).state,'completed');
 await assert.rejects(broker.receive(origin,{type:'propose',session:pair.session,proposal}),/duplicated/);broker.close();await assert.rejects(status(),/Unlock/);
});
test('unknown callers, consent denial, unsafe proposal fields, replay and expired sessions fail closed',async()=>{
 let now=0,unlocked=true;const broker=factory({now:()=>now,isUnlocked:()=>unlocked});await assert.rejects(broker.receive('chrome-extension://'+'b'.repeat(32)+'/',{type:'pair'}),/not allowed/);
 const denied=factory({authorizePair:async()=>false});await assert.rejects(denied.receive(origin,{type:'pair'}),/not approved/);denied.close();
 const pair=await broker.receive(origin,{type:'pair'});for(const row of [{...proposal,filename:'../file'},{...proposal,url:'file:///fixture'},{...proposal,extra:1}])await assert.rejects(broker.receive(origin,{type:'propose',session:pair.session,proposal:row}));
 const result=await broker.receive(origin,{type:'propose',session:pair.session,proposal});await assert.rejects(broker.receive(origin,{type:'status',session:pair.session,id:result.id,extra:1}),/Unsupported/);
 now=900001;await assert.rejects(broker.receive(origin,{type:'status',session:pair.session,id:result.id}),/Pair/);await assert.rejects(broker.receive(origin,{type:'propose',session:pair.session,proposal:{...proposal,browserDownloadId:2}}),/Pair/);
 unlocked=false;await assert.rejects(broker.receive(origin,{type:'pair'}),/Unlock/);broker.close();
});
test('native broker child requires actual ACL ready receipt and frames correlated host requests',async()=>{
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>queueMicrotask(()=>{child.emit('exit',0);child.stdout.destroy();child.stderr.destroy();child.emit('close',0);});let spawnOptions;
 const broker=factory({hostPath:'C:\\OwnedFixture\\MaterialFileEncryptor.BrowserHost.exe',spawnHost:(_path,args,options)=>{assert.deepEqual(args,['--broker']);spawnOptions=options;return child;}});
 const starting=broker.start();child.stdout.write(nativeFrame({type:'ready',aclVerified:true}));assert.deepEqual(await starting,{started:true,aclVerified:true});assert.equal(spawnOptions.windowsHide,true);assert.equal(spawnOptions.shell,false);
 const reply=new Promise(resolve=>child.stdin.once('data',resolve));const requestId='11111111-1111-1111-1111-111111111111';child.stdout.write(nativeFrame({requestId,origin,message:{type:'pair'}}));const bytes=await reply,message=JSON.parse(bytes.subarray(4));assert.equal(message.requestId,requestId);assert.equal(message.response.type,'paired');
 const malformed=Buffer.alloc(4);malformed.writeUInt32LE(65537);child.stdout.write(malformed);assert.equal(broker.available,false);assert.equal((await broker.close()).verified,true);
});
test('native frame encoder rejects over 64 KiB before sending any bytes',()=>{assert.throws(()=>nativeFrame({data:'x'.repeat(65536)}),/64 KiB/);});

test('compiled native host relays synthetic pairing and proposal frames through its actual broker',{
 skip:!process.env.MFE_BROWSER_HOST_EXE?'Focused native build executable was not supplied.':false,timeout:20000
},async()=>{
 const source=path.resolve(process.env.MFE_BROWSER_HOST_EXE),fixtureRoot=path.resolve('.test-output');await fs.mkdir(fixtureRoot,{recursive:true});const folder=await fs.mkdtemp(path.join(fixtureRoot,'native-host-'));
 let broker,client;
 try{
  await fs.cp(path.dirname(source),folder,{recursive:true});const hostPath=path.join(folder,'MaterialFileEncryptor.BrowserHost.exe');await fs.writeFile(path.join(folder,'browser-host-config.json'),JSON.stringify(plan.config),{flag:'wx'});
  const captures=[];broker=factory({hostPath,onProposal:item=>captures.push(item)});await broker.start();assert.equal(broker.available,true);
  client=spawn(hostPath,[origin],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});let next=null;const replies=[];
  const decoder=createNativeMessageDecoder(message=>{if(next){const resolve=next;next=null;resolve(message);}else replies.push(message);});
  client.stdout.on('data',chunk=>decoder.push(chunk));client.stderr.resume();
  const request=message=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Synthetic host response timed out.')),5000);next=value=>{clearTimeout(timer);resolve(value);};client.stdin.write(nativeFrame(message));});
  const paired=await request({type:'pair'});assert.equal(paired.type,'paired');const proposed=await request({type:'propose',session:paired.session,proposal});assert.equal(proposed.type,'proposed');assert.equal(captures.length,1);
  assert.equal((await request({type:'status',session:paired.session,id:proposed.id})).state,'awaiting-confirmation');
  broker.observeDownload({type:'download',item:{browserCaptureId:proposed.id,state:'downloading',received:1,total:2}});assert.equal((await request({type:'status',session:paired.session,id:proposed.id})).state,'downloading');
  broker.observeDownload({type:'download',item:{browserCaptureId:proposed.id,state:'completed',received:2,total:2}});assert.equal((await request({type:'status',session:paired.session,id:proposed.id})).state,'completed');
  assert.equal((await request({type:'propose',session:paired.session,proposal})).type,'error');
 }finally{
  const exit=client?new Promise(resolve=>{if(client.exitCode!==null)resolve();else{client.once('exit',resolve);client.kill();}}):Promise.resolve();const receipt=await broker?.close();if(receipt)assert.deepEqual({processExited:receipt.processExited,stdioClosed:receipt.stdioClosed,verified:receipt.verified},{processExited:true,stdioClosed:true,verified:true});await exit;
  if(!folder.startsWith(fixtureRoot+path.sep))throw Error('Fixture cleanup target is outside its owned root.');await fs.rm(folder,{recursive:true,force:true});
 }
});

test('close waits for owned process exit and stdio closure and reports an unverified deadline',async()=>{
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();let killed=0;child.kill=()=>{killed++;};
 const broker=factory({closeTimeoutMs:25,hostPath:'C:\\OwnedFixture\\MaterialFileEncryptor.BrowserHost.exe',spawnHost:()=>child});const starting=broker.start();child.stdout.write(nativeFrame({type:'ready',aclVerified:true}));await starting;
 const closing=broker.close();assert.equal(broker.close(),closing);const receipt=await closing;assert.equal(killed,1);assert.equal(receipt.processExited,false);assert.equal(receipt.stdioClosed,false);assert.equal(receipt.verified,false);assert.equal(receipt.deadlineMs,25);await assert.rejects(broker.start(),/closed/);
 child.stdout.destroy();child.stderr.destroy();child.emit('exit',0);child.emit('close',0);
});
test('close revokes an unresolved native approval and never upgrades it to a drained receipt',async()=>{
 let approve;const broker=factory({authorizePair:()=>new Promise(resolve=>{approve=resolve;})});const pairing=broker.receive(origin,{type:'pair'});const receipt=await broker.close();assert.equal(receipt.pendingRequests,1);assert.equal(receipt.verified,false);approve(true);await assert.rejects(pairing,/not approved/);assert.equal(broker.available,false);
});
