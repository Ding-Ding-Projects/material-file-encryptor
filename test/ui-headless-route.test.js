import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {directLaunchTransportBinding,lifecycleTransport,safeFailureDetails,resumeCaptureReview,makeLaunch,makeBaselinePlan,makeInterfacePlan,validateCaptureReview,finalVerdict,helperFailure,createPlanRecorder,recordNativeCapture,captureProvenance} from '../scripts/local-headless-desktop-check.mjs';

test('direct launch binds actual lifecycle provenance to prepared identity before acceptance',()=>{
 const prepared={transport:'direct-cheap-cli',transportProvenance:{version:1,cli:{sha256:'a'.repeat(64)},sourceCommit:'a'.repeat(40)}};
 const lifecycle={transport:prepared.transport,transportProvenance:structuredClone(prepared.transportProvenance),pid:7};
 const bytes=Buffer.from(JSON.stringify(lifecycle));const result=directLaunchTransportBinding(prepared,lifecycle,bytes);
 assert.deepEqual(result.transportProvenance,prepared.transportProvenance);
 assert.equal(result.lifecycleReceiptSha256,createHash('sha256').update(bytes).digest('hex'));
 assert.equal(Object.hasOwn(result,'endpoint'),false);
 for(const changed of [
  {...lifecycle,transportProvenance:{...lifecycle.transportProvenance,cli:{sha256:'b'.repeat(64)}}},
  {...lifecycle,endpoint:'http://127.0.0.1:8765/mcp'},
  {...lifecycle,transport:'persistent-http-adapter'},
 ])assert.throws(()=>directLaunchTransportBinding(prepared,changed,Buffer.from(JSON.stringify(changed))),{code:'DIRECT_TRANSPORT_BINDING_MISMATCH'});
 assert.throws(()=>directLaunchTransportBinding(prepared,lifecycle,Buffer.from(JSON.stringify({...lifecycle,pid:8}))),{code:'DIRECT_TRANSPORT_BINDING_MISMATCH'});
 const unbound=finalVerdict({...prepared,launched:true});
 assert.ok(unbound.pending.includes('Prepared and launched direct transport provenance binding'));
 assert.equal(finalVerdict({...prepared,launched:true,launchTransportBinding:result}).pending.includes('Prepared and launched direct transport provenance binding'),false);
});
test('local launch binds exact executable, isolated profile and loopback debugging to one run',()=>{
 const root=path.join(os.tmpdir(),'owned-run');const executable=path.join(root,'package','MaterialFileEncryptor.exe');
 const launch=makeLaunch({executable,runRoot:root,port:9333});
 assert.equal(launch.executable,executable);assert.ok(launch.arguments.includes('--verification-profile='+path.join(root,'profile')));assert.ok(launch.arguments.includes('--remote-debugging-address=127.0.0.1'));
 assert.match(launch.cdp.expectedUrl,/resources\/app.asar\/src\/renderer\/index.html$/);
 const plan=makeBaselinePlan(launch,path.join(root,'lifecycle.json'));assert.equal(plan.startupOwnershipAttempts,3);assert.equal(plan.endpoint,'http://127.0.0.1:9333');assert.equal(plan.receipt,path.join(root,'lifecycle.json'));assert.equal(plan.expectedUrl,launch.cdp.expectedUrl);
 assert.equal(plan.steps.filter(step=>step.op==='click'||step.op==='type').length,0);assert.equal(plan.steps.at(-1).op,'capture');assert.equal(plan.steps.at(-1).overwrite,false);
});
test('invalid local launch roots and ports cannot produce a launch request',()=>{
 const root=path.join(os.tmpdir(),'owned-run');const executable=path.join(root,'package','app.exe');
 for(const port of [0,1023,65536,1.5])assert.throws(()=>makeLaunch({executable,runRoot:root,port}));
 assert.throws(()=>makeLaunch({executable:'relative.exe',runRoot:root,port:9333}));assert.throws(()=>makeLaunch({executable,runRoot:'relative',port:9333}));
});

test('interface workflow asserts states after actions and keeps native proof separate',()=>{
 const root=path.join(os.tmpdir(),'owned-run');const launch=makeLaunch({executable:path.join(root,'package','app.exe'),runRoot:root,port:9333});const plan=makeInterfacePlan(launch,path.join(root,'lifecycle.json'));
 assert.equal(plan.startupOwnershipAttempts,3);assert.ok(plan.steps.length<=100);assert.ok(plan.steps.some(step=>step.id==='locked-history-state'));assert.ok(plan.steps.some(step=>step.id==='locked-recycle-state'));
 for(const [index,step] of plan.steps.entries())if(['click','type'].includes(step.op)){assert.equal(plan.steps[index+1].op,'poll');assert.equal(plan.steps[index+2].op,'capture');}
 assert.equal(JSON.stringify(plan).includes('password-input'),false);assert.equal(JSON.stringify(plan).includes('awaitPromise'),false);
});

import {spawnSync} from 'node:child_process';
test('automatic desktop disappearance requires exact not-found code and every recorded process absent',()=>{
 const result=spawnSync('python',['-B','-c',`import importlib.util
spec=importlib.util.spec_from_file_location('policy','scripts/local-headless-desktop-check-policy.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
owned=[{'pid':77,'parentPid':1,'creationDate':'2026-10-09T12:00:00.0000000Z','executablePath':'C:/owned/app.exe'}]
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
 const receipt={sourceCommit:'a'.repeat(40),executableSha256:'b'.repeat(64),resourceHashes:{asar:'c'.repeat(64),nativeHost:'d'.repeat(64)},launched:true,runtime:{copyUpgrade:{realControls:true,upgradedFormat:2,originalFormat:1,bothMountedBytesVerified:true},transportSetup:{folderBackendVerified:true,privateRepositoryValidationVerified:true},mountedFilesystemVerified:true,rendererAssertionsVerified:true,startupRegistration:{restored:true,verificationOnly:true,enabledReadback:true,disabledReadback:false}},keyboard:{verified:true},captureReview:{verified:true,provenanceVerified:true},cleanup:{client_ok:true,recordedProcessesAbsent:true,desktopClosed:true},fixtureCleanup:{ownedCredentialForgotten:true}};
 assert.equal(finalVerdict(receipt).passed,true);for(const key of ['runtime','keyboard','captureReview','cleanup','fixtureCleanup']) {const value=structuredClone(receipt);delete value[key];assert.equal(finalVerdict(value).passed,false);}
 assert.equal(finalVerdict({...receipt,failure:'runtime failure'}).passed,false);assert.equal(finalVerdict({...receipt,sourceCommit:undefined}).passed,false);
 assert.equal(finalVerdict({...receipt,captureReview:{verified:true}}).passed,false);
});

test('private plan ledger retains exact capture timing and bounded failure steps without input text',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-receipt-test-'));
 try {
  const image=path.join(root,'capture.png');const hash='a'.repeat(64);
  const capture={path:image,bytes:4,sha256:hash,startedAt:'2026-01-01T01:02:03.000Z',capturedAt:'2026-01-01T01:02:03.100Z'};
  let calls=0;const plan={steps:[{id:'capture-one',op:'capture',path:image},{id:'selection-action',op:'type',text:'input-not-for-the-ledger'}]};
  const execute=createPlanRecorder(root,async value=>{
   if(++calls===1)return {ok:true,results:[{id:'capture-one',op:'capture',value:capture}]};
   throw helperFailure({ok:false,code:'SELECTOR_ACTION_FAILED',error:'selection-action did not resolve exactly one visible, enabled target.'},value);
  });
  const first=await execute(plan);assert.equal(first.results[0].value,capture);
  await assert.rejects(execute(plan),error=>error.message==='SELECTOR_ACTION_FAILED: selection-action (type)');
  const text=await fs.readFile(path.join(root,'step-receipts.jsonl'),'utf8');const records=text.trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(records.length,2);assert.equal(records[0].sequence,1);assert.equal(records[1].sequence,2);
  assert.deepEqual(records[0].result.results[0].value,capture);assert.equal(records[1].result.code,'SELECTOR_ACTION_FAILED');assert.deepEqual(records[1].failure.step,{id:'selection-action',op:'type'});
  assert.equal(text.includes('input-not-for-the-ledger'),false);
  const provenance=captureProvenance(records,image,hash);assert.equal(provenance.startedAt,capture.startedAt);assert.equal(provenance.capturedAt,capture.capturedAt);assert.equal(provenance.timeZone,'UTC');
  assert.equal(captureProvenance(records,image,'b'.repeat(64)),null);assert.equal(captureProvenance(records,path.join(root,'unrecorded.png'),hash),null);
  const invalid=structuredClone(records);invalid[0].result.results[0].value.capturedAt='2025-01-01T00:00:00.000Z';assert.equal(captureProvenance(invalid,image,hash),null);
 }finally{await fs.rm(root,{recursive:true});}
});
test('native capture interval surrounds the tool call and refuses an existing image',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-native-receipt-test-'));const image=path.join(root,'capture.png');
 try {
  let within;await recordNativeCapture(root,image,'native-test',async()=>{within=Date.now();await fs.writeFile(image,'synthetic fixture bytes');return {ok:true};});
  const records=(await fs.readFile(path.join(root,'step-receipts.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  const hash=createHash('sha256').update(await fs.readFile(image)).digest('hex');const provenance=captureProvenance(records,image,hash);
  assert.equal(provenance.captureMethod,'cheap-lowlevel-native');assert.ok(Date.parse(provenance.startedAt)<=within);assert.ok(Date.parse(provenance.capturedAt)>=within);
  await assert.rejects(recordNativeCapture(root,image,'reused',async()=>{throw new Error('must not execute');}),/already exists/);
 }finally{await fs.rm(root,{recursive:true});}
});

test('failure summaries retain allowlisted diagnostic metadata without reflecting native text',()=>{
 assert.deepEqual(safeFailureDetails({diagnosticStage:'before-tree',diagnosticCode:'INVALID_PROCESS_TREE',error:'hostile credential',exception:'hostile'}),{diagnosticStage:'before-tree',diagnosticCode:'INVALID_PROCESS_TREE'});
 assert.deepEqual(safeFailureDetails({diagnosticStage:'hostile',diagnosticCode:'hostile'}),{});
 assert.deepEqual(safeFailureDetails({diagnosticStage:42,diagnosticCode:['PROCESS_NOT_FOUND']}),{});
 const native=helperFailure({ok:false,client_ok:false,code:'NATIVE_OBSERVATION_FAILED',stage:'native-observation',diagnosticStage:'native-dpi-restore',diagnosticCode:'NATIVE_DPI_CONTEXT_RESTORE_FAILED',error:'hostile credential'});
 assert.equal(native.helperCode,'NATIVE_OBSERVATION_FAILED');
 assert.equal(native.message,'NATIVE_OBSERVATION_FAILED');
 assert.deepEqual(native.helperDetails,{diagnosticStage:'native-dpi-restore',diagnosticCode:'NATIVE_DPI_CONTEXT_RESTORE_FAILED',stage:'native-observation'});
 assert.deepEqual(safeFailureDetails({reasonCode:'CHILD_PREDATES_PARENT',stage:'ancestry',error:'private'}),{reasonCode:'CHILD_PREDATES_PARENT',stage:'ancestry'});
 assert.deepEqual(safeFailureDetails({reasonCode:'private-path',stage:'private-output'}),{});
 assert.deepEqual(helperFailure({code:'UNPROVEN_PROCESS_ANCESTRY',reasonCode:'MISSING_PARENT',stage:'ancestry'}).helperDetails,{reasonCode:'MISSING_PARENT',stage:'ancestry'});
});
test('pixel review resume requires completed teardown and unchanged packaged bytes before review',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-review-resume-'));const executable=path.join(root,'package','app.exe');
 try {
  await fs.mkdir(path.join(root,'package','resources','native'),{recursive:true});await fs.mkdir(path.join(root,'output'));
  const files={executable,asar:path.join(root,'package','resources','app.asar'),nativeHost:path.join(root,'package','resources','native','MaterialFileEncryptor.Host.exe')};const hashes={};for(const [key,file] of Object.entries(files)){await fs.writeFile(file,key);hashes[key]=createHash('sha256').update(key).digest('hex');}
  const receipt={launch:{runRoot:root,outputRoot:path.join(root,'output'),executable},executableSha256:hashes.executable,resourceHashes:hashes,cleanup:{client_ok:true,recordedProcessesAbsent:true,desktopClosed:true},runtime:{mountedFilesystemVerified:true,rendererAssertionsVerified:true},fixtureCleanup:{ownedCredentialForgotten:true}};
  let calls=0;const review=async()=>{calls++;return {verified:false,provenanceVerified:false};};const save=()=>fs.writeFile(path.join(root,'verification.json'),JSON.stringify(receipt));
  receipt.cleanup.desktopClosed=false;await save();await assert.rejects(resumeCaptureReview(root,{review}));assert.equal(calls,0);
  receipt.cleanup.desktopClosed=true;await save();await fs.writeFile(executable,'changed');await assert.rejects(resumeCaptureReview(root,{review}));assert.equal(calls,0);
  await fs.writeFile(executable,'executable');await save();const result=await resumeCaptureReview(root,{review});assert.equal(calls,1);assert.equal(result.passed,false);assert.equal(result.pixelsInspected,false);
 }finally{await fs.rm(root,{recursive:true});}
});

test('persistent endpoint selects project lifecycle adapter even without a CLI',()=>{
 const installedLowlevel=path.resolve('installed/lifecycle.py');
 for(const options of [{endpoint:'http://127.0.0.1:8765/mcp'},{cli:'direct.exe'}]){
  const selected=lifecycleTransport({...options,installedLowlevel});assert.equal(selected.useAdapter,true);assert.equal(path.basename(selected.lowlevel),'local-headless-desktop-check-cli.py');assert.equal(selected.transport,options.endpoint?'persistent-http-adapter':'direct-cheap-cli');
 }
 assert.throws(()=>lifecycleTransport({endpoint:'http://127.0.0.1:8765/mcp',cli:'unused.exe',installedLowlevel}),/exactly one/);
 assert.deepEqual(lifecycleTransport({installedLowlevel}),{useAdapter:false,lowlevel:installedLowlevel,transport:'streamable-http'});
});

test('modern native inspections explicitly use bounded fresh-attachment proof',async()=>{
 const source=await fs.readFile(new URL('../scripts/local-headless-desktop-check.mjs',import.meta.url),'utf8');
 assert.match(source,/const inspectionPlan=withCdpConnectionProof\(plan,'modern-observation'\);/);
 assert.match(source,/\[cdp,'inspect'\],inspectionPlan/);
 assert.doesNotMatch(source,/\[cdp,'inspect'\],plan\)/);
});
