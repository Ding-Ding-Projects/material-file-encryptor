import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {TYPOGRAPHY_PRACTICE,TYPOGRAPHY_PRACTICE_COPY,typographyPractice} from '../src/shared/local-ux/typography-practice.js';
import {parseTypographySample} from '../src/shared/local-ux/typography-practice-evaluator.js';
import {TYPOGRAPHY_FIELDS,validateTypographyValue} from '../src/renderer/features/personalization/typography-inspector.js';
import {createPracticeSession,mountGuidancePlayground,assertPracticeCoverage} from '../src/shared/surface/guidance-playground.js';
import {createAccessDocument} from './helpers/local-access-dom.js';
const ids=[...TYPOGRAPHY_FIELDS.flatMap(row=>[row[0],row[0]+':clear',row[0]+':reset']),...['400','700'].map(value=>'fontWeight:choose:'+value),...['baseline','super','sub'].map(value=>'verticalAlign:choose:'+value),'fontSize:step:-1','fontSize:step:1','search'];
test('sixty-two typography field and helper templates have exact authored coverage',async()=>{
 assert.equal(ids.length,62);assert.deepEqual(new Set(Object.keys(TYPOGRAPHY_PRACTICE)),new Set(ids));const rows=ids.map(id=>({id,practice:TYPOGRAPHY_PRACTICE[id]}));assertPracticeCoverage(ids,rows);assert.throws(()=>assertPracticeCoverage(ids,rows.slice(1)),/mismatch/);
 for(const fixture of Object.values(TYPOGRAPHY_PRACTICE))for(const key of ['label','input','action','expected'])assert.ok(TYPOGRAPHY_PRACTICE_COPY[fixture[key]],fixture.id+': '+key);
 const source=await fs.readFile(new URL('../src/renderer/features/personalization/typography-inspector.js',import.meta.url),'utf8');for(const call of ["typographyPractice(key)","typographyPractice(key,'clear')","typographyPractice(key,'reset')","typographyPractice(key,'choose',value)","typographyPractice(key,'step',delta)","typographyPractice('search')"])assert.ok(source.includes(call),call);
});
test('authored typography parsers match original typed acceptance and reject executable or unbounded input',()=>{
 const candidates=['','24px','-1px','33em','2rem','700','1001','italic','super','#ff000080','1px #202020','0px 0px 8px #6750a4','none','url(https://example.invalid)','calc(100px)','1e99','Infinity'];
 for(const row of TYPOGRAPHY_FIELDS){const fixture=typographyPractice(row[0]);for(const value of [row[4],...candidates,...(row[3]==='choice'?row[5]:[])]){let expected,actual,originalError=false,sampleError=false;try{expected=validateTypographyValue(row,value);}catch{originalError=true;}try{actual=parseTypographySample(fixture,value);}catch{sampleError=true;}assert.equal(sampleError,originalError,row[0]+': '+value);if(!originalError)assert.equal(actual,expected,row[0]+': '+value);}}
});
test('clear reset preset and repeated size steps affect isolated state and recover from invalid bounds',()=>{
 for(const row of TYPOGRAPHY_FIELDS){const clear=createPracticeSession(typographyPractice(row[0],'clear'));assert.equal(clear.apply().emptyDraft,true);assert.equal(clear.edit(row[4]).emptyDraft,false);const reset=createPracticeSession(typographyPractice(row[0],'reset'));assert.equal(reset.apply().style[row[0]],validateTypographyValue(row,row[4]));assert.equal(reset.reset().style[row[0]],validateTypographyValue(row,typographyPractice(row[0],'reset').initial));}
 const bold=createPracticeSession(typographyPractice('fontWeight','choose','700'));assert.equal(bold.apply().style.fontWeight,'700');assert.equal(bold.reset().style.fontWeight,'400');
 const step=createPracticeSession(typographyPractice('fontSize','step',1)),other=createPracticeSession(typographyPractice('fontSize','step',1));assert.equal(step.apply().style.fontSize,'17px');assert.equal(step.apply().style.fontSize,'18px');assert.equal(other.result.style.fontSize,'16px');step.edit('2rem');assert.equal(step.apply().style.fontSize,'2.1rem');step.edit('32rem');assert.equal(step.apply().valid,false);assert.equal(step.reset().style.fontSize,'16px');step.dispose();assert.throws(()=>step.apply(),/disposed/);
});
test('Material selector and fields change local typography styles and reset without touching original text',async()=>{
 const doc=createAccessDocument(),prototype=Object.getPrototypeOf(doc.body),previous=Object.getOwnPropertyDescriptor(prototype,'style');Object.defineProperty(prototype,'style',{configurable:true,get(){return this._style||={};}});
 try{const mount=doc.createElement('section');doc.body.append(mount);let sample=mountGuidancePlayground(mount,{fixture:typographyPractice('fontStyle')}),select=mount.querySelector('md-outlined-select');assert.equal(select.menuPositioning,'absolute');select.value='italic';await select.dispatchEvent({type:'change'});let text=mount.querySelectorAll('span').find(row=>row.textContent==='Sample label');assert.equal(text.style.fontStyle,'italic');assert.equal(text.textContent,'Sample label');sample.destroy();
 sample=mountGuidancePlayground(mount,{fixture:typographyPractice('fontSize','step',1)});await mount.querySelectorAll('md-text-button').find(row=>row.textContent==='Apply to sample').click();assert.equal(mount.querySelector('md-outlined-text-field').value,'17px');text=mount.querySelectorAll('span').find(row=>row.textContent==='Sample label');assert.equal(text.style.fontSize,'17px');await mount.querySelectorAll('md-text-button').find(row=>row.textContent==='Reset example').click();assert.equal(mount.querySelector('md-outlined-text-field').value,'16px');sample.destroy();
 sample=mountGuidancePlayground(mount,{fixture:typographyPractice('color','clear')});await mount.querySelectorAll('md-text-button').find(row=>row.textContent==='Clear sample input').click();const field=mount.querySelector('md-outlined-text-field');assert.equal(field.getAttribute('aria-invalid'),'true');field.value='#112233';await field.dispatchEvent({type:'input'});assert.equal(field.getAttribute('aria-invalid'),'false');sample.destroy();assert.equal(field.listeners.get('input').length,0);}
 finally{if(previous)Object.defineProperty(prototype,'style',previous);else delete prototype.style;}
});
