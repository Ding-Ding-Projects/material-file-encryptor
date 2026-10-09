import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';

export function makeLaunch({executable,runRoot,port}) {
 if(!path.isAbsolute(executable)||!path.isAbsolute(runRoot)||!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid isolated verification inputs.');
 const outputRoot=path.join(runRoot,'output');const profile=path.join(runRoot,'profile');
 const expectedUrl=pathToFileURL(path.join(path.dirname(executable),'resources','app.asar','src','renderer','index.html')).href;
 return {executable,arguments:['--desktop-check',`--verification-profile=${profile}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],runRoot,outputRoot,cdp:{port,expectedUrl}};
}
export function makeBaselinePlan(launch,receipt) {return {version:1,receipt,endpoint:`http://127.0.0.1:${launch.cdp.port}`,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:30000,steps:[{id:'ready',op:'poll',expression:"document.readyState === 'complete' && typeof window.drive?.status === 'function'",equals:true,intervalMs:200},{id:'baseline',op:'capture',path:path.join(launch.outputRoot,'baseline.png'),overwrite:false}]};}
function command(executable,args,input) {return new Promise((resolve,reject)=>{const child=spawn(executable,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',bytes=0;const timer=setTimeout(()=>{child.kill();reject(new Error('Verification helper timed out.'));},90000);child.stdout.on('data',data=>{bytes+=data.length;if(bytes>1048576){child.kill();reject(new Error('Verification helper output exceeded limit.'));}else output+=data;});child.stderr.resume();child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',code=>{clearTimeout(timer);try{const result=JSON.parse(output);if(code!==0||result.client_ok===false||result.ok===false)throw new Error(result.code||'Verification helper failed.');resolve(result);}catch(error){reject(error);}});child.stdin.end(input===undefined?'':JSON.stringify(input));});}
async function freePort(){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
export async function runLocalHeadlessCheck(env=process.env) {
 if(process.platform!=='win32')throw new Error('The local isolated desktop route requires Windows.');
 const executable=await fs.realpath(path.resolve(env.MFE_DESKTOP_EXECUTABLE||'out/material-file-encryptor-win32-x64/MaterialFileEncryptor.exe'));
 const runRoot=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-headless-'));const launch=makeLaunch({executable,runRoot,port:await freePort()});
 await fs.mkdir(launch.outputRoot);await fs.mkdir(path.join(runRoot,'profile'));
 const skillRoot=path.join(os.homedir(),'.agents','skills');
 const lowlevel=env.MFE_LOWLEVEL_CLIENT||path.join(skillRoot,'run-lowlevel-headless-app','scripts','lowlevel_mcp_client.py');
 const cdp=env.MFE_CDP_DRIVER||path.join(skillRoot,'drive-electron-cdp-headless','scripts','cdp_driver.mjs');
 await fs.access(lowlevel);await fs.access(cdp);
 const transportArgs=env.MFE_LOWLEVEL_URL?['--url',env.MFE_LOWLEVEL_URL]:[];
 const statePath=path.join(runRoot,'lifecycle.json');const plan=makeBaselinePlan(launch,statePath);
 const source=await new Promise((resolve,reject)=>{const child=spawn('git',['rev-parse','HEAD'],{windowsHide:true});let value='';child.stdout.on('data',data=>value+=data);child.on('close',code=>code===0?resolve(value.trim()):reject(new Error('Source identity unavailable.')));});
 const resourceHashes={};for(const [name,file] of Object.entries({asar:path.join(path.dirname(executable),'resources','app.asar'),nativeHost:path.join(path.dirname(executable),'resources','native','MaterialFileEncryptor.Host.exe')}))resourceHashes[name]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
 const receipt={version:1,resourceHashes,route:'cheap-lowlevel-headless',sourceCommit:source,executableSha256:createHash('sha256').update(await fs.readFile(executable)).digest('hex'),launch,preparedAt:new Date().toISOString(),launched:false,pixelsInspected:false,interactionsVerified:false};
 await fs.writeFile(path.join(runRoot,'prepared.json'),JSON.stringify(receipt,null,2));
 if(env.MFE_HEADLESS_EXECUTE!=='1') {console.log(JSON.stringify({prepared:true,launched:false,runRoot,requires:'Set MFE_HEADLESS_EXECUTE=1 only after reviewing the packaged executable and isolated profile arguments.'}));return receipt;}
 const python=env.MFE_PYTHON||'python';let cleanup;let failure;
 try {
  await command(python,[lowlevel,'self-test']);await command(process.execPath,[cdp,'self-test']);
  await command(python,[lowlevel,'preflight',...transportArgs,'--require','launch_on_headless_desktop','--require','list_headless_windows','--require','screenshot','--require','close_headless_desktop','--require','kill_process']);
  await command(python,[lowlevel,'launch',...transportArgs,'--state',statePath],launch);receipt.launched=true;
  await command(python,[lowlevel,'wait-window','--state',statePath,'--title-pattern','^Material File Encryptor','--class-pattern','^Chrome_WidgetWin_1$','--timeout','30']);
  const lifecycle=JSON.parse(await fs.readFile(statePath,'utf8'));
  const initial=await command(python,[lowlevel,'call','screenshot',...transportArgs],{hwnd:lifecycle.hwnd});
  await fs.writeFile(path.join(runRoot,'initial-capture-result.json'),JSON.stringify(initial,null,2));
  receipt.cdp=await command(process.execPath,[cdp,'run'],plan);
 } catch(error) {failure=String(error.message).slice(0,200);}
 finally {try {await fs.access(statePath);cleanup=await command(python,[lowlevel,'cleanup','--state',statePath,'--allow-saved-pid-kill','--timeout','20']);}catch(error){cleanup={ok:false,reason:String(error.message).slice(0,200)};}
  Object.assign(receipt,{finishedAt:new Date().toISOString(),failure,cleanup,passed:false,pending:['Inspect genuine baseline pixels before interaction','Run source-bound interaction plan','Verify native input separately'],profileRetained:true});
  await fs.writeFile(path.join(runRoot,'verification.json'),JSON.stringify(receipt,null,2));}
 console.log(JSON.stringify({runRoot,launched:receipt.launched,passed:false,pixelsInspected:false}));
 if(failure||cleanup?.ok===false)throw new Error(failure||'Owned lifecycle cleanup failed.');return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await runLocalHeadlessCheck();
