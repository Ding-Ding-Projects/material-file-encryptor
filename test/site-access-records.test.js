import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalProfile} from '../src/renderer/features/access/profile.js';
import {createVisitorRecords,VISITOR_ACCESS_PREFIX} from '../docs/site/visitor-records.js';
import {createPrivateHistory} from '../src/shared/local-ux/history.js';

function memory(){const data=new Map();return {data,get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
function fixture(storage=memory()){
  let profile;
  const session={get authenticated(){return profile.authenticated;},encryptPrivateCache:(v,id)=>profile.encrypt(v,id),decryptPrivateCache:(v,id)=>profile.decrypt(v,id)};
  const records=createVisitorRecords({storage,profile:()=>session,withLock:(_name,run)=>run()});
  profile=new LocalProfile({store:records});return {storage,records,profile};
}
test('browser credential records encrypt real authenticator data and remain locked across reload',async()=>{
  const f=fixture();await f.profile.unlock('synthetic profile fixture',{create:true});
  const secret={secret:'SYNTHETIC-PRIVATE-SECRET',account:'synthetic account'};
  await f.records.set('authenticator:fixture',secret);
  assert.ok(![...f.storage.data.values()].join('').includes(secret.secret));
  assert.deepEqual(await f.records.get('authenticator:fixture'),secret);
  f.profile.logout();await assert.rejects(f.records.get('authenticator:fixture'),/Unlock/);
  const reloaded=fixture(f.storage);await assert.rejects(reloaded.profile.unlock('wrong synthetic credential'));
  assert.equal(reloaded.profile.authenticated,false);
  await reloaded.profile.unlock('synthetic profile fixture');assert.deepEqual(await reloaded.records.get('authenticator:fixture'),secret);
  const envelope=JSON.parse(f.storage.getItem(VISITOR_ACCESS_PREFIX+'authenticator:fixture'));envelope.ciphertext=(envelope.ciphertext[0]==='A'?'B':'A')+envelope.ciphertext.slice(1);
  f.storage.setItem(VISITOR_ACCESS_PREFIX+'authenticator:fixture',JSON.stringify(envelope));await assert.rejects(reloaded.records.get('authenticator:fixture'));
  reloaded.profile.logout();
});
test('profile verifier cannot be overwritten and reset only touches owned visitor records',async()=>{
  const f=fixture();await f.profile.unlock('synthetic profile fixture',{create:true});
  const verifier=await f.records.get('local-profile:v1');await assert.rejects(f.records.set('local-profile:v1',verifier),/already exists/);
  await assert.rejects(f.records.set('unrelated:key',{password:'never stored'}),/Unsupported/);
  f.storage.setItem('unrelated browser data','preserve');await assert.rejects(f.records.resetOwned(),/Confirm/);
  assert.ok(await f.records.resetOwned({confirmed:true})>0);assert.equal(f.storage.getItem('unrelated browser data'),'preserve');assert.equal(await f.records.get('local-profile:v1'),null);
  f.profile.logout();
});
test('encrypted private history requires profile and independent history password, omits secret fields',async()=>{
  const f=fixture();const history=createPrivateHistory({storage:f.storage,key:'synthetic-history',credentialStore:{get:()=>f.records.get('history:verifier'),set:(_id,value)=>f.records.set('history:verifier',value)}});
  await assert.rejects(history.setup('synthetic independent history password'),/Unlock/);
  await f.profile.unlock('synthetic profile fixture',{create:true});await history.setup('synthetic independent history password');
  await history.append('preference changed',{theme:'dark',password:'private marker',vocabulary:{marker:'private wording marker'}});
  const bytes=[...f.storage.data.values()].join('');assert.ok(!bytes.includes('private marker'));assert.ok(!bytes.includes('private wording marker'));assert.ok(!bytes.includes('preference changed'));
  const rows=await history.list();assert.equal(rows.length,1);assert.deepEqual((await history.get(rows[0].id)).snapshot,{theme:'dark'});
  history.lock();await assert.rejects(history.unlock('synthetic profile fixture'));await history.unlock('synthetic independent history password');assert.equal((await history.list()).length,1);
  history.destroy();f.profile.logout();
});
test('session invalidation cancels a pending credential write before storage mutation',async()=>{
  const storage=memory();let release;
  const blocked=new Promise(resolve=>{release=resolve;});
  const records=createVisitorRecords({storage,profile:()=>null,withLock:async(_name,run)=>{await blocked;return run();}});
  const verifier={version:2,purpose:'password-verifier',iterations:310000,salt:'A'.repeat(24),hash:'A'.repeat(44)};
  const pending=records.set('local-profile:v1',verifier);records.invalidate();release();
  await assert.rejects(pending,/cancelled/);assert.equal(storage.length,0);
});
test('missing browser write lock support never falls back to plaintext storage',async()=>{
  const storage=memory();
  const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
  try{
    const records=createVisitorRecords({storage,profile:()=>null});
    const verifier={version:2,purpose:'password-verifier',iterations:310000,salt:'A'.repeat(24),hash:'A'.repeat(44)};
    await assert.rejects(records.set('local-profile:v1',verifier),/Web Locks/);assert.equal(storage.length,0);
  }finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});
