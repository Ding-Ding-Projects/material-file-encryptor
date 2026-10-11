import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseVocabulary,serializeVocabulary,emptyVocabulary} from '../docs/site/personal-vocabulary.js';
const source=await readFile(new URL('../docs/site/site.js',import.meta.url),'utf8');
const production=source.slice(source.indexOf('let privateCacheAccess ='),source.indexOf('let vocabularyState =')).replace('export async function','async function');
function fixture(){const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};const make=Function('siteStorage','parseVocabulary','serializeVocabulary','emptyVocabulary','globalThis',`let vocabulary=emptyVocabulary(),vocabularyState={kind:'default'},schoolEnabled=false;const renderCopy=()=>{};${production};return {authenticate:setAuthenticatedLocalSession,replace:replacePrivateVocabulary,state:()=>({vocabulary,vocabularyState,privateWordingAvailable}),key:vocabularyStorageKey};`.replace('let vocabulary=emptyVocabulary(),','let privateWordingAvailable=false;let vocabulary=emptyVocabulary(),'));return{values,storage,controller:make(storage,parseVocabulary,serializeVocabulary,emptyVocabulary,{navigator:{locks:{request:async(name,run)=>{assert.equal(name,'material-file-encryptor.visitor.access.write');return run();}}}})};}
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
