import assert from 'node:assert/strict';
import {modelReadinessSettled} from './gui-acceptance-acquire.mjs';

// Observes the already admitted page only. This is not a replacement for the
// complete native proof required by the following setup/action/capture plan.
export function createModelReadinessObserver({opened,timeoutMs=30000,intervalMs=100}) {
 assert.equal(opened?.connectionOwned,true);assert.equal(opened.backend,'native-v1');
 assert.equal(opened.nativeConnection?.route,'native-v1-connected-cdp');
 assert.equal(opened.nativeConnection.expectedUrl,opened.target.expectedUrl);
 assert.ok(Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=120000);
 assert.ok(Number.isInteger(intervalMs)&&intervalMs>=10&&intervalMs<=1000);
 let inFlight=false,poisoned=false;
 const checkTarget=()=>{
  if(opened.connectionOwned!==true||opened.receipt?.closed===true||opened.page.isClosed()||opened.page.url()!==opened.target.expectedUrl)throw Object.assign(new Error('Admitted readiness target changed or closed.'),{code:'READINESS_TARGET_CHANGED'});
 };
 return async function beforeSetup({binding,phase}) {
  assert.equal(inFlight,false,'Concurrent readiness observations are prohibited');assert.equal(poisoned,false,'Timed-out readiness observer cannot be reused');
  assert.equal(binding.sourceCommit,opened.target.sourceCommit);assert.ok(['initial','restored'].includes(phase));
  inFlight=true;
  const started=Date.now(),deadline=started+timeoutMs;
  const evidence={version:1,kind:'model-startup-readiness-observation',phase,sourceCommit:binding.sourceCommit,verifierSourceCommit:opened.receipt.verifierSourceCommit,startedAt:new Date(started).toISOString(),endedAt:null,observations:0,last:null,settled:false,nativeProof:false};
  const timeout=()=>{poisoned=true;return Object.assign(new Error('Model startup readiness did not settle before its deadline.'),{code:'READINESS_TIMEOUT'});};
  const bounded=async operation=>{const remaining=deadline-Date.now();if(remaining<=0)throw timeout();let timer;try{return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(timeout()),remaining);})]);}finally{clearTimeout(timer);}};
  try{
   for(;;){
    checkTarget();
    let value;
    try{value=await bounded(()=>opened.page.evaluate(async()=>{
     const result=(await window.drive.status()).modelStartupReadiness;if(!result)return null;
     const state=value=>['not-started','pending','settled','failed'].includes(value)?value:null;
     const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=65535?value:null;
     return {schemaVersion:result.schemaVersion===1?1:null,state:state(result.state),initialization:state(result.initialization),inspection:state(result.inspection),pendingRequests:count(result.pendingRequests),pendingOperations:count(result.pendingOperations)};
    }));}catch(error){if(error.code==='READINESS_TIMEOUT')throw error;throw Object.assign(new Error('Actual model startup status could not be read.'),{code:'READINESS_STATUS_UNAVAILABLE'});}
    checkTarget();evidence.observations++;evidence.last=value;
    if(modelReadinessSettled(value)){evidence.settled=true;return evidence;}
    await bounded(()=>new Promise(resolve=>setTimeout(resolve,intervalMs)));
   }
  }catch(error){evidence.code=error.code||'READINESS_UNAVAILABLE';throw Object.assign(error,{readinessEvidence:evidence});}
  finally{evidence.endedAt=new Date().toISOString();inFlight=false;}
 };
}
