import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable,PassThrough} from 'node:stream';
import {createWorkflowServices,isPublicAddress,hashEditorFile} from '../src/main/workflow-services.js';
async function fixture(options={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'workflow-test-')),choices=[];
 const service=createWorkflowServices({dataDirectory:root,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[choices.shift()]}),showSaveDialog:async()=>({canceled:false,filePath:choices.shift()})},...options});
 return{root,choices,service,async close(){await service.close();await fs.rm(root,{recursive:true,force:true});}};
}
test('opaque document grants preserve newer disk text and enforce UTF-8 bounds',async()=>{
 const f=await fixture();try{const file=path.join(f.root,'notes.txt');await fs.writeFile(file,'first');f.choices.push(file);const grant=await f.service.dispatch('pickDocument');const original=await f.service.dispatch('readDocument',{id:grant.id});
 await assert.rejects(f.service.dispatch('readDocument',{id:file}),/Select the file/);
 await fs.writeFile(file,'newer');await assert.rejects(f.service.dispatch('saveDocument',{id:grant.id,text:'stale',revision:original.revision}),/changed/);assert.equal(await fs.readFile(file,'utf8'),'newer');
 const current=await f.service.dispatch('readDocument',{id:grant.id});await f.service.dispatch('saveDocument',{id:grant.id,text:'saved',revision:current.revision});assert.equal(await fs.readFile(file,'utf8'),'saved');
 await assert.rejects(f.service.dispatch('saveDocument',{id:grant.id,text:'字'.repeat(100000),revision:current.revision}),/256 KiB/);assert.equal(await fs.readFile(file,'utf8'),'saved');
 }finally{await f.close();}
});
test('new document creation never overwrites an existing destination',async()=>{
 const f=await fixture();try{const file=path.join(f.root,'existing.txt');await fs.writeFile(file,'retain');f.choices.push(file);await assert.rejects(f.service.dispatch('createDocument',{name:'existing.txt',text:'replace'}),/changed/);assert.equal(await fs.readFile(file,'utf8'),'retain');assert.deepEqual((await fs.readdir(f.root)).filter(name=>name.endsWith('.tmp')),[]);}finally{await f.close();}
});
test('download rejects private redirect DNS and preserves existing output',async()=>{
 let requested=0;const f=await fixture({lookup:async host=>[{address:host==='public.example'?'93.184.216.34':'127.0.0.1',family:4}],request:async()=>{requested++;const stream=Readable.from([]);stream.statusCode=302;stream.headers={location:'https://private.example/file'};return stream;}});
 try{const file=path.join(f.root,'download.bin');f.choices.push(file);const item=await f.service.dispatch('prepareDownload',{url:'https://public.example/file'});await f.service.dispatch('startDownload',{id:item.id});await f.service.close();const list=await fs.readdir(f.root);assert.ok(!list.includes('download.bin'));assert.equal(requested,1);}finally{await f.close();}
});
test('single download writes atomically and reports actual bytes',async()=>{
 const events=[];const f=await fixture({emit:(_feature,event)=>events.push(event),lookup:async()=>[{address:'93.184.216.34',family:4}],request:async()=>{const stream=Readable.from([Buffer.from('payload')]);stream.statusCode=200;stream.headers={'content-length':'7'};return stream;}});
 try{const file=path.join(f.root,'download.bin');f.choices.push(file);const item=await f.service.dispatch('prepareDownload',{url:'https://public.example/file'});await f.service.dispatch('startDownload',{id:item.id});while(f.service.pending)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(await fs.readFile(file,'utf8'),'payload');assert.equal(events.at(-1).item.state,'completed');assert.equal(events.at(-1).item.received,7);}finally{await f.close();}
});
test('active download can be cancelled and rejects a competing start',async()=>{
 const events=[];const f=await fixture({emit:(_feature,event)=>events.push(event),lookup:async()=>[{address:'93.184.216.34',family:4}],request:async(_url,{signal})=>{const stream=new PassThrough();stream.statusCode=200;stream.headers={};signal.addEventListener('abort',()=>stream.destroy(new Error('cancelled')));return stream;}});
 try{f.choices.push(path.join(f.root,'one.bin'),path.join(f.root,'two.bin'));const one=await f.service.dispatch('prepareDownload',{url:'https://public.example/one'}),two=await f.service.dispatch('prepareDownload',{url:'https://public.example/two'});await f.service.dispatch('startDownload',{id:one.id});await assert.rejects(f.service.dispatch('startDownload',{id:two.id}),/Another download/);await f.service.dispatch('cancelDownload',{id:one.id});await f.service.close();assert.ok(events.some(event=>event.item.state==='cancelled'));assert.deepEqual((await fs.readdir(f.root)).filter(name=>name.endsWith('.tmp')),[]);}finally{await f.close();}
});
test('network and action allowlists reject unsafe destinations and unknown operations',async()=>{
 for(const value of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.1.1','::1','::ffff:127.0.0.1','fd00::1','2001:db8::1','64:ff9b::7f00:1','2002:7f00:1::1','2001:0:1234::1'])assert.equal(isPublicAddress(value),false,value);
 assert.equal(isPublicAddress('93.184.216.34'),true);assert.equal(isPublicAddress('2606:4700:4700::1111'),true);const f=await fixture();try{await assert.rejects(f.service.dispatch('execute',{command:'anything'}),/Unsupported/);await assert.rejects(f.service.dispatch('prepareDownload',{url:'http://public.example/file'}),/HTTPS/);}finally{await f.close();}
});
test('forge preparation is local and cannot invoke publishing',async()=>{
 const f=await fixture({forgeAccounts:async()=>[{id:'account',label:'Account'}],forgeOwners:async()=>[{id:'owner',label:'Owner',canFork:false}]});try{const file=path.join(f.root,'project.txt');await fs.writeFile(file,'content');f.choices.push(file);const document=await f.service.dispatch('pickDocument');await assert.rejects(f.service.dispatch('prepareHandoff',{documentId:document.id,accountId:'account',ownerId:'owner',route:'fork'}),/available/);const result=await f.service.dispatch('prepareHandoff',{documentId:document.id,accountId:'account',ownerId:'owner',route:'copy-push'});assert.match(result.summary,/Never force-push/);assert.ok(!f.service.actions.includes('publish'));}finally{await f.close();}
});

test('editor opening uses a signed, unchanged executable and fixed argument list',async()=>{
 const launches=[];const {EventEmitter}=await import('node:events');const f=await fixture({env:{},signatureInspector:async()=>({valid:true,publisher:'CN=Microsoft Corporation, O=Microsoft Corporation, C=US'}),spawnEditor:(file,args,options)=>{launches.push({file,args,options});const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}});
 try{const editor=path.join(f.root,'Code.exe'),document=path.join(f.root,'notes.txt');await fs.writeFile(editor,'signed test');await fs.writeFile(document,'notes');f.choices.push(editor,document);const e=await f.service.dispatch('pickEditor'),d=await f.service.dispatch('pickDocument');await f.service.dispatch('openEditor',{editorId:e.id,documentId:d.id});assert.deepEqual(launches[0].args,[document]);assert.equal(launches[0].options.shell,false);await fs.writeFile(editor,'changed');await assert.rejects(f.service.dispatch('openEditor',{editorId:e.id,documentId:d.id}),/changed/);assert.equal(launches.length,1);}finally{await f.close();}
});

test('close cancels a pending DNS lookup without waiting for it to resolve',async()=>{
 const f=await fixture({lookup:()=>new Promise(()=>{})});try{f.choices.push(path.join(f.root,'pending.bin'));const item=await f.service.dispatch('prepareDownload',{url:'https://public.example/file'});await f.service.dispatch('startDownload',{id:item.id});await f.service.close();assert.equal(f.service.pending,0);}finally{await f.close();}
});

test('IPv6 policy is identical for compressed, expanded, uppercase and padded addresses',()=>{
 for(const values of [
  ['2001:db8::1','2001:0db8::1','2001:0DB8:0000:0000:0000:0000:0000:0001'],
  ['2001:0:1234::1','2001:0000:1234::1','2001:0000:1234:0000:0000:0000:0000:0001'],
  ['2001:20::1','2001:0020::1','2001:0020:0000:0000:0000:0000:0000:0001'],
  ['2002:7f00:1::1','2002:7F00:0001:0000:0000:0000:0000:0001']
 ])for(const value of values)assert.equal(isPublicAddress(value),false,value);
 for(const value of ['2606:4700:4700::1111','2606:4700:4700:0000:0000:0000:0000:1111'])assert.equal(isPublicAddress(value),true,value);
});
test('editor hashing uses bounded reads and detects a mutation during hashing',async()=>{
 const f=await fixture();const originalOpen=fs.open;try{
  const target=path.join(f.root,'Code.exe');await fs.writeFile(target,Buffer.alloc(200000,42));let largest=0;
  fs.open=async(...args)=>{const handle=await originalOpen(...args),read=handle.read.bind(handle);handle.read=async(buffer,...rest)=>{largest=Math.max(largest,buffer.length);return read(buffer,...rest);};return handle;};
  assert.match(await hashEditorFile(target),/^[a-f0-9]{64}$/);assert.equal(largest,65536);
  fs.open=async(...args)=>{const handle=await originalOpen(...args),read=handle.read.bind(handle);let changed=false;handle.read=async(...readArgs)=>{const result=await read(...readArgs);if(!changed){changed=true;await fs.appendFile(target,'changed');}return result;};return handle;};
  await assert.rejects(hashEditorFile(target),/changed/);
 }finally{fs.open=originalOpen;await f.close();}
});
