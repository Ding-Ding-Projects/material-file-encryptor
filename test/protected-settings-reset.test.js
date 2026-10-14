import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {createCredentialStore} from '../src/main/feature-services.js';
import {createProtectedSettingsReset,RESET_PREFERENCES_KEY,RESET_DISPLAY_KEY} from '../src/main/protected-settings-reset.js';
import {DEFAULTS} from '../src/shared/local-ux/store.js';
import {createAccessIntegration} from '../src/main/access-integration.js';
import {passwordVerifier} from '../src/renderer/features/access/crypto.js';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const JOURNAL='profile:preferences-reset-journal:v1';
async function fixture(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'protected-reset-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const key=randomBytes(32),safeStorage={isEncryptionAvailable:()=>true,encryptString(text){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,cipher.update(text),cipher.final(),cipher.getAuthTag()]);},decryptString(data){const cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));cipher.setAuthTag(data.subarray(-16));return Buffer.concat([cipher.update(data.subarray(12,-16)),cipher.final()]).toString();}};
 const credentials=createCredentialStore({directory,safeStorage}),state={actor:'synthetic-actor',allowed:true,time:1000},audits=[];
 await credentials.set(RESET_PREFERENCES_KEY,{...structuredClone(DEFAULTS),theme:'dark',displayName:'Synthetic name'});await credentials.set(RESET_DISPLAY_KEY,{value:'Synthetic name'});await credentials.set('authenticator:unrelated',{synthetic:'untouched'});
 const options={credentials,getActor:()=>state.actor,authorize:async who=>()=>{if(!state.allowed||state.actor!==who)throw Error('authorization revoked');},audit:async row=>audits.push(row.id),now:()=>state.time};
 return{credentials,state,audits,options,directory,safeStorage,reset:createProtectedSettingsReset(options)};
}
async function integrationFixture(t){
 const f=await fixture(t),frame={},execute=promisify(execFile),toolsDirectory=path.join(f.directory,'tools'),executable=path.join(toolsDirectory,'git','cmd','git.exe'),bytes=Buffer.from('Synthetic resolver fixture, not executed');
 await fs.mkdir(path.dirname(executable),{recursive:true});await fs.writeFile(executable,bytes);
 await fs.writeFile(path.join(toolsDirectory,'forge-executables.json'),JSON.stringify({schemaVersion:1,git:{relativePath:'git/cmd/git.exe',version:'2.56.0.windows.2',sha256:createHash('sha256').update(bytes).digest('hex')},gh:{relativePath:'gh/bin/gh.exe',version:'2.102.0',sha256:'0'.repeat(64)}}));
 const service=createAccessIntegration({dataDirectory:f.directory,toolsDirectory,credentials:f.credentials,getMainFrame:()=>frame,now:()=>f.state.time,recordMutation:async()=>{},execute:async(file,args,options)=>args[0]==='--version'?{stdout:'git version 2.56.0.windows.2\n'}:execute('git',args,options)});t.after(()=>service.close());
 const verifier=await passwordVerifier('synthetic reset profile',100000);await f.credentials.set('local-profile:v1',verifier);
 assert.equal((await service.request(frame,'localVerify',{target:'profile',credentials:{password:'synthetic reset profile'}})).ok,true);
 await service.request(frame,'historySetup',{password:'synthetic reset history'});
 return {...f,service,frame,verifier};
}

test('reset rejects a replaced profile revision after preview, including same-value replacement',async t=>{
 const f=await integrationFixture(t),preview=await f.service.requestSettingsReset(f.frame,'prepare',{includeDisplayName:true});
 await f.credentials.set('local-profile:v1',f.verifier);
 await assert.rejects(f.service.requestSettingsReset(f.frame,'commit',{id:preview.id}),/Unlock the local profile|profile.*changed/);
 assert.equal((await f.credentials.get(RESET_PREFERENCES_KEY)).theme,'dark');
});

test('restart after a restoration write resumes its journal without a false ownership conflict',async t=>{
 const f=await fixture(t),before=await f.credentials.readVersioned(RESET_PREFERENCES_KEY),name=await f.credentials.readVersioned(RESET_DISPLAY_KEY),journal=await f.credentials.readVersioned(JOURNAL),changes=[{key:RESET_PREFERENCES_KEY,before:before.value,expectedRevision:before.revision,replacement:structuredClone(DEFAULTS)},{key:RESET_DISPLAY_KEY,before:name.value,expectedRevision:name.revision,replacement:{value:DEFAULTS.displayName}}];
 await f.credentials.compareAndSetBatchVersioned(changes,{key:JOURNAL,expectedRevision:journal.revision,replacement:{version:1,id:'synthetic-restart-restoration',state:'applied',changes}});
 const originalSingle=f.credentials.compareAndSetVersioned,originalBatch=f.credentials.compareAndSetBatchVersioned;let stopped=false;
 f.credentials.compareAndSetVersioned=async(key,revision,value)=>{const result=await originalSingle.call(f.credentials,key,revision,value);if(key===RESET_PREFERENCES_KEY&&result.updated&&!stopped){stopped=true;throw Error('synthetic interruption after restoration');}return result;};
 f.credentials.compareAndSetBatchVersioned=async(rows,...args)=>{const result=await originalBatch.call(f.credentials,rows,...args);if(rows.some(row=>row.key===RESET_PREFERENCES_KEY&&row.replacement?.theme==='dark')&&result.updated&&!stopped){stopped=true;throw Error('synthetic interruption after restoration');}return result;};
 await assert.rejects(f.reset.recover(),/synthetic interruption/);
 const restart=createProtectedSettingsReset({...f.options,credentials:createCredentialStore({directory:f.directory,safeStorage:f.safeStorage})});assert.equal((await restart.recover()).state,'restored');assert.equal((await f.credentials.get(RESET_PREFERENCES_KEY)).theme,'dark');assert.deepEqual(await f.credentials.get(RESET_DISPLAY_KEY),name.value);assert.equal(await f.credentials.get(JOURNAL),null);
});
test('preview is bounded, reset is one-use and unrelated records survive',async t=>{
 const f=await fixture(t),preview=await f.reset.prepare({includeDisplayName:true});assert.equal(preview.displayName.before,'Synthetic name');assert.equal(preview.scope.sharedMode,false);assert.equal(preview.before.theme,'dark');
 assert.equal((await f.reset.commit(preview.id)).state,'committed');assert.equal((await f.credentials.get(RESET_PREFERENCES_KEY)).theme,'system');assert.deepEqual(await f.credentials.get(RESET_DISPLAY_KEY),{value:DEFAULTS.displayName});assert.deepEqual(await f.credentials.get('authenticator:unrelated'),{synthetic:'untouched'});assert.equal(f.audits.length,1);await assert.rejects(f.reset.commit(preview.id),/unavailable/);
 const disk=await fs.readFile(path.join(f.directory,'protected-records.json'),'utf8');assert.equal(disk.includes('Synthetic name'),false);assert.equal(await f.credentials.get(JOURNAL),null);
});
test('preview revisions reject ABA writes, expiry, cancellation and changed actors',async t=>{
 for(const kind of ['aba','expiry','abort','actor']){const f=await fixture(t),preview=await f.reset.prepare();if(kind==='aba'){const old=await f.credentials.get(RESET_PREFERENCES_KEY);await f.credentials.set(RESET_PREFERENCES_KEY,{...old,theme:'light'});await f.credentials.set(RESET_PREFERENCES_KEY,old);}if(kind==='expiry')f.state.time=preview.expires;if(kind==='abort')f.reset.abort(preview.id);if(kind==='actor')f.state.actor='second-actor';await assert.rejects(f.reset.commit(preview.id),/changed|expired|unavailable/);assert.equal((await f.credentials.get(RESET_PREFERENCES_KEY)).theme,'dark');assert.equal(f.audits.length,0);}
});
test('audit failure restores only owned revisions and preserves a newer concurrent value',async t=>{
 const f=await fixture(t),reset=createProtectedSettingsReset({...f.options,audit:async()=>{await f.credentials.set(RESET_DISPLAY_KEY,{value:'Concurrent name'});throw Error('synthetic audit failure');}}),preview=await reset.prepare({includeDisplayName:true});await assert.rejects(reset.commit(preview.id),/Newer records were preserved/);assert.equal((await f.credentials.get(RESET_PREFERENCES_KEY)).theme,'dark');assert.deepEqual(await f.credentials.get(RESET_DISPLAY_KEY),{value:'Concurrent name'});assert.equal((await f.credentials.get(JOURNAL)).state,'conflict');assert.equal((await createProtectedSettingsReset(f.options).recover()).state,'conflict');await assert.rejects(reset.prepare(),/concurrent change/);
});
test('restart recovery restores an interrupted atomic application with encrypted intent',async t=>{
 const f=await fixture(t),before=await f.credentials.readVersioned(RESET_PREFERENCES_KEY),journal=await f.credentials.readVersioned(JOURNAL),changes=[{key:RESET_PREFERENCES_KEY,before:before.value,expectedRevision:before.revision,replacement:structuredClone(DEFAULTS)}];
 const applied=await f.credentials.compareAndSetBatchVersioned(changes,{key:JOURNAL,expectedRevision:journal.revision,replacement:{version:1,id:'synthetic-restart',state:'applied',changes}});assert.equal(applied.updated,true);
 const restarted=createProtectedSettingsReset({...f.options,credentials:createCredentialStore({directory:f.directory,safeStorage:f.safeStorage})});assert.equal((await restarted.recover()).state,'restored');assert.equal((await f.credentials.get(RESET_PREFERENCES_KEY)).theme,'dark');assert.equal(await f.credentials.get(JOURNAL),null);
});
test('atomic batch rejects one stale member without any partial write',async t=>{
 const f=await fixture(t),prefs=await f.credentials.readVersioned(RESET_PREFERENCES_KEY),name=await f.credentials.readVersioned(RESET_DISPLAY_KEY);await f.credentials.set(RESET_DISPLAY_KEY,{value:'Concurrent name'});
 assert.equal((await f.credentials.compareAndSetBatchVersioned([{key:RESET_PREFERENCES_KEY,expectedRevision:prefs.revision,replacement:structuredClone(DEFAULTS)},{key:RESET_DISPLAY_KEY,expectedRevision:name.revision,replacement:{value:'Default'}}])).updated,false);assert.deepEqual(await f.credentials.readVersioned(RESET_PREFERENCES_KEY),prefs);
});
test('all protected writers reject a competing or abandoned writer lock',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.directory,'protected-records.json.lock'),'synthetic-owned-lock');await assert.rejects(f.credentials.set('authenticator:unrelated',{}),/busy|abandoned-lock/);assert.deepEqual(await f.credentials.get('authenticator:unrelated'),{synthetic:'untouched'});
});
test('native adoption is required and protected shared mode is preserved',async t=>{
 const f=await fixture(t);await f.credentials.delete(RESET_PREFERENCES_KEY);await assert.rejects(f.reset.prepare(),/not been adopted/);await f.credentials.set(RESET_PREFERENCES_KEY,{...structuredClone(DEFAULTS),theme:'dark',school:{enabled:true,name:'Synthetic protected mode'}});const preview=await f.reset.prepare();await f.reset.commit(preview.id);assert.deepEqual((await f.credentials.get(RESET_PREFERENCES_KEY)).school,{enabled:true,name:'Synthetic protected mode'});
});
test('journal persistence failure prevents the preference mutation and audit',async t=>{
 const f=await fixture(t),preview=await f.reset.prepare(),before=await f.credentials.readVersioned(RESET_PREFERENCES_KEY),original=f.credentials.compareAndSetBatchVersioned;
 f.credentials.compareAndSetBatchVersioned=async(rows,...args)=>{if(rows.some(row=>row.key===JOURNAL))throw Error('synthetic journal persistence failure');return original.call(f.credentials,rows,...args);};
 await assert.rejects(f.reset.commit(preview.id),/journal persistence/);assert.deepEqual(await f.credentials.readVersioned(RESET_PREFERENCES_KEY),before);assert.equal(f.audits.length,0);
});
test('authorization loss during application restores the durable owned revision',async t=>{
 const f=await fixture(t),preview=await f.reset.prepare(),original=f.credentials.compareAndSetBatchVersioned;
 f.credentials.compareAndSetBatchVersioned=async(...args)=>{const result=await original.apply(f.credentials,args);f.state.allowed=false;return result;};
 await assert.rejects(f.reset.commit(preview.id),/authorization revoked/);assert.equal((await f.credentials.get(RESET_PREFERENCES_KEY)).theme,'dark');assert.equal(await f.credentials.get(JOURNAL),null);assert.equal(f.audits.length,0);
});
test('noncanonical native records fail before preview or journal persistence',async t=>{
 const f=await fixture(t);await f.credentials.set(RESET_PREFERENCES_KEY,{...structuredClone(DEFAULTS),unknownPayload:'synthetic excluded data'});await assert.rejects(f.reset.prepare(),/canonical settings format/);assert.equal(await f.credentials.get(JOURNAL),null);
});

test('profile replacement during each reset await boundary is rejected or compensated',async t=>{
 for(const phase of ['preference-read','prepared-write','applied-write','applied-return','audit-key-read','journal-clear']){
  const f=await integrationFixture(t),preview=await f.service.requestSettingsReset(f.frame,'prepare',{includeDisplayName:true});let changed=false;
  const replace=async()=>{if(!changed){changed=true;await f.credentials.set('local-profile:v1',f.verifier);}};
  const originalRead=f.credentials.readVersioned,originalBatch=f.credentials.compareAndSetBatchVersioned,originalGet=f.credentials.get;
  f.credentials.readVersioned=async key=>{const result=await originalRead.call(f.credentials,key);if(phase==='preference-read'&&key===RESET_PREFERENCES_KEY)await replace();return result;};
  f.credentials.compareAndSetBatchVersioned=async(rows,journal,...args)=>{
   if(phase==='prepared-write'&&rows.some(row=>row.key===JOURNAL&&row.replacement?.state==='prepared')||phase==='applied-write'&&journal?.replacement?.state==='applied'||phase==='journal-clear'&&rows.some(row=>row.key===JOURNAL&&row.replacement===null))await replace();
   const result=await originalBatch.call(f.credentials,rows,journal,...args);if(phase==='applied-return'&&journal?.replacement?.state==='applied')await replace();return result;
  };
  f.credentials.get=async key=>{const result=await originalGet.call(f.credentials,key);if(phase==='audit-key-read'&&key==='lock:access-history:v1')await replace();return result;};
  await assert.rejects(f.service.requestSettingsReset(f.frame,'commit',{id:preview.id}),/profile|authorization/i,phase);assert.equal(changed,true,phase);assert.equal((await f.credentials.get(RESET_PREFERENCES_KEY)).theme,'dark',phase);assert.equal((await f.credentials.get(RESET_DISPLAY_KEY)).value,'Synthetic name',phase);assert.equal(await f.credentials.get(JOURNAL),null,phase);
  if(phase==='audit-key-read')assert.equal((await f.service.request(f.frame,'historyList',{})).some(row=>row.action==='preferences-reset'),false);
 }
});

test('a concurrent same-value write after compensation remains a genuine recovery conflict',async t=>{
 const f=await fixture(t),before=await f.credentials.readVersioned(RESET_PREFERENCES_KEY),journal=await f.credentials.readVersioned(JOURNAL),changes=[{key:RESET_PREFERENCES_KEY,before:before.value,expectedRevision:before.revision,replacement:structuredClone(DEFAULTS)}];
 await f.credentials.compareAndSetBatchVersioned(changes,{key:JOURNAL,expectedRevision:journal.revision,replacement:{version:1,id:'synthetic-restoration-aba',state:'applied',changes}});
 const original=f.credentials.compareAndSetBatchVersioned;f.credentials.compareAndSetBatchVersioned=async(rows,...args)=>{const result=await original.call(f.credentials,rows,...args);if(rows[0].key===RESET_PREFERENCES_KEY&&rows[0].replacement?.theme==='dark'&&result.updated)throw Error('synthetic interruption after restoration');return result;};
 await assert.rejects(f.reset.recover(),/synthetic interruption/);await f.credentials.set(RESET_PREFERENCES_KEY,before.value);const newer=await f.credentials.readVersioned(RESET_PREFERENCES_KEY);
 const restart=createProtectedSettingsReset({...f.options,credentials:createCredentialStore({directory:f.directory,safeStorage:f.safeStorage})});assert.equal((await restart.recover()).state,'conflict');assert.deepEqual(await f.credentials.readVersioned(RESET_PREFERENCES_KEY),newer);assert.equal((await f.credentials.get(JOURNAL)).state,'conflict');
});

test('recovery finalization preserves a concurrent write after the restored row was inspected',async t=>{
 const f=await fixture(t),before=await f.credentials.readVersioned(RESET_PREFERENCES_KEY),journal=await f.credentials.readVersioned(JOURNAL),changes=[{key:RESET_PREFERENCES_KEY,before:before.value,expectedRevision:before.revision,replacement:structuredClone(DEFAULTS)}];
 await f.credentials.compareAndSetBatchVersioned(changes,{key:JOURNAL,expectedRevision:journal.revision,replacement:{version:1,id:'synthetic-finalization-race',state:'applied',changes}});
 const original=f.credentials.compareAndSetBatchVersioned;let replaced=false;
 f.credentials.compareAndSetBatchVersioned=async(rows,receipt,conditions)=>{if(rows.some(row=>row.key===JOURNAL&&row.replacement===null)&&!replaced){replaced=true;await f.credentials.set(RESET_PREFERENCES_KEY,before.value);}return original.call(f.credentials,rows,receipt,conditions);};
 const result=await f.reset.recover();assert.equal(result.state,'conflict');assert.deepEqual(result.conflicts,[RESET_PREFERENCES_KEY]);assert.equal((await f.credentials.get(JOURNAL)).state,'conflict');assert.deepEqual(await f.credentials.get(RESET_PREFERENCES_KEY),before.value);
});
