import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {historyRestoreObservation,historyRestoreSelector,assertHistoryRestoreObservation,inspectHistoryRestore,retainRestoreActionFailure} from '../scripts/preview-runtime-fixture.mjs';
function observe(ids,{request='2',completedRequest=request,render='4',rendered=render,state='ready',ariaBusy='false',disabled=false,hidden=false}={}) {
 const surface={dataset:{archiveRequest:request,archiveCompletedRequest:completedRequest,archiveRender:render,archiveRendered:rendered,archiveState:state},getAttribute:()=>ariaBusy};
 const controls=ids.map(id=>({dataset:{versionId:id},disabled,getBoundingClientRect:()=>({width:hidden?0:100,height:30})}));
 return vm.runInNewContext('('+historyRestoreObservation.toString()+')', {document:{querySelector:()=>surface,querySelectorAll:()=>controls},getComputedStyle:()=>({visibility:'visible',display:'block'})})('saved');
}
test('restore selects the exact rendered identity despite reordered backend positions',()=>{
 const backend=[{id:'new'},{id:'saved'}];assert.equal(backend.findIndex(row=>row.id==='saved'),1);
 const value=observe(['saved']);assert.equal(value.count,1);assertHistoryRestoreObservation(value);
 assert.equal(historyRestoreSelector('saved'),'#history-list [data-archive-restore][data-version-id="saved"]');
 assertHistoryRestoreObservation(observe(['new','saved']));
});
test('stale absent duplicate hidden and disabled targets fail before restore',()=>{
 for(const value of [observe(['other']),observe(['saved','saved']),observe(['saved'],{completedRequest:'1'}),observe(['saved'],{rendered:'3'}),observe(['saved'],{state:'loading'}),observe(['saved'],{ariaBusy:'true'}),observe(['saved'],{request:undefined,completedRequest:''}),observe(['saved'],{disabled:true}),observe(['saved'],{hidden:true})]) assert.throws(()=>assertHistoryRestoreObservation(value));
});
test('restore observations stay bounded and selector encoding preserves identity',()=>{
 const value=observe(Array(20).fill('saved'));assert.equal(value.count,20);assert.equal(value.controls.length,2);
 assert.ok(historyRestoreSelector('a"b').includes('a\\"b'));
 for(const id of ['',null,'x'.repeat(513),'a\0b'])assert.throws(()=>historyRestoreSelector(id));
});
test('failed and successful identity observations are retained before the verdict',async()=>{
 for(const ids of [['other'],['saved']]) {
  const records=[];const operation=inspectHistoryRestore({versionId:'saved',observe:async()=>observe(ids),record:async value=>records.push(value)});
  if(ids[0]==='other')await assert.rejects(operation,/one rendered restore control/);else await operation;
  assert.equal(records.length,1);assert.equal(records[0].versionId,'saved');assert.equal(records[0].count,ids[0]==='other'?0:1);
 }
 const records=[];await assert.rejects(inspectHistoryRestore({versionId:'different',observe:async()=>observe(['saved']),record:async value=>records.push(value)}),/identity changed/);assert.equal(records.length,1);
});
test('renderer publishes version identity without changing the restore action',async()=>{
 const renderer=await fs.readFile(new URL('../src/renderer/app.js',import.meta.url),'utf8');
 assert.match(renderer,/restore\.dataset\.versionId=version\.id/);assert.match(renderer,/api\.restoreVersion\(version\.id\)/);
});

test('combined action observation and diagnostic-write failures retain the original exception',async()=>{
 for(const writeCode of ['EACCES','ENOSPC']) {
  const original=Object.assign(new Error('Original selector failure'),{helperCode:'SELECTOR_ACTION_FAILED'});let saved;let writes=0;let queries=0;
  await assert.rejects(retainRestoreActionFailure(original,{observe:async()=>{queries++;throw Object.assign(new Error('Query rejected'),{helperCode:'UNPROVEN_PROCESS_ANCESTRY'});},record:async value=>{writes++;saved=value;throw Object.assign(new Error('Write failed'),{code:writeCode});}}),error=>error===original&&error.helperCode==='SELECTOR_ACTION_FAILED');
  assert.equal(queries,1);assert.equal(writes,1);assert.equal(Object.hasOwn(saved,'observation'),false);
  assert.deepEqual(saved.queryFault,{code:'UNPROVEN_PROCESS_ANCESTRY'});assert.deepEqual(original.restoreObservationFault,saved.queryFault);assert.deepEqual(original.restoreDiagnosticSaveFault,{code:writeCode});
 }
 const original=new Error('Action failed');let saved;
 await assert.rejects(retainRestoreActionFailure(original,{observe:async()=>observe(['saved']),record:async value=>{saved=value;}}),error=>error===original);
 assert.equal(saved.observation.count,1);assert.equal(Object.hasOwn(saved,'queryFault'),false);assert.equal(Object.hasOwn(original,'restoreDiagnosticSaveFault'),false);
});
