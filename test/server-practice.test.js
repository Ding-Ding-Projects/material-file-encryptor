import test from 'node:test';
import assert from 'node:assert/strict';
import {SERVER_PRACTICE,SERVER_PRACTICE_COPY} from '../src/shared/local-ux/server-preparation-practice.js';
import {createPracticeSession,assertPracticeCoverage} from '../src/shared/surface/guidance-playground.js';
import {PREPARATION_GUIDANCE,preparationTranslator} from '../src/renderer/features/server-manager/copy.js';
const expected=['runtimeCheck','runtimePrepare','runtimeCancel','refresh','page','choose','prepare','cancel','license','search','clear'];
test('all eleven server preparation concepts have translated authored practice and omissions fail',()=>{
 assert.deepEqual(PREPARATION_GUIDANCE.map(row=>row.key),expected);assert.deepEqual(Object.keys(SERVER_PRACTICE),expected);const rows=expected.map(key=>({id:'server-preparation:'+key,practice:SERVER_PRACTICE[key]})),ids=rows.map(row=>row.id);assertPracticeCoverage(ids,rows);assert.throws(()=>assertPracticeCoverage(ids,rows.slice(1)),/mismatch/);
 for(const fixture of Object.values(SERVER_PRACTICE))for(const key of ['label','input','action','expected']){assert.ok(SERVER_PRACTICE_COPY[fixture[key]],fixture.id+': '+key);assert.notEqual(preparationTranslator(()=> 'yue')(fixture[key]),fixture[key]);}
});
test('runtime matching and synthetic preparation preserve no-execution and consent boundaries',()=>{
 const runtime=createPracticeSession(SERVER_PRACTICE.runtimeCheck);runtime.edit({major:'17'});assert.equal(runtime.apply().record.match,false);runtime.edit({major:'21'});assert.equal(runtime.apply().record.match,true);assert.equal(runtime.result.record.executed,false);
 for(const key of ['runtimePrepare','prepare']){const sample=createPracticeSession(SERVER_PRACTICE[key]);assert.equal(sample.apply().valid,false);sample.edit({confirm:true,matchingDigest:false});assert.equal(sample.apply().valid,false);assert.equal(sample.state.applied,false);sample.edit({confirm:true,matchingDigest:true});const result=sample.apply();assert.equal(result.record.state,'prepared-example');assert.notEqual(result.record.executed,true);assert.notEqual(result.record.eula,true);assert.notEqual(result.record.started,true);assert.deepEqual(sample.reset().record,SERVER_PRACTICE[key].record);}
 const license=createPracticeSession(SERVER_PRACTICE.license).apply().record;assert.equal(license.reviewed,true);assert.equal(license.eula,false);assert.equal(license.started,false);
});
test('sample catalogue pagination checks its cursor and keeps historical entries',()=>{
 const page=createPracticeSession(SERVER_PRACTICE.page);page.edit({cursor:'stale'});assert.equal(page.apply().valid,false);assert.equal(page.result.record.loaded.length,2);page.edit({cursor:'current'});assert.equal(page.apply().record.loaded.length,3);assert.equal(page.result.record.loaded[2].id,'sample-archive');
 const refresh=createPracticeSession(SERVER_PRACTICE.refresh).apply().record;assert.equal(refresh.selected,null);assert.equal(refresh.catalogId,'sample-current');
 const choose=createPracticeSession(SERVER_PRACTICE.choose);choose.edit({version:'sample-archive'});assert.equal(choose.apply().record.selected.hasServer,false);assert.equal(choose.result.record.filesPrepared,false);
});
test('sample cancellation cannot rewrite a completed phase and concurrent previews reset separately',()=>{
 for(const key of ['runtimeCancel','cancel']){const sample=createPracticeSession(SERVER_PRACTICE[key]),other=createPracticeSession(SERVER_PRACTICE[key]);sample.edit({phase:'completed'});assert.equal(sample.apply().valid,false);sample.reset();assert.equal(sample.apply().record.canceled,true);assert.equal(sample.result.record.recoveryRequired,true);assert.equal(sample.result.record.retainedStaging,true);assert.equal(other.result.record.canceled,false);sample.dispose();assert.throws(()=>sample.reset(),/disposed/);}
 const search=createPracticeSession(SERVER_PRACTICE.search);assert.equal(search.edit('archive').text,'sample-archive');const clear=createPracticeSession(SERVER_PRACTICE.clear);assert.equal(clear.apply().record.value,'');assert.equal(clear.reset().record.value,'release');
});
