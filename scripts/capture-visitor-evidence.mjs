import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const bounded=(promise,ms,label)=>Promise.race([promise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error(label)),ms);timer.unref();})]);
export function containedFile(root,pathname){
 const prefix='/material-file-encryptor/';
 if(!pathname.startsWith(prefix))return null;
 let relative;try{relative=decodeURIComponent(pathname.slice(prefix.length))||'index.html';}catch{return null;}
 if(relative.includes('\\')||relative.includes('\0')||relative.split('/').some(part=>part==='..')||path.isAbsolute(relative))return null;
 const file=path.resolve(root,relative);return file.startsWith(root+path.sep)?file:null;
}
export async function verifyStatic(root,receipt){
 if(!/^[a-f0-9]{40}$/.test(receipt.sourceCommit)||!Array.isArray(receipt.files)||!receipt.files.length||receipt.files.length>20000)throw Error('STATIC_RECEIPT_INVALID');
 for(const row of receipt.files){const file=containedFile(root,'/material-file-encryptor/'+row.path);if(!file)throw Error('STATIC_PATH_INVALID');const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size!==row.bytes||digest(await fs.readFile(file))!==row.sha256)throw Error('STATIC_BYTES_CHANGED');}
 return true;
}
async function processIdentity(pid){
 try{const stat=await fs.readFile(`/proc/${pid}/stat`,'utf8'),fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');return{pid,startTicks:fields[19]};}catch{return null;}
}
async function ownedTree(pid){
 const rows=[],visited=new Set();async function visit(current){if(visited.has(current)||visited.size>=100)return;visited.add(current);const identity=await processIdentity(current);if(!identity)return;rows.push(identity);let children='';try{children=await fs.readFile(`/proc/${current}/task/${current}/children`,'utf8');}catch{}for(const child of children.trim().split(/\s+/).filter(Boolean))await visit(Number(child));}await visit(pid);return rows;
}
async function absent(rows){return(await Promise.all(rows.map(async row=>{const live=await processIdentity(row.pid);return !live||live.startTicks!==row.startTicks;}))).every(Boolean);}
async function measurements(page){return page.evaluate(()=>{
 const styles=['display','position','boxSizing','width','minWidth','maxWidth','height','minHeight','maxHeight','padding','margin','gap','flexDirection','flexBasis','flexGrow','flexShrink','gridTemplateColumns','gridTemplateRows','alignItems','justifyContent','overflow','overflowX','overflowY','backgroundColor','color','fontFamily','fontSize','fontWeight','lineHeight','visibility','opacity'];
 const properties=['--md-sys-color-surface','--md-sys-color-on-surface','--md-sys-color-primary','--md-sys-color-on-primary','--md-sys-typescale-body-medium-font','--local-ux-font','--mfe-font'];
 const selectors=['html','#preferences-dialog','#preferences-dialog .dialog-content','[data-visitor-personalization]','[data-visitor-personalization] [role="tablist"]','[data-visitor-personalization] [role="tab"]','[data-visitor-personalization] [role="tabpanel"]','[data-visitor-personalization] [data-setting="Theme"]','[data-visitor-personalization] #local-ux-theme','[data-visitor-personalization] mfe-control-guidance'];
 const inspect=(element,selector,index)=>{const computed=getComputedStyle(element),rect=element.getBoundingClientRect();return{selector,index,tag:element.localName,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},clientWidth:element.clientWidth,clientHeight:element.clientHeight,scrollWidth:element.scrollWidth,scrollHeight:element.scrollHeight,hidden:element.hidden,open:typeof element.open==='boolean'?element.open:null,role:element.getAttribute('role'),selected:element.getAttribute('aria-selected'),styles:Object.fromEntries(styles.map(key=>[key,computed[key]])),properties:Object.fromEntries(properties.map(key=>[key,computed.getPropertyValue(key)]))};};
 const elements=[];for(const selector of selectors){const nodes=[...document.querySelectorAll(selector)];elements.push({selector,matchedCount:nodes.length,nodes:nodes.slice(0,100).map((element,index)=>inspect(element,selector,index))});}
 const shadow=[];const visit=(root,owner,depth=0)=>{if(depth>6||shadow.length>=300)return;for(const element of root.querySelectorAll('*')){if(element.shadowRoot){shadow.push({...inspect(element,owner+' > '+element.localName,shadow.length),shadowChildren:[...element.shadowRoot.querySelectorAll('md-text-button,md-filled-button,button,.panel')].slice(0,20).map((child,index)=>inspect(child,element.localName+'::shadow',index))});visit(element.shadowRoot,owner+' > '+element.localName,depth+1);}}};
 const host=document.querySelector('[data-visitor-personalization]');if(host)visit(host,'[data-visitor-personalization]');
 const tags=['mfe-control-guidance','mfe-search','md-text-button','md-filled-button','md-outlined-button','md-outlined-text-field','md-tabs','md-primary-tab'];
 return{documentTheme:document.documentElement.dataset.theme||null,density:document.documentElement.dataset.density||null,language:document.documentElement.lang,fontsStatus:document.fonts?.status||'unavailable',viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},elements,shadow,registrations:Object.fromEntries(tags.map(tag=>[tag,!!customElements.get(tag)]))};
 });}

export async function capture(){
 if(process.platform!=='linux'||process.getuid?.()===0)throw Error('NONROOT_LINUX_SANDBOX_HOST_REQUIRED');
 const runRoot=path.resolve('out/visitor-capture'),root=path.join(runRoot,'static'),out=path.join(runRoot,'evidence');
 const input=JSON.parse(await fs.readFile(path.join(out,'production-input.json'),'utf8'));
 if(input.sourceCommit!==process.env.CAPTURE_SOURCE)throw Error('SOURCE_INPUT_MISMATCH');await verifyStatic(root,input);
 const {stdout:packages}=await promisify(execFile)('dpkg-query',['--show','--showformat=${binary:Package}\t${Version}\n'],{maxBuffer:1024*1024,timeout:10000});await fs.writeFile(path.join(out,'cloud-os-packages.txt'),packages);
 const receipt={schemaVersion:1,startedAtUtc:new Date().toISOString(),route:'cloud-linux-playwright',sourceCommit:input.sourceCommit,producerCommit:process.env.GITHUB_SHA,artifactSha256:input.artifactSha256,node:{version:process.version,executableSha256:digest(await fs.readFile(process.execPath))},acceptanceEvaluated:false,viewport:{width:320,height:844,scale:1,evidenceKind:'emulated-mobile'},networkBoundary:'Only the admitted static loopback origin is served; external requests are blocked.',observations:[],captures:[],console:[],network:[],targets:[],closure:{attempted:false,observedProcessesGone:false,serverClosed:false,profileDisposition:'unobserved'}};
 let server,browserServer,browser,context,page,profile,identities=[],treeTimer;const remember=rows=>{for(const row of rows)if(!identities.some(old=>old.pid===row.pid&&old.startTicks===row.startTicks))identities.push(row);};
 const save=()=>fs.writeFile(path.join(out,'capture-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 try{
  const {chromium}=await import('playwright');const executable=chromium.executablePath();receipt.browser={playwrightVersion:JSON.parse(await fs.readFile('node_modules/playwright/package.json','utf8')).version,executableSha256:digest(await fs.readFile(executable)),executableName:path.basename(executable),sandboxRequested:true};
  if(receipt.browser.playwrightVersion!=='1.64.0')throw Error('PLAYWRIGHT_VERSION_MISMATCH');
  const browserInventory=JSON.parse(await fs.readFile('node_modules/playwright-core/browsers.json','utf8'));const pinned=browserInventory.browsers.find(row=>row.name==='chromium');if(pinned.revision!=='1248'||pinned.browserVersion!=='156.0.8078.4')throw Error('BROWSER_REVISION_MISMATCH');receipt.browser.revision=pinned.revision;
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
  server=http.createServer(async(req,res)=>{try{if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}const file=containedFile(root,new URL(req.url,'http://127.0.0.1').pathname);if(!file){res.writeHead(404).end();return;}const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:await fs.readFile(file));}catch{res.writeHead(404).end();}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const origin='http://127.0.0.1:'+server.address().port,url=origin+'/material-file-encryptor/';receipt.server={pid:process.pid,port:server.address().port,origin};
  browserServer=await chromium.launchServer({headless:true,chromiumSandbox:true,args:['--disable-extensions','--disable-sync','--no-first-run']});const processHandle=browserServer.process();receipt.browser.identity=await processIdentity(processHandle.pid);if(await fs.realpath(`/proc/${processHandle.pid}/exe`)!==await fs.realpath(executable))throw Error('BROWSER_PROCESS_IMAGE_MISMATCH');receipt.browser.processImageMatched=true;remember(await ownedTree(processHandle.pid));treeTimer=setInterval(()=>{void ownedTree(processHandle.pid).then(remember);},500);treeTimer.unref();
  const command=(await fs.readFile(`/proc/${processHandle.pid}/cmdline`,'utf8')).split('\0');if(command.includes('--no-sandbox'))throw Error('SANDBOX_ARGUMENT_REJECTED');profile=command.find(value=>value.startsWith('--user-data-dir='))?.slice(16);if(!profile||!path.resolve(profile).startsWith(os.tmpdir()+path.sep))throw Error('OWNED_PROFILE_NOT_OBSERVED');const profileInfo=await fs.lstat(profile);if(!profileInfo.isDirectory()||profileInfo.isSymbolicLink()||await fs.realpath(profile)!==path.resolve(profile))throw Error('OWNED_PROFILE_PATH_MISMATCH');receipt.browser.profileId=path.basename(profile);receipt.browser.commandFlags=command.filter(value=>value.startsWith('--')).map(value=>value.startsWith('--user-data-dir=')?'--user-data-dir=<owned-profile>':value.split('=')[0]);
  browser=await chromium.connect(browserServer.wsEndpoint());receipt.browser.actualVersion=browser.version();if(receipt.browser.actualVersion!==pinned.browserVersion)throw Error('BROWSER_VERSION_MISMATCH');context=await browser.newContext({viewport:{width:320,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,colorScheme:'light',locale:'en-US',serviceWorkers:'block',acceptDownloads:false});
  await context.route('**/*',async route=>{const request=route.request(),requested=new URL(request.url()),allowed=requested.origin===origin;receipt.network.push({resourceType:request.resourceType(),method:request.method(),path:allowed?requested.pathname:null,externalBlocked:!allowed});await(allowed?route.continue():route.abort('blockedbyclient'));});
  page=await context.newPage();page.setDefaultTimeout(5000);page.on('console',message=>{if(receipt.console.length<200)receipt.console.push({type:message.type(),textSha256:digest(message.text())});});page.on('pageerror',error=>{if(receipt.console.length<200)receipt.console.push({type:'pageerror',textSha256:digest(error.message)});});
  page.on('response',response=>{if(receipt.network.length<2000&&response.url().startsWith(origin+'/'))receipt.network.push({path:new URL(response.url()).pathname,status:response.status()});});
  async function targets(phase){const pages=context.pages();receipt.targets.push({phase,count:pages.length,urls:pages.map(item=>item.url().startsWith(origin+'/')?item.url():'<unexpected-target>')});if(pages.length!==1||pages[0]!==page||page.url()!==url)throw Error('OWNED_TARGET_IDENTITY_MISMATCH');}
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000});await targets('initial');const opener=page.locator('#preferences-open');receipt.observations.push({action:'open-preferences',matchedCount:await opener.count()});try{if(await opener.count()===1)await opener.click();}catch{receipt.observations.push({action:'open-preferences',performed:false});}await page.waitForTimeout(150);await targets('before-capture');
  async function record(name){const raw=await page.screenshot({type:'png',fullPage:false,animations:'allow'});await fs.writeFile(path.join(out,name+'.png'),raw);const data=await measurements(page);await fs.writeFile(path.join(out,name+'.json'),JSON.stringify(data,null,2)+'\n');receipt.captures.push({name,pngSha256:digest(raw),bytes:raw.length,width:raw.readUInt32BE(16),height:raw.readUInt32BE(20),measurementSha256:digest(JSON.stringify(data,null,2)+'\n'),capturedAtUtc:new Date().toISOString()});await save();}
  await record('preferences-initial');const appearance=page.locator('[data-visitor-personalization] [role="tab"]').filter({hasText:/^Appearance$/});receipt.observations.push({action:'appearance-tab',matchedCount:await appearance.count()});if(await appearance.count()===1){try{await appearance.click();const theme=page.locator('[data-visitor-personalization] #local-ux-theme');receipt.observations.push({action:'theme-select',matchedCount:await theme.count()});if(await theme.count()===1){await theme.selectOption('dark');await page.waitForTimeout(150);}}catch{receipt.observations.push({action:'request-dark',performed:false});}}
  await targets('dark-capture');await record('preferences-after-dark-request');await targets('final');remember(await ownedTree(processHandle.pid));await verifyStatic(root,input);receipt.productionInputBookendPassed=true;receipt.productionCompleted=true;
 }catch(error){receipt.productionCompleted=false;receipt.productionError={name:error.name,messageSha256:digest(String(error.message)),reason:/sandbox/i.test(String(error.message))?'sandbox-unavailable':/timeout/i.test(String(error.message))?'bounded-operation-timeout':'production-operation-incomplete'};throw error;}
 finally{
  if(treeTimer)clearInterval(treeTimer);receipt.closure.attempted=true;const failures=[];try{if(context)await bounded(context.close(),10000,'CONTEXT_CLOSE_TIMEOUT');}catch{failures.push('context-close');}try{if(browserServer)await bounded(browserServer.close(),15000,'BROWSER_CLOSE_TIMEOUT');}catch{failures.push('browser-close');}try{if(browser)await bounded(browser.close(),5000,'TRANSPORT_CLOSE_TIMEOUT');}catch{failures.push('transport-close');}
  receipt.closure.observedProcessesGone=identities.length>0&&await absent(identities);receipt.closure.observedProcesses=identities;
  try{if(server){await bounded(new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),5000,'SERVER_CLOSE_TIMEOUT');receipt.closure.serverClosed=true;}}catch{failures.push('server-close');}
  receipt.closure.profileDisposition=profile?await fs.lstat(profile).then(()=> 'retained',()=> 'absent'):'unobserved';receipt.closure.failures=failures;receipt.finishedAtUtc=new Date().toISOString();await save();
 }
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 if(process.argv[2]!=='--capture')throw Error('Use --capture only in an admitted isolated production context.');
 capture().then(()=>console.log('Raw evidence produced; UI acceptance was not evaluated.')).catch(()=>{console.error('Raw evidence production incomplete; inspect the bounded receipt.');process.exitCode=1;});
}
