// Source-fixture browser lifecycle. This is not packaged/native acceptance evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

export function command(executable,args,input,env,onOutcome,{timeoutMs}={}) {
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='',settled=false;
  const finish=(error,code=null)=>{
   if(settled)return;settled=true;clearTimeout(timer);
   const observation={operation:args[1],exitCode:code,stdout,stderr};
   try {observation.result=JSON.parse(stdout);}catch {}
   onOutcome?.(observation);
   if(error){error.lifecycleObservation=observation;reject(error);return;}
   if(code!==0||observation.result?.client_ok!==true){const failure=new Error(`${args[1]}: ${observation.result?.code||observation.result?.error||'Renderer lifecycle helper failed.'}`);failure.lifecycleObservation=observation;reject(failure);return;}
   resolve(observation.result);
  };
  const timer=setTimeout(()=>{child.kill();finish(new Error('Renderer lifecycle helper timed out.'));},timeoutMs??(args[1]==='cleanup'?90000:30000));
  const collect=key=>data=>{
   if(key==='stdout')stdout=(stdout+data).slice(0,1048576);else stderr=(stderr+data).slice(0,1048576);
   if((key==='stdout'?stdout:stderr).length>=1048576){child.kill();finish(new Error('Renderer lifecycle output exceeded limit.'));}
  };
  child.stdout.on('data',collect('stdout'));child.stderr.on('data',collect('stderr'));
  child.on('error',error=>finish(error));child.on('close',code=>finish(undefined,code));
  child.stdin.on('error',error=>finish(error));child.stdin.end(input===undefined?'':JSON.stringify(input));
 });
}

// Serve only source modules needed by the renderer fixture. Raw traversal is
// rejected before URL normalization, including encoded separators and dot parts.
export async function serveRendererFixture(request,response,{sourceRoot=fileURLToPath(new URL('../src/',import.meta.url))}={}) {
 const raw=(request.url||'/').split(/[?#]/,1)[0];
 let pathname;
 try {pathname=decodeURIComponent(raw);}catch {response.writeHead(404).end();return;}
 const parts=pathname.split('/');
 if(parts.some(part=>part==='.'||part==='..')||pathname.includes('\\')||!/^\/[a-zA-Z0-9_./-]*$/.test(pathname)){response.writeHead(404).end();return;}
 const relative=pathname.slice(1);
 const mapped=relative.startsWith('shared/')?relative:`renderer/${relative||'index.html'}`;
 if(!/\.(?:html|js|mjs|css|json|svg|png|woff2?)$/.test(mapped)){response.writeHead(404).end();return;}
 const filename=path.resolve(sourceRoot,mapped);
 const allowed=path.resolve(sourceRoot,mapped.startsWith('shared/')?'shared':'renderer');
 try {
  const real=await fs.realpath(filename),base=await fs.realpath(allowed);
  if(!real.startsWith(base+path.sep))throw new Error('Outside fixture source root.');
  const bytes=await fs.readFile(real);
  response.setHeader('Content-Type',/\.m?js$/.test(mapped)?'text/javascript':mapped.endsWith('.css')?'text/css':mapped.endsWith('.json')?'application/json':mapped.endsWith('.svg')?'image/svg+xml':mapped.endsWith('.png')?'image/png':mapped.endsWith('.woff2')?'font/woff2':'text/html');
  response.end(bytes);
 }catch {response.writeHead(404).end();}
}
export function requireClosureProof(result) {
 if(result?.recordedProcessesAbsent!==true||result?.desktopClosed!==true)throw new Error('Renderer closure lacks explicit process and desktop absence proof.');
 return true;
}
export async function retainClosureAttempt(destination,state,observation) {
 await fs.mkdir(destination,{recursive:true});
 const attempt=await fs.mkdtemp(path.join(destination,'attempt-'));
 const stateBytes=await fs.readFile(state).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 const statePath=path.join(attempt,'lifecycle.original.json');
 const outcomePath=path.join(attempt,'helper-outcomes.normalized.json');
 const outcomeBytes=Buffer.from(JSON.stringify({...observation,stateAvailable:!!stateBytes},null,2),'utf8');
 if(stateBytes)await fs.writeFile(statePath,stateBytes,{flag:'wx'});
 await fs.writeFile(outcomePath,outcomeBytes,{flag:'wx'});
 return {statePath:stateBytes?statePath:null,stateSha256:stateBytes?createHash('sha256').update(stateBytes).digest('hex'):null,outcomePath,outcomeSha256:createHash('sha256').update(outcomeBytes).digest('hex')};
}
async function freePort(){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}

export async function openRendererBrowser(expectedUrl,{evidenceRoot}={}) {
 const {chromium}=await import('playwright');
 if(process.platform!=='win32') {
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try {return {page:await browser.newPage(),close:()=>browser.close()};}catch(error){await browser.close();throw error;}
 }
 const installed=path.join(os.homedir(),'.agents','skills','run-lowlevel-headless-app','scripts','lowlevel_mcp_client.py');
 let documents=path.join(os.homedir(),'Documents');
 if(!process.env.MFE_LOWLEVEL_CLI) {
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Environment]::GetFolderPath('MyDocuments')"],{windowsHide:true,timeout:10000});
  if(stdout.trim())documents=stdout.trim();
 }
 const cli=process.env.MFE_LOWLEVEL_CLI||path.join(documents,'GitHub','lowlevel-computer-use-mcp','.venv','Scripts','lowlevel-computer-use-cheap.exe');
 const python=process.env.MFE_LOWLEVEL_PYTHON||path.join(path.dirname(cli),'python.exe');
 const fullChromium=chromium.executablePath();
 const executable=process.env.CHROMIUM_PATH||path.join(path.dirname(path.dirname(path.dirname(fullChromium))),path.basename(path.dirname(path.dirname(fullChromium))).replace('chromium-','chromium_headless_shell-'),'chrome-headless-shell-win64','chrome-headless-shell.exe');
 const headlessShell=path.basename(executable)==='chrome-headless-shell.exe';
 for(const file of [installed,cli,python,executable])await fs.access(file);
 const adapter=fileURLToPath(new URL('./test-renderer-browser-cli.py',import.meta.url));
 const env={...process.env,PYTHONUTF8:'1',MFE_LOWLEVEL_CLIENT:installed,MFE_LOWLEVEL_CLI:cli};
 if(env.MFE_RENDERER_PROCESS_BACKEND==='native-v1') {
  const {stdout}=await promisify(execFile)('git',['rev-parse','HEAD'],{cwd:fileURLToPath(new URL('../',import.meta.url)),windowsHide:true,timeout:10000});
  if(!/^[a-f0-9]{40}$/.test(stdout.trim()))throw new Error('Native renderer source binding is unavailable.');
  env.MFE_RENDERER_SOURCE_COMMIT=stdout.trim();
 }
 const runRoot=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-renderer-test-'));
 const state=path.join(runRoot,'lifecycle.json');const port=await freePort();
 let browser,launchAttempted=false,closed=false;
 const outcomes=[];
 let retainedEvidence;
 let closureObservation={normalClose:'not attempted',fallback:'not attempted',resourcesAbsent:false};
 const lifecycleCommand=(args,input)=>command(python,args,input,env,outcome=>outcomes.push(outcome));
 const retainEvidence=async()=>{
  const destination=evidenceRoot||path.join(runRoot,'evidence');
  const receipt=await retainClosureAttempt(destination,state,{version:3,runRoot,closure:{...closureObservation},launchAttempted,profileRetained:true,retentionReason:'Profiles and ownership evidence retained; filesystem deletion is disabled.',outcomes});
  retainedEvidence={runRoot,...receipt,profileRetained:true,closure:{...closureObservation}};
 };
 const close=async()=>{
  if(closed)return retainedEvidence;
  let primaryError,closureError;
  try {
   if(launchAttempted) {
    await fs.access(state);
    if(browser) {
     await lifecycleCommand([adapter,'prepare-exit',state]);
     const session=await browser.newBrowserCDPSession();
     await Promise.race([session.send('Browser.close').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);
     requireClosureProof(await lifecycleCommand([adapter,'confirm-exit',state]));
     closureObservation.normalClose='confirmed';closureObservation.resourcesAbsent=true;
    } else {const result=await lifecycleCommand([adapter,'cleanup','--state',state,'--allow-saved-pid-kill','--timeout','20']);requireClosureProof(result);closureObservation.fallback='confirmed';closureObservation.resourcesAbsent=true;}
   }
  } catch(error) {
   primaryError=error;closureObservation.normalClose='failed or ownership unavailable';
   if(launchAttempted && await fs.access(state).then(()=>true,()=>false))try {const result=await lifecycleCommand([adapter,'cleanup','--state',state,'--allow-saved-pid-kill','--timeout','20']);requireClosureProof(result);closureObservation.fallback='confirmed';closureObservation.resourcesAbsent=true;}catch(error){closureError=error;closureObservation.fallback='failed';}
  }
  // Preserve ownership evidence even when launch failed before a state receipt.
  try {await retainEvidence();}catch(error){
   throw new AggregateError([primaryError,closureError,error].filter(Boolean),'Renderer lifecycle evidence retention failed.');
  }
  if(primaryError||closureError)throw new AggregateError([primaryError,closureError].filter(Boolean),'Renderer lifecycle closure failed.');
  if(launchAttempted&&!closureObservation.resourcesAbsent)throw new Error('Renderer closure remains unverified.');
  closed=true;
  return retainedEvidence;
 };
 try {
  await lifecycleCommand([adapter,'preflight','--require','launch_on_headless_desktop','--require','list_headless_windows','--require','kill_process','--require','close_headless_desktop']);
  launchAttempted=true;
  await lifecycleCommand([adapter,'launch','--state',state],{executable,arguments:[`--user-data-dir=${path.join(runRoot,'profile')}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--enable-automation',headlessShell?expectedUrl:`--app=${expectedUrl}`],runRoot,outputRoot:path.join(runRoot,'output'),cdp:{port,expectedUrl}});
  // Headless shell has no HWND. Its PID/creation-time/executable receipt and
  // exact CDP target prove ownership, not native pixels or keyboard delivery.
  if(!headlessShell)await lifecycleCommand([adapter,'wait-window','--state',state,'--title-pattern','.*','--class-pattern','^Chrome_WidgetWin_1$','--timeout','10']);
  const endpoint=`http://127.0.0.1:${port}`;const deadline=Date.now()+15000;
  let targets;
  while(Date.now()<deadline){try{targets=await (await fetch(`${endpoint}/json/list`,{signal:AbortSignal.timeout(1000)})).json();break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
  if(!Array.isArray(targets)||targets.length!==1||targets[0].type!=='page'||targets[0].url!==expectedUrl||!targets[0].webSocketDebuggerUrl?.startsWith(`ws://127.0.0.1:${port}/`))throw new Error('Renderer fixture CDP isolation proof failed.');
  if(env.MFE_RENDERER_PROCESS_BACKEND==='native-v1')await lifecycleCommand([adapter,'prove-cdp',state]);
  browser=await chromium.connectOverCDP(endpoint);
  const page=browser.contexts()[0].pages()[0];
  if(!page||browser.contexts()[0].pages().length!==1)throw new Error('Renderer fixture page inventory changed.');
  return {page,close};
 } catch(error){try {await close();}catch(closureError){throw new AggregateError([error,closureError],'Renderer fixture failed and closure also failed.');}throw error;}
}
