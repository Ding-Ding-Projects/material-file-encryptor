import test from 'node:test';
import assert from 'node:assert/strict';
import {IMAGE_PRACTICE,IMAGE_PRACTICE_COPY} from '../src/shared/local-ux/image-practice.js';
import {imagePlacementGuidance,imageTransformTranslator} from '../src/renderer/features/personalization/image-transform-copy.js';
import {IMAGE_TRANSFORM_FIELDS} from '../src/renderer/features/personalization/image-transform-inspector.js';
import {imageGeometry} from '../src/renderer/features/personalization/image-geometry.js';
import {createPracticeSession,assertPracticeCoverage,mountGuidancePlayground} from '../src/shared/surface/guidance-playground.js';
import {createAccessDocument} from './helpers/local-access-dom.js';
const fields=IMAGE_TRANSFORM_FIELDS.map(row=>row[0]);
const ids=[...fields,...fields.map(key=>'clear-'+key),...['contain','cover','stretch'].map(key=>'fit-'+key),...['normal','multiply','screen','overlay','darken','lighten','difference'].map(key=>'blend-'+key),'apply','reset','search','clear-search'];
test('all forty-two placement templates bind translated authored samples and omission fails',()=>{
 assert.equal(ids.length,42);assert.deepEqual(new Set(Object.keys(IMAGE_PRACTICE)),new Set(ids));const rows=ids.map(key=>({id:key,...imagePlacementGuidance(key,key)}));assertPracticeCoverage(ids,rows);assert.throws(()=>assertPracticeCoverage(ids,rows.slice(1)),/mismatch/);
 for(const fixture of Object.values(IMAGE_PRACTICE)){for(const key of ['label','input','action','expected']){assert.ok(IMAGE_PRACTICE_COPY[fixture[key]],fixture.id+': '+key);assert.notEqual(imageTransformTranslator(()=>'yue')(fixture[key]),fixture[key]);}for(const choice of fixture.choices||[])assert.ok(IMAGE_PRACTICE_COPY[choice.label]);}
});
test('sample crop and fit geometry matches production pure geometry across all numeric controls',()=>{
 for(const key of fields){const sample=createPracticeSession(IMAGE_PRACTICE[key]),initial=sample.result;assert.equal(initial.valid,true);for(const value of [IMAGE_PRACTICE[key].initial,IMAGE_PRACTICE[key].min,IMAGE_PRACTICE[key].max]){const result=sample.edit(value);if(!result.valid)continue;const expected=imageGeometry(200,100,100,100,result.image);assert.deepEqual(result.source,expected.source);assert.deepEqual(result.destination,expected.destination);}assert.equal(sample.edit('invalid').valid,false);assert.equal(sample.edit(IMAGE_PRACTICE[key].max+1).valid,false);assert.deepEqual(sample.reset(),initial);}
 const crop=createPracticeSession(IMAGE_PRACTICE.crop0);assert.equal(crop.edit(21).valid,false);assert.equal(crop.edit(20).valid,true);assert.equal(createPracticeSession(IMAGE_PRACTICE.crop2).edit(0).valid,false);
 const focal=createPracticeSession(IMAGE_PRACTICE.focalX);assert.notDeepEqual(focal.edit(0).destination,focal.edit(100).destination);
 for(const fit of ['contain','cover','stretch']){const result=createPracticeSession(IMAGE_PRACTICE['fit-'+fit]).edit(fit);assert.deepEqual(result.destination,imageGeometry(200,100,100,100,result.image).destination);}
});
test('sample apply reset and clear preserve local ownership and permit recovery',()=>{
 const first=createPracticeSession(IMAGE_PRACTICE.apply),second=createPracticeSession(IMAGE_PRACTICE.apply);assert.equal(first.result.accepted,null);assert.deepEqual(first.apply().accepted,first.result.image);assert.equal(second.result.accepted,null);assert.equal(first.reset().accepted,null);
 const reset=createPracticeSession(IMAGE_PRACTICE.reset).apply();assert.equal(reset.explicit,false);assert.equal(reset.image.rotate,0);assert.equal(reset.image.opacity,1);
 for(const key of fields){const sample=createPracticeSession(IMAGE_PRACTICE['clear-'+key]),original=sample.result.image;const result=sample.apply();assert.equal(result.emptyDraft,true);assert.deepEqual(result.image,original);assert.equal(sample.edit(IMAGE_PRACTICE[key].initial).emptyDraft,false);sample.dispose();assert.throws(()=>sample.reset(),/disposed/);}
});
test('real Material inputs and buttons update only locally drawn SVG with reset and disposal',async()=>{
 const doc=createAccessDocument(),prototype=Object.getPrototypeOf(doc.body),previous=Object.getOwnPropertyDescriptor(prototype,'style');Object.defineProperty(prototype,'style',{configurable:true,get(){return this._style||={};}});
 try{const mount=doc.createElement('section');doc.body.append(mount);let sample=mountGuidancePlayground(mount,{fixture:IMAGE_PRACTICE.rotate});const field=mount.querySelector('md-outlined-text-field');field.value='45';await field.dispatchEvent({type:'input'});assert.match(mount.querySelector('g').getAttribute('transform'),/rotate\(45\)/);assert.equal(mount.querySelectorAll('image').length,0);assert.equal(mount.querySelectorAll('rect').length,9);await mount.querySelectorAll('md-text-button').find(row=>row.textContent==='Reset example').click();assert.match(mount.querySelector('g').getAttribute('transform'),/rotate\(0\)/);sample.destroy();assert.equal(field.listeners.get('input').length,0);
 sample=mountGuidancePlayground(mount,{fixture:IMAGE_PRACTICE['blend-multiply']});await mount.querySelectorAll('md-outlined-button').find(row=>row.textContent==='multiply').click();assert.equal(mount.querySelector('g').style.mixBlendMode,'multiply');sample.destroy();
 sample=mountGuidancePlayground(mount,{fixture:IMAGE_PRACTICE['clear-opacity']});await mount.querySelector('md-filled-button').click();const clear=mount.querySelector('md-outlined-text-field');assert.equal(clear.value,'');assert.equal(clear.getAttribute('aria-invalid'),'true');assert.equal(doc.activeElement,clear);clear.value='.5';await clear.dispatchEvent({type:'input'});assert.equal(clear.getAttribute('aria-invalid'),'false');assert.equal(mount.querySelector('g').getAttribute('opacity'),'0.5');sample.destroy();}
 finally{if(previous)Object.defineProperty(prototype,'style',previous);else delete prototype.style;}
});
