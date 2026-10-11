import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {sha256} from './gui-acceptance.mjs';
import {observeOwnedPackagedFixture} from './gui-acceptance-packaged.mjs';

// Uses the actual mounted verification filesystem. This producer cannot unlock
// a prior locked session. Schedule mounted states before locked states, or open
// a fresh independently owned session through the normal auto-unlock startup.
export function createMountedFoundationFixtures({opened,io=fs}){
 assert.equal(opened.connectionOwned,true);assert.equal(opened.target.kind,'extracted-packaged-runtime');
 const {page,fixture,target}=opened;assert.match(fixture.driveLetter,/^[D-Z]:$/);assert.notEqual(fixture.driveLetter,'M:');
 const files=[['Acceptance A.txt','Synthetic alpha.\n'],['Acceptance B.txt','Synthetic beta.\n']].map(([name,text])=>({name,text,path:path.win32.join(fixture.driveLetter+'\\',name),sha256:sha256(text)}));
 const written=new Set();
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
  await identity(context);
  if(!written.size){const before=await list();assert.equal(before.more,false);assert.equal(before.rows.length,0,'Native fixture must initially be empty');
   // Exclusive creation prevents overwriting an unexpected mounted file.
   for(const file of files){await io.writeFile(file.path,file.text,{flag:'wx'});written.add(file.name);}
  }
  assert.equal(written.size,files.length,'Earlier partial fixture preparation requires restoration');
  await sync();const count=await assertFiles();
  return {ownedSyntheticFixture:true,sourceCommit:target.sourceCommit,productionFilesystem:true,fileCount:count,fileContentHashes:files.map(file=>file.sha256)};
 };
 const restore=async context=>{
  await identity(context);
  if(written.size){
   const owned=files.filter(file=>written.has(file.name));const before=await list();assert.equal(before.more,false);
   assert.deepEqual(before.rows.map(row=>row.path.replace(/^[/\\]+/,'')).sort(),owned.map(file=>file.name).sort(),'Unexpected native files prevent restoration');
   for(const file of owned)assert.equal(sha256(await io.readFile(file.path)),file.sha256,'Changed bytes prevent restoration');
   for(const file of owned){await io.unlink(file.path);written.delete(file.name);}await sync();
  }
  const after=await list();assert.equal(after.more,false);assert.equal(after.rows.length,0);
  return {ownedSyntheticFixture:true,sourceCommit:target.sourceCommit,restored:true,productionFilesystem:true,fileCount:0};
 };
 return {'drive-populated':{prepare,restore},'drive-selected':{prepare,restore}};
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
