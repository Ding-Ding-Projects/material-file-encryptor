import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, scrypt as scryptCallback, timingSafeEqual, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createStatusHubClient } from '../status-hub/status-hub-client.mjs';
import { collectWorktrees } from '../status-hub/worktree-inventory.mjs';
import { createApplicationStatus } from '../features/documentation/status-service.mjs';
import { createScheduleSource } from './schedule-source.js';
import { createNativeOllamaHost } from './ollama-host.js';
import { createRuntimeController } from '../features/ollama/runtime.js';
const scrypt=promisify(scryptCallback);
const executeFile=promisify(execFile);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const encoded=value=>JSON.stringify(value);
const keyPattern=/^(?:(?:profile:|lock:|authenticator:|history:|shared:|grant:|schedule:)[a-zA-Z0-9:_.-]{1,160}|element-lock:[^\x00-\x1f\x7f]{1,256}|local-profile:v1)$/;
const rendererCredentialKey=key=>typeof key==='string'&&/^(?:local-profile:v1|element-lock:|authenticator:|history:)/.test(key)&&keyPattern.test(key);
const secretKey=/^(?:password|pin|secret|token|credential|credentials|vocabulary|replacements|entries)$/i;
function bounded(value,limit=262144){const text=encoded(value);if(typeof text!=='string'||Buffer.byteLength(text)>limit)throw Error('Request exceeds its size limit.');function visit(v,depth){if(depth>12)throw Error('Request is too deeply nested.');if(object(v)){for(const[k,item]of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k))throw Error('Invalid record key.');visit(item,depth+1);}}else if(Array.isArray(v)){for(const item of v)visit(item,depth+1);}}visit(value,0);return value;}
function plainSettings(value){bounded(value);if(!object(value))throw Error('Expected a settings record.');function visit(v){if(!object(v)&&!Array.isArray(v))return;for(const[k,item]of Object.entries(v)){if(secretKey.test(k))throw Error('Credentials and personal wording cannot be saved in shared settings.');visit(item);}}visit(value);return value;}

export function createCredentialStore({directory,safeStorage}){
 let chain=Promise.resolve();
 const filename=path.join(directory,'protected-records.json');
 async function read(){try{const info=await fs.stat(filename);if(info.size>4*1024*1024)throw Error('Protected record store exceeds its limit.');const data=JSON.parse(await fs.readFile(filename,'utf8'));if(!object(data))throw Error('Invalid protected record store.');return data;}catch(e){if(e.code==='ENOENT')return {};throw e;}}
 function available(){if(!safeStorage?.isEncryptionAvailable())throw Error('Operating-system protected storage is unavailable.');}
 function check(key){if(typeof key!=='string'||!keyPattern.test(key))throw Error('Invalid protected record identifier.');}
 async function write(data){await fs.mkdir(directory,{recursive:true});const temporary=filename+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temporary,encoded(data),{mode:0o600,flag:'wx'});await fs.rename(temporary,filename);}finally{await fs.rm(temporary,{force:true});}}
 function mutate(action){const next=chain.catch(()=>{}).then(action);chain=next;return next;}
 return {
  async get(key){check(key);available();await chain;const data=await read();if(!Object.hasOwn(data,key))return null;return JSON.parse(safeStorage.decryptString(Buffer.from(data[key],'base64')));},
  set(key,value){check(key);available();bounded(value);return mutate(async()=>{const data=await read();data[key]=safeStorage.encryptString(encoded(value)).toString('base64');await write(data);});},
  delete(key){check(key);return mutate(async()=>{const data=await read();delete data[key];await write(data);});},
  async list(prefix){if(typeof prefix!=='string'||!keyPattern.test(prefix+'x'))throw Error('Invalid protected record prefix.');await chain;return Object.keys(await read()).filter(key=>key.startsWith(prefix));}
 };
}

export async function readConverterManifest(filename) {
 return JSON.parse((await fs.readFile(filename,'utf8')).replace(/^\uFEFF/,''));
}

export function createFeatureServices({dataDirectory,applicationRoot,sandboxDirectory,safeStorage,dialog,getWindow,openPath,openExternal,emit=()=>{},sandboxProvider}){
 const credentials=createCredentialStore({directory:dataDirectory,safeStorage});
 const scheduleAuthorization={};
 const schedules=createScheduleSource({credentials,authorizeCredentialMutation:context=>context?.authorization===scheduleAuthorization});
 const grants=new Map();let converter,ollama,ollamaPromise,closed=false,exiting=false,sharedCredentialGranted=false,pendingRequests=0;
 const modelEvents=[];let modelSequence=0,modelEventBytes=0;
 function modelEvent(data){const item={sequence:++modelSequence,data};const bytes=Buffer.byteLength(JSON.stringify(item));if(bytes<=524288){modelEvents.push({item,bytes});modelEventBytes+=bytes;}while(modelEvents.length>128||modelEventBytes>524288){modelEventBytes-=modelEvents.shift().bytes;}emit('ollama',data);}
 const statusPromise=createApplicationStatus({createClient:createStatusHubClient,clientOptions:{sessionId:'material-file-encryptor-'+randomUUID(),title:'Material File Encryptor',repository:'Ding-Ding-Projects/material-file-encryptor',branch:'main',machine:process.platform+' desktop',exitHooks:false},collectWorktrees,repoPath:applicationRoot});
 const settingsPath=path.join(dataDirectory,'shared-settings.json');
 const grant=async(filename,mode)=>{const id=randomUUID();const value={filename,mode,parent:await fs.realpath(path.dirname(filename))};grants.set(id,value);await credentials.set('grant:'+id,value);return id;};
 const resolveGrant=async(id,mode)=>{if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid file permission.');const value=grants.get(id)||await credentials.get('grant:'+id);if(!value||value.mode!==mode||await fs.realpath(path.dirname(value.filename))!==value.parent)throw Error('Choose the file or folder again using the native picker.');return value.filename;};
 const ensureOpen=()=>{if(closed)throw Error('Application is closing.');};
 let converterPromise;
 async function converterService(){if(!converterPromise)converterPromise=(async()=>{let provider=sandboxProvider;if(!provider&&sandboxDirectory){try{const manifest=await readConverterManifest(path.join(sandboxDirectory,'manifest.json'));let mediaRuntime;try{const media=await readConverterManifest(path.join(sandboxDirectory,'media','manifest.json'));if(media.ffmpeg!=='ffmpeg.exe'||media.ffprobe!=='ffprobe.exe'||![media.ffmpegSha256,media.ffprobeSha256].every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)))throw Error('Invalid media manifest.');mediaRuntime={ffmpegPath:path.join(sandboxDirectory,'media',media.ffmpeg),ffmpegSha256:media.ffmpegSha256,ffprobePath:path.join(sandboxDirectory,'media',media.ffprobe),ffprobeSha256:media.ffprobeSha256};}catch{/* Optional media failure does not disable other conversion adapters. */}const{createWindowsSandboxProvider}=await import('../features/converter/windows-sandbox.mjs');provider=await createWindowsSandboxProvider({mediaRuntime,launcherPath:path.join(sandboxDirectory,'ConverterSandbox.exe'),launcherSha256:manifest.launcherSha256,runtimePath:path.join(sandboxDirectory,'node.exe'),runtimeSha256:manifest.runtimeSha256,launcherCompanionHashes:manifest.launcherCompanionHashes});}catch{provider=null;}}const{createConverterService}=await import('../features/converter/service.mjs');converter=createConverterService({stateDirectory:path.join(dataDirectory,'conversion-queue'),resolveGrant,bundledProof:{pdfLib:true},sandboxProvider:provider});void converter.run();return converter;})();return converterPromise;}
 async function ollamaService(){if(!ollamaPromise)ollamaPromise=(async()=>{const{createOllamaService}=await import('../features/ollama/service.js');const{createNativeHardwareProbe}=await import('../features/ollama/native-hardware.js');const host=createNativeOllamaHost({dialog,getWindow,openExternal,credentials,dataDirectory});await host.initialize();ollama=createOllamaService({dataDir:path.join(dataDirectory,'local-models'),hardwareProbe:createNativeHardwareProbe(),...host.serviceOptions,runtimeController:createRuntimeController(host.runtimeOptions)});ollama.subscribe(modelEvent);return ollama;})();return ollamaPromise;}
 async function pick(properties,title){const result=await dialog.showOpenDialog(getWindow(),{title,properties});return result.canceled?[]:result.filePaths;}
 async function dispatch(feature,action,payload={}){
  ensureOpen();if(typeof feature!=='string'||typeof action!=='string'||!object(payload))throw Error('Invalid feature request.');bounded(payload);
  if(exiting&&!['status','catalog','models','cart','list','operations','cancel','control'].includes(action))throw Error('The application is waiting for active work before quitting.');
  if(feature==='converter'){
   if(action==='pickSources')return Promise.all((await pick(['openFile','multiSelections'],'Choose conversion sources')).map(filename=>grant(filename,'read')));
   if(action==='pickDestinationDirectory'){const chosen=await pick(['openDirectory','createDirectory'],'Choose conversion output folder');return chosen[0]?grant(chosen[0],'directory'):null;}
   if(action==='pickDestination'){const result=await dialog.showSaveDialog(getWindow(),{title:'Save converted file',defaultPath:'converted.'+(typeof payload.extension==='string'&&/^[a-z0-9]{1,12}$/.test(payload.extension)?payload.extension:'dat')});return result.canceled?null:grant(result.filePath,'write');}
   if(!['catalog','inspect','enqueue','list','control'].includes(action))throw Error('Unsupported conversion action.');const service=await converterService();return service[action](payload);
  }
  if(feature==='ollama'){
   if(action==='events'){const after=payload.after??0;if(!Number.isSafeInteger(after)||after<0)throw Error('Invalid event cursor.');const events=modelEvents.filter(({item})=>item.sequence>after).map(({item})=>item);return{events,cursor:modelSequence,gap:after>modelSequence||events.length!==modelSequence-after};}
   return(await ollamaService()).request(action,payload);
  }
  if(feature==='documentation'){
   if(!['catalog','changelog'].includes(action))throw Error('Unsupported documentation action.');
   const file=path.join(applicationRoot,'src/shared/documentation-catalog.json');const catalog=JSON.parse(await fs.readFile(file,'utf8'));return action==='catalog'?catalog:catalog.changelog||[];
  }
  if(feature==='status'&&action==='status')return(await statusPromise).snapshot();
  if(feature==='access'){
   if(['credentialGet','credentialSet','credentialDelete'].includes(action)&&!rendererCredentialKey(payload.key))throw Error('This protected record is reserved for the native process.');
   if(action==='credentialList'&&!['element-lock:','authenticator:','history:'].includes(payload.prefix))throw Error('This protected record prefix is reserved for the native process.');
   if(action==='credentialGet')return credentials.get(payload.key);
   if(action==='credentialSet')return credentials.set(payload.key,payload.value);
   if(action==='credentialDelete')return credentials.delete(payload.key);
   if(action==='credentialList')return credentials.list(payload.prefix);
   if(action==='openDataFolder'){await fs.mkdir(dataDirectory,{recursive:true});await openPath(dataDirectory);return true;}
   if(action==='dataFolder')return dataDirectory;
  }
  if(feature==='personalization'){
   if(action==='sharedRead'){try{return JSON.parse(await fs.readFile(settingsPath,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
   if(action==='sharedWrite'){const value=plainSettings(payload.value);let previous=null;try{previous=JSON.parse(await fs.readFile(settingsPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}if(previous?.enabled&&!sharedCredentialGranted)throw Error('Verify the existing local credential before changing the active mode.');sharedCredentialGranted=false;await fs.mkdir(dataDirectory,{recursive:true});const temporary=settingsPath+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temporary,encoded(value),{flag:'wx',mode:0o600});await fs.rename(temporary,settingsPath);}finally{await fs.rm(temporary,{force:true});}emit('personalization',{type:'sharedSettings',value});return true;}
   if(action==='setSharedCredential'){if(await credentials.get('shared:mode'))throw Error('A local credential already exists. Use the documented local recovery route to reset it.');if(typeof payload.password!=='string'||payload.password.length<1||payload.password.length>4096)throw Error('Enter a bounded credential.');const salt=randomBytes(32),hash=await scrypt(payload.password,salt,32);await credentials.set('shared:mode',{salt:salt.toString('base64'),hash:hash.toString('base64')});hash.fill(0);return true;}
   if(action==='verifySharedCredential'){const value=await credentials.get('shared:mode');if(!value||typeof payload.password!=='string'||payload.password.length>4096)return false;const actual=await scrypt(payload.password,Buffer.from(value.salt,'base64'),32);try{const expected=Buffer.from(value.hash,'base64');sharedCredentialGranted=expected.length===actual.length&&timingSafeEqual(actual,expected);return sharedCredentialGranted;}finally{actual.fill(0);}}
   if(action==='listFonts'){if(process.platform!=='win32')throw Error('Native font enumeration is unavailable on this platform.');const result=await executeFile('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command','Add-Type -AssemblyName System.Drawing; @((New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name } | Sort-Object -Unique) | ConvertTo-Json -Compress'],{windowsHide:true,timeout:10000,maxBuffer:1024*1024});const names=JSON.parse(result.stdout.replace(/^\uFEFF/,''));if(!Array.isArray(names)||names.some(name=>typeof name!=='string'||name.length>256))throw Error('Invalid native font inventory.');return names;}
   if(action==='fetchScheduleSource')return schedules.fetch(payload.source,{id:payload.id});
   if(action==='setScheduleCredential'||action==='clearScheduleCredential'){
    if(typeof payload.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(payload.id))throw Error('Choose a saved schedule.');
    const source=payload.source;
    if(!object(source)||source.type!=='home-assistant'||typeof source.url!=='string')throw Error('Choose a Home Assistant schedule.');
    let origin;try{origin=new URL(source.url).origin;}catch{throw Error('Enter a valid Home Assistant origin.');}
    const answer=await dialog.showMessageBox(getWindow(),{type:'warning',buttons:['Cancel',action==='setScheduleCredential'?'Store credential':'Clear credential'],defaultId:0,cancelId:0,title:'Home Assistant credential',message:action==='setScheduleCredential'?'Store this credential for the selected schedule?':'Clear this schedule credential?',detail:'Schedule: '+payload.id+'\nOrigin: '+origin+'\nThe credential is kept in operating-system protected storage and is never returned to the page.'});
    if(answer.response!==1)return {cancelled:true};
    const context={authorization:scheduleAuthorization,source};
    return action==='setScheduleCredential'?schedules.registerToken(payload.id,payload.token,context):schedules.deleteToken(payload.id,context);
   }
  }
  throw Error('Unsupported feature action.');
 }
 async function request(...args){pendingRequests++;try{return await dispatch(...args);}finally{pendingRequests--;}}
 return {request,credentials,beginExit(){exiting=true;},endExit(){exiting=false;},async pending(){return pendingRequests+(converter?await converter.pending():0)+(ollama?.operations().length||0);},async cancelAll(){await Promise.allSettled([converterPromise,ollamaPromise]);await Promise.all([converter?.cancelAll(),ollama?.cancelAll()]);},async checkpoint(summary,progress){return(await statusPromise).checkpoint(summary,progress);},async close(){closed=true;await schedules.dispose();await Promise.allSettled([converterPromise,ollamaPromise]);await converter?.close();await ollama?.dispose();await(await statusPromise).finish('waiting');grants.clear();}};
}
