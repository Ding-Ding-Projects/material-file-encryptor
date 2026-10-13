// Extracted packaged runtime verification. Installed/update acceptance is separate.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import * as asar from '@electron/asar';
import {openRendererBrowser} from './test-renderer-browser.mjs';

const verifierFiles=['packaged-renderer-runtime.mjs','test-renderer-browser.mjs','test-renderer-browser-cli.py','renderer-process-snapshot.py','renderer-launch-observer.mjs','renderer-launch-observer.py','renderer-native-path.mjs','renderer-native-path.py','supplemental-renderer-recovery.py'];
async function fileHashes(files){const result={};for(const [key,file]of Object.entries(files)){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);result[key]=hash.digest('hex');}return result;}
export async function packagedRendererVerifierHashes(root=fileURLToPath(new URL('./',import.meta.url))){return fileHashes(Object.fromEntries(verifierFiles.map(name=>[name,path.join(root,name)])));}
export async function assertPackagedRendererVerifierHashes(expected,root){if(JSON.stringify(await packagedRendererVerifierHashes(root))!==JSON.stringify(expected))throw new Error('Verifier files changed during packaged verification.');}

export async function inspectPackagedRendererTarget(expected) {
 if(!/^[a-f0-9]{40}$/.test(expected?.sourceCommit||'')||!/^\d+\.\d+\.\d+$/.test(expected?.version||''))throw new Error('Exact packaged source and version are required.');
 if(!path.isAbsolute(expected.executable||'')||path.basename(expected.executable)!=='MaterialFileEncryptor.exe')throw new Error('Expected the exact packaged executable path.');
 const executable=await fs.realpath(expected.executable);
 if(executable!==path.resolve(expected.executable))throw new Error('Packaged executable must be canonical without redirected paths.');
 const files={executable,asar:path.join(path.dirname(executable),'resources','app.asar'),nativeHost:path.join(path.dirname(executable),'resources','native','MaterialFileEncryptor.Host.exe')};
 for(const file of Object.values(files)){if(await fs.realpath(file)!==path.resolve(file)||(await fs.lstat(file)).isSymbolicLink())throw new Error('Packaged resource paths must be canonical regular files.');}
 if(!expected.hashes||Object.keys(expected.hashes).sort().join(',')!=='asar,executable,nativeHost'||Object.values(expected.hashes).some(value=>!/^[a-f0-9]{64}$/.test(value)))throw new Error('Exact executable, ASAR and native host hashes are required.');
 const hashes=await fileHashes(files);
 for(const key of Object.keys(files))if(hashes[key]!==expected.hashes[key])throw new Error(`Packaged ${key} hash differs from the intended release.`);
 const metadata=JSON.parse(asar.extractFile(files.asar,path.join('src','shared','build-metadata.json')).toString('utf8'));
 const manifest=JSON.parse(asar.extractFile(files.asar,'package.json').toString('utf8'));
 if(metadata.sourceCommit!==expected.sourceCommit||metadata.version!==expected.version||manifest.version!==expected.version||manifest.main!=='src/main/main.js')throw new Error('Packaged metadata does not match intended source, version and entry point.');
 // Read actual packaged entry bytes before relying on their verification seam.
 const main=asar.extractFile(files.asar,path.join('src','main','main.js')).toString('utf8');
 if(!main.includes('--verification-profile=')||!main.includes('--desktop-check')||!main.includes("app.setPath('userData', verificationProfile)"))throw new Error('Packaged isolated profile route is unavailable.');
 const rendererEntry=path.join('src','renderer','index.html');
 if(!asar.extractFile(files.asar,rendererEntry).length)throw new Error('Packaged renderer entry is empty.');
 const expectedUrl=pathToFileURL(path.join(files.asar,rendererEntry)).href;
 if(expected.expectedUrl!==undefined&&expected.expectedUrl!==expectedUrl)throw new Error('Expected packaged URL differs from the actual archive entry.');
 const after=await fileHashes(files);
 if(JSON.stringify(hashes)!==JSON.stringify(after))throw new Error('Packaged bytes changed during binding inspection.');
 return {kind:'extracted-packaged-runtime',sourceCommit:expected.sourceCommit,version:expected.version,executable,files,hashes,expectedUrl};
}

export async function openPackagedRendererTarget(expected,{evidenceRoot,runtime={},gracefulOnly=false}={}) {
 if(process.platform!=='win32')throw new Error('Packaged runtime launch requires Windows.');
 const target=await inspectPackagedRendererTarget(expected);
 if(!path.isAbsolute(evidenceRoot||''))throw new Error('An explicit absolute packaged evidence destination is required.');
 const scriptRoot=fileURLToPath(new URL('./',import.meta.url));
 const initialVerifierHashes=await packagedRendererVerifierHashes(scriptRoot);
 const {stdout}=await promisify(execFile)('git',['rev-parse','HEAD'],{cwd:path.dirname(scriptRoot),windowsHide:true,timeout:10000});
 const verifierSourceCommit=stdout.trim();
 if(!/^[a-f0-9]{40}$/.test(verifierSourceCommit))throw new Error('Verifier source identity is unavailable.');
 const receipt={version:1,kind:target.kind,target,verifierSourceCommit,verifierHashes:initialVerifierHashes,gracefulOnly,launched:false,connectionOwned:false,installedAcceptance:false,updateAcceptance:false,nativeCaptureVerified:false,initialSurfaceAcceptance:false};
 await fs.mkdir(evidenceRoot,{recursive:true});
 const preparedPath=path.join(evidenceRoot,'packaged-runtime-prepared.json');
 await fs.writeFile(preparedPath,JSON.stringify(receipt,null,2),{flag:'wx'});
 const revalidate=async()=>{
  await inspectPackagedRendererTarget(expected);
  await assertPackagedRendererVerifierHashes(initialVerifierHashes,scriptRoot);
 };
 let opened;
 try{opened=await openRendererBrowser(target.expectedUrl,{evidenceRoot,runtime:{...runtime,sourceCommit:verifierSourceCommit},packagedTarget:{...target,revalidate},gracefulOnly});}catch(error){
  Object.assign(receipt,{launched:null,runnerAttempted:true,processLaunchOutcome:'Unverified; inspect retained lifecycle outcomes.',error:error.message});
  await fs.writeFile(path.join(evidenceRoot,'packaged-runtime-launch-failure.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
  throw error;
 }
 Object.assign(receipt,{launched:true,connectionOwned:opened.connectionOwned,backend:opened.backend,runRoot:opened.runRoot,statePath:opened.statePath,windowObservation:opened.windowObservation});
 const destination=evidenceRoot||path.join(opened.runRoot,'evidence');
 await fs.mkdir(destination,{recursive:true});
 const receiptPath=path.join(destination,'packaged-runtime-binding.json');
 try {await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2),{flag:'wx'});}catch(error){await opened.close();throw error;}
 let closed=false,closePromise;
 const closeOnce=async()=>{
  if(closed)return receipt;
  const errors=[];
  try{await revalidate();}catch(error){errors.push(error);}
  try{receipt.closure=await opened.close();}catch(error){errors.push(error);}
  try{await revalidate();receipt.targetAndVerifierBytesUnchanged=true;}catch(error){errors.push(error);}
  receipt.closed=!!receipt.closure;receipt.finishedAt=new Date().toISOString();
  receipt.bindingAndClosurePassed=errors.length===0&&receipt.connectionOwned===true&&receipt.closure?.closure?.resourcesAbsent===true;
  if(errors.length)receipt.errors=errors.map(error=>error.message);
  const finalPath=path.join(destination,'packaged-runtime-final.json');
  await fs.writeFile(finalPath,JSON.stringify(receipt,null,2),{flag:'wx'});
  closed=true;
  if(errors.length)throw new AggregateError(errors,'Packaged runtime binding or closure failed.');
  return receipt;
 };
 const close=()=>gracefulOnly?(closePromise ||= closeOnce()):closeOnce();
 return {...opened,close,target,receiptPath,receipt};
}
