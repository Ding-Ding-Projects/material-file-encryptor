// Source-fixture browser lifecycle. This is not packaged/native acceptance evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

function command(executable,args,input,env) {
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('Renderer lifecycle helper timed out.'));},args[1]==='cleanup'?90000:30000);
  child.stdout.on('data',data=>{output+=data;if(output.length>1048576){child.kill();reject(new Error('Renderer lifecycle output exceeded limit.'));}});
  child.stderr.resume();child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('close',code=>{clearTimeout(timer);try{const result=JSON.parse(output);if(code!==0||result.client_ok!==true)throw new Error(`${args[1]}: ${result.code||result.error||'Renderer lifecycle helper failed.'}`);resolve(result);}catch(error){reject(error);}});
  child.stdin.end(input===undefined?'':JSON.stringify(input));
 });
}
async function freePort(){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}

export async function openRendererBrowser(expectedUrl) {
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
 const runRoot=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-renderer-test-'));
 const state=path.join(runRoot,'lifecycle.json');const port=await freePort();
 let browser,launched=false,closed=false;
 const close=async()=>{
  if(closed)return;
  try {
   if(launched) {
    if(browser) {
     await command(python,[adapter,'prepare-exit',state],undefined,env);
     const session=await browser.newBrowserCDPSession();
     await Promise.race([session.send('Browser.close').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);
     await command(python,[adapter,'confirm-exit',state],undefined,env);
    } else await command(python,[adapter,'cleanup','--state',state,'--allow-saved-pid-kill','--timeout','20'],undefined,env);
   }
   closed=true;await fs.rm(runRoot,{recursive:true});
  } catch(error) {
   if(launched)await command(python,[adapter,'cleanup','--state',state,'--allow-saved-pid-kill','--timeout','20'],undefined,env);
   throw error;
  }
 };
 try {
  await command(python,[adapter,'preflight','--require','launch_on_headless_desktop','--require','list_headless_windows','--require','kill_process','--require','close_headless_desktop'],undefined,env);
  await command(python,[adapter,'launch','--state',state],{executable,arguments:[`--user-data-dir=${path.join(runRoot,'profile')}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--enable-automation',headlessShell?expectedUrl:`--app=${expectedUrl}`],runRoot,outputRoot:path.join(runRoot,'output'),cdp:{port,expectedUrl}},env);
  launched=true;
  // Headless shell has no HWND. Its PID/creation-time/executable receipt and
  // exact CDP target prove ownership, not native pixels or keyboard delivery.
  if(!headlessShell)await command(python,[adapter,'wait-window','--state',state,'--title-pattern','.*','--class-pattern','^Chrome_WidgetWin_1$','--timeout','10'],undefined,env);
  const endpoint=`http://127.0.0.1:${port}`;const deadline=Date.now()+15000;
  let targets;
  while(Date.now()<deadline){try{targets=await (await fetch(`${endpoint}/json/list`,{signal:AbortSignal.timeout(1000)})).json();break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
  if(!Array.isArray(targets)||targets.length!==1||targets[0].type!=='page'||targets[0].url!==expectedUrl||!targets[0].webSocketDebuggerUrl?.startsWith(`ws://127.0.0.1:${port}/`))throw new Error('Renderer fixture CDP isolation proof failed.');
  browser=await chromium.connectOverCDP(endpoint);
  const page=browser.contexts()[0].pages()[0];
  if(!page||browser.contexts()[0].pages().length!==1)throw new Error('Renderer fixture page inventory changed.');
  return {page,close};
 } catch(error){await close();throw error;}
}
