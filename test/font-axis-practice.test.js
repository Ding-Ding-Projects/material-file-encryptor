import test from 'node:test';
import assert from 'node:assert/strict';
import {BUNDLED_FONT_MANIFEST} from '../src/shared/fonts/manifest.js';
import {FONT_AXIS_PRACTICE,FONT_AXIS_PRACTICE_COPY} from '../src/shared/local-ux/font-axis-practice.js';
import {fontGuidanceDescriptor} from '../src/renderer/features/personalization/font-guidance.js';
import {createPracticeSession,mountGuidancePlayground} from '../src/shared/surface/guidance-playground.js';
import {createAccessDocument} from './helpers/local-access-dom.js';
test('every bundled axis tag has an authored sample with exact sample-face bounds and unknown axes stay unavailable',()=>{
 const faces=BUNDLED_FONT_MANIFEST.assets.filter(row=>row.face).map(row=>row.face),tags=new Set(faces.flatMap(face=>face.axes.map(axis=>axis.tag)));assert.deepEqual(tags,new Set(['wght','wdth','CTGR']));const face=faces.find(row=>row.cssFamily==='MFE Noto Sans Regular');for(const axis of face.axes){const fixture=fontGuidanceDescriptor('axis',{label:axis.name,axis}).practice;assert.equal(fixture,FONT_AXIS_PRACTICE[axis.tag]);assert.equal(fixture.min,axis.min);assert.equal(fixture.max,axis.max);assert.equal(fixture.initial,axis.default);assert.equal(fixture.family,face.cssFamily);assert.equal(createPracticeSession(fixture).edit(axis.max+1).valid,false);}assert.equal(fontGuidanceDescriptor('axis',{label:'Unknown',axis:{tag:'ZZZZ',min:0,max:1,default:0}}).practice,null);
 for(const fixture of Object.values(FONT_AXIS_PRACTICE))for(const key of ['label','input','action','expected'])assert.ok(FONT_AXIS_PRACTICE_COPY[fixture[key]],fixture.id+': '+key);
});
test('sample axis Apply validates all axes together and Reset restores defaults independently',()=>{
 const sample=createPracticeSession(FONT_AXIS_PRACTICE.apply),other=createPracticeSession(FONT_AXIS_PRACTICE.apply);sample.edit({wght:700,wdth:101,CTGR:50});assert.equal(sample.apply().valid,false);assert.equal(sample.state.applied,false);sample.edit({wght:700,wdth:75,CTGR:50});assert.deepEqual(sample.apply().record.axes,{wght:700,wdth:75,CTGR:50});assert.deepEqual(other.result.record.axes,{wght:400,wdth:100,CTGR:0});assert.deepEqual(sample.reset().record.axes,{wght:400,wdth:100,CTGR:0});assert.deepEqual(createPracticeSession(FONT_AXIS_PRACTICE.reset).apply().record.axes,{wght:400,wdth:100,CTGR:0});
});
test('Material numeric axis control changes only the authored local variation request and discloses rendering limits',async()=>{
 const doc=createAccessDocument(),prototype=Object.getPrototypeOf(doc.body),previous=Object.getOwnPropertyDescriptor(prototype,'style');Object.defineProperty(prototype,'style',{configurable:true,get(){return this._style||={};}});
 try{for(const tag of ['wght','wdth','CTGR']){const mount=doc.createElement('section');doc.body.append(mount);const fixture=FONT_AXIS_PRACTICE[tag],sample=mountGuidancePlayground(mount,{fixture}),field=mount.querySelector('md-outlined-text-field');field.value=String(fixture.min);await field.dispatchEvent({type:'input'});const preview=mount.querySelector('[data-practice-preview]');assert.equal(preview.style.fontVariationSettings,'"'+tag+'" '+fixture.min);assert.ok(preview.style.fontFamily.includes('MFE Noto Sans Regular'));assert.ok(mount.querySelector('[role="status"]').textContent.includes('does not load a font'));await mount.querySelectorAll('md-text-button').find(row=>row.textContent==='Reset example').click();assert.equal(preview.style.fontVariationSettings,'"'+tag+'" '+fixture.initial);sample.destroy();assert.equal(field.listeners.get('input').length,0);}}
 finally{if(previous)Object.defineProperty(prototype,'style',previous);else delete prototype.style;}
});
