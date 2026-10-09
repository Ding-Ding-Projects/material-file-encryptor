import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {matrix,workspaceStates,makeWorkspacePlan,makeDialogPlan,makeClearPlan,assertMeasurement,makeProbeReceipt,runModernPhase,layoutExpression} from '../scripts/modern-ui-check.mjs';

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

test('opt-in runner records every tuple, restores defaults and retains exact evidence limits',async()=>{
 const records=[],events=[],plans=[];let viewport={width:1180,height:850,scale:1};
 const executePlan=async plan=>{plans.push(plan);const metrics=plan.steps.find(step=>step.op==='emulate');if(metrics)viewport={width:metrics.width,height:metrics.height,scale:metrics.scale};return {results:plan.steps.map(step=>({...step,value:step.id?.endsWith('-measure')?{...measurement(),viewport}:null}))};};
 for(const phase of ['workspace','dialog']){
  const result=await runModernPhase({launch,receipt,phase,executePlan,report:event=>events.push(event),record:async event=>records.push(event)});
  assert.equal(result.tuplesVerified,48);assert.equal(result.clearControlsVerified,true);assert.equal(result.physicalWindowsDisplayScaleVerified,false);assert.equal(result.probeReceiptsVerified,false);
  assert.deepEqual(viewport,{width:1180,height:850,scale:1});
 }
 assert.equal(events.filter(event=>event.state==='modern-ui-verified'&&event.kind==='matrix').length,96);
 assert.equal(records.filter(event=>event.kind==='matrix').length,96);
 assert.ok(plans.at(-1).steps.some(step=>step.selector==='#language-setting'&&step.text==='en'));
});

test('first geometry failure preserves measurements and stops before later tuples while restoring',async()=>{
 const records=[],plans=[];let viewport={width:1180,height:850,scale:1};
 const executePlan=async plan=>{plans.push(plan);const metrics=plan.steps.find(step=>step.op==='emulate');if(metrics)viewport={width:metrics.width,height:metrics.height,scale:metrics.scale};return {results:plan.steps.map(step=>({...step,value:step.id?.endsWith('-measure')?{...measurement(),viewport,pageOverflow:true}:null}))};};
 await assert.rejects(runModernPhase({launch,receipt,phase:'workspace',executePlan,report:()=>{},record:async event=>records.push(event)}));
 assert.equal(records[0].kind,'clear-controls');assert.ok(records[0].measurements.length>0);assert.equal(records[1].status,'failed');
 assert.equal(plans.length,3);assert.deepEqual(viewport,{width:1180,height:850,scale:1});
});

test('a 44 px clear control escaping only vertically is rejected by the actual measurement expression',()=>{
 const rect={x:0,y:0,left:0,top:0,right:200,bottom:48,width:200,height:48};
 const input={id:'sample',type:'text',getBoundingClientRect:()=>rect};
 const button={type:'button',getAttribute:()=> 'Clear',getBoundingClientRect:()=>({...rect,x:154,left:154,right:198,y:20,top:20,bottom:64,width:44,height:44})};
 const target={matches:()=>true,parentElement:null,getClientRects:()=>[rect],getBoundingClientRect:()=>rect,querySelector:selector=>selector==='.field-clear'?button:input,querySelectorAll:selector=>selector==='.field-clear'?[button]:[]};
 const result=vm.runInNewContext(layoutExpression('#sample'),{document:{querySelectorAll:()=>[target],documentElement:{scrollWidth:1180}},getComputedStyle:()=>({display:'flex'}),innerWidth:1180,innerHeight:850,devicePixelRatio:1});
 assert.equal(result.fields[0].width,44);assert.equal(result.fields[0].height,44);assert.equal(result.fields[0].insideField,false);
 assert.throws(()=>assertMeasurement(result,matrix[0]));
});

test('archive readiness stays loading until current rows and retention controls finish',async()=>{
 const source=await fs.readFile(new URL('../src/renderer/app.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('async function loadArchive(kind)'),source.indexOf('async function renderArchive(kind)'));
 const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{dataset:{},replaceChildren(){},setAttribute(name,value){this[name]=value;}});return elements.get(id);};
 const requests=[];let finishRender;
 const context={archiveRequests:{history:0,recycle:0},archiveRows:{history:[],recycle:[]},state:{locked:false,preferences:{historyRetentionDays:90}},$:get,api:{history:()=>new Promise(resolve=>requests.push(resolve))},renderArchive:()=>new Promise(resolve=>{finishRender=resolve;}),setArchiveMessage(){},showError(){},t:value=>value};
 vm.createContext(context);vm.runInContext(body+';this.load=loadArchive',context);
 const first=context.load('history');assert.equal(get('view-history').dataset.archiveState,'loading');
 const second=context.load('history');requests[0]([]);await first;assert.equal(get('view-history').dataset.archiveState,'loading');
 requests[1]([]);await Promise.resolve();await Promise.resolve();assert.equal(get('view-history').dataset.archiveState,'loading');
 finishRender();await second;assert.equal(get('history-retention').value,'90');assert.equal(get('view-history').dataset.archiveState,'ready');
 assert.equal(get('view-history').dataset.archiveCompletedRequest,get('view-history').dataset.archiveRequest);
 const plan=makeWorkspacePlan({launch,receipt,tuple:matrix[0]});
 for(const view of ['history','recycle'])assert.ok(plan.steps.some(step=>step.op==='poll'&&step.id.endsWith(view+'-ready')&&step.expression.includes('archiveCompletedRequest')&&step.expression.includes('archiveRendered')));
});
