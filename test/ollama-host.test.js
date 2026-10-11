import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createNativeOllamaHost,inspectAuthenticode} from '../src/main/ollama-host.js';
const digest=value=>createHash('sha256').update(value).digest('hex');
async function fixture(action){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ollama-host-'));try{const executable=path.join(directory,'ollama.exe'),bytes=Buffer.from('Synthetic non-executable test content.');await fs.writeFile(executable,bytes);await action({directory,executable,bytes});}finally{await fs.rm(directory,{recursive:true,force:true});}}
const manifest=bytes=>({sha256:digest(bytes),bytes:bytes.length,version:'test-version',sourceUrl:'https://github.com/ollama/ollama/releases/download/v0.0.0/ollama-windows-amd64.zip',artifactSha256:'a'.repeat(64),member:'ollama.exe'});
const store=()=>{const entries=new Map();return{get:async key=>entries.get(key),set:async(key,value)=>entries.set(key,value),entries};};
test('basename and file selection alone never establish trust',()=>fixture(async({directory,executable})=>{
  const host=createNativeOllamaHost({dataDirectory:directory,signatureInspector:async()=>({valid:false}),dialog:{showOpenDialog:async()=>({filePaths:[executable]}),showMessageBox:async()=>({response:0})}});
  assert.equal(await host.verifyExecutable(executable),false);assert.equal(await host.pickExecutable(),null);assert.equal(host.trustStatus().automaticTrust,false);assert.ok(host.trustStatus().limitation);
}));
test('reviewed pinned bytes require native consent and are rehashed before later use',()=>fixture(async({directory,executable,bytes})=>{
  const credentials=store();let reviews=0;
  const options={dataDirectory:directory,credentials,reviewedManifests:[manifest(bytes)],signatureInspector:async()=>({valid:false}),dialog:{showOpenDialog:async()=>({filePaths:[executable]}),showMessageBox:async()=>{reviews++;return{response:0};}}};
  const host=createNativeOllamaHost(options);assert.equal(await host.verifyExecutable(executable),false);assert.equal(await host.pickExecutable(),executable);assert.equal(reviews,1);assert.equal(await host.verifyExecutable(executable),true);
  assert.equal(await createNativeOllamaHost(options).verifyExecutable(executable),true);
  await fs.writeFile(executable,'Changed bytes');assert.equal(await host.verifyExecutable(executable),false);
}));
test('file changes during the native trust prompt prevent approval',()=>fixture(async({directory,executable,bytes})=>{
  const credentials=store();const host=createNativeOllamaHost({dataDirectory:directory,credentials,reviewedManifests:[manifest(bytes)],signatureInspector:async()=>({valid:false}),dialog:{showOpenDialog:async()=>({filePaths:[executable]}),showMessageBox:async()=>{await fs.writeFile(executable,'Replaced during confirmation');return{response:0};}}});
  await assert.rejects(host.pickExecutable(),/changed/);assert.equal(credentials.entries.size,0);
}));
test('working folder picker is restricted to the canonical owned root',()=>fixture(async({directory})=>{
  let selected=directory;const host=createNativeOllamaHost({dataDirectory:directory,dialog:{showOpenDialog:async()=>({filePaths:[selected]})}});const root=await host.initialize();assert.equal(root,path.join(directory,'local-models','profiles'));
  await assert.rejects(host.pickOwnedDirectory(),/within/);selected=root;assert.equal(await host.pickOwnedDirectory(),root);
}));
test('only the exact official installation URL can leave through native confirmation',()=>fixture(async({directory})=>{
  const opened=[];let response=1;const host=createNativeOllamaHost({dataDirectory:directory,openExternal:async url=>opened.push(url),dialog:{showMessageBox:async()=>({response})}});
  await assert.rejects(host.openOfficialPage('https://example.org'),/fixed official/);await host.openOfficialPage('https://ollama.com/download/windows');assert.equal(opened.length,0);response=0;await host.openOfficialPage('https://ollama.com/download/windows');assert.deepEqual(opened,['https://ollama.com/download/windows']);
}));
test('Authenticode must match an explicitly established publisher exactly',()=>fixture(async({directory,executable})=>{
  const base={dataDirectory:directory,publisherPolicies:[{publisher:'CN=Fixture Publisher',sourceUrl:'https://docs.ollama.com/windows'}]};
  assert.equal(await createNativeOllamaHost({...base,signatureInspector:async()=>({valid:true,publisher:'CN=Fixture Publisher Extra'})}).verifyExecutable(executable),false);
  assert.equal(await createNativeOllamaHost({...base,signatureInspector:async()=>({valid:false,publisher:'CN=Fixture Publisher'})}).verifyExecutable(executable),false);
  assert.equal(await createNativeOllamaHost({...base,signatureInspector:async()=>({valid:true,publisher:'CN=Fixture Publisher'})}).verifyExecutable(executable),true);
}));
test('signature inspection never invokes the target executable',async()=>{
  let called;const result=await inspectAuthenticode('C:\\Synthetic\\ollama.exe',{platform:'win32',systemRoot:'C:\\Windows',executeFile:async(...args)=>{called=args;return {stdout:JSON.stringify({valid:false,publisher:null})};}});
  assert.equal(result.valid,false);assert.ok(called[0].endsWith('powershell.exe'));assert.ok(called[1][4].includes('Get-AuthenticodeSignature'));assert.equal(called[2].windowsHide,true);
});
