import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRuntimeController,probeOllamaHealth,probeRuntimeProcesses,OFFICIAL_INSTALL_PAGE,createVerifiedRuntimeLauncher} from '../src/features/ollama/runtime.js';
import {createNativeProfileAdapter} from '../src/features/ollama/native-profiles.js';
import {inspectImageAttachment} from '../src/features/ollama/attachments.js';
const exe=path.resolve('fixtures/ollama.exe');
const filesystem={realpath:async p=>p,stat:async()=>({isFile:()=>true})};

test('empty native process inventory is explicitly serialized as an array',async()=>{
  const rows=await probeRuntimeProcesses({systemRoot:'C:\\Windows',executeFile:async(_file,args)=>{
    assert.match(args.at(-1),/ConvertTo-Json -InputObject @\(/);
    assert.doesNotMatch(args.at(-1),/\| ConvertTo-Json/);
    return {stdout:'[]'};
  }});
  assert.deepEqual(rows,[]);
});
test('runtime diagnosis distinguishes missing, stopped, unhealthy and healthy without starting anything',async()=>{
  const common={candidatePaths:[exe],filesystem,platform:'win32',processProbe:async()=>[],apiProbe:async()=>({healthy:false,reachable:false}),verifyExecutable:async()=>true};
  assert.equal((await createRuntimeController(common).inspect()).state,'stopped');
  assert.equal((await createRuntimeController({...common,filesystem:{...filesystem,stat:async()=>{throw new Error('missing');}}}).inspect()).state,'missing');
  assert.equal((await createRuntimeController({...common,apiProbe:async()=>({healthy:false,reachable:true})}).inspect()).state,'unhealthy');
  assert.equal((await createRuntimeController({...common,processProbe:async()=>[{name:'ollama.exe'}]}).inspect()).state,'unhealthy');
  assert.equal((await createRuntimeController({...common,apiProbe:async()=>({healthy:true,version:'test'})}).inspect()).state,'healthy');
  assert.equal((await createRuntimeController({...common,processProbe:async()=>{throw new Error('denied');}}).inspect()).state,'unknown');
});
test('installer navigation and runtime start require explicit confirmation and fixed verified launch',async()=>{
  const opened=[],launches=[];let healthy=false;
  const controller=createRuntimeController({candidatePaths:[exe],filesystem,platform:'win32',processProbe:async()=>[],apiProbe:async()=>({healthy,reachable:false,version:healthy?'test':null}),verifyExecutable:async()=>true,openOfficialPage:async u=>opened.push(u),launchVerified:async config=>{launches.push(config);healthy=true;return {stop:async()=>{}};},pause:async()=>{}});
  await assert.rejects(controller.install(),/Confirm/);await assert.rejects(controller.start(),/Confirm/);assert.equal(opened.length,0);assert.equal(launches.length,0);
  await controller.install({confirmed:true});assert.deepEqual(opened,[OFFICIAL_INSTALL_PAGE]);assert.equal((await controller.start({confirmed:true})).state,'healthy');
  assert.deepEqual(launches[0].args,['serve']);assert.deepEqual(launches[0].environment,{OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_NO_CLOUD:'1'});
});
test('failed startup stops only the returned owned process and reports rollback',async()=>{
  let stopped=0;const controller=createRuntimeController({candidatePaths:[exe],filesystem,platform:'win32',processProbe:async()=>[],apiProbe:async()=>({healthy:false,reachable:false}),verifyExecutable:async()=>true,launchVerified:async()=>({stop:async()=>stopped++}),pause:async()=>{}});
  const result=await controller.start({confirmed:true});assert.equal(result.state,'unhealthy');assert.equal(result.rolledBack,true);assert.equal(stopped,1);
  await assert.rejects(createVerifiedRuntimeLauncher({verifyExecutable:async()=>true})({executable:exe,args:['arbitrary'],environment:{}}),/fixed/);
});
test('health probe bounds responses and differentiates network absence from unhealthy HTTP',async()=>{
  assert.deepEqual(await probeOllamaHealth(async()=>new Response('{"version":"test"}')),{healthy:true,reachable:true,version:'test'});
  assert.equal((await probeOllamaHealth(async()=>new Response('no',{status:503}))).reachable,true);
  assert.equal((await probeOllamaHealth(async()=>{throw new Error('offline');})).reachable,false);
  assert.equal((await probeOllamaHealth(async()=>new Response('x'.repeat(70000)))).healthy,false);
});
test('native registration uses pickers and fixed recipes, and readiness records actual exit',async()=>{
  let call;const adapter=createNativeProfileAdapter({pickExecutable:async()=>exe,pickOwnedDirectory:async()=>path.dirname(exe),verifyExecutable:async()=>true,executeFile:(...args)=>{call=args;queueMicrotask(()=>args[3](null));return {pid:123};}});
  await assert.rejects(adapter.pickProfile({recipe:'shell'}),/recipe/);const profile=await adapter.pickProfile({recipe:'inspect'});assert.deepEqual(profile.args,['show','{model}']);
  const process=await adapter.launcher({...profile,model:'alpha:1'});assert.equal(await adapter.healthCheck(process),true);assert.deepEqual(call[1],['show','alpha:1']);assert.equal(call[2].windowsHide,true);assert.equal(call[2].env.OLLAMA_HOST,'127.0.0.1:11434');
  await assert.rejects(adapter.launcher({...profile,args:['run','arbitrary']}),/validation/);
});
test('image headers enforce actual type and dimension bounds before model submission',()=>{
  const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(100,16);png.writeUInt32BE(200,20);
  assert.deepEqual(inspectImageAttachment(png.toString('base64')),{type:'image/png',width:100,height:200,bytes:33});
  png.writeUInt32BE(65535,16);assert.throws(()=>inspectImageAttachment(png.toString('base64')),/8192/);assert.throws(()=>inspectImageAttachment(Buffer.from('not an image').toString('base64')),/Image must/);
});
