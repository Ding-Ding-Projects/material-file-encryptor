import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createBrowserNativeBroker,nativeFrame} from '../src/main/browser-native-host.js';
import {createNativeMessageDecoder} from '../src/main/browser-download-receiver.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const origin=`chrome-extension://${'a'.repeat(32)}/`,connection1='11111111-1111-4111-8111-111111111111',connection2='22222222-2222-4222-8222-222222222222',scope={profileId:'local-profile',operation:'read-profile-summary',target:'profile-summary'};
async function fixture(options={}){
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{child.exitCode=0;child.emit('exit',0);child.emit('close',0);};let sequence=0;const pending=new Map();
 const proof={profileId:'local-profile',revision:'synthetic-revision',expiresAt:100000,authority:{}};
 const broker=createBrowserNativeBroker({config:{schemaVersion:1,host:'org.dingding.material_file_encryptor.downloads',allowedOrigins:[origin],identity:{extensionId:'a'.repeat(32),packageSha256:'0'.repeat(64),publicKeySha256:'1'.repeat(64)}},hostPath:'C:\\Synthetic\\MaterialFileEncryptor.BrowserHost.exe',spawnHost:()=>child,authorizePair:async()=>true,isUnlocked:()=>true,onProposal:()=>{},now:()=>1000,authenticateProfile:async()=>proof,validateAuthority:async()=>true,readProfileSummary:async()=>({schemaVersion:1,profile:'authenticated',protectedAccess:'granted'}),...options});
 const decoder=createNativeMessageDecoder(envelope=>{const resolve=pending.get(envelope.requestId);pending.delete(envelope.requestId);resolve?.(envelope.response);});child.stdin.on('data',chunk=>decoder.push(chunk));
 const start=broker.start();child.stdout.write(nativeFrame({type:'ready',aclVerified:true}));await start;
 return{broker,child,proof,request:(connectionId,message)=>new Promise(resolve=>{const requestId=`33333333-3333-4333-8333-${String(++sequence).padStart(12,'0')}`;pending.set(requestId,resolve);child.stdout.write(nativeFrame({requestId,connectionId,origin,message}));}),disconnect:connectionId=>child.stdout.write(nativeFrame({type:'disconnected',connectionId}))};
}
test('native transport scopes authority to its host connection and old teardown preserves replacement pairing',async()=>{
 const f=await fixture();try{
  const first=await f.request(connection1,{type:'pair'}),grant=await f.request(connection1,{type:'protected-authenticate',session:first.session,...scope});assert.equal(grant.type,'protected-granted');
  assert.equal((await f.request(connection2,{type:'protected-execute',session:first.session,...scope,grant:grant.grant})).type,'error');
  const second=await f.request(connection2,{type:'pair'});assert.equal(second.type,'paired');f.disconnect(connection1);
  assert.equal((await f.request(connection2,{type:'protected-discover',session:second.session})).authentication,'native-explicit');
  const fresh=await f.request(connection2,{type:'protected-authenticate',session:second.session,...scope});assert.equal((await f.request(connection2,{type:'protected-execute',session:second.session,...scope,grant:fresh.grant})).type,'protected-result');
  f.disconnect(connection2);await assert.rejects(f.broker.receive(origin,{type:'protected-discover',session:second.session}),/Pair the browser again/);
 }finally{await f.broker.close();}
});
test('lost native port cancels in-flight authentication before late native consent and admits a replacement',async()=>{
 let begin,release;const ready=new Promise(resolve=>begin=resolve),wait=new Promise(resolve=>release=resolve);let f;f=await fixture({authenticateProfile:async()=>{begin();await wait;return f.proof;}});
 try{const pair=await f.request(connection1,{type:'pair'}),pending=f.request(connection1,{type:'protected-authenticate',session:pair.session,...scope});await ready;f.disconnect(connection1);assert.equal((await pending).type,'error');const replacement=await f.request(connection2,{type:'pair'});assert.equal(replacement.type,'paired');release();await new Promise(resolve=>setImmediate(resolve));assert.equal((await f.request(connection2,{type:'protected-discover',session:replacement.session})).authentication,'native-explicit');}finally{release?.();await f.broker.close();}
});
test('explicit protected revocation consumes grants while retaining download pairing',async()=>{
 const f=await fixture();try{const pair=await f.request(connection1,{type:'pair'}),grant=await f.request(connection1,{type:'protected-authenticate',session:pair.session,...scope});assert.equal((await f.request(connection1,{type:'protected-revoke',session:pair.session})).type,'protected-revoked');assert.equal((await f.request(connection1,{type:'protected-execute',session:pair.session,...scope,grant:grant.grant})).type,'error');assert.equal((await f.request(connection1,{type:'protected-discover',session:pair.session})).authentication,'native-explicit');}finally{await f.broker.close();}
});
test('native host exit and malformed connection envelopes revoke all authority',async()=>{
 for(const mutation of ['exit','forged-envelope']){const f=await fixture();try{const pair=await f.request(connection1,{type:'pair'});if(mutation==='exit')f.child.emit('exit',1);else f.child.stdout.write(nativeFrame({type:'disconnected',connectionId:connection1,origin}));assert.equal(f.broker.available,false);await assert.rejects(f.broker.receive(origin,{type:'protected-discover',session:pair.session}));}finally{await f.broker.close();}}
});
test('compiled native pipe EOF cancels consent and late old responses cannot steal replacement results',{
 skip:!process.env.MFE_BROWSER_HOST_EXE?'Focused native build executable was not supplied.':false,timeout:20000,
},async()=>{
 const root=path.resolve('.test-output');await fs.mkdir(root,{recursive:true});const folder=await fs.mkdtemp(path.join(root,'protected-native-'));const clients=[];let broker,release;
 try{
  const source=path.resolve(process.env.MFE_BROWSER_HOST_EXE);await fs.cp(path.dirname(source),folder,{recursive:true});const hostPath=path.join(folder,'MaterialFileEncryptor.BrowserHost.exe');
  const config={schemaVersion:1,host:'org.dingding.material_file_encryptor.downloads',allowedOrigins:[origin],identity:{extensionId:'a'.repeat(32),packageSha256:'0'.repeat(64),publicKeySha256:'1'.repeat(64)}};await fs.writeFile(path.join(folder,'browser-host-config.json'),JSON.stringify(config),{flag:'wx'});
  const proof={profileId:'local-profile',revision:'synthetic-revision',expiresAt:100000,authority:{}};let begin,signal,authCalls=0;const ready=new Promise(resolve=>begin=resolve),hold=new Promise(resolve=>release=resolve);
  broker=createBrowserNativeBroker({config,hostPath,authorizePair:async()=>true,isUnlocked:()=>true,onProposal:()=>{},now:()=>1000,authenticateProfile:async context=>{if(++authCalls===1){signal=context.signal;begin();await hold;}return proof;},validateAuthority:async()=>true,readProfileSummary:async()=>({schemaVersion:1,profile:'authenticated',protectedAccess:'granted'})});await broker.start();
  const launch=()=>{
   const process=spawn(hostPath,[origin],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});clients.push(process);let next;const queued=[];
   const decoder=createNativeMessageDecoder(value=>{if(next){const receive=next;next=null;receive(value);}else queued.push(value);});process.stdout.on('data',chunk=>decoder.push(chunk));process.stderr.resume();
   return{process,request:message=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Synthetic native request timed out.')),5000);next=value=>{clearTimeout(timer);resolve(value);};process.stdin.write(nativeFrame(message));}),send:message=>process.stdin.write(nativeFrame(message))};
  };
  const first=launch(),paired=await first.request({type:'pair'});assert.equal(paired.type,'paired');first.send({type:'protected-authenticate',session:paired.session,...scope});await ready;
  const exited=new Promise(resolve=>first.process.once('close',resolve));first.process.kill();await exited;
  const deadline=Date.now()+3000;while(!signal.aborted&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(signal.aborted,true);
  const second=launch(),replacement=await second.request({type:'pair'});assert.equal(replacement.type,'paired');release();
  const grant=await second.request({type:'protected-authenticate',session:replacement.session,...scope});assert.equal(grant.type,'protected-granted');
  const result=await second.request({type:'protected-execute',session:replacement.session,...scope,grant:grant.grant});assert.equal(result.type,'protected-result');
  assert.equal((await second.request({type:'protected-execute',session:replacement.session,...scope,grant:grant.grant})).type,'error');
  assert.equal((await second.request({type:'protected-revoke',session:replacement.session})).type,'protected-revoked');
  assert.equal(broker.available,true);
 }finally{
  release?.();await Promise.all(clients.map(process=>new Promise(resolve=>{if(process.exitCode!==null||process.signalCode!==null)return resolve();process.once('close',resolve);process.kill();})));const receipt=await broker?.close();if(receipt)assert.equal(receipt.verified,true);
  if(!folder.startsWith(root+path.sep))throw Error('Fixture directory is outside the owned root.');await fs.rm(folder,{recursive:true,force:true});
 }
});
