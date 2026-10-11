import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, scrypt as scryptCallback, timingSafeEqual, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { createStatusHubClient } from '../status-hub/status-hub-client.mjs';
import { collectWorktrees } from '../status-hub/worktree-inventory.mjs';
import { createApplicationStatus } from '../features/documentation/status-service.mjs';
const scrypt=promisify(scryptCallback);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const encoded=value=>JSON.stringify(value);
const keyPattern=/^(?:(?:profile:|lock:|element-lock:|authenticator:|history:|shared:|grant:)[a-zA-Z0-9:_.-]{1,160}|local-profile:v1)$/;
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

export function createFeatureServices({dataDirectory,applicationRoot,sandboxDirectory,safeStorage,dialog,getWindow,openPath,emit=()=>{},sandboxProvider}){
 const credentials=createCredentialStore({directory:dataDirectory,safeStorage});
 const grants=new Map();let converter,ollama,closed=false,sharedCredentialGranted=false;
 const statusPromise=createApplicationStatus({createClient:createStatusHubClient,clientOptions:{sessionId:'material-file-encryptor-'+randomUUID(),title:'Material File Encryptor',repository:'Ding-Ding-Projects/material-file-encryptor',branch:'main',machine:process.platform+' desktop',exitHooks:false},collectWorktrees,repoPath:applicationRoot});
 const settingsPath=path.join(dataDirectory,'shared-settings.json');
 const grant=async(filename,mode)=>{const id=randomUUID();const value={filename,mode,parent:await fs.realpath(path.dirname(filename))};grants.set(id,value);await credentials.set('grant:'+id,value);return id;};
 const resolveGrant=async(id,mode)=>{if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid file permission.');const value=grants.get(id)||await credentials.get('grant:'+id);if(!value||value.mode!==mode||await fs.realpath(path.dirname(value.filename))!==value.parent)throw Error('Choose the file or folder again using the native picker.');return value.filename;};
 const ensureOpen=()=>{if(closed)throw Error('Application is closing.');};
 let converterPromise;
 async function converterService(){if(!converterPromise)converterPromise=(async()=>{let provider=sandboxProvider;if(!provider&&sandboxDirectory){try{const manifest=JSON.parse(await fs.readFile(path.join(sandboxDirectory,'manifest.json'),'utf8'));const{createWindowsSandboxProvider}=await import('../features/converter/windows-sandbox.mjs');provider=await createWindowsSandboxProvider({launcherPath:path.join(sandboxDirectory,'ConverterSandbox.exe'),launcherSha256:manifest.launcherSha256,runtimePath:path.join(sandboxDirectory,'node.exe'),runtimeSha256:manifest.runtimeSha256,launcherCompanionHashes:manifest.launcherCompanionHashes});}catch{provider=null;}}const{createConverterService}=await import('../features/converter/service.mjs');converter=createConverterService({stateDirectory:path.join(dataDirectory,'conversion-queue'),resolveGrant,bundledProof:{pdfLib:true},sandboxProvider:provider});void converter.run();return converter;})();return converterPromise;}
 async function ollamaService(){if(!ollama){const{createOllamaService}=await import('../features/ollama/service.js');ollama=createOllamaService({dataDir:path.join(dataDirectory,'local-models')});ollama.subscribe(data=>emit('ollama',data));}return ollama;}
 async function pick(properties,title){const result=await dialog.showOpenDialog(getWindow(),{title,properties});return result.canceled?[]:result.filePaths;}
 async function request(feature,action,payload={}){
  ensureOpen();if(typeof feature!=='string'||typeof action!=='string'||!object(payload))throw Error('Invalid feature request.');bounded(payload);
  if(feature==='converter'){
   if(action==='pickSources')return Promise.all((await pick(['openFile','multiSelections'],'Choose conversion sources')).map(filename=>grant(filename,'read')));
   if(action==='pickDestinationDirectory'){const chosen=await pick(['openDirectory','createDirectory'],'Choose conversion output folder');return chosen[0]?grant(chosen[0],'directory'):null;}
   if(action==='pickDestination'){const result=await dialog.showSaveDialog(getWindow(),{title:'Save converted file',defaultPath:'converted.'+(typeof payload.extension==='string'&&/^[a-z0-9]{1,12}$/.test(payload.extension)?payload.extension:'dat')});return result.canceled?null:grant(result.filePath,'write');}
   if(!['catalog','inspect','enqueue','list','control'].includes(action))throw Error('Unsupported conversion action.');const service=await converterService();return service[action](payload);
  }
  if(feature==='ollama')return(await ollamaService()).request(action,payload);
  if(feature==='documentation'){
   if(!['catalog','changelog'].includes(action))throw Error('Unsupported documentation action.');
   const file=path.join(applicationRoot,'src/shared/documentation-catalog.json');const catalog=JSON.parse(await fs.readFile(file,'utf8'));return action==='catalog'?catalog:catalog.changelog||[];
  }
  if(feature==='status'&&action==='status')return(await statusPromise).snapshot();
  if(feature==='access'){
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
   if(action==='listFonts')return{families:['system-ui','Segoe UI','Arial','Georgia','Consolas'],complete:false,detail:'These standard families use local font fallback. Full installed-font enumeration is unavailable.'};
   if(action==='fetchScheduleSource')throw Error('No external schedule source has been paired. Configure an authenticated provider before enabling this schedule.');
  }
  throw Error('Unsupported feature action.');
 }
 return {request,credentials,async checkpoint(summary,progress){return(await statusPromise).checkpoint(summary,progress);},async close(){closed=true;await converter?.close();await ollama?.close?.();await(await statusPromise).finish('waiting');grants.clear();}};
}
