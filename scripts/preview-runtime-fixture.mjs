import {withCdpConnectionProof} from './cdp-connection-plan.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {NativeClient} from '../src/main/native-client.js';
import {runModernPhase} from './modern-ui-check.mjs';

export function fixturePreferences(fixture) {return {startup:false,autoUnlock:true,storageDir:fixture.storageDir,cacheDir:fixture.cacheDir,driveLetter:fixture.driveLetter,transport:'folder',historyRetentionDays:null};}
async function disposeNative(client) {
 const child=client.child;if(!child)return;
 const stopped=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Owned native fixture helper did not exit.')),15000);child.once('exit',()=>{clearTimeout(timer);resolve();});});client.dispose();await stopped;
}
export async function prepareRuntimeFixture({executable,profile,createClient=exe=>new NativeClient(exe)}) {
 const documents=process.env.MFE_VERIFICATION_DOCUMENTS||execFileSync('powershell.exe',['-NoProfile','-Command',"[Environment]::GetFolderPath('MyDocuments')"],{encoding:'utf8',windowsHide:true}).trim();assert.ok(documents&&path.isAbsolute(documents),'Resolve the current known Documents folder and provide MFE_VERIFICATION_DOCUMENTS.');
 const root=await fs.mkdtemp(path.join(documents,'MaterialFileEncryptor-Verification-'));
 const fixture={version:1,root,storageDir:path.join(root,'storage'),cacheDir:path.join(root,'cache'),nativeExecutable:path.join(path.dirname(executable),'resources','native','MaterialFileEncryptor.Host.exe'),prepared:false};
 await fs.mkdir(fixture.storageDir);await fs.mkdir(fixture.cacheDir);const client=createClient(fixture.nativeExecutable);let password=randomBytes(32).toString('base64url');
 try {const state=await client.request('status');assert.equal(state.driver.available,true,'WinFsp is required for a mounted fixture.');fixture.driveLetter=state.availableDriveLetters.includes('M:')?'M:':state.availableDriveLetters[0];assert.match(fixture.driveLetter||'',/^[D-Z]:$/);
  await client.request('create',{...fixturePreferences(fixture),password,partSizeBytes:10485760});password=undefined;
  const locked=await client.request('lock');assert.equal(locked.locked,true);assert.equal(locked.mounted,false);
  await fs.mkdir(profile,{recursive:true});await fs.writeFile(path.join(profile,'preferences.json'),JSON.stringify(fixturePreferences(fixture)),{flag:'wx',mode:0o600});fixture.prepared=true;
 } finally {password=undefined;await disposeNative(client);await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify(fixture,null,2));}
 return fixture;
}
export async function forgetRuntimeFixture(fixture,{createClient=exe=>new NativeClient(exe)}={}) {
 assert.equal(await fs.realpath(fixture.root),path.resolve(fixture.root));const rootInfo=await fs.lstat(fixture.root);assert.equal(rootInfo.isDirectory(),true);assert.equal(rootInfo.isSymbolicLink(),false);
 const saved=JSON.parse(await fs.readFile(path.join(fixture.root,'fixture.json'),'utf8'));assert.equal(saved.storageDir,fixture.storageDir);assert.equal(saved.cacheDir,fixture.cacheDir);assert.equal(saved.nativeExecutable,fixture.nativeExecutable);
 assert.equal(path.dirname(fixture.storageDir),fixture.root);assert.equal(path.dirname(fixture.cacheDir),fixture.root);
 const targets=[{storageDir:fixture.storageDir,cacheDir:fixture.cacheDir}],retired=[];
 for(const label of ['gui','legacy','upgrade']) {
  const record=path.join(fixture.root,'owned-'+label+'-fixture.json');let bytes;
  try{const stat=await fs.lstat(record);assert.equal(stat.isFile(),true);assert.equal(stat.isSymbolicLink(),false);assert.equal(await fs.realpath(record),record);bytes=await fs.readFile(record,'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}
  const target=JSON.parse(bytes);assert.equal(target.version,1);assert.equal(target.root,fixture.root);assert.equal(target.nativeExecutable,fixture.nativeExecutable);
  for(const [key,suffix]of [['storageDir','storage'],['cacheDir','cache']]){assert.equal(target[key],path.join(fixture.root,label+'-'+suffix));assert.equal(await fs.realpath(target[key]),target[key]);}
  targets.push({storageDir:target.storageDir,cacheDir:target.cacheDir});retired.push(label);
 }
 const client=createClient(fixture.nativeExecutable);try {for(const target of targets)await client.request('forgetSavedCredential',target);}finally{await disposeNative(client);}
 let ownedKeyRetired=false;
 if(retired.includes('gui')){const key=path.join(fixture.root,'gui-verification.key');try{const stat=await fs.lstat(key);assert.equal(stat.isFile(),true);assert.equal(stat.isSymbolicLink(),false);assert.equal(await fs.realpath(key),key);await fs.unlink(key);}catch(error){if(error.code!=='ENOENT')throw error;}ownedKeyRetired=true;}
 return {ownedCredentialForgotten:true,ownedFixtureCredentialsForgotten:retired,ownedKeyRetired,fixtureRetained:true};
}

async function registerGuiFixture(gui,label) {
 assert.ok(['gui','legacy','upgrade'].includes(label));const saved=JSON.parse(await fs.readFile(path.join(gui.root,'fixture.json'),'utf8'));
 assert.equal(saved.root,gui.root);for(const [key,suffix]of [['storageDir','storage'],['cacheDir','cache']]){assert.equal(gui[key],path.join(gui.root,label+'-'+suffix));assert.equal(await fs.realpath(gui[key]),gui[key]);}
 await fs.writeFile(path.join(gui.root,'owned-'+label+'-fixture.json'),JSON.stringify({version:1,root:gui.root,nativeExecutable:saved.nativeExecutable,storageDir:gui.storageDir,cacheDir:gui.cacheDir}),{flag:'wx',mode:0o600});
}
export function runtimeCompletion(state,{synchronized=false,applicationError=false}={}) {
 if(applicationError||(synchronized&&state.sync?.error))return {failed:true,ready:false};
 const operationFinished=state.operation==null;
 return {failed:false,ready:operationFinished&&(!synchronized||(state.sync?.running===false&&(state.transport?.available===true||state.sync?.sourceAvailable===true)&&(state.sync?.pendingCommits??0)===0&&!state.transport?.pendingSynchronization))};
}
const freshGuiFixtures=new WeakSet();
export async function prepareGuiVaultFixture(fixture) {
 const root=await fs.realpath(fixture.root);assert.equal(root,path.resolve(fixture.root),'GUI fixture root must resolve to its recorded owned directory.');
 const saved=JSON.parse(await fs.readFile(path.join(root,'fixture.json'),'utf8'));assert.equal(saved.root,fixture.root);assert.equal(saved.driveLetter,fixture.driveLetter);
 const gui={root,storageDir:path.join(root,'gui-storage'),cacheDir:path.join(root,'gui-cache'),keyFilePath:path.join(root,'gui-verification.key'),driveLetter:fixture.driveLetter};
 await fs.mkdir(gui.storageDir);await fs.mkdir(gui.cacheDir);
 await registerGuiFixture(gui,'gui');
 const key=randomBytes(32);try{await fs.writeFile(gui.keyFilePath,key,{flag:'wx',mode:0o600});}finally{key.fill(0);}
 freshGuiFixtures.add(gui);return gui;
}

export function validateNativeEmptyRoot(proof,root) {
 assert.equal(proof.version,1);assert.equal(proof.root,root);assert.equal(proof.empty,true);
 assert.ok(['0xC000000F','0x80000006'].includes(proof.completedNtStatus));assert.equal(proof.returnedBytes,0);
 assert.ok(['0x00000103',proof.completedNtStatus].includes(proof.initialNtStatus));
 assert.deepEqual(proof.before,proof.after);assert.deepEqual(proof.before,proof.reopened);
 const identity=proof.before;assert.equal(identity.directory,true);assert.equal(identity.filesystem,'MaterialVault');
 assert.ok(Number.isInteger(identity.attributes)&&(identity.attributes&16)!==0);
 assert.equal(typeof identity.volumeSerial,'string');assert.match(identity.volumeSerial,/^(0|[1-9][0-9]{0,9})$/);assert.ok(BigInt(identity.volumeSerial)<=0xffffffffn);
 assert.equal(identity.handleVolumeSerial,identity.volumeSerial);assert.equal(typeof identity.fileIndex,'string');assert.match(identity.fileIndex,/^(0|[1-9][0-9]{0,19})$/);assert.ok(BigInt(identity.fileIndex)<=0xffffffffffffffffn);
 return true;
}

export async function proveFreshGuiRootEmpty(gui,{launch,receipt,observeStatus,platform=process.platform,runProbe}={}) {
 assert.equal(platform,'win32','Native empty-root proof requires Windows.');
 assert.equal(freshGuiFixtures.has(gui),true,'Only a newly prepared owned GUI fixture may be inspected.');
 const root=await fs.realpath(gui.root);assert.equal(root,gui.root);
 const saved=JSON.parse(await fs.readFile(path.join(root,'fixture.json'),'utf8'));
 assert.equal(saved.root,root);assert.equal(saved.driveLetter,gui.driveLetter);assert.equal(saved.prepared,true);
 assert.match(gui.driveLetter,/^[D-Z]:$/);
 for(const [key,name]of [['storageDir','gui-storage'],['cacheDir','gui-cache']]) {
  assert.equal(gui[key],path.join(root,name));assert.equal(await fs.realpath(gui[key]),gui[key]);
  const stat=await fs.lstat(gui[key]);assert.equal(stat.isDirectory(),true);assert.equal(stat.isSymbolicLink(),false);
 }
 const runRoot=await fs.realpath(launch.runRoot);assert.equal(runRoot,path.resolve(launch.runRoot));
 const runInfo=await fs.lstat(runRoot);assert.equal(runInfo.isDirectory(),true);assert.equal(runInfo.isSymbolicLink(),false);
 assert.equal(path.resolve(receipt),path.join(runRoot,'lifecycle.json'));
 const lifecycleInfo=await fs.lstat(receipt);assert.equal(lifecycleInfo.isFile(),true);assert.equal(lifecycleInfo.isSymbolicLink(),false);assert.equal(await fs.realpath(receipt),path.resolve(receipt));
 const lifecycleBytes=await fs.readFile(receipt),lifecycle=JSON.parse(lifecycleBytes);
 assert.equal(lifecycle.runRoot,runRoot);assert.equal(lifecycle.created,true);assert.notEqual(lifecycle.cleaned,true);
 assert.equal(lifecycle.process.executablePath,launch.executable);
 const binding=JSON.parse(await fs.readFile(path.join(runRoot,'prepared.json'),'utf8'));
 assert.match(binding.sourceCommit,/^[a-f0-9]{40}$/);assert.match(binding.executableSha256,/^[a-f0-9]{64}$/);
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 assert.equal(hash(await fs.readFile(launch.executable)),binding.executableSha256);
 const assertMounted=state=>{assert.equal(state.mounted,true);assert.equal(state.locked,false);assert.equal(state.operation,null);for(const key of ['storageDir','cacheDir','driveLetter'])assert.equal(state[key],gui[key]);};
 const beforeStatus=await observeStatus();assertMounted(beforeStatus);
 const helper=fileURLToPath(new URL('./native-empty-root-proof.py',import.meta.url));
 const helperBytes=await fs.readFile(helper);const nativeRoot=gui.driveLetter+'\\';
 const probe=runProbe||((request)=>JSON.parse(execFileSync(process.env.MFE_PYTHON||'python',[helper],{input:JSON.stringify(request),encoding:'utf8',windowsHide:true,timeout:12000,maxBuffer:65536})));
 const native=await probe({root:nativeRoot});validateNativeEmptyRoot(native,nativeRoot);
 const afterStatus=await observeStatus();assertMounted(afterStatus);assert.deepEqual(afterStatus,beforeStatus);
 assert.equal(hash(await fs.readFile(receipt)),hash(lifecycleBytes),'Lifecycle identity changed during the native proof.');
 assert.equal(hash(await fs.readFile(launch.executable)),binding.executableSha256);
 assert.equal(hash(await fs.readFile(helper)),hash(helperBytes));
 const result={version:1,sourceCommit:binding.sourceCommit,executableSha256:binding.executableSha256,helperSha256:hash(helperBytes),fixtureHelperSha256:hash(await fs.readFile(fileURLToPath(import.meta.url))),lifecycleSha256:hash(lifecycleBytes),observedAt:new Date().toISOString(),beforeStatus,afterStatus,native,empty:true};
 await fs.writeFile(path.join(runRoot,'gui-empty-root-proof.json'),JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
 freshGuiFixtures.delete(gui);return result;
}
export async function retireGuiVaultKey(gui) {
 const root=await fs.realpath(gui.root);const expected=path.join(root,'gui-verification.key');
 assert.equal(path.resolve(gui.keyFilePath),expected);assert.equal(path.dirname(gui.storageDir),root);assert.equal(path.dirname(gui.cacheDir),root);
 const info=await fs.lstat(expected);assert.equal(info.isFile(),true);assert.equal(info.isSymbolicLink(),false);assert.equal(await fs.realpath(expected),expected);
 await fs.unlink(expected);return {ownedKeyRetired:true};
}
export function makeGuiVaultFormSteps(gui,mode,outputRoot,label=mode) {
 assert.ok(['create','unlock','upgrade'].includes(mode));assert.match(label,/^[a-z-]+$/);assert.match(gui.driveLetter,/^[D-Z]:$/);
 const steps=[];const prefix='gui-'+label;
 const action=(id,op,values,expression)=>{steps.push({id:prefix+'-'+id,op,...values},{id:prefix+'-'+id+'-state',op:'poll',expression,equals:true,intervalMs:200},{id:prefix+'-'+id+'-capture',op:'capture',path:path.join(outputRoot,'runtime-'+prefix+'-'+id+'.png'),overwrite:false});};
 action('folder-transport','type',{selector:'#transport-mode',text:'folder',clear:true},"document.querySelector('#transport-mode').value === 'folder' && document.querySelector('#private-git-fields').hidden");
 action('key-mode','click',{selector:'.credential-selector label:has(input[value="keyFile"])'},"!document.querySelector('#key-fields').hidden && document.querySelector('#password-fields').hidden");
 for(const [id,selector,text] of [['storage','#storage-input',gui.storageDir],['cache','#cache-input',gui.cacheDir],['key-path','#key-path',gui.keyFilePath]])action(id,'type',{selector,text,clear:true},`document.querySelector(${JSON.stringify(selector)}).value === ${JSON.stringify(text)}`);
 if(mode==='create') {
  action('picker-open','click',{selector:'#drive-letter-toggle'},"!document.querySelector('#drive-letter-options').hidden");
  const selector=`#drive-letter-options button[data-letter="${gui.driveLetter[0]}"]`;
  steps.push({id:prefix+'-letter-available',op:'poll',expression:`document.querySelector(${JSON.stringify(selector)}) !== null`,equals:true,intervalMs:200});
  action('picker-letter','click',{selector},`document.querySelector('#drive-letter-options').hidden && document.querySelector('#drive-letter').value === ${JSON.stringify(gui.driveLetter)}`);
 } else action('manual-letter','type',{selector:'#drive-letter',text:gui.driveLetter.toLowerCase(),clear:true},`document.querySelector('#drive-letter').value === ${JSON.stringify(gui.driveLetter)}`);
 steps.push({id:prefix+'-submit-ready',op:'poll',expression:"!document.querySelector('#dialog-submit').disabled && document.querySelector('#dialog-error').hidden",equals:true,intervalMs:200});
 return steps;
}
// A fresh storage identity prevents rewriting the immutable header already recorded
// by the GUI-created vault's host history. The original pair remains untouched.
export async function prepareEmptyLegacyGuiVault(gui,observed) {
 assert.equal(observed.locked,true);assert.equal(observed.mounted,false);assert.equal(observed.emptyBeforeLock,true);
 const root=await fs.realpath(gui.root);assert.equal(root,path.resolve(gui.root));
 const changes=[];const legacy={...gui,storageDir:path.join(root,'legacy-storage'),cacheDir:path.join(root,'legacy-cache')};
 for(const name of ['storageDir','cacheDir']) {
  const folder=gui[name];assert.equal(path.dirname(folder),root);assert.equal(await fs.realpath(folder),folder);
  const file=path.join(folder,'vault.json');const stat=await fs.lstat(file);assert.equal(stat.isFile(),true);assert.equal(stat.isSymbolicLink(),false);
  const value=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(value.Format,2);changes.push({file:path.join(legacy[name],'vault.json'),value});
 }
 await fs.mkdir(legacy.storageDir);await fs.mkdir(legacy.cacheDir);await registerGuiFixture(legacy,'legacy');
 for(const {file,value} of changes){value.Format=1;await fs.writeFile(file,JSON.stringify(value),{flag:'wx',mode:0o600});}
 for(const {file} of changes)assert.equal(JSON.parse(await fs.readFile(file,'utf8')).Format,1);
 return {format:1,emptyFixtureConverted:true,gui:legacy};
}

export function actionPollSteps(id,selector,expression) {
 // Stop polling when the UI reports rejection, then assert it separately. A
 // visible backend error must not be disguised as a successful completion.
 return [{id,op:'click',selector},{id:id+'-state',op:'poll',expression:`!document.querySelector('#main-error').hidden || (${expression})`,equals:true,intervalMs:200},{id:id+'-result',op:'evaluate',expression:"({applicationError:!document.querySelector('#main-error').hidden,message:document.querySelector('#main-error').textContent.slice(0,400)})"}];
}

export function historyRestoreObservation(versionId) {
 const surface=document.querySelector('#view-history');
 const {archiveRequest:request,archiveCompletedRequest:completedRequest,archiveRender:render,archiveRendered:rendered,archiveState:state}=surface.dataset;
 const ready=state==='ready'&&surface.getAttribute('aria-busy')==='false'&&Boolean(request)&&request===completedRequest&&Boolean(render)&&render===rendered;
 const matches=[...document.querySelectorAll('#history-list [data-archive-restore]')].filter(el=>el.dataset.versionId===versionId);
 const controls=matches.slice(0,2).map(el=>{const rect=el.getBoundingClientRect(),style=getComputedStyle(el);return {visible:rect.width>0&&rect.height>0&&style.visibility!=='hidden'&&style.display!=='none',enabled:!el.disabled};});
 return {versionId,request,completedRequest,render,rendered,state,ariaBusy:surface.getAttribute('aria-busy'),ready,count:matches.length,controls};
}
export function historyRestoreSelector(versionId) {
 assert.equal(typeof versionId,'string');assert.ok(versionId.length>0&&versionId.length<=512&&!/[\x00-\x1f\x7f]/.test(versionId));
 return '#history-list [data-archive-restore][data-version-id='+JSON.stringify(versionId)+']';
}
export function assertHistoryRestoreObservation(observed) {
 assert.equal(observed.ready,true,'History render is not complete.');
 assert.equal(observed.count,1,'Exact history version must resolve to one rendered restore control.');
 assert.equal(observed.controls[0].visible,true,'Exact history restore control is hidden.');
 assert.equal(observed.controls[0].enabled,true,'Exact history restore control is disabled.');
}
export async function inspectHistoryRestore({versionId,observe,record}) {
 const observed=await observe();
 await record(observed);
 assert.equal(observed.versionId,versionId,'History observation identity changed.');
 assertHistoryRestoreObservation(observed);
 return observed;
}
export async function retainRestoreActionFailure(error,{observe,record}) {
 const diagnostic={version:1,recordedAt:new Date().toISOString(),phase:'failed-action',code:error.helperCode||error.code||'RESTORE_ACTION_FAILED'};
 try {diagnostic.observation=await observe();}
 catch(queryError) {diagnostic.queryFault={code:queryError.helperCode||queryError.code||'OBSERVATION_FAILED'};error.restoreObservationFault=diagnostic.queryFault;}
 try {await record(diagnostic);}
 catch(saveError) {error.restoreDiagnosticSaveFault={code:saveError.code||'DIAGNOSTIC_SAVE_FAILED'};}
 throw error;
}

export async function checkMountedRuntime({fixture,launch,receipt,executePlan,prepareExit,modernProbeEvidence,modernUiCheck=process.env.MFE_MODERN_UI_CHECK==='1'}) {
 const modernUi={enabled:modernUiCheck};
 const checks=[];let sequence=0;
 const execute=async (steps,purpose='runtime')=>executePlan(withCdpConnectionProof({version:1,receipt,endpoint:`http://127.0.0.1:${launch.cdp.port}`,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:60000,steps},purpose));
 const query=async expression=>{const result=await execute([{id:'query-'+(++sequence),op:'evaluate',expression}]);return result.results.at(-1).value;};
 const asyncQuery=async expression=>{const key='__mfeRuntime'+(++sequence);await execute([{id:'begin-'+sequence,op:'evaluate',expression:`window.${key}={done:false};Promise.resolve(${expression}).then(value=>{window.${key}={done:true,value}},()=>{window.${key}={done:true,failed:true}});true`},{id:'wait-'+sequence,op:'poll',expression:`window.${key}.done`,equals:true,intervalMs:200}]);const result=await query(`window.${key}`);assert.equal(result.failed,undefined,'Runtime bridge request failed.');return result.value;};
 const capture=id=>({id:id+'-capture',op:'capture',path:path.join(launch.outputRoot,'runtime-'+id+'.png'),overwrite:false});
 const waitBackend=async synchronized=>{
  const key='__mfeCompletion'+(++sequence);
  const completionExpression=`(${runtimeCompletion.toString()})(s,{synchronized:${JSON.stringify(synchronized)},applicationError:!document.querySelector('#main-error').hidden})`;
  await execute([{id:'completion-start-'+sequence,op:'evaluate',expression:`window.${key}={done:false,inFlight:false};true`},{id:'completion-wait-'+sequence,op:'poll',expression:`(()=>{const p=window.${key};if(p.done)return true;if(!p.inFlight){p.inFlight=true;window.drive.status().then(s=>{p.inFlight=false;const c=${completionExpression};if(c.failed){p.failed=true;p.done=true;}else if(c.ready){p.done=true;p.verified=true;}},()=>{p.failed=true;p.done=true;});}return false;})()`,equals:true,intervalMs:200}]);
  const completion=await query(`window.${key}`);assert.equal(completion.failed,undefined,'Backend completion reported an error.');assert.equal(completion.verified,true);
 };
 const click=async(id,selector,expression="document.querySelector('#main-error').hidden")=>{
  const result=await execute(actionPollSteps(id,selector,expression));assert.equal(result.results.at(-1).value.applicationError,false,'UI action reported a backend rejection; see the private step receipt.');
  if(selector==='#sync-button')await waitBackend(true);
  else if(['#restore-recycled','#confirm-action'].includes(selector)||selector.includes('button[value="folder"]')||selector.includes('button[value="subtree"]'))await waitBackend(false);
  await execute([capture(id)]);checks.push(id);
 };
 await execute([{id:'mounted-ready',op:'poll',expression:"document.querySelector('#vault-badge').dataset.state === 'mounted' && !document.querySelector('#sync-button').disabled",equals:true,intervalMs:200}]);
 const mounted=await asyncQuery('window.drive.status().then(s=>({mounted:s.mounted,locked:s.locked,driveLetter:s.driveLetter}))');assert.equal(mounted.mounted,true);assert.equal(mounted.locked,false);assert.equal(mounted.driveLetter,fixture.driveLetter);checks.push('exact-mounted-drive');
 const filename=path.join(fixture.driveLetter+'\\','Runtime.txt');await fs.writeFile(filename,'First verified version.\n');assert.equal(await fs.readFile(filename,'utf8'),'First verified version.\n');checks.push('mounted-write-read');
 await click('sync-first','#sync-button',"!document.querySelector('#sync-button').disabled && document.querySelector('#main-error').hidden");
 await click('history','[data-view="history"]',"!document.querySelector('#view-history').hidden && !document.querySelector('#save-version').disabled");
 await click('save-version','#save-version',"!document.querySelector('#save-version').disabled && document.querySelector('#history-list').children.length > 0");
 const versions=await asyncQuery("window.drive.history().then(rows=>rows.filter(row=>row.path==='Runtime.txt').map(row=>({id:row.id,available:row.isAvailable})))");assert.ok(versions.length);assert.equal(versions[0].available,true);
 await fs.writeFile(filename,'Second verified version.\n');assert.equal(await fs.readFile(filename,'utf8'),'Second verified version.\n');checks.push('mounted-edit-read');
 await click('drive-after-edit','[data-view="drive"]',"!document.querySelector('#view-drive').hidden");await click('sync-edit','#sync-button',"!document.querySelector('#sync-button').disabled");
 await click('history-after-edit','[data-view="history"]',"!document.querySelector('#view-history').hidden && document.querySelector('#history-list').children.length > 0");
 const versionId=versions[0].id,restoreSelector=historyRestoreSelector(versionId);
 const observationExpression=`(${historyRestoreObservation.toString()})(${JSON.stringify(versionId)})`;
 await execute([{id:'history-render-complete',op:'poll',expression:observationExpression+'.ready',equals:true,intervalMs:200}]);
 await inspectHistoryRestore({versionId,observe:()=>query(observationExpression),record:observed=>fs.appendFile(path.join(launch.runRoot,'history-restore-observations.jsonl'),JSON.stringify({version:1,recordedAt:new Date().toISOString(),...observed})+'\n')});
 try {await click('restore-version',restoreSelector,"document.querySelector('#confirm-dialog').open");}
 catch(error) {
  await retainRestoreActionFailure(error,{observe:()=>query(observationExpression),record:diagnostic=>fs.appendFile(path.join(launch.runRoot,'history-restore-observations.jsonl'),JSON.stringify(diagnostic)+'\n')});
 }
 await click('confirm-version','#confirm-action',"!document.querySelector('#confirm-dialog').open && !document.querySelector('#save-version').disabled");
 // A version restore must change current bytes without deleting retained history.
 assert.equal(await fs.readFile(filename,'utf8'),'First verified version.\n');const afterRestore=await asyncQuery('window.drive.history().then(rows=>rows.length)');assert.ok(afterRestore>=versions.length);checks.push('restored-bytes-and-retained-history');
 await fs.unlink(filename);await click('drive-after-delete','[data-view="drive"]',"!document.querySelector('#view-drive').hidden");await click('sync-delete','#sync-button',"!document.querySelector('#sync-button').disabled");
 await click('recycle','[data-view="recycle"]',"!document.querySelector('#view-recycle').hidden && document.querySelector('#recycle-list input:not(:disabled)') !== null");
 await click('select-recycled','#select-recycled',"!document.querySelector('#restore-recycled').disabled");await click('restore-deleted','#restore-recycled',"document.querySelector('#recycle-list').children.length === 0 && document.querySelector('#main-error').hidden");assert.equal(await fs.readFile(filename,'utf8'),'First verified version.\n');checks.push('recycle-restored-mounted-bytes');
 await fs.unlink(filename);await click('drive-second-delete','[data-view="drive"]',"!document.querySelector('#view-drive').hidden");await click('sync-second-delete','#sync-button',"!document.querySelector('#sync-button').disabled");await click('recycle-second-delete','[data-view="recycle"]',"document.querySelector('#recycle-list').children.length > 0");
 const beforeEmpty=await asyncQuery('window.drive.history().then(rows=>rows.length)');await click('empty-bin','#empty-recycle',"document.querySelector('#confirm-dialog').open");assert.match(await query("document.querySelector('#confirm-description').textContent"),/history is retained/);await click('confirm-empty','#confirm-action',"!document.querySelector('#confirm-dialog').open && !document.querySelector('#empty-recycle').disabled");assert.equal(await asyncQuery('window.drive.recycled().then(rows=>rows.length)'),0);assert.ok(await asyncQuery('window.drive.history().then(rows=>rows.length)')>=beforeEmpty);checks.push('empty-bin-retains-history');
 // Exercise child-first deletion with an earlier independent deletion.
 const folderPath=path.join(fixture.driveLetter+'\\','RestorationFolder');const earlierPath=path.join(folderPath,'Earlier.txt');const laterPath=path.join(folderPath,'Later.txt');
 await fs.mkdir(folderPath);await fs.writeFile(earlierPath,'Earlier independent deletion.\n');await fs.writeFile(laterPath,'Later child deletion.\n');
 await click('folder-fixture-drive','[data-view="drive"]',"!document.querySelector('#view-drive').hidden");await click('folder-fixture-sync','#sync-button',"!document.querySelector('#sync-button').disabled");
 await fs.unlink(earlierPath);await click('earlier-delete-sync','#sync-button',"!document.querySelector('#sync-button').disabled");
 await fs.unlink(laterPath);await click('later-delete-sync','#sync-button',"!document.querySelector('#sync-button').disabled");await fs.rmdir(folderPath);await click('folder-delete-sync','#sync-button',"!document.querySelector('#sync-button').disabled");
 await click('folder-bin','[data-view="recycle"]',"document.querySelector('#recycle-list').children.length > 0");
 const folderRows=await asyncQuery('window.drive.recycled().then(rows=>rows.map(row=>({id:row.id,path:row.path,isDirectory:row.isDirectory,descendantIds:row.descendantIds})))');const folderIndex=folderRows.findIndex(row=>row.isDirectory&&row.path==='RestorationFolder');assert.ok(folderIndex>=0);const earlierEntry=folderRows.find(row=>row.path==='RestorationFolder/Earlier.txt'||row.path==='RestorationFolder\\Earlier.txt');assert.ok(earlierEntry);assert.ok(folderRows[folderIndex].descendantIds.includes(earlierEntry.id));
 await click('select-deleted-folder',`#recycle-list tr:nth-child(${folderIndex+1}) input`,"!document.querySelector('#restore-recycled').disabled");
 await click('open-descendant-dialog','#restore-recycled',"document.querySelector('dialog[open] #descendant-dialog-title') !== null");
 const dialogState=await query("Array.from(document.querySelector('dialog:has(#descendant-dialog-title)').querySelectorAll('input[type=checkbox]')).map(input=>({id:input.value,checked:input.checked,disabled:input.disabled}))");assert.equal(dialogState.find(item=>item.id===earlierEntry.id)?.checked,false);assert.ok(dialogState.some(item=>item.checked&&item.disabled));checks.push('descendant-dialog-default-unchecked');
 await click('restore-folder-only','dialog:has(#descendant-dialog-title) button[value="folder"]',"document.querySelector('dialog[open] #descendant-dialog-title') === null && document.querySelector('#main-error').hidden");
 assert.equal((await fs.stat(folderPath)).isDirectory(),true);await assert.rejects(fs.stat(earlierPath),error=>error.code==='ENOENT');assert.ok((await asyncQuery('window.drive.recycled().then(rows=>rows.map(row=>row.id))')).includes(earlierEntry.id));checks.push('folder-only-keeps-independent-deletion');
 // Delete the now-empty restored directory and deliberately include one old child.
 await fs.rmdir(folderPath);await click('folder-second-drive','[data-view="drive"]',"!document.querySelector('#view-drive').hidden");await click('folder-second-sync','#sync-button',"!document.querySelector('#sync-button').disabled");await click('folder-second-bin','[data-view="recycle"]',"document.querySelector('#recycle-list').children.length > 0");
 const secondRows=await asyncQuery('window.drive.recycled().then(rows=>rows.map(row=>({id:row.id,path:row.path,isDirectory:row.isDirectory})))');const secondFolder=secondRows.findIndex(row=>row.isDirectory&&row.path==='RestorationFolder');assert.ok(secondFolder>=0);
 await click('select-folder-again',`#recycle-list tr:nth-child(${secondFolder+1}) input`,"!document.querySelector('#restore-recycled').disabled");await click('open-explicit-descendants','#restore-recycled',"document.querySelector('dialog[open] #descendant-dialog-title') !== null");
 await click('explicit-earlier-child',`dialog:has(#descendant-dialog-title) input[value="${earlierEntry.id}"]`,`document.querySelector(${JSON.stringify('dialog:has(#descendant-dialog-title) input[value="'+earlierEntry.id+'"]')}).checked`);
 await click('restore-explicit-child','dialog:has(#descendant-dialog-title) button[value="subtree"]',"document.querySelector('dialog[open] #descendant-dialog-title') === null && document.querySelector('#main-error').hidden");assert.equal(await fs.readFile(earlierPath,'utf8'),'Earlier independent deletion.\n');await assert.rejects(fs.stat(laterPath),error=>error.code==='ENOENT');checks.push('explicit-descendant-restored-with-independent-sibling-retained');
 // Folder restoration leaves multiple selectable files. Pin the named fixture,
 // never whichever row happens to sort first or an ambiguous group of inputs.
 const offlineSelector='#file-list input[aria-label="Select Runtime.txt"]';
 await fs.writeFile(filename,'Offline verification bytes.\n');await click('drive-for-offline','[data-view="drive"]',"!document.querySelector('#view-drive').hidden");await click('sync-offline-file','#sync-button',`!document.querySelector('#sync-button').disabled && document.querySelector(${JSON.stringify(offlineSelector)}) !== null`);await click('select-offline-file',offlineSelector,"!document.querySelector('#offline-button').disabled");await click('keep-offline','#offline-button',"document.querySelector('#offline-count').textContent === '1'");await click('offline-view','[data-view="offline"]',"document.querySelector('[data-view=offline]').getAttribute('aria-current') === 'page'");assert.equal(await fs.readFile(filename,'utf8'),'Offline verification bytes.\n');checks.push('offline-pin-mounted-read');
 await click('settings-startup','[data-view="settings"]',"!document.querySelector('#view-settings').hidden");
 const startup=await asyncQuery('window.drive.status().then(s=>s.startupRegistration)');assert.equal(typeof startup?.enabled,'boolean','Native startup readback is required.');
 assert.equal(startup.verificationOnly,true);assert.equal(startup.enabled,false);
 await click('startup-enable','#startup-setting',"!document.querySelector('#startup-setting').disabled");const enabled=await asyncQuery('window.drive.status().then(s=>s.startupRegistration)');assert.equal(enabled.enabled,true);
 await click('startup-disable','#startup-setting',"!document.querySelector('#startup-setting').disabled");const disabled=await asyncQuery('window.drive.status().then(s=>s.startupRegistration)');assert.equal(disabled.enabled,false);checks.push('native-startup-toggle-readback');
 await click('forget-owned-credential','#forget-credential',"!document.querySelector('#forget-credential').disabled");
 await click('drive-for-lock','[data-view="drive"]',"!document.querySelector('#view-drive').hidden");await click('lock','#lock-button',"document.querySelector('#vault-badge').dataset.state === 'locked'");const locked=await asyncQuery('window.drive.status().then(s=>({locked:s.locked,mounted:s.mounted}))');assert.equal(locked.locked,true);assert.equal(locked.mounted,false);checks.push('graceful-lock');
 let gui=await prepareGuiVaultFixture(fixture);
 const guiMounted="!document.querySelector('#vault-dialog').open && document.querySelector('#vault-badge').dataset.state === 'mounted' && document.querySelector('#main-error').hidden";
 await click('gui-create-dialog','#create-button',"document.querySelector('#vault-dialog').open");
 await execute(makeGuiVaultFormSteps(gui,'create',launch.outputRoot));await click('gui-create-submit','#dialog-submit',guiMounted);await waitBackend(false);
 const guiState=await asyncQuery('window.drive.status().then(s=>({locked:s.locked,mounted:s.mounted,storageDir:s.storageDir,cacheDir:s.cacheDir,driveLetter:s.driveLetter}))');
 assert.equal(guiState.mounted,true);assert.equal(guiState.locked,false);assert.equal(guiState.storageDir,gui.storageDir);assert.equal(guiState.cacheDir,gui.cacheDir);assert.equal(guiState.driveLetter,gui.driveLetter);
 const emptyProof=await proveFreshGuiRootEmpty(gui,{launch,receipt,observeStatus:()=>asyncQuery('window.drive.status().then(s=>({locked:s.locked,mounted:s.mounted,operation:s.operation,storageDir:s.storageDir,cacheDir:s.cacheDir,driveLetter:s.driveLetter}))')});
 const emptyBeforeLock=emptyProof.empty;
 await click('gui-empty-lock','#lock-button',"document.querySelector('#vault-badge').dataset.state === 'locked'");
 const emptyLocked=await asyncQuery('window.drive.status().then(s=>({locked:s.locked,mounted:s.mounted}))');
 gui=(await prepareEmptyLegacyGuiVault(gui,{...emptyLocked,emptyBeforeLock})).gui;
 await click('gui-legacy-dialog','#unlock-button',"document.querySelector('#vault-dialog').open");
 await execute(makeGuiVaultFormSteps(gui,'unlock',launch.outputRoot,'legacy-unlock'));await click('gui-legacy-submit','#dialog-submit',guiMounted);await waitBackend(false);
 const legacyState=await asyncQuery('window.drive.status().then(s=>({storageFormat:s.storageFormat,transport:s.transport?.mode}))');assert.equal(legacyState.storageFormat,1);assert.equal(legacyState.transport,'folder');checks.push('authentic-empty-legacy-fixture-mounted');
 const guiFile=path.join(gui.driveLetter+'\\','GuiControls.txt');const guiContent='Created and reopened through real dialog controls.\n';
 await fs.writeFile(guiFile,guiContent);assert.equal(await fs.readFile(guiFile,'utf8'),guiContent);checks.push('gui-create-picker-mounted-write-read');
 await click('gui-create-sync','#sync-button',"!document.querySelector('#sync-button').disabled && document.querySelector('#main-error').hidden");
 await click('gui-create-lock','#lock-button',"document.querySelector('#vault-badge').dataset.state === 'locked'");
 const guiLocked=await asyncQuery('window.drive.status().then(s=>({locked:s.locked,mounted:s.mounted}))');assert.equal(guiLocked.locked,true);assert.equal(guiLocked.mounted,false);
 await click('gui-unlock-dialog','#unlock-button',"document.querySelector('#vault-dialog').open");
 await execute(makeGuiVaultFormSteps(gui,'unlock',launch.outputRoot));await click('gui-unlock-submit','#dialog-submit',guiMounted);await waitBackend(false);
 const guiReopened=await asyncQuery('window.drive.status().then(s=>({locked:s.locked,mounted:s.mounted,driveLetter:s.driveLetter}))');assert.equal(guiReopened.locked,false);assert.equal(guiReopened.mounted,true);assert.equal(guiReopened.driveLetter,gui.driveLetter);assert.equal(await fs.readFile(guiFile,'utf8'),guiContent);checks.push('gui-unlock-manual-letter-persisted-read');
 const upgraded={...gui,storageDir:path.join(gui.root,'upgrade-storage'),cacheDir:path.join(gui.root,'upgrade-cache')};
 await fs.mkdir(upgraded.storageDir);await fs.mkdir(upgraded.cacheDir);
 await registerGuiFixture(upgraded,'upgrade');
 await click('gui-upgrade-dialog','#upgrade-vault',"document.querySelector('#vault-dialog').open && document.querySelector('#storage-input').value === '' && document.querySelector('#cache-input').value === ''");
 await execute(makeGuiVaultFormSteps(upgraded,'upgrade',launch.outputRoot));
 // Exercise the actual private-transport validation surface without creating or contacting a repository.
 await execute([{id:'transport-private-select',op:'type',selector:'#transport-mode',text:'privateGit',clear:true},{id:'transport-private-invalid',op:'type',selector:'#remote-repository',text:'invalid repository',clear:true},{id:'transport-private-visible',op:'poll',expression:"!document.querySelector('#private-git-fields').hidden",equals:true,intervalMs:100},capture('transport-private-setup'),{id:'transport-private-submit',op:'click',selector:'#dialog-submit'},{id:'transport-private-rejected',op:'poll',expression:"document.querySelector('#vault-dialog').open && !document.querySelector('#dialog-error').hidden",equals:true,intervalMs:100},capture('transport-private-validation'),{id:'transport-folder-select',op:'type',selector:'#transport-mode',text:'folder',clear:true}]);
 await click('gui-upgrade-submit','#dialog-submit',guiMounted);await waitBackend(false);
 const upgradeState=await asyncQuery('window.drive.status().then(s=>({storageFormat:s.storageFormat,storageDir:s.storageDir,cacheDir:s.cacheDir,transport:s.transport?.mode}))');assert.equal(upgradeState.storageFormat,2);assert.equal(upgradeState.storageDir,upgraded.storageDir);assert.equal(upgradeState.cacheDir,upgraded.cacheDir);assert.equal(upgradeState.transport,'folder');assert.equal(await fs.readFile(guiFile,'utf8'),guiContent);
 await click('gui-upgraded-lock','#lock-button',"document.querySelector('#vault-badge').dataset.state === 'locked'");
 await click('gui-original-reopen','#unlock-button',"document.querySelector('#vault-dialog').open");await execute(makeGuiVaultFormSteps(gui,'unlock',launch.outputRoot,'original-reopen'));await click('gui-original-submit','#dialog-submit',guiMounted);await waitBackend(false);
 const preserved=await asyncQuery('window.drive.status().then(s=>({storageFormat:s.storageFormat,storageDir:s.storageDir}))');assert.equal(preserved.storageFormat,1);assert.equal(preserved.storageDir,gui.storageDir);assert.equal(await fs.readFile(guiFile,'utf8'),guiContent);checks.push('copy-upgrade-real-ui-copy-and-original-readable','folder-transport-backend-and-private-setup-validation');
 if(modernUiCheck)modernUi.workspace=await runModernPhase({launch,receipt,phase:'workspace',executePlan,probeEvidence:modernProbeEvidence});
 await click('gui-final-lock','#lock-button',"document.querySelector('#vault-badge').dataset.state === 'locked'");
 const guiFinal=await asyncQuery('window.drive.status().then(s=>({locked:s.locked,mounted:s.mounted}))');assert.equal(guiFinal.locked,true);assert.equal(guiFinal.mounted,false);checks.push('gui-final-locked');
 if(modernUiCheck)modernUi.dialog=await runModernPhase({launch,receipt,phase:'dialog',executePlan,probeEvidence:modernProbeEvidence});
 await click('gui-final-settings','[data-view="settings"]',"!document.querySelector('#view-settings').hidden");
 for(const theme of ['dark','light'])await execute([{id:'gui-theme-'+theme,op:'type',selector:'#theme-setting',text:theme,clear:true},{id:'gui-theme-'+theme+'-state',op:'poll',expression:`document.documentElement.dataset.theme === ${JSON.stringify(theme)}`,equals:true,intervalMs:200},capture('gui-theme-'+theme)]);
 for(const language of ['yue','bilingual','en'])await execute([{id:'gui-language-'+language,op:'type',selector:'#language-setting',text:language,clear:true},{id:'gui-language-'+language+'-state',op:'poll',expression:`document.querySelector('#language-setting').value === ${JSON.stringify(language)}`,equals:true,intervalMs:200},capture('gui-language-'+language)]);
 checks.push('gui-built-theme-and-language-controls');
 const guiCleanup=await retireGuiVaultKey(gui);
 await prepareExit();const quit=await execute([{id:'graceful-quit',op:'evaluate',expression:"window.__mfeQuit={done:false};window.drive.verificationQuit().then(value=>{window.__mfeQuit={done:true,value}},()=>{window.__mfeQuit={done:true,failed:true}});true"},{id:'quit-restoration',op:'poll',expression:"window.__mfeQuit.done",equals:true,intervalMs:50},{id:'quit-proof',op:'evaluate',expression:"window.__mfeQuit"}],'teardown');const quitResult=quit.results.at(-1).value;assert.equal(quitResult.failed,undefined);assert.equal(quitResult.value.restored,true);checks.push('verification-quit-startup-restored');
 return {quitRequested:true,modernUi,transportSetup:{folderBackendVerified:true,privateRepositoryValidationVerified:true,authenticatedPrivateTransportVerified:false},copyUpgrade:{realControls:true,upgradedFormat:2,originalFormat:1,bothMountedBytesVerified:true},guiVault:{createdThroughControls:true,unlockedThroughControls:true,pickerVerified:true,manualLetterNormalized:true,mountedBytesVerified:true,locked:true,...guiCleanup},startupRegistration:{initial:false,enabledReadback:enabled.enabled,disabledReadback:disabled.enabled,restored:quitResult.value.restored,verificationOnly:true},checks,rendererAssertionsVerified:true,mountedFilesystemVerified:true,nativeKeyboardVerified:false,pixelsInspected:false};
}
