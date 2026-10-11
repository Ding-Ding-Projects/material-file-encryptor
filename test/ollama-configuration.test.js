import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createOllamaConfiguration} from '../src/main/ollama-configuration.js';
import {validateFeatureRequest} from '../src/main/validation.js';
async function fixture(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ollama-config-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}
test('confirmed idle port change persists and retires only through the owned callback',async t=>{
 const directory=await fixture(t),config=createOllamaConfiguration({directory});let retired=0;
 assert.equal(await config.read(),11434);
 assert.deepEqual(await config.apply({port:11435},{canChange:()=>true,confirm:async()=>true,retire:async()=>{retired++;}}),{port:11435,changed:true});
 assert.equal(await createOllamaConfiguration({directory}).read(),11435);assert.equal(retired,1);
 await config.apply({port:11435},{canChange:()=>true,confirm:()=>{throw Error('Unnecessary prompt');},retire:()=>{throw Error('Unnecessary retirement');}});
});
test('busy, cancelled, racing and invalid changes preserve the previous setting',async t=>{
 const directory=await fixture(t),config=createOllamaConfiguration({directory});let retired=0,idle=true;
 const callbacks={canChange:()=>idle,confirm:async()=>false,retire:async()=>{retired++;}};
 assert.equal((await config.apply({port:11435},callbacks)).cancelled,true);
 idle=false;await assert.rejects(config.apply({port:11435},callbacks),/Wait/);idle=true;
 await assert.rejects(config.apply({port:11435},{...callbacks,confirm:async()=>{idle=false;return true;}}),/began/);
 for(const port of ['11435',80,65536,NaN])await assert.rejects(config.apply({port},callbacks));
 assert.equal(await config.read(),11434);assert.equal(retired,0);assert.equal(config.changing,false);
});
test('failed publication leaves the old port and removes only its temporary file',async t=>{
 const directory=await fixture(t),filename=path.join(directory,'ollama-connection.json');await fs.writeFile(filename,JSON.stringify({version:1,port:11434}));
 const config=createOllamaConfiguration({directory,filesystem:{...fs,rename:async()=>{throw Error('Synthetic write failure');}}});
 await assert.rejects(config.apply({port:11435},{canChange:()=>true,confirm:async()=>true,retire:async()=>{}}),/Synthetic/);
 assert.equal(await config.read(),11434);assert.deepEqual(await fs.readdir(directory),['ollama-connection.json']);assert.equal(config.changing,false);
});
test('local runtime configuration is never exposed by the browser action allowlist',()=>{
 assert.equal(validateFeatureRequest('ollama','configureRuntime',{port:11435}).action,'configureRuntime');
 assert.throws(()=>validateFeatureRequest('ollama','configureRuntime',{port:11435},{browser:true}));
});
