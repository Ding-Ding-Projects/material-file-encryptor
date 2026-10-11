import test from 'node:test';
import assert from 'node:assert/strict';
import {passwordVerifier,verifyPassword,createSessionKey,deriveCacheKey,seal,unseal,totp,parseOtpUri} from '../src/renderer/features/access/crypto.js';
import {LockController,LOCK_POLICIES,WaitLadder} from '../src/renderer/features/access/locks.js';
import {LocalProfile} from '../src/renderer/features/access/profile.js';
import {otpUri,qrPixels,qrSvg,decodeQrPixels} from '../src/renderer/features/access/qr.js';
const base32 = value => {let bits=0,acc=0,out='';for(const byte of new TextEncoder().encode(value)){acc=(acc<<8)|byte;bits+=8;while(bits>=5){bits-=5;out+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(acc>>bits)&31];}}if(bits)out+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(acc<<(5-bits))&31];return out;};
test('local QR encoder and decoder round-trip registration parameters without a network',()=>{
  const entry={secret:'JBSWY3DPEHPK3PXP',issuer:'Example account',account:'sample@example.test',algorithm:'SHA512',digits:8,period:45};
  const uri=otpUri(entry);const pixels=qrPixels(uri);assert.equal(decodeQrPixels(pixels.data,pixels.width,pixels.height),uri);
  assert.deepEqual(parseOtpUri(uri),entry);assert.match(qrSvg(uri),/fill="white"/);assert.match(qrSvg(uri),/fill="black"/);
  assert.throws(()=>decodeQrPixels(new Uint8ClampedArray(4),5000,5000),/megapixel/);
});
test('password records are salted and protected cache rejects altered identity',async()=>{
  const a=await passwordVerifier('sample credential'),b=await passwordVerifier('sample credential');assert.notEqual(a.salt,b.salt);assert.equal(await verifyPassword('sample credential',a),true);assert.equal(await verifyPassword('incorrect',a),false);
  const key=await createSessionKey(),record=await seal({value:42},key,'entry-a');assert.deepEqual(await unseal(record,key,'entry-a'),{value:42});await assert.rejects(unseal(record,key,'entry-b'));
});
test('persisted password verifier is never an AES key for protected cache',async()=>{
  const verifier=await passwordVerifier('purpose-separated sample');
  const goodKey=await deriveCacheKey('purpose-separated sample',verifier.salt);
  const record=await seal({value:'synthetic private snapshot'},goodKey,'history');
  const verifierAsKey=await crypto.subtle.importKey('raw',Uint8Array.from(atob(verifier.hash),c=>c.charCodeAt(0)),{name:'AES-GCM'},false,['decrypt']);
  await assert.rejects(unseal(record,verifierAsKey,'history'));
  assert.deepEqual(await unseal(record,await deriveCacheKey('purpose-separated sample',verifier.salt),'history'),{value:'synthetic private snapshot'});
  await assert.rejects(unseal(record,await deriveCacheKey('wrong sample',verifier.salt),'history'));
  assert.equal(await verifyPassword('purpose-separated sample',verifier),true);
});
test('legacy verifiers authenticate but exposed-key ciphertext is explicitly rejected',async()=>{
  const text=new TextEncoder(),salt=crypto.getRandomValues(new Uint8Array(16)),material=await crypto.subtle.importKey('raw',text.encode('legacy sample'),'PBKDF2',false,['deriveBits']);
  const hash=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:310000},material,256),b64=value=>btoa(String.fromCharCode(...new Uint8Array(value)));
  const legacy={version:1,iterations:310000,salt:b64(salt),hash:b64(hash)};
  assert.equal(await verifyPassword('legacy sample',legacy),true);
  const oldKey=await crypto.subtle.importKey('raw',hash,'AES-GCM',false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:text.encode('history')},oldKey,text.encode('{}'));
  await assert.rejects(unseal({version:1,iv:b64(iv),ciphertext:b64(ciphertext)},await deriveCacheKey('legacy sample',legacy.salt),'history'),/exposed key derivation/);
  const next=await seal({value:1},await deriveCacheKey('legacy sample',legacy.salt),'history');
  const publicVerifierKey=await crypto.subtle.importKey('raw',hash,'AES-GCM',false,['decrypt']);
  await assert.rejects(unseal(next,publicVerifierKey,'history'));
});
test('existing locks cannot be overwritten through creation including concurrent calls',async()=>{
  const backing=new Map(),store={get:async key=>backing.get(key),set:async(key,value)=>backing.set(key,value),delete:async key=>backing.delete(key)};
  const owner=new LockController({store});await owner.set('target','password',{password:'original'});
  await assert.rejects(owner.set('target','pin',{pin:'1234'}),/already has a lock/);
  const restarted=new LockController({store});await assert.rejects(restarted.set('target','pin',{pin:'1234'}),/already has a lock/);
  await owner.load(['target']);assert.equal(await owner.unlock('target',{password:'original'}),true);
  const first=owner.set('new-target','password',{password:'first'});await assert.rejects(owner.set('new-target','pin',{pin:'1234'}),/already has a lock/);await first;
});
test('profile logout invalidates an immediately pending correct-password unlock',async()=>{
  const records=new Map(),events=[];const store={get:async key=>records.get(key),set:async(key,value)=>records.set(key,value)};
  const profile=new LocalProfile({store,onAuthenticatedChange:value=>events.push(value)});
  await profile.unlock('profile cancellation sample',{create:true});profile.logout();
  const pending=profile.unlock('profile cancellation sample');profile.logout();
  await assert.rejects(pending,/cancelled/);assert.equal(profile.authenticated,false);assert.equal(events.at(-1),false);
  await assert.rejects(profile.encrypt({value:1}),/Unlock/);
  await profile.unlock('profile cancellation sample');assert.equal(profile.authenticated,true);
});
test('private cache reopens only with matching profile password and stable identity',async()=>{
  const verifier=await passwordVerifier('sample profile');const first=await deriveCacheKey('sample profile',verifier.salt);
  const encrypted=await seal({settings:['private value']},first,'private-cache');
  assert.equal(JSON.stringify(encrypted).includes('private value'),false);
  assert.deepEqual(await unseal(encrypted,await deriveCacheKey('sample profile',verifier.salt),'private-cache'),{settings:['private value']});
  await assert.rejects(unseal(encrypted,await deriveCacheKey('wrong profile',verifier.salt),'private-cache'));
});
test('protected cache supports large snapshots and enforces byte limits',async()=>{
  const key=await createSessionKey();const snapshot={text:'x'.repeat(300000)};assert.deepEqual(await unseal(await seal(snapshot,key,'large'),key,'large'),snapshot);
  await assert.rejects(seal({text:'x'.repeat(1048576)},key,'large'),/1 MiB/);
  await assert.rejects(unseal({version:2,iv:'a'.repeat(16),ciphertext:'a'.repeat(22369625)},key,'large'),/limits/);
});
test('RFC6238 vectors for all three hash algorithms and six/eight digits',async()=>{
  const cases=[['SHA1','12345678901234567890',['94287082','07081804','14050471','89005924','69279037','65353130']],['SHA256','12345678901234567890123456789012',['46119246','68084774','67062674','91819424','90698825','77737706']],['SHA512','1234567890123456789012345678901234567890123456789012345678901234',['90693936','25091201','99943326','93441116','38618901','47863826']]];
  const times=[59,1111111109,1111111111,1234567890,2000000000,20000000000];
  for(const [algorithm,secret,codes]of cases)for(let i=0;i<times.length;i++){const entry={algorithm,secret:base32(secret),digits:8,period:30};assert.equal(await totp(entry,times[i]*1000),codes[i]);assert.equal(await totp({...entry,digits:6},times[i]*1000),codes[i].slice(-6));}
  assert.equal(parseOtpUri('otpauth://totp/Example:user?secret=JBSWY3DPEHPK3PXP&period=45&digits=8&algorithm=SHA512').period,45);
});
test('every lock policy checks all factors, stays independent, and expires',async()=>{
  let now=59000;const c=new LockController({now:()=>now});const otp={algorithm:'SHA1',secret:base32('12345678901234567890'),digits:6,period:30};
  for(const policy of Object.keys(LOCK_POLICIES)){await c.set(policy,policy,{pin:'1234',password:'password',totp:otp,code:await totp(otp,now)},1);assert.equal(await c.unlock(policy,{pin:'wrong',password:'wrong',totp:'000000'}),false);assert.equal(await c.unlock(policy,{pin:'1234',password:'password',totp:await totp(otp,now)}),true);}
  c.lock('pin');let called=false;assert.equal(c.run('pin',()=>called=true),false);assert.equal(called,false);assert.equal(c.isLocked('password'),false);now+=61000;assert.equal(c.isLocked('password'),true);
});
test('ladder consumes nonce, budgets three skips and cannot authenticate',()=>{
  let now=1000;const ladder=new WaitLadder({now:()=>now});
  for(let i=0;i<3;i++){const q=ladder.challenge();assert.equal(ladder.answer(q.nonce,1),true);assert.equal(ladder.answer(q.nonce,1),false);}assert.equal(ladder.challenge(),null);now+=3600001;assert.ok(ladder.challenge());assert.equal('sessions' in ladder,false);
  const school=new WaitLadder({schoolMode:true,now:()=>now});assert.equal(school.challenge().rung,'sums');school.answer(school.pending.nonce,[]);assert.equal(school.challenge().rung,'moles');const nonce=school.pending.nonce;assert.equal(school.answer(nonce,[]),false);assert.equal(school.rung,'clock');
});
