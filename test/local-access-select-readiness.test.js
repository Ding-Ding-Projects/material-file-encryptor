import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessDocument} from './helpers/local-access-dom.js';
import {mountAccess,LOCK_POLICIES} from '../src/renderer/features/access/index.js';

function fixture(){
 const document=createAccessDocument(),createElement=document.createElement.bind(document),selects=[];
 document.createElement=tag=>{
  const node=createElement(tag);
  if(tag==='md-outlined-select'){
   // Material Web queues a setter before its internal menu/options exist. A
   // synchronous value mirror hides this initial getter state from tests.
   let ready=false,requested,resolve;
   node.updateComplete=new Promise(done=>resolve=done);
   Object.defineProperty(node,'value',{get:()=>ready?requested:undefined,set:value=>{requested=value;}});
   node.finishUpdate=()=>{ready=true;resolve(true);};selects.push(node);
  }
  return node;
 };
 const container=document.createElement('main');document.body.append(container);const records=new Map(),messages=[];
 const access=mountAccess(container,{storage:{getItem:()=>null,setItem(){}},credentialStore:{get:async key=>records.get(key),set:async(key,value)=>records.set(key,value),delete:async key=>records.delete(key)},notify:value=>messages.push(value)});
 const field=label=>container.querySelectorAll('md-outlined-text-field').find(node=>node.getAttribute('aria-label')===label);
 const policy=selects.find(node=>node.getAttribute('aria-label')==='Credential policy'),wizard=field('Element identifier').parentElement.parentElement;
 const create=wizard.querySelectorAll('button').find(node=>node.textContent==='Create lock');
 return {access,container,records,messages,selects,policy,wizard,create,field,async ready(){selects.forEach(node=>node.finishUpdate());await Promise.all(selects.map(node=>node.updateComplete));await Promise.resolve();},async choose(value){policy.value=value;await policy.dispatchEvent({type:'change',target:policy});}};
}

test('deferred initial policy getter still returns a mounted controller and intended PIN fields',async()=>{
 const f=fixture();try{
  assert.equal(f.policy.value,undefined);assert.equal(typeof f.access.controller.set,'function');
  assert.throws(()=>LOCK_POLICIES[f.policy.value].includes('pin'),TypeError,'Old immediate lookup must reproduce the startup exception');
  assert.equal(f.field('PIN').parentElement.hidden,false);assert.equal(f.field('Password').parentElement.hidden,true);assert.equal(f.create.disabled,true);
  await f.ready();assert.equal(f.policy.value,'pin');assert.equal(f.field('PIN').parentElement.hidden,false);assert.equal(f.create.disabled,false);
 }finally{f.access.destroy();}
});
test('later valid and unknown selections update visibility without weakening lock creation',async()=>{
 const f=fixture();try{
  await f.ready();f.access.openLockWizard('synthetic-target');
  await f.choose('password-totp');assert.equal(f.field('PIN').parentElement.hidden,true);assert.equal(f.field('Password').parentElement.hidden,false);
  const wizardCodes=f.wizard.querySelectorAll('md-outlined-text-field').filter(node=>['Authenticator URI','Current code'].includes(node.getAttribute('aria-label')));assert.equal(wizardCodes.length,2);assert.ok(wizardCodes.every(node=>node.parentElement.hidden===false));
  f.wizard.querySelector('md-checkbox').checked=true;f.field('PIN').value='1234';
  for(const invalid of [undefined,'unknown','__proto__']){await f.choose(invalid);assert.equal(f.create.disabled,true);assert.equal(f.field('PIN').parentElement.hidden,true);assert.equal(f.field('Password').parentElement.hidden,true);assert.ok(wizardCodes.every(node=>node.parentElement.hidden));await f.create.click();assert.equal(f.records.size,0);assert.equal(f.messages.at(-1),'Select a valid lock policy.');}
  await f.choose('pin');assert.equal(f.create.disabled,false);await f.create.click();assert.equal(f.records.get('element-lock:synthetic-target').policy,'pin');assert.equal(f.wizard.hidden,true);
 }finally{f.access.destroy();}
});
test('missing selection after readiness closes all factor fields and remains uncreatable',async()=>{
 const f=fixture();try{
  f.policy.value=undefined;await f.ready();assert.equal(f.create.disabled,true);assert.equal(f.field('PIN').parentElement.hidden,true);assert.equal(f.field('Password').parentElement.hidden,true);
  await f.create.click();assert.equal(f.records.size,0);assert.equal(f.messages.at(-1),'Select a valid lock policy.');
 }finally{f.access.destroy();}
});
