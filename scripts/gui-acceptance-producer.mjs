import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {bindingFor,sha256,matrixFor} from './gui-acceptance.mjs';
import {acquireMatrix,composeAdapters} from './gui-acceptance-acquire.mjs';
import {baselineAdapters,ownedFixturePreparation} from './gui-acceptance-baseline.mjs';
import {createFoundationAdapters} from './gui-acceptance-foundation.mjs';
import {createAccessAdapters} from './gui-acceptance-access.mjs';
import {createAccessFixtures} from './gui-acceptance-access-fixtures.mjs';
import {createRecordsAdapters} from './gui-acceptance-records.mjs';
import {createPersonalizationAdapters} from './gui-acceptance-personalization.mjs';
import {createToolsAdapters} from './gui-acceptance-tools.mjs';
import {createMountedFoundationFixtures,createKeyboardFoundationFixtures} from './gui-acceptance-native-files.mjs';
import {createModernProbeEvidence} from './modern-ui-check.mjs';
import {makeLaunch,modernNativeObservation,createPlanRecorder} from './local-headless-desktop-check.mjs';
import {withCdpConnectionProof} from './cdp-connection-plan.mjs';

const scriptRoot=fileURLToPath(new URL('./',import.meta.url));
export async function packagedVerifierHash(root=scriptRoot){
 const fixed=['modern-ui-check.mjs','local-headless-desktop-check.mjs','modern-phase.mjs','cdp-connection-plan.mjs','preview-runtime-fixture.mjs','test-renderer-browser.mjs','test-renderer-browser-cli.py','native-window-observation.py','renderer-process-snapshot.py','renderer-launch-observer.mjs','renderer-launch-observer.py','renderer-native-path.mjs','renderer-native-path.py','supplemental-renderer-recovery.py','packaged-renderer-runtime.mjs'];
 const names=[...new Set([...fixed,...(await fs.readdir(root)).filter(name=>/^gui-acceptance.*\.(?:mjs|py)$/.test(name))])].sort();
 const hashes=[];for(const name of names)hashes.push({name,sha256:sha256(await fs.readFile(path.join(root,name)))});
 return sha256(JSON.stringify(hashes));
}
// Delay access admission until an access state is requested. Baseline capture
// must not initialize, configure, or even inspect an unrelated access profile.
export function createPackagedAccessFixture({opened,fixtures={}}){
 if(Object.hasOwn(fixtures,'access'))return fixtures.access;
 let provider;
 const get=()=>{
  if(!provider){try{provider=createAccessFixtures({opened});}catch(error){throw new Error('CAPABILITY_UNAVAILABLE: access requires a verified owned packaged session',{cause:error});}}
  return provider;
 };
 return Object.fromEntries(['assertCapabilities','prepare','beforeAction','perform','observe','restore'].map(method=>[method,(...args)=>get()[method](...args)]));
}

export function createPackagedAdapters(context){
 return composeAdapters(context.inventory,baselineAdapters(context),createFoundationAdapters(context),createAccessAdapters(context),createRecordsAdapters(context),createPersonalizationAdapters(context),createToolsAdapters(context));
}
export async function readPackagedBuildBinding(target,buildReceiptPath){
 const originalPath=path.resolve(buildReceiptPath),originalBytes=await fs.readFile(originalPath),original=JSON.parse(originalBytes);
 let bytes=originalBytes,build=original;
 if(Object.hasOwn(original,'sourceCommitAtCompletion')){
  assert.equal(original.command,'build.bat /s');assert.equal(original.sourceCommitAtCompletion,target.sourceCommit);
  assert.equal(original.sourceDirtyAtStart,false);assert.equal(original.sourceDirtyAtCompletion,false);assert.equal(original.exitCode,0);
  assert.equal(original.nativeHostSha256,target.hashes.nativeHost);
  build={...original,sourceEndCommit:original.sourceCommitAtCompletion,sourceClean:!original.sourceDirtyAtStart&&!original.sourceDirtyAtCompletion,buildExitCode:original.exitCode,artifactSha256:original.executableSha256,asarSha256:original.archiveSha256,normalization:{derivedReceipt:true,originalPath,originalSha256:sha256(originalBytes)}};
 }
 assert.equal(build.sourceCommit,target.sourceCommit);assert.equal(build.sourceEndCommit,target.sourceCommit);
 assert.equal(build.sourceClean,true);assert.equal(build.buildExitCode,0);
 assert.equal(build.artifactSha256,target.hashes.executable);assert.equal(build.asarSha256,target.hashes.asar);
 for(const [key,file]of Object.entries(target.files))assert.equal(sha256(await fs.readFile(file)),target.hashes[key]);
 if(build!==original){
  buildReceiptPath=originalPath+'.normalized.json';bytes=Buffer.from(JSON.stringify(build,null,2));
  try{await fs.writeFile(buildReceiptPath,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;assert.equal(sha256(await fs.readFile(buildReceiptPath)),sha256(bytes),'Existing normalized build receipt changed');}
 }
 // A copied immutable package is admissible by the actual build's byte hashes.
 // This does not claim that its new filesystem location was the build output.
 return {sourceCommit:target.sourceCommit,artifactPath:target.executable,artifactSha256:target.hashes.executable,buildReceiptPath:path.resolve(buildReceiptPath),buildReceiptSha256:sha256(bytes),originalBuildReceiptPath:originalPath,originalBuildReceiptSha256:sha256(originalBytes),rendererAsarPath:target.files.asar,rendererAsarSha256:target.hashes.asar};
}

export function runEvidenceJson(executable,args,input,env=process.env){
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  const timer=setTimeout(()=>{child.kill();reject(Error('Evidence helper exceeded its bounded wait'));},120000);
  child.stdout.on('data',data=>{stdout+=data;if(stdout.length>8*1024*1024){child.kill();reject(Error('Evidence helper output exceeded bound'));}});
  child.stderr.on('data',data=>{stderr=(stderr+data).slice(-65536);});child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('close',code=>{clearTimeout(timer);try{const result=JSON.parse(stdout);assert.equal(code,0,stderr||'Evidence helper exited unsuccessfully');assert.equal(result.ok??result.valid,true);resolve(result);}catch(error){reject(error);}});
  child.stdin.on('error',error=>{clearTimeout(timer);reject(error);});child.stdin.end(input===undefined?'':JSON.stringify(input));
 });
}

// Starts no process and owns no teardown. The supplied live session has already
// passed exact package, profile, process, target and client-socket admission.
export async function acquirePackagedBaseline({opened,inventory,buildReceiptPath,referencePath,outputRoot,tuples,fixtures={},report=()=>{}}){
 assert.equal(opened.connectionOwned,true);assert.equal(opened.target.kind,'extracted-packaged-runtime');
 const target=opened.target,receipt=opened.statePath,state=JSON.parse(await fs.readFile(receipt));
 const launch=makeLaunch({executable:target.executable,runRoot:opened.runRoot,port:state.cdp.port});assert.equal(launch.cdp.expectedUrl,target.expectedUrl);
 const build=await readPackagedBuildBinding(target,buildReceiptPath);
 const binding=bindingFor({inventory,sourceCommit:target.sourceCommit,executableSha256:target.hashes.executable,resourceSha256:target.hashes.asar,verifierSha256:await packagedVerifierHash(),referenceSha256:sha256(await fs.readFile(referencePath))});
 const skillRoot=path.join(os.homedir(),'.agents','skills');
 const installed=path.join(skillRoot,'run-lowlevel-headless-app','scripts','lowlevel_mcp_client.py');
 const cdp=path.join(skillRoot,'drive-electron-cdp-headless','scripts','cdp_driver.mjs');
 const lowlevel=path.join(scriptRoot,'test-renderer-browser-cli.py');
 const cli=process.env.MFE_LOWLEVEL_CLI;assert.ok(cli,'Exact installed Lowlevel CLI path required');
 const python=process.env.MFE_LOWLEVEL_PYTHON||path.join(path.dirname(cli),'python.exe');
 const env={...process.env,PYTHONUTF8:'1',MFE_LOWLEVEL_CLIENT:installed,MFE_LOWLEVEL_CLI:cli,MFE_LOWLEVEL_PYTHON:python,MFE_RENDERER_NODE_EXECUTABLE:process.execPath,MFE_RENDERER_PROCESS_BACKEND:'native-v1',MFE_RENDERER_SOURCE_COMMIT:opened.receipt.verifierSourceCommit};delete env.MFE_LOWLEVEL_URL;
 const executePlan=createPlanRecorder(opened.runRoot,plan=>runEvidenceJson(process.execPath,[cdp,'run'],plan,env));
 const observe=async()=>{
  assert.equal(await packagedVerifierHash(),binding.verifierSha256);
  assert.equal(sha256(await fs.readFile(build.originalBuildReceiptPath)),build.originalBuildReceiptSha256);
  const window=await runEvidenceJson(python,[lowlevel,'wait-window','--state',receipt,'--title-pattern','^Material File Encryptor','--class-pattern','^Chrome_WidgetWin_1$','--timeout','30'],undefined,env);
  const inspectionPlan=withCdpConnectionProof({version:1,receipt,endpoint:`http://127.0.0.1:${launch.cdp.port}`,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:30000,steps:[]},'capture');
  const bytes=await fs.readFile(receipt),current=JSON.parse(bytes),inspection=await runEvidenceJson(process.execPath,[cdp,'inspect'],inspectionPlan,env);
  const native=await runEvidenceJson(python,[path.join(scriptRoot,'native-window-observation.py')],{helper:installed,receipt},env);
  return modernNativeObservation({window,state:current,launch,sourceCommit:target.sourceCommit,launchReceiptSha256:sha256(bytes),processSha256:sha256(await fs.readFile(target.executable)),inspection,profileResolved:await fs.realpath(path.join(opened.runRoot,'profile')),native});
 };
 const prepareOwnedFixture=ownedFixturePreparation({launch,receipt,fixture:opened.fixture});
 const nativeFixtures={...fixtures,access:createPackagedAccessFixture({opened,fixtures}),foundation:{...createMountedFoundationFixtures({opened}),...createKeyboardFoundationFixtures({opened}),...fixtures.foundation}};
 const context={launch,receipt,inventory,prepareOwnedFixture,fixtures:nativeFixtures};
 const adapters=createPackagedAdapters(context);
 const createProbeEvidence=({outputRoot})=>createModernProbeEvidence({binding:build,outputRoot,helperPath:cdp,observe,validate:file=>runEvidenceJson(process.execPath,[path.join(skillRoot,'diagnose-built-ui-layout','scripts','validate-layout-probe.mjs'),'--input',file],undefined,env)});
 await fs.mkdir(outputRoot,{recursive:true});
 await fs.writeFile(path.join(outputRoot,'producer-binding.json'),JSON.stringify({binding,build,packageBinding:opened.receiptPath,physicalDpiVerified:false},null,2),{flag:'wx'});
 return acquireMatrix({inventory,binding,launch,receipt,outputRoot,executePlan,createProbeEvidence,adapters,tuples:tuples||matrixFor(inventory).filter(tuple=>['drive-locked','create-password','settings-default'].includes(tuple.state)&&tuple.language==='en'&&tuple.theme==='light'&&tuple.scale===1),report});
}
