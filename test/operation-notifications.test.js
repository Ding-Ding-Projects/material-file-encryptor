import test from 'node:test';
import assert from 'node:assert/strict';
import {operationNotification} from '../src/renderer/operation-notifications.js';
test('operation notifications retain progress and cancellation without source paths',()=>{
 const record={operationId:'synthetic',state:'running',bytesCompleted:25,totalBytes:100,label:'C:/private/source',error:'private detail'};
 const value=operationNotification(record);assert.equal(value.progress.value,25);assert.equal(value.recovery[1].id,'cancel-operation:synthetic');assert.ok(!JSON.stringify(value).includes('private'));
 assert.equal(operationNotification({...record,state:'completed'}),null);assert.equal(operationNotification({...record,state:'completed'},{known:true}).recovery.length,1);
 assert.equal(operationNotification({...record,state:'cancelled'},{known:true}).message,'Unfinished work was cancelled. Completed files were retained.');
});
test('invalid operation state cannot create a persistent notice',()=>{
 assert.equal(operationNotification({operationId:'synthetic',state:'arbitrary'}),null);assert.equal(operationNotification({operationId:'x'.repeat(101),state:'running'}),null);
});
