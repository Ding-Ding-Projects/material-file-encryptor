import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {createCredentialStore} from '../src/main/feature-services.js';
import {createProtectedSettingsReset,RESET_PREFERENCES_KEY,RESET_DISPLAY_KEY} from '../src/main/protected-settings-reset.js';
import {DEFAULTS} from '../src/shared/local-ux/store.js';
const JOURNAL='profile:preferences-reset-journal:v1';
async function fixture(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'protected-reset-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const key=randomBytes(32),safeStorage={isEncryptionAvailable:()=>true,encryptString(text){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,cipher.update(text),cipher.final(),cipher.getAuthTag()]);},decryptString(data){const cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));cipher.setAuthTag(data.subarray(-16));return Buffer.concat([cipher.update(data.subarray(12,-16)),cipher.final()]).toString();}};
 const credentials=createCredentialStore({directory,safeStorage}),state={actor:'synthetic-actor',allowed:true,time:1000},audits=[];
 await credentials.set(RESET_PREFERENCES_KEY,{...structuredClone(DEFAULTS),theme:'dark',displayName:'Synthetic name'});await credentials.set(RESET_DISPLAY_KEY,{value:'Synthetic name'});await credentials.set('authenticator:unrelated',{synthetic:'untouched'});
 const options={credentials,getActor:()=>state.actor,authorize:async who=>()=>{if(!state.allowed||state.actor!==who)throw Error('authorization revoked');},audit:async row=>audits.push(row.id),now:()=>state.time};
 return{credentials,state,audits,options,directory,safeStorage,reset:createProtectedSettingsReset(options)};
}
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
 const f=await fixture(t),preview=await f.reset.prepare(),before=await f.credentials.readVersioned(RESET_PREFERENCES_KEY),original=f.credentials.compareAndSetVersioned;
 f.credentials.compareAndSetVersioned=async(key,...args)=>{if(key===JOURNAL)throw Error('synthetic journal persistence failure');return original.call(f.credentials,key,...args);};
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
