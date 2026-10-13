import test from 'node:test';
import assert from 'node:assert/strict';
import {closeWithExitProof} from '../scripts/renderer-close-response.mjs';
import {requireClosureProof} from '../scripts/test-renderer-browser.mjs';

const proof={client_ok:true,gracefulExit:true,recordedProcessesAbsent:true,desktopClosed:true};
test('unresolved close response reaches independent exit proof exactly once',async()=>{
 let sent=0,confirmed=0;const recorded=[];
 const result=await closeWithExitProof({sendClose:()=>{sent++;return new Promise(()=>{});},confirmExit:async()=>{confirmed++;assert.deepEqual(recorded,[{closeResponse:'unknown',closeResponseReason:'timeout'}]);return proof;},requireClosureProof,recordResponse:async value=>recorded.push(value),timeoutMs:10});
 assert.equal(sent,1);assert.equal(confirmed,1);assert.equal(result.closeResponse,'unknown');assert.equal(result.closure,proof);
});
test('unknown response never turns failed exit proof into success',async()=>{
 let sent=0,confirmed=0;const recorded=[];
 await assert.rejects(closeWithExitProof({sendClose:()=>{sent++;return Promise.reject(Error('Disconnected'));},confirmExit:async()=>{confirmed++;return {...proof,recordedProcessesAbsent:false};},requireClosureProof,recordResponse:async value=>recorded.push(value),timeoutMs:10}));
 assert.equal(sent,1);assert.equal(confirmed,1);assert.deepEqual(recorded,[{closeResponse:'unknown',closeResponseReason:'rejected'}]);
});
test('acknowledged response still requires independent exit proof',async()=>{
 let confirmed=0;
 const result=await closeWithExitProof({sendClose:async()=>{},confirmExit:async()=>{confirmed++;return proof;},requireClosureProof,recordResponse:async()=>{}});
 assert.equal(result.closeResponse,'acknowledged');assert.equal(confirmed,1);
});
test('failed confirmation remains negative after an unresolved close response',async()=>{
 let sent=0,confirmed=0,recorded;
 await assert.rejects(closeWithExitProof({sendClose:()=>{sent++;return new Promise(()=>{});},confirmExit:async()=>{confirmed++;throw Error('Exit observation unavailable');},requireClosureProof,recordResponse:async value=>{recorded=value;},timeoutMs:10}),/Exit observation unavailable/);
 assert.equal(sent,1);assert.equal(confirmed,1);assert.equal(recorded.closeResponse,'unknown');
});
test('receipt write rejection still attempts independent confirmation and remains negative',async()=>{
 let confirmed=0;
 await assert.rejects(closeWithExitProof({sendClose:async()=>{},confirmExit:async()=>{confirmed++;return proof;},requireClosureProof,recordResponse:async()=>{throw Error('Receipt EEXIST');}}),error=>{
  assert.equal(error.errors.length,1);assert.match(error.errors[0].message,/Receipt EEXIST/);return true;
 });
 assert.equal(confirmed,1);
});
test('receipt and confirmation rejection preserve both reasons',async()=>{
 let confirmed=0;
 await assert.rejects(closeWithExitProof({sendClose:async()=>{},confirmExit:async()=>{confirmed++;throw Error('Confirmation unavailable');},requireClosureProof,recordResponse:async()=>{throw Error('Receipt I/O unavailable');}}),error=>{
  assert.deepEqual(error.errors.map(value=>value.message),['Receipt I/O unavailable','Confirmation unavailable']);
  assert.match(error.message,/Receipt I\/O unavailable/);assert.match(error.message,/Confirmation unavailable/);return true;
 });
 assert.equal(confirmed,1);
});
