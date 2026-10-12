import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {JAVA_RUNTIME_MANIFEST as manifest,runtimeCandidate,downloadPinnedJava} from '../src/main/server-java-runtime.js';
test('pinned runtime inventory covers the complete archive and refuses unreviewed major or architecture',()=>{assert.equal(manifest.files.length,315);assert.equal(manifest.directories.length,62);assert.equal(manifest.files.reduce((sum,row)=>sum+row.bytes,0),manifest.expandedBytes);assert.equal(new Set([...manifest.files.map(row=>row.path),...manifest.directories].map(value=>value.toLowerCase())).size,377);assert.ok(manifest.files.some(row=>row.path==='bin/java.exe'));assert.ok(manifest.files.some(row=>row.path==='bin/server/jvm.dll'));for(const row of manifest.files){assert.match(row.sha256,/^[a-f0-9]{64}$/);assert.doesNotMatch(row.path,/(^|\/)\.\.(\/|$)|[:\\]/);}assert.equal(runtimeCandidate(21,'x64').available,true);for(const [major,arch]of[[17,'x64'],[21,'arm64'],[null,'x64']])assert.equal(runtimeCandidate(major,arch).available,false);});
test('runtime transfer rejects capacity, redirects, oversized bodies and hash mismatch without publication',async t=>{
 const parent=path.resolve('out/runtime-transfer-fixtures');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'owned-'));const run=options=>downloadPinnedJava({baseRoot:root,operationId:randomUUID(),capacity:async()=>1024n*1024n*1024n,...options});
 let calls=0;await assert.rejects(run({capacity:async()=>0n,fetchImpl:async()=>{calls++;}}),/capacity/);assert.equal(calls,0);
 await assert.rejects(run({fetchImpl:async()=>new Response(null,{status:302,headers:{location:'http://untrusted.test/archive'}})}),/redirect/);
 await assert.rejects(run({fetchImpl:async()=>new Response('wrong',{headers:{'content-length':'5'}})}),/size/);
 await assert.rejects(run({fetchImpl:async()=>new Response('wrong')}),/integrity/);
 for(const directory of await fs.readdir(root)){const files=await fs.readdir(path.join(root,directory));assert.equal(files.includes('archive.zip'),false);}
});
test('runtime cancellation retains incomplete owned staging and never publishes an archive',async()=>{
 const parent=path.resolve('out/runtime-transfer-fixtures');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'owned-')),id=randomUUID(),controller=new AbortController();
 await assert.rejects(downloadPinnedJava({baseRoot:root,operationId:id,capacity:async()=>1024n*1024n*1024n,signal:controller.signal,fetchImpl:async()=>new Response(new ReadableStream({start(stream){stream.enqueue(new Uint8Array([1,2]));stream.close();}})),onProgress:()=>controller.abort()}));await assert.rejects(fs.access(path.join(root,'runtime-'+id,'archive.zip')));assert.equal((await fs.stat(path.join(root,'runtime-'+id,'archive.partial'))).size,2);
});
