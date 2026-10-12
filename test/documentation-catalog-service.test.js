import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDocumentationCatalogService} from '../src/main/documentation-catalog-service.js';
import {createFeatureServices} from '../src/main/feature-services.js';
const body=JSON.stringify({documents:[{id:'guide',headings:[{text:'Guide'}]}],assets:[{dataUrl:'fixture'}],changelog:[{title:'Release'}]});

test('packaged catalogue is lazy and concurrent catalog/changelog share one immutable load',async()=>{
 let reads=0,release;const service=createDocumentationCatalogService({filename:'trusted',immutable:true,read:()=>{reads++;return new Promise(resolve=>release=resolve);}});
 assert.equal(reads,0);const catalog=service.request('catalog'),changelog=service.request('changelog');assert.equal(reads,1);release(body);
 const value=await catalog;assert.deepEqual(await changelog,value.changelog);assert.strictEqual(await service.request('catalog'),value);assert.equal(reads,1);
 assert.throws(()=>{value.documents[0].headings[0].text='changed';},TypeError);assert.throws(()=>value.assets.push({}),TypeError);assert.throws(()=>{value.changelog[0].title='changed';},TypeError);
 assert.deepEqual(await service.request('catalog'),JSON.parse(body));service.close();await assert.rejects(service.request('catalog'),/closing/);
});
test('read and parse failures do not poison packaged retry',async()=>{
 for(const first of [()=>Promise.reject(Error('read failed')),()=>Promise.resolve('{invalid')]){let reads=0;const service=createDocumentationCatalogService({immutable:true,read:()=>++reads===1?first():Promise.resolve(body)});await assert.rejects(service.request('catalog'));assert.deepEqual(await service.request('catalog'),JSON.parse(body));assert.equal(reads,2);service.close();}
});
test('development reads stay fresh and caller mutations do not affect another request',async()=>{
 let reads=0,current=body;const service=createDocumentationCatalogService({filename:'packaged-looking.asar',read:async()=>{reads++;return current;}});const first=await service.request('catalog');first.documents[0].id='caller-mutated';current=JSON.stringify({documents:[{id:'updated'}],changelog:[]});assert.equal((await service.request('catalog')).documents[0].id,'updated');assert.equal(reads,2);service.close();
});
test('closing during load rejects the result and unsupported actions never read',async()=>{
 let reads=0,release;const service=createDocumentationCatalogService({immutable:true,read:()=>{reads++;return new Promise(resolve=>release=resolve);}});await assert.rejects(service.request('unknown'),/Unsupported/);assert.equal(reads,0);const loading=service.request('catalog');service.close();service.close();release(body);await assert.rejects(loading,/closing/);await assert.rejects(service.request('changelog'),/closing/);assert.equal(reads,1);
});
test('production dispatch preserves exit admission and closes the packaged catalogue',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-documentation-cache-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'src/shared'),{recursive:true});await fs.writeFile(path.join(root,'src/shared/documentation-catalog.json'),body);
 const service=createFeatureServices({dataDirectory:root,applicationRoot:root,isPackaged:true,safeStorage:{isEncryptionAvailable:()=>true,encryptString:text=>Buffer.from(text),decryptString:value=>value.toString()},dialog:{},getWindow:()=>null,getMainFrame:()=>null,openPath:async()=>{}});
 try{const catalog=await service.request('documentation','catalog');assert.ok(Object.isFrozen(catalog.documents[0]));assert.strictEqual(await service.request('documentation','catalog'),catalog);service.beginExit();assert.strictEqual(await service.request('documentation','catalog'),catalog);await assert.rejects(service.request('documentation','changelog'),/waiting for active work/);service.endExit();assert.deepEqual(await service.request('documentation','changelog'),JSON.parse(body).changelog);}finally{await service.close();}await assert.rejects(service.request('documentation','catalog'),/closing/);
 const main=await fs.readFile('src/main/main.js','utf8');assert.match(main,/createFeatureServices\(\{isPackaged:app\.isPackaged,/);
});
