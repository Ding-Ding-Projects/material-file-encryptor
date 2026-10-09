import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {matrix,workspaceStates,makeWorkspacePlan,makeDialogPlan,makeClearPlan,assertMeasurement,makeProbeReceipt} from '../scripts/modern-ui-check.mjs';

const launch={outputRoot:path.resolve('evidence-owned/output'),cdp:{port:9333,expectedUrl:'file:///C:/owned/resources/app.asar/src/renderer/index.html'}};
const receipt=path.resolve('evidence-owned/lifecycle.json');
test('matrix explicitly covers all 48 renderer tuples and each workspace state',()=>{
 assert.equal(matrix.length,48);assert.equal(new Set(matrix.map(JSON.stringify)).size,48);
 for(const tuple of matrix){const plan=makeWorkspacePlan({launch,receipt,tuple});assert.ok(plan.steps.length<=100);assert.equal(plan.steps.filter(step=>step.op==='capture').length,workspaceStates.length);assert.equal(plan.steps[0].op,'poll');assert.ok(plan.steps.some(step=>step.op==='poll'&&step.expression.includes('devicePixelRatio')));assert.deepEqual(plan.steps.find(step=>step.op==='emulate'),{id:plan.steps.find(step=>step.op==='emulate').id,op:'emulate',width:tuple.width,height:tuple.height,scale:tuple.scale,mobile:false,touch:false});}
});
test('dialog plans require a real locked state and never submit or inject a bridge',()=>{
 for(const tuple of matrix){const plan=makeDialogPlan({launch,receipt,tuple});assert.ok(plan.steps[0].expression.includes('locked-state'));assert.equal(plan.steps.filter(step=>step.op==='capture').length,3);assert.equal(plan.steps.at(-2).selector,'#dialog-cancel');assert.ok(plan.steps.every(step=>step.selector!=='#dialog-submit'));assert.doesNotMatch(JSON.stringify(plan),/window[.]drive\s*=/);}
});
test('clear plans cover 13 current fields with real input and focus assertions',()=>{
 const plans=['workspace','dialog'].map(phase=>makeClearPlan({launch,receipt,phase}));
 const clears=plans.flatMap(plan=>plan.steps.filter(step=>step.op==='click'&&step.selector.endsWith('> .field-clear')));
 assert.equal(clears.length,13);assert.equal(new Set(clears.map(step=>step.selector)).size,13);
 for(const plan of plans){assert.ok(plan.steps.length<=100);assert.ok(plan.steps.every(step=>step.selector!=='#dialog-submit'));assert.equal(plan.steps.filter(step=>step.id.endsWith('-empty-focused')).length,plan.steps.filter(step=>step.op==='click'&&step.selector.endsWith('> .field-clear')).length);}
});
function measurement(){return {matchedCount:1,chosenIndex:0,viewport:{width:1180,height:850,scale:1},pageOverflow:false,fields:[{buttonCount:1,buttonType:'button',hasLabel:true,width:44,height:44,insideField:true}],elements:[{rect:{width:500,height:400}}]};}
test('layout checks reject undersized clear targets, overflow and mismatched scale',()=>{
 assert.equal(assertMeasurement(measurement(),matrix[0]),true);
 for(const mutate of [value=>value.fields[0].width=43,value=>value.fields[0].insideField=false,value=>value.fields[0].hasLabel=false,value=>value.pageOverflow=true,value=>value.viewport.scale=1.25,value=>value.matchedCount=0]){const value=measurement();mutate(value);assert.throws(()=>assertMeasurement(value,matrix[0]));}
});
test('probe receipt refuses missing independently observed ownership before file access',async()=>{
 await assert.rejects(makeProbeReceipt({binding:{sourceCommit:'a'.repeat(40)},observation:{sourceStartCommit:'a'.repeat(40),sourceEndCommit:'a'.repeat(40)},measurement:measurement(),tuple:matrix[0]}));
});
