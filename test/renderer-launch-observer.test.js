import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {observeRendererLaunch} from '../scripts/renderer-launch-observer.mjs';

test('actual observer child survives caller deadline and retains its late terminal result',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-launch-observer-unit-'));
 const worker=path.join(root,'worker.cjs'),adapter=path.join(root,'adapter.txt');
 await fs.writeFile(adapter,'fixture adapter');
 await fs.writeFile(worker,`const fs=require('node:fs'),path=require('node:path');const p=process.argv[2],intent=JSON.parse(fs.readFileSync(p));fs.writeFileSync(path.join(path.dirname(p),'worker-observed-intent.json'),JSON.stringify({desktop:intent.request.desktop,declaredClientPid:intent.declaredClientPid,intentExisted:true}));setTimeout(()=>fs.writeFileSync(path.join(path.dirname(p),'terminal.json'),JSON.stringify({ok:true,client_ok:true,fixtureOnly:true})),250);`);
 const outcomes=[];
 await assert.rejects(observeRendererLaunch(process.execPath,[adapter,'launch','--state',path.join(root,'state.json')],{runRoot:root,executable:process.execPath,arguments:[]},{MFE_RENDERER_SOURCE_COMMIT:'a'.repeat(40)},o=>outcomes.push(o),{workerPath:worker,timeoutMs:20}),error=>error.launchPending===true);
 assert.equal(outcomes.length,1);assert.equal(outcomes[0].pending,true);
 const journal=path.join(root,'launch-observation');
 let terminal;const deadline=Date.now()+3000;
 while(Date.now()<deadline){try{terminal=JSON.parse(await fs.readFile(path.join(journal,'terminal.json')));break;}catch(error){assert.equal(error.code,'ENOENT');await new Promise(r=>setTimeout(r,20));}}
 assert.equal(terminal.client_ok,true);
 const observed=JSON.parse(await fs.readFile(path.join(journal,'worker-observed-intent.json')));
 assert.equal(observed.intentExisted,true);assert.equal(observed.declaredClientPid,process.pid);assert.match(observed.desktop,/^MFE-/);
 assert.equal(JSON.parse(await fs.readFile(path.join(journal,'caller-pending.json'))).pending,true);
});

test('observer rejects an existing journal before spawning another mutation observer',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-launch-exclusive-unit-'));await fs.mkdir(path.join(root,'launch-observation'));let spawned=false;
 await assert.rejects(observeRendererLaunch(process.execPath,['adapter','launch','--state',path.join(root,'state')],{runRoot:root,executable:process.execPath}, {},()=>{},{spawnImpl(){spawned=true;}}),{code:'EEXIST'});
 assert.equal(spawned,false);
});

test('terminal unknown launch outcome remains retained and disables automatic cleanup',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-launch-unknown-unit-'));const worker=path.join(root,'worker.cjs'),adapter=path.join(root,'adapter.txt');await fs.writeFile(adapter,'fixture');
 await fs.writeFile(worker,`const fs=require('node:fs'),path=require('node:path');fs.writeFileSync(path.join(path.dirname(process.argv[2]),'terminal.json'),JSON.stringify({client_ok:false,processLaunchOutcome:'unknown'}));`);
 const observations=[];
 await assert.rejects(observeRendererLaunch(process.execPath,[adapter,'launch','--state',path.join(root,'state')],{runRoot:root,executable:process.execPath}, {},value=>observations.push(value),{workerPath:worker,timeoutMs:2000}),error=>error.launchPending===true);
 assert.equal(observations[0].result.processLaunchOutcome,'unknown');assert.equal(observations[0].exitCode,1);
});
