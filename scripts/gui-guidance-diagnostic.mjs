// Bounded packaged diagnostics. No source fixture or replacement application service.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateAcquisitionRequest} from './gui-acceptance-acquire.mjs';
import {withCdpConnectionProof} from './cdp-connection-plan.mjs';

const directory=fileURLToPath(new URL('./',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const exact=(value,keys,label)=>assert.deepEqual(Object.keys(value||{}).sort(),[...keys].sort(),`Complete ${label} required; unknown fields are rejected`);
const hash=value=>assert.match(value||'',/^[a-f0-9]{64}$/,'Exact SHA-256 required');
const absolute=value=>assert.ok(typeof value==='string'&&path.isAbsolute(value),'Absolute local path required');
export const GUIDANCE_TUPLE=Object.freeze({state:'p-language',width:1180,height:850,language:'en',theme:'light',scale:1});
export const GUIDANCE_TABS=Object.freeze(['language','appearance','schedules','attention','history']);

export function validateGuidanceConfiguration(input,{now=Date.now(),env=process.env}={}){
 const config=structuredClone(input);
 exact(config,['schemaVersion','scope','reviewedAt','expiresAt','expected','buildReceipt','reference','inventory','verifier','transport','outputRoot'],'diagnostic configuration');
 assert.equal(config.schemaVersion,1);assert.equal(config.scope,'diagnostic-subset');
 const reviewed=Date.parse(config.reviewedAt),expires=Date.parse(config.expiresAt);
 assert.ok(Number.isFinite(reviewed)&&Number.isFinite(expires)&&reviewed<=now&&now<expires&&expires-reviewed<=86400000,'Reviewed configuration is stale, future-dated or exceeds 24 hours');
 exact(config.expected,['sourceCommit','version','executable','hashes'],'package identity');
 assert.match(config.expected.sourceCommit||'',/^[a-f0-9]{40}$/);assert.match(config.expected.version||'',/^\d+\.\d+\.\d+$/);absolute(config.expected.executable);
 exact(config.expected.hashes,['executable','asar','nativeHost'],'package hashes');Object.values(config.expected.hashes).forEach(hash);
 for(const key of ['buildReceipt','reference','inventory']){exact(config[key],['path','sha256'],key);absolute(config[key].path);hash(config[key].sha256);}
 exact(config.verifier,['sourceCommit','entrypointSha256','packagedVerifierSha256','cdpDriverSha256','lowlevelClientSha256'],'verifier');
 assert.match(config.verifier.sourceCommit||'',/^[a-f0-9]{40}$/);for(const [key,value]of Object.entries(config.verifier))if(key!=='sourceCommit')hash(value);
 exact(config.transport,['backend','cli','cliSha256','python','pythonSha256'],'transport');assert.equal(config.transport.backend,'native-v1');
 for(const key of ['cli','python']){absolute(config.transport[key]);hash(config.transport[key+'Sha256']);}
 assert.equal(env.MFE_LOWLEVEL_CLI,config.transport.cli,'MFE_LOWLEVEL_CLI must exactly match reviewed configuration');
 assert.equal(env.MFE_LOWLEVEL_PYTHON,config.transport.python,'MFE_LOWLEVEL_PYTHON must exactly match reviewed configuration');
 assert.equal(env.MFE_RENDERER_PROCESS_BACKEND,'native-v1','Explicit native-v1 backend required');
 assert.ok(!env.MFE_LOWLEVEL_URL,'An HTTP transport override is not part of this reviewed direct-CLI route');
 absolute(config.outputRoot);assert.equal(path.resolve(config.outputRoot),config.outputRoot,'Canonical output path required');
 for(const file of [config.expected.executable,config.buildReceipt.path,config.reference.path,config.inventory.path,config.transport.cli,config.transport.python]){const relative=path.relative(config.outputRoot,file);assert.ok(path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep),'Inputs cannot live inside the new evidence directory');}
 return config;
}
async function verifyFile(file,expected){absolute(file);const info=await fs.lstat(file);assert.equal(info.isFile(),true,'Expected regular file');assert.equal(info.isSymbolicLink(),false);assert.equal(await fs.realpath(file),path.resolve(file),'Redirected input path');const bytes=await fs.readFile(file);assert.equal(digest(bytes),expected,`Changed input: ${path.basename(file)}`);return bytes;}
export async function verifyGuidanceInputs(config,{packagedVerifierHash,inspectPackagedRendererTarget,head,skillRoot=path.join(os.homedir(),'.agents','skills')}={}){
 assert.equal(head,config.verifier.sourceCommit,'Verifier source differs from the reviewed configuration');
 try{await fs.lstat(config.outputRoot);throw Error('Evidence directory already exists; retain it and select a fresh destination');}catch(error){if(error.code!=='ENOENT')throw error;}
 const parent=path.dirname(config.outputRoot);assert.equal(await fs.realpath(parent),parent,'Evidence parent must exist without redirection');
 await verifyFile(fileURLToPath(import.meta.url),config.verifier.entrypointSha256);
 assert.equal(await packagedVerifierHash(),config.verifier.packagedVerifierSha256,'Packaged verifier changed');
 const cdp=path.join(skillRoot,'drive-electron-cdp-headless','scripts','cdp_driver.mjs'),client=path.join(skillRoot,'run-lowlevel-headless-app','scripts','lowlevel_mcp_client.py');
 await verifyFile(cdp,config.verifier.cdpDriverSha256);await verifyFile(client,config.verifier.lowlevelClientSha256);
 await verifyFile(config.transport.cli,config.transport.cliSha256);await verifyFile(config.transport.python,config.transport.pythonSha256);
 const inventory=JSON.parse(await verifyFile(config.inventory.path,config.inventory.sha256));validateAcquisitionRequest({inventory,tuples:[{...GUIDANCE_TUPLE}],mode:'diagnostic-subset'});
 await verifyFile(config.reference.path,config.reference.sha256);
 const target=await inspectPackagedRendererTarget(config.expected),build=JSON.parse(await verifyFile(config.buildReceipt.path,config.buildReceipt.sha256));
 assert.equal(build.command,'build.bat /s','Exact root build receipt required');assert.equal(build.sourceCommit,target.sourceCommit);
 if(Object.hasOwn(build,'sourceCommitAtCompletion')){assert.equal(build.sourceCommitAtCompletion,target.sourceCommit);assert.equal(build.sourceDirtyAtStart,false);assert.equal(build.sourceDirtyAtCompletion,false);assert.equal(build.exitCode,0);assert.equal(build.executableSha256,target.hashes.executable);assert.equal(build.archiveSha256,target.hashes.asar);assert.equal(build.nativeHostSha256,target.hashes.nativeHost);}
 else{assert.equal(build.sourceEndCommit,target.sourceCommit);assert.equal(build.sourceClean,true);assert.equal(build.buildExitCode,0);assert.equal(build.artifactSha256,target.hashes.executable);assert.equal(build.asarSha256,target.hashes.asar);assert.equal(build.nativeHostSha256,target.hashes.nativeHost);}
 return{inventory,target,cdp,client};
}

export async function checkGuidanceObservation(execute,id,expression,equals=true){
 const result=await execute([{id,op:'poll',expression,equals,intervalMs:100}]),row=result.results?.find(row=>row.id===id);
 assert.equal(row?.op,'poll','Expected a driver poll observation');assert.equal(row.value?.matched,true,'Poll did not match');
 assert.ok(Number.isInteger(row.value.attempts)&&row.value.attempts>0,'Missing poll attempt count');assert.deepEqual(row.value.value,equals,'Observable did not settle');
}
export async function captureGuidanceObservation({execute,outputRoot,name}){
 assert.match(name,/^[a-z][a-z0-9-]*$/);const file=path.join(outputRoot,'guidance-'+name+'.png');
 // Keep original bytes in the receipt-admitted directory. The driver validates
 // containment and writes atomically before any file is read or hashed here.
 const result=await execute([{id:name,op:'capture',path:file,overwrite:false}],true),row=result.results?.find(row=>row.id===name);
 assert.equal(row?.op,'capture');assert.equal(row.value?.path,file);hash(row.value.sha256);
 const bytes=await verifyFile(file,row.value.sha256);assert.equal(bytes.length,row.value.bytes);
 return{path:file,sha256:row.value.sha256,result,pixelsInspected:false};
}

const preferenceExpression=`(()=>{const row=JSON.parse(localStorage.getItem('material-file-encryptor.local-ux.v1')||'{}');return {language:row.language||'en',funnyEnglish:row.funnyEnglish??5,funnyCantonese:row.funnyCantonese??5,theme:row.theme||'system',density:row.density||'comfortable',fontScale:row.fontScale??1,fontWeight:row.fontWeight??400,motion:row.motion||'system'};})()`;
const guideExpression=id=>`document.querySelector(${JSON.stringify('mfe-control-guidance[data-guidance-id='+JSON.stringify(id)+']')})`;
const activeTabExpression=`document.querySelector('#view-personalization md-primary-tab[aria-selected="true"]')?.id.split('-tab-').at(-1)`;
function body(script){return `(()=>{${script}})()`;}

// All mutations below activate mounted production controls. Reads and actions
// are separate proof-bound plans; no store writes or handler counters are used.
export async function exerciseGuidanceControls({execute,outputRoot,record}){
 const value=async(id,expression)=>{const result=await execute([{id,op:'evaluate',expression}]);const row=result.results?.find(row=>row.id===id);assert.ok(row&&Object.hasOwn(row,'value'),'Missing independent observation');return row.value;};
 const check=(id,expression,equals=true)=>checkGuidanceObservation(execute,id,expression,equals);
 const action=async(id,script)=>value(id,body(script));
 const tab=async key=>{await action('tab-'+key,`const n=document.querySelector('#view-personalization md-primary-tab[id$="-tab-${key}"]');if(!n||n.disabled)throw Error('TAB_UNAVAILABLE');n.click();return true;`);await check('tab-'+key+'-selected',activeTabExpression,key);};
 const root=id=>`${guideExpression(id)}?.shadowRoot`;
 const click=async(id,selector,label,step)=>action(step,`const r=${root(id)},n=[...r.querySelectorAll(${JSON.stringify(selector)})].find(n=>${label===null?'true':`n.textContent.trim()===${JSON.stringify(label)}`});if(!n||n.disabled)throw Error('GUIDANCE_CONTROL_UNAVAILABLE');n.click();return true;`);
 const capture=name=>captureGuidanceObservation({execute,outputRoot,name});
 const restore=[];let baseline;
 try{
  await check('mounted-personalization',`(()=>{const n=document.querySelector('#view-personalization');return Boolean(n&&!n.hidden&&n.getClientRects().length);})()`);await tab('language');
  await check('english-light-tuple',`innerWidth===1180&&innerHeight===850&&Math.abs(devicePixelRatio-1)<0.01&&document.documentElement.dataset.theme==='light'&&document.documentElement.lang==='en'`);
  baseline=await value('preferences-before-guidance',preferenceExpression);
  for(const key of GUIDANCE_TABS){
   await tab(key);const id='settings.navigation.'+key;
   await click(id,'md-icon-button.entry',null,'open-'+key);
   await check('panel-'+key,`${root(id)}?.querySelector('#information')?.hidden===false`);
   const initial=await value('sample-initial-'+key,`${root(id)}.querySelector('[data-guidance-sandbox] md-tabs').activeTabIndex`);
   await action('sample-select-'+key,`const n=${root(id)}.querySelectorAll('[data-guidance-sandbox] md-primary-tab')[4];if(!n)throw Error('SAMPLE_TAB_UNAVAILABLE');n.click();return true;`);
   await check('sample-selected-'+key,`${root(id)}.querySelector('[data-guidance-sandbox] md-tabs').activeTabIndex`,4);
   await check('original-tab-unchanged-'+key,activeTabExpression,key);
   assert.deepEqual(await value('preferences-sample-'+key,preferenceExpression),baseline);
   await click(id,'[data-guidance-sandbox] md-text-button','Reset example','sample-reset-'+key);
   await check('sample-reset-observed-'+key,`${root(id)}.querySelector('[data-guidance-sandbox] md-tabs').activeTabIndex`,initial);
   record.observations.push({kind:'tab-sample',key,initial,selected:4,reset:initial,originalTabRetained:true,preferencesUnchanged:true,capture:await capture('tab-'+key)});
   await click(id,'md-icon-button:not(.entry)',null,'close-'+key);
   await check('close-focus-'+key,`${root(id)}.querySelector('#information').hidden&&${root(id)}.activeElement===${root(id)}.querySelector('md-icon-button.entry')`);
  }
  await tab('language');const fieldId='settings.english-playfulness';
  await click(fieldId,'md-icon-button.entry',null,'open-numeric-practice');
  const field=`${root(fieldId)}.querySelector('[data-guidance-sandbox] md-outlined-text-field')`;
  for(const [input,invalid]of [['0',true],['3',false]]){await action('sample-number-'+input,`const n=${field};if(!n)throw Error('NUMERIC_SAMPLE_UNAVAILABLE');n.value=${JSON.stringify(input)};n.dispatchEvent(new Event('input',{bubbles:true,composed:true}));return true;`);await check('sample-number-result-'+input,`${field}.getAttribute('aria-invalid')`,String(invalid));}
  assert.deepEqual(await value('preferences-numeric-sample',preferenceExpression),baseline);
  await click(fieldId,'[data-guidance-sandbox] md-text-button','Reset example','reset-numeric-practice');await check('numeric-reset-value',`String(${field}.value)`,'5');
  record.observations.push({kind:'numeric-sample',invalidInput:0,validInput:3,reset:5,preferencesUnchanged:true,capture:await capture('numeric-practice')});
  await click(fieldId,'md-icon-button:not(.entry)',null,'close-numeric-practice');
  // A one-step navigation guide reaches the real original tab without modifying
  // preference data. Original preference writes are exercised by p-language.
  const navId='settings.navigation.appearance';await click(navId,'md-icon-button.entry',null,'open-original-guide');await click(navId,'md-filled-button','Open guided operation','start-original-guide');
  await check('original-guide-visible',`${root(navId)}.querySelector('section[aria-label="Guide this control"]').hidden===false`);
  await click(navId,'md-filled-button','Apply through the direct control','apply-original-navigation');await check('original-navigation-applied',activeTabExpression,'appearance');assert.deepEqual(await value('preferences-after-original-navigation',preferenceExpression),baseline);
  await tab('language');record.observations.push({kind:'original-guided-navigation',from:'language',applied:'appearance',restored:'language',preferencesUnchanged:true});
  record.guidancePassed=true;
 }finally{
  try{await action('dismiss-guidance',`for(const host of document.querySelectorAll('mfe-control-guidance')){const r=host.shadowRoot;if(r?.querySelector('#information')?.hidden===false)r.querySelector('md-icon-button.entry').click();}return true;`);restore.push('information-closed');}catch(error){record.restorationErrors.push(error.message);}
  try{await tab('language');restore.push('language-tab-restored');if(baseline)assert.deepEqual(await value('preferences-after-guidance',preferenceExpression),baseline);restore.push('preferences-observed-unchanged');}catch(error){record.restorationErrors.push(error.message);}
  record.guidanceRestoration={restored:record.restorationErrors.length===0,steps:restore};
 }
}

export async function runGuidanceDiagnostic(input,{load=loadProduction,now=Date.now(),env=process.env,platform=process.platform}={}){
 const config=validateGuidanceConfiguration(input,{now,env});assert.equal(platform,'win32','This packaged diagnostic requires Windows');
 const production=await load(),admission=await production.verify(config);
 // No native fixture or launch precedes the supported transport preflight.
 await production.preflight(config,admission);
 await production.verify(config);
 await fs.mkdir(config.outputRoot,{recursive:false});
 await fs.writeFile(path.join(config.outputRoot,'diagnostic-binding.json'),JSON.stringify({schemaVersion:1,scope:'diagnostic-subset',accepted:false,config,verifiedAt:new Date().toISOString()},null,2),{flag:'wx'});
 const record={schemaVersion:1,scope:'diagnostic-subset',accepted:false,packageSourceCommit:config.expected.sourceCommit,verifierSourceCommit:config.verifier.sourceCommit,tuple:GUIDANCE_TUPLE,startedAt:new Date().toISOString(),status:'started',guidancePassed:false,observations:[],restorationErrors:[],physicalDpiVerified:false,designParityVerified:false,installedAcceptance:false,unrun:['Motion runtime and delayed playback scenarios','Native menu keyboard interaction','Full matrix and physical display scaling','Independent pixel inspection and design comparison']};
 let opened,failure;
 try{opened=await production.open(config,admission);assert.equal(opened.connectionOwned,true);assert.equal(opened.target.sourceCommit,config.expected.sourceCommit);assert.deepEqual(opened.target.hashes,config.expected.hashes);
  record.packageReceipt=opened.receiptPath;record.acquisition=await production.acquire(config,admission,opened);assert.equal(record.acquisition.scope,'diagnostic-subset');assert.equal(record.acquisition.accepted,false);
  assert.ok(record.acquisition.results.length===1&&record.acquisition.results[0].status==='captured-awaiting-inspection-and-reference','Initial packaged tuple did not complete acquisition');
  await production.exercise(config,admission,opened,record);assert.equal(record.guidancePassed,true);assert.equal(record.guidanceRestoration?.restored,true);record.status='diagnostic-complete-awaiting-inspection';
 }catch(error){failure=error;record.status='failed';record.reason=error.message;}
 finally{if(opened){try{record.closure=await opened.close();assert.equal(record.closure.closureVerified,true);}catch(error){record.status='closure-unverified';record.closureError=error.message;failure ||= error;}}record.finishedAt=new Date().toISOString();record.accepted=false;await fs.writeFile(path.join(config.outputRoot,'guidance-diagnostic.json'),JSON.stringify(record,null,2),{flag:'wx'});}
 if(failure)throw failure;return record;
}
async function loadProduction(){
 const [{openGuiAcceptancePackage},{openPackagedRendererTarget,inspectPackagedRendererTarget},producer,{createPlanRecorder}]=await Promise.all([import('./gui-acceptance-packaged.mjs'),import('./packaged-renderer-runtime.mjs'),import('./gui-acceptance-producer.mjs'),import('./local-headless-desktop-check.mjs')]);
 const environment=(config,admission)=>({...process.env,PYTHONUTF8:'1',MFE_LOWLEVEL_CLIENT:admission.client,MFE_LOWLEVEL_CLI:config.transport.cli,MFE_LOWLEVEL_PYTHON:config.transport.python,MFE_RENDERER_PROCESS_BACKEND:'native-v1',MFE_RENDERER_NODE_EXECUTABLE:process.execPath,MFE_RENDERER_SOURCE_COMMIT:config.verifier.sourceCommit});
 return{
  async verify(config){const options={cwd:path.dirname(directory),windowsHide:true,timeout:10000};await promisify(execFile)('git',['ls-files','--error-unmatch','scripts/gui-guidance-diagnostic.mjs'],options);const {stdout:changes}=await promisify(execFile)('git',['status','--porcelain','--untracked-files=all','--','scripts'],options);assert.equal(changes.trim(),'','Commit and freeze verifier scripts before packaged execution');const {stdout}=await promisify(execFile)('git',['rev-parse','HEAD'],options);return verifyGuidanceInputs(config,{packagedVerifierHash:producer.packagedVerifierHash,inspectPackagedRendererTarget,head:stdout.trim()});},
  async preflight(config,admission){return producer.runEvidenceJson(config.transport.python,[path.join(directory,'test-renderer-browser-cli.py'),'preflight','--require','launch_on_headless_desktop','--require','list_headless_windows','--require','screenshot','--require','close_headless_desktop'],undefined,environment(config,admission));},
  async open(config){return openGuiAcceptancePackage({expected:config.expected,evidenceRoot:path.join(config.outputRoot,'lifecycle'),openTarget:(expected,options)=>openPackagedRendererTarget(expected,{...options,gracefulOnly:true})});},
  async acquire(config,admission,opened){return producer.acquirePackagedDiagnosticSubset({opened,inventory:admission.inventory,buildReceiptPath:config.buildReceipt.path,referencePath:config.reference.path,outputRoot:path.join(config.outputRoot,'acquisition'),tuples:[{...GUIDANCE_TUPLE}]});},
  async exercise(config,admission,opened,record){const state=JSON.parse(await fs.readFile(opened.statePath)),outputRoot=state.outputRoot;assert.equal(path.resolve(state.runRoot),path.resolve(opened.runRoot));assert.equal(outputRoot,path.join(opened.runRoot,'output'));const recorder=createPlanRecorder(opened.runRoot,plan=>producer.runEvidenceJson(process.execPath,[admission.cdp,'run'],plan,environment(config,admission)));
   const execute=async(steps,capture=false)=>{await verifyFile(fileURLToPath(import.meta.url),config.verifier.entrypointSha256);assert.equal(await producer.packagedVerifierHash(),config.verifier.packagedVerifierSha256);await verifyFile(config.buildReceipt.path,config.buildReceipt.sha256);await verifyFile(admission.cdp,config.verifier.cdpDriverSha256);await verifyFile(admission.client,config.verifier.lowlevelClientSha256);return recorder(withCdpConnectionProof({version:1,receipt:opened.statePath,endpoint:`http://127.0.0.1:${state.cdp.port}`,expectedUrl:opened.target.expectedUrl,allowEvaluate:true,timeoutMs:30000,steps,...(capture?{observeRuntime:true}:{})},capture?'capture':'control'));};
   await exerciseGuidanceControls({execute,outputRoot,record});
  },
 };
}
async function main(){const [mode,file,...extra]=process.argv.slice(2);assert.ok(['validate','run'].includes(mode)&&file&&!extra.length,'Usage: node scripts/gui-guidance-diagnostic.mjs <validate|run> <reviewed-config.json>');const input=JSON.parse(await fs.readFile(file));if(mode==='validate'){const config=validateGuidanceConfiguration(input);assert.equal(process.platform,'win32');const production=await loadProduction();await production.verify(config);console.log(JSON.stringify({scope:'diagnostic-subset',configurationVerified:true,launched:false,accepted:false}));}else{const result=await runGuidanceDiagnostic(input);console.log(JSON.stringify({scope:result.scope,status:result.status,accepted:false}));}}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(JSON.stringify({scope:'diagnostic-subset',accepted:false,status:'failed',reason:error.message}));process.exitCode=1;});
