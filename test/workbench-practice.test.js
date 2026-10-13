import test from 'node:test';
import assert from 'node:assert/strict';
import {WORKBENCH_PRACTICE,WORKBENCH_PRACTICE_COPY} from '../src/shared/local-ux/workbench-practice.js';
import {WORKBENCH_GUIDANCE,workbenchDescriptor} from '../src/renderer/features/personalization/workbench-guidance.js';
import {createPracticeSession,assertPracticeCoverage,mountGuidancePlayground} from '../src/shared/surface/guidance-playground.js';
import {createAccessDocument} from './helpers/local-access-dom.js';
const keys=['drawing','apply','clear','guide-x','guide-y','guide-edit','guide-remove','tool-search','tool-search-clear','preview-search','preview-search-clear','preview'];
test('twelve workbench descriptors bind specific translated fixtures and missing coverage fails',()=>{
 assert.deepEqual(new Set(WORKBENCH_GUIDANCE.map(row=>row.key)),new Set(keys));assert.deepEqual(new Set(Object.keys(WORKBENCH_PRACTICE)),new Set(keys));
 const descriptors=keys.map(key=>workbenchDescriptor(key,'sample')),ids=descriptors.map(row=>row.id);assertPracticeCoverage(ids,descriptors);assert.throws(()=>assertPracticeCoverage(ids,descriptors.slice(1)),/mismatch/);
 for(const row of descriptors){assert.equal(row.practice,WORKBENCH_PRACTICE[row.concept]);for(const key of ['label','input','action','expected'])assert.ok(WORKBENCH_PRACTICE_COPY[row.practice[key]],row.id+': '+key);}
});
test('polygon exercises reject collinear and out-of-bounds points and preserve saved geometry',()=>{
 const sample=createPracticeSession(WORKBENCH_PRACTICE.drawing),other=createPracticeSession(WORKBENCH_PRACTICE.drawing);sample.edit({x:50,y:20});assert.equal(sample.apply().valid,false);assert.equal(sample.state.applied,false);sample.edit({x:101,y:80});assert.equal(sample.apply().valid,false);sample.edit({x:50,y:80});assert.equal(sample.apply().record.area,1800);assert.equal(other.result.record.points.length,2);assert.equal(sample.reset().record.points.length,2);
 const applied=createPracticeSession(WORKBENCH_PRACTICE.apply).apply().record;assert.deepEqual(applied.saved,applied.points);const cleared=createPracticeSession(WORKBENCH_PRACTICE.clear).apply().record;assert.deepEqual(cleared.points,[]);assert.deepEqual(cleared.saved,WORKBENCH_PRACTICE.clear.record.saved);sample.dispose();assert.throws(()=>sample.reset(),/disposed/);
});
test('guide actions alter only the indicated guide and scoped searches clear locally',()=>{
 for(const key of ['guide-x','guide-y','guide-edit','guide-remove']){const sample=createPracticeSession(WORKBENCH_PRACTICE[key]),result=sample.apply();assert.deepEqual(result.record.points,WORKBENCH_PRACTICE[key].record.points);if(key==='guide-edit'){assert.equal(result.record.guides[0].id,'sample-x');assert.equal(result.record.guides[0].position,33.3);}if(key==='guide-remove')assert.deepEqual(result.record.guides.map(row=>row.id),['sample-y']);assert.deepEqual(sample.reset().record,WORKBENCH_PRACTICE[key].record);}
 for(const key of ['tool-search','preview-search']){const fixture=WORKBENCH_PRACTICE[key],sample=createPracticeSession(fixture);assert.equal(sample.edit('nonexistent').text,'No matching sample rows.');assert.equal(sample.edit('').text,fixture.rows.join(' · '));const clear=createPracticeSession(WORKBENCH_PRACTICE[key+'-clear']);assert.ok(clear.result.record.visibleRows.length<fixture.rows.length);assert.deepEqual(clear.apply().record.visibleRows,fixture.rows);assert.equal(clear.reset().record.value,fixture.initial);}
});
test('Material sample fields update observable local SVG geometry and reset its lifecycle',async()=>{
 const doc=createAccessDocument(),prototype=Object.getPrototypeOf(doc.body),previous=Object.getOwnPropertyDescriptor(prototype,'style');Object.defineProperty(prototype,'style',{configurable:true,get(){return this._style||={};}});
 try{const mount=doc.createElement('section');doc.body.append(mount);const sample=mountGuidancePlayground(mount,{fixture:WORKBENCH_PRACTICE.drawing});assert.equal(mount.querySelectorAll('md-outlined-text-field').length,2);assert.equal(mount.querySelector('polygon').getAttribute('points'),'20,20 80,20');await mount.querySelector('md-filled-button').click();assert.equal(mount.querySelector('polygon').getAttribute('points'),'20,20 80,20 50,80');await mount.querySelectorAll('md-text-button').find(row=>row.textContent==='Reset example').click();assert.equal(mount.querySelector('polygon').getAttribute('points'),'20,20 80,20');sample.destroy();const next=mountGuidancePlayground(mount,{fixture:WORKBENCH_PRACTICE['guide-x']});await mount.querySelector('md-filled-button').click();assert.equal(mount.querySelector('line').getAttribute('x1'),'50');assert.equal(mount.querySelector('line').getAttribute('y2'),'100');next.destroy();}
 finally{if(previous)Object.defineProperty(prototype,'style',previous);else delete prototype.style;}
});
