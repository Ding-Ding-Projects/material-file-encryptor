import test from 'node:test';
import assert from 'node:assert/strict';
import {createModelStartupReadiness,MODEL_STARTUP_NOT_STARTED} from '../src/main/model-startup-readiness.js';

test('zero requests cannot declare startup ready before initialization and first inspection settle',()=>{
 const tracker=createModelStartupReadiness();assert.deepEqual(tracker.snapshot(),MODEL_STARTUP_NOT_STARTED);
 const init=tracker.beginInitialization();assert.equal(tracker.snapshot().state,'pending');
 tracker.finishInitialization(init,true);assert.equal(tracker.snapshot().state,'pending');assert.equal(tracker.snapshot().inspection,'not-started');
 const inspection=tracker.beginInspection();assert.equal(tracker.snapshot().state,'pending');
 tracker.finishInspection(inspection,true);assert.equal(tracker.snapshot().state,'settled');
 assert.equal(tracker.snapshot(1,0).state,'pending');assert.equal(tracker.snapshot(0,1).state,'pending');assert.equal(tracker.snapshot(0,0).state,'settled');
});

test('failed initialization or first inspection remains failed after current work reaches zero',()=>{
 const failedInit=createModelStartupReadiness(),init=failedInit.beginInitialization();failedInit.finishInitialization(init,false);
 assert.equal(failedInit.snapshot().state,'failed');assert.equal(failedInit.beginInspection(),null);
 const tracker=createModelStartupReadiness(),ticket=tracker.beginInitialization();tracker.finishInitialization(ticket,true);
 const inspection=tracker.beginInspection();tracker.finishInspection(inspection,false);assert.equal(tracker.snapshot().state,'failed');
 const retry=tracker.beginInspection();assert.equal(tracker.snapshot().state,'pending');tracker.finishInspection(retry,true);assert.equal(tracker.snapshot().state,'settled');
});

test('a concurrent inspection cannot complete the first inspection and reset invalidates old tickets',()=>{
 const tracker=createModelStartupReadiness(),init=tracker.beginInitialization();tracker.finishInitialization(init,true);
 const first=tracker.beginInspection(),second=tracker.beginInspection();assert.equal(second,null);
 tracker.finishInspection(second,true);assert.equal(tracker.snapshot().inspection,'pending');
 tracker.reset();tracker.finishInspection(first,true);tracker.finishInitialization(init,true);assert.deepEqual(tracker.snapshot(),MODEL_STARTUP_NOT_STARTED);
});

test('read-only snapshots are independent fixed-schema values with bounded counts',()=>{
 const tracker=createModelStartupReadiness();const first=tracker.snapshot();first.state='settled';first.privatePath='not retained';
 for(let index=0;index<10;index++)assert.deepEqual(tracker.snapshot(),MODEL_STARTUP_NOT_STARTED);
 for(const pair of [[-1,0],[0,65536],[NaN,0],[Infinity,0],[0,1.5]]){const value=tracker.snapshot(...pair);assert.equal(value.state,'failed');assert.equal(value.pendingRequests,null);assert.equal(value.pendingOperations,null);assert.deepEqual(Object.keys(value),Object.keys(MODEL_STARTUP_NOT_STARTED));}
});
