import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {sha256} from './gui-acceptance.mjs';
import {observeOwnedPackagedFixture} from './gui-acceptance-packaged.mjs';
import {createContextFoundationFixture} from './gui-acceptance-context-fixtures.mjs';

// Uses the actual mounted verification filesystem. This producer cannot unlock
// a prior locked session. Schedule mounted states before locked states, or open
// a fresh independently owned session through the normal auto-unlock startup.
export function createMountedFoundationFixtures({opened,io=fs,contextActivationKey='Enter'}){
 assert.equal(opened.connectionOwned,true);assert.equal(opened.target.kind,'extracted-packaged-runtime');
 const {page,fixture,target}=opened;assert.match(fixture.driveLetter,/^[D-Z]:$/);assert.notEqual(fixture.driveLetter,'M:');
 const files=[['Acceptance A.txt','Synthetic alpha.\n'],['Acceptance B.txt','Synthetic beta.\n']].map(([name,text])=>({name,text,path:path.win32.join(fixture.driveLetter+'\\',name),sha256:sha256(text)}));
 const written=new Set(),removed=new Set();
 let offlineState=null,offlineUnproved=false;
 const identity=async context=>{
  assert.equal(context.binding.sourceCommit,target.sourceCommit);assert.equal(page.url(),target.expectedUrl);
  const state=await observeOwnedPackagedFixture(page,fixture);
  if(state.locked||!state.mounted)throw Error('CAPABILITY_UNAVAILABLE: mounted fixture requires a fresh auto-unlocked owned session');
  assert.equal(state.operation,null,'Native operation must settle before fixture mutation');
 };
 const list=()=>page.evaluate(async()=>{const result=await window.drive.listFiles({limit:100});const rows=Array.isArray(result)?result:result.items||result.files||[];return {rows:rows.map(row=>({id:row.id,path:row.path})),more:Boolean(result.nextCursor)};});
 const sync=async()=>{
  const result=await page.evaluate(()=>Promise.race([window.drive.sync().then(()=>({done:true}),()=>({done:true,failed:true})),new Promise(resolve=>setTimeout(()=>resolve({done:false}),30000))]));
  assert.equal(result.done,true);assert.notEqual(result.failed,true,'Owned native synchronization failed');
  await page.waitForFunction(async()=>{const s=await window.drive.status();return !s.operation&&!s.sync?.running&&!s.sync?.error;},undefined,{timeout:30000});
 };
 const assertFiles=async()=>{
  const listing=await list();assert.equal(listing.more,false);assert.deepEqual(listing.rows.map(row=>row.path.replace(/^[/\\]+/, '')).sort(),files.map(file=>file.name).sort(),'Only the two owned synthetic files may be present');
  for(const file of files)assert.equal(sha256(await io.readFile(file.path)),file.sha256,'Owned fixture bytes changed');
  return listing.rows.length;
 };
 const prepare=async context=>{
  assert.equal(offlineState,null,'Offline preparation must settle through its owning provider');assert.equal(offlineUnproved,false,'Offline mutation ownership is unproved');
  await identity(context);
  // Only recreate files this producer deliberately removed, never a partial write.
  if(removed.size){const before=await list();assert.equal(before.more,false);assert.deepEqual(before.rows.map(row=>row.path.replace(/^[/\\]+/,'')).sort(),files.filter(file=>written.has(file.name)).map(file=>file.name).sort(),'Unexpected files prevent fixture recreation');for(const file of files.filter(file=>written.has(file.name)))assert.equal(sha256(await io.readFile(file.path)),file.sha256,'Changed bytes prevent fixture recreation');}
  for(const file of files.filter(file=>removed.has(file.name))){await io.writeFile(file.path,file.text,{flag:'wx'});written.add(file.name);removed.delete(file.name);}
  if(!written.size){const before=await list();assert.equal(before.more,false);assert.equal(before.rows.length,0,'Native fixture must initially be empty');
   // Exclusive creation prevents overwriting an unexpected mounted file.
   for(const file of files){await io.writeFile(file.path,file.text,{flag:'wx'});written.add(file.name);}
  }
  assert.equal(written.size,files.length,'Earlier partial fixture preparation requires restoration');
  await sync();const count=await assertFiles();
  return {ownedSyntheticFixture:true,sourceCommit:target.sourceCommit,productionFilesystem:true,fileCount:count,fileContentHashes:files.map(file=>file.sha256)};
 };
 const restore=async context=>{
  assert.equal(offlineState,null,'Offline pins must be restored before deleting owned files');assert.equal(offlineUnproved,false,'Offline mutation ownership is unproved');
  await identity(context);
  if(written.size){
   const owned=files.filter(file=>written.has(file.name));const before=await list();assert.equal(before.more,false);
   assert.deepEqual(before.rows.map(row=>row.path.replace(/^[/\\]+/,'')).sort(),owned.map(file=>file.name).sort(),'Unexpected native files prevent restoration');
   for(const file of owned)assert.equal(sha256(await io.readFile(file.path)),file.sha256,'Changed bytes prevent restoration');
   for(const file of owned){await io.unlink(file.path);written.delete(file.name);}await sync();
  }
  const after=await list();assert.equal(after.more,false);assert.equal(after.rows.length,0);
  removed.clear();
  return {ownedSyntheticFixture:true,sourceCommit:target.sourceCommit,restored:true,productionFilesystem:true,fileCount:0};
 };
 const removeTarget=async(context,id)=>{
  assert.equal(offlineState,null,'Offline pins must be restored before target removal');assert.equal(offlineUnproved,false,'Offline mutation ownership is unproved');
  await identity(context);await assertFiles();const listing=await list();
  const row=listing.rows.find(row=>row.id===id);const file=files[1];
  assert.equal(row?.path.replace(/^[/\\]+/,''),file.name,'Only the second owned file may be removed');
  assert.ok(written.has(file.name));assert.equal(sha256(await io.readFile(file.path)),file.sha256);
  await io.unlink(file.path);written.delete(file.name);removed.add(file.name);await sync();
  const after=await list();assert.equal(after.more,false);assert.deepEqual(after.rows.map(row=>row.path.replace(/^[/\\]+/,'')).sort(),[files[0].name]);
  return {removedId:id,remainingId:after.rows[0].id};
 };
 // This state owns only the two exclusively created files, never prior pins.
 // API completion alone does not grant restoration authority: exact native
 // rows and original bytes must prove the sole permitted offline-flag delta.
 const observeOffline=async context=>{
  await identity(context);await assertFiles();
  const value=await page.evaluate(async()=>{const result=await window.drive.listFiles({limit:100});const rows=Array.isArray(result)?result:result.items||result.files||[];return{more:Boolean(result.nextCursor),rows:rows.map(row=>({id:row.id,path:row.path,offline:row.offline}))};});
  assert.equal(value.more,false);assert.equal(value.rows.length,2);
  const rows=value.rows.map(row=>{assert.ok(typeof row.id==='string'&&row.id.length>0&&row.id.length<=256);assert.equal(typeof row.path,'string');assert.equal(typeof row.offline,'boolean');return{...row,path:row.path.replace(/^[/\\]+/,'')};}).sort((a,b)=>a.path.localeCompare(b.path));
  assert.equal(new Set(rows.map(row=>row.id)).size,2);assert.deepEqual(rows.map(row=>row.path),files.map(file=>file.name));await identity(context);return rows;
 };
 const reconcileReleased=rows=>{
  assert.ok(offlineState,'Offline file ownership is missing');
  assert.deepEqual(rows.map(({offline,...row})=>row),offlineState.map(({offline,...row})=>row),'Owned offline identities changed');
  for(let i=0;i<rows.length;i++)assert.ok(!rows[i].offline||offlineState[i].offline,'Unexpected offline pin prevents restoration');
  offlineState=structuredClone(rows);
 };
 const changePin=async(context,id,pinned)=>{
  assert.equal(offlineUnproved,false,'Offline mutation ownership is unproved');
  const before=await observeOffline(context);assert.deepEqual(before,offlineState,'Offline state changed before mutation');
  const expected=before.map(row=>row.id===id?{...row,offline:pinned}:row);assert.equal(before.filter(row=>row.id===id&&row.offline!==pinned).length,1);
  offlineUnproved=true;
  await page.evaluate(async({id,pinned})=>{if(pinned)await window.drive.keepOffline(id);else await window.drive.releaseOffline(id);},{id,pinned});
  const after=await observeOffline(context);assert.deepEqual(after,expected,'Offline mutation exceeded its owned flag delta');
  offlineState=structuredClone(after);offlineUnproved=false;
 };
 const prepareOffline=async context=>{
  assert.equal(offlineUnproved,false,'Offline mutation ownership is unproved');
  if(!offlineState){await prepare(context);offlineUnproved=true;const rows=await observeOffline(context);assert.ok(rows.every(row=>row.offline===false),'Pre-existing offline pins are not owned');offlineState=structuredClone(rows);offlineUnproved=false;}
  else reconcileReleased(await observeOffline(context));
  for(const row of [...offlineState])if(!row.offline)await changePin(context,row.id,true);
  assert.deepEqual(await observeOffline(context),offlineState);assert.ok(offlineState.every(row=>row.offline));
  return{ownedSyntheticFixture:true,sourceCommit:target.sourceCommit,productionFilesystem:true,fileCount:2,pinnedCount:2,acquisitionRoute:'native-offline-api',accepted:false};
 };
 const restoreOffline=async context=>{
  assert.equal(offlineUnproved,false,'Offline mutation ownership is unproved');
  if(offlineState){reconcileReleased(await observeOffline(context));for(const row of [...offlineState])if(row.offline)await changePin(context,row.id,false);assert.deepEqual(await observeOffline(context),offlineState);assert.ok(offlineState.every(row=>!row.offline));offlineState=null;}
  return restore(context);
 };
 const context=createContextFoundationFixture({opened,prepare,restore,identity,list,removeTarget,activationKey:contextActivationKey});
 return {'drive-populated':{prepare,restore},'drive-selected':{prepare,restore},'drive-overflow':context,'offline-populated':{prepare:prepareOffline,restore:restoreOffline}};
}

export function createKeyboardFoundationFixtures({opened}){
 assert.equal(opened.connectionOwned,true);
 return {'drive-search':{'escape-restores-focus':async context=>{
  assert.equal(context.binding.sourceCommit,opened.target.sourceCommit);assert.equal(opened.page.url(),opened.target.expectedUrl);
  const before=await opened.page.evaluate(()=>Boolean(document.querySelector('mfe-command-palette')?.dialog?.open));assert.equal(before,true,'Open production palette required');
  await opened.page.keyboard.press('Escape');
  await opened.page.waitForFunction(()=>{const p=document.querySelector('mfe-command-palette');return p&&!p.dialog.open&&document.activeElement===p.returnFocus;},undefined,{timeout:10000});
  return {ownedSyntheticFixture:true,sourceCommit:opened.target.sourceCommit,activated:true,activation:'cdp-key',focusRestored:true};
 }}};
}
