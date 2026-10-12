import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createAccessMutationHistory,validateAccessMutationEvent} from '../src/main/access-mutation-history.js';
const exec=promisify(execFile),event={version:1,action:'access-credential-created',target:'profile',at:'2026-10-11T00:00:00.000Z'};
async function fixture(){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-access-mutation-')),toolsDirectory=path.join(directory,'tools'),exe=path.join(toolsDirectory,'git','cmd','git.exe'),bytes=Buffer.from('Synthetic resolver fixture; test executor runs Git separately');await fs.mkdir(path.dirname(exe),{recursive:true});await fs.writeFile(exe,bytes);await fs.writeFile(path.join(toolsDirectory,'forge-executables.json'),JSON.stringify({schemaVersion:1,git:{relativePath:'git/cmd/git.exe',version:'2.56.0.windows.2',sha256:createHash('sha256').update(bytes).digest('hex')},gh:{relativePath:'gh/bin/gh.exe',version:'2.102.0',sha256:'0'.repeat(64)}}));let failCommit=false;const calls=[],environments=[],services=[];const create=()=>{const service=createAccessMutationHistory({dataDirectory:directory,toolsDirectory,execute:async(file,args,options)=>{assert.equal(file,exe);calls.push(args);environments.push(options.env);if(args[0]==='--version')return {stdout:'git version 2.56.0.windows.2\n'};if(failCommit&&args.includes('commit'))throw Error('Synthetic commit interruption');return exec('git',args,options);}});services.push(service);return service;};return {directory,exe,calls,environments,create,fail:()=>failCommit=true,resume:()=>failCommit=false,dispose:async()=>{services.forEach(s=>s.close());await fs.rm(directory,{recursive:true,force:true});}};}
async function interruptedPendingRecord(record,readPending){
 await assert.rejects(record(),/Synthetic commit interruption/);
 const names=await readPending();assert.equal(names.length,1,'Expected exactly one interrupted pending record');
 return names[0];
}
test('interruption fixture rejects wrong causes and non-singleton pending inventories',async()=>{
 let reads=0;
 await assert.rejects(interruptedPendingRecord(()=>Promise.reject(Error('Unrelated initialization failure')),async()=>{reads++;return ['record.json'];}),assert.AssertionError);
 assert.equal(reads,0);
 for(const names of [[],['first.json','second.json']])await assert.rejects(interruptedPendingRecord(()=>Promise.reject(Error('Synthetic commit interruption')),async()=>names),/Expected exactly one/);
 assert.equal(await interruptedPendingRecord(()=>Promise.reject(Error('Synthetic commit interruption')),async()=>['only.json']),'only.json');
});
test('metadata schema rejects credentials, actors, arbitrary actions and malformed dates',()=>{for(const extra of [{password:'synthetic'},{actor:'forged'},{payload:{}}])assert.throws(()=>validateAccessMutationEvent({...event,...extra}),/Invalid redacted/);assert.throws(()=>validateAccessMutationEvent({...event,action:'arbitrary'}),/Invalid redacted/);assert.throws(()=>validateAccessMutationEvent({...event,at:'2026-02-30T00:00:00.000Z'}),/Invalid redacted/);});
test('redacted mutation records are immutable, serialized and actually committed before success',async()=>{const f=await fixture();try{const journal=f.create(),results=await Promise.all([journal.record(event),journal.record({...event,action:'access-credential-removed'})]);assert.ok(results.every(r=>r.recorded&&/^[a-f0-9]{40}$/.test(r.commit)));assert.notEqual(results[0].id,results[1].id);const rows=await journal.list();assert.equal(rows.length,2);const folder=path.join(f.directory,'access-mutations','records');for(const name of await fs.readdir(folder)){const value=JSON.parse(await fs.readFile(path.join(folder,name),'utf8'));assert.deepEqual(Object.keys(value),['version','action','target','at']);}assert.equal((await fs.readdir(path.join(f.directory,'access-mutations','pending'))).length,0);assert.equal(Number((await exec('git',['rev-list','--count','HEAD'],{cwd:path.join(f.directory,'access-mutations'),windowsHide:true})).stdout.trim()),2);}finally{await f.dispose();}});
test('an interrupted uncommitted record is recovered on restart without duplication',async()=>{const f=await fixture();try{const first=f.create();f.fail();await assert.rejects(first.record(event),/Synthetic commit interruption/);assert.equal((await fs.readdir(path.join(f.directory,'access-mutations','pending'))).length,1);first.close();f.resume();const second=f.create();assert.equal((await second.list()).length,1);assert.equal((await second.list()).length,1);assert.equal((await fs.readdir(path.join(f.directory,'access-mutations','pending'))).length,0);await second.record({...event,action:'access-credential-removed'});assert.equal((await second.list()).length,2);}finally{await f.dispose();}});
test('recovery preserves altered staged bytes and reports the integrity mismatch',async()=>{const f=await fixture();try{const first=f.create();f.fail();const folder=path.join(f.directory,'access-mutations','pending'),name=await interruptedPendingRecord(()=>first.record(event),()=>fs.readdir(folder));first.close();const filename=path.join(folder,name),unknown=JSON.stringify({...event,target:'element:synthetic-changed'});await fs.writeFile(filename,unknown);f.resume();await assert.rejects(f.create().list(),/integrity check failed/);assert.equal(await fs.readFile(filename,'utf8'),unknown);}finally{await f.dispose();}});
test('unknown pending files are retained and cannot be interpreted as journal records',async()=>{const f=await fixture();try{const first=f.create();await first.list();const filename=path.join(f.directory,'access-mutations','pending','unknown.txt');await fs.writeFile(filename,'synthetic unknown bytes');await assert.rejects(first.list(),/unknown pending file/);assert.equal(await fs.readFile(filename,'utf8'),'synthetic unknown bytes');}finally{await f.dispose();}});
test('changed bundled executable stops recording before a process invocation',async()=>{const f=await fixture();try{await fs.writeFile(f.exe,'changed fixture');await assert.rejects(f.create().record(event),/Verified bundled forge tools/);assert.equal(f.calls.length,0);}finally{await f.dispose();}});
test('closed journal cannot record and validated event snapshots do not change in the queue',async()=>{const f=await fixture();try{const journal=f.create(),value={...event},pending=journal.record(value);value.target='element:changed-later';await pending;assert.equal((await journal.list())[0].target,'profile');journal.close();await assert.rejects(journal.record(event),/closed/);}finally{await f.dispose();}});

test('inherited Git routing and configuration cannot redirect the owned journal',async()=>{
 const f=await fixture(),external=path.join(f.directory,'external'),externalGit=path.join(external,'metadata'),globalConfig=path.join(f.directory,'inherited-config'),original=new Map();
 const injected={GIT_DIR:externalGit,GIT_WORK_TREE:external,GIT_INDEX_FILE:path.join(external,'index'),GIT_OBJECT_DIRECTORY:path.join(external,'objects'),GIT_ALTERNATE_OBJECT_DIRECTORIES:path.join(external,'alternate'),GIT_CONFIG_GLOBAL:globalConfig,GIT_CONFIG_SYSTEM:globalConfig,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'core.worktree',GIT_CONFIG_VALUE_0:external,GIT_CONFIG_PARAMETERS:"'core.worktree="+external+"'",GIT_TEMPLATE_DIR:external,GIT_EXEC_PATH:external,GIT_TRACE:path.join(external,'trace'),GIT_AUTHOR_NAME:'Inherited identity',SSH_ASKPASS:path.join(external,'askpass')};
 try{
  await fs.mkdir(external);await fs.writeFile(path.join(external,'sentinel'),'unchanged');
  await fs.writeFile(globalConfig,'[core]\n\tworktree = '+external.replaceAll('\\','/')+'\n');
  for(const [key,value] of Object.entries(injected)){original.set(key,process.env[key]);process.env[key]=value;}
  const journal=f.create();const result=await journal.record(event);assert.equal(result.recorded,true);assert.equal((await journal.list()).length,1);
  assert.equal((await fs.stat(path.join(f.directory,'access-mutations','.git'))).isDirectory(),true);
  assert.deepEqual(await fs.readdir(external),['sentinel']);assert.equal(await fs.readFile(path.join(external,'sentinel'),'utf8'),'unchanged');
  for(const environment of f.environments){
   assert.ok(environment);assert.equal(environment.GIT_CONFIG_NOSYSTEM,'1');assert.equal(environment.GIT_CONFIG_COUNT,'0');assert.equal(environment.GIT_TERMINAL_PROMPT,'0');
   assert.equal(environment.GIT_CONFIG_GLOBAL,'/dev/null');assert.equal(environment.GIT_CONFIG_SYSTEM,environment.GIT_CONFIG_GLOBAL);
   for(const key of Object.keys(injected))if(!['GIT_CONFIG_GLOBAL','GIT_CONFIG_SYSTEM','GIT_CONFIG_COUNT'].includes(key))assert.equal(environment[key],undefined,key);
  }
 }finally{
  for(const [key,value] of original){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  await f.dispose();
 }
});
