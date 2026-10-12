// Bounded self-only GUI-interpreter observation; no target launch or teardown.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {quietInterpreter,startQuietObserver} from './renderer-launch-observer.mjs';
const python=process.env.MFE_LOWLEVEL_PYTHON;
if(!python||!path.isAbsolute(python))throw Error('Explicit isolated interpreter required.');
const interpreter=await quietInterpreter(python);
const journal=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-binding-probe-'));
const output=path.join(journal,'binding.json');
const {exit}=await startQuietObserver({python:interpreter.launcher,workerPath:fileURLToPath(new URL('./renderer-binding-probe.py',import.meta.url)),intentPath:String(process.pid),journal,env:{...process.env,MFE_BINDING_PROBE_OUTPUT:output,MFE_LOWLEVEL_PYTHON:interpreter.launcher,MFE_RENDERER_NODE_EXECUTABLE:process.execPath}});
let timer;
const result=await Promise.race([exit,new Promise(resolve=>{timer=setTimeout(()=>resolve({pending:true,reason:'Observer exit deadline reached; no termination attempted.'}),15000);})]);
clearTimeout(timer);
console.log(JSON.stringify({journal,observerExit:result,output}));
