import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {COPY,createTranslator,MESSAGE_STYLES,SETTING_LABELS} from '../src/shared/local-ux/language.js';
import {DEFAULTS} from '../src/shared/local-ux/store.js';

test('every registered label and setting has a real Cantonese path',()=>{
 const state=structuredClone(DEFAULTS);state.language='yue';const t=createTranslator(()=>state);
 for(const [source,translated]of Object.entries(COPY)){
  assert.equal(t(source),translated,source);
  if(!['HTTPS API','Home Assistant'].includes(source)&&/[a-zA-Z]/.test(source.replace(/\{[^}]+\}/g,'')))assert.match(translated,/[\u3400-\u9fff]/u,source);
 }
 for(const label of Object.values(SETTING_LABELS))assert.ok(t.has(label),label);
});
test('all five independent message levels preserve interpolated facts',()=>{
 const state=structuredClone(DEFAULTS),t=createTranslator(()=>state,{dictionary:{'Remove {count} records from {path}.':'由 {path} 移除 {count} 項記錄。'}});
 const values={count:17,path:'/synthetic/input.txt'};
 for(const language of ['en','yue','bilingual']){
  state.language=language;
  for(let english=1;english<=5;english++)for(let cantonese=1;cantonese<=5;cantonese++){
   state.funnyEnglish=english;state.funnyCantonese=cantonese;
   const text=t.format('Remove {count} records from {path}.',values,{message:true});
   assert.ok(text.includes('17'));assert.ok(text.includes(values.path));assert.equal(text.includes('{count}'),false);
   if(language!=='yue')assert.ok(text.includes(MESSAGE_STYLES.en[english]));
   if(language!=='en')assert.ok(text.includes(MESSAGE_STYLES.yue[cantonese]));
  }
 }
 assert.equal(new Set(MESSAGE_STYLES.en.slice(1)).size,5);assert.equal(new Set(MESSAGE_STYLES.yue.slice(1)).size,5);
});
test('school mode overrides explicit narration language and private replacements',()=>{
 const state=structuredClone(DEFAULTS);state.school.enabled=true;state.language='yue';const t=createTranslator(()=>state,{vocabulary:{isAuthenticated:()=>true,replace:()=> 'changed'}});
 assert.equal(t('Appearance',{message:true,language:'yue'}),'Appearance');
 assert.equal(t.format('Current voice: {voice}.',{voice:'Voice 123'},{message:true,language:'yue'}),'Current voice: Voice 123.');
});
test('known shared validation messages have complete translation inventory',async()=>{
 for(const path of ['src/shared/local-ux/store.js','src/shared/local-ux/schedules.js','src/shared/local-ux/history.js','src/renderer/features/personalization/history.js','src/renderer/features/personalization/index.js']){
  const source=await readFile(new URL(`../${path}`,import.meta.url),'utf8');
  for(const [,message]of source.matchAll(/(?:new )?Error\('([^']+)'\)/g))assert.ok(Object.hasOwn(COPY,message),`${path}: ${message}`);
 }
});
