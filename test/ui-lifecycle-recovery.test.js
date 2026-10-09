import test from 'node:test';
import assert from 'node:assert/strict';
import {finishOwnedLifecycle} from '../scripts/local-headless-desktop-check.mjs';
const input={launch:{cdp:{port:9333,expectedUrl:'file:///owned/resources/app.asar/src/renderer/index.html'}},statePath:'C:/owned/lifecycle.json',python:'python',lowlevel:'owned-adapter.py'};
const success={ok:true,client_ok:true,recordedProcessesAbsent:true,desktopClosed:true};
test('failed flow validates the isolated window and exit ancestry before normal verification quit',async()=>{
 const calls=[];
 const result=await finishOwnedLifecycle({...input,runCommand:async(_exe,args)=>{calls.push(args);return success;},executePlan:async plan=>{calls.push('quit');assert.equal(plan.receipt,input.statePath);assert.equal(plan.expectedUrl,input.launch.cdp.expectedUrl);assert.equal(plan.endpoint,'http://127.0.0.1:9333');assert.ok(plan.steps.some(step=>step.expression?.includes('window.drive.verificationQuit()')));return {results:[{value:{done:true,value:{restored:true}}}]};}});
 assert.deepEqual(calls.map(call=>typeof call==='string'?call:call[1]),['wait-window','prepare-exit','quit','confirm-exit']);
 assert.equal(result.quitRequested,true);assert.equal(result.recovery.restored,true);assert.equal(result.cleanup,success);
});
test('unavailable quit route falls back only to validated close without termination flags',async()=>{
 const calls=[];const retained={ok:false,client_ok:false,code:'OWNED_PROCESSES_REMAIN'};
 const result=await finishOwnedLifecycle({...input,runCommand:async(_exe,args)=>{calls.push(args);return retained;},executePlan:async()=>{throw Object.assign(new Error('Target unavailable'),{helperCode:'EXPECTED_TARGET_NOT_FOUND'});}});
 assert.equal(calls.at(-1)[1],'cleanup');assert.ok(!calls.flat().includes('--allow-saved-pid-kill'));assert.equal(result.cleanup,retained);assert.equal(result.quitRequested,false);
});
test('identity and query failures stop recovery before quit or cleanup',async()=>{
 for(const code of ['UNPROVEN_PROCESS_ANCESTRY','PROCESS_IDENTITY_CHANGED','INVALID_PROCESS_IDENTITY','INVALID_PROCESS_TREE','PROCESS_PROOF_FAILED','IDENTITY_BOUND_TERMINATION_UNAVAILABLE']) {
  let calls=0;let quit=0;
  const result=await finishOwnedLifecycle({...input,runCommand:async()=>{calls++;throw Object.assign(new Error(code),{helperCode:code});},executePlan:async()=>{quit++;}});
  assert.equal(calls,1);assert.equal(quit,0);assert.equal(result.cleanup.code,code);assert.equal(result.cleanup.client_ok,false);
 }
});
test('already successful normal quit confirms absence without another quit request',async()=>{
 const calls=[];const result=await finishOwnedLifecycle({...input,runtime:{quitRequested:true},runCommand:async(_exe,args)=>{calls.push(args);return success;},executePlan:async()=>{throw new Error('Unexpected repeated quit');}});
 assert.equal(calls.length,1);assert.equal(calls[0][1],'confirm-exit');assert.equal(result.cleanup,success);
});
test('unrestored quit does not claim graceful exit and retains unavailable identity-bound cleanup',async()=>{
 const retained={ok:false,client_ok:false,code:'IDENTITY_BOUND_TERMINATION_UNAVAILABLE'};
 const result=await finishOwnedLifecycle({...input,runCommand:async()=>retained,executePlan:async()=>({results:[{value:{done:true,value:{restored:false}}}]})});
 assert.equal(result.recovery.code,'VERIFICATION_QUIT_NOT_RESTORED');assert.equal(result.quitRequested,false);assert.equal(result.cleanup,retained);
});
