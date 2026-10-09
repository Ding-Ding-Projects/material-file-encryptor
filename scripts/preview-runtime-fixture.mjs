import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {NativeClient} from '../src/main/native-client.js';

export function fixturePreferences(fixture) {return {startup:false,autoUnlock:true,storageDir:fixture.storageDir,cacheDir:fixture.cacheDir,driveLetter:fixture.driveLetter,transport:'folder',historyRetentionDays:null};}
async function disposeNative(client) {
 const child=client.child;if(!child)return;
 const stopped=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Owned native fixture helper did not exit.')),15000);child.once('exit',()=>{clearTimeout(timer);resolve();});});client.dispose();await stopped;
}
export async function prepareRuntimeFixture({executable,profile,createClient=exe=>new NativeClient(exe)}) {
 const root=await fs.mkdtemp(path.join(path.parse(os.tmpdir()).root,'MaterialFileEncryptor-Verification-'));
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
 const saved=JSON.parse(await fs.readFile(path.join(fixture.root,'fixture.json'),'utf8'));assert.equal(saved.storageDir,fixture.storageDir);assert.equal(saved.cacheDir,fixture.cacheDir);assert.equal(saved.nativeExecutable,fixture.nativeExecutable);
 assert.equal(path.dirname(fixture.storageDir),fixture.root);assert.equal(path.dirname(fixture.cacheDir),fixture.root);
 const client=createClient(fixture.nativeExecutable);try {await client.request('forgetSavedCredential',{storageDir:fixture.storageDir,cacheDir:fixture.cacheDir});}finally{await disposeNative(client);}
 return {ownedCredentialForgotten:true,fixtureRetained:true};
}
export async function checkMountedRuntime({fixture,launch,receipt,executePlan,prepareExit}) {
 const checks=[];let sequence=0;
 const execute=async steps=>executePlan({version:1,receipt,endpoint:`http://127.0.0.1:${launch.cdp.port}`,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:60000,steps});
 const query=async expression=>{const result=await execute([{id:'query-'+(++sequence),op:'evaluate',expression}]);return result.results.at(-1).value;};
 const asyncQuery=async expression=>{const key='__mfeRuntime'+(++sequence);await execute([{id:'begin-'+sequence,op:'evaluate',expression:`window.${key}={done:false};Promise.resolve(${expression}).then(value=>{window.${key}={done:true,value}},()=>{window.${key}={done:true,failed:true}});true`},{id:'wait-'+sequence,op:'poll',expression:`window.${key}.done`,equals:true,intervalMs:200}]);const result=await query(`window.${key}`);assert.equal(result.failed,undefined,'Runtime bridge request failed.');return result.value;};
 const capture=id=>({id:id+'-capture',op:'capture',path:path.join(launch.outputRoot,'runtime-'+id+'.png'),overwrite:false});
 const click=async(id,selector,expression="!document.querySelector('#operation').hidden === false")=>{await execute([{id,op:'click',selector},{id:id+'-state',op:'poll',expression,equals:true,intervalMs:200},capture(id)]);checks.push(id);};
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
 const restoreIndex=await asyncQuery('window.drive.history().then(rows=>rows.findIndex(row=>row.id==='+JSON.stringify(versions[0].id)+'))');assert.ok(restoreIndex>=0);
 await click('restore-version',`#history-list tr:nth-child(${restoreIndex+1}) button`,"document.querySelector('#confirm-dialog').open");await click('confirm-version','#confirm-action',"!document.querySelector('#confirm-dialog').open && !document.querySelector('#save-version').disabled");
 // A version restore must change current bytes without deleting retained history.
 assert.equal(await fs.readFile(filename,'utf8'),'First verified version.\n');const afterRestore=await asyncQuery('window.drive.history().then(rows=>rows.length)');assert.ok(afterRestore>=versions.length);checks.push('restored-bytes-and-retained-history');
 await fs.unlink(filename);await click('drive-after-delete','[data-view="drive"]',"!document.querySelector('#view-drive').hidden");await click('sync-delete','#sync-button',"!document.querySelector('#sync-button').disabled");
 await click('recycle','[data-view="recycle"]',"!document.querySelector('#view-recycle').hidden && document.querySelector('#recycle-list input:not(:disabled)') !== null");
 await click('select-recycled','#select-recycled',"!document.querySelector('#restore-recycled').disabled");await click('restore-deleted','#restore-recycled',"document.querySelector('#operation').hidden && document.querySelector('#recycle-list').children.length === 0");assert.equal(await fs.readFile(filename,'utf8'),'First verified version.\n');checks.push('recycle-restored-mounted-bytes');
 await fs.unlink(filename);await click('drive-second-delete','[data-view="drive"]',"!document.querySelector('#view-drive').hidden");await click('sync-second-delete','#sync-button',"!document.querySelector('#sync-button').disabled");await click('recycle-second-delete','[data-view="recycle"]',"document.querySelector('#recycle-list').children.length > 0");
 const beforeEmpty=await asyncQuery('window.drive.history().then(rows=>rows.length)');await click('empty-bin','#empty-recycle',"document.querySelector('#confirm-dialog').open");assert.match(await query("document.querySelector('#confirm-description').textContent"),/history is retained/);await click('confirm-empty','#confirm-action',"!document.querySelector('#confirm-dialog').open && !document.querySelector('#empty-recycle').disabled");assert.equal(await asyncQuery('window.drive.recycled().then(rows=>rows.length)'),0);assert.ok(await asyncQuery('window.drive.history().then(rows=>rows.length)')>=beforeEmpty);checks.push('empty-bin-retains-history');
 await fs.writeFile(filename,'Offline verification bytes.\n');await click('drive-for-offline','[data-view="drive"]',"!document.querySelector('#view-drive').hidden");await click('sync-offline-file','#sync-button',"!document.querySelector('#sync-button').disabled && document.querySelector('#file-list input') !== null");await click('select-offline-file','#file-list input',"!document.querySelector('#offline-button').disabled");await click('keep-offline','#offline-button',"document.querySelector('#offline-count').textContent === '1'");await click('offline-view','[data-view="offline"]',"document.querySelector('[data-view=offline]').getAttribute('aria-current') === 'page'");assert.equal(await fs.readFile(filename,'utf8'),'Offline verification bytes.\n');checks.push('offline-pin-mounted-read');
 await click('settings-startup','[data-view="settings"]',"!document.querySelector('#view-settings').hidden");
 const startup=await asyncQuery('window.drive.status().then(s=>s.startupRegistration)');assert.equal(typeof startup?.enabled,'boolean','Native startup readback is required.');
 assert.equal(startup.verificationOnly,true);assert.equal(startup.enabled,false);
 await click('startup-enable','#startup-setting',"!document.querySelector('#startup-setting').disabled");const enabled=await asyncQuery('window.drive.status().then(s=>s.startupRegistration)');assert.equal(enabled.enabled,true);
 await click('startup-disable','#startup-setting',"!document.querySelector('#startup-setting').disabled");const disabled=await asyncQuery('window.drive.status().then(s=>s.startupRegistration)');assert.equal(disabled.enabled,false);checks.push('native-startup-toggle-readback');
 await click('forget-owned-credential','#forget-credential',"!document.querySelector('#forget-credential').disabled");
 await click('drive-for-lock','[data-view="drive"]',"!document.querySelector('#view-drive').hidden");await click('lock','#lock-button',"document.querySelector('#vault-badge').dataset.state === 'locked'");const locked=await asyncQuery('window.drive.status().then(s=>({locked:s.locked,mounted:s.mounted}))');assert.equal(locked.locked,true);assert.equal(locked.mounted,false);checks.push('graceful-lock');
 await prepareExit();const quit=await execute([{id:'graceful-quit',op:'evaluate',expression:"window.__mfeQuit={done:false};window.drive.verificationQuit().then(value=>{window.__mfeQuit={done:true,value}},()=>{window.__mfeQuit={done:true,failed:true}});true"},{id:'quit-restoration',op:'poll',expression:"window.__mfeQuit.done",equals:true,intervalMs:50},{id:'quit-proof',op:'evaluate',expression:"window.__mfeQuit"}]);const quitResult=quit.results.at(-1).value;assert.equal(quitResult.failed,undefined);assert.equal(quitResult.value.restored,true);checks.push('verification-quit-startup-restored');
 return {quitRequested:true,checks,rendererAssertionsVerified:true,mountedFilesystemVerified:true,nativeKeyboardVerified:false,pixelsInspected:false};
}
