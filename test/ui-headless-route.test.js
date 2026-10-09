import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {makeLaunch,makeBaselinePlan} from '../scripts/local-headless-desktop-check.mjs';
test('local launch binds exact executable, isolated profile and loopback debugging to one run',()=>{
 const root=path.join(os.tmpdir(),'owned-run');const executable=path.join(root,'package','MaterialFileEncryptor.exe');
 const launch=makeLaunch({executable,runRoot:root,port:9333});
 assert.equal(launch.executable,executable);assert.ok(launch.arguments.includes('--verification-profile='+path.join(root,'profile')));assert.ok(launch.arguments.includes('--remote-debugging-address=127.0.0.1'));
 assert.match(launch.cdp.expectedUrl,/resources\/app.asar\/src\/renderer\/index.html$/);
 const plan=makeBaselinePlan(launch,path.join(root,'lifecycle.json'));assert.equal(plan.endpoint,'http://127.0.0.1:9333');assert.equal(plan.receipt,path.join(root,'lifecycle.json'));assert.equal(plan.expectedUrl,launch.cdp.expectedUrl);
 assert.equal(plan.steps.filter(step=>step.op==='click'||step.op==='type').length,0);assert.equal(plan.steps.at(-1).op,'capture');assert.equal(plan.steps.at(-1).overwrite,false);
});
test('invalid local launch roots and ports cannot produce a launch request',()=>{
 const root=path.join(os.tmpdir(),'owned-run');const executable=path.join(root,'package','app.exe');
 for(const port of [0,1023,65536,1.5])assert.throws(()=>makeLaunch({executable,runRoot:root,port}));
 assert.throws(()=>makeLaunch({executable:'relative.exe',runRoot:root,port:9333}));assert.throws(()=>makeLaunch({executable,runRoot:'relative',port:9333}));
});
