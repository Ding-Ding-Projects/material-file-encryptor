import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createStartupPhotoService,readRuntimeAccessibility,PHOTO_SOURCE} from '../src/main/startup-photo-service.js';
import {validateFeatureRequest} from '../src/main/validation.js';
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lksAAAAASUVORK5CYII=','base64');
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture({asset={},release={},body=image,decode={width:1,height:1}}={}){
 const calls=[];const metadata={id:1,name:'sample.png',size:image.length,state:'uploaded',digest:`sha256:${hash(image)}`,browser_download_url:'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/sample.png',...asset};
 const run=async(args,options)=>{calls.push({args,options});const endpoint=args[1];let value;if(endpoint.endsWith('/commits/main'))value={sha:'a'.repeat(40)};else if(endpoint.includes('/contents/'))value={dishes:[{name:{en:'Synthetic dish',zhHant:'合成測試'},image:{path:'images/sample.png'}}]};else if(endpoint.includes('/releases?'))value=[{tag_name:'catalog-v1',draft:false,prerelease:false,assets:[metadata],...release}];else if(endpoint.endsWith('/assets/1'))return body;else throw Error('Unexpected source');return Buffer.from(JSON.stringify(value));};
 return{calls,run,inspectImage:async()=>decode,random:()=>0};
}
test('resolver returns one digest-verified bounded image from the pinned authoritative catalog and release',async()=>{
 const f=fixture(),service=createStartupPhotoService(f);const result=await service.resolvePublishedDish();assert.equal(result.published,true);assert.deepEqual(result.name,{en:'Synthetic dish',zhHant:'合成測試'});assert.equal(result.imageDataUrl,`data:image/png;base64,${image.toString('base64')}`);assert.equal(f.calls.length,4);assert.match(f.calls[1].args[1],/ref=a{40}$/);assert.ok(f.calls.every(c=>c.options.maxBuffer<=16*1024*1024));assert.equal(await service.resolvePublishedDish(),result);assert.equal(f.calls.length,4);service.close();assert.equal(await service.resolvePublishedDish(),null);
});
test('unpublished, redirected, malformed and oversized metadata cannot yield a photo',async()=>{
 for(const options of [{release:{draft:true}},{release:{prerelease:true}},{release:{tag_name:'images-v1'}},{asset:{browser_download_url:'https://other.example/image.png'}},{asset:{size:4*1024*1024+1}},{asset:{digest:null}},{asset:{name:'../sample.png'}},{asset:{state:'new'}}]){const f=fixture(options);assert.equal(await createStartupPhotoService(f).resolvePublishedDish(),null);assert.equal(f.calls.some(c=>c.args[1].includes('/assets/')),false);}
});
test('digest mismatch, decode mismatch, hostile dimension and offline responses are omitted',async()=>{
 for(const options of [{body:Buffer.alloc(image.length)},{decode:null},{decode:{width:2,height:1}}])assert.equal(await createStartupPhotoService(fixture(options)).resolvePublishedDish(),null);
 const large=Buffer.from(image);large.writeUInt32BE(100000,16);assert.equal(await createStartupPhotoService(fixture({body:large,asset:{digest:`sha256:${hash(large)}`}})).resolvePublishedDish(),null);
 assert.equal(await createStartupPhotoService({run:async()=>{throw Error('offline');}}).resolvePublishedDish(),null);
});
test('private cache records source revision digest and bounds and skips only the matching image transfer',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'startup-photo-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const f=fixture();await createStartupPhotoService({...f,dataDirectory:directory}).resolvePublishedDish();const receipt=JSON.parse(await fs.readFile(path.join(directory,'startup-photo-cache','receipt.json'),'utf8'));assert.equal(receipt.source,PHOTO_SOURCE);assert.equal(receipt.revision,'a'.repeat(40));assert.equal(receipt.sha256,hash(image));assert.equal(receipt.width,1);assert.equal(receipt.bytes,image.length);
 const next=fixture();await createStartupPhotoService({...next,dataDirectory:directory}).resolvePublishedDish();assert.equal(next.calls.length,3);
 const offline=createStartupPhotoService({dataDirectory:directory,run:async()=>{throw Error('offline');}});assert.equal(await offline.resolvePublishedDish(),null);
});
test('close aborts owned transport and invalidates late results',async()=>{
 let finish,signal;const service=createStartupPhotoService({run:(_args,options)=>{signal=options.signal;return new Promise(resolve=>{finish=resolve;});}});const pending=service.resolvePublishedDish();service.close();assert.equal(signal.aborted,true);finish(Buffer.from('{}'));assert.equal(await pending,null);
});
test('accessibility state reflects only the actual runtime boolean and read-only requests reject payloads and browser callers',()=>{
 assert.deepEqual(readRuntimeAccessibility({accessibilitySupportEnabled:false}),{known:true,enabled:false,source:'runtime'});assert.deepEqual(readRuntimeAccessibility({accessibilitySupportEnabled:true}),{known:true,enabled:true,source:'runtime'});assert.equal(readRuntimeAccessibility({}).known,false);assert.equal(readRuntimeAccessibility({get accessibilitySupportEnabled(){throw Error('unavailable');}}).known,false);
 for(const [feature,action]of [['surprise','resolvePublishedDish'],['personalization','accessibilityState']]){assert.doesNotThrow(()=>validateFeatureRequest(feature,action,{}));assert.throws(()=>validateFeatureRequest(feature,action,{url:'https://other.example'}));assert.throws(()=>validateFeatureRequest(feature,action,{}, {browser:true}));}
});


test('default transport uses the digest-verified bundled CLI and never host PATH',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'startup-tools-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const ghBytes=Buffer.from('synthetic gh executable'),gitBytes=Buffer.from('synthetic git executable');
 await fs.mkdir(path.join(directory,'gh','bin'),{recursive:true});await fs.mkdir(path.join(directory,'git','cmd'),{recursive:true});
 await fs.writeFile(path.join(directory,'gh/bin/gh.exe'),ghBytes);await fs.writeFile(path.join(directory,'git/cmd/git.exe'),gitBytes);
 await fs.writeFile(path.join(directory,'forge-executables.json'),JSON.stringify({schemaVersion:1,gh:{relativePath:'gh/bin/gh.exe',version:'2.102.0',sha256:hash(ghBytes)},git:{relativePath:'git/cmd/git.exe',version:'2.56.0.windows.2',sha256:hash(gitBytes)}}));
 const f=fixture(),executables=[];
 const options={toolsDirectory:directory,random:()=>0,inspectImage:f.inspectImage,executeFile:async(executable,args,settings)=>{executables.push(executable);assert.equal(settings.windowsHide,true);assert.equal(settings.timeout,15000);assert.equal(settings.encoding,'buffer');return{stdout:await f.run(args,settings)};}};
 assert.equal((await createStartupPhotoService(options).resolvePublishedDish()).published,true);
 assert.equal(executables.length,4);assert.ok(executables.every(value=>value===path.join(directory,'gh/bin/gh.exe')));
 await fs.writeFile(path.join(directory,'gh/bin/gh.exe'),Buffer.from('changed'));
 assert.equal(await createStartupPhotoService(options).resolvePublishedDish(),null);assert.equal(executables.length,4);
});
