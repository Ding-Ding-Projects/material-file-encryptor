import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import * as asar from '@electron/asar';
import {inspectPackagedRendererTarget,openPackagedRendererTarget} from '../scripts/packaged-renderer-runtime.mjs';

async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-packaged-binding-unit-'));
 const source=path.join(root,'archive-source'),app=path.join(root,'app');
 for(const folder of ['src/main','src/shared','src/renderer'])await fs.mkdir(path.join(source,folder),{recursive:true});
 await fs.mkdir(path.join(app,'resources/native'),{recursive:true});
 await fs.writeFile(path.join(source,'package.json'),JSON.stringify({main:'src/main/main.js',version:'0.0.1'}));
 await fs.writeFile(path.join(source,'src/shared/build-metadata.json'),JSON.stringify({sourceCommit:'a'.repeat(40),version:'0.0.1'}));
 await fs.writeFile(path.join(source,'src/main/main.js'),"// Unit bytes only: --verification-profile= --desktop-check app.setPath('userData', verificationProfile)");
 await fs.writeFile(path.join(source,'src/renderer/index.html'),'<html><body>Unit archive fixture</body></html>');
 await asar.createPackage(source,path.join(app,'resources/app.asar'));
 await fs.writeFile(path.join(app,'MaterialFileEncryptor.exe'),'UNIT FIXTURE, NEVER EXECUTED');
 await fs.writeFile(path.join(app,'resources/native/MaterialFileEncryptor.Host.exe'),'UNIT HOST, NEVER EXECUTED');
 const files={executable:path.join(app,'MaterialFileEncryptor.exe'),asar:path.join(app,'resources/app.asar'),nativeHost:path.join(app,'resources/native/MaterialFileEncryptor.Host.exe')};
 const hashes={};for(const [key,file]of Object.entries(files))hashes[key]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
 return {root,expected:{executable:files.executable,sourceCommit:'a'.repeat(40),version:'0.0.1',hashes}};
}

test('packaged binding reads actual archive metadata and rejects wrong bytes, source, version and URL before launch',async()=>{
 const {expected}=await fixture();
 const target=await inspectPackagedRendererTarget(expected);
 assert.equal(target.sourceCommit,expected.sourceCommit);assert.equal(target.version,'0.0.1');assert.match(target.expectedUrl,/app\.asar\/src\/renderer\/index\.html$/);
 for(const changed of [{sourceCommit:'b'.repeat(40)},{version:'0.0.2'},{expectedUrl:'http://127.0.0.1/wrong'},{hashes:{...expected.hashes,executable:'0'.repeat(64)}}]){
  let called=false;
  await assert.rejects(openPackagedRendererTarget({...expected,...changed},{evidenceRoot:path.resolve('out/unit-only-never-created'),runtime:{command:async()=>{called=true;}}}));
  assert.equal(called,false);
 }
});

function runtimeFixture(target,events,{unknownClose=false,failedAbsence=false,failedConnection=false}={}){
 let port;
 const browser={contexts:()=>[{pages:()=>[{}]}],async newBrowserCDPSession(){return {async send(method){events.push(method);if(method==='Browser.close'&&unknownClose)return new Promise(()=>{});return method==='Target.getTargets'?{targetInfos:[{type:'page',url:target.expectedUrl,targetId:'owned'}]}:{};},async detach(){}};}};
 return {chromium:{executablePath:()=>process.execPath,async connectOverCDP(){return browser;}},async createTransport(){return {transport:{},async disconnect(){events.push('socket-disconnect');}};},async fetch(){return {async json(){return [{id:'owned',type:'page',url:target.expectedUrl,webSocketDebuggerUrl:`ws://127.0.0.1:${port}/devtools/page/owned`}];}};},async command(executable,args,input){
  const operation=args[1];events.push({operation,input,args});
  if(operation==='bind-client')return {client_ok:true,clientBinding:{clientIdentity:{pid:process.pid}}};
  if(operation==='launch'){
   assert.equal(input.executable,target.executable);
   assert.ok(input.arguments.includes('--desktop-check'));
   assert.ok(input.arguments.some(value=>value===`--verification-profile=${path.join(input.runRoot,'profile')}`));
   assert.equal(input.arguments.some(value=>value.startsWith('--app=')||value.startsWith('--user-data-dir=')),false);
   assert.equal(input.cdp.expectedUrl,target.expectedUrl);port=input.cdp.port;
   await fs.writeFile(args[3],JSON.stringify({fixtureOnly:true,process:{pid:123},desktop:'owned-packaged-unit'}));
  }
  if(operation==='prove-cdp'&&input?.clientPid){if(failedConnection)throw new Error('Owned peer remains unverified.');return {client_ok:true,clientIdentity:{pid:process.pid},establishedPeerPair:{clientPid:process.pid},exactUrl:target.expectedUrl,targetId:'owned'};}
  if(operation==='confirm-exit'&&failedAbsence)throw new Error('Recorded execution remains unverified.');
  if(operation==='confirm-exit'||operation==='cleanup')return {client_ok:true,recordedProcessesAbsent:true,desktopClosed:true};
  return {client_ok:true};
 }};
}

test('packaged runner uses isolated product arguments and preserves target/verifier binding through closure',{skip:process.platform!=='win32'},async()=>{
 const {root,expected}=await fixture(),events=[];
 const target=await inspectPackagedRendererTarget(expected);
 const opened=await openPackagedRendererTarget(expected,{evidenceRoot:path.join(root,'evidence'),runtime:runtimeFixture(target,events)});
 assert.equal(opened.receipt.target.sourceCommit,expected.sourceCommit);
 assert.notEqual(opened.receipt.verifierSourceCommit,expected.sourceCommit);
 assert.equal(opened.receipt.installedAcceptance,false);assert.equal(opened.receipt.nativeCaptureVerified,false);
 const final=await opened.close();
 assert.equal(final.bindingAndClosurePassed,true);assert.equal(final.targetAndVerifierBytesUnchanged,true);assert.equal(final.initialSurfaceAcceptance,false);
 assert.equal(events.filter(value=>value==='Browser.close').length,1);
 assert.equal((await fs.readFile(opened.receiptPath,'utf8')).includes('extracted-packaged-runtime'),true);
});

test('graceful-only packaged closure never invokes cleanup on unknown, absent or unproved outcomes',{skip:process.platform!=='win32'},async()=>{
 for(const options of [{unknownClose:true},{failedAbsence:true},{failedConnection:true}]){
  const {root,expected}=await fixture(),events=[];const target=await inspectPackagedRendererTarget(expected);
  const runtime={...runtimeFixture(target,events,options),gracefulTimeoutMs:10};
  let opened;
  if(options.failedConnection)await assert.rejects(openPackagedRendererTarget(expected,{evidenceRoot:path.join(root,'evidence'),runtime,gracefulOnly:true}));
  else {
   opened=await openPackagedRendererTarget(expected,{evidenceRoot:path.join(root,'evidence'),runtime,gracefulOnly:true});
   await assert.rejects(opened.close());
   assert.equal((await opened.close()).bindingAndClosurePassed,false);
   const retained=JSON.parse(await fs.readFile(path.join(root,'evidence/packaged-runtime-final.json')));assert.equal(retained.bindingAndClosurePassed,false);
  }
  assert.equal(events.some(value=>value.operation==='cleanup'),false);
  assert.equal(events.some(value=>value.args?.includes('--allow-saved-pid-kill')),false);
  assert.equal(events.filter(value=>value==='Browser.close').length,options.failedConnection?0:1);
  assert.equal(events.includes('socket-disconnect'),true);
  const attempts=(await fs.readdir(path.join(root,'evidence'))).filter(name=>name.startsWith('attempt-'));
  const retained=JSON.parse(await fs.readFile(path.join(root,'evidence',attempts[0],'helper-outcomes.normalized.json')));
  assert.equal(retained.closure.gracefulOnly,true);assert.equal(retained.profileRetained,true);
  if(options.unknownClose){assert.equal(retained.closure.closeResponse,'unknown');assert.equal(retained.closure.resourcesAbsent,true);}
  else assert.equal(retained.closure.resourcesAbsent,false);
 }
});

test('graceful-only ordinary successful closure still requires strict absence flags',{skip:process.platform!=='win32'},async()=>{
 const {root,expected}=await fixture(),events=[];const target=await inspectPackagedRendererTarget(expected);
 const opened=await openPackagedRendererTarget(expected,{evidenceRoot:path.join(root,'evidence'),runtime:runtimeFixture(target,events),gracefulOnly:true});
 const result=await opened.close();assert.equal(result.bindingAndClosurePassed,true);assert.equal(result.gracefulOnly,true);
 assert.equal(events.some(value=>value.operation==='cleanup'),false);assert.equal(events.filter(value=>value==='Browser.close').length,1);
});

test('changed packaged bytes cannot become acceptance and owned closure still runs',{skip:process.platform!=='win32'},async()=>{
 const {root,expected}=await fixture(),events=[];
 const target=await inspectPackagedRendererTarget(expected);
 const opened=await openPackagedRendererTarget(expected,{evidenceRoot:path.join(root,'evidence'),runtime:runtimeFixture(target,events)});
 await fs.appendFile(expected.executable,'CHANGED UNIT BYTES');
 await assert.rejects(opened.close(),/binding or closure failed/);
 assert.equal(events.filter(value=>value==='Browser.close').length,1);
 const final=JSON.parse(await fs.readFile(path.join(root,'evidence/packaged-runtime-final.json'),'utf8'));
 assert.equal(final.bindingAndClosurePassed,false);assert.equal(final.closed,true);
});
