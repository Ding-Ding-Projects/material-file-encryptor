import {createBrowserConverterAdapter} from './browser-converter.js';
import {createDocumentationCatalogService} from './documentation-catalog-service.js';
import {createServerManagerHost} from './server-manager-host.js';
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
import { REVIEWED_OLLAMA_MANIFESTS, OLLAMA_PUBLISHER_POLICIES } from './ollama-provenance.js';
import { createWorkflowServices } from './workflow-services.js';
import {createAppearanceImageService, APPEARANCE_IMAGE_REQUEST_BYTES} from './appearance-image-service.js';
import {createOllamaConfiguration} from './ollama-configuration.js';
import {collectInstalledFontMetadata,createFontScanAdmission} from './font-catalog.js';
import {createProtectedForgeAccounts} from './protected-forge-accounts.js';
import {createForgeWorkflow} from './forge-workflow.js';
import {createPublishProgressAdapter} from './browser-publish-adapter.js';
import {createExtensionStatusEnrollment} from './browser-status-enrollment.js';
import {createProtectedForgeDeviceTransport} from './protected-forge-device-transport.js';
import {createBrowserServerAdapters} from './browser-server-adapters.js';
import {createAccessIntegration,readExtensionElementLocks,setExtensionElementLock} from './access-integration.js';
import {createAccessMutationHistory} from './access-mutation-history.js';
import {createStartupPhotoService} from './startup-photo-service.js';
const scrypt=promisify(scryptCallback);
const executeFile=promisify(execFile);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const encoded=value=>JSON.stringify(value);
const keyPattern=/^(?:(?:profile:|forge-account:|lock:|authenticator:|history:|shared:|grant:|schedule:)[a-zA-Z0-9:_.-]{1,160}|element-lock:[^\x00-\x1f\x7f]{1,256}|local-profile:v1)$/;
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
 async function write(data){const text=encoded(data);if(Buffer.byteLength(text)>4*1024*1024)throw Error('Protected record store exceeds its limit.');await fs.mkdir(directory,{recursive:true});const temporary=filename+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temporary,text,{mode:0o600,flag:'wx'});await fs.rename(temporary,filename);}finally{await fs.rm(temporary,{force:true});}}
 const revisionKey="__protected_record_revisions_v1";
 function revisions(data){if(!Object.hasOwn(data,revisionKey))return {};const value=JSON.parse(safeStorage.decryptString(Buffer.from(data[revisionKey],"base64")));if(!object(value)||Object.entries(value).some(([key,revision])=>!keyPattern.test(key)||typeof revision!=="string"||!/^[a-f0-9-]{36}$/.test(revision)))throw Error("Invalid protected revision index.");return value;}
 function advanceRevision(data,key){const index=revisions(data),revision=randomUUID();index[key]=revision;bounded(index,1024*1024);data[revisionKey]=safeStorage.encryptString(encoded(index)).toString("base64");return revision;}
 function mutate(action){const next=chain.catch(()=>{}).then(action);chain=next;return next;}
 return {
  async get(key){check(key);available();await chain;const data=await read();if(!Object.hasOwn(data,key))return null;return JSON.parse(safeStorage.decryptString(Buffer.from(data[key],'base64')));},
  set(key,value){check(key);available();bounded(value);return mutate(async()=>{const data=await read();data[key]=safeStorage.encryptString(encoded(value)).toString('base64');advanceRevision(data,key);await write(data);});},
  compareAndSet(key,expected,replacement){check(key);available();bounded(expected);bounded(replacement);const expectedText=encoded(expected),replacementText=encoded(replacement);return mutate(async()=>{available();const data=await read();const current=Object.hasOwn(data,key)?safeStorage.decryptString(Buffer.from(data[key],'base64')):'null';if(encoded(JSON.parse(current))!==expectedText)return false;if(replacementText==='null')delete data[key];else data[key]=safeStorage.encryptString(replacementText).toString('base64');advanceRevision(data,key);await write(data);return true;});},
  delete(key){check(key);return mutate(async()=>{const data=await read();available();delete data[key];advanceRevision(data,key);await write(data);});},
  async readVersioned(key){check(key);available();await chain;const data=await read();return{value:Object.hasOwn(data,key)?JSON.parse(safeStorage.decryptString(Buffer.from(data[key],'base64'))):null,revision:revisions(data)[key]||null};},
  compareAndSetVersioned(key,expectedRevision,replacement){check(key);available();if(expectedRevision!==null&&(typeof expectedRevision!=='string'||!/^[a-f0-9-]{36}$/.test(expectedRevision)))throw Error('Invalid protected record revision.');bounded(replacement);const replacementText=encoded(replacement);return mutate(async()=>{available();const data=await read(),currentRevision=revisions(data)[key]||null;if(currentRevision!==expectedRevision)return{updated:false,revision:currentRevision};if(replacementText==='null')delete data[key];else data[key]=safeStorage.encryptString(replacementText).toString('base64');const revision=advanceRevision(data,key);await write(data);return{updated:true,revision};});},
  async list(prefix){if(typeof prefix!=='string'||!keyPattern.test(prefix+'x'))throw Error('Invalid protected record prefix.');await chain;return Object.keys(await read()).filter(key=>key.startsWith(prefix));}
 };
}

export async function readConverterManifest(filename) {
 return JSON.parse((await fs.readFile(filename,'utf8')).replace(/^\uFEFF/,''));
}

export function sanitizeConverterDiagnostic(record){const safe={schema:1,component:['provider','media','archive'].includes(record?.component)?record.component:'provider',phase:['initialize','manifest','configuration','proof','factory','media-initialize','media-probe','media-encode','media-validate','provider-verify','provider-copy','provider-launch','provider-native','provider-receipt','provider-output'].includes(record?.phase)?record.phase:'initialize',code:['ENOENT','EACCES','EPERM','EINVAL','ENOTDIR','EISDIR','ENOSPC','ETIMEDOUT','ABORT_ERR','INVALID_MANIFEST','MISSING_SANDBOX_DIRECTORY','PROVIDER_ABSENT','OS_ISOLATION_UNVERIFIED','MEDIA_RUNTIME_UNVERIFIED','RECEIPT_INVALID','NATIVE_EXIT_FAILED','PROVIDER_TIMEOUT','SPAWN_FAILED','WORKER_FAILED'].includes(record?.code)?record.code:'INITIALIZATION_FAILED',errorName:['Error','TypeError','RangeError','SyntaxError'].includes(record?.errorName)?record.errorName:'Error'};for(const key of ['launcherExitCode','workerExitCode','nativeError','nativeHresult']){const value=record?.[key];if(Number.isSafeInteger(value)&&value>=-2147483648&&value<=4294967295)safe[key]=value;}return safe;}

export function converterUnavailableError(record){const safe=sanitizeConverterDiagnostic(record);const fields=['launcherExitCode','workerExitCode','nativeError','nativeHresult'].filter(key=>Object.hasOwn(safe,key)).map(key=>key+'='+safe[key]);return new Error(`Isolated image decoding unavailable: ${safe.component}/${safe.phase}/${safe.code}${fields.length?' ['+fields.join(', ')+']':''}.`);}

const PASSIVE_READS=new Set(['surprise:resolvePublishedDish','converter:catalog','converter:list','workflow:documents','workflow:templates','workflow:editors','workflow:downloads','workflow:accounts','updates:status','ollama:status','ollama:catalog','ollama:models','ollama:hardware','ollama:cart','ollama:sessions','ollama:profiles','documentation:catalog','documentation:changelog','status:status','personalization:accessibilityState','personalization:sharedRead','personalization:listFonts','personalization:fontMetadata','server-manager:snapshot','server-manager:versions','server-manager:capabilities','server-manager:status','server-manager:runtimeStatus','access:credentialGet','access:credentialList','access:dataFolder']);
export function createFeatureServices({dataDirectory,applicationRoot,isPackaged=false,nativeRequest,toolsDirectory=applicationRoot?.endsWith('.asar')?path.join(path.dirname(applicationRoot),'tools'):path.join(applicationRoot||'','out','tools'),sandboxDirectory,safeStorage,dialog,getWindow,getMainFrame,openPath,openExternal,emit=()=>{},sandboxProvider,reviewedForgeClient=null,onConverterDiagnostic=()=>{},accessibilityState=()=>({known:false,enabled:false,source:'runtime'}),nativeProfilePrompt,cancelNativeProfilePrompt=()=>{}}){
 const documentation=createDocumentationCatalogService({filename:path.join(applicationRoot,'src/shared/documentation-catalog.json'),immutable:isPackaged===true});
 const credentials=createCredentialStore({directory:dataDirectory,safeStorage});
 const mutationHistory=createAccessMutationHistory({dataDirectory,toolsDirectory});
 const access=createAccessIntegration({dataDirectory,toolsDirectory,credentials,getMainFrame,recordMutation:event=>mutationHistory.record(event)});
 const scheduleAuthorization={};
 const schedules=createScheduleSource({credentials,authorizeCredentialMutation:context=>context?.authorization===scheduleAuthorization});
 const servers=createServerManagerHost({dataDirectory,nativeRequest,confirmRuntime:async candidate=>(await dialog.showMessageBox(getWindow(),{type:'question',title:'Prepare reviewed portable Java · 準備已審核可攜 Java',message:'Download and verify this exact Java runtime for the prepared server? · 為已準備伺服器下載同驗證呢個確實 Java 執行環境？',detail:'Server version: '+candidate.version+'\nJava major: '+candidate.majorVersion+'\nRuntime release: '+candidate.release+'\nExact bytes: '+candidate.bytes+'\nSHA-256: '+candidate.sha256+'\nSource: '+candidate.sourceUrl+'\nThis prepares owned portable files only. It does not execute Java or accept the server license.',buttons:['Cancel · 取消','Trust and prepare exact runtime · 信任並準備確實執行環境'],defaultId:0,cancelId:0})).response===1,confirmLicense:async contract=>(await dialog.showMessageBox(getWindow(),{type:'question',title:'Review server license',message:'Accept the Minecraft End User License Agreement for this prepared server?',detail:'Version: '+contract.version+'\nDistribution SHA-256: '+contract.distributionSha256+'\n'+contract.url,buttons:['Cancel','Accept this server license'],defaultId:0,cancelId:0})).response===1,emit:data=>emit('server-manager',data)});
 const protectedForgeTransport=createProtectedForgeDeviceTransport({toolsDirectory});
 const protectedAccounts=createProtectedForgeAccounts({credentialStore:credentials,reviewedClient:reviewedForgeClient,...protectedForgeTransport,onChallenge:item=>emit('workflow',{type:'forge-authentication',item})});
 const forgeService=createForgeWorkflow({dataDirectory,toolsDirectory,protectedAccounts,onAuthenticationChallenge:item=>emit('workflow',{type:'forge-authentication',item})});
 const workflows=createWorkflowServices({dataDirectory,toolsDirectory,protectedAccounts,forgeService,dialog,getWindow,openPath,openExternal,emit});
 // Browser publication and status enrollment reuse the desktop forge account and status-hub client; neither is a new transport.
 const extensionStatus=createExtensionStatusEnrollment({createClient:createStatusHubClient,clientOptions:{repository:'Ding-Ding-Projects/material-file-encryptor',branch:'main',machine:process.platform+' desktop'}});
 const browserPublishAdapters={publishProgress:createPublishProgressAdapter({forge:forgeService})};
 const browserStatusAdapters={enrollStatusClient:report=>{ensureOpen();return extensionStatus.enroll(report);}};
 const startupPhotos=createStartupPhotoService({dataDirectory,toolsDirectory});
 const fontMetadataAdmission=createFontScanAdmission();const cancelFontMetadata=()=>fontMetadataAdmission.cancelAll();
 const grants=new Map();let converter,ollama,ollamaPromise,closed=false,exiting=false,sharedCredentialGranted=false,pendingRequests=0;
 const modelEvents=[];let modelSequence=0,modelEventBytes=0,activeOllamaRequests=0;
 const ollamaConfiguration=createOllamaConfiguration({directory:dataDirectory});
 function modelEvent(data){const item={sequence:++modelSequence,data};const bytes=Buffer.byteLength(JSON.stringify(item));if(bytes<=524288){modelEvents.push({item,bytes});modelEventBytes+=bytes;}while(modelEvents.length>128||modelEventBytes>524288){modelEventBytes-=modelEvents.shift().bytes;}emit('ollama',data);}
 const statusPromise=createApplicationStatus({createClient:createStatusHubClient,clientOptions:{sessionId:'material-file-encryptor-'+randomUUID(),title:'Material File Encryptor',repository:'Ding-Ding-Projects/material-file-encryptor',branch:'main',machine:process.platform+' desktop',exitHooks:false},collectWorktrees,repoPath:applicationRoot});
 const settingsPath=path.join(dataDirectory,'shared-settings.json');
 const grant=async(filename,mode)=>{const id=randomUUID();const value={filename,mode,parent:await fs.realpath(path.dirname(filename))};grants.set(id,value);await credentials.set('grant:'+id,value);return id;};
 const resolveGrant=async(id,mode)=>{if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid file permission.');const value=grants.get(id)||await credentials.get('grant:'+id);if(!value||value.mode!==mode||await fs.realpath(path.dirname(value.filename))!==value.parent)throw Error('Choose the file or folder again using the native picker.');return value.filename;};
 const ensureOpen=()=>{if(closed)throw Error('Application is closing.');};
 // The one writer for the shared mode record. The desktop screen and the browser channel both end here.
 async function persistShared(value){await fs.mkdir(dataDirectory,{recursive:true});const temporary=settingsPath+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temporary,encoded(value),{flag:'wx',mode:0o600});await fs.rename(temporary,settingsPath);}finally{await fs.rm(temporary,{force:true});}emit('personalization',{type:'sharedSettings',value});return true;}
 async function readShared(){try{return JSON.parse(await fs.readFile(settingsPath,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 let converterPromise, converterProvider;
 const converterDiagnostics=[];
 function converterDiagnostic(record){const safe=sanitizeConverterDiagnostic(record);converterDiagnostics.push(safe);if(converterDiagnostics.length>8)converterDiagnostics.shift();try{onConverterDiagnostic(safe);}catch{}return safe;}
 function manifestDiagnostic(error,component){return converterDiagnostic({component,phase:'manifest',code:error?.name==='SyntaxError'?'INVALID_MANIFEST':error?.code,errorName:error?.name});}
 function unavailable(record){return converterUnavailableError(record);}
 const imageService=createAppearanceImageService({getProvider:async()=>{try{await converterService();}catch(error){throw unavailable(converterDiagnostic({component:'provider',phase:'factory',code:error?.code,errorName:error?.name}));}if(!converterProvider){const diagnostic=converterDiagnostics.findLast(d=>d.component==='provider')||converterDiagnostic({component:'provider',phase:'proof',code:'PROVIDER_ABSENT'});throw unavailable(diagnostic);}if(converterProvider.verifiedOsIsolation!==true)throw unavailable(converterDiagnostic({component:'provider',phase:'proof',code:'OS_ISOLATION_UNVERIFIED'}));if(converterProvider.verifiedMediaRuntime!==true){const diagnostic=converterDiagnostics.findLast(d=>d.component==='media')||converterDiagnostic({component:'media',phase:'proof',code:'MEDIA_RUNTIME_UNVERIFIED'});throw unavailable(diagnostic);}return converterProvider;}});
 async function converterService(){if(!converterPromise)converterPromise=(async()=>{let provider=sandboxProvider;if(!provider&&sandboxDirectory){try{const manifest=await readConverterManifest(path.join(sandboxDirectory,'manifest.json'));let mediaRuntime;try{const media=await readConverterManifest(path.join(sandboxDirectory,'minimal-media','manifest.json'));if(media.profile!=='minimal-v1'||media.ffmpeg!=='ffmpeg.exe'||media.ffprobe!=='ffprobe.exe'||![media.ffmpegSha256,media.ffprobeSha256].every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)))throw Object.assign(new Error('Invalid media manifest.'),{code:'INVALID_MANIFEST'});mediaRuntime={profile:media.profile,ffmpegPath:path.join(sandboxDirectory,'minimal-media',media.ffmpeg),ffmpegSha256:media.ffmpegSha256,ffprobePath:path.join(sandboxDirectory,'minimal-media',media.ffprobe),ffprobeSha256:media.ffprobeSha256};}catch(error){manifestDiagnostic(error,'media');}let archiveRuntime;try{const archive=await readConverterManifest(path.join(sandboxDirectory,'archive-manifest.json'));if(archive.schema!==1||archive.version!=='26.04'||!['7z.exe','7z.dll'].every(name=>typeof archive.files?.[name]==='string'&&/^[a-f0-9]{64}$/.test(archive.files[name])))throw Object.assign(new Error('Invalid archive runtime manifest.'),{code:'INVALID_MANIFEST'});archiveRuntime={sevenZipPath:path.join(sandboxDirectory,'archive','7z.exe'),sevenZipSha256:archive.files['7z.exe'],sevenZipDllPath:path.join(sandboxDirectory,'archive','7z.dll'),sevenZipDllSha256:archive.files['7z.dll']};}catch(error){manifestDiagnostic(error,'archive');}const{createWindowsSandboxProvider}=await import('../features/converter/windows-sandbox.mjs');provider=await createWindowsSandboxProvider({mediaRuntime,archiveRuntime,launcherPath:path.join(sandboxDirectory,'ConverterSandbox.exe'),launcherSha256:manifest.launcherSha256,runtimePath:path.join(sandboxDirectory,'node.exe'),runtimeSha256:manifest.runtimeSha256,launcherCompanionHashes:manifest.launcherCompanionHashes,onDiagnostic:converterDiagnostic});}catch(error){if(!error.converterDiagnostic)converterDiagnostic({schema:1,component:'provider',phase:'manifest',code:['ENOENT','EACCES','EPERM'].includes(error.code)?error.code:'INITIALIZATION_FAILED',errorName:['Error','TypeError','SyntaxError'].includes(error.name)?error.name:'Error'});provider=null;}}else if(!provider){converterDiagnostic({component:'provider',phase:'configuration',code:'MISSING_SANDBOX_DIRECTORY'});}converterProvider=provider;const{createConverterService}=await import('../features/converter/service.mjs');converter=createConverterService({stateDirectory:path.join(dataDirectory,'conversion-queue'),resolveGrant,bundledProof:{pdfLib:true},sandboxProvider:provider});void converter.run();return converter;})();return converterPromise;}
 async function ollamaService(){if(!ollamaPromise)ollamaPromise=(async()=>{const{createOllamaService}=await import('../features/ollama/service.js');const{createNativeHardwareProbe}=await import('../features/ollama/native-hardware.js');const host=createNativeOllamaHost({dialog,getWindow,openExternal,credentials,dataDirectory,nativeRequest,archiveToolsRoot:sandboxDirectory,loopbackPort:await ollamaConfiguration.read(),reviewedManifests:REVIEWED_OLLAMA_MANIFESTS,publisherPolicies:OLLAMA_PUBLISHER_POLICIES});await host.initialize();ollama=createOllamaService({dataDir:path.join(dataDirectory,'local-models'),hardwareProbe:createNativeHardwareProbe(),...host.serviceOptions,runtimeController:createRuntimeController(host.runtimeOptions)});ollama.subscribe(modelEvent);return ollama;})();return ollamaPromise;}
 async function pick(properties,title){const result=await dialog.showOpenDialog(getWindow(),{title,properties});return result.canceled?[]:result.filePaths;}
 async function dispatch(feature,action,payload={},context={}){
  ensureOpen();if(typeof feature!=='string'||typeof action!=='string'||!object(payload))throw Error('Invalid feature request.');bounded(payload,feature==='personalization'&&action==='normalizeImage'?APPEARANCE_IMAGE_REQUEST_BYTES:262144);
  if(exiting&&!['status','catalog','models','cart','list','operations','cancel','control','downloads','cancelDownload'].includes(action))throw Error('The application is waiting for active work before quitting.');
  if(feature==='server-manager'){if(exiting)throw Error('Application is closing.');return servers.dispatch(action,payload);}
  if(feature==='surprise'&&action==='resolvePublishedDish'){if(exiting||Reflect.ownKeys(payload).length)throw Error('Unsupported startup photo request.');return startupPhotos.resolvePublishedDish();}
  if(feature==='workflow')return workflows.dispatch(action,payload);
  if(feature==='access'&&access.supports(action))return access.request(context?.senderFrame,action,payload);
  if(feature==='converter'){
   if(action==='pickSources')return Promise.all((await pick(['openFile','multiSelections'],'Choose conversion sources')).map(filename=>grant(filename,'read')));
   if(action==='pickDestinationDirectory'){const chosen=await pick(['openDirectory','createDirectory'],'Choose conversion output folder');return chosen[0]?grant(chosen[0],'directory'):null;}
   if(action==='pickDestination'){const result=await dialog.showSaveDialog(getWindow(),{title:'Save converted file',defaultPath:'converted.'+(typeof payload.extension==='string'&&/^[a-z0-9]{1,12}$/.test(payload.extension)?payload.extension:'dat')});return result.canceled?null:grant(result.filePath,'write');}
   if(!['catalog','inspect','enqueue','list','control'].includes(action))throw Error('Unsupported conversion action.');const service=await converterService();return service[action](payload);
  }
  if(feature==='ollama'){
   if(action==='configureRuntime')return ollamaConfiguration.apply(payload,{
    canChange:()=>!closed&&!exiting&&activeOllamaRequests===0&&!(ollama?.operations().length),
    confirm:async port=>(await dialog.showMessageBox(getWindow(),{type:'question',title:'Change local model connection',message:'Use the selected loopback port for local models?',detail:'Address: 127.0.0.1:'+port+'\nOnly an application-owned runtime will be stopped. External processes and their model files remain untouched.',buttons:['Cancel','Change port'],defaultId:0,cancelId:0})).response===1,
    retire:async()=>{await ollama?.dispose();ollama=null;ollamaPromise=null;modelEvents.length=0;modelEventBytes=0;emit('ollama',{type:'connectionChanged'});}
   });
   if(ollamaConfiguration.changing)throw Error('Local runtime configuration is changing.');
   if(action==='events'){const after=payload.after??0;if(!Number.isSafeInteger(after)||after<0)throw Error('Invalid event cursor.');const events=modelEvents.filter(({item})=>item.sequence>after).map(({item})=>item);return{events,cursor:modelSequence,gap:after>modelSequence||events.length!==modelSequence-after};}
   activeOllamaRequests++;try{return await (await ollamaService()).request(action,payload);}finally{activeOllamaRequests--;}
  }
  if(feature==='documentation'){
   if(!['catalog','changelog'].includes(action))throw Error('Unsupported documentation action.');
   return documentation.request(action);
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
   if(action==='accessibilityState'){const state=await accessibilityState();return{known:state?.known===true,enabled:state?.enabled===true,source:'runtime'};}
   if(action==='cancelFontMetadata')return fontMetadataAdmission.cancel(payload.requestId);
   if(action==='fontMetadata'){const requestId=payload.requestId||randomUUID();return fontMetadataAdmission.run(requestId,signal=>collectInstalledFontMetadata({signal,onProgress:progress=>emit('personalization',{type:'fontMetadataProgress',requestId,...progress})}));}
   if(action==='normalizeImage')return imageService.normalize(payload);
   if(action==='sharedRead'){try{return JSON.parse(await fs.readFile(settingsPath,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
   if(action==='sharedWrite'){const value=plainSettings(payload.value);let previous=null;try{previous=JSON.parse(await fs.readFile(settingsPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}if(previous?.enabled&&!sharedCredentialGranted)throw Error('Verify the existing local credential before changing the active mode.');sharedCredentialGranted=false;return persistShared(value);}
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
 // Only work that must finish before exit is pending. A read that never
 // settles must not hold the application open or report active transfers.
 async function request(feature,action,...rest){const counted=!PASSIVE_READS.has(`${feature}:${action}`);if(counted)pendingRequests++;try{return await dispatch(feature,action,...rest);}finally{if(counted)pendingRequests--;}}
 const browserConverter=createBrowserConverterAdapter({getService:converterService,releaseGrant:async id=>{const expected=grants.get(id);if(!expected)throw Error('Owned conversion grant is unavailable.');if(!await credentials.compareAndSet('grant:'+id,expected,null))throw Error('Owned conversion grant changed before disposal.');if(grants.get(id)===expected)grants.delete(id);},
  pickSource:async({language,check})=>{check();const text=(en,yue)=>language==='yue'?yue:language==='bilingual'?en+' · '+yue:en;const result=await dialog.showOpenDialog(getWindow(),{title:text('Choose one conversion source','揀一個轉換來源'),properties:['openFile']});check();if(result.canceled||result.filePaths.length!==1)return null;return grant(result.filePaths[0],'read');},
  pickDestination:async({language,extension,check})=>{check();const text=(en,yue)=>language==='yue'?yue:language==='bilingual'?en+' · '+yue:en;const result=await dialog.showSaveDialog(getWindow(),{title:text('Choose a new conversion output','揀新嘅轉換輸出'),defaultPath:'converted.'+extension});check();return result.canceled?null:grant(result.filePath,'write');},
  confirm:async({kind,language,action,format,source,destination,check})=>{check();const text=(en,yue)=>language==='yue'?yue:language==='bilingual'?en+' · '+yue:en;let detail=text('File paths and contents stay on the desktop.','檔案路徑同內容只留喺桌面。');
   if(kind==='enqueue'){const from=await resolveGrant(source,'read');check();const to=await resolveGrant(destination,'write');check();const disclosures={'json-format':['Formats JSON as UTF-8; embedded metadata is not copied.','將 JSON 格式化為 UTF-8，唔複製內嵌中繼資料。'],'text-utf8':['Normalizes line endings to LF and removes a UTF-8 BOM.','將換行正規化為 LF，並移除 UTF-8 BOM。'],'base64':['Encodes exact source bytes as ASCII Base64.','將來源確實位元組編碼為 ASCII Base64。'],'hex':['Encodes exact source bytes as ASCII hexadecimal.','將來源確實位元組編碼為 ASCII 十六進位。']};detail=text('Source','來源')+': '+from+'\n'+text('Destination','目的地')+': '+to+'\n'+format.id+'\n'+text(...disclosures[format.id])+'\n'+text('Sources remain unchanged. Existing outputs are never replaced. After acceptance, work continues on the desktop even if the browser disconnects.','來源保持不變，唔會覆寫現有輸出。接受之後，即使瀏覽器中斷連線，桌面工作仍會繼續。');}
   const actions={pause:['Pause','暫停'],resume:['Resume','恢復'],cancel:['Cancel job','取消工作']};const button=kind==='prepare'?text('Choose source','揀來源'):kind==='enqueue'?text('Convert','轉換'):text(...actions[action]);
   const answer=await dialog.showMessageBox(getWindow(),{type:'question',title:text('Browser conversion request','瀏覽器轉換要求'),message:kind==='control'?button+'?':kind==='prepare'?text('Choose a local file to inspect for conversion?','揀本機檔案作轉換檢查？'):text('Accept this local conversion?','接受今次本機轉換？'),detail,buttons:[text('Go back','返回'),button],defaultId:0,cancelId:0});check();return answer.response===1;}
 });
 const browserProfileAdapters=typeof nativeProfilePrompt==='function'?{
  async authenticateProfile({origin,profileId,operation,target,signal}){
   if(profileId!=='local-profile'||operation!=='read-profile-summary'||target!=='profile-summary'||typeof origin!=='string'||!/^chrome-extension:\/\/[a-p]{32}\/$/.test(origin))throw Error('Unsupported native profile scope.');
   const check=()=>{ensureOpen();if(exiting||signal?.aborted)throw Error('Native profile authentication cancelled.');};check();
   const status=await access.nativeProfileStatus({signal});check();
   const proof=await nativeProfilePrompt({origin,signal,status,check,verify:(password,context)=>{check();return access.authenticateNativeProfile(password,context);}});check();
   if(!await access.validateNativeProfileAuthority({...proof,signal}))throw Error('Native profile authority expired.');check();return proof;
  },
  async validateAuthority(context){ensureOpen();if(exiting||context?.signal?.aborted)return false;const valid=await access.validateNativeProfileAuthority(context);ensureOpen();return !exiting&&!context?.signal?.aborted&&valid;},
  async readProfileSummary(context){ensureOpen();if(exiting)throw Error('Native profile authority expired.');const result=await access.readNativeProfileSummary(context);ensureOpen();if(exiting)throw Error('Native profile authority expired.');return result;},
 }:null;
 // School mode over the browser channel. Reads need only a pairing. A change needs a fresh native vault-password
 // check in the desktop (no Windows Hello integration exists in this build), then the same writer the desktop uses.
 const browserSchoolAdapters={
  async readSchoolMode(){ensureOpen();const value=await readShared();ensureOpen();if(value===null)return {enabled:false,name:'School mode'};if(!object(value)||typeof value.enabled!=='boolean')throw Error('Shared mode record is unavailable.');return {enabled:value.enabled,name:typeof value.name==='string'?value.name:'School mode'};},
  async authenticateSchoolMode({origin,signal}){
   if(typeof nativeProfilePrompt!=='function'||typeof origin!=='string'||!/^chrome-extension:\/\/[a-p]{32}\/$/.test(origin))return 'unavailable';
   const check=()=>{ensureOpen();if(exiting||signal?.aborted)throw Error('Native profile authentication cancelled.');};check();
   try{
    const status=await access.nativeProfileStatus({signal});check();
    if(status.configured!==true)return 'unavailable';
    const proof=await nativeProfilePrompt({origin,signal,status,check,verify:(password,context)=>{check();return access.authenticateNativeProfile(password,context);}});check();
    return await access.validateNativeProfileAuthority({...proof,signal})===true;
   }finally{try{access.revokeNativeProfile();}catch{}}
  },
  async applySchoolMode({enabled}){
   ensureOpen();if(typeof enabled!=='boolean')throw Error('Invalid school mode request.');
   const previous=await readShared();const was=previous?.enabled===true;
   if(previous!==null&&!object(previous))throw Error('Shared mode record is unavailable.');
   if(was===enabled)return {state:'unchanged',enabled};
   // A mode protected by its own local credential can only be turned off where that credential is checked: on the desktop.
   if(was&&!enabled&&await credentials.get('shared:mode'))return {state:'rejected',enabled:true};
   const name=typeof previous?.name==='string'&&previous.name.trim()&&previous.name.length<=80?previous.name:'School mode';
   await persistShared(plainSettings({...(previous||{}),enabled,name}));
   return {state:'changed',enabled};
  },
 };
 // Element locks for the reviewed extension targets. Reads need only a pairing; a change (lock or unlock) needs the same
 // fresh native vault-password check as school mode, then writes through the access integration's protected records.
 const browserElementLockAdapters={
  async readElementLocks(){ensureOpen();const list=await readExtensionElementLocks(credentials);ensureOpen();return list;},
  authenticateElementLock:context=>browserSchoolAdapters.authenticateSchoolMode(context),
  async applyElementLock({target,locked}){ensureOpen();const result=await setExtensionElementLock(credentials,{target,locked});ensureOpen();return result;},
 };
 // Server manager over the browser channel. Reads need only a pairing; create, start, stop and restart need the same fresh
 // native vault-password check, then run through the desktop server manager host. Nothing else is offered.
 const browserServerAdapters=createBrowserServerAdapters({dispatch:(action,payload)=>servers.dispatch(action,payload),ensureOpen:()=>{ensureOpen();if(exiting)throw Error('Application is closing.');},authenticate:context=>browserSchoolAdapters.authenticateSchoolMode(context)});
 // Unlock ladder over the browser channel. The read reports the profile's own waiting state; the step reuses the same fresh
 // native vault-password check, whose success clears the escalation through the desktop's own state machine. The desktop has
 // no profile credential recovery workflow, so recovery is always none.
 const browserUnlockLadderAdapters={
  async readUnlockLadder(){ensureOpen();const state=await access.readNativeWaitingLadder();ensureOpen();return {level:state.level,until:state.until,recovery:'none'};},
  authenticateUnlockStep:context=>browserSchoolAdapters.authenticateSchoolMode(context),
 };
 function revokeBrowserProfileAuthority(){cancelNativeProfilePrompt();access.revokeNativeProfile();}
 return {request,credentials,browserProfileAdapters,browserSchoolAdapters,browserElementLockAdapters,browserServerAdapters,browserUnlockLadderAdapters,browserPublishAdapters,browserStatusAdapters,revokeBrowserProfileAuthority,disposeBrowserConversion:pair=>browserConverter.dispose(pair),browserConversion(message,context){const check=()=>{ensureOpen();if(exiting)throw Error('Application is closing.');context.check();};check();return browserConverter(message,{...context,check});},openBrowserEditor(context){const check=()=>{ensureOpen();if(exiting)throw Error('Application is closing.');context.check();};check();return workflows.openBrowserEditor({...context,check});},async readBrowserProtectionStatus(){ensureOpen();if(exiting)throw Error('Application is closing.');const value=await access.protectionStatus();ensureOpen();if(exiting)throw Error('Application is closing.');return value;},receiveBrowserProposal(item){ensureOpen();if(exiting)throw Error('Application is closing.');return workflows.receiveBrowserProposal(item);},beginExit(){exiting=true;revokeBrowserProfileAuthority();},endExit(){exiting=false;},async pendingDetail(){return {requests:pendingRequests,servers:servers.pending,workflows:workflows.pending,converter:converter?await converter.pending():0,models:ollama?.operations().length||0};},async pending(){const detail=await this.pendingDetail();return Object.values(detail).reduce((sum,value)=>sum+value,0);},async cancelAll(){servers.cancelAll();cancelFontMetadata();workflows.cancelAll();await imageService.cancelAll();await Promise.allSettled([converterPromise,ollamaPromise]);await Promise.all([converter?.cancelAll(),ollama?.cancelAll()]);},async checkpoint(summary,progress){return(await statusPromise).checkpoint(summary,progress);},async close(){revokeBrowserProfileAuthority();closed=true;await extensionStatus.close();documentation.close();access.close();mutationHistory.close();startupPhotos.close();await servers.close();cancelFontMetadata();await schedules.dispose();await imageService.close();await workflows.close();await Promise.allSettled([converterPromise,ollamaPromise]);await converter?.close();await ollama?.dispose();await(await statusPromise).finish('waiting');grants.clear();}};
}
