import assert from 'node:assert/strict';
import {withCdpConnectionProof} from './cdp-connection-plan.mjs';
import path from 'node:path';
import {runModernPhase,matrix,makeWorkspacePlan,makeDialogPlan,makeClearPlan} from './modern-ui-check.mjs';

export function assertModernCaptureInventory(captures,launch) {
 const receipt=path.join(launch.runRoot,'lifecycle.json');
 const plans=matrix.flatMap(tuple=>[makeWorkspacePlan({launch,receipt,tuple}),makeDialogPlan({launch,receipt,tuple})]);
 for(const phase of ['workspace','dialog'])plans.push(makeClearPlan({launch,receipt,phase,tuple:matrix[0]}));
 const required=plans.flatMap(plan=>plan.steps.filter(step=>step.op==='capture').map(step=>path.resolve(step.path)));
 assert.equal(required.length,445);assert.equal(new Set(required).size,445);
 for(const name of ['native-baseline.png','baseline.png','native-keyboard-tab.png'])required.push(path.resolve(launch.outputRoot,name));
 const actual=captures.map(capture=>path.resolve(capture.path));assert.equal(new Set(actual).size,actual.length,'Duplicate capture inventory entry');
 const available=new Set(actual);assert.ok(required.every(file=>available.has(file)),'Independent modern capture inventory is incomplete');
 return true;
}

export function verificationScope(env) {
 const scope=env.MFE_VERIFICATION_SCOPE||'full';
 assert.ok(['full','modern-only'].includes(scope),'Unknown verification scope');
 return scope;
}

export function modernStartupReadiness(state,applicationError=false) {
 const failed=applicationError||Boolean(state?.sync?.error)||Boolean(state?.driver?.checking===false&&state?.driver?.available===false);
 return {failed,ready:!failed&&state?.driver?.checking===false&&state?.driver?.available===true&&state?.locked===false&&state?.mounted===true&&state?.operation==null};
}

export function verifierSourceBinding({scope,targetSource,actualSource,requestedVerifierSource}) {
 for(const value of [targetSource,actualSource])assert.match(value,/^[a-f0-9]{40}$/);
 if(requestedVerifierSource!==undefined){assert.equal(scope,'modern-only','Separate verifier binding is limited to modern-only scope');assert.equal(requestedVerifierSource,actualSource,'Verifier source does not match its checkout');}
 else assert.equal(actualSource,targetSource,'Separate target and verifier sources require explicit verifier binding');
 return {targetSourceCommit:targetSource,verifierSourceCommit:actualSource};
}

// Native fixture creation is setup, never evidence of the GUI create workflow.
export async function runIndependentModern({fixture,launch,receipt,executePlan,probeEvidence,runPhase=runModernPhase}) {
 const plan=steps=>withCdpConnectionProof({version:1,receipt,endpoint:`http://127.0.0.1:${launch.cdp.port}`,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:30000,steps},'control');
 const startup=await executePlan(plan([
  {id:'modern-startup-observation',op:'evaluate',expression:'window.__mfeModernStartup={done:false,inFlight:false};true'},
  {id:'modern-startup-ready',op:'poll',intervalMs:100,equals:true,expression:`(()=>{const p=window.__mfeModernStartup;if(p.done)return true;if(!p.inFlight){p.inFlight=true;window.drive.status().then(s=>{p.inFlight=false;const result=(${modernStartupReadiness.toString()})(s,document.querySelector('#main-error')?.hidden===false);if(result.failed){p.done=true;p.failed=true;}else if(result.ready){p.done=true;p.ready=true;}},()=>{p.done=true;p.failed=true;p.inFlight=false;});}return p.done;})()`},
  {id:'modern-startup-result',op:'evaluate',expression:'window.__mfeModernStartup'}
 ]));
 const ready=startup.results?.at(-1)?.value;assert.equal(ready?.done,true);assert.equal(ready.failed,undefined,'Modern fixture startup failed');assert.equal(ready.ready,true,'Modern fixture startup is not ready');
 const inspect=async label=>{
  const key='__mfeModernFixture';
  const result=await executePlan(plan([
   {id:label+'-begin',op:'evaluate',expression:`window.${key}={done:false};window.drive.status().then(s=>{window.${key}={done:true,value:{locked:s.locked,mounted:s.mounted,storageDir:s.storageDir,cacheDir:s.cacheDir,driveLetter:s.driveLetter}}},()=>{window.${key}={done:true,failed:true}});true`},
   {id:label+'-wait',op:'poll',expression:`window.${key}.done`,equals:true,intervalMs:100},
   {id:label+'-read',op:'evaluate',expression:`window.${key}`}
  ]));
  const observed=result.results?.at(-1)?.value;
  assert.equal(observed?.done,true);assert.equal(observed.failed,undefined);
  for(const key of ['storageDir','cacheDir','driveLetter'])assert.equal(observed.value[key],fixture[key],'Modern fixture identity changed');
  return observed.value;
 };
 const before=await inspect('modern-fixture-mounted');assert.equal(before.locked,false);assert.equal(before.mounted,true);
 const workspace=await runPhase({launch,receipt,phase:'workspace',executePlan,probeEvidence});
 await executePlan(plan([
  {id:'modern-original-drive',op:'click',selector:'[data-view="drive"]'},
  {id:'modern-original-drive-visible',op:'poll',expression:"!document.querySelector('#view-drive').hidden && !document.querySelector('#lock-button').disabled",equals:true,intervalMs:100},
  {id:'modern-original-lock',op:'click',selector:'#lock-button'},
  {id:'modern-original-locked',op:'poll',expression:"document.querySelector('#vault-badge').dataset.state === 'locked' && document.querySelector('#main-error').hidden",equals:true,intervalMs:100}
 ]));
 const after=await inspect('modern-fixture-locked');assert.equal(after.locked,true);assert.equal(after.mounted,false);
 const dialog=await runPhase({launch,receipt,phase:'dialog',executePlan,probeEvidence});
 return {scope:'modern-only',fixturePreparation:'native-created-empty',guiCreationVerified:false,archiveCoverage:'empty-history-recycle-offline',fixtureIdentityVerified:true,originalLocked:true,fixtureObservations:{before,after},workspace,dialog,rendererAssertionsVerified:true};
}

export function modernPhaseVerdict(receipt) {
 const pending=[];const require=(condition,reason)=>{if(!condition)pending.push(reason);};
 require(receipt.verificationScope==='modern-only','Explicit modern-only scope');
 require(/^[a-f0-9]{40}$/.test(receipt.sourceCommit||'')&&[receipt.executableSha256,receipt.resourceHashes?.asar,receipt.resourceHashes?.nativeHost].every(x=>/^[a-f0-9]{64}$/.test(x||'')),'Exact source and packaged resources');
 require(receipt.verifierBinding?.targetSourceCommit===receipt.sourceCommit&&/^[a-f0-9]{40}$/.test(receipt.verifierBinding?.verifierSourceCommit||''),'Explicit target and verifier source binding');
 require(receipt.launched===true,'Fresh packaged launch');
 if(receipt.transport==='direct-cheap-cli') {
  try{assert.equal(receipt.transportProvenance?.version,1);assert.equal(receipt.launchTransportBinding?.transport,receipt.transport);assert.deepEqual(receipt.launchTransportBinding?.transportProvenance,receipt.transportProvenance);assert.match(receipt.launchTransportBinding?.lifecycleReceiptSha256||'',/^[a-f0-9]{64}$/);}catch{pending.push('Prepared and launched direct transport binding');}
 }
 require(receipt.baselineReview?.inspected===true&&receipt.baselineReview?.privacyPassed===true,'Inspected native baseline');
 require(receipt.keyboard?.verified===true,'Native keyboard focus transitions');
 const phase=receipt.modernPhase;
 require(phase?.scope==='modern-only'&&phase?.fixtureIdentityVerified===true&&phase?.originalLocked===true,'Exact mounted fixture and real GUI lock');
 for(const name of ['workspace','dialog'])require(phase?.[name]?.phase===name&&phase[name].tuplesVerified===48&&phase[name].clearControlsVerified===true&&phase[name].probeReceiptsVerified===true,`Complete ${name} matrix and clear-control probes`);
 let inventoryComplete=false;
 try{inventoryComplete=assertModernCaptureInventory(receipt.captureReview?.inventory?.captures,receipt.launch);}catch{}
 require(receipt.captureReview?.verified===true&&receipt.captureReview?.provenanceVerified===true&&inventoryComplete,'Every capture inspected and provenance-bound');
 require(receipt.cleanup?.client_ok===true&&receipt.cleanup?.recordedProcessesAbsent===true&&receipt.cleanup?.desktopClosed===true,'Owned process absence and desktop closure');
 require(receipt.quitRecovery?.restored===true,'Verification startup state restored');
 require(receipt.fixtureCleanup?.ownedCredentialForgotten===true,'Owned fixture credential retired');
 require(!receipt.failure,'Resolve recorded runtime failure');
 return {passed:pending.length===0,pending,verificationScope:'modern-only',fullWorkflowVerified:false};
}
