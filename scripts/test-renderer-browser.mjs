// Source-fixture browser lifecycle. This is not packaged/native acceptance evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {observeRendererLaunch} from './renderer-launch-observer.mjs';

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
 const mapped=relative.startsWith('shared/')||relative.startsWith('renderer/')?relative:`renderer/${relative||'index.html'}`;
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
export function rendererTargetReadiness(targets,expectedUrl,port) {
 if(!Array.isArray(targets))return 'invalid';
 if(targets.length===0)return 'pending';
 if(targets.length!==1||targets[0].type!=='page')return 'invalid';
 if(targets[0].url==='about:blank'||targets[0].url==='')return 'pending';
 return targets[0].url===expectedUrl&&targets[0].webSocketDebuggerUrl?.startsWith(`ws://127.0.0.1:${port}/`)?'ready':'invalid';
}
export async function verifyConnectedRenderer(browser,{expectedUrl,targetId},prove) {
 const session=await browser.newBrowserCDPSession();
 try {
  const {targetInfos}=await session.send('Target.getTargets');
  if(!Array.isArray(targetInfos)||targetInfos.length!==1||targetInfos[0].type!=='page'||targetInfos[0].url!==expectedUrl||targetInfos[0].targetId!==targetId)throw new Error('Connected renderer target inventory changed.');
 } finally {await session.detach();}
 const result=await prove({clientPid:process.pid,targetId});
 if(result?.client_ok!==true||result.clientIdentity?.pid!==process.pid||result.establishedPeerPair?.clientPid!==process.pid||result.exactUrl!==expectedUrl||result.targetId!==targetId)throw new Error('Connected renderer lacks exact client peer ownership proof.');
 return result;
}
export async function proveStableRendererTree(prove,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
 for(let attempt=1;attempt<=3;attempt++){
  try{return await prove();}catch(error){
   const diagnostic=error.lifecycleObservation?.stderr?.trim(),result=error.lifecycleObservation?.result;
   const transient=result?(result.code==='PROCESS_PROOF_FAILED'&&result.error==='Process ancestry changed during inventory.')||(result.code==='NATIVE_DESCENDANT_MEMBERSHIP_CHANGED'&&result.error==='Native descendant membership changed around renderer target proof.'&&result.evidence?.before?.length>0&&result.evidence?.after?.length>0&&result.evidence?.final?.length>0):diagnostic?.endsWith('renderer_snapshot.SnapshotError: Process ancestry changed during inventory.');
   if(attempt===3||!transient)throw error;
   await wait(200*attempt);
  }
 }
}
export async function createRendererCdpTransport(endpoint,{fetchImpl=fetch,WebSocketImpl=WebSocket}={}) {
 const response=await fetchImpl(`${endpoint}/json/version`,{signal:AbortSignal.timeout(3000),headers:{Connection:'close'}});
 const text=await response.text();
 if(text.length>65536)throw new Error('CDP version response exceeds limit.');
 const address=new URL(JSON.parse(text).webSocketDebuggerUrl);
 const expected=new URL(endpoint);
 if(address.protocol!=='ws:'||address.hostname!=='127.0.0.1'||address.port!==expected.port||address.username||address.password||!address.pathname.startsWith('/devtools/browser/'))throw new Error('CDP transport endpoint is not the exact loopback browser.');
 const socket=new WebSocketImpl(address.href);
 let disconnected=false;
 const transport={send(message){socket.send(JSON.stringify(message));},close(){socket.close();},onmessage:undefined,onclose:undefined};
 socket.addEventListener('message',event=>{try{if(typeof event.data!=='string'||event.data.length>1048576)throw new Error('Invalid CDP transport message.');transport.onmessage?.(JSON.parse(event.data));}catch{socket.close();}});
 socket.addEventListener('close',()=>{disconnected=true;transport.onclose?.();});
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{socket.close();reject(new Error('CDP transport open timed out.'));},10000);
  socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
  socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('CDP transport connection failed.'));},{once:true});
 });
 return {transport,async disconnect(){if(disconnected)return;socket.close();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('CDP transport disconnect remains unverified.')),3000);socket.addEventListener('close',()=>{clearTimeout(timer);resolve();},{once:true});if(disconnected){clearTimeout(timer);resolve();}});}};
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

export async function preparePackagedProfile({runtime,packagedTarget,runRoot}) {
 if(!runtime.prepareProfile)return null;
 if(!packagedTarget||packagedTarget.kind!=='extracted-packaged-runtime')throw new Error('Profile preparation requires a validated packaged target.');
 const profile=path.join(runRoot,'profile');
 if(await fs.realpath(profile)!==path.resolve(profile))throw new Error('Packaged profile must be canonical.');
 if((await fs.readdir(profile)).length)throw new Error('Packaged profile must be fresh before fixture preparation.');
 await packagedTarget.revalidate();
 const result=await runtime.prepareProfile({profile,runRoot,target:packagedTarget});
 if(result?.ownedSyntheticFixture!==true||result.sourceCommit!==packagedTarget.sourceCommit)throw new Error('Profile preparation ownership or source binding is invalid.');
 await packagedTarget.revalidate();
 return {ownedSyntheticFixture:true,sourceCommit:result.sourceCommit,profilePrepared:true};
}

export async function openRendererBrowser(expectedUrl,{evidenceRoot,runtime={},packagedTarget,gracefulOnly=false}={}) {
 if(typeof gracefulOnly!=='boolean')throw new Error('Graceful-only closure option must be boolean.');
 const {chromium}=runtime.chromium?{chromium:runtime.chromium}:await import('playwright');
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
 const executable=packagedTarget?.executable||runtime.executable||process.env.CHROMIUM_PATH||path.join(path.dirname(path.dirname(path.dirname(fullChromium))),path.basename(path.dirname(path.dirname(fullChromium))).replace('chromium-','chromium_headless_shell-'),'chrome-headless-shell-win64','chrome-headless-shell.exe');
 const headlessShell=path.basename(executable)==='chrome-headless-shell.exe';
 for(const file of [installed,cli,python,executable])await fs.access(file);
 const adapter=fileURLToPath(new URL('./test-renderer-browser-cli.py',import.meta.url));
 const env={...process.env,PYTHONUTF8:'1',MFE_LOWLEVEL_CLIENT:installed,MFE_LOWLEVEL_CLI:cli,MFE_LOWLEVEL_PYTHON:python,MFE_RENDERER_NODE_EXECUTABLE:process.execPath,MFE_RENDERER_PROCESS_BACKEND:process.env.MFE_RENDERER_PROCESS_BACKEND||'native-v1'};
 if(env.MFE_RENDERER_PROCESS_BACKEND!=='native-v1')throw new Error('Fresh renderer connections require explicit native ownership proof.');
 if(env.MFE_RENDERER_PROCESS_BACKEND==='native-v1') {
  const {stdout}=runtime.sourceCommit?{stdout:runtime.sourceCommit}:await promisify(execFile)('git',['rev-parse','HEAD'],{cwd:fileURLToPath(new URL('../',import.meta.url)),windowsHide:true,timeout:10000});
  if(!/^[a-f0-9]{40}$/.test(stdout.trim()))throw new Error('Native renderer source binding is unavailable.');
  env.MFE_RENDERER_SOURCE_COMMIT=stdout.trim();
 }
 const runRoot=await fs.mkdtemp(path.join(os.tmpdir(),packagedTarget?'mfe-packaged-renderer-test-':'mfe-renderer-test-'));
 if(packagedTarget){if(expectedUrl!==packagedTarget.expectedUrl)throw new Error('Packaged renderer URL differs from validated bytes.');await fs.mkdir(path.join(runRoot,'profile'));await fs.mkdir(path.join(runRoot,'output'));}
 const state=path.join(runRoot,'lifecycle.json');const port=await freePort();
 let browser,cdpTransport,windowObservation,connectionOwned=false,launchAttempted=false,launchPending=false,closed=false,closeAttemptError;
 const outcomes=[];
 let retainedEvidence;
 let closureObservation={normalClose:'not attempted',fallback:'not attempted',resourcesAbsent:false,gracefulOnly};
 const lifecycleCommand=(args,input)=>{
  const runner=runtime.command||(args[1]==='launch'?observeRendererLaunch:command);
  return runner(python,args,input,env,outcome=>outcomes.push(outcome)).catch(error=>{if(args[1]==='launch'&&error.launchPending)launchPending=true;throw error;});
 };
 const retainEvidence=async()=>{
  const destination=evidenceRoot||path.join(runRoot,'evidence');
  const receipt=await retainClosureAttempt(destination,state,{version:3,runRoot,closure:{...closureObservation},connectionOwned,launchAttempted,launchPending,profileRetained:true,retentionReason:'Profiles and ownership evidence retained; filesystem deletion is disabled.',outcomes});
  retainedEvidence={runRoot,...receipt,profileRetained:true,closure:{...closureObservation}};
 };
 let closePromise;
 const closeOnce=async()=>{
  if(closed){if(closeAttemptError)throw closeAttemptError;return retainedEvidence;}
  if(gracefulOnly)closed=true;
  let primaryError,closureError;
  const bounded=async(promise,label)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} response remains unknown.`)),Math.min(3000,Math.max(1,runtime.gracefulTimeoutMs??3000)));})]);}finally{clearTimeout(timer);}};
  try {
   if(cdpTransport&&!connectionOwned){await cdpTransport.disconnect();closureObservation.transportDisconnected=true;}
   if(launchPending)throw new Error('Launch observer remains pending; no automatic cleanup is permitted.');
   if(launchAttempted) {
    await fs.access(state);
    if(browser&&connectionOwned) {
     await lifecycleCommand([adapter,'prepare-exit',state]);
     let gracefulError;
     if(gracefulOnly){
      let session;
      try{session=await bounded(browser.newBrowserCDPSession(),'Closure session');await bounded(session.send('Browser.close'),'Browser.close');closureObservation.closeResponse='acknowledged';}
      catch(error){gracefulError=error;closureObservation.closeResponse='unknown';closureObservation.closeResponseReason=error.message;}
      finally{if(session)try{await bounded(session.detach(),'Closure session detach');}catch(error){gracefulError ||= error;closureObservation.detachResponse='unknown';}}
     }else{
      const session=await browser.newBrowserCDPSession();
      await Promise.race([session.send('Browser.close').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);
     }
     requireClosureProof(await lifecycleCommand([adapter,'confirm-exit',state]));
     closureObservation.normalClose=gracefulError?'absence confirmed; close response unknown':'confirmed';closureObservation.resourcesAbsent=true;
     if(gracefulError)throw gracefulError;
    } else if(gracefulOnly){throw new Error('Graceful-only closure requires a proved connection; state and profile retained.');}
    else {const result=await lifecycleCommand([adapter,'cleanup','--state',state,'--allow-saved-pid-kill','--timeout','20']);requireClosureProof(result);closureObservation.fallback='confirmed';closureObservation.resourcesAbsent=true;}
   }
  } catch(error) {
   primaryError=error;if(!closureObservation.resourcesAbsent)closureObservation.normalClose='failed or ownership unavailable';
   if(launchAttempted && !launchPending && !gracefulOnly && await fs.access(state).then(()=>true,()=>false))try {const result=await lifecycleCommand([adapter,'cleanup','--state',state,'--allow-saved-pid-kill','--timeout','20']);requireClosureProof(result);closureObservation.fallback='confirmed';closureObservation.resourcesAbsent=true;}catch(error){closureError=error;closureObservation.fallback='failed';}
  }
  if(gracefulOnly&&cdpTransport)try{await bounded(cdpTransport.disconnect(),'Owned socket disconnect');closureObservation.transportDisconnected=true;}catch(error){closureError ||= error;}
  // Preserve ownership evidence even when launch failed before a state receipt.
  try {await retainEvidence();}catch(error){
   throw new AggregateError([primaryError,closureError,error].filter(Boolean),'Renderer lifecycle evidence retention failed.');
  }
  if(primaryError||closureError){closeAttemptError=new AggregateError([primaryError,closureError].filter(Boolean),'Renderer lifecycle closure failed.');throw closeAttemptError;}
  if(launchAttempted&&!closureObservation.resourcesAbsent)throw new Error('Renderer closure remains unverified.');
  closed=true;
  return retainedEvidence;
 };
 const close=()=>gracefulOnly?(closePromise ||= closeOnce()):closeOnce();
 try {
  await lifecycleCommand([adapter,'preflight','--require','launch_on_headless_desktop','--require','list_headless_windows','--require','kill_process','--require','close_headless_desktop']);
  if(packagedTarget)await packagedTarget.revalidate();
  await preparePackagedProfile({runtime,packagedTarget,runRoot});
  const launchArguments=packagedTarget?['--desktop-check',`--verification-profile=${path.join(runRoot,'profile')}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1']:[`--user-data-dir=${path.join(runRoot,'profile')}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--enable-automation',...(path.basename(executable).toLowerCase()==='msedge.exe'?['--edge-skip-compat-layer-relaunch','--disable-component-extensions-with-background-pages']:[]),headlessShell?expectedUrl:`--app=${expectedUrl}`];
  if(runtime.mainInspectorPort!==undefined){
   if(!packagedTarget||!Number.isInteger(runtime.mainInspectorPort)||runtime.mainInspectorPort<1024||runtime.mainInspectorPort>65535||runtime.mainInspectorPort===port)throw Error('A distinct packaged-only loopback main inspector port is required');
   launchArguments.push(`--inspect=127.0.0.1:${runtime.mainInspectorPort}`);
  }
  launchAttempted=true;
  await lifecycleCommand([adapter,'launch','--state',state],{executable,arguments:launchArguments,runRoot,outputRoot:path.join(runRoot,'output'),cdp:{port,expectedUrl}});
  // Headless shell has no HWND. Its PID/creation-time/executable receipt and
  // exact CDP target prove ownership, not native pixels or keyboard delivery.
  if(!headlessShell)windowObservation=await proveStableRendererTree(()=>lifecycleCommand([adapter,'wait-window','--state',state,'--title-pattern','.*','--class-pattern','^Chrome_WidgetWin_1$','--timeout','10']));
  const endpoint=`http://127.0.0.1:${port}`;const deadline=Date.now()+15000;
  let targets;
  while(Date.now()<deadline){
   try{targets=await (await (runtime.fetch||fetch)(`${endpoint}/json/list`,{signal:AbortSignal.timeout(1000),headers:{Connection:'close'}})).json();}
   catch{await new Promise(resolve=>setTimeout(resolve,100));continue;}
   const readiness=rendererTargetReadiness(targets,expectedUrl,port);
   outcomes.push({operation:'target-inventory',result:{readiness,count:Array.isArray(targets)?targets.length:null,types:Array.isArray(targets)?targets.map(target=>target.type):[],exactMatches:Array.isArray(targets)?targets.filter(target=>target.url===expectedUrl).length:0}});
   if(readiness!=='pending')break;
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!Array.isArray(targets)||targets.length!==1||targets[0].type!=='page'||targets[0].url!==expectedUrl||!targets[0].webSocketDebuggerUrl?.startsWith(`ws://127.0.0.1:${port}/`))throw new Error('Renderer fixture CDP isolation proof failed.');
  if(env.MFE_RENDERER_PROCESS_BACKEND==='native-v1')await proveStableRendererTree(()=>lifecycleCommand([adapter,'prove-cdp',state]));
  const clientBinding=(await lifecycleCommand([adapter,'bind-client',state],{clientPid:process.pid})).clientBinding;
  if(clientBinding?.clientIdentity?.pid!==process.pid)throw new Error('Fresh renderer client ancestry binding is unavailable.');
  cdpTransport=await (runtime.createTransport||createRendererCdpTransport)(endpoint);
  browser=await chromium.connectOverCDP(cdpTransport.transport);
  if(env.MFE_RENDERER_PROCESS_BACKEND==='native-v1')await verifyConnectedRenderer(browser,{expectedUrl,targetId:targets[0].id},input=>proveStableRendererTree(()=>lifecycleCommand([adapter,'prove-cdp',state],{...input,clientBinding})));
  connectionOwned=true;
  const page=browser.contexts()[0].pages()[0];
  if(!page||browser.contexts()[0].pages().length!==1)throw new Error('Renderer fixture page inventory changed.');
  if(packagedTarget)await packagedTarget.revalidate();
  return {page,close,runRoot,statePath:state,windowObservation,connectionOwned,backend:env.MFE_RENDERER_PROCESS_BACKEND};
 } catch(error){try {await close();}catch(closureError){throw new AggregateError([error,closureError],'Renderer fixture failed and closure also failed.');}throw error;}
}
