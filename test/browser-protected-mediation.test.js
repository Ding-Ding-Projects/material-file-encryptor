import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserProtectedMediation} from '../src/main/browser-protected-mediation.js';
import {createBrowserNativeBroker} from '../src/main/browser-native-host.js';
const origin=`chrome-extension://${'a'.repeat(32)}/`,session='a'.repeat(43),scope={profileId:'local-profile',operation:'read-profile-summary',target:'profile-summary'};
function fixture(options={}){
 let time=1000,unlocked=true,pair={session,expires:901000},valid=true,authCalls=0,reads=0;
 const authority={},proof={profileId:'local-profile',revision:'synthetic-revision-1',expiresAt:100000,authority};
 const service=createBrowserProtectedMediation({allowedOrigins:[origin],getPair:()=>pair,isUnlocked:()=>unlocked,now:()=>time,authenticateProfile:async()=>{authCalls++;return proof;},validateAuthority:async value=>value.authority===authority&&value.revision===proof.revision&&valid,readProfileSummary:async()=>{reads++;return{schemaVersion:1,profile:'authenticated',protectedAccess:'granted'};},...options});
 return{service,proof,authority,authenticate:()=>service.receive(origin,{type:'protected-authenticate',session,...scope}),execute:grant=>service.receive(origin,{type:'protected-execute',session,...scope,grant}),setTime:value=>time=value,lock:()=>unlocked=false,disconnect:()=>pair=null,replacePair:()=>pair={session,expires:901000},invalidate:()=>valid=false,get reads(){return reads;},get authCalls(){return authCalls;}};
}
test('capability discovery derives availability only from all installed native callbacks',async()=>{
 for(const missing of ['authenticateProfile','validateAuthority','readProfileSummary']){const f=fixture({[missing]:undefined});assert.deepEqual(await f.service.receive(origin,{type:'protected-discover',session}),{type:'protected-capabilities',schemaVersion:1,authentication:'unavailable',operations:[]});await assert.rejects(f.authenticate(),/unavailable/);assert.equal(f.authCalls,0);f.service.close();}
 const f=fixture();assert.deepEqual((await f.service.receive(origin,{type:'protected-discover',session})).operations,[scope]);assert.equal(f.authCalls,0);await assert.rejects(f.execute('b'.repeat(43)),/unavailable/);assert.equal(f.reads,0);f.service.close();
});
test('explicit native authentication creates one exact scoped one-use grant and no proof metadata leaves host',async()=>{
 const f=fixture();const result=await f.authenticate();assert.equal(f.authCalls,1);assert.deepEqual(Object.keys(result).sort(),['expiresInMilliseconds','grant','operation','profileId','schemaVersion','target','type']);assert.equal(result.expiresInMilliseconds,60000);assert.equal(result.revision,undefined);assert.equal(result.authority,undefined);assert.equal((await f.execute(result.grant)).summary.protectedAccess,'granted');await assert.rejects(f.execute(result.grant),/unavailable/);assert.equal(f.reads,1);f.service.close();
});
test('forged origins sessions profiles targets operations unknown fields prototype and size are rejected before native callbacks',async()=>{
 const f=fixture();const base={type:'protected-authenticate',session,...scope};
 await assert.rejects(f.service.receive(origin.replace('aaaa','bbbb'),base),/not allowed/);
 for(const value of [{...base,session:'z'.repeat(43)},{...base,profileId:'other'},{...base,target:'file'},{...base,operation:'shell'},{...base,authenticated:true},{...base,extra:'x'.repeat(65536)},Object.assign(Object.create({authenticated:true}),base),{...base,[Symbol('extra')]:true}])await assert.rejects(f.service.receive(origin,value));
 assert.equal(f.authCalls,0);assert.equal(f.reads,0);f.service.close();
});
test('expiry revocation lock disconnect replaced pairing and native revision invalidate grants',async()=>{
 for(const mutation of ['expiry','revoke','lock','disconnect','replace','revision','close']){const f=fixture(),result=await f.authenticate();if(mutation==='expiry')f.setTime(61000);else if(mutation==='revoke')f.service.revoke();else if(mutation==='lock')f.lock();else if(mutation==='disconnect')f.disconnect();else if(mutation==='replace')f.replacePair();else if(mutation==='revision')f.invalidate();else f.service.close();await assert.rejects(f.execute(result.grant));assert.equal(f.reads,0);f.service.close();}
});
test('grant is consumed before asynchronous native validation and remains consumed on exception',async()=>{
 let hold=false,begin,release;const ready=new Promise(resolve=>begin=resolve),wait=new Promise(resolve=>release=resolve);
 const f=fixture({validateAuthority:async()=>{if(hold){begin();await wait;throw Error('Synthetic native validation rejected');}return true;}}),result=await f.authenticate();hold=true;const pending=f.execute(result.grant);await ready;await assert.rejects(f.execute(result.grant),/unavailable/);release();await assert.rejects(pending,/Synthetic/);await assert.rejects(f.execute(result.grant),/unavailable/);assert.equal(f.reads,0);f.service.close();
});
test('all authority-loss races during native authentication prevent late grants',async()=>{
 for(const mutation of ['revoke','lock','disconnect','replace','expiry','close']){let begin,release;const ready=new Promise(resolve=>begin=resolve),wait=new Promise(resolve=>release=resolve);let f;f=fixture({authenticateProfile:async()=>{begin();await wait;return f.proof;}});const pending=f.authenticate();await ready;if(mutation==='revoke')f.service.revoke();else if(mutation==='lock')f.lock();else if(mutation==='disconnect')f.disconnect();else if(mutation==='replace')f.replacePair();else if(mutation==='expiry')f.setTime(100000);else f.service.close();release();await assert.rejects(pending);assert.equal(f.reads,0);f.service.close();}
});
test('revocation disconnect expiry and revision during summary read suppress stale protected results',async()=>{
 for(const mutation of ['revoke','lock','disconnect','replace','expiry','revision','close']){let begin,release;const ready=new Promise(resolve=>begin=resolve),wait=new Promise(resolve=>release=resolve);const f=fixture({readProfileSummary:async()=>{begin();await wait;return{schemaVersion:1,profile:'authenticated',protectedAccess:'granted'};}}),result=await f.authenticate(),pending=f.execute(result.grant);await ready;if(mutation==='revoke')f.service.revoke();else if(mutation==='lock')f.lock();else if(mutation==='disconnect')f.disconnect();else if(mutation==='replace')f.replacePair();else if(mutation==='expiry')f.setTime(61000);else if(mutation==='revision')f.invalidate();else f.service.close();release();await assert.rejects(pending);f.service.close();}
});
test('safe summary rejects unknown or credential-derived fields and native timeout cancels consent',async()=>{
 for(const summary of [{schemaVersion:1,profile:'authenticated',protectedAccess:'granted',password:'synthetic forbidden'},{schemaVersion:1,profile:'authenticated',protectedAccess:'granted',label:'private wording'},{schemaVersion:1,profile:'locked',protectedAccess:'granted'}]){const f=fixture({readProfileSummary:async()=>summary}),result=await f.authenticate();await assert.rejects(f.execute(result.grant),/invalid/);await assert.rejects(f.execute(result.grant),/unavailable/);f.service.close();}
 let signal;const f=fixture({timeoutMs:25,authenticateProfile:context=>{signal=context.signal;return new Promise(()=>{});}});await assert.rejects(f.authenticate(),/cancelled/);assert.equal(signal.aborted,true);assert.equal(f.service.pending,0);f.service.close();
});
test('default broker supports discovery only after pairing and does not expose native authentication',async()=>{
 const id='a'.repeat(32),broker=createBrowserNativeBroker({config:{schemaVersion:1,host:'org.dingding.material_file_encryptor.downloads',allowedOrigins:[origin],identity:{extensionId:id,packageSha256:'0'.repeat(64),publicKeySha256:'1'.repeat(64)}},authorizePair:async()=>true,isUnlocked:()=>true,onProposal:()=>{}});
 try{await assert.rejects(broker.receive(origin,{type:'protected-discover',session}));const pair=await broker.receive(origin,{type:'pair'});assert.equal((await broker.receive(origin,{type:'protected-discover',session:pair.session})).authentication,'unavailable');await assert.rejects(broker.receive(origin,{type:'protected-authenticate',session:pair.session,...scope}),/unavailable/);}finally{await broker.close();}
});
