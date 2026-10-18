import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createServer} from 'node:http';
import {vaultSessionChoices,vaultSessionAvailability} from '../src/renderer/vault-sessions.js';
import {openRendererBrowser,serveRendererFixture} from '../scripts/test-renderer-browser.mjs';
import {rendererFeatureFixtureScript} from './helpers/renderer-feature-fixture.js';

const sessions=[{sessionId:'main',driveName:'First',driveLetter:'M:',locked:false,mounted:true},{sessionId:'second',driveName:'Second',driveLetter:'N:',locked:true,mounted:false}];
test('session choices expose only display metadata and removal requires a safe locked session',()=>{
 const state={sessionId:'second',sessions};
 assert.deepEqual(vaultSessionChoices(state),[{id:'main',label:'First · M: · Mounted'},{id:'second',label:'Second · N: · Locked'}]);
 assert.deepEqual(vaultSessionAvailability(state),{switch:true,add:true,remove:true});
 for(const patch of [{locked:false},{mounted:true},{recoveryRequired:true},{operation:'locking'}])assert.equal(vaultSessionAvailability({...state,sessions:[sessions[0],{...sessions[1],...patch}]}).remove,false);
 assert.deepEqual(vaultSessionAvailability(state,true),{switch:false,add:false,remove:false});
 assert.equal(vaultSessionAvailability({sessionId:'second',sessions:[sessions[1]]}).remove,false);
 assert.equal(vaultSessionAvailability({sessionId:'main',sessions:[{...sessions[0],locked:true,mounted:false},sessions[1]]}).remove,false);
 assert.equal(vaultSessionChoices({sessions:[{...sessions[1],password:'secret',keyFilePath:'private'}]})[0].label.includes('secret'),false);
});
test('preload binds requests to session identity before delivering state callbacks',async()=>{
 const calls=[],listeners=new Map();let bridge;
 const context={require:()=>({contextBridge:{exposeInMainWorld:(_name,api)=>{bridge=api;}},ipcRenderer:{invoke:async(...args)=>{calls.push(args);return {sessionId:args[1]==='addSession'?'second':'main'};},on:(event,callback)=>listeners.set(event,callback),removeListener:()=>{}}})};
 vm.runInNewContext(await fs.readFile(new URL('../src/main/preload.cjs',import.meta.url),'utf8'),context);
 await bridge.status();await bridge.addSession();await bridge.open('file');
 assert.equal(calls.at(-1)[3],'second');
 bridge.onStatus(()=>bridge.lock());listeners.get('vault:state')(null,{sessionId:'third'});
 assert.equal(calls.at(-1)[3],'third');assert.equal(calls.at(-1)[1],'lockVault');
});
test('session change invalidates files, archives, confirmations and private form state',async()=>{
 const source=await fs.readFile(new URL('../src/renderer/app.js',import.meta.url),'utf8');
 const reset=source.slice(source.indexOf('function resetVaultPresentation()'),source.indexOf('function renderVaultSessions()'));
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'old-private-value',hidden:false,replaceChildren(){this.cleared=true;},setAttribute(){},reset(){},close(){this.open=false;}});return nodes.get(id);};
 let clearedFiles=0,clearedHistory=0,clearedDetails=0,rendered=0;
 const context={AbortController,DEFAULT_DRIVE_NAME:'Material Files',$:node,document:{querySelectorAll:()=>[]},closeDrivePicker:()=>{},setText:()=>{},clearMainError:()=>{},setArchiveMessage:()=>{},render:()=>rendered++,loadArchive:()=>{},fileSelection:{clear:()=>clearedFiles++},historySelection:{clear:()=>clearedHistory++},fileDetails:{selectEntry:()=>clearedDetails++},foundation:null};
 vm.createContext(context);vm.runInContext(`let vaultConfirmationLifetime=new AbortController(),filePageRequest=7,filePageRevision=1,fileNextCursor='old',pagedFiles=[{id:'old'}],renderedFilesKey='old',selected='old',recycledSelection=new Set(['old']),archiveRequests={history:4,recycle:5},archiveRenders={history:6,recycle:7},archiveRows={history:[1],recycle:[2]},historyRetentionDraft=true,historyRetentionRevision=1,driveLetterEdited=true,activeDriveLetter='M',operationNotifications=new Map(),fileSearch=null,historySearch=null,recycleSearch=null,state={sessionId:'main'},view='drive';const oldSignal=vaultConfirmationLifetime.signal;${reset};acceptVaultState({sessionId:'second'});globalThis.result={filePageRequest,filePageRevision,fileNextCursor,pagedFiles,selected,archiveRequests,archiveRenders,archiveRows,historyRetentionDraft,driveLetterEdited,aborted:oldSignal.aborted,sessionId:state.sessionId};`,context);
 const result=JSON.parse(JSON.stringify(context.result));
 assert.equal(result.filePageRequest,8);assert.equal(result.filePageRevision,null);assert.equal(result.fileNextCursor,null);assert.equal(result.pagedFiles,null);assert.equal(result.selected,null);assert.deepEqual(result.archiveRequests,{history:5,recycle:6});assert.deepEqual(result.archiveRenders,{history:7,recycle:8});assert.deepEqual(result.archiveRows,{history:[],recycle:[]});assert.equal(result.aborted,true);assert.equal(result.historyRetentionDraft,false);assert.equal(result.driveLetterEdited,false);assert.equal(result.sessionId,'second');
 assert.deepEqual([clearedFiles,clearedHistory,clearedDetails,rendered],[1,1,1,1]);
 for(const id of ['password-input','confirm-password','key-path','storage-input','cache-input','remote-repository'])assert.equal(node(id).value,'');
});
test('renderer switches mounted vaults, clears selections and secrets, and adds/removes a clean session',{timeout:60000},async t=>{
 const executable=process.env.CHROMIUM_PATH||(process.platform==='linux'?'/usr/bin/chromium':null);
 if(executable)try{await fs.access(executable);}catch{return t.skip('Set CHROMIUM_PATH to an installed Chromium executable.');}
 const server=createServer(serveRendererFixture);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  const url=`http://127.0.0.1:${server.address().port}`;browser=await openRendererBrowser(url);const page=browser.page;
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript({content:rendererFeatureFixtureScript(featureFixture=>{
   const summaries=[{sessionId:'main',driveName:'First',driveLetter:'M:',locked:false,mounted:true},{sessionId:'second',driveName:'Second',driveLetter:'N:',locked:false,mounted:true}];let selected='main',subscriber=()=>{};
   const snapshot=()=>({...summaries.find(row=>row.sessionId===selected),sessions:structuredClone(summaries),storageDir:selected==='main'?'C:\\First':'C:\\Second',cacheDir:selected==='main'?'C:\\Cache1':'C:\\Cache2',availableDriveLetters:['O:','P:'],filesRevision:1,files:[{id:'same-id',path:selected+'.txt',size:1,modified:'2026-01-01'}],driver:{available:true},sync:{running:false},preferences:{},defaults:{cacheDir:'',driveLetter:'O:',driveName:'Material Files'}});
   const publish=()=>{const state=snapshot();subscriber(state);return state;};window.calls=[];
   window.drive={...featureFixture.bridge,status:async()=>snapshot(),onStatus:fn=>{subscriber=fn;return()=>{};},selectSession:async id=>{window.calls.push(['select',id]);selected=id;return publish();},addSession:async()=>{summaries.push({sessionId:'new',locked:true,mounted:false,driveName:'',driveLetter:''});selected='new';return publish();},removeSession:async id=>{summaries.splice(summaries.findIndex(row=>row.sessionId===id),1);selected='main';return publish();},history:async()=>[],recycled:async()=>[],lock:async()=>{Object.assign(summaries.find(row=>row.sessionId===selected),{locked:true,mounted:false});return publish();}};
   window.forceSession=id=>{selected=id;return publish();};
  })});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#vault-session')?.value==='main');
  assert.equal(await page.locator('.vault-session-bar').isVisible(),true);
  await page.waitForFunction(()=>document.querySelector('#file-list').textContent.includes('main.txt'));
  await page.locator('#file-list md-checkbox').click();
  await page.locator('#vault-session').click();await page.getByRole('option',{name:'Second · N: · Mounted',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#file-list').textContent.includes('second.txt'));
  assert.equal(await page.locator('#file-list md-checkbox').evaluate(node=>node.checked),false);
  assert.equal(await page.locator('#remove-vault-session').evaluate(node=>node.disabled),true);
  // A host-driven change must cancel a credential dialog and scrub its values too.
  await page.evaluate(()=>{document.querySelector('#password-input').value='synthetic-secret';document.querySelector('#key-path').value='synthetic-key';document.querySelector('#vault-dialog').showModal();window.forceSession('main');});
  await page.waitForFunction(()=>!document.querySelector('#vault-dialog').open);
  assert.equal(await page.locator('#password-input').evaluate(node=>node.value),'');assert.equal(await page.locator('#key-path').evaluate(node=>node.value),'');
  await page.locator('#add-vault-session').click();await page.waitForFunction(()=>document.querySelector('#vault-session').value==='new');
  assert.equal(await page.locator('#locked-state').isVisible(),true);assert.equal(await page.locator('#remove-vault-session').evaluate(node=>node.disabled),false);
  await page.locator('#remove-vault-session').click();await page.waitForFunction(()=>document.querySelector('#vault-session').value==='main');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.vault-session-bar').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
