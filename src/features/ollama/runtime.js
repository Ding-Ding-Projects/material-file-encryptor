import path from 'node:path';
import fs from 'node:fs/promises';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {localEndpoint} from './endpoint.js';
const execute=promisify(execFile);
export const OFFICIAL_INSTALL_PAGE='https://ollama.com/download/windows';
export function createVerifiedRuntimeLauncher({verifyExecutable,spawnImpl=spawn,loopbackPort=11434,managedModelDirectory=null}={}){
  const endpoint=localEndpoint(loopbackPort);
  if(managedModelDirectory!==null&&!path.isAbsolute(managedModelDirectory))throw new Error('Managed model directory must be absolute.');
  return async({executable,args,environment})=>{
    if(!verifyExecutable||await verifyExecutable(executable)!==true||path.basename(executable).toLowerCase()!=='ollama.exe'||JSON.stringify(args)!=='["serve"]'||JSON.stringify(environment)!==JSON.stringify({OLLAMA_HOST:endpoint.host,OLLAMA_NO_CLOUD:'1'}))throw new Error('Runtime launch does not match the fixed local-server profile.');
    const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','LOCALAPPDATA','USERPROFILE','HOME','PATH'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]));Object.assign(env,environment);
    if(managedModelDirectory)env.OLLAMA_MODELS=managedModelDirectory;
    const child=spawnImpl(executable,['serve'],{shell:false,windowsHide:true,stdio:'ignore',env});
    const exited=new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve);});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(new Error('The verified local runtime could not start.')));});
    child.unref?.();return {pid:child.pid,async stop(){if(child.exitCode===null&&!child.killed)child.kill();await exited;}};
  };
}
const PROCESS_QUERY="$ErrorActionPreference='Stop'; @(Get-CimInstance -ClassName Win32_Process -Filter \"Name = 'ollama.exe' OR Name = 'ollama app.exe'\" | Select-Object Name,ExecutablePath) | ConvertTo-Json -Compress";
export async function probeRuntimeProcesses({executeFile=execute,systemRoot=process.env.SystemRoot}={}){
  if(typeof systemRoot!=='string'||!/^[A-Za-z]:\\Windows$/i.test(systemRoot))throw new Error('Native process inspection is unavailable.');
  const {stdout}=await executeFile(path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',PROCESS_QUERY],{windowsHide:true,timeout:10000,maxBuffer:1024*1024,encoding:'utf8'});
  const data=JSON.parse(stdout.replace(/^\uFEFF/,''));const rows=Array.isArray(data)?data:data?[data]:[];
  if(rows.length>128)throw new Error('Process inventory exceeds its supported limit.');
  return rows.map(p=>({name:typeof p.Name==='string'?p.Name.slice(0,128):null,executable:typeof p.ExecutablePath==='string'?p.ExecutablePath:null}));
}
export async function probeOllamaHealth(fetchImpl=fetch,loopbackPort=11434){
  const endpoint=localEndpoint(loopbackPort);
  let reachable=false;
  try{
    const response=await fetchImpl(endpoint.url+'/api/version',{redirect:'error',signal:AbortSignal.timeout(5000)});reachable=true;
    if(!response.ok||!response.body)return {healthy:false,reachable:true,reason:'The API responded without a successful version result.'};
    const reader=response.body.getReader();let bytes=0,text='';const decoder=new TextDecoder();
    try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>65536)throw new Error('oversized');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
    const value=JSON.parse(text);if(typeof value.version!=='string'||!value.version||value.version.length>100)throw new Error('invalid-version');
    return {healthy:true,reachable:true,version:value.version};
  }catch{return {healthy:false,reachable,reason:reachable?'The API returned invalid or oversized version data.':'The loopback API did not respond.'};}
}
// Pickers, trust verification, and process creation belong to the native host.
// This adapter never downloads or runs an installer and never accepts commands.
export function createRuntimeController({candidatePaths,environment=process.env,filesystem=fs,processProbe=probeRuntimeProcesses,verifyExecutable,launchVerified,openOfficialPage,pickExecutable,platform=process.platform,loopbackPort=11434,managedModelDirectory=null,apiProbe=()=>probeOllamaHealth(fetch,loopbackPort),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  const endpoint=localEndpoint(loopbackPort);
  const candidates=candidatePaths||[environment.LOCALAPPDATA&&path.join(environment.LOCALAPPDATA,'Programs','Ollama','ollama.exe'),environment.ProgramFiles&&path.join(environment.ProgramFiles,'Ollama','ollama.exe')].filter(Boolean);
  let selected=null,owned=null,starting=false;
  async function installation(){
    for(const candidate of [...(selected?[selected]:[]),...candidates]){try{if(!path.isAbsolute(candidate))continue;const executable=await filesystem.realpath(candidate);if(path.basename(executable).toLowerCase()!=='ollama.exe'||!(await filesystem.stat(executable)).isFile())continue;let trusted=false;try{trusted=verifyExecutable?await verifyExecutable(executable)===true:false;}catch{}return {present:true,executable,trusted};}catch{}}
    return {present:false,executable:null,trusted:false};
  }
  async function inspect(){
    const [installed,api,processes]=await Promise.all([installation(),apiProbe(),platform==='win32'?processProbe().then(rows=>({known:true,rows}),()=>({known:false,rows:[]})):Promise.resolve({known:false,rows:[]})]);
    let state;
    if(api.healthy)state='healthy';
    else if(api.reachable||processes.rows.length)state='unhealthy';
    else if(installed.present&&processes.known)state='stopped';
    else if(!installed.present&&processes.known)state='missing';
    else state='unknown';
    return {state,endpoint:endpoint.url,managedModelStore:owned!==null&&managedModelDirectory!==null,managedModelStoreConfigured:managedModelDirectory!==null,version:api.version||null,installed:installed.present,executableTrusted:installed.trusted,processInspectionKnown:processes.known,processCount:processes.rows.length,reason:api.reason||null,actions:{install:state==='missing'&&Boolean(openOfficialPage),start:state==='stopped'&&installed.trusted&&Boolean(launchVerified),retry:true,selectExecutable:Boolean(pickExecutable&&verifyExecutable)},at:new Date().toISOString()};
  }
  return {
    inspect,
    async dispose(){if(starting)throw new Error('Wait for runtime startup before disposal.');const process=owned;owned=null;await process?.stop?.();},
    async chooseExecutable(){if(!pickExecutable)throw new Error('The native runtime file picker is unavailable.');const selected=await pickExecutable({title:'Select the trusted Ollama executable',extensions:['exe'],filename:'ollama.exe'});if(!selected)return {state:'cancelled'};return this.registerPickedExecutable(selected);},
    async registerPickedExecutable(executable){if(typeof executable!=='string'||!path.isAbsolute(executable))throw new Error('Choose a native executable file.');const resolved=await filesystem.realpath(executable);if(path.basename(resolved).toLowerCase()!=='ollama.exe'||!(await filesystem.stat(resolved)).isFile()||!verifyExecutable||await verifyExecutable(resolved)!==true)throw new Error('The chosen executable did not pass the Ollama trust policy.');selected=resolved;return inspect();},
    async install({confirmed=false}={}){if(!confirmed)throw new Error('Confirm opening the official installer page.');if(!openOfficialPage)throw new Error('The native host has not enabled official installer navigation.');await openOfficialPage(OFFICIAL_INSTALL_PAGE);return {state:'installer-page-opened',installed:false,next:'Complete the official installer, then select Check runtime. No executable was downloaded or run by this application.'};},
    async start({confirmed=false}={}){
      if(!confirmed)throw new Error('Confirm starting the detected local runtime.');if(starting)throw new Error('Runtime startup is already in progress.');starting=true;
      try{const status=await inspect();if(status.state==='healthy')return status;if(status.state!=='stopped')throw new Error('Start is available only for a detected stopped runtime.');const installed=await installation();if(!installed.trusted||!launchVerified)throw new Error('The native host must verify the executable before startup.');
        owned=await launchVerified({executable:installed.executable,args:['serve'],environment:{OLLAMA_HOST:endpoint.host,OLLAMA_NO_CLOUD:'1'},windowsHide:true});
        if(!owned||typeof owned.stop!=='function')throw new Error('The native launcher did not return an owned process stop handle.');
        for(let attempt=0;attempt<10;attempt++){const api=await apiProbe();if(api.healthy)return {state:'healthy',version:api.version,owned:true};await pause(500);}
        await owned?.stop?.();owned=null;return {state:'unhealthy',rolledBack:true,next:'The started process did not expose a healthy local API and was stopped. Check runtime diagnostics before retrying.'};
      }finally{starting=false;}
    },
  };
}
