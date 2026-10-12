// Close only a retained renderer after exact native and connected-peer proofs.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRendererCdpTransport,verifyConnectedRenderer,proveStableRendererTree,requireClosureProof} from './test-renderer-browser.mjs';
if(!process.argv[2]||!path.isAbsolute(process.argv[2]))throw Error('Exact retained run root required.');
const root=await fs.realpath(process.argv[2]);
const statePath=path.join(root,'lifecycle.json');
const original=await fs.readFile(statePath),state=JSON.parse(original);
if(state.runRoot!==root||state.cleaned||state.version!==1)throw Error('Retained state differs.');
const intent=JSON.parse(await fs.readFile(path.join(root,'launch-observation/000-intent.json')));
if(intent.statePath!==statePath||intent.request.desktop!==state.desktop||Object.keys(state.cdp).sort().join(',')!=='expectedUrl,port'||intent.request.cdp.port!==state.cdp.port||intent.request.cdp.expectedUrl!==state.cdp.expectedUrl)throw Error('Original launch intent differs.');
const attempt=await fs.mkdtemp(path.join(root,'normal-close-'));
await fs.writeFile(path.join(attempt,'lifecycle.original.json'),original,{flag:'wx'});
const adapter=fileURLToPath(new URL('./test-renderer-browser-cli.py',import.meta.url));
const cli=process.env.MFE_LOWLEVEL_CLI,python=process.env.MFE_LOWLEVEL_PYTHON;
if(!cli||!python)throw Error('Explicit installed interpreter and CLI required.');
const env={...process.env,MFE_LOWLEVEL_CLIENT:path.join(os.homedir(),'.agents/skills/run-lowlevel-headless-app/scripts/lowlevel_mcp_client.py'),MFE_RENDERER_PROCESS_BACKEND:'native-v1',MFE_RENDERER_SOURCE_COMMIT:intent.sourceCommit,MFE_RENDERER_NODE_EXECUTABLE:process.execPath};
let sequence=0;
async function call(operation,input){
 const result=await new Promise((resolve,reject)=>{const child=spawn(python,[adapter,operation,statePath],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));child.stdin.end(input?JSON.stringify(input):'');});
 await fs.writeFile(path.join(attempt,`${++sequence}-${operation}.json`),JSON.stringify(result,null,2),{flag:'wx'});
 if(result.code!==0)throw Error(`Retained ${operation} proof failed; diagnostic retained.`);
 const payload=JSON.parse(result.stdout);if(payload.client_ok!==true)throw Error(`Retained ${operation} proof failed.`);return payload;
}
let transport;
try{
 const first=await proveStableRendererTree(()=>call('prove-cdp'));
 const clientBinding=(await call('bind-client',{clientPid:process.pid})).clientBinding;
 transport=await createRendererCdpTransport(`http://127.0.0.1:${state.cdp.port}`);
 const {chromium}=await import(pathToFileURL(process.env.MFE_PLAYWRIGHT_MODULE).href);
 const browser=await chromium.connectOverCDP(transport.transport);
 await verifyConnectedRenderer(browser,{expectedUrl:state.cdp.expectedUrl,targetId:first.targetId},input=>proveStableRendererTree(()=>call('prove-cdp',{...input,clientBinding})));
 await call('prepare-exit');
 const session=await browser.newBrowserCDPSession();
 let closeResponse='acknowledged';
 try{await session.send('Browser.close');}catch{closeResponse='unknown';}
 const closure=await call('confirm-exit');requireClosureProof(closure);
 await fs.writeFile(path.join(attempt,'result.json'),JSON.stringify({ok:true,closeResponse,closure,targetLaunchAttempted:false},null,2),{flag:'wx'});
 console.log(JSON.stringify({ok:true,attempt,closeResponse,closure}));
}catch(error){await fs.writeFile(path.join(attempt,'result.json'),JSON.stringify({ok:false,error:error.message,targetLaunchAttempted:false},null,2),{flag:'wx'});console.log(JSON.stringify({ok:false,attempt,error:error.message}));process.exitCode=1;}
finally{if(transport)await transport.disconnect();}
