import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {makeLaunch,makeBaselinePlan,makeInterfacePlan,validateCaptureReview,finalVerdict} from '../scripts/local-headless-desktop-check.mjs';
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

test('interface workflow asserts states after actions and keeps native proof separate',()=>{
 const root=path.join(os.tmpdir(),'owned-run');const launch=makeLaunch({executable:path.join(root,'package','app.exe'),runRoot:root,port:9333});const plan=makeInterfacePlan(launch,path.join(root,'lifecycle.json'));
 assert.ok(plan.steps.length<=100);assert.ok(plan.steps.some(step=>step.id==='locked-history-state'));assert.ok(plan.steps.some(step=>step.id==='locked-recycle-state'));
 for(const [index,step] of plan.steps.entries())if(['click','type'].includes(step.op)){assert.equal(plan.steps[index+1].op,'poll');assert.equal(plan.steps[index+2].op,'capture');}
 assert.equal(JSON.stringify(plan).includes('password-input'),false);assert.equal(JSON.stringify(plan).includes('awaitPromise'),false);
});

import {spawnSync} from 'node:child_process';
test('automatic desktop disappearance requires exact not-found code and every recorded process absent',()=>{
 const result=spawnSync('python',['-B','-c',`import importlib.util
spec=importlib.util.spec_from_file_location('policy','scripts/local-headless-desktop-check-policy.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
owned=[{'pid':77,'creationDate':'recorded'}]
missing={'ok':False,'client_ok':False,'error':"OpenDesktopW('owned') failed (GetLastError=2: The system cannot find the file specified.)"}
assert p.automatically_closed(missing,'owned',owned,lambda _:True)
assert not p.automatically_closed(missing,'owned',owned,lambda _:False)
assert not p.automatically_closed(missing,'other',owned,lambda _:True)
assert not p.automatically_closed(missing,'owned',[],lambda _:True)
for code in [5,6,87]:
 value=dict(missing);value['error']=value['error'].replace('GetLastError=2:','GetLastError='+str(code)+':');assert not p.automatically_closed(value,'owned',owned,lambda _:True)
value=dict(missing);value['windows']=[{'pid':88}];assert not p.automatically_closed(value,'owned',owned,lambda _:True)
`],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});

test('final review binds every exact image, source and executable, with explicit inspection and privacy',()=>{
 const binding={sourceCommit:'a'.repeat(40),executableSha256:'b'.repeat(64)};const inventory=[{path:'/owned/a.png',sha256:'c'.repeat(64)},{path:'/owned/b.png',sha256:'d'.repeat(64)}];const review={version:1,...binding,captures:inventory.map(item=>({...item,inspected:true,privacyPassed:true}))};
 assert.equal(validateCaptureReview(review,inventory,binding),true);assert.equal(validateCaptureReview({...review,captures:review.captures.slice(1)},inventory,binding),false);
 for(const key of ['inspected','privacyPassed']) {const value=structuredClone(review);value.captures[0][key]=false;assert.equal(validateCaptureReview(value,inventory,binding),false);}
 const stale=structuredClone(review);stale.captures[0].sha256='e'.repeat(64);assert.equal(validateCaptureReview(stale,inventory,binding),false);assert.equal(validateCaptureReview({...review,sourceCommit:'f'.repeat(40)},inventory,binding),false);
});
test('passing receipt requires runtime, real keyboard, pixels, cleanup, startup and owned credential proof',()=>{
 const receipt={sourceCommit:'a'.repeat(40),executableSha256:'b'.repeat(64),resourceHashes:{asar:'c'.repeat(64),nativeHost:'d'.repeat(64)},launched:true,runtime:{mountedFilesystemVerified:true,rendererAssertionsVerified:true,startupRegistration:{restored:true,verificationOnly:true,enabledReadback:true,disabledReadback:false}},keyboard:{verified:true},captureReview:{verified:true},cleanup:{client_ok:true,recordedProcessesAbsent:true,desktopClosed:true},fixtureCleanup:{ownedCredentialForgotten:true}};
 assert.equal(finalVerdict(receipt).passed,true);for(const key of ['runtime','keyboard','captureReview','cleanup','fixtureCleanup']) {const value=structuredClone(receipt);delete value[key];assert.equal(finalVerdict(value).passed,false);}
 assert.equal(finalVerdict({...receipt,failure:'runtime failure'}).passed,false);assert.equal(finalVerdict({...receipt,sourceCommit:undefined}).passed,false);
});
