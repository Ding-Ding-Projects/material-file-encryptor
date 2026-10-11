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
import {createModernProbeEvidence} from './modern-ui-check.mjs';
import {makeLaunch,modernNativeObservation,createPlanRecorder} from './local-headless-desktop-check.mjs';
import {withCdpConnectionProof} from './cdp-connection-plan.mjs';

const scriptRoot=fileURLToPath(new URL('./',import.meta.url));
export async function readPackagedBuildBinding(target,buildReceiptPath){
 const bytes=await fs.readFile(buildReceiptPath),build=JSON.parse(bytes);
 assert.equal(build.sourceCommit,target.sourceCommit);assert.equal(build.sourceEndCommit,target.sourceCommit);
 assert.equal(build.sourceClean,true);assert.equal(build.buildExitCode,0);
 assert.equal(build.artifactSha256,target.hashes.executable);assert.equal(build.asarSha256,target.hashes.asar);
 for(const [key,file]of Object.entries(target.files))assert.equal(sha256(await fs.readFile(file)),target.hashes[key]);
 // A copied immutable package is admissible by the actual build's byte hashes.
 // This does not claim that its new filesystem location was the build output.
 return {sourceCommit:target.sourceCommit,artifactPath:target.executable,artifactSha256:target.hashes.executable,buildReceiptPath:path.resolve(buildReceiptPath),buildReceiptSha256:sha256(bytes),rendererAsarPath:target.files.asar,rendererAsarSha256:target.hashes.asar};
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
 const verifierBytes=await fs.readFile(fileURLToPath(import.meta.url));
 const binding=bindingFor({inventory,sourceCommit:target.sourceCommit,executableSha256:target.hashes.executable,resourceSha256:target.hashes.asar,verifierSha256:sha256(verifierBytes),referenceSha256:sha256(await fs.readFile(referencePath))});
 const skillRoot=path.join(os.homedir(),'.agents','skills');
 const installed=path.join(skillRoot,'run-lowlevel-headless-app','scripts','lowlevel_mcp_client.py');
 const cdp=path.join(skillRoot,'drive-electron-cdp-headless','scripts','cdp_driver.mjs');
 const lowlevel=path.join(scriptRoot,'test-renderer-browser-cli.py');
 const cli=process.env.MFE_LOWLEVEL_CLI;assert.ok(cli,'Exact installed Lowlevel CLI path required');
 const python=process.env.MFE_LOWLEVEL_PYTHON||path.join(path.dirname(cli),'python.exe');
 const env={...process.env,PYTHONUTF8:'1',MFE_LOWLEVEL_CLIENT:installed,MFE_LOWLEVEL_CLI:cli,MFE_LOWLEVEL_PYTHON:python,MFE_RENDERER_NODE_EXECUTABLE:process.execPath,MFE_RENDERER_PROCESS_BACKEND:'native-v1',MFE_RENDERER_SOURCE_COMMIT:opened.receipt.verifierSourceCommit};delete env.MFE_LOWLEVEL_URL;
 const executePlan=createPlanRecorder(opened.runRoot,plan=>runEvidenceJson(process.execPath,[cdp,'run'],plan,env));
 const observe=async()=>{
  assert.equal(sha256(await fs.readFile(fileURLToPath(import.meta.url))),binding.verifierSha256);
  const window=await runEvidenceJson(python,[lowlevel,'wait-window','--state',receipt,'--title-pattern','^Material File Encryptor','--class-pattern','^Chrome_WidgetWin_1$','--timeout','30'],undefined,env);
  const inspectionPlan=withCdpConnectionProof({version:1,receipt,endpoint:`http://127.0.0.1:${launch.cdp.port}`,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:30000,steps:[]},'capture');
  const bytes=await fs.readFile(receipt),current=JSON.parse(bytes),inspection=await runEvidenceJson(process.execPath,[cdp,'inspect'],inspectionPlan,env);
  const native=await runEvidenceJson(python,[path.join(scriptRoot,'native-window-observation.py')],{helper:installed,receipt},env);
  return modernNativeObservation({window,state:current,launch,sourceCommit:target.sourceCommit,launchReceiptSha256:sha256(bytes),processSha256:sha256(await fs.readFile(target.executable)),inspection,profileResolved:await fs.realpath(path.join(opened.runRoot,'profile')),native});
 };
 const prepareOwnedFixture=ownedFixturePreparation({launch,receipt,fixture:opened.fixture});
 const context={launch,receipt,inventory,prepareOwnedFixture,fixtures};
 const adapters=composeAdapters(inventory,baselineAdapters(context),createFoundationAdapters(context));
 const createProbeEvidence=({outputRoot})=>createModernProbeEvidence({binding:build,outputRoot,helperPath:cdp,observe,validate:file=>runEvidenceJson(process.execPath,[path.join(skillRoot,'diagnose-built-ui-layout','scripts','validate-layout-probe.mjs'),'--input',file],undefined,env)});
 await fs.mkdir(outputRoot,{recursive:true});
 await fs.writeFile(path.join(outputRoot,'producer-binding.json'),JSON.stringify({binding,build,packageBinding:opened.receiptPath,physicalDpiVerified:false},null,2),{flag:'wx'});
 return acquireMatrix({inventory,binding,launch,receipt,outputRoot,executePlan,createProbeEvidence,adapters,tuples:tuples||matrixFor(inventory).filter(tuple=>['drive-locked','create-password','settings-default'].includes(tuple.state)&&tuple.language==='en'&&tuple.theme==='light'&&tuple.scale===1),report});
}
