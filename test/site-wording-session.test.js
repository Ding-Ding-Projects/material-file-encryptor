import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseVocabulary,serializeVocabulary,emptyVocabulary} from '../docs/site/personal-vocabulary.js';
const source=await readFile(new URL('../docs/site/site.js',import.meta.url),'utf8');
const production=source.slice(source.indexOf('let privateCacheAccess ='),source.indexOf('let vocabularyState =')).replace('export async function','async function');
function lockQueue(){let tail=Promise.resolve();return{request(name,run){assert.equal(name,'material-file-encryptor.visitor.access.write');const task=tail.catch(()=>{}).then(run);tail=task;return task;}};}
function fixture({values=new Map(),locks=lockQueue(),controllerSource=production}={}){
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const make=Function('siteStorage','parseVocabulary','serializeVocabulary','emptyVocabulary','globalThis',`let privateWordingAvailable=false,vocabulary=emptyVocabulary(),vocabularyState={kind:'default'},schoolEnabled=false,renders=0;const renderCopy=()=>{renders++;};${controllerSource};return {authenticate:setAuthenticatedLocalSession,replace:replacePrivateVocabulary,clear:clearPrivateVocabulary,pending:source=>{parseVocabulary(source);pendingVocabularySource=source;},state:()=>({vocabulary,vocabularyState,privateWordingAvailable,pendingVocabularySource,renders}),key:vocabularyStorageKey};`);
 return{values,storage,controller:make(storage,parseVocabulary,serializeVocabulary,emptyVocabulary,{navigator:{locks}})};
}
const payload=JSON.stringify({schemaVersion:1,entries:{folder:'directory'}});
test('public wording cache stores only the authenticated envelope and restores original copy on lock',async()=>{
 const f=fixture();let sealedSource;const access={credentialStore:{assertSession(){}},authenticated:true,async encryptPrivateCache(value,purpose){sealedSource=value;assert.equal(purpose,'public-site-personal-vocabulary');return{version:1,ciphertext:'opaque-value'};}};
 await f.controller.authenticate(true,access);await f.controller.replace(payload);
 assert.equal(parseVocabulary(sealedSource).replacements[0].to,'directory');
 assert.deepEqual(JSON.parse(f.values.get(f.controller.key)),{version:1,ciphertext:'opaque-value'});
 assert.ok(!f.values.get(f.controller.key).includes('directory'));
 access.authenticated=false;await f.controller.authenticate(false,access);assert.deepEqual(f.controller.state().vocabulary,emptyVocabulary());assert.equal(f.controller.state().privateWordingAvailable,false);
});
test('locking during encryption invalidates the write and never caches a stale payload',async()=>{
 const f=fixture();let release,started;const entered=new Promise(resolve=>{started=resolve;});const access={credentialStore:{assertSession(){}},authenticated:true,encryptPrivateCache(){started();return new Promise(resolve=>{release=resolve;});}};
 await f.controller.authenticate(true,access);const pending=f.controller.replace(payload);await entered;access.authenticated=false;await f.controller.authenticate(false,access);release({version:1,ciphertext:'opaque'});await assert.rejects(pending,/Authentication changed/);assert.equal(f.values.has(f.controller.key),false);
});
test('a corrupt authenticated cache never partially applies wording',async()=>{
 const f=fixture();f.values.set(f.controller.key,JSON.stringify({ciphertext:'opaque'}));const access={credentialStore:{assertSession(){}},authenticated:true,async decryptPrivateCache(){return '{invalid';}};await f.controller.authenticate(true,access);assert.deepEqual(f.controller.state().vocabulary,emptyVocabulary());assert.equal(f.controller.state().vocabularyState.kind,'error');
});

test('profile replacement between sealing and persistence rejects an orphan cache write',async()=>{
 const f=fixture();let current=true;const access={authenticated:true,credentialStore:{assertSession(){if(!current)throw Error('Profile changed');}},async encryptPrivateCache(){current=false;return{ciphertext:'opaque'};}};
 await f.controller.authenticate(true,access);await assert.rejects(f.controller.replace(payload),/Profile changed/);assert.equal(f.values.has(f.controller.key),false);assert.deepEqual(f.controller.state().vocabulary,emptyVocabulary());
});

test('pending validated upload reports sealing failure and survives for a successful authentication retry',async()=>{
 const f=fixture();f.controller.pending(payload);let fail=true;const access={authenticated:true,credentialStore:{assertSession(){}},async encryptPrivateCache(){if(fail)throw Error('Synthetic seal failure');return{ciphertext:'opaque'};}};
 await f.controller.authenticate(true,access);assert.equal(f.controller.state().vocabularyState.kind,'error');assert.equal(f.controller.state().pendingVocabularySource,payload);assert.ok(f.controller.state().renders>0);assert.deepEqual(f.controller.state().vocabulary,emptyVocabulary());
 fail=false;await f.controller.authenticate(true,access);assert.equal(f.controller.state().vocabularyState.kind,'success');assert.equal(f.controller.state().pendingVocabularySource,null);assert.equal(f.controller.state().vocabulary.replacements[0].to,'directory');
});
test('another tab clearing during sealing waits for the shared write lock and leaves no recreated cache',async()=>{
 const values=new Map(),locks=lockQueue(),a=fixture({values,locks}),b=fixture({values,locks});let release,started;const entered=new Promise(resolve=>started=resolve);const access={authenticated:true,credentialStore:{assertSession(){}},encryptPrivateCache(){started();return new Promise(resolve=>release=resolve);}};
 await a.controller.authenticate(true,access);const writing=a.controller.replace(payload);await entered;const clearing=b.controller.clear();release({ciphertext:'opaque'});await Promise.all([writing,clearing]);assert.equal(values.has(a.controller.key),false);assert.deepEqual(b.controller.state().vocabulary,emptyVocabulary());assert.equal(b.controller.state().vocabularyState.kind,'default');
});
test('authentication waits for an already requested clear instead of restoring the old cache',async()=>{
 const values=new Map(),locks=lockQueue(),f=fixture({values,locks});let release,entered;const started=new Promise(resolve=>entered=resolve);const held=locks.request('material-file-encryptor.visitor.access.write',()=>{entered();return new Promise(resolve=>release=resolve);});await started;values.set(f.controller.key,JSON.stringify({ciphertext:'old'}));let decrypts=0;const access={authenticated:true,credentialStore:{assertSession(){}},async decryptPrivateCache(){decrypts++;return payload;}};
 const clearing=f.controller.clear(),authenticating=f.controller.authenticate(true,access);release();await Promise.all([held,clearing,authenticating]);assert.equal(decrypts,0);assert.deepEqual(f.controller.state().vocabulary,emptyVocabulary());assert.equal(values.has(f.controller.key),false);
});

test('removing pending-operation ownership reproduces the hidden failure and lost retry verdict',async()=>{
 const damaged=production.replace('ticket=wordingGeneration+1;','');const f=fixture({controllerSource:damaged});f.controller.pending(payload);const access={authenticated:true,credentialStore:{assertSession(){}},async encryptPrivateCache(){throw Error('Synthetic seal failure');}};await f.controller.authenticate(true,access);assert.throws(()=>assert.equal(f.controller.state().vocabularyState.kind,'error'));
});
test('removing clear serialization reproduces the two-tab recreated cache',async()=>{
 const damaged=production.replace("await globalThis.navigator.locks.request('material-file-encryptor.visitor.access.write',()=>siteStorage.removeItem(vocabularyStorageKey));","siteStorage.removeItem(vocabularyStorageKey);");const values=new Map(),locks=lockQueue(),a=fixture({values,locks}),b=fixture({values,locks,controllerSource:damaged});let release,started;const entered=new Promise(resolve=>started=resolve);const access={authenticated:true,credentialStore:{assertSession(){}},encryptPrivateCache(){started();return new Promise(resolve=>release=resolve);}};await a.controller.authenticate(true,access);const writing=a.controller.replace(payload);await entered;await b.controller.clear();release({ciphertext:'opaque'});await writing;assert.throws(()=>assert.equal(values.has(a.controller.key),false));
});

test('a newer successful upload retires an earlier failed pending file',async()=>{
 const f=fixture();f.controller.pending(payload);let fail=true;const access={authenticated:true,credentialStore:{assertSession(){}},async encryptPrivateCache(){if(fail)throw Error('Synthetic seal failure');return{ciphertext:'new'};}};await f.controller.authenticate(true,access);fail=false;await f.controller.replace(JSON.stringify({schemaVersion:1,entries:{folder:'collection'}}));assert.equal(f.controller.state().pendingVocabularySource,null);assert.equal(f.controller.state().vocabulary.replacements[0].to,'collection');
});
