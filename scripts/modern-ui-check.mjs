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

function plan(launch,receipt,steps) {
 assert.ok(path.isAbsolute(launch.outputRoot));assert.ok(path.isAbsolute(receipt));
 assert.ok(Number.isInteger(launch.cdp.port)&&launch.cdp.port>=1024&&launch.cdp.port<=65535);
 assert.ok(launch.cdp.expectedUrl.startsWith('file:'));
 return {version:1,receipt,endpoint:`http://127.0.0.1:${launch.cdp.port}`,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:90000,steps};
}
const poll = (id,expression) => ({id,op:'poll',expression,equals:true,intervalMs:100});
const click = (id,selector) => ({id,op:'click',selector});
const type = (id,selector,text) => ({id,op:'type',selector,text,clear:true});
function selectView(steps,view,id) {
 steps.push(click(id,`[data-view="${view}"]`),poll(id+'-visible',`!document.querySelector('#view-${view==='offline'?'drive':view}').hidden && document.querySelector('[data-view="${view}"]').getAttribute('aria-current') === 'page'`));
}

// Read-only measurement: names and values are deliberately excluded.
export function layoutExpression(selector) {
 return `(()=>{const selector=${quote(selector)};const matches=[...document.querySelectorAll(selector)].filter(el=>el.getClientRects().length>0);if(matches.length!==1)throw new Error('Expected one visible layout target');const target=matches[0];const properties=['display','position','boxSizing','width','minWidth','maxWidth','height','minHeight','maxHeight','margin','padding','gap','flexDirection','flexBasis','flexGrow','flexShrink','gridTemplateColumns','gridTemplateRows','alignItems','justifyContent','overflowX','overflowY','transform','fontSize','lineHeight','visibility','opacity','zIndex'];const measure=(el,selector)=>{const style=getComputedStyle(el),r=el.getBoundingClientRect();return{selector,matchedCount:1,chosenIndex:0,rect:Object.fromEntries(['x','y','top','right','bottom','left','width','height'].map(key=>[key,r[key]])),computed:Object.fromEntries(properties.map(key=>[key,style[key]]))}};const elements=[measure(target,selector)];let ancestor=target.parentElement;for(let i=0;ancestor&&i<4;i++,ancestor=ancestor.parentElement)elements.push(measure(ancestor,'ancestor:'+i));const fields=[...(target.matches('.clearable-field')?[target]:[]),...target.querySelectorAll('.clearable-field')].filter(el=>el.getClientRects().length>0).map(el=>{const input=el.querySelector('input,textarea'),button=el.querySelector('.field-clear'),r=button?.getBoundingClientRect(),ir=input?.getBoundingClientRect();return{id:input?.id||null,type:input?.type||input?.tagName,buttonCount:el.querySelectorAll('.field-clear').length,buttonType:button?.type,hasLabel:Boolean(button?.getAttribute('aria-label')),width:r?.width||0,height:r?.height||0,insideField:Boolean(r&&ir&&r.left>=ir.left-1&&r.right<=ir.right+1),disabled:Boolean(button?.disabled)}});return{selector,matchedCount:matches.length,chosenIndex:0,viewport:{width:innerWidth,height:innerHeight,scale:devicePixelRatio},pageOverflow:document.documentElement.scrollWidth>innerWidth+1,elements,fields}})()`;
}
function captureAndMeasure(steps,launch,id,selector) {
 steps.push({id:id+'-measure',op:'evaluate',expression:layoutExpression(selector)},{id:id+'-capture',op:'capture',path:path.join(launch.outputRoot,'modern-'+id+'.png'),overwrite:false});
}
function prepareTuple(steps,tuple,id) {
 assert.ok(matrix.some(item=>JSON.stringify(item)===JSON.stringify(tuple)),'Unknown matrix tuple');
 steps.push({id:id+'-emulate',op:'emulate',width:tuple.width,height:tuple.height,scale:tuple.scale,mobile:false,touch:false});
 selectView(steps,'settings',id+'-settings');
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

function clearSteps(steps,launch,selector,sample,id) {
 const clear=`.clearable-field:has(${selector}) > .field-clear`;
 steps.push(type(id+'-enter',selector,sample),poll(id+'-value',`document.querySelector(${quote(selector)}).value.length>0`),click(id+'-clear',clear),poll(id+'-empty-focused',`document.querySelector(${quote(selector)}).value==='' && document.activeElement===document.querySelector(${quote(selector)})`));
 captureAndMeasure(steps,launch,id,'.clearable-field:has('+selector+')');
}
export function makeClearPlan({launch,receipt,phase}) {
 const steps=[];
 if(phase==='workspace') {
  steps.push(poll('clear-mounted',"document.querySelector('#vault-badge').dataset.state === 'mounted'"));
  selectView(steps,'drive','clear-drive');clearSteps(steps,launch,'#file-search','Runtime','clear-file-search');
  clearSteps(steps,launch,'#split-value','12','clear-part-size');steps.push(type('restore-part-size','#split-value','10'));
  selectView(steps,'history','clear-history');steps.push(type('custom-retention','#history-retention','custom'));
  clearSteps(steps,launch,'#history-days','365','clear-retention');steps.push(type('restore-retention','#history-days','365'));
  clearSteps(steps,launch,'#history-search-host input[type="search"]','Runtime','clear-history-search');
  selectView(steps,'recycle','clear-recycle');clearSteps(steps,launch,'#recycle-search-host input[type="search"]','Runtime','clear-recycle-search');
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

export function assertMeasurement(value,tuple) {
 assert.equal(value.matchedCount,1);assert.equal(value.chosenIndex,0);
 assert.equal(value.viewport.width,tuple.width);assert.equal(value.viewport.height,tuple.height);assert.ok(Math.abs(value.viewport.scale-tuple.scale)<.01);
 assert.equal(value.pageOverflow,false,'Page content exceeds the viewport');
 for(const field of value.fields){assert.equal(field.buttonCount,1);assert.equal(field.buttonType,'button');assert.equal(field.hasLabel,true);assert.ok(field.width>=44&&field.height>=44,'Clear target below 44 CSS pixels');assert.equal(field.insideField,true,'Clear target escapes its field');}
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
 const artifactBytes=await fs.readFile(binding.artifactPath);assert.equal(digest(artifactBytes),binding.artifactSha256);
 const buildBytes=await fs.readFile(binding.buildReceiptPath);assert.equal(digest(buildBytes),binding.buildReceiptSha256);
 const build=JSON.parse(buildBytes);assert.equal(build.sourceCommit,binding.sourceCommit);assert.equal(build.artifactSha256,binding.artifactSha256);
 const rendererBytes=await fs.readFile(binding.rendererAsarPath);assert.equal(digest(rendererBytes),binding.rendererAsarSha256);
 const png=await fs.readFile(capture.path);assert.equal(digest(png),capture.sha256);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.ok(Number.isFinite(Date.parse(capture.capturedAt)));assert.ok(observation.target?.pid>0);assert.ok(observation.target?.hwnd);
 assert.equal(observation.target.processPath,binding.artifactPath);assert.equal(observation.target.processSha256,binding.artifactSha256);
 return {version:1,capturedAt:capture.capturedAt,sourceCommit:binding.sourceCommit,sourceStartCommit:observation.sourceStartCommit,sourceEndCommit:observation.sourceEndCommit,route:'cheap-lowlevel-headless',artifact:{path:binding.artifactPath,sha256:binding.artifactSha256,buildReceiptPath:binding.buildReceiptPath,buildReceiptSha256:binding.buildReceiptSha256},renderer:{path:binding.rendererAsarPath,sha256:binding.rendererAsarSha256},screenshot:{path:capture.path,sha256:capture.sha256,width:png.readUInt32BE(16),height:png.readUInt32BE(20)},target:{...observation.target,selector:measurement.selector,matchedCount:1,chosenIndex:0,viewport:measurement.viewport},privacy:observation.privacy,ownership:observation.ownership,runtime:observation.runtime,elements:measurement.elements,scaleEvidence:{kind:'cdp-device-metrics-emulation',requested:tuple.scale,observedDevicePixelRatio:measurement.viewport.scale,physicalWindowsDisplayScaleVerified:false}};
}
