import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {withCdpConnectionProof} from '../scripts/cdp-connection-plan.mjs';
import {createPlanRecorder,helperFailure} from '../scripts/local-headless-desktop-check.mjs';

test('connection purpose budgets proof only and strips inherited budgets from recovery',()=>{
 const plan={version:1,steps:[{id:'action',op:'click',selector:'#owned'}],startupOwnershipAttempts:2};
 for(const purpose of ['runtime','control','capture','modern-observation']){
  const result=withCdpConnectionProof(plan,purpose);assert.equal(result.startupOwnershipAttempts,3);assert.equal(result.steps,plan.steps);assert.equal(plan.startupOwnershipAttempts,2);
 }
 for(const purpose of ['recovery','teardown']){const result=withCdpConnectionProof(plan,purpose);assert.equal(Object.hasOwn(result,'startupOwnershipAttempts'),false);assert.equal(result.steps,plan.steps);}
 assert.throws(()=>withCdpConnectionProof(plan,'unknown'));
});
test('plan recording never retries a failed or partially executed action sequence',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-connection-test-'));
 try {
  let calls=0;const execute=createPlanRecorder(root,async()=>{calls++;throw helperFailure({code:'SELECTOR_ACTION_FAILED',results:[{id:'already-done',op:'click'}]});});
  await assert.rejects(execute(withCdpConnectionProof({steps:[{id:'already-done',op:'click'}]})));
  assert.equal(calls,1);const rows=(await fs.readFile(path.join(root,'step-receipts.jsonl'),'utf8')).trim().split('\n');assert.equal(rows.length,1);assert.equal(JSON.parse(rows[0]).result.results.length,1);assert.equal(JSON.parse(rows[0]).startupOwnershipAttempts,3);
 }finally{await fs.rm(root,{recursive:true});}
});
test('runtime construction budgets each attachment but normal quit is teardown',async()=>{
 const source=await fs.readFile(new URL('../scripts/preview-runtime-fixture.mjs',import.meta.url),'utf8');
 assert.match(source,/const execute=async \(steps,purpose='runtime'\)=>executePlan\(withCdpConnectionProof/);
 assert.match(source,/expression:"window[.]__mfeQuit"\}\],'teardown'\)/);
});
