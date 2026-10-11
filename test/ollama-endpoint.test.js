import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {localEndpoint} from '../src/features/ollama/endpoint.js';
import {OllamaClient} from '../src/features/ollama/client.js';
import {probeOllamaHealth,createRuntimeController} from '../src/features/ollama/runtime.js';
import {createNativeOllamaHost} from '../src/main/ollama-host.js';
test('native port configuration fixes the host and routes client and probe consistently',async()=>{
  for(const invalid of [80,65536,11434.5,'11434',null,NaN])assert.throws(()=>localEndpoint(invalid));
  const urls=[];const fetchImpl=async url=>{urls.push(url);return new Response('{"version":"fixture"}');};
  const client=new OllamaClient({loopbackPort:11435,fetchImpl});await client.call('version');await probeOllamaHealth(fetchImpl,11435);
  assert.deepEqual(urls,['http://127.0.0.1:11435/api/version','http://127.0.0.1:11435/api/version']);
  assert.throws(()=>{client.endpoint={url:'https://example.org'};});assert.ok(Object.isFrozen(client.endpoint));
});
test('native launch uses the configured port and owned model directory without inherited model settings',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ollama-endpoint-'));
  try{const executable=path.join(directory,'ollama.exe');await fs.writeFile(executable,'synthetic');let called;
    const host=createNativeOllamaHost({dataDirectory:directory,loopbackPort:11435,publisherPolicies:[{publisher:'fixture',sourceUrl:'https://docs.ollama.com/windows'}],signatureInspector:async()=>({valid:true,publisher:'fixture'}),dialog:{showMessageBox:async()=>({response:0})},spawnRuntime:(file,args,options)=>{called={file,args,options};const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}});
    await host.runtimeOptions.launchVerified({executable,args:['serve'],environment:{OLLAMA_HOST:'127.0.0.1:11435',OLLAMA_NO_CLOUD:'1'}});
    assert.equal(called.options.env.OLLAMA_HOST,'127.0.0.1:11435');assert.equal(called.options.env.OLLAMA_MODELS,path.join(directory,'local-models','runtime-models'));assert.equal(called.options.env.OLLAMA_NO_CLOUD,'1');
    assert.equal((await fs.stat(called.options.env.OLLAMA_MODELS)).isDirectory(),true);assert.equal(host.serviceOptions.loopbackPort,11435);
    await assert.rejects(host.runtimeOptions.launchVerified({executable,args:['serve'],environment:{OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_NO_CLOUD:'1'}}));
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('controller reports configured versus owned storage and disposal stops only its owned runtime',async()=>{
  let healthy=false,stops=0,request;
  const controller=createRuntimeController({loopbackPort:11435,managedModelDirectory:process.cwd(),candidatePaths:[path.join(process.cwd(),'ollama.exe')],filesystem:{realpath:async p=>p,stat:async()=>({isFile:()=>true})},platform:'win32',processProbe:async()=>[],verifyExecutable:async()=>true,apiProbe:async()=>({healthy}),launchVerified:async r=>{request=r;healthy=true;return {stop:async()=>{stops++;}};}});
  const before=await controller.inspect();assert.equal(before.managedModelStore,false);assert.equal(before.managedModelStoreConfigured,true);
  await controller.start({confirmed:true});assert.equal(request.environment.OLLAMA_HOST,'127.0.0.1:11435');assert.equal((await controller.inspect()).managedModelStore,true);
  await controller.dispose();await controller.dispose();assert.equal(stops,1);
  const external=createRuntimeController({apiProbe:async()=>({healthy:true}),platform:'other'});await external.dispose();assert.equal(stops,1);
});
