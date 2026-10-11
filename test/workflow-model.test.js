import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDocument,canConfirm,downloadProgress,WORKFLOW_FIELDS} from '../src/shared/surface/workflow-model.js';
test('document validation counts UTF-8 bytes and rejects path names',()=>{
 assert.deepEqual(validateDocument({name:'notes.md',text:'hello'}),{name:'notes.md',text:'hello'});
 assert.throws(()=>validateDocument({name:'../notes',text:''}));assert.throws(()=>validateDocument({name:'notes',text:'字'.repeat(100000)}));
});
test('confirmation needs independently enabled keys and the full slider',()=>{
 for(const state of [{firstKey:false,secondKey:false,amount:100},{firstKey:true,secondKey:false,amount:100},{firstKey:true,secondKey:true,amount:99}])assert.equal(canConfirm(state),false);
 assert.equal(canConfirm({firstKey:true,secondKey:true,amount:100}),true);
});
test('download progress stays unknown without truthful totals',()=>{
 assert.equal(downloadProgress({received:50}).value,null);assert.equal(downloadProgress({received:50,total:100}).value,.5);
});
test('workflow field inventory is explicit',()=>{
 assert.deepEqual(WORKFLOW_FIELDS,['document-filter','document-name','document-content','editor-choice','download-destination','forge-account','forge-owner','forge-route']);
});
