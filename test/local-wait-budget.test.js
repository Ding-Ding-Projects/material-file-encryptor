import test from 'node:test';
import assert from 'node:assert/strict';
import {createWaitBudget,WAIT_BUDGET_KEY} from '../src/renderer/features/access/wait-budget.js';
import {LocalProfile} from '../src/renderer/features/access/profile.js';
import {LockController} from '../src/renderer/features/access/locks.js';
import {mountAccess} from '../src/renderer/features/access/index.js';
import {createAccessDocument} from './helpers/local-access-dom.js';

function storage(){const values=new Map();return{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),values};}
function mutex(){let tail=Promise.resolve();return(_name,run)=>{const result=tail.then(run,run);tail=result.catch(()=>{});return result;};}
function vault(){const values=new Map();return {get:async key=>values.get(key),set:async(key,value)=>values.set(key,value)};}
test('three hourly skips persist across manager recreation and concurrent consumers',async()=>{
 let now=100000;const disk=storage(),withLock=mutex();
 const first=createWaitBudget({storage:disk,withLock,now:()=>now}),second=createWaitBudget({storage:disk,withLock,now:()=>now});
 const results=await Promise.all([first.consume(),second.consume(),first.consume(),second.consume()]);
 assert.equal(results.filter(Boolean).length,3);assert.equal((await second.status()).remaining,0);
 const reloaded=createWaitBudget({storage:disk,withLock,now:()=>now});assert.equal(await reloaded.consume(),false);
 now+=3600000;assert.equal((await reloaded.status()).remaining,3);assert.equal(await reloaded.consume(),true);
});
test('corrupt or non-atomic storage never grants a free skip',async()=>{
 const disk=storage();disk.setItem(WAIT_BUDGET_KEY,'invalid');const bad=createWaitBudget({storage:disk,withLock:mutex()});await assert.rejects(bad.status(),/invalid/);await assert.rejects(bad.consume(),/invalid/);
 const unavailable=createWaitBudget({storage:storage(),withLock:null});assert.equal((await unavailable.status()).canConsume,false);await assert.rejects(unavailable.consume(),/Atomic/);
});
test('profile ladder clears waiting only and consumes the shared persistent budget',async()=>{
 let now=100000;const disk=storage(),budget=createWaitBudget({storage:disk,withLock:mutex(),now:()=>now}),profile=new LocalProfile({store:vault(),waitBudget:budget,now:()=>now});
 await profile.unlock('sample profile password',{create:true});profile.logout();
 for(let i=0;i<5;i++)await assert.rejects(profile.unlock('incorrect password'));
 assert.ok(profile.waiting()>0);const before=profile.waitState;
 const challenge=await profile.challengeWait('profile',{schoolMode:true});assert.equal(challenge.rung,'sums');assert.equal(challenge.dishUnavailable,false);
 assert.equal(await profile.answerWait('profile',challenge.nonce,challenge.question.map(({a,b})=>a+b)),true);
 assert.equal(profile.waiting(),0);assert.equal(profile.authenticated,false);assert.equal(profile.waitState.level,before.level);assert.equal(profile.waitState.failures,before.failures);assert.equal((await budget.status()).remaining,2);
 const element=new LockController({waitBudget:budget,now:()=>now});await element.set('shared-budget','pin',{pin:'2468'});for(let i=0;i<5;i++)await element.unlock('shared-budget',{pin:'wrong'});const next=await element.challengeWaitAsync('shared-budget',{schoolMode:true});assert.equal(await element.answerWait('shared-budget',next.nonce,next.question.map(({a,b})=>a+b)),true);assert.equal((await budget.status()).remaining,1);assert.equal(element.isLocked('shared-budget'),true);
 await assert.rejects(profile.encrypt({value:1}),/Unlock/);await profile.unlock('sample profile password');assert.equal(profile.authenticated,true);
});
test('profile cancellation during asynchronous budget reservation cannot end waiting',async()=>{
 let release;const budget={status:async()=>({remaining:3,canConsume:true}),consume:()=>new Promise(resolve=>release=resolve)};
 const profile=new LocalProfile({store:vault(),waitBudget:budget});await profile.unlock('sample password',{create:true});profile.logout();for(let i=0;i<5;i++)await assert.rejects(profile.unlock('incorrect'));
 const challenge=await profile.challengeWait('profile',{schoolMode:true});const pending=profile.answerWait('profile',challenge.nonce,challenge.question.map(({a,b})=>a+b));profile.logout();release(true);
 assert.equal(await pending,false);assert.ok(profile.waiting()>0);assert.equal(profile.authenticated,false);
});
test('profile waiting action opens the real ladder surface after failed attempts',async()=>{
 const document=createAccessDocument(),container=document.createElement('main');document.body.append(container);
 const disk=storage(),access=mountAccess(container,{storage:disk,credentialStore:vault(),withLocalLock:mutex(),schoolMode:true});
 try{
  const profile=container.querySelector('fieldset'),input=profile.querySelector('input');
  input.value='sample profile password';await profile.querySelectorAll('button').find(button=>button.textContent==='Set up local profile').click();access.logout();
  const unlock=profile.querySelectorAll('button').find(button=>button.textContent==='Unlock local profile');for(let i=0;i<5;i++){input.value='incorrect';await unlock.click();}
  const action=profile.querySelectorAll('button').find(button=>button.textContent==='Try the waiting ladder');assert.equal(action.hidden,false);await action.click();await new Promise(resolve=>setImmediate(resolve));
  assert.ok(profile.querySelectorAll('legend').some(legend=>legend.textContent==='Waiting ladder'));assert.ok(profile.querySelectorAll('button').some(button=>button.textContent==='Submit answers'));assert.equal(access.authenticated,false);
 }finally{access.destroy();}
});
