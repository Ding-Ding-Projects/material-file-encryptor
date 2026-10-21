// Creates real encrypted native fixtures. This helper never launches the GUI,
// edits a renderer, changes a real profile, or produces acceptance claims.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {conflictPage} from '../src/renderer/features/storage-maintenance/registry-conflicts-model.js';

const cases=new Map([['empty',null],['directory-rename','rename'],['file-edit','file-edit'],['file-rename','rename'],['delete-edit','delete-versus-edit'],['resolution-divergence','resolution-divergence']]);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function realFile(file,expected){assert.ok(path.isAbsolute(file));assert.equal(await fs.realpath(file),path.resolve(file));assert.equal((await fs.lstat(file)).isSymbolicLink(),false);assert.match(expected,/^[a-f0-9]{64}$/);assert.equal(hash(await fs.readFile(file)),expected);}
export async function invokeRegistryFixture(executable,args,{timeoutMs=60000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',size=0,finished=false;
  const fail=code=>{if(finished)return;finished=true;clearTimeout(timer);child.kill();reject(Error(code));};
  const timer=setTimeout(()=>fail('NATIVE_FIXTURE_TIMEOUT'),timeoutMs);
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>1048576)fail('NATIVE_FIXTURE_OUTPUT_LIMIT');else stdout+=chunk.toString('utf8');});child.stderr.resume();
  child.on('error',()=>fail('NATIVE_FIXTURE_LAUNCH_FAILED'));
  child.on('close',code=>{if(finished)return;finished=true;clearTimeout(timer);if(code!==0){reject(Error('NATIVE_FIXTURE_REJECTED'));return;}try{resolve(JSON.parse(stdout));}catch{reject(Error('NATIVE_FIXTURE_INVALID_RESULT'));}});
 });
}
export function validateRegistryFixtureResult(value,{root,scenario}){
 assert.ok(cases.has(scenario));assert.equal(value?.prepared,true);assert.equal(value.fixtureRoot,root);assert.equal(value.scenario,scenario);assert.equal(value.device,'deviceA');assert.match(value.vaultId,/^[a-f0-9]{32,64}$/i);
 for(const key of ['storageDir','cacheDir','keyFilePath']){assert.equal(typeof value[key],'string');assert.ok(path.isAbsolute(value[key]));const relative=path.relative(root,value[key]);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Fixture path escapes owned root');}
 const page=conflictPage({items:value.expectedConflicts,nextCursor:null});
 if(scenario==='directory-rename')assert.ok(page.items.some(row=>row.unsupportedReason&&(row.current?.isDirectory||row.preserved?.isDirectory)));
 else {assert.equal(page.items.length,scenario==='empty'?0:1);if(scenario!=='empty'){assert.equal(page.items[0].kind,cases.get(scenario));assert.ok(page.items[0].supportedChoices.length);}}
 if(scenario==='resolution-divergence')assert.equal(page.items[0].recoveryDirectory,'');
 return {...value,expectedConflicts:page.items};
}
export async function prepareRegistryReviewFixture({dotnet,dotnetSha256,assembly,assemblySha256,buildReceiptPath,buildReceiptSha256,sourceCommit,scenario,run=invokeRegistryFixture}){
 assert.match(sourceCommit,/^[a-f0-9]{40,64}$/);assert.ok(cases.has(scenario));await realFile(dotnet,dotnetSha256);await realFile(assembly,assemblySha256);await realFile(buildReceiptPath,buildReceiptSha256);
 const build=JSON.parse(await fs.readFile(buildReceiptPath,'utf8'));assert.equal(build.sourceCommit,sourceCommit);assert.equal(build.assemblySha256,assemblySha256);
 const temporary=await fs.realpath(os.tmpdir());const root=path.join(temporary,'mfe-registry-fixture-review-'+randomUUID().replaceAll('-',''));
 try{await fs.lstat(root);throw Error('FIXTURE_ROOT_EXISTS');}catch(error){if(error.code!=='ENOENT')throw error;}
 const result=validateRegistryFixtureResult(await run(dotnet,[assembly,'--registry-fixture','prepare-review',root,'deviceA',scenario]),{root,scenario});
 assert.equal(await fs.realpath(root),root);assert.equal(await fs.readFile(path.join(root,'.registry-fixture-owner'),'utf8'),'MaterialFileEncryptor synthetic registry fixture v1\n'+root+'\n');
 for(const key of ['storageDir','cacheDir','keyFilePath']){assert.equal(await fs.realpath(result[key]),result[key]);assert.equal((await fs.lstat(result[key])).isSymbolicLink(),false);}
 const receipt={version:1,sourceCommit,assemblySha256,buildReceiptSha256,fixtureRoot:root,scenario,vaultId:result.vaultId,storageDir:result.storageDir,cacheDir:result.cacheDir,keyFilePath:result.keyFilePath,expectedConflicts:result.expectedConflicts,route:'supported-native-service',ownedSyntheticFixture:true,prepared:true,guiLaunched:false,runtimeAcceptance:false};
 await fs.writeFile(path.join(root,'review-receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});
 return receipt;
}

// Reopens the owned native fixture through the same source-bound executable.
// The competing edit uses its separate native cache, never renderer state.
export async function inspectRegistryReviewFixture(fixture,{dotnet,dotnetSha256,assembly,assemblySha256,sourceCommit,advance=false,run=invokeRegistryFixture}) {
 assert.equal(fixture.sourceCommit,sourceCommit);assert.equal(fixture.assemblySha256,assemblySha256);
 await realFile(dotnet,dotnetSha256);await realFile(assembly,assemblySha256);
 assert.equal(await fs.realpath(fixture.fixtureRoot),fixture.fixtureRoot);
 assert.equal(await fs.readFile(path.join(fixture.fixtureRoot,'.registry-fixture-owner'),'utf8'),'MaterialFileEncryptor synthetic registry fixture v1\n'+fixture.fixtureRoot+'\n');
 const result=await run(dotnet,[assembly,'--registry-fixture',advance?'advance-review':'inspect-review',fixture.fixtureRoot,'deviceA',fixture.scenario]);
 assert.equal(result.verified,true);assert.equal(result.advanced,advance);assert.equal(result.fixtureRoot,fixture.fixtureRoot);assert.equal(result.storageDir,fixture.storageDir);assert.equal(result.vaultId,fixture.vaultId);
 assert.ok(Array.isArray(result.entries)&&Array.isArray(result.histories)&&Array.isArray(result.conflicts));
 return result;
}
