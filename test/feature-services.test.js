import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCredentialStore, createFeatureServices, readConverterManifest } from '../src/main/feature-services.js';
import { validateFeatureRequest, validateRequest } from '../src/main/validation.js';
const safeStorage={isEncryptionAvailable:()=>true,encryptString:text=>Buffer.from(text),decryptString:value=>value.toString()};
async function fixture(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'feature-services-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}
test('personalization image dispatch reaches the existing image validator',async t=>{
 const directory=await fixture(t),services=createFeatureServices({dataDirectory:directory,applicationRoot:directory,safeStorage,getMainFrame:()=>null,dialog:{},getWindow:()=>null,openPath:async()=>{}});
 try{await assert.rejects(services.request('personalization','normalizeImage',{dataUrl:'not an image'}),/Choose a static PNG no larger than 4 MiB\./);}
 finally{await services.close();}
});
test('converter manifests support Windows UTF-8 output without accepting malformed JSON',async t=>{
 const directory=await fixture(t),filename=path.join(directory,'manifest.json');
 const manifest={schemaVersion:1,launcherSha256:'a'.repeat(64),runtimeSha256:'b'.repeat(64),launcherCompanionHashes:{}};
 for(const prefix of ['','\uFEFF']){await fs.writeFile(filename,prefix+JSON.stringify(manifest),'utf8');assert.deepEqual(await readConverterManifest(filename),manifest);}
 await fs.writeFile(filename,'\uFEFF{"schemaVersion":');await assert.rejects(readConverterManifest(filename),SyntaxError);
});
test('protected record operations serialize, reload and reject unsupported keys',async t=>{const directory=await fixture(t);const store=createCredentialStore({directory,safeStorage});await Promise.all([store.set('local-profile:v1',{version:2}),store.set('element-lock:test',{policy:'pin'}),store.set('history:verifier',{version:2})]);assert.deepEqual(await store.get('local-profile:v1'),{version:2});assert.equal((await store.list('element-lock:')).length,1);await store.delete('history:verifier');assert.equal(await store.get('history:verifier'),null);assert.throws(()=>store.set('../escape',{}));assert.throws(()=>store.set('profile:unsafe',JSON.parse('{"__proto__":{"x":true}}')));});
test('protected storage refuses plaintext fallback',async t=>{const directory=await fixture(t);const store=createCredentialStore({directory,safeStorage:{isEncryptionAvailable:()=>false}});await assert.rejects(store.get('local-profile:v1'));assert.throws(()=>store.set('local-profile:v1',{}));assert.deepEqual(await fs.readdir(directory),[]);});
test('shared mode requires existing credentials to change an active record',async t=>{const directory=await fixture(t);const services=createFeatureServices({dataDirectory:directory,applicationRoot:directory,safeStorage,getMainFrame:()=>null,dialog:{},getWindow:()=>null,openPath:async()=>{}});await services.request('personalization','setSharedCredential',{password:'synthetic credential'});await services.request('personalization','sharedWrite',{value:{enabled:true,name:'School'}});await assert.rejects(services.request('personalization','sharedWrite',{value:{enabled:false}}));await assert.rejects(services.request('personalization','setSharedCredential',{password:'replacement'}));assert.equal(await services.request('personalization','verifySharedCredential',{password:'wrong'}),false);assert.equal(await services.request('personalization','verifySharedCredential',{password:'synthetic credential'}),true);await services.request('personalization','sharedWrite',{value:{enabled:false}});await assert.rejects(services.request('personalization','sharedWrite',{value:{vocabulary:{}}}));await services.close();});
test('feature dispatch refuses arbitrary methods and structured oversized input',async t=>{const directory=await fixture(t);const services=createFeatureServices({dataDirectory:directory,applicationRoot:directory,safeStorage,getMainFrame:()=>null,dialog:{},getWindow:()=>null,openPath:async()=>{}});await assert.rejects(services.request('arbitrary','exec',{}));await assert.rejects(services.request('converter','exec',{}));await assert.rejects(services.request('access','credentialSet',{key:'profile:x',value:'x'.repeat(300000)}));await services.close();await assert.rejects(services.request('status','status',{}));});

test('renderer credentials cannot create or read native file grants or shared credentials',async t=>{
 const directory=await fixture(t);const services=createFeatureServices({dataDirectory:directory,applicationRoot:directory,safeStorage,getMainFrame:()=>null,dialog:{},getWindow:()=>null,openPath:async()=>{}});
 for(const key of ['grant:12345678-1234-1234-1234-123456789012','shared:mode'])for(const action of ['credentialSet','credentialGet','credentialDelete'])await assert.rejects(services.request('access',action,{key,value:{filename:'synthetic'}}),/Trusted access actor/);
 await assert.rejects(services.request('access','credentialList',{prefix:'grant:'}),/Trusted access actor/);
 const key='element-lock:id:view-settings/section:3/button:2';await assert.rejects(services.request('access','credentialSet',{key,value:{policy:'pin'}}),/Trusted access actor/);assert.equal(await services.credentials.get(key),null);await services.close();
});

test('shutdown counts pending native pickers and stops new admissions',async t=>{
 const directory=await fixture(t);let release;const shown=new Promise(resolve=>{release=resolve;});
 const services=createFeatureServices({dataDirectory:directory,applicationRoot:directory,safeStorage,getMainFrame:()=>null,dialog:{showOpenDialog:()=>shown},getWindow:()=>null,openPath:async()=>{}});
 const selecting=services.request('converter','pickSources',{});assert.equal(await services.pending(),1);services.beginExit();await assert.rejects(services.request('converter','pickSources',{}),/waiting/);release({canceled:true,filePaths:[]});assert.deepEqual(await selecting,[]);assert.equal(await services.pending(),0);services.endExit();await services.close();
});

test('desktop feature allowlist keeps protected records unavailable to browser requests',()=>{
 assert.equal(validateFeatureRequest('access','credentialGet',{key:'local-profile:v1'}).action,'credentialGet');
 assert.throws(()=>validateFeatureRequest('access','credentialGet',{key:'local-profile:v1'},{browser:true}));
 assert.throws(()=>validateFeatureRequest('converter','constructor',{}));
 assert.throws(()=>validateFeatureRequest('ollama','exec',{}));
});

test('workflow bridge observes native picker work and shutdown admission',async t=>{
 const directory=await fixture(t);let release;
 const selecting=new Promise(resolve=>{release=resolve;});
 const services=createFeatureServices({dataDirectory:directory,applicationRoot:directory,safeStorage,getMainFrame:()=>null,dialog:{showOpenDialog:()=>selecting},getWindow:()=>null,openPath:async()=>{}});
 const request=services.request('workflow','pickDocument',{});
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(await services.pending()>0);
 services.beginExit();
 await assert.rejects(services.request('workflow','createDocument',{text:''}),/waiting/);
 assert.deepEqual(await services.request('workflow','downloads',{}),[]);
 release({canceled:true,filePaths:[]});
 assert.equal(await request,null);assert.equal(await services.pending(),0);
 await services.cancelAll();await services.close();
 await assert.rejects(services.request('workflow','documents',{}),/closing/);
});

test('workflow IPC exposes declared actions without an arbitrary execution route',()=>{
 assert.equal(validateFeatureRequest('workflow','pickDocument',{}).action,'pickDocument');
 assert.equal(validateFeatureRequest('workflow','cancelDownload',{id:'grant'},{browser:true}).action,'cancelDownload');
 for(const action of ['exec','spawn','constructor','publish'])assert.throws(()=>validateFeatureRequest('workflow',action,{}));
});

test('performance preferences accept only the two explicit scheduling modes',()=>{
 for(const performanceMode of ['responsive','throughput'])assert.equal(validateRequest('setPreferences',{performanceMode}).performanceMode,performanceMode);
 assert.throws(()=>validateRequest('setPreferences',{performanceMode:'realtime'}));
});

test('browser update requests cannot invoke native installation',()=>{
 assert.equal(validateFeatureRequest('updates','status',{language:'en'},{browser:true}).action,'status');
 assert.equal(validateFeatureRequest('updates','install',{}).action,'install');
 assert.throws(()=>validateFeatureRequest('updates','install',{}, {browser:true}));
});


test('schedule credentials require native confirmation and remain inaccessible to renderer records',async t=>{
 const directory=await fixture(t);let approve=false,calls=0;
 const services=createFeatureServices({dataDirectory:directory,applicationRoot:directory,safeStorage,getMainFrame:()=>null,dialog:{showMessageBox:async()=>{calls++;return {response:approve?1:0};}},getWindow:()=>null,openPath:async()=>{}});
 const source={type:'home-assistant',url:'https://example.com',entity:'input_boolean.work'};
 assert.deepEqual(await services.request('personalization','setScheduleCredential',{id:'test',source,token:'synthetic-value'}),{cancelled:true});
 assert.equal(await services.credentials.get('schedule:test'),null);
 approve=true;assert.equal((await services.request('personalization','setScheduleCredential',{id:'test',source,token:'synthetic-value'})).stored,true);
 assert.equal((await services.credentials.get('schedule:test')).origin,'https://example.com');
 for(const action of ['credentialGet','credentialSet','credentialDelete'])await assert.rejects(services.request('access',action,{key:'schedule:test',value:{}}),/Trusted access actor/);
 for(const action of ['setScheduleCredential','clearScheduleCredential'])assert.throws(()=>validateFeatureRequest('personalization',action,{}, {browser:true}));
 assert.equal((await services.request('personalization','clearScheduleCredential',{id:'test',source})).deleted,true);assert.equal(await services.credentials.get('schedule:test'),null);assert.equal(calls,3);await services.close();
});
test('protected compare-and-set serializes contenders and snapshots caller values',async t=>{
 const directory=await fixture(t),store=createCredentialStore({directory,safeStorage});const next={revision:1};const first=store.compareAndSet('authenticator:cas',null,next);next.revision=99;const second=store.compareAndSet('authenticator:cas',null,{revision:2});assert.deepEqual(await Promise.all([first,second]),[true,false]);assert.deepEqual(await store.get('authenticator:cas'),{revision:1});await store.set('authenticator:cas',{revision:3});assert.equal(await store.compareAndSet('authenticator:cas',{revision:1},null),false);assert.equal(await store.compareAndSet('authenticator:cas',{revision:3},null),true);assert.equal(await store.get('authenticator:cas'),null);
});
test('protected compare-and-set reports storage failure without changing committed value',async t=>{
 const directory=await fixture(t),store=createCredentialStore({directory,safeStorage});await store.set('authenticator:cas',{revision:1});const original=fs.rename;try{fs.rename=async()=>{throw Object.assign(new Error('synthetic atomic write failure'),{code:'EACCES'});};await assert.rejects(store.compareAndSet('authenticator:cas',{revision:1},{revision:2}),/atomic write failure/);}finally{fs.rename=original;}const reload=createCredentialStore({directory,safeStorage});assert.deepEqual(await reload.get('authenticator:cas'),{revision:1});assert.equal(await store.compareAndSet('authenticator:cas',{revision:1},{revision:3}),true);assert.deepEqual(await store.get('authenticator:cas'),{revision:3});assert.deepEqual((await fs.readdir(directory)).filter(name=>name.endsWith('.tmp')),[]);
});
test('protected revisions catch ABA across every writer and survive deletion/reload',async t=>{
 const directory=await fixture(t),store=createCredentialStore({directory,safeStorage});assert.deepEqual(await store.readVersioned('authenticator:aba'),{value:null,revision:null});const own=await store.compareAndSetVersioned('authenticator:aba',null,{v:'R'});assert.equal(own.updated,true);await store.set('authenticator:aba',{v:'X'});await store.compareAndSet('authenticator:aba',{v:'X'},{v:'R'});assert.equal((await store.compareAndSetVersioned('authenticator:aba',own.revision,{v:'O'})).updated,false);const beforeDelete=await store.readVersioned('authenticator:aba');await store.delete('authenticator:aba');const deleted=await createCredentialStore({directory,safeStorage}).readVersioned('authenticator:aba');assert.equal(deleted.value,null);assert.notEqual(deleted.revision,beforeDelete.revision);assert.equal((await store.compareAndSetVersioned('authenticator:aba',null,{v:'stale'})).updated,false);await store.set('authenticator:aba',null);assert.notEqual((await store.readVersioned('authenticator:aba')).revision,deleted.revision);
});
test('versioned protected write failure does not advance its durable receipt',async t=>{const directory=await fixture(t),store=createCredentialStore({directory,safeStorage});await store.set('authenticator:revision',{v:1});const before=await store.readVersioned('authenticator:revision'),original=fs.rename;try{fs.rename=async()=>{throw Error('synthetic protected write failure');};await assert.rejects(store.compareAndSetVersioned('authenticator:revision',before.revision,{v:2}),/protected write failure/);}finally{fs.rename=original;}assert.deepEqual(await createCredentialStore({directory,safeStorage}).readVersioned('authenticator:revision'),before);const same=await store.compareAndSetVersioned('authenticator:revision',before.revision,{v:1});assert.equal(same.updated,true);assert.notEqual(same.revision,before.revision);});
test('protected store capacity fails before replacing a readable committed store',async t=>{const directory=await fixture(t),store=createCredentialStore({directory,safeStorage});let rejected=false;for(let n=0;n<20;n++){try{await store.set('profile:capacity'+n,'x'.repeat(260000));}catch(error){assert.match(error.message,/store exceeds its limit/);rejected=true;break;}}assert.equal(rejected,true);const filename=path.join(directory,'protected-records.json');assert.ok((await fs.stat(filename)).size<=4*1024*1024);assert.equal((await createCredentialStore({directory,safeStorage}).get('profile:capacity0')).length,260000);});
test('renderer cannot access the product-owned forge credential namespace',async t=>{const directory=await fixture(t),services=createFeatureServices({dataDirectory:directory,applicationRoot:directory,safeStorage,getMainFrame:()=>null,dialog:{},getWindow:()=>null,openPath:async()=>{}});try{for(const action of ['credentialGet','credentialSet','credentialDelete'])await assert.rejects(services.request('access',action,{key:'forge-account:github.com:alice',value:{}}),/Trusted access actor/);await assert.rejects(services.request('access','credentialList',{prefix:'forge-account:'}),/Trusted access actor/);}finally{await services.close();}});


test('native access dispatch binds only opaque transport context and keeps native records reserved',async t=>{
 const directory=await fixture(t),frame={},services=createFeatureServices({dataDirectory:directory,applicationRoot:directory,safeStorage,getMainFrame:()=>null,dialog:{},getWindow:()=>null,getMainFrame:()=>frame,openPath:async()=>{}});
 try{
  await services.credentials.set('element-lock:synthetic',{synthetic:true});
  assert.deepEqual(await services.request('access','credentialGet',{key:'element-lock:synthetic'},{senderFrame:frame}),{synthetic:true});
  for(const context of [undefined,{}, {senderFrame:{}}, {senderFrame:{...frame}}])await assert.rejects(services.request('access','credentialGet',{key:'element-lock:synthetic'},context),/Trusted access actor/);
  await assert.rejects(services.request('access','credentialGet',{key:'element-lock:synthetic',senderFrame:frame},{senderFrame:frame}),/Unsupported protected record payload/);
  await assert.rejects(services.request('access','credentialGet',{key:'forge-account:github.com:alice'},{senderFrame:frame}),/reserved/);
  await services.cancelAll();assert.deepEqual(await services.request('access','credentialGet',{key:'element-lock:synthetic'},{senderFrame:frame}),{synthetic:true});
 }finally{await services.close();}
 await assert.rejects(services.request('access','credentialGet',{key:'element-lock:synthetic'},{senderFrame:frame}),/closing/);
});

test('access host validation rejects browser admission and nested extra metadata',()=>{
 assert.equal(validateFeatureRequest('access','waitChallenge',{target:'profile'}).action,'waitChallenge');
 for(const payload of [{target:'profile',actor:'forged'},Object.assign(Object.create({target:'profile'}),{}),{target:'profile',[Symbol('extra')]:true}])assert.throws(()=>validateFeatureRequest('access','waitChallenge',payload));
 assert.throws(()=>validateFeatureRequest('access','waitChallenge',{target:'profile'},{browser:true}));
 assert.throws(()=>validateFeatureRequest('access','localVerify',{target:'profile',credentials:{password:'synthetic',[Symbol('extra')]:true}}));
 assert.throws(()=>validateFeatureRequest('access','localVerify',{target:'profile',credentials:Object.assign(Object.create({pin:'synthetic'}),{password:'synthetic'})}));
 assert.throws(()=>validateFeatureRequest('access','waitAnswer',{target:'profile',nonce:'x',answer:[{cell:0,time:1,actor:'forged'}]}));
 const decorated=Object.assign([1],{actor:'forged'}),inherited=[1];Object.setPrototypeOf(inherited,Object.create(Array.prototype));
 for(const answer of [decorated,inherited,Array(10),[1,,3]])assert.throws(()=>validateFeatureRequest('access','waitAnswer',{target:'profile',nonce:'x',answer}));
 let calls=0;const accessor=[1];Object.defineProperty(accessor,'0',{get(){calls++;return 1;},enumerable:true});assert.throws(()=>validateFeatureRequest('access','waitAnswer',{target:'profile',nonce:'x',answer:accessor}));assert.equal(calls,0);
 assert.throws(()=>validateFeatureRequest('access','displayNameSet',{value:'x'.repeat(161)}));
});


test('desktop access validation admits the independent required action inventory only with exact payloads',()=>{
 const id='12345678-1234-1234-1234-123456789012';
 const required={displayNameSet:{value:'Synthetic'},displayNameRead:{},localVerify:{target:'profile',credentials:{password:'synthetic'}},waitChallenge:{target:'profile'},waitStatus:{target:'profile'},waitAnswer:{target:'profile',nonce:'synthetic',answer:1},waitCancel:{target:'profile'},historySetup:{password:'synthetic'},historyUnlock:{password:'synthetic'},historyLock:{},historyStatus:{},historyList:{},historyExport:{},historyDiff:{first:id,second:id},historyRestore:{id},historyLabel:{id,label:'Synthetic'},historyRetention:{days:1},historyPrune:{}};
 for(const [action,payload]of Object.entries(required)){assert.equal(validateFeatureRequest('access',action,payload).action,action);assert.throws(()=>validateFeatureRequest('access',action,{...payload,actor:'forged'}));assert.throws(()=>validateFeatureRequest('access',action,payload,{browser:true}));}
 assert.throws(()=>validateFeatureRequest('access','execute',{}));
});
