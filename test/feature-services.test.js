import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCredentialStore, createFeatureServices, readConverterManifest } from '../src/main/feature-services.js';
import { validateFeatureRequest, validateRequest } from '../src/main/validation.js';
const safeStorage={isEncryptionAvailable:()=>true,encryptString:text=>Buffer.from(text),decryptString:value=>value.toString()};
async function fixture(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'feature-services-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}
test('converter manifests support Windows UTF-8 output without accepting malformed JSON',async t=>{
 const directory=await fixture(t),filename=path.join(directory,'manifest.json');
 const manifest={schemaVersion:1,launcherSha256:'a'.repeat(64),runtimeSha256:'b'.repeat(64),launcherCompanionHashes:{}};
 for(const prefix of ['','\uFEFF']){await fs.writeFile(filename,prefix+JSON.stringify(manifest),'utf8');assert.deepEqual(await readConverterManifest(filename),manifest);}
 await fs.writeFile(filename,'\uFEFF{"schemaVersion":');await assert.rejects(readConverterManifest(filename),SyntaxError);
});
test('protected record operations serialize, reload and reject unsupported keys',async t=>{const directory=await fixture(t);const store=createCredentialStore({directory,safeStorage});await Promise.all([store.set('local-profile:v1',{version:2}),store.set('element-lock:test',{policy:'pin'}),store.set('history:verifier',{version:2})]);assert.deepEqual(await store.get('local-profile:v1'),{version:2});assert.equal((await store.list('element-lock:')).length,1);await store.delete('history:verifier');assert.equal(await store.get('history:verifier'),null);assert.throws(()=>store.set('../escape',{}));assert.throws(()=>store.set('profile:unsafe',JSON.parse('{"__proto__":{"x":true}}')));});
test('protected storage refuses plaintext fallback',async t=>{const directory=await fixture(t);const store=createCredentialStore({directory,safeStorage:{isEncryptionAvailable:()=>false}});await assert.rejects(store.get('local-profile:v1'));assert.throws(()=>store.set('local-profile:v1',{}));assert.deepEqual(await fs.readdir(directory),[]);});
test('shared mode requires existing credentials to change an active record',async t=>{const directory=await fixture(t);const services=createFeatureServices({dataDirectory:directory,applicationRoot:directory,safeStorage,dialog:{},getWindow:()=>null,openPath:async()=>{}});await services.request('personalization','setSharedCredential',{password:'synthetic credential'});await services.request('personalization','sharedWrite',{value:{enabled:true,name:'School'}});await assert.rejects(services.request('personalization','sharedWrite',{value:{enabled:false}}));await assert.rejects(services.request('personalization','setSharedCredential',{password:'replacement'}));assert.equal(await services.request('personalization','verifySharedCredential',{password:'wrong'}),false);assert.equal(await services.request('personalization','verifySharedCredential',{password:'synthetic credential'}),true);await services.request('personalization','sharedWrite',{value:{enabled:false}});await assert.rejects(services.request('personalization','sharedWrite',{value:{vocabulary:{}}}));await services.close();});
test('feature dispatch refuses arbitrary methods and structured oversized input',async t=>{const directory=await fixture(t);const services=createFeatureServices({dataDirectory:directory,applicationRoot:directory,safeStorage,dialog:{},getWindow:()=>null,openPath:async()=>{}});await assert.rejects(services.request('arbitrary','exec',{}));await assert.rejects(services.request('converter','exec',{}));await assert.rejects(services.request('access','credentialSet',{key:'profile:x',value:'x'.repeat(300000)}));await services.close();await assert.rejects(services.request('status','status',{}));});

test('renderer credentials cannot create or read native file grants or shared credentials',async t=>{
 const directory=await fixture(t);const services=createFeatureServices({dataDirectory:directory,applicationRoot:directory,safeStorage,dialog:{},getWindow:()=>null,openPath:async()=>{}});
 for(const key of ['grant:12345678-1234-1234-1234-123456789012','shared:mode'])for(const action of ['credentialSet','credentialGet','credentialDelete'])await assert.rejects(services.request('access',action,{key,value:{filename:'synthetic'}}),/reserved/);
 await assert.rejects(services.request('access','credentialList',{prefix:'grant:'}),/reserved/);
 const key='element-lock:id:view-settings/section:3/button:2';await services.request('access','credentialSet',{key,value:{policy:'pin'}});assert.equal((await services.request('access','credentialGet',{key})).policy,'pin');await services.close();
});

test('shutdown counts pending native pickers and stops new admissions',async t=>{
 const directory=await fixture(t);let release;const shown=new Promise(resolve=>{release=resolve;});
 const services=createFeatureServices({dataDirectory:directory,applicationRoot:directory,safeStorage,dialog:{showOpenDialog:()=>shown},getWindow:()=>null,openPath:async()=>{}});
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
 const services=createFeatureServices({dataDirectory:directory,applicationRoot:directory,safeStorage,dialog:{showOpenDialog:()=>selecting},getWindow:()=>null,openPath:async()=>{}});
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
 const services=createFeatureServices({dataDirectory:directory,applicationRoot:directory,safeStorage,dialog:{showMessageBox:async()=>{calls++;return {response:approve?1:0};}},getWindow:()=>null,openPath:async()=>{}});
 const source={type:'home-assistant',url:'https://example.com',entity:'input_boolean.work'};
 assert.deepEqual(await services.request('personalization','setScheduleCredential',{id:'test',source,token:'synthetic-value'}),{cancelled:true});
 assert.equal(await services.credentials.get('schedule:test'),null);
 approve=true;assert.equal((await services.request('personalization','setScheduleCredential',{id:'test',source,token:'synthetic-value'})).stored,true);
 assert.equal((await services.credentials.get('schedule:test')).origin,'https://example.com');
 for(const action of ['credentialGet','credentialSet','credentialDelete'])await assert.rejects(services.request('access',action,{key:'schedule:test',value:{}}),/reserved/);
 for(const action of ['setScheduleCredential','clearScheduleCredential'])assert.throws(()=>validateFeatureRequest('personalization',action,{}, {browser:true}));
 assert.equal((await services.request('personalization','clearScheduleCredential',{id:'test',source})).deleted,true);assert.equal(await services.credentials.get('schedule:test'),null);assert.equal(calls,3);await services.close();
});
