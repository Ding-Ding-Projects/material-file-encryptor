import {withCdpConnectionProof} from './cdp-connection-plan.mjs';
// Plans attach only through the installed CDP driver and an owned Lowlevel receipt.
// This module never launches or terminates a process and never replaces real state.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const matrix = Object.freeze([1180,880].flatMap(width => ['en','yue','bilingual'].flatMap(language => ['light','dark'].flatMap(theme => [1,1.25,1.5,2].map(scale => Object.freeze({width,height:width===1180?850:650,language,theme,scale}))))));
export const workspaceStates = Object.freeze(['drive','offline','history','recycle','settings','help']);
export const dialogStates = Object.freeze(['password','keyFile','privateGit']);
const quote = JSON.stringify;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const tupleId = tuple => `${tuple.width}x${tuple.height}-${tuple.language}-${tuple.theme}-${String(tuple.scale).replace('.','_')}`;

function plan(launch,receipt,steps,purpose='runtime') {
 assert.ok(path.isAbsolute(launch.outputRoot));assert.ok(path.isAbsolute(receipt));
 assert.ok(Number.isInteger(launch.cdp.port)&&launch.cdp.port>=1024&&launch.cdp.port<=65535);
 assert.ok(launch.cdp.expectedUrl.startsWith('file:'));
 return withCdpConnectionProof({version:1,receipt,endpoint:`http://127.0.0.1:${launch.cdp.port}`,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:90000,steps},purpose);
}
const poll = (id,expression) => ({id,op:'poll',expression,equals:true,intervalMs:100});
const click = (id,selector) => ({id,op:'click',selector});
const type = (id,selector,text) => ({id,op:'type',selector,text,clear:true});
function selectView(steps,view,id) {
 steps.push(click(id,`[data-view="${view}"]`),poll(id+'-visible',`!document.querySelector('#view-${view==='offline'?'drive':view}').hidden && document.querySelector('[data-view="${view}"]').getAttribute('aria-current') === 'page'`));
 if(['history','recycle'].includes(view))steps.push(poll(id+'-ready',`(()=>{const view=document.querySelector('#view-${view}'),s=view.dataset;return s.archiveState==='ready' && Boolean(s.archiveRequest) && s.archiveCompletedRequest===s.archiveRequest && Boolean(s.archiveRender) && s.archiveRendered===s.archiveRender;})()`));
}

// Read-only measurement: names and values are deliberately excluded.
function settledMotion(target) {
 if(typeof document.getAnimations!=='function')return false;
 return !document.getAnimations().some(animation=>{
  const element=animation.effect?.target;
  return element?.getClientRects().length>0&&(element===target||target.contains(element)||element.contains(target))&&(animation.pending||['running','paused'].includes(animation.playState));
 });
}
export function settledMotionExpression(selector) {
 return `(()=>{const matches=[...document.querySelectorAll(${quote(selector)})].filter(el=>el.getClientRects().length>0);return matches.length===1&&(${settledMotion.toString()})(matches[0]);})()`;
}
export function layoutExpression(selector) {
 return `(()=>{const selector=${quote(selector)};const matches=[...document.querySelectorAll(selector)].filter(el=>el.getClientRects().length>0);if(matches.length!==1)throw new Error('Expected one visible layout target');const target=matches[0];const properties=['display','position','boxSizing','width','minWidth','maxWidth','height','minHeight','maxHeight','margin','padding','gap','flexDirection','flexBasis','flexGrow','flexShrink','gridTemplateColumns','gridTemplateRows','alignItems','justifyContent','overflowX','overflowY','transform','fontSize','lineHeight','visibility','opacity','zIndex'];const measure=(el,selector)=>{const style=getComputedStyle(el),r=el.getBoundingClientRect();return{selector,matchedCount:1,chosenIndex:0,rect:Object.fromEntries(['x','y','top','right','bottom','left','width','height'].map(key=>[key,r[key]])),computed:Object.fromEntries(properties.map(key=>[key,style[key]]))}};const elements=[measure(target,selector)];let ancestor=target.parentElement;for(let i=0;ancestor&&i<4;i++,ancestor=ancestor.parentElement)elements.push(measure(ancestor,'ancestor:'+i));const fields=[...(target.matches('.clearable-field')?[target]:[]),...target.querySelectorAll('.clearable-field')].filter(el=>el.getClientRects().length>0).map(el=>{const input=el.querySelector('input,textarea'),button=el.querySelector('.field-clear'),r=button?.getBoundingClientRect(),ir=input?.getBoundingClientRect();return{id:input?.id||null,type:input?.type||input?.tagName,buttonCount:el.querySelectorAll('.field-clear').length,buttonType:button?.type,hasLabel:Boolean(button?.getAttribute('aria-label')),width:r?.width||0,height:r?.height||0,insideField:Boolean(r&&ir&&r.left>=ir.left-1&&r.right<=ir.right+1&&r.top>=ir.top-1&&r.bottom<=ir.bottom+1),disabled:Boolean(button?.disabled)}});return{selector,matchedCount:matches.length,chosenIndex:0,viewport:{width:innerWidth,height:innerHeight,scale:devicePixelRatio},pageOverflow:document.documentElement.scrollWidth>innerWidth+1,elements,fields}})()`;
}
function captureAndMeasure(steps,launch,id,selector) {
 steps.push(poll(id+'-motion-settled',settledMotionExpression(selector)),{id:id+'-measure',op:'evaluate',expression:layoutExpression(selector)},{id:id+'-capture',op:'capture',path:path.join(launch.outputRoot,'modern-'+id+'.png'),overwrite:false});
}
function prepareTuple(steps,tuple,id) {
 assert.ok(matrix.some(item=>JSON.stringify(item)===JSON.stringify(tuple)),'Unknown matrix tuple');
 steps.push({id:id+'-emulate',op:'emulate',width:tuple.width,height:tuple.height,scale:tuple.scale,mobile:false,touch:false});
 selectView(steps,'settings',id+'-prepare-settings');
 steps.push(type(id+'-theme','#theme-setting',tuple.theme),type(id+'-language','#language-setting',tuple.language),poll(id+'-tuple',`innerWidth===${tuple.width} && innerHeight===${tuple.height} && Math.abs(devicePixelRatio-${tuple.scale})<0.01 && document.documentElement.dataset.theme===${quote(tuple.theme)} && document.querySelector('#language-setting').value===${quote(tuple.language)}`));
}

export function makeWorkspacePlan({launch,receipt,tuple}) {
 const id=tupleId(tuple),steps=[poll(id+'-mounted',"document.querySelector('#vault-badge').dataset.state === 'mounted' && !document.querySelector('#sync-button').disabled")];
 prepareTuple(steps,tuple,id);
 for(const view of workspaceStates){selectView(steps,view,id+'-'+view);captureAndMeasure(steps,launch,id+'-'+view,`#view-${view==='offline'?'drive':view}`);}
 return plan(launch,receipt,steps);
}

// Caller must first lock its test-owned drive through the ordinary UI and verify it.
export function makeDialogPlan({launch,receipt,tuple}) {
 const id=tupleId(tuple)+'-dialog',steps=[poll(id+'-locked',"!document.querySelector('#locked-state').hidden && !document.querySelector('#create-button').disabled")];
 prepareTuple(steps,tuple,id);selectView(steps,'drive',id+'-drive');
 steps.push(click(id+'-open','#create-button'),poll(id+'-opened',"document.querySelector('#vault-dialog').open"));
 captureAndMeasure(steps,launch,id+'-password','#vault-dialog');
 steps.push(click(id+'-key-mode','.credential-selector label:has(input[value="keyFile"])'),poll(id+'-key-ready',"!document.querySelector('#key-fields').hidden"));
 captureAndMeasure(steps,launch,id+'-keyFile','#vault-dialog');
 steps.push(type(id+'-private','#transport-mode','privateGit'),poll(id+'-private-ready',"!document.querySelector('#private-git-fields').hidden"));
 captureAndMeasure(steps,launch,id+'-privateGit','#vault-dialog');
 steps.push(click(id+'-cancel','#dialog-cancel'),poll(id+'-closed',"!document.querySelector('#vault-dialog').open"));
 return plan(launch,receipt,steps);
}

function clearSteps(steps,launch,selector,sample,id,fieldSelector=`.clearable-field:has(${selector})`) {
 const clear=`${fieldSelector} > .field-clear`;
 steps.push(type(id+'-enter',selector,sample),poll(id+'-value',`document.querySelector(${quote(selector)}).value.length>0`),click(id+'-clear',clear),poll(id+'-empty-focused',`document.querySelector(${quote(selector)}).value==='' && document.activeElement===document.querySelector(${quote(selector)})`));
 captureAndMeasure(steps,launch,id,fieldSelector);
}
export function makeClearPlan({launch,receipt,phase,tuple}) {
 const steps=[];
 assert.ok(['workspace','dialog'].includes(phase));
 prepareTuple(steps,tuple,'clear-'+phase);
 if(phase==='workspace') {
  steps.push(poll('clear-mounted',"document.querySelector('#vault-badge').dataset.state === 'mounted'"));
  selectView(steps,'drive','clear-drive');clearSteps(steps,launch,'#file-search','Runtime','clear-file-search');
  clearSteps(steps,launch,'#split-value','12','clear-part-size');steps.push(type('restore-part-size','#split-value','10'));
  selectView(steps,'history','clear-history');steps.push(type('custom-retention','#history-retention','custom'));
  clearSteps(steps,launch,'#history-days','365','clear-retention');steps.push(type('restore-retention','#history-days','365'));
  clearSteps(steps,launch,'#history-search-host input[type="search"]','Runtime','clear-history-search','#history-search-host > .clearable-field');
  selectView(steps,'recycle','clear-recycle');clearSteps(steps,launch,'#recycle-search-host input[type="search"]','Runtime','clear-recycle-search','#recycle-search-host > .clearable-field');
 } else {
  assert.equal(phase,'dialog');selectView(steps,'drive','clear-dialog-drive');
  steps.push(poll('clear-dialog-ready',"!document.querySelector('#locked-state').hidden && !document.querySelector('#create-button').disabled"),click('clear-dialog-open','#create-button'),poll('clear-dialog-opened',"document.querySelector('#vault-dialog').open && document.querySelector('#password-input').type==='password'"));
  for(const [selector,sample,id] of [['#storage-input','Example storage','storage'],['#cache-input','Example cache','cache'],['#drive-letter','M:','letter'],['#password-input','Synthetic example only','password'],['#confirm-password','Synthetic example only','confirm'],['#create-split-value','10','creation-size']])clearSteps(steps,launch,selector,sample,'clear-'+id);
  steps.push(click('clear-key-mode','.credential-selector label:has(input[value="keyFile"])'));clearSteps(steps,launch,'#key-path','Example.key','clear-key-path');
  steps.push(type('clear-private-mode','#transport-mode','privateGit'));clearSteps(steps,launch,'#remote-repository','example/verification','clear-repository');
  steps.push(click('clear-dialog-cancel','#dialog-cancel'),poll('clear-dialog-closed',"!document.querySelector('#vault-dialog').open"));
 }
 return plan(launch,receipt,steps);
}

export function makeRestorePlan({launch,receipt,phase,purpose='control'}) {
 const steps=[];prepareTuple(steps,matrix[0],'modern-restore-'+phase);
 selectView(steps,'drive','modern-restore-drive-'+phase);
 return plan(launch,receipt,steps,purpose);
}

export async function runModernPhase({launch,receipt,phase,executePlan,probeEvidence,report=event=>console.log(JSON.stringify(event)),record=async event=>fs.appendFile(path.join(launch.runRoot,'modern-ui-measurements.jsonl'),JSON.stringify(event)+'\n')}) {
 assert.ok(['workspace','dialog'].includes(phase));
 assert.equal(typeof probeEvidence?.observe,'function','Independent probe observations are required');
 assert.equal(typeof probeEvidence?.persist,'function','Validated probe persistence is required');
 const summary={phase,tuplesVerified:0,clearControlsVerified:false,physicalWindowsDisplayScaleVerified:false,probeReceiptsVerified:false,probeReceiptUnavailableReason:'Independent live HWND/process ownership, runtime error counts and build receipt observations must be supplied separately; no values are inferred.'};
 let failure;
 const run=async(plan,tuple,kind)=>{
  report({state:'modern-ui-started',phase,kind,tuple});
  try {
   const before=await probeEvidence.observe();
   const result=await executePlan({...plan,observeRuntime:true});
   // Save returned measurements before any assertion can stop the matrix.
   const measurements=(result.results||[]).filter(step=>step.id?.endsWith('-measure'));
   await record({version:1,phase,kind,tuple,measurements,captures:(result.results||[]).filter(step=>step.op==='capture'),observedAt:new Date().toISOString()});
   assert.equal(measurements.length,plan.steps.filter(step=>step.id?.endsWith('-measure')).length,'Missing layout measurement result');
   for(const step of measurements)assertMeasurement(step.value,tuple);
   const after=await probeEvidence.observe();
   const verified=await probeEvidence.persist({before,after,plan,result,measurements,tuple});
   assert.equal(verified,measurements.length,'Every measured capture requires a validated probe');
   report({state:'modern-ui-verified',phase,kind,tuple,measurements:measurements.length});
  } catch(error) {
   await record({version:1,phase,kind,tuple,status:'failed',reason:error instanceof assert.AssertionError?'LAYOUT_ASSERTION_FAILED':'PLAN_EXECUTION_FAILED',observedAt:new Date().toISOString()});
   report({state:'modern-ui-failed',phase,kind,tuple});throw error;
  }
 };
 try {
  await executePlan(makeRestorePlan({launch,receipt,phase:phase+'-start'}));
  await run(makeClearPlan({launch,receipt,phase,tuple:matrix[0]}),matrix[0],'clear-controls');summary.clearControlsVerified=true;
  for(const tuple of matrix){await run(phase==='workspace'?makeWorkspacePlan({launch,receipt,tuple}):makeDialogPlan({launch,receipt,tuple}),tuple,'matrix');summary.tuplesVerified++;}
  summary.probeReceiptsVerified=true;delete summary.probeReceiptUnavailableReason;return summary;
 } catch(error){failure=error;throw error;}
 finally {
  // A failed dialog can remain open. Closing it is an ordinary cancel operation,
  // not replacement of product state. The caller still owns graceful recovery.
  try {
   if(phase==='dialog')await executePlan(plan(launch,receipt,[{id:'modern-recovery-dialog',op:'evaluate',expression:"(()=>{const dialog=document.querySelector('#vault-dialog');if(dialog.open)document.querySelector('#dialog-cancel').click();return !dialog.open;})()"}],'recovery'));
   await executePlan(makeRestorePlan({launch,receipt,phase:phase+'-end',purpose:'recovery'}));
  }catch(error){await record({version:1,phase,status:'restoration-failed',observedAt:new Date().toISOString()});if(!failure)throw error;}
 }
}

export function observedRuntime(result,captures,expected) {
 const value=result?.runtimeObservation;
 assert.equal(result?.ok,true);assert.equal(result.targetCount,1);assert.equal(result.exactUrl,expected.exactUrl);
 assert.equal(value?.version,1);assert.equal(value.requested,true);assert.equal(value.enabled,true);assert.equal(value.complete,true);
 assert.equal(value.coverage,'cdp-plan-interval');assert.equal(value.startupHistoryObserved,false);assert.equal(value.mappingVersion,1);
 assert.equal(value.invalidEventCount,0);assert.equal(value.interruptionCode,null);
 assert.equal(value.binding?.helperSha256,expected.helperSha256);assert.equal(value.binding?.launchReceiptSha256,expected.launchReceiptSha256);
 const start=Date.parse(value.startedAt),end=Date.parse(value.endedAt);assert.ok(Number.isFinite(start)&&Number.isFinite(end)&&end>=start);
 const counts={};for(const key of ['consoleErrorCount','unhandledExceptionCount','pageErrorCount']){assert.equal(value[key],0,`Observed ${key} must be exactly zero`);counts[key]=value[key];}
 for(const capture of captures){const first=Date.parse(capture.startedAt),last=Date.parse(capture.capturedAt);assert.ok(first>=start&&last>=first&&last<=end,'Capture falls outside prospective runtime interval');}
 return {...counts,observation:value};
}

export function createModernProbeEvidence({binding,observe,validate,outputRoot,helperPath}) {
 return {observe,async persist({before,after,plan,result,measurements,tuple}) {
  assert.equal(before.sourceCommit,binding.sourceCommit);assert.equal(after.sourceCommit,binding.sourceCommit);
  for(const key of ['desktop','pid','hwnd','processPath','processSha256','creationDate']){assert.ok(before.target?.[key]);assert.equal(after.target?.[key],before.target[key]);}
  assert.equal(before.launchReceiptSha256,after.launchReceiptSha256);
  const captures=(result.results||[]).filter(step=>step.op==='capture');
  assert.equal(captures.length,measurements.length);assert.equal(new Set(captures.map(step=>step.id)).size,captures.length);
  const helperSha256=digest(await fs.readFile(helperPath));
  const runtime=observedRuntime(result,captures.map(step=>step.value),{exactUrl:plan.expectedUrl,helperSha256,launchReceiptSha256:before.launchReceiptSha256});
  assert.ok(Date.parse(before.observedAt)<=Date.parse(runtime.observation.startedAt),'Native start observation does not precede the measured interval');
  assert.ok(Date.parse(after.observedAt)>=Date.parse(runtime.observation.endedAt),'Native end observation does not follow the measured interval');
  for(const measurement of measurements) {
   const capture=captures.find(step=>step.id===measurement.id.replace(/-measure$/,'-capture'));assert.ok(capture,'Missing matching capture');
   const observation={sourceStartCommit:before.sourceCommit,sourceEndCommit:after.sourceCommit,target:after.target,privacy:after.privacy,ownership:{...after.ownership,cdpTargetVerified:result.targetCount===1&&result.exactUrl===plan.expectedUrl},runtime,nativeGeometry:{before:before.nativeGeometry,after:after.nativeGeometry}};
   // Both bookends must independently establish their native and privacy facts.
   for(const key of ['pidResolvedLive','hwndResolvedLive','exactProcessOwned'])assert.equal(before.ownership?.[key],true);
   for(const key of ['visibleDesktopUntouched','taskOwnedProfile'])assert.equal(before.privacy?.[key],true);
   assert.equal(before.privacy?.unrelatedTargetsObserved,false);
   const receipt=await makeProbeReceipt({binding,observation,capture:capture.value,measurement:measurement.value,tuple});
   receipt.runtimeObservation=runtime.observation;
   const destination=path.join(outputRoot,path.basename(capture.value.path,'.png')+'.probe.json');
   await fs.writeFile(destination,JSON.stringify(receipt,null,2),{flag:'wx'});
   const validation=await validate(destination);assert.equal(validation?.valid,true,'Layout validator did not confirm the receipt');
   assert.equal(validation.sourceCommit,binding.sourceCommit);assert.equal(validation.artifactSha256,binding.artifactSha256);assert.equal(validation.screenshotSha256,capture.value.sha256);
   await fs.writeFile(destination.replace(/\.json$/,'.validation.json'),JSON.stringify(validation,null,2),{flag:'wx'});
  }
  return measurements.length;
 }};
}

export function assertMeasurement(value,tuple) {
 assert.equal(value.matchedCount,1);assert.equal(value.chosenIndex,0);
 assert.equal(value.viewport.width,tuple.width);assert.equal(value.viewport.height,tuple.height);assert.ok(Math.abs(value.viewport.scale-tuple.scale)<.01);
 assert.equal(value.pageOverflow,false,'Page content exceeds the viewport');
 // Retain raw rectangles. This allowance covers only subpixel arithmetic at
 // the clear-control minimum, not overflow, selection, or ownership checks.
 const minimum=44-1e-4;
 for(const field of value.fields){assert.equal(field.buttonCount,1);assert.equal(field.buttonType,'button');assert.equal(field.hasLabel,true);assert.ok(Number.isFinite(field.width)&&Number.isFinite(field.height)&&field.width>=minimum&&field.height>=minimum,'Clear target below 44 CSS pixels');assert.equal(field.insideField,true,'Clear target escapes its field');}
 assert.ok(value.elements[0].rect.width>0&&value.elements[0].rect.height>0);
 return true;
}

// The caller supplies independently observed ownership, runtime, privacy and source
// observations. Missing proof is never replaced with optimistic true/zero defaults.
export async function makeProbeReceipt({binding,observation,capture,measurement,tuple}) {
 assertMeasurement(measurement,tuple);
 assert.match(binding.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(observation.sourceStartCommit,binding.sourceCommit);assert.equal(observation.sourceEndCommit,binding.sourceCommit);
 for(const key of ['pidResolvedLive','hwndResolvedLive','exactProcessOwned','cdpTargetVerified'])assert.equal(observation.ownership?.[key],true);
 for(const key of ['consoleErrorCount','unhandledExceptionCount','pageErrorCount'])assert.equal(observation.runtime?.[key],0);
 assert.equal(observation.privacy?.visibleDesktopUntouched,true);assert.equal(observation.privacy?.taskOwnedProfile,true);assert.equal(observation.privacy?.unrelatedTargetsObserved,false);
 for(const side of ['before','after']) {
  const native=observation.nativeGeometry?.[side];assert.equal(native?.client_ok,true,'Native geometry bookends are required');
  assert.equal(native.process?.pid,observation.target.pid);assert.equal(String(native.hwnd),String(observation.target.hwnd));assert.equal(native.process.creationDate,observation.target.creationDate);assert.equal(native.process.executablePath,observation.target.processPath);assert.equal(native.processSha256,observation.target.processSha256);
  assert.ok(native.clientRect?.width>0&&native.clientRect?.height>0);assert.ok(native.dpi>0);assert.equal(native.scaleKind,'current-window-effective-dpi');assert.equal(native.physicalScaleMatrixVerified,false);
 }
 const artifactBytes=await fs.readFile(binding.artifactPath);assert.equal(digest(artifactBytes),binding.artifactSha256);
 const buildBytes=await fs.readFile(binding.buildReceiptPath);assert.equal(digest(buildBytes),binding.buildReceiptSha256);
 const build=JSON.parse(buildBytes);assert.equal(build.sourceCommit,binding.sourceCommit);assert.equal(build.artifactSha256,binding.artifactSha256);
 const rendererBytes=await fs.readFile(binding.rendererAsarPath);assert.equal(digest(rendererBytes),binding.rendererAsarSha256);
 const png=await fs.readFile(capture.path);assert.equal(digest(png),capture.sha256);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.ok(Number.isFinite(Date.parse(capture.capturedAt)));assert.ok(observation.target?.pid>0);assert.ok(observation.target?.hwnd);
 assert.equal(observation.target.processPath,binding.artifactPath);assert.equal(observation.target.processSha256,binding.artifactSha256);
 return {version:1,capturedAt:capture.capturedAt,sourceCommit:binding.sourceCommit,sourceStartCommit:observation.sourceStartCommit,sourceEndCommit:observation.sourceEndCommit,route:'cheap-lowlevel-headless',artifact:{path:binding.artifactPath,sha256:binding.artifactSha256,buildReceiptPath:binding.buildReceiptPath,buildReceiptSha256:binding.buildReceiptSha256},renderer:{path:binding.rendererAsarPath,sha256:binding.rendererAsarSha256},screenshot:{path:capture.path,sha256:capture.sha256,width:png.readUInt32BE(16),height:png.readUInt32BE(20)},target:{...observation.target,selector:measurement.selector,matchedCount:1,chosenIndex:0,viewport:measurement.viewport},privacy:observation.privacy,ownership:observation.ownership,runtime:observation.runtime,elements:measurement.elements,nativeGeometry:observation.nativeGeometry,scaleEvidence:{kind:'cdp-device-metrics-emulation',requested:tuple.scale,observedDevicePixelRatio:measurement.viewport.scale,physicalWindowsDisplayScaleVerified:false}};
}
