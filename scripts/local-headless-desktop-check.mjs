import {withCdpConnectionProof} from './cdp-connection-plan.mjs';
import {prepareRuntimeFixture,checkMountedRuntime,forgetRuntimeFixture} from './preview-runtime-fixture.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {createModernProbeEvidence} from './modern-ui-check.mjs';
import {pathToFileURL,fileURLToPath} from 'node:url';

export function makeLaunch({executable,runRoot,port}) {
 if(!path.isAbsolute(executable)||!path.isAbsolute(runRoot)||!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid isolated verification inputs.');
 const outputRoot=path.join(runRoot,'output');const profile=path.join(runRoot,'profile');
 const expectedUrl=pathToFileURL(path.join(path.dirname(executable),'resources','app.asar','src','renderer','index.html')).href;
 return {executable,arguments:['--desktop-check',`--verification-profile=${profile}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],runRoot,outputRoot,cdp:{port,expectedUrl}};
}
export function makeBaselinePlan(launch,receipt) {return withCdpConnectionProof({version:1,receipt,endpoint:`http://127.0.0.1:${launch.cdp.port}`,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:30000,steps:[{id:'ready',op:'poll',expression:"document.readyState === 'complete' && typeof window.drive?.status === 'function'",equals:true,intervalMs:200},{id:'baseline',op:'capture',path:path.join(launch.outputRoot,'baseline.png'),overwrite:false}]},'capture');}
export function makeInterfacePlan(launch,receipt) {
 const steps=[];const poll=(id,expression,equals)=>steps.push({id,op:'poll',expression,equals,intervalMs:100});
 const capture=id=>steps.push({id:id+'-capture',op:'capture',path:path.join(launch.outputRoot,id+'.png'),overwrite:false});
 const click=(id,selector,expression)=>{steps.push({id,op:'click',selector});poll(id+'-state',expression,true);capture(id);};
 poll('bridge-isolated',"typeof window.require === 'undefined' && typeof window.drive?.status === 'function'",true);
 click('create-dialog','#create-button',"document.querySelector('#vault-dialog').open");
 click('key-file-choice','.credential-selector label:has(input[value="keyFile"])',"document.querySelector('#key-fields').hidden === false && document.querySelector('#password-fields').hidden === true");
 click('cancel-dialog','#dialog-cancel',"!document.querySelector('#vault-dialog').open");
 click('settings','[data-view="settings"]',"!document.querySelector('#view-settings').hidden");
 for(const theme of ['dark','light']) {steps.push({id:'theme-'+theme,op:'type',selector:'#theme-setting',text:theme,clear:true});poll('theme-'+theme+'-state',`document.documentElement.dataset.theme === '${theme}'`,true);capture('theme-'+theme);}
 for(const language of ['yue','bilingual','en']) {steps.push({id:'language-'+language,op:'type',selector:'#language-setting',text:language,clear:true});poll('language-'+language+'-state',`document.querySelector('#language-setting').value === '${language}'`,true);capture('language-'+language);}
 click('locked-history','[data-view="history"]',"!document.querySelector('#view-history').hidden && document.querySelector('#history-list').children.length === 0 && document.querySelector('#save-version').disabled");
 click('locked-recycle','[data-view="recycle"]',"!document.querySelector('#view-recycle').hidden && document.querySelector('#recycle-list').children.length === 0 && document.querySelector('#restore-recycled').disabled");
 click('help','[data-view="help"]',"!document.querySelector('#view-help').hidden");
 click('return-drive','[data-view="drive"]',"!document.querySelector('#view-drive').hidden");
 return withCdpConnectionProof({...makeBaselinePlan(launch,receipt),timeoutMs:90000,steps},'control');
}
async function requirePixelReview(runRoot,image) {
 const hash=createHash('sha256').update(await fs.readFile(image)).digest('hex');
 console.log(JSON.stringify({state:'baseline-review-required',runRoot,image,sha256:hash,reviewMarker:path.join(runRoot,'baseline-reviewed.json')}));
 const deadline=Date.now()+60000;
 while(Date.now()<deadline) {try {const marker=JSON.parse(await fs.readFile(path.join(runRoot,'baseline-reviewed.json'),'utf8'));if(marker.sha256===hash&&marker.inspected===true&&marker.privacyPassed===true)return {sha256:hash,inspected:true,privacyPassed:true};throw new Error('Baseline review marker does not bind the capture.');}catch(error){if(error.code!=='ENOENT')throw error;}await new Promise(resolve=>setTimeout(resolve,250));}
 throw new Error('Baseline pixel review was not supplied within 60 seconds.');
}
export function validateCaptureReview(review,inventory,binding) {
 if(!review||review.version!==1||review.sourceCommit!==binding.sourceCommit||review.executableSha256!==binding.executableSha256||!Array.isArray(review.captures)||review.captures.length!==inventory.length||!inventory.length)return false;
 const reviewed=new Map(review.captures.map(item=>[item.path,item]));if(reviewed.size!==inventory.length)return false;
 return inventory.every(item=>{const value=reviewed.get(item.path);return value?.sha256===item.sha256&&value.inspected===true&&value.privacyPassed===true;});
}
export function safeFailureDetails(result) {
 const allowed={
  diagnosticStage:['request', 'lifecycle-import', 'adapter-import', 'transport', 'state-read', 'state-validation', 'native-import', 'before-tree', 'before-owner', 'before-identity', 'before-hash', 'native-dpi-enter', 'native-geometry', 'native-dpi-query', 'native-geometry-validation', 'native-dpi-restore', 'after-tree', 'after-owner', 'after-identity', 'after-hash', 'bookend-validation'],
  diagnosticCode:['UNEXPECTED_EXCEPTION', 'WINDOW_OWNER_UNPROVEN', 'WINDOW_OWNER_CHANGED', 'WINDOW_OWNER_UNAVAILABLE', 'NATIVE_DPI_CONTEXT_UNAVAILABLE', 'NATIVE_GEOMETRY_UNAVAILABLE', 'NATIVE_DPI_CONTEXT_RESTORE_FAILED', 'NATIVE_STATE_UNAVAILABLE', 'MIXED_TRANSPORT', 'UNSAFE_PATH', 'STATE_TOO_LARGE', 'INVALID_STATE', 'UNSUPPORTED_PLATFORM', 'PROCESS_NOT_FOUND', 'PROCESS_PROOF_FAILED', 'PROCESS_IDENTITY_CHANGED', 'INVALID_PROCESS_IDENTITY', 'INVALID_PROCESS_TREE', 'TRANSPORT_ERROR', 'INVALID_RESPONSE', 'INVALID_ENDPOINT', 'NON_LOOPBACK_ENDPOINT', 'UNSAFE_ENDPOINT'],reasonCode:['ROOT_IDENTITY_CHANGED','DUPLICATE_PID','INVALID_NODE_IDENTITY','ROOT_CYCLE','CYCLE_OR_MISSING_PARENT','MISSING_PARENT','CHILD_PREDATES_PARENT','LIVE_IDENTITY_UNAVAILABLE','LIVE_IDENTITY_CHANGED','UNSPECIFIED_ANCESTRY_FAILURE'],stage:['process-snapshot','ancestry','listener-query','owner-revalidation','native-observation']};
 return Object.fromEntries(Object.entries(allowed).filter(([key,values])=>values.includes(result?.[key])).map(([key])=>[key,result[key]]));
}
export function helperFailure(result,plan) {
 const code=typeof result?.code==='string'?result.code.slice(0,100):'VERIFICATION_HELPER_FAILED';
 const description=typeof result?.error==='string'?result.error:'';
 const step=plan?.steps?.find(item=>typeof item.id==='string'&&(description.startsWith(item.id+' ')||description.startsWith(item.id+':')));
 const error=new Error(code+(step?`: ${step.id.slice(0,120)} (${String(step.op).slice(0,30)})`:''));
 error.helperResult=result;error.helperCode=code;error.helperDetails=safeFailureDetails(result);error.helperStep=step?{id:step.id,op:step.op}:null;return error;
}
async function appendStepReceipt(runRoot,value) {
 // Raw helper values remain in the task-owned private run root, never reports.
 await fs.appendFile(path.join(runRoot,'step-receipts.jsonl'),JSON.stringify(value)+'\n',{mode:0o600});
}
export function createPlanRecorder(runRoot,execute) {
 let sequence=0;
 return async plan=>{
  const record={version:1,kind:'cdp-plan',sequence:++sequence,startupOwnershipAttempts:plan.startupOwnershipAttempts??1,startedAt:new Date().toISOString(),steps:plan.steps.map(({id,op})=>({id,op}))};
  try {const result=await execute(plan);record.result=result;return result;}
  catch(error){record.result=error.helperResult||{ok:false,code:error.helperCode||'VERIFICATION_HELPER_FAILED'};record.failure={code:error.helperCode||'VERIFICATION_HELPER_FAILED',step:error.helperStep||null,...error.helperDetails};throw error;}
  finally {record.finishedAt=new Date().toISOString();await appendStepReceipt(runRoot,record);}
 };
}
export async function recordNativeCapture(runRoot,image,id,execute) {
 try {await fs.lstat(image);throw new Error('Native capture output already exists.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const startedAt=new Date().toISOString();const result=await execute();const capturedAt=new Date().toISOString();
 const bytes=await fs.readFile(image);const sha256=createHash('sha256').update(bytes).digest('hex');
 const record={version:1,kind:'native-capture',id,value:{path:image,sha256,bytes:bytes.length,startedAt,capturedAt},result};
 await appendStepReceipt(runRoot,record);return result;
}
export function captureProvenance(records,image,sha256) {
 let provenance=null;
 for(const record of records) {
  const results=record.kind==='native-capture'?[{id:record.id,op:'capture',value:record.value}]:record.result?.results||[];
  for(const step of results) {
   const value=step.value;
   if(step.op!=='capture'||!value||path.resolve(value.path||'')!==path.resolve(image)||value.sha256!==sha256)continue;
   if(!Number.isFinite(Date.parse(value.startedAt))||!Number.isFinite(Date.parse(value.capturedAt))||Date.parse(value.startedAt)>Date.parse(value.capturedAt))continue;
   provenance={startedAt:value.startedAt,capturedAt:value.capturedAt,timeZone:'UTC',captureMethod:record.kind==='native-capture'?'cheap-lowlevel-native':'cheap-lowlevel-cdp',stepId:step.id,receiptSequence:record.sequence??null};
  }
 }
 return provenance;
}
export function finalVerdict(receipt) {
 const pending=[];
 if(!/^[a-f0-9]{40}$/.test(receipt.sourceCommit||'')||!/^[a-f0-9]{64}$/.test(receipt.executableSha256||'')||!/^[a-f0-9]{64}$/.test(receipt.resourceHashes?.asar||'')||!/^[a-f0-9]{64}$/.test(receipt.resourceHashes?.nativeHost||''))pending.push('Exact packaged source and resource hash binding');
 if(!receipt.launched)pending.push('Exact packaged application launch');
 if(receipt.transport==='direct-cheap-cli') {
  try {
   assert.equal(receipt.transportProvenance?.version,1);
   assert.equal(receipt.launchTransportBinding?.transport,receipt.transport);
   assert.deepEqual(receipt.launchTransportBinding?.transportProvenance,receipt.transportProvenance);
   assert.match(receipt.launchTransportBinding?.lifecycleReceiptSha256||'',/^[a-f0-9]{64}$/);
  }catch{pending.push('Prepared and launched direct transport provenance binding');}
 }
 if(receipt.runtime?.mountedFilesystemVerified!==true||receipt.runtime?.rendererAssertionsVerified!==true)pending.push('Mounted filesystem and history/recycling workflow');
 if(receipt.runtime?.copyUpgrade?.realControls!==true||receipt.runtime?.copyUpgrade?.upgradedFormat!==2||receipt.runtime?.copyUpgrade?.originalFormat!==1||receipt.runtime?.copyUpgrade?.bothMountedBytesVerified!==true)pending.push('Real copy upgrade and independently reopened original');
 if(receipt.runtime?.transportSetup?.folderBackendVerified!==true||receipt.runtime?.transportSetup?.privateRepositoryValidationVerified!==true)pending.push('Folder backend and private transport setup validation');
 if(receipt.keyboard?.verified!==true)pending.push('Background native keyboard and observed focus transition');
 if(receipt.captureReview?.verified!==true)pending.push('Every capture inspected with matching hash and privacy verdict');
 if(receipt.captureReview?.provenanceVerified!==true)pending.push('Every capture has recorded timing and matching provenance hash');
 if(receipt.cleanup?.client_ok!==true||receipt.cleanup?.recordedProcessesAbsent!==true||receipt.cleanup?.desktopClosed!==true)pending.push('Owned processes absent and hidden desktop closed');
 if(receipt.runtime?.startupRegistration?.restored!==true||receipt.runtime?.startupRegistration?.verificationOnly!==true||receipt.runtime?.startupRegistration?.enabledReadback!==true||receipt.runtime?.startupRegistration?.disabledReadback!==false)pending.push('Verification startup registration restored');
 if(receipt.fixtureCleanup?.ownedCredentialForgotten!==true)pending.push('Owned fixture credential forgotten');
 if(receipt.failure)pending.push('Resolve recorded runtime failure');
 return {passed:pending.length===0,pending};
}
async function reviewAllCaptures(receipt,runRoot,outputRoot) {
 const records=(await fs.readFile(path.join(runRoot,'step-receipts.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
 const captures=[];for(const name of (await fs.readdir(outputRoot)).filter(name=>name.endsWith('.png')).sort()){const file=path.join(outputRoot,name);const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Capture inventory contains a non-file or link.');const bytes=await fs.readFile(file);const sha256=createHash('sha256').update(bytes).digest('hex');captures.push({path:file,sha256,bytes:bytes.length,provenance:captureProvenance(records,file,sha256)});}
 const inventory={version:1,sourceCommit:receipt.sourceCommit,executableSha256:receipt.executableSha256,captures};await fs.writeFile(path.join(runRoot,'capture-inventory.json'),JSON.stringify(inventory,null,2));
 const unavailable=captures.filter(item=>!item.provenance).length;if(unavailable)throw new Error(`Capture provenance unavailable for ${unavailable} image(s).`);
 if(!captures.some(item=>path.basename(item.path)==='native-baseline.png')||!captures.some(item=>path.basename(item.path)==='native-keyboard-tab.png'))throw new Error('Required native baseline or keyboard capture is missing.');
 const markerPath=path.join(runRoot,'captures-reviewed.json');console.log(JSON.stringify({state:'all-captures-review-required',inventory:path.join(runRoot,'capture-inventory.json'),marker:markerPath,captures}));
 const deadline=Date.now()+180000;while(Date.now()<deadline){try{const review=JSON.parse(await fs.readFile(markerPath,'utf8'));if(!validateCaptureReview(review,captures,receipt))throw new Error('Final review does not bind every capture and source hash.');return {verified:true,provenanceVerified:true,inventory,reviewedAt:new Date().toISOString()};}catch(error){if(error.code!=='ENOENT')throw error;}await new Promise(resolve=>setTimeout(resolve,250));}
 throw new Error('Final capture review remains pending after 180 seconds.');
}
async function verifyNativeKeyboard({python,lowlevel,transportArgs,statePath,launch,executePlan}) {
 await command(python,[lowlevel,'wait-window','--state',statePath,'--title-pattern','^Material File Encryptor','--class-pattern','^Chrome_WidgetWin_1$','--timeout','30']);const lifecycle=JSON.parse(await fs.readFile(statePath,'utf8'));
 const make=steps=>withCdpConnectionProof({version:1,receipt:statePath,endpoint:`http://127.0.0.1:${launch.cdp.port}`,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:15000,steps},'control');
 await executePlan(make([{id:'keyboard-target-ready',op:'poll',expression:"document.querySelector('#file-search').getClientRects().length > 0 && !document.querySelector('#import-button').disabled",equals:true,intervalMs:200},{id:'keyboard-focus-setup',op:'evaluate',expression:"document.querySelector('#file-search').focus();document.activeElement.id === 'file-search'"},{id:'keyboard-empty-baseline',op:'poll',expression:"document.querySelector('#file-search').value === ''",equals:true,intervalMs:100},{id:'keyboard-before',op:'poll',expression:"document.activeElement.id",equals:'file-search',intervalMs:100}]));
 const input=await command(python,[lowlevel,'call','win_send_keys',...transportArgs],{hwnd:lifecycle.hwnd,keys:['tab']});
 if(input.window_hwnd!==lifecycle.hwnd)throw new Error('Native key result does not bind the owned window.');
 await executePlan(make([{id:'native-tab-clear-transition',op:'poll',expression:"document.activeElement === document.querySelector('#file-search').parentElement.querySelector('.field-clear')",equals:true,intervalMs:100}]));
 const secondInput=await command(python,[lowlevel,'call','win_send_keys',...transportArgs],{hwnd:lifecycle.hwnd,keys:['tab']});
 if(secondInput.window_hwnd!==lifecycle.hwnd)throw new Error('Second native key result does not bind the owned window.');
 await executePlan(make([{id:'native-tab-transition',op:'poll',expression:"document.activeElement.id",equals:'import-button',intervalMs:100}]));
 const capture=await recordNativeCapture(launch.runRoot,path.join(launch.outputRoot,'native-keyboard-tab.png'),'native-keyboard-tab',()=>command(python,[lowlevel,'call','screenshot',...transportArgs],{hwnd:lifecycle.hwnd,output_path:path.join(launch.outputRoot,'native-keyboard-tab.png')}));
 await fs.access(path.join(launch.outputRoot,'native-keyboard-tab.png'));
 return {verified:true,hwnd:lifecycle.hwnd,input,secondInput,before:'file-search',intermediate:'file-search-clear',after:'import-button',capture,pixelsInspected:false};
}
function command(executable,args,input) {return new Promise((resolve,reject)=>{const child=spawn(executable,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',bytes=0;const timer=setTimeout(()=>{child.kill();reject(new Error('Verification helper timed out.'));},90000);child.stdout.on('data',data=>{bytes+=data.length;if(bytes>1048576){child.kill();reject(new Error('Verification helper output exceeded limit.'));}else output+=data;});child.stderr.resume();child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',code=>{clearTimeout(timer);try{const result=JSON.parse(output);if(code!==0||result.client_ok===false||result.ok===false)throw helperFailure(result,input);resolve(result);}catch(error){reject(error);}});child.stdin.end(input===undefined?'':JSON.stringify(input));});}
async function freePort(){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
export async function finishOwnedLifecycle({runtime,launch,statePath,python,lowlevel,transportArgs=[],runCommand=command,executePlan}) {
 let quitRequested=runtime?.quitRequested===true;let recovery;
 if(!quitRequested) {
  recovery={attempted:true,restored:false};
  try {
   await runCommand(python,[lowlevel,'wait-window','--state',statePath,'--title-pattern','^Material File Encryptor','--class-pattern','^Chrome_WidgetWin_1$','--timeout','5']);
   await runCommand(python,[lowlevel,'prepare-exit',statePath]);
   const quit=await executePlan(withCdpConnectionProof({version:1,receipt:statePath,endpoint:`http://127.0.0.1:${launch.cdp.port}`,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:15000,steps:[
    {id:'recovery-quit-route',op:'poll',expression:"typeof window.drive?.verificationQuit === 'function'",equals:true,intervalMs:100},
    {id:'recovery-quit',op:'evaluate',expression:"window.__mfeRecoveryQuit={done:false};window.drive.verificationQuit().then(value=>{window.__mfeRecoveryQuit={done:true,value}},()=>{window.__mfeRecoveryQuit={done:true,failed:true}});true"},
    {id:'recovery-quit-settled',op:'poll',expression:'window.__mfeRecoveryQuit.done',equals:true,intervalMs:50},
    {id:'recovery-quit-proof',op:'evaluate',expression:'window.__mfeRecoveryQuit'}
   ]},'recovery'));
   const proof=quit.results?.at(-1)?.value;
   if(proof?.done!==true||proof.failed||proof.value?.restored!==true)throw Object.assign(new Error('Verification quit did not confirm startup restoration.'),{helperCode:'VERIFICATION_QUIT_NOT_RESTORED'});
   recovery.restored=true;quitRequested=true;
  } catch(error) {
   recovery.code=error.helperCode||error.code||'VERIFICATION_QUIT_FAILED';Object.assign(recovery,error.helperDetails);
   if(['UNPROVEN_PROCESS_ANCESTRY','PROCESS_IDENTITY_CHANGED','INVALID_PROCESS_IDENTITY','INVALID_PROCESS_TREE','PROCESS_PROOF_FAILED','IDENTITY_BOUND_TERMINATION_UNAVAILABLE'].includes(recovery.code))return {quitRequested:false,recovery,cleanup:{ok:false,client_ok:false,code:recovery.code,...error.helperDetails}};
  }
 }
 const cleanup=quitRequested?await runCommand(python,[lowlevel,'confirm-exit',statePath]):await runCommand(python,[lowlevel,'cleanup','--state',statePath,'--timeout','20']);
 return {quitRequested,recovery,cleanup};
}

export async function modernBuildBinding({buildReceiptPath,sourceCommit,executable,resourceHashes}) {
 assert.ok(buildReceiptPath,'MFE_BUILD_RECEIPT is required for modern layout verification');
 const bytes=await fs.readFile(buildReceiptPath),build=JSON.parse(bytes);
 assert.equal(build.sourceCommit,sourceCommit);assert.equal(build.sourceEndCommit,sourceCommit);assert.equal(build.sourceClean,true);
 assert.equal(build.buildExitCode,0);assert.equal(build.installerExitCode,0);
 assert.equal(await fs.realpath(build.artifactPath),executable);
 const artifactSha256=createHash('sha256').update(await fs.readFile(executable)).digest('hex');
 assert.equal(build.artifactSha256,artifactSha256);assert.equal(build.asarSha256,resourceHashes.asar);
 return {sourceCommit,artifactPath:executable,artifactSha256,buildReceiptPath:path.resolve(buildReceiptPath),buildReceiptSha256:createHash('sha256').update(bytes).digest('hex'),rendererAsarPath:path.join(path.dirname(executable),'resources','app.asar'),rendererAsarSha256:resourceHashes.asar};
}

async function readModernSource() {
 const git=async args=>new Promise((resolve,reject)=>{const child=spawn('git',args,{windowsHide:true});let output='';child.stdout.on('data',data=>output+=data);child.on('error',reject);child.on('close',code=>code===0?resolve(output.trim()):reject(new Error('Source observation failed')));});
 assert.equal(await git(['status','--porcelain','--untracked-files=no']),'','Tracked verification inputs changed during measurement');
 return git(['rev-parse','HEAD']);
}

export function modernNativeObservation({window,state,launch,sourceCommit,launchReceiptSha256,processSha256,inspection,profileResolved,native}) {
 assert.equal(window.client_ok,true);assert.ok(window.windowProcess,'Live HWND owner identity is unavailable');
 assert.equal(window.desktop,state.desktop);assert.equal(window.hwnd,state.hwnd);assert.ok(window.width>0&&window.height>0);
 assert.ok(Number.isFinite(Date.parse(window.observedAt)));assert.ok(Number.isInteger(window.windowProcess.pid)&&window.windowProcess.pid>0);
 assert.ok(Number.isFinite(Date.parse(window.windowProcess.creationDate)));assert.equal(path.resolve(window.windowProcess.executablePath),path.resolve(launch.executable));
 assert.equal(state.created,true);assert.equal(state.cleaned,false);assert.equal(path.resolve(state.runRoot),path.resolve(launch.runRoot));
 assert.equal(state.cdp.port,launch.cdp.port);assert.equal(state.cdp.expectedUrl,launch.cdp.expectedUrl);
 assert.equal(inspection.ok,true);assert.equal(inspection.targetCount,1);assert.equal(inspection.exactUrl,launch.cdp.expectedUrl);
 assert.equal(profileResolved,path.join(launch.runRoot,'profile'));assert.ok(launch.arguments.includes(`--verification-profile=${profileResolved}`));
 assert.equal(native?.client_ok,true,'Independent native geometry is required');assert.equal(native.hwnd,window.hwnd);assert.equal(native.desktop,state.desktop);
 assert.equal(native.process.pid,window.windowProcess.pid);assert.equal(native.process.creationDate,window.windowProcess.creationDate);assert.equal(path.resolve(native.process.executablePath),path.resolve(launch.executable));assert.equal(native.processSha256,processSha256);
 assert.ok(native.clientRect?.width>0&&native.clientRect?.height>0);assert.ok(native.dpi>0);assert.equal(native.scaleKind,'current-window-effective-dpi');assert.equal(native.physicalScaleMatrixVerified,false);
 return {sourceCommit,launchReceiptSha256,observedAt:native.observedAt,nativeGeometry:native,target:{desktop:window.desktop,title:window.title,className:window.class,pid:window.windowProcess.pid,hwnd:String(window.hwnd),creationDate:window.windowProcess.creationDate,processPath:launch.executable,processSha256},ownership:{pidResolvedLive:window.windowProcess.pid>0,hwndResolvedLive:window.hwnd===state.hwnd,exactProcessOwned:window.client_ok===true,cdpTargetVerified:inspection.targetCount===1&&inspection.exactUrl===launch.cdp.expectedUrl},privacy:{visibleDesktopUntouched:state.created===true&&window.desktop===state.desktop,taskOwnedProfile:profileResolved===path.join(launch.runRoot,'profile'),unrelatedTargetsObserved:inspection.targetCount!==1}};
}
// Resume only the human pixel-review phase. Never reuse a live PID, HWND or CDP target.
export async function resumeCaptureReview(runRoot,{review=reviewAllCaptures}={}) {
 runRoot=await fs.realpath(path.resolve(runRoot));
 const receiptPath=path.join(runRoot,'verification.json');const receipt=JSON.parse(await fs.readFile(receiptPath,'utf8'));
 assert.equal(await fs.realpath(receipt.launch.runRoot),runRoot);assert.equal(path.resolve(receipt.launch.outputRoot),path.join(runRoot,'output'));
 assert.equal(receipt.failure,undefined);assert.equal(receipt.cleanup?.client_ok,true);assert.equal(receipt.cleanup?.recordedProcessesAbsent,true);assert.equal(receipt.cleanup?.desktopClosed,true);
 assert.equal(receipt.runtime?.mountedFilesystemVerified,true);assert.equal(receipt.runtime?.rendererAssertionsVerified,true);assert.equal(receipt.fixtureCleanup?.ownedCredentialForgotten,true);
 const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
 assert.equal(await hash(receipt.launch.executable),receipt.executableSha256);
 for(const [key,file] of Object.entries({asar:path.join(path.dirname(receipt.launch.executable),'resources','app.asar'),nativeHost:path.join(path.dirname(receipt.launch.executable),'resources','native','MaterialFileEncryptor.Host.exe')}))assert.equal(await hash(file),receipt.resourceHashes[key]);
 receipt.captureReview=await review(receipt,runRoot,receipt.launch.outputRoot);delete receipt.reviewPending;
 Object.assign(receipt,finalVerdict(receipt));receipt.pixelsInspected=receipt.captureReview?.verified===true;
 await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2));return receipt;
}

export function lifecycleTransport({cli,endpoint,installedLowlevel}) {
 if(cli&&endpoint)throw new Error('Select exactly one lifecycle transport.');
 const useAdapter=Boolean(cli||endpoint);
 return {useAdapter,lowlevel:useAdapter?fileURLToPath(new URL('./local-headless-desktop-check-cli.py',import.meta.url)):installedLowlevel,transport:endpoint?'persistent-http-adapter':cli?'direct-cheap-cli':'streamable-http'};
}

export function directLaunchTransportBinding(prepared,lifecycle,receiptBytes) {
 try {
  assert.equal(prepared.transport,'direct-cheap-cli');assert.equal(lifecycle.transport,prepared.transport);
  assert.equal(Object.hasOwn(lifecycle,'endpoint'),false);
  assert.ok(prepared.transportProvenance&&typeof prepared.transportProvenance==='object'&&!Array.isArray(prepared.transportProvenance));
  assert.equal(prepared.transportProvenance.version,1);
  assert.deepEqual(lifecycle.transportProvenance,prepared.transportProvenance);
  assert.ok(Buffer.isBuffer(receiptBytes));
  assert.deepEqual(JSON.parse(receiptBytes.toString('utf8')),lifecycle);
 } catch {
  throw Object.assign(new Error('DIRECT_TRANSPORT_BINDING_MISMATCH: prepared and launched transport provenance differ.'),{code:'DIRECT_TRANSPORT_BINDING_MISMATCH'});
 }
 return {transport:lifecycle.transport,transportProvenance:lifecycle.transportProvenance,lifecycleReceiptSha256:createHash('sha256').update(receiptBytes).digest('hex')};
}

export async function createLiveRunRoot({temporaryRoot=os.tmpdir()}={}) {
 const parent=await fs.realpath(temporaryRoot);
 const root=await fs.realpath(await fs.mkdtemp(path.join(parent,'mfe-headless-')));
 assert.equal(path.dirname(root),parent,'Live verification root must be a direct child of actual TEMP.');
 return root;
}

export async function retireNeverLaunchedFixture({fixture,launchAttempted,statePath,retire=forgetRuntimeFixture,inspect=fs.lstat}) {
 assert.equal(launchAttempted,false,'An attempted or uncertain launch requires lifecycle ownership proof.');
 assert.equal(fixture?.prepared,true,'Only a completed prepared fixture may use never-launched retirement.');
 assert.equal(path.isAbsolute(statePath),true);
 try {await inspect(statePath);} catch(error) {
  if(error.code!=='ENOENT')throw error;
  return {fixtureCleanup:await retire(fixture),cleanup:{ok:true,client_ok:true,neverLaunched:true,desktopNeverCreated:true,reason:'Launch was never attempted; no lifecycle receipt exists.'}};
 }
 throw new Error('An existing lifecycle receipt requires ownership proof before fixture retirement.');
}

export async function runLocalHeadlessCheck(env=process.env) {
 if(env.MFE_CAPTURE_REVIEW_ROOT){const receipt=await resumeCaptureReview(env.MFE_CAPTURE_REVIEW_ROOT);const evidenceDir=path.resolve(env.MFE_DESKTOP_EVIDENCE_DIR||'out/evidence');const existingPath=path.join(evidenceDir,'desktop-check.json');const existing=JSON.parse(await fs.readFile(existingPath,'utf8'));assert.equal(existing.sourceCommit,receipt.sourceCommit);assert.equal(existing.executableSha256,receipt.executableSha256);assert.equal(path.resolve(existing.launch.runRoot),path.resolve(receipt.launch.runRoot));await fs.writeFile(existingPath,JSON.stringify({...existing,...receipt},null,2));console.log(JSON.stringify({reviewResumed:true,passed:receipt.passed,pending:receipt.pending}));if(!receipt.passed)throw new Error('Preserved review remains incomplete.');return receipt;}
 if(process.platform!=='win32')throw new Error('The local isolated desktop route requires Windows.');
 const executable=await fs.realpath(path.resolve(env.MFE_DESKTOP_EXECUTABLE||'out/material-file-encryptor-win32-x64/MaterialFileEncryptor.exe'));
 const runRoot=await createLiveRunRoot();const launch=makeLaunch({executable,runRoot,port:await freePort()});
 await fs.mkdir(launch.outputRoot);await fs.mkdir(path.join(runRoot,'profile'));
 const skillRoot=path.join(os.homedir(),'.agents','skills');
 const installedLowlevel=env.MFE_LOWLEVEL_CLIENT||path.join(skillRoot,'run-lowlevel-headless-app','scripts','lowlevel_mcp_client.py');
 const cdp=env.MFE_CDP_DRIVER||path.join(skillRoot,'drive-electron-cdp-headless','scripts','cdp_driver.mjs');
 await fs.access(installedLowlevel);await fs.access(cdp);
 const cli=env.MFE_LOWLEVEL_CLI;const endpoint=env.MFE_LOWLEVEL_URL;const {useAdapter,lowlevel,transport}=lifecycleTransport({cli,endpoint,installedLowlevel});
 if(useAdapter){process.env.MFE_LOWLEVEL_CLIENT=installedLowlevel;if(endpoint)process.env.MFE_LOWLEVEL_URL=endpoint;else delete process.env.MFE_LOWLEVEL_URL;if(cli){if(!endpoint)await fs.access(cli);process.env.MFE_LOWLEVEL_CLI=cli;}else delete process.env.MFE_LOWLEVEL_CLI;}
 const transportArgs=env.MFE_LOWLEVEL_URL?['--url',env.MFE_LOWLEVEL_URL]:[];
 const statePath=path.join(runRoot,'lifecycle.json');const plan=makeBaselinePlan(launch,statePath);
 const source=await new Promise((resolve,reject)=>{const child=spawn('git',['rev-parse','HEAD'],{windowsHide:true});let value='';child.stdout.on('data',data=>value+=data);child.on('close',code=>code===0?resolve(value.trim()):reject(new Error('Source identity unavailable.')));});
 if(env.MFE_HEADLESS_EXECUTE==='1'&&!/^[a-f0-9]{40}$/.test(env.MFE_SOURCE_COMMIT||''))throw new Error('Provide the exact packaged build source commit through MFE_SOURCE_COMMIT.');
 const sourceBinding=env.MFE_SOURCE_COMMIT||source;
 const resourceHashes={};for(const [name,file] of Object.entries({asar:path.join(path.dirname(executable),'resources','app.asar'),nativeHost:path.join(path.dirname(executable),'resources','native','MaterialFileEncryptor.Host.exe')}))resourceHashes[name]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
 const receipt={version:1,transport,resourceHashes,route:'cheap-lowlevel-headless',sourceCommit:sourceBinding,executableSha256:createHash('sha256').update(await fs.readFile(executable)).digest('hex'),launch,preparedAt:new Date().toISOString(),launched:false,pixelsInspected:false,interactionsVerified:false};
 if(transport==='direct-cheap-cli') {
  const provenance=await command(env.MFE_PYTHON||'python',[lowlevel,'transport-provenance']);
  assert.equal(provenance.client_ok,true);assert.equal(provenance.transport,transport);assert.equal(Object.hasOwn(provenance,'endpoint'),false);
  receipt.transportProvenance=provenance.transportProvenance;
 }
 const modernBinding=env.MFE_MODERN_UI_CHECK==='1'?await modernBuildBinding({buildReceiptPath:env.MFE_BUILD_RECEIPT,sourceCommit:sourceBinding,executable,resourceHashes}):null;
 await fs.writeFile(path.join(runRoot,'prepared.json'),JSON.stringify(receipt,null,2));
 if(env.MFE_HEADLESS_EXECUTE!=='1') {console.log(JSON.stringify({prepared:true,launched:false,runRoot,requires:'Set MFE_HEADLESS_EXECUTE=1 only after reviewing the packaged executable and isolated profile arguments.'}));return receipt;}
 console.log(JSON.stringify({state:'source-bound-launch-prepared',runRoot,sourceCommit:receipt.sourceCommit,executableSha256:receipt.executableSha256,resourceHashes}));
 const python=env.MFE_PYTHON||'python';let cleanup;let failure;let fixture;let runtime;let launchAttempted=false;
 const executePlan=createPlanRecorder(runRoot,plan=>command(process.execPath,[cdp,'run'],plan));
 const modernProbeEvidence=modernBinding?createModernProbeEvidence({binding:modernBinding,outputRoot:launch.outputRoot,helperPath:cdp,validate:input=>command(process.execPath,[path.join(skillRoot,'diagnose-built-ui-layout','scripts','validate-layout-probe.mjs'),'--input',input]),observe:async()=>{
  const sourceCommit=await readModernSource();assert.equal(sourceCommit,modernBinding.sourceCommit);
  const window=await command(python,[lowlevel,'wait-window','--state',statePath,'--title-pattern','^Material File Encryptor','--class-pattern','^Chrome_WidgetWin_1$','--timeout','30']);
  const inspectionPlan=withCdpConnectionProof(plan,'modern-observation');
  const bytes=await fs.readFile(statePath),state=JSON.parse(bytes),inspection=await command(process.execPath,[cdp,'inspect'],inspectionPlan);
  const processSha256=createHash('sha256').update(await fs.readFile(executable)).digest('hex');assert.equal(processSha256,modernBinding.artifactSha256);
  const native=await command(python,[fileURLToPath(new URL('./native-window-observation.py',import.meta.url))],{helper:installedLowlevel,receipt:statePath});
  const observation=modernNativeObservation({native,window,state,launch,sourceCommit,launchReceiptSha256:createHash('sha256').update(bytes).digest('hex'),processSha256,inspection,profileResolved:await fs.realpath(path.join(runRoot,'profile'))});
  await appendStepReceipt(runRoot,{version:1,kind:'modern-native-observation',observation,window,inspection});return observation;
 }}):undefined;
 try {
  await command(python,[installedLowlevel,'self-test']);await command(process.execPath,[cdp,'self-test']);
  await command(python,[lowlevel,'preflight',...transportArgs,'--require','launch_on_headless_desktop','--require','list_headless_windows','--require','screenshot','--require','close_headless_desktop']);
  if(env.MFE_RUNTIME_FIXTURE==='1') {if(!useAdapter)throw new Error('Runtime graceful-exit proof requires the project lifecycle adapter.');fixture=await prepareRuntimeFixture({executable,profile:path.join(runRoot,'profile')});receipt.fixture={root:fixture.root,prepared:fixture.prepared,driveLetter:fixture.driveLetter};}
  launchAttempted=true;receipt.launchAttempted=true;
  await command(python,[lowlevel,'launch',...transportArgs,'--state',statePath],launch);receipt.launched=true;
  if(transport==='direct-cheap-cli') {
   const launchBytes=await fs.readFile(statePath);
   receipt.launchTransportBinding=directLaunchTransportBinding(receipt,JSON.parse(launchBytes.toString('utf8')),launchBytes);
  }
  await command(python,[lowlevel,'wait-window','--state',statePath,'--title-pattern','^Material File Encryptor','--class-pattern','^Chrome_WidgetWin_1$','--timeout','30']);
  const lifecycle=JSON.parse(await fs.readFile(statePath,'utf8'));
  const initial=await recordNativeCapture(runRoot,path.join(launch.outputRoot,'native-baseline.png'),'native-baseline',()=>command(python,[lowlevel,'call','screenshot',...transportArgs],{hwnd:lifecycle.hwnd,output_path:path.join(launch.outputRoot,'native-baseline.png')}));
  await fs.writeFile(path.join(runRoot,'initial-capture-result.json'),JSON.stringify(initial,null,2));
  receipt.cdp=await executePlan(plan);
  if(env.MFE_HEADLESS_INTERACTIONS==='1'||fixture) {receipt.baselineReview=await requirePixelReview(runRoot,path.join(launch.outputRoot,'native-baseline.png'));if(fixture){receipt.keyboard=await verifyNativeKeyboard({python,lowlevel,transportArgs,statePath,launch,executePlan});runtime=await checkMountedRuntime({fixture,launch,receipt:statePath,executePlan,modernProbeEvidence,modernUiCheck:env.MFE_MODERN_UI_CHECK==='1',prepareExit:()=>command(python,[lowlevel,'prepare-exit',statePath])});receipt.runtime=runtime;}else receipt.interfaceWorkflow=await executePlan(makeInterfacePlan(launch,statePath));receipt.rendererAssertionsVerified=true;}
 } catch(error) {failure=String(error.message).slice(0,200);receipt.failureDetails=safeFailureDetails(error.helperResult);}
 finally {try {
  if(fixture&&!launchAttempted){const retired=await retireNeverLaunchedFixture({fixture,launchAttempted,statePath});cleanup=retired.cleanup;receipt.fixtureCleanup=retired.fixtureCleanup;}
  else {await fs.access(statePath);const finished=await finishOwnedLifecycle({runtime,launch,statePath,python,lowlevel,transportArgs,executePlan});cleanup=finished.cleanup;receipt.quitRecovery=finished.recovery;if(fixture&&finished.quitRequested&&cleanup.client_ok)receipt.fixtureCleanup=await forgetRuntimeFixture(fixture);}
 }catch(error){cleanup={ok:false,code:error.helperCode||error.code||'OWNED_LIFECYCLE_FAILED',reason:String(error.message).slice(0,200)};}
  receipt.launchAttempted=launchAttempted;
  Object.assign(receipt,{finishedAt:new Date().toISOString(),failure,cleanup,profileRetained:true});
  if(!failure&&runtime&&cleanup?.client_ok){try{receipt.captureReview=await reviewAllCaptures(receipt,runRoot,launch.outputRoot);}catch(error){receipt.reviewPending=String(error.message).slice(0,200);}}
  Object.assign(receipt,finalVerdict(receipt));receipt.pixelsInspected=receipt.captureReview?.verified===true;receipt.interactionsVerified=runtime?.rendererAssertionsVerified===true;
  await fs.writeFile(path.join(runRoot,'verification.json'),JSON.stringify(receipt,null,2));
  const evidenceDir=path.resolve(env.MFE_DESKTOP_EVIDENCE_DIR||'out/evidence');await fs.mkdir(evidenceDir,{recursive:true});
  const compatible={...receipt,platform:'win32',packagedArtifact:{launchedBuiltArtifact:receipt.launched,asar:Boolean(resourceHashes.asar),nativeHelperPresent:Boolean(resourceHashes.nativeHost)},mountedFilesystemChecked:runtime?.mountedFilesystemVerified===true,startupRegistration:runtime?.startupRegistration||null,fixtureRetained:Boolean(fixture&&!(receipt.fixtureCleanup?.ownedCredentialForgotten&&cleanup?.client_ok&&(cleanup?.recordedProcessesAbsent||cleanup?.neverLaunched))),fixturePreservedByDesign:Boolean(fixture),fixtureRetentionReason:fixture?'Owned evidence retained; safe only after credential removal and process exit or proven never-attempted launch':null,cleanupErrors:cleanup?.client_ok===true?[]:[{phase:'owned-lifecycle',reason:cleanup?.reason||'Cleanup not verified'}]};
  await fs.writeFile(path.join(evidenceDir,'desktop-check.json'),JSON.stringify(compatible,null,2));}
 console.log(JSON.stringify({runRoot,launched:receipt.launched,passed:receipt.passed,pixelsInspected:receipt.pixelsInspected,pending:receipt.pending}));
 if(failure||cleanup?.ok===false)throw new Error(failure||'Owned lifecycle cleanup failed.');if(!receipt.passed)throw new Error('Desktop verification is incomplete: '+receipt.pending.join('; '));return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await runLocalHeadlessCheck();
