import test from 'node:test';
import assert from 'node:assert/strict';
import {KEYFRAME_PRACTICE,TRANSITION_PRACTICE,FRAME_PRACTICE_COPY} from '../src/shared/local-ux/frame-practice.js';
import {createPracticeSession,assertPracticeCoverage,mountGuidancePlayground} from '../src/shared/surface/guidance-playground.js';
import {KEYFRAME_CONCEPTS,keyframeDescriptor} from '../src/renderer/features/personalization/motion-keyframe-inspector.js';
import {TRANSITION_CONCEPTS,transitionDescriptor} from '../src/renderer/features/personalization/transition-property-inspector.js';
import {createAccessDocument} from './helpers/local-access-dom.js';

const frames=['select','multi','mode','time','value','unit','apply','easing','composition','hold','add','copy','paste','remove','move','reorder','later','reset','clear'];
const transitions=['migrate','expand','select','property','add','remove','earlier','later','from','to','number','unit','apply','clear','behavior','reset'];
test('all 19 frame and 16 transition descriptors bind explicit examples, with missing and added IDs rejected',()=>{
 assert.deepEqual(Object.keys(KEYFRAME_CONCEPTS),frames);assert.deepEqual(Object.keys(TRANSITION_CONCEPTS),transitions);
 for(const[keys,catalog,factory]of [[frames,KEYFRAME_PRACTICE,keyframeDescriptor],[transitions,TRANSITION_PRACTICE,transitionDescriptor]]){
  assert.deepEqual(Object.keys(catalog),keys);const rows=keys.map(key=>factory(key,'sample-owner')),ids=rows.map(row=>row.id);assertPracticeCoverage(ids,rows);
  assert.throws(()=>assertPracticeCoverage(ids,rows.slice(1)),/mismatch/);assert.throws(()=>assertPracticeCoverage([...ids,'unregistered'],rows),/mismatch/);
  for(const fixture of Object.values(catalog)){for(const key of ['label','input','action','expected'])assert.match(FRAME_PRACTICE_COPY[fixture[key]],/[\u3400-\u9fff]/,fixture.id+': '+key);}
 }
});
test('every authored frame and transition action produces its particular record change and resets independently',()=>{
 for(const fixture of [...Object.values(KEYFRAME_PRACTICE),...Object.values(TRANSITION_PRACTICE)]){
  const sample=createPracticeSession(fixture),other=createPracticeSession(fixture);if(fixture.confirmation){assert.equal(sample.apply().valid,false);sample.edit({...sample.state.value,confirm:true});}
  const result=sample.apply();assert.equal(result.valid,true,fixture.id);assert.notDeepEqual(result.record,fixture.record,fixture.id);assert.deepEqual(other.result.record,fixture.record);assert.deepEqual(sample.reset().record,fixture.record);sample.dispose();other.dispose();
 }
});
test('frame timing, easing and composition calculations are bounded and preserve unaffected metadata',()=>{
 const time=createPracticeSession(KEYFRAME_PRACTICE.time);assert.equal(time.apply().record.resolvedTime,150);
 const easing=createPracticeSession(KEYFRAME_PRACTICE.easing);assert.equal(easing.apply().record.sampleMidpoint,0.315357);
 const moved=createPracticeSession(KEYFRAME_PRACTICE.move);moved.edit({delta:0.5});assert.equal(moved.apply().valid,false);assert.deepEqual(moved.result.record,KEYFRAME_PRACTICE.move.record);moved.edit({delta:0.1});assert.deepEqual(moved.apply().record.frames.map(row=>row.offset),[0.3,0.7]);
 const mode=createPracticeSession(KEYFRAME_PRACTICE.mode).apply().record.frames[0];assert.equal(mode.time,0);assert.equal(Object.hasOwn(mode,'offset'),false);assert.equal(mode.metadata,'retained');
 const reset=createPracticeSession(KEYFRAME_PRACTICE.reset).apply().record.frames[0];assert.equal(reset.value,'computed');assert.equal(reset.metadata,'retained');
 assert.equal(createPracticeSession(KEYFRAME_PRACTICE.hold).apply().record.sampleMidpoint,0.2);assert.equal(createPracticeSession(KEYFRAME_PRACTICE.composition).apply().record.composedSample,15);
 const copied=createPracticeSession(KEYFRAME_PRACTICE.copy).apply().record;assert.deepEqual(copied.copiedFrames,copied.frames);
});
test('transition previews preserve other endpoints and distinguish unavailable discrete playback',()=>{
 const start=createPracticeSession(TRANSITION_PRACTICE.from).apply().record;assert.equal(start.rows[0].from,0.25);assert.equal(start.rows[0].to,1);assert.deepEqual(start.rows[1],TRANSITION_PRACTICE.from.record.rows[1]);
 const applied=createPracticeSession(TRANSITION_PRACTICE.apply).apply().record;assert.equal(applied.rows[1].to,'32px');assert.equal(applied.rows[1].from,'16px');
 const expanded=createPracticeSession(TRANSITION_PRACTICE.expand).apply().record;assert.equal(expanded.version,2);assert.deepEqual(expanded.rows.map(row=>row.property),['opacity','font-size']);assert.ok(expanded.rows.every(row=>row.from==='computed'&&row.to==='computed'));
 const behavior=createPracticeSession(TRANSITION_PRACTICE.behavior).apply().record;assert.equal(behavior.rows[0].behavior,'allow-discrete');assert.equal(behavior.rendererPreview,'unavailable');
});
test('mounted frame samples use Material controls, local results and fresh state after disposal',async()=>{
 const doc=createAccessDocument(),prototype=Object.getPrototypeOf(doc.body),previous=Object.getOwnPropertyDescriptor(prototype,'style');Object.defineProperty(prototype,'style',{configurable:true,get(){return this._style||={};}});
 try{const mount=doc.createElement('section');doc.body.append(mount);const first=mountGuidancePlayground(mount,{fixture:KEYFRAME_PRACTICE.move}),field=mount.querySelector('md-outlined-text-field');field.value='0.2';await field.dispatchEvent({type:'input'});await mount.querySelector('md-filled-button').click();assert.deepEqual(first.session.result.record.frames.map(row=>row.offset),[0.4,0.8]);first.destroy();assert.equal(field.listeners.get('input').length,0);const second=mountGuidancePlayground(mount,{fixture:KEYFRAME_PRACTICE.move});assert.deepEqual(second.session.result.record.frames.map(row=>row.offset),[0.2,0.6]);second.destroy();}finally{if(previous)Object.defineProperty(prototype,'style',previous);else delete prototype.style;}
});
