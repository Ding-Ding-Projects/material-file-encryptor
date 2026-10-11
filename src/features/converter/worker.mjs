import { parentPort, workerData } from 'node:worker_threads';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https'; import dgram from 'node:dgram'; import child from 'node:child_process';
const deny=()=>{throw new Error('Converter network and process access is disabled.');};
for(const [mod,keys] of [[net,['connect','createConnection','createServer']],[http,['request','get','createServer']],[https,['request','get','createServer']],[dgram,['createSocket']],[child,['spawn','exec','execFile','fork','spawnSync','execSync','execFileSync']]])for(const key of keys)mod[key]=deny;
globalThis.fetch=deny;globalThis.WebSocket=undefined;syncBuiltinESMExports();
try {const {convertBuiltin}=await import('./registry.mjs'); const result=workerData.adapterId.startsWith('pdf-')?await (await import('./pdf.mjs')).convertPdf(workerData.inputs,{...workerData.options,operation:workerData.adapterId.slice(4)}):convertBuiltin(workerData.adapterId,workerData.inputs[0]);parentPort.postMessage({ok:true,result});}catch{parentPort.postMessage({ok:false,error:'Conversion rejected: unsupported, malformed, protected, or resource-limited input.'});}
