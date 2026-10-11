import { fork, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const workerPath=fileURLToPath(new URL('./process-worker.mjs',import.meta.url));
export function probeRestrictedRuntime(executable=process.execPath) {
 const probe=spawnSync(executable,['--permission','-e',"const p=process.permission;process.stdout.write(JSON.stringify({restricted:!!p&&!p.has('net')&&!p.has('child')&&!p.has('worker')&&!p.has('fs.write')&&!p.has('addons')}))"],{encoding:'utf8',timeout:5000,windowsHide:true,env:{ELECTRON_RUN_AS_NODE:'1'},maxBuffer:4096});
 try{return probe.status===0&&JSON.parse(probe.stdout).restricted===true;}catch{return false;}
}
export function createRestrictedProcess({inputs,adapterId,options,executable=process.execPath,timeout=30000}) {
 if(!path.isAbsolute(executable)||!probeRestrictedRuntime(executable))throw new Error('The bundled runtime cannot enforce file, network, and process restrictions.');
 const roots=[path.dirname(workerPath)];
 if(adapterId.startsWith('pdf-')){let current=fs.realpathSync(require.resolve('pdf-lib'));while(path.basename(current)!=='node_modules'&&path.dirname(current)!==current)current=path.dirname(current);if(path.basename(current)!=='node_modules')throw new Error('Bundled PDF dependencies could not be located.');roots.push(current);}
 const child=fork(workerPath,[],{execPath:executable,execArgv:['--permission',...roots.map(root=>'--allow-fs-read='+root),'--max-old-space-size=256','--stack-size=2048','--no-addons'],env:{ELECTRON_RUN_AS_NODE:'1'},serialization:'advanced',stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
 let finished=false,timer;const result=new Promise((resolve,reject)=>{const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);child.kill();error?reject(error):resolve(value);};timer=setTimeout(()=>finish(new Error('Conversion time limit exceeded.')),timeout);child.once('message',message=>message?.ok?finish(null,message.result):finish(new Error('Restricted conversion rejected the input.')));child.once('error',()=>finish(new Error('Restricted converter could not start.')));child.once('exit',()=>finish(new Error('Restricted conversion interrupted.')));child.send({inputs,adapterId,options});});
 return {result,terminate:async()=>{child.kill();}};
}
