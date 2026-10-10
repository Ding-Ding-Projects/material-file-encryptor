import test from 'node:test';
import assert from 'node:assert/strict';
import {verificationScope,runIndependentModern,modernPhaseVerdict,assertModernCaptureInventory,modernStartupReadiness,verifierSourceBinding} from '../scripts/modern-phase.mjs';
import {finalVerdict,resumeCaptureReview} from '../scripts/local-headless-desktop-check.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const fixture={storageDir:'C:/owned/storage',cacheDir:'C:/owned/cache',driveLetter:'M:'};
const launch={cdp:{port:9333,expectedUrl:'file:///C:/owned/resources/app.asar/src/renderer/index.html'}};
const phase=name=>({phase:name,tuplesVerified:48,clearControlsVerified:true,probeReceiptsVerified:true});
function setup(patch={}) {
 const events=[];let locked=false;
 const executePlan=async plan=>{
  events.push(plan.steps.map(step=>step.id));assert.equal(plan.startupOwnershipAttempts,3);
  if(plan.steps[0].id==='modern-startup-observation')return {results:[{value:{done:true,ready:true}}]};
  if(plan.steps.some(step=>step.id==='modern-original-lock')){assert.equal(plan.steps.find(step=>step.id==='modern-original-lock').op,'click');locked=true;return {ok:true,results:[]};}
  const value={...fixture,locked,mounted:!locked,...patch};
  return {ok:true,results:[{value:{done:true,value}}]};
 };
 const runPhase=async options=>{events.push(options.phase);return phase(options.phase);};
 return {events,options:{fixture,launch,receipt:'C:/owned/lifecycle.json',executePlan,probeEvidence:{},runPhase}};
}
test('modern scope is explicit and unsupported selectors fail before launch',()=>{
 assert.equal(verificationScope({}),'full');assert.equal(verificationScope({MFE_VERIFICATION_SCOPE:'modern-only'}),'modern-only');
 assert.throws(()=>verificationScope({MFE_VERIFICATION_SCOPE:'skip-workflows'}));
});
test('independent phases bracket an actual GUI lock with exact backend fixture proof',async()=>{
 const {events,options}=setup();const result=await runIndependentModern(options);
 assert.deepEqual(events.filter(x=>typeof x==='string'),['workspace','dialog']);
 assert.equal(events[2],'workspace');assert.ok(events[3].includes('modern-original-lock'));assert.equal(events[5],'dialog');
 assert.equal(result.fixtureObservations.before.mounted,true);assert.equal(result.fixtureObservations.after.mounted,false);
 assert.equal(result.guiCreationVerified,false);assert.equal(result.archiveCoverage,'empty-history-recycle-offline');
 for(const key of ['copyUpgrade','transportSetup','startupRegistration','mountedFilesystemVerified'])assert.equal(Object.hasOwn(result,key),false);
});
test('wrong fixture, failed status, and unsuccessful lock cannot reach dialog matrix',async()=>{
 for(const patch of [{storageDir:'C:/other'},{cacheDir:'C:/other'},{driveLetter:'N:'},{locked:true},{mounted:false}]){const f=setup(patch);await assert.rejects(runIndependentModern(f.options));assert.equal(f.events.includes('dialog'),false);}
 const f=setup();const original=f.options.executePlan;let reads=0;f.options.executePlan=async plan=>{const result=await original(plan);if(plan.steps[0].id.endsWith('-begin')&&++reads===2)result.results[0].value.value.mounted=true;return result;};
 await assert.rejects(runIndependentModern(f.options));assert.equal(f.events.includes('dialog'),false);
 const g=setup();g.options.executePlan=async()=>({results:[{value:{done:true,failed:true}}]});await assert.rejects(runIndependentModern(g.options));assert.equal(g.events.length,0);
});
function captureInventory(launch) {
 const names=['native-baseline.png','baseline.png','native-keyboard-tab.png'];
 for(const [width,height]of [[1180,850],[880,650]])for(const language of ['en','yue','bilingual'])for(const theme of ['light','dark'])for(const scale of ['1','1_25','1_5','2']) {
  const tuple=`${width}x${height}-${language}-${theme}-${scale}`;
  for(const state of ['drive','offline','history','recycle','settings','help','dialog-password','dialog-keyFile','dialog-privateGit'])names.push(`modern-${tuple}-${state}.png`);
 }
 for(const field of ['file-search','part-size','retention','history-search','recycle-search','storage','cache','letter','password','confirm','creation-size','key-path','repository'])names.push(`modern-clear-${field}.png`);
 return names.map(name=>({path:path.join(launch.outputRoot,name)}));
}
function completeReceipt(){const launch={runRoot:path.resolve('owned'),outputRoot:path.resolve('owned/output'),cdp:{port:9333,expectedUrl:'file:///C:/owned/index.html'}};return {launch,verifierBinding:{targetSourceCommit:'a'.repeat(40),verifierSourceCommit:'e'.repeat(40)},verificationScope:'modern-only',sourceCommit:'a'.repeat(40),executableSha256:'b'.repeat(64),resourceHashes:{asar:'c'.repeat(64),nativeHost:'d'.repeat(64)},launched:true,baselineReview:{inspected:true,privacyPassed:true},keyboard:{verified:true},modernPhase:{scope:'modern-only',fixtureIdentityVerified:true,originalLocked:true,workspace:phase('workspace'),dialog:phase('dialog')},captureReview:{verified:true,provenanceVerified:true,inventory:{captures:captureInventory(launch)}},cleanup:{client_ok:true,recordedProcessesAbsent:true,desktopClosed:true},quitRecovery:{restored:true},fixtureCleanup:{ownedCredentialForgotten:true}};}
test('modern acceptance remains distinct from full workflow acceptance',()=>{
 const receipt=completeReceipt();assert.equal(modernPhaseVerdict(receipt).passed,true);assert.equal(modernPhaseVerdict(receipt).fullWorkflowVerified,false);assert.equal(finalVerdict(receipt).passed,false);
 assert.ok(finalVerdict(receipt).pending.some(x=>x.includes('copy upgrade')));
});
test('partial matrices, missing review, closure and retirement fail the phase verdict',()=>{
 for(const modify of [r=>r.modernPhase.workspace.tuplesVerified=47,r=>r.modernPhase.dialog.clearControlsVerified=false,r=>r.modernPhase.dialog.probeReceiptsVerified=false,r=>r.modernPhase.originalLocked=false,r=>r.captureReview.provenanceVerified=false,r=>r.cleanup.recordedProcessesAbsent=false,r=>r.cleanup.desktopClosed=false,r=>r.fixtureCleanup.ownedCredentialForgotten=false,r=>r.quitRecovery.restored=false,r=>r.keyboard.verified=false,r=>r.baselineReview.inspected=false,r=>r.failure='PLAN_TIMEOUT',r=>r.transport='direct-cheap-cli']){const receipt=completeReceipt();modify(receipt);assert.equal(modernPhaseVerdict(receipt).passed,false);}
});

test('pixel review resumes a completed modern phase without inventing full workflow flags',async t=>{
 const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'mfe-modern-review-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const executable=path.join(root,'package','app.exe');await fs.mkdir(path.join(root,'package','resources','native'),{recursive:true});await fs.mkdir(path.join(root,'output'));
 const receipt=completeReceipt();receipt.launch={...receipt.launch,runRoot:root,outputRoot:path.join(root,'output'),executable};delete receipt.captureReview;receipt.reviewPending='Not yet reviewed';
 const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
 for(const [relative,field]of [['app.exe','executable'],['resources/app.asar','asar'],['resources/native/MaterialFileEncryptor.Host.exe','nativeHost']]){const bytes=Buffer.from(relative);await fs.writeFile(path.join(root,'package',relative),bytes);if(field==='executable')receipt.executableSha256=digest(bytes);else receipt.resourceHashes[field]=digest(bytes);}
 const receiptPath=path.join(root,'verification.json');const save=()=>fs.writeFile(receiptPath,JSON.stringify(receipt));await save();let calls=0;
 await fs.writeFile(path.join(root,'step-receipts.jsonl'),'');
 await assert.rejects(resumeCaptureReview(root),/capture inventory is incomplete/);
 const review=async()=>{calls++;return {verified:true,provenanceVerified:true,inventory:{captures:captureInventory(receipt.launch)}};};
 const result=await resumeCaptureReview(root,{review});assert.equal(result.passed,true);assert.equal(result.fullWorkflowVerified,false);assert.equal(result.runtime,undefined);assert.equal(calls,1);
 for(const mutate of [r=>r.failure='PLAN_TIMEOUT',r=>r.cleanup.desktopClosed=false,r=>r.modernPhase.workspace.tuplesVerified=47,r=>r.fixtureCleanup.ownedCredentialForgotten=false]){const original=structuredClone(receipt);mutate(receipt);await save();await assert.rejects(resumeCaptureReview(root,{review}));Object.assign(receipt,original);delete receipt.failure;assert.equal(calls,1);}
 await save();await fs.writeFile(executable,'changed');await assert.rejects(resumeCaptureReview(root,{review}));assert.equal(calls,1);
});

test('exact capture inventory rejects a missing workspace, dialog, clear or baseline original',()=>{
 const receipt=completeReceipt(),captures=receipt.captureReview.inventory.captures;
 assert.equal(captures.length,448);assert.equal(assertModernCaptureInventory(captures,receipt.launch),true);
 for(const name of ['modern-1180x850-en-light-1-drive.png','modern-880x650-bilingual-dark-2-dialog-privateGit.png','modern-clear-repository.png','baseline.png']) {
  const removed=captures.filter(item=>path.basename(item.path)!==name);assert.equal(removed.length,447);
  assert.throws(()=>assertModernCaptureInventory(removed,receipt.launch));
  assert.equal(modernPhaseVerdict({...receipt,captureReview:{...receipt.captureReview,inventory:{captures:removed}}}).passed,false);
 }
 assert.throws(()=>assertModernCaptureInventory([...captures,captures[0]],receipt.launch));
});

test('read-only startup observation waits for delayed mount and stops on startup failure',async()=>{
 const f=setup(),original=f.options.executePlan;let polls=0;
 f.options.executePlan=async plan=>{
  if(plan.steps[0].id!=='modern-startup-observation')return original(plan);
  assert.equal(plan.timeoutMs,30000);assert.deepEqual(plan.steps.map(x=>x.op),['evaluate','poll','evaluate']);
  const snapshots=[{locked:true,mounted:false,driver:{checking:true}},{locked:false,mounted:false,driver:{checking:false,available:true}},{locked:false,mounted:true,driver:{checking:false,available:true}}];
  const context={window:{drive:{status:async()=>{polls++;return snapshots.shift();}}},document:{querySelector:()=>({hidden:true})}};
  vm.runInNewContext(plan.steps[0].expression,context);
  for(let i=0;i<3;i++){assert.equal(vm.runInNewContext(plan.steps[1].expression,context),false);await Promise.resolve();}
  assert.equal(vm.runInNewContext(plan.steps[1].expression,context),true);
  return {results:[{value:vm.runInNewContext(plan.steps[2].expression,context)}]};
 };
 await runIndependentModern(f.options);assert.equal(polls,3);
 for(const failedState of [{sync:{error:'startup failed'}},{driver:{checking:false,available:false}}])assert.equal(modernStartupReadiness(failedState).failed,true);
 assert.equal(modernStartupReadiness({locked:false,mounted:true},true).failed,true);
 assert.equal(modernStartupReadiness({locked:false,mounted:true}).ready,false);
 const queryFailure=setup();queryFailure.options.executePlan=async plan=>{
  const context={window:{drive:{status:()=>Promise.reject(new Error('status unavailable'))}},document:{querySelector:()=>({hidden:true})}};
  vm.runInNewContext(plan.steps[0].expression,context);assert.equal(vm.runInNewContext(plan.steps[1].expression,context),false);await Promise.resolve();
  assert.equal(vm.runInNewContext(plan.steps[1].expression,context),true);return {results:[{value:vm.runInNewContext(plan.steps[2].expression,context)}]};
 };await assert.rejects(runIndependentModern(queryFailure.options),/startup failed/);assert.equal(queryFailure.events.length,0);
 const g=setup();g.options.executePlan=async plan=>{assert.equal(plan.steps[0].id,'modern-startup-observation');return {results:[{value:{done:true,failed:true}}]};};await assert.rejects(runIndependentModern(g.options),/startup failed/);assert.equal(g.events.length,0);
 const h=setup();h.options.executePlan=async()=>{throw new Error('PLAN_TIMEOUT');};await assert.rejects(runIndependentModern(h.options),/PLAN_TIMEOUT/);assert.equal(h.events.length,0);
});
test('separate verifier source is explicit and never relabels packaged source',()=>{
 const target='a'.repeat(40),actual='b'.repeat(40);
 assert.throws(()=>verifierSourceBinding({scope:'modern-only',targetSource:target,actualSource:actual}));
 assert.throws(()=>verifierSourceBinding({scope:'full',targetSource:target,actualSource:actual,requestedVerifierSource:actual}));
 assert.throws(()=>verifierSourceBinding({scope:'modern-only',targetSource:target,actualSource:actual,requestedVerifierSource:target}));
 assert.deepEqual(verifierSourceBinding({scope:'modern-only',targetSource:target,actualSource:actual,requestedVerifierSource:actual}),{targetSourceCommit:target,verifierSourceCommit:actual});
 const receipt=completeReceipt();delete receipt.verifierBinding;assert.equal(modernPhaseVerdict(receipt).passed,false);
});
