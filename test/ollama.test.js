import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import {OllamaClient,modelName,options} from '../src/features/ollama/client.js';
import {OfficialCatalog,reconcile} from '../src/features/ollama/catalog.js';
import {assessFit,modelEvidence} from '../src/features/ollama/hardware.js';
import {ProfileManager} from '../src/features/ollama/profiles.js';
import {createOllamaService,redactChat} from '../src/features/ollama/service.js';
const response=value=>new Response(typeof value==='string'?value:JSON.stringify(value));
test('local client fixes endpoint, rejects injected actions and validates parameters',async()=>{
  const calls=[],client=new OllamaClient({fetchImpl:async(url,opts)=>{calls.push([url,opts]);return response({version:'test'});}});
  assert.deepEqual(await client.call('version'),{version:'test'});assert.equal(calls[0][0],'http://127.0.0.1:11434/api/version');assert.equal(calls[0][1].redirect,'error');
  await assert.rejects(client.call('https://attacker.test'));await assert.rejects(client.call('show',{model:'a',url:'https://attacker.test'}));
  for(const bad of ['../a','http://evil','a;shutdown','x:cloud','a b','a\n'])assert.throws(()=>modelName(bad));
  assert.throws(()=>options({temperature:3}));assert.throws(()=>options({num_ctx:1024.5}));assert.throws(()=>options({arbitrary:1}));assert.deepEqual(options({temperature:0,num_ctx:2048}),{temperature:0,num_ctx:2048});
});
test('stream requires terminal completion, reports chunks, rejects malformed and oversized data',async()=>{
  const chunks=[],client=new OllamaClient({fetchImpl:async()=>response('{"message":{"content":"hello"}}\n{"done":true}\n')});await client.call('chat',{model:'a:1',messages:[{role:'user',content:'hi'}]},{onChunk:v=>chunks.push(v)});assert.equal(chunks.length,2);
  await assert.rejects(new OllamaClient({fetchImpl:async()=>response('{"done":false}\n')}).call('generate',{model:'a',prompt:'x'}),/before completion/);
  await assert.rejects(new OllamaClient({fetchImpl:async()=>response('not json')}).call('version'));
  await assert.rejects(new OllamaClient({fetchImpl:async()=>response('x'.repeat(1024*1024+1))}).call('generate',{model:'a',prompt:'x'}),/too large/);
});
test('catalog follows all model and tag pages, retains last complete cache on failure',async()=>{
  const pages={
    'https://ollama.com/library':'<a href="/library/alpha">Alpha</a><a href="/library?page=2">Next</a>',
    'https://ollama.com/library?page=2':'<a href="/library/beta">Beta</a>',
    'https://ollama.com/library/alpha/tags':'<a href="/library/alpha:one">alpha:one 2GB 4K context window</a><a href="/library/alpha/tags?page=2">Next</a>',
    'https://ollama.com/library/alpha/tags?page=2':'<a href="/library/alpha:two">alpha:two 4GB 8K context window</a>',
    'https://ollama.com/library/beta/tags':'<a href="/library/beta:one">beta:one 1GB 2K context window</a>',
  };
  const catalog=new OfficialCatalog({fetchImpl:async u=>response(pages[u]||''),now:()=> '2026-10-10T00:00:00.000Z'});
  const result=await catalog.refresh();assert.equal(result.complete,true);assert.equal(result.pageCount,5);assert.equal(result.familyCount,2);assert.equal(result.variants.length,3);assert.equal(result.variants.find(v=>v.tag==='alpha:two').sizeBytes,4e9);assert.equal(result.revision.length,64);
  const failed=await new OfficialCatalog({fetchImpl:async()=>{throw new Error('offline');}}).refresh(result);assert.equal(failed.stale,true);assert.equal(failed.variants.length,3);assert.equal(failed.lastSuccessfulRefresh,result.lastSuccessfulRefresh);
  delete pages['https://ollama.com/library/beta/tags'];const lost=await catalog.refresh(result);assert.equal(lost.stale,true);assert.equal(lost.variants.length,3);
});
test('installed and running tags remain visible beyond catalog',()=>{const r=reconcile({variants:[{tag:'a:1'}]},[{name:'b:2',size:123}],[{name:'c:3'}]);assert.equal(r.length,3);assert.equal(r.find(v=>v.tag==='b:2').installed,true);assert.equal(r.find(v=>v.tag==='c:3').running,true);});
test('fit verdicts derive from explicit evidence and unknowns remain unknown',()=>{
  const model={sizeBytes:100,parameterCount:'1B',quantization:'Q4',contextLength:2048};const h={freeDiskBytes:1000,availableRamBytes:1000,vramBytes:1000,backendSupported:true};
  assert.equal(assessFit(model,h).verdict,'Unknown');assert.equal(assessFit(model,h,{contextBytes:100,contextLength:2048}).verdict,'Runs well');assert.equal(assessFit(model,{...h,backendSupported:false},{contextBytes:100,contextLength:2048}).verdict,'Runs with limits');assert.equal(assessFit(model,{...h,freeDiskBytes:50}).verdict,'Unlikely');assert.equal(assessFit({tag:'massive-999b'},h).verdict,'Unknown');
});
test('context memory comes from architecture metadata rather than model-name guesses',()=>{
  const metadata={details:{quantization_level:'Q4_K_M'},model_info:{'general.architecture':'llama','general.parameter_count':1e9,'llama.block_count':16,'llama.attention.head_count':8,'llama.attention.head_count_kv':2,'llama.embedding_length':1024,'llama.context_length':8192}};
  const result=modelEvidence({tag:'any-name',sizeBytes:1000},metadata,2048);assert.equal(result.context.contextBytes,4*16*2*128*2048);assert.equal(result.model.parameterCount,1e9);assert.equal(modelEvidence({tag:'llama-8b'}).context.contextBytes,null);
});
test('profile launch uses only verified picker registrations and rolls back failed readiness',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ollama-profile-'));try{let stopped=false;const p=new ProfileManager({verifyExecutable:async()=>true,validateProfile:async p=>p.args.length===1&&p.args[0]==='--version',launcher:async()=>({stop:async()=>{stopped=true;}}),healthCheck:async()=>false});
    await assert.rejects(p.registerPicked({id:'bad',name:'Bad',executable:process.execPath,cwd:dir,args:['x;shutdown']}));
    await assert.rejects(p.registerPicked({id:'bad-code',name:'Bad',executable:process.execPath,cwd:dir,args:['-e','process.exit()']}));
    await p.registerPicked({id:'safe',name:'Safe',executable:process.execPath,cwd:dir,args:['--version']});const result=await p.launch('safe','a:1');assert.equal(result.rolledBack,true);assert.equal(stopped,true);assert.equal(p.snapshots.length,1);assert.equal(p.restore(result.snapshotId).state,'restored');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('service persists a batch, skips installed models and rejects unverified selections',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ollama-service-'));let pulls=0;
  const fetchImpl=async u=>{if(u.endsWith('/api/tags'))return response({models:[{name:'a:1',size:10}]});if(u.endsWith('/api/ps'))return response({models:[]});if(u.endsWith('/api/pull')){pulls++;return response('{"status":"success"}\n');}if(u.endsWith('/api/version'))return response({version:'test'});return response({});};
  const service=createOllamaService({dataDir:dir,fetchImpl});try{await service.request('models');await assert.rejects(service.request('addToCart',{model:'unknown:1'}));await service.request('addToCart',{model:'a:1'});await assert.rejects(service.request('startPulls',{parallelism:4,confirmNetwork:true}));const finished=new Promise(resolve=>service.subscribe(e=>e.type==='complete'&&resolve(e)));await service.request('startPulls',{parallelism:1,confirmNetwork:true});const e=await finished;assert.equal(e.result.success,true);assert.equal(pulls,0);assert.equal((await service.request('cart'))[0].state,'skipped');assert.ok((await fs.readFile(path.join(dir,'ollama-state.json'),'utf8')).includes('skipped'));}finally{await service.dispose();await fs.rm(dir,{recursive:true,force:true});}
});
test('exports redact recognizable credentials, private paths and environment assignments',()=>{const result=redactChat('hello password=verysecret C:\\Users\\someone\\private.txt TOKEN=abc Bearer abcd sk-1234 world');assert.ok(result.includes('hello'));assert.ok(result.includes('world'));for(const secret of ['verysecret','someone','abcd','sk-1234'])assert.ok(!result.includes(secret));});
test('service streams chat, stores history, rejects attachments and confirms deletion',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ollama-chat-'));
  const fetchImpl=async u=>{if(u.endsWith('/api/tags'))return response({models:[{name:'alpha:1',size:123}]});if(u.endsWith('/api/ps'))return response({models:[]});if(u.endsWith('/api/show'))return response({capabilities:['completion']});if(u.endsWith('/api/chat'))return response('{"message":{"content":"Local answer"}}\n{"done":true}\n');return response({version:'test'});};
  const service=createOllamaService({dataDir:dir,fetchImpl});try{
    await service.request('models');
    await assert.rejects(service.request('chat',{model:'alpha:1',prompt:'hello',images:['aGVsbG8=']}),/vision/);
    await assert.rejects(service.request('chat',{model:'alpha:1',prompt:'hello',images:['not base64']}),/attachment/);
    const chunks=[];const finished=new Promise(resolve=>service.subscribe(e=>{if(e.type==='chat')chunks.push(e.delta);if(e.type==='complete')resolve(e);}));
    await service.request('chat',{model:'alpha:1',prompt:'hello',options:{temperature:0.7}});const event=await finished;assert.deepEqual(chunks,['Local answer']);
    const session=await service.request('session',{id:event.result.sessionId});assert.equal(session.messages.length,2);assert.equal(session.messages[1].content,'Local answer');
    assert.equal((await service.request('exportSession',{id:session.id})).messages[1].content,'Local answer');
    await assert.rejects(service.request('deleteSession',{id:session.id,confirm:true}),/DELETE/);
    await service.request('deleteSession',{id:session.id,confirm:true,confirmation:'DELETE'});assert.equal((await service.request('sessions')).length,0);
  }finally{await service.dispose();await fs.rm(dir,{recursive:true,force:true});}
});
test('service never calls cloud model metadata or arbitrary network targets',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ollama-cloud-'));const urls=[];
  const service=createOllamaService({dataDir:dir,fetchImpl:async u=>{urls.push(u);if(u.endsWith('/api/tags'))return response({models:[{name:'alpha:1',size:1}]});if(u.endsWith('/api/ps'))return response({models:[]});return response({remote_host:'https://cloud.invalid',remote_model:'alpha'});}});
  try{await service.request('models');await assert.rejects(service.request('chat',{model:'alpha:1',prompt:'hello'}),/cloud service/);assert.ok(urls.every(u=>u.startsWith('http://127.0.0.1:11434/')));assert.equal((await service.request('sessions')).length,0);}finally{await service.dispose();await fs.rm(dir,{recursive:true,force:true});}
});
test('guided model mutations refuse arbitrary destinations and generation streams locally',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ollama-actions-'));let installed=[{name:'alpha:1',size:1}];const calls=[];
  const service=createOllamaService({dataDir:dir,fetchImpl:async(u,o)=>{calls.push(u);const body=o.body?JSON.parse(o.body):{};if(u.endsWith('/api/tags'))return response({models:installed});if(u.endsWith('/api/ps'))return response({models:[]});if(u.endsWith('/api/copy')){installed.push({name:body.destination,size:1});return response({});}if(u.endsWith('/api/delete')){installed=installed.filter(m=>m.name!==body.model);return response({});}if(u.endsWith('/api/generate'))return response('{"response":"answer"}\n{"done":true}\n');return response({capabilities:['completion']});}});
  try{await service.request('models');await assert.rejects(service.request('copyModel',{model:'alpha:1',slot:'../arbitrary'}));await assert.rejects(service.request('deleteModel',{model:'alpha:1',confirmation:'yes'}));
    assert.equal((await service.request('copyModel',{model:'alpha:1',slot:'local-copy'})).copied,'alpha:local-copy');
    const events=[];const finished=new Promise(resolve=>service.subscribe(e=>{events.push(e);if(e.type==='complete')resolve();}));await service.request('generate',{model:'alpha:1',prompt:'hi'});await finished;assert.equal(events.find(e=>e.type==='generate').delta,'answer');
    await service.request('deleteModel',{model:'alpha:local-copy',confirmation:'alpha:local-copy'});assert.equal(installed.length,1);assert.ok(calls.every(u=>u.startsWith('http://127.0.0.1:11434/')));
  }finally{await service.dispose();await fs.rm(dir,{recursive:true,force:true});}
});
