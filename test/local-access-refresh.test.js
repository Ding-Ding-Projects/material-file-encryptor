import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessDocument} from './helpers/local-access-dom.js';
import {mountAccess} from '../src/renderer/features/access/index.js';
import {createTranslator} from '../src/shared/local-ux/language.js';
import {DEFAULTS} from '../src/shared/local-ux/store.js';

test('access refresh rerenders composite labels without clearing input or profile session',async()=>{
 const document=createAccessDocument(),container=document.createElement('main');document.body.append(container);
 const settings=structuredClone(DEFAULTS),translate=createTranslator(()=>settings),records=new Map();
 const access=mountAccess(container,{translate,schoolMode:()=>settings.school.enabled,storage:{getItem:()=>null,setItem:()=>{}},credentialStore:{get:async key=>records.get(key),set:async(key,value)=>records.set(key,value),delete:async key=>records.delete(key)}});
 try{
  const profile=container.querySelectorAll('fieldset')[0],profileInput=profile.querySelector('input');profileInput.value='synthetic profile sample';
  await profile.querySelectorAll('button').find(button=>button.textContent==='Set up local profile').click();assert.equal(access.authenticated,true);
  profileInput.value='keep this input';await access.controller.set('stable-target','password',{password:'synthetic lock sample'});access.openUnlock('stable-target');
  const prompt=container.querySelector('form'),input=prompt.querySelector('input');input.value='keep this unlock input';
  for(const [language,clearLabel,promptName]of [['en','Clear Password','Unlock stable-target'],['yue','清除 密碼','解鎖 stable-target'],['bilingual','Clear · 清除 Password · 密碼','Unlock · 解鎖 stable-target']]){
   settings.language=language;access.refresh();
   assert.equal(prompt.getAttribute('aria-label'),promptName);
   assert.ok(prompt.querySelectorAll('button').some(button=>button.textContent===clearLabel),`${language}: ${prompt.textContent}`);
   assert.equal(input.value,'keep this unlock input');assert.equal(profileInput.value,'keep this input');assert.equal(access.authenticated,true);
  }
 }finally{access.destroy();}
});
