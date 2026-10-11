import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServerManagerHost} from '../src/main/server-manager-host.js';
const bytes=Buffer.from('synthetic dedicated server, never executed');
const metadata=Buffer.from(JSON.stringify({id:'fixture',javaVersion:{majorVersion:21,component:'fixture'},downloads:{server:{url:'https://piston-data.mojang.com/v1/objects/fixture/server.jar',sha1:createHash('sha1').update(bytes).digest('hex'),size:bytes.length}}}));
const manifest=Buffer.from(JSON.stringify({latest:{release:'fixture',snapshot:'fixture'},versions:[{id:'fixture',type:'release',url:'https://piston-meta.mojang.com/v1/packages/fixture.json',sha1:createHash('sha1').update(metadata).digest('hex'),time:'2026-10-11T00:00:00Z',releaseTime:'2026-10-11T00:00:00Z'}]}));
async function fixture(t,options={}){
 const parent=path.resolve('out/server-manager-preparation-fixtures');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'owned-'));const calls=[];
 const metadataBytes=options.metadataBytes||metadata,manifestValue=JSON.parse(manifest);manifestValue.versions[0].sha1=createHash('sha1').update(metadataBytes).digest('hex');const manifestBytes=Buffer.from(JSON.stringify(manifestValue));
 const fetchImpl=async(url,request)=>{calls.push(url);if(url.endsWith('version_manifest_v2.json'))return new Response(manifestBytes);if(url.endsWith('fixture.json'))return options.resolveMetadata?options.resolveMetadata(request):new Response(metadataBytes);if(url.endsWith('server.jar'))return options.download?options.download(request):new Response(bytes);throw Error('Unexpected fixture URL.');};
 const host=createServerManagerHost({dataDirectory:root,fetchImpl,capacity:async()=>1024n*1024n*1024n,...options});t.after(()=>host.close());return{root,host,calls};
}
async function choose(host){const value=await host.dispatch('refreshCatalogue');return host.dispatch('resolveVersion',{catalogueId:value.catalogue.sourceSha256,versionId:'fixture'});}
async function terminal(host){for(let i=0;i<100;i++){if(!host.pending)return host.dispatch('snapshot');await new Promise(resolve=>setTimeout(resolve,2));}throw Error('Synthetic preparation did not settle.');}

test('real preparation consumer verifies bytes and creates eula=false without exposing paths or launching',async t=>{
 const f=await fixture(t),selection=await choose(f.host);assert.equal(selection.preparable,true);const operation=await f.host.dispatch('prepare',{selectionId:selection.selectionId});const result=await terminal(f.host);assert.equal(result.operations[0].status,'prepared');assert.equal(result.operations[0].bytesVerified,true);assert.equal(result.startAvailable,false);assert.equal(result.licenseAcceptanceAvailable,false);assert.doesNotMatch(JSON.stringify(result),/server\.jar|executablePath|baseRoot/);
 const sessions=await fs.readdir(path.join(f.root,'server-manager'));const file=path.join(f.root,'server-manager',sessions[0],operation.serverId,'server');assert.deepEqual(await fs.readFile(path.join(file,'server.jar')),bytes);assert.equal(await fs.readFile(path.join(file,'eula.txt'),'utf8'),'eula=false\n');
 const license=await f.host.dispatch('reviewLicense',{serverId:operation.serverId});assert.equal(license.accepted,false);assert.equal(license.acceptanceAvailable,false);assert.equal(license.url,'https://www.minecraft.net/en-us/eula');await assert.rejects(f.host.dispatch('start',{serverId:operation.serverId}),/Unsupported/);await assert.rejects(f.host.dispatch('acceptLicense',{serverId:operation.serverId,accepted:true}),/Unsupported/);
});
test('renderer URLs, paths, hashes, fabricated and stale identities fail before a distribution transfer',async t=>{
 const f=await fixture(t),selection=await choose(f.host);for(const field of ['url','baseRoot','sha256','runtime','lease','accepted'])await assert.rejects(f.host.dispatch('prepare',{selectionId:selection.selectionId,[field]:'untrusted'}),/Invalid/);await assert.rejects(f.host.dispatch('prepare',{selectionId:'unknown'}),/selection/);await f.host.dispatch('refreshCatalogue');await assert.rejects(f.host.dispatch('prepare',{selectionId:selection.selectionId}),/selection/);assert.equal(f.calls.filter(url=>url.endsWith('server.jar')).length,0);
 await assert.rejects(f.host.dispatch('reviewLicense',{serverId:'not-owned'}),/owned/);
});
test('capacity admission is serial and cancellation before publication creates no server directory',async t=>{
 let release;const f=await fixture(t,{capacity:()=>new Promise(resolve=>release=resolve)}),selection=await choose(f.host);const operation=await f.host.dispatch('prepare',{selectionId:selection.selectionId});while(!release)await new Promise(resolve=>setImmediate(resolve));await assert.rejects(f.host.dispatch('prepare',{selectionId:selection.selectionId}),/already active/);await f.host.dispatch('cancel',{operationId:operation.id});release(1024n*1024n*1024n);const result=await terminal(f.host);assert.equal(result.operations[0].status,'canceled');assert.equal(f.calls.filter(url=>url.endsWith('server.jar')).length,0);
 const sessions=await fs.readdir(path.join(f.root,'server-manager'));await assert.rejects(fs.access(path.join(f.root,'server-manager',sessions[0],operation.serverId)));
});
test('byte mismatch retains a durable failed record and never publishes prepared state',async t=>{
 const f=await fixture(t,{download:async()=>new Response(Buffer.alloc(bytes.length,1))}),selection=await choose(f.host);const operation=await f.host.dispatch('prepare',{selectionId:selection.selectionId});const result=await terminal(f.host);assert.equal(result.operations[0].status,'failed');assert.equal(result.operations[0].bytesVerified,false);assert.equal(result.operations[0].recoveryRequired,true);const sessions=await fs.readdir(path.join(f.root,'server-manager')),base=path.join(f.root,'server-manager',sessions[0]);assert.equal(JSON.parse(await fs.readFile(path.join(base,'operation-'+operation.id+'.json'),'utf8')).status,'failed');await assert.rejects(fs.access(path.join(base,operation.serverId,'server/server.jar')));
});
test('catalogue refresh during asynchronous capacity admission invalidates the captured selection',async t=>{
 let release;const f=await fixture(t,{capacity:()=>new Promise(resolve=>release=resolve)}),selection=await choose(f.host);await f.host.dispatch('prepare',{selectionId:selection.selectionId});while(!release)await new Promise(resolve=>setImmediate(resolve));await f.host.dispatch('refreshCatalogue');release(1024n*1024n*1024n);const result=await terminal(f.host);assert.equal(result.operations[0].status,'failed');assert.equal(f.calls.filter(url=>url.endsWith('server.jar')).length,0);
});
test('insufficient capacity never starts a transfer',async t=>{
 const f=await fixture(t,{capacity:async()=>0n}),selection=await choose(f.host);await f.host.dispatch('prepare',{selectionId:selection.selectionId});const result=await terminal(f.host);assert.equal(result.operations[0].status,'failed');assert.equal(f.calls.filter(url=>url.endsWith('server.jar')).length,0);
});

test('official metadata without a server entry remains explicitly unavailable',async t=>{const f=await fixture(t,{metadataBytes:Buffer.from(JSON.stringify({id:'fixture'}))}),selection=await choose(f.host);assert.equal(selection.state,'unavailable');assert.equal(selection.preparable,false);await assert.rejects(f.host.dispatch('prepare',{selectionId:selection.selectionId}),/selection/);assert.equal(f.calls.filter(url=>url.endsWith('server.jar')).length,0);});
test('closing during a streamed transfer waits for cancellation and retains an incomplete owned record',async t=>{
 let started;const reached=new Promise(resolve=>started=resolve);
 const f=await fixture(t,{download:async({signal})=>new Response(new ReadableStream({start(controller){signal.addEventListener('abort',()=>controller.error(signal.reason),{once:true});controller.enqueue(bytes.subarray(0,4));started();}}))});
 const selection=await choose(f.host),operation=await f.host.dispatch('prepare',{selectionId:selection.selectionId});await reached;await f.host.close();assert.equal(f.host.pending,0);await assert.rejects(f.host.dispatch('snapshot'),/closing/);
 const sessions=await fs.readdir(path.join(f.root,'server-manager')),base=path.join(f.root,'server-manager',sessions[0]);const receipt=JSON.parse(await fs.readFile(path.join(base,'operation-'+operation.id+'.json'),'utf8'));assert.equal(receipt.status,'canceled');assert.equal(receipt.bytesVerified,false);assert.equal(receipt.licenseAccepted,false);assert.equal(receipt.recoveryRequired,true);await assert.rejects(fs.access(path.join(base,operation.serverId,'server/server.jar')));
});
test('metadata admission counts pending and retained selections before invoking the provider',async t=>{
 const waiting=[];let count=0;const f=await fixture(t,{resolveMetadata:({signal})=>{count++;return new Promise((resolve,reject)=>{waiting.push({resolve,reject});signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}});const value=await f.host.dispatch('refreshCatalogue'),payload={catalogueId:value.catalogue.sourceSha256,versionId:'fixture'};
 const flights=Array.from({length:100},()=>f.host.dispatch('resolveVersion',payload));assert.equal(count,100);await assert.rejects(f.host.dispatch('resolveVersion',payload),/pending selections/);assert.equal(count,100);
 waiting[0].reject(Error('Synthetic metadata failure.'));await assert.rejects(flights[0]);const replacement=f.host.dispatch('resolveVersion',payload);assert.equal(count,101);waiting[1].resolve(new Response(metadata));await flights[1];await assert.rejects(f.host.dispatch('resolveVersion',payload),/pending selections/);assert.equal(count,101);
 const observed=Promise.allSettled([...flights.slice(2),replacement]);await f.host.close();assert.ok((await observed).every(row=>row.status==='rejected'));assert.equal(f.host.pending,0);
});
test('a synchronous metadata provider throw releases its reserved slot',async t=>{
 let count=0;const f=await fixture(t,{resolveMetadata:()=>{count++;throw Error('Synthetic provider throw.');}});const value=await f.host.dispatch('refreshCatalogue'),payload={catalogueId:value.catalogue.sourceSha256,versionId:'fixture'};for(let i=0;i<101;i++)await assert.rejects(f.host.dispatch('resolveVersion',payload));assert.equal(count,101);assert.equal(f.host.pending,0);
});
