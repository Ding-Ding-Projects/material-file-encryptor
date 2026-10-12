import process from 'node:process';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {assertGuiExecutable,quietInterpreter,startQuietObserver,observeRendererLaunch} from '../scripts/renderer-launch-observer.mjs';

function pe(subsystem=2){const bytes=Buffer.alloc(256);bytes.write('MZ');bytes.writeUInt32LE(128,60);bytes.write('PE\0\0',128);bytes.writeUInt16LE(subsystem,220);return bytes;}
export async function runObserverMockChecks(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-observer-mocked-'));
 const scripts=path.join(root,'venv','Scripts'),base=path.join(root,'base');await fs.mkdir(scripts,{recursive:true});await fs.mkdir(base);
 await fs.writeFile(path.join(scripts,'pythonw.exe'),pe());await fs.writeFile(path.join(base,'pythonw.exe'),pe());await fs.writeFile(path.join(root,'venv','pyvenv.cfg'),'home = '+base+'\ninclude-system-site-packages = false\nimplementation = CPython\nuv = fixture\n');
 const python=path.join(scripts,'python.exe');const resolved=await quietInterpreter(python);assert.equal(resolved.launcher,path.join(scripts,'pythonw.exe'));assert.equal(Object.keys(resolved.hashes).length,3);
 assert.throws(()=>assertGuiExecutable(pe(3)),/GUI-subsystem/);assert.throws(()=>assertGuiExecutable(Buffer.from('bad')),/PE header/);
 await fs.writeFile(path.join(base,'pythonw.exe'),pe(3));await assert.rejects(quietInterpreter(python),/GUI-subsystem/);await fs.writeFile(path.join(base,'pythonw.exe'),pe());
 let conflictSpawned=false;await assert.rejects(startQuietObserver({python:resolved.launcher,workerPath:'worker.py',intentPath:'intent.json',journal:root,env:{MFE_LOWLEVEL_PYTHON:resolved.launcher.replaceAll(path.sep,path.sep==='\\'?'/':'\\')},spawnImpl(){conflictSpawned=true;}}),/Interpreter launch and identity binding differ/);assert.equal(conflictSpawned,false);
 const originalOpen=fs.open;let firstClosed=false,openCount=0,unexpectedSpawn=false;
 try{fs.open=async()=>{if(++openCount===1)return {close:async()=>{firstClosed=true;}};throw Object.assign(new Error('Second log open failed'),{code:'EACCES'});};await assert.rejects(startQuietObserver({python:resolved.launcher,workerPath:'worker.py',intentPath:'intent.json',journal:root,env:{MFE_LOWLEVEL_PYTHON:resolved.launcher},spawnImpl(){unexpectedSpawn=true;}}),{code:'EACCES'});}finally{fs.open=originalOpen;}
 assert.equal(firstClosed,true);assert.equal(unexpectedSpawn,false);
 const journal=path.join(root,'streams');await fs.mkdir(journal);let child,options;
 const observer=await startQuietObserver({python:resolved.launcher,workerPath:'worker.py',intentPath:'intent.json',journal,env:{MFE_LOWLEVEL_PYTHON:resolved.launcher},spawnImpl(exe,args,opts){assert.equal(exe,resolved.launcher);options=opts;child=new EventEmitter();child.pid=123;child.stdout=new PassThrough();child.stderr=new PassThrough();child.unref=()=>{throw Error('Unref forbidden');};return child;}});
 assert.equal(options.detached,false);assert.equal(options.windowsHide,true);assert.deepEqual(options.stdio,['ignore','pipe','pipe']);let exited=false;observer.exit.then(()=>{exited=true;});child.stdout.write('retained output');child.stderr.write('retained diagnostic');await new Promise(r=>setTimeout(r,5));assert.equal(exited,false);child.stdout.end();child.stderr.end();child.emit('close',0,null);assert.equal((await observer.exit).code,0);assert.equal(await fs.readFile(path.join(journal,'stdout.log'),'utf8'),'retained output');
 const run=path.join(root,'deadline');await fs.mkdir(run);const adapter=path.join(root,'adapter'),worker=path.join(root,'worker.py');await fs.writeFile(adapter,'fixture');await fs.writeFile(worker,'fixture');let late;
 await assert.rejects(observeRendererLaunch(python,[adapter,'launch','--state',path.join(run,'state')],{runRoot:run,executable:resolved.launcher},{},()=>{},{workerPath:worker,timeoutMs:5,spawnImpl(){late=new EventEmitter();late.pid=124;late.stdout=new PassThrough();late.stderr=new PassThrough();late.kill=()=>{throw Error('Kill forbidden');};late.unref=()=>{throw Error('Unref forbidden');};return late;}}),e=>e.launchPending===true);
 assert.equal(JSON.parse(await fs.readFile(path.join(run,'launch-observation','caller-pending.json'))).pending,true);late.stdout.end();late.stderr.end();late.emit('close',0,null);await new Promise(r=>setTimeout(r,20));assert.equal(JSON.parse(await fs.readFile(path.join(run,'launch-observation','observer-exit.json'))).code,0);
 let spawned=false;await assert.rejects(observeRendererLaunch(python,[adapter,'launch','--state',path.join(run,'state')],{runRoot:run,executable:resolved.launcher},{},()=>{},{workerPath:worker,spawnImpl(){spawned=true;}}),{code:'EEXIST'});assert.equal(spawned,false);
 for(const accepted of [true,false]){const target=path.join(root,'terminal-'+accepted);await fs.mkdir(target);const observations=[];const operation=observeRendererLaunch(python,[adapter,'launch','--state',path.join(target,'state')],{runRoot:target,executable:resolved.launcher},{},value=>observations.push(value),{workerPath:worker,timeoutMs:1000,spawnImpl(){const child=new EventEmitter();child.pid=125;child.stdout=new PassThrough();child.stderr=new PassThrough();setTimeout(async()=>{await fs.writeFile(path.join(target,'launch-observation','terminal.json'),JSON.stringify({client_ok:accepted,processLaunchOutcome:accepted?'admitted':'unknown'}));child.stdout.end();child.stderr.end();child.emit('close',0,null);},10);return child;}});if(accepted)assert.equal((await operation).client_ok,true);else await assert.rejects(operation,e=>e.launchPending===true);assert.equal(observations[0].observerExit.code,0);assert.equal(observations[0].result.client_ok,accepted);}
 return {checks:13,processesSpawned:0,root};
}
if(process.env.MFE_OBSERVER_MOCK_ONLY!=='1'){const {default:test}=await import('node:test');test('GUI observer uses mocked pipes and retains actual exit supervision',runObserverMockChecks);}
