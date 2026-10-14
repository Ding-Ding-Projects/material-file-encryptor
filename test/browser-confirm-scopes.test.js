import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createBrowserConfirmMediation} from '../src/main/browser-confirm-mediation.js';
import {createBrowserConfirmPrompt,confirmationOptions} from '../src/main/browser-confirm-prompt.js';
import {createBrowserNativeBroker,nativeFrame} from '../src/main/browser-native-host.js';
import {createMaterialDialogs} from '../src/main/material-dialog.js';

const origin='chrome-extension://'+'a'.repeat(32)+'/',session='s'.repeat(43),connectionId='11111111-1111-1111-1111-111111111111';
const config={schemaVersion:1,host:'org.dingding.material_file_encryptor.downloads',allowedOrigins:[origin],identity:{extensionId:'a'.repeat(32),packageSha256:'0'.repeat(64),publicKeySha256:'1'.repeat(64)}};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const request={type:'focus-authenticator',session};

function mediation(options={}){
 let unlocked=true,visible=true,pair={session,expires:901000},focused=0;const prompts=[];
 const service=createBrowserConfirmMediation({getPair:()=>pair,isUnlocked:()=>unlocked,canPrompt:()=>visible,now:()=>1000,
  confirm:options.confirm??(context=>new Promise(resolve=>{const entry={context,resolve};prompts.push(entry);context.signal.addEventListener('abort',()=>resolve(false),{once:true});})),
  focusAuthenticator:options.focus??(async()=>{focused++;}),...options.overrides});
 const check=()=>{if(!unlocked)throw Error('Unlock the desktop before receiving downloads.');};
 return {service,prompts,send:(message=request)=>service.receive(origin,message,check),lock:()=>{unlocked=false;service.revoke();},hide:()=>{visible=false;},disconnect:()=>{pair=null;service.revoke();},get focused(){return focused;}};
}

test('an approved prompt brings the authenticator forward and returns only a fixed state word',async()=>{
 const m=mediation();const pending=m.send();await flush();assert.equal(m.prompts.length,1);
 assert.deepEqual(m.prompts[0].context.action,'focus-authenticator');assert.equal(m.prompts[0].context.origin,origin);
 m.prompts[0].resolve(true);const answer=await pending;
 assert.deepEqual(answer,{type:'authenticator-focused',schemaVersion:1,state:'shown'});assert.equal(m.focused,1);
 const text=JSON.stringify(answer);for(const forbidden of ['code','account','secret','path','otp','session'])assert.ok(!text.toLowerCase().includes(forbidden),forbidden);
 assert.deepEqual(Object.keys(answer).sort(),['schemaVersion','state','type']);
});

test('a rejected prompt answers rejected, does not focus and leaves the pairing usable',async()=>{
 const m=mediation();const pending=m.send();await flush();m.prompts[0].resolve(false);
 assert.deepEqual(await pending,{type:'authenticator-focused',schemaVersion:1,state:'rejected'});assert.equal(m.focused,0);
 const next=m.send();await flush();assert.equal(m.prompts.length,2,'the same pairing can ask again after a rejection');m.prompts[1].resolve(true);assert.equal((await next).state,'shown');
});

test('only one prompt is pending: a second request is answered busy and never queued',async()=>{
 const m=mediation();const first=m.send();await flush();
 assert.deepEqual(await m.send(),{type:'authenticator-focused',schemaVersion:1,state:'busy'});assert.equal(m.prompts.length,1);
 m.prompts[0].resolve(true);assert.equal((await first).state,'shown');assert.equal(m.service.pending,0);
});

test('a locked desktop, a hidden window, a missing callback or a closed service refuse at once without a prompt',async()=>{
 const locked=mediation();locked.lock();await assert.rejects(locked.send(),/Unlock the desktop/);assert.equal(locked.prompts.length,0);
 const lockedFlag=mediation({overrides:{isUnlocked:()=>false}});assert.equal((await lockedFlag.send()).state,'unavailable');assert.equal(lockedFlag.prompts.length,0);
 const hidden=mediation();hidden.hide();assert.equal((await hidden.send()).state,'unavailable');assert.equal(hidden.prompts.length,0);
 const noPrompt=mediation({confirm:null,overrides:{confirm:undefined}});assert.equal((await noPrompt.send()).state,'unavailable');
 const noFocus=mediation({overrides:{focusAuthenticator:undefined}});assert.equal((await noFocus.send()).state,'unavailable');assert.equal(noFocus.prompts.length,0);
 const closing=mediation();closing.service.close();await assert.rejects(closing.send(),/Pair the browser again/);
 const throwing=mediation({overrides:{canPrompt:()=>{throw Error('window gone');}}});assert.equal((await throwing.send()).state,'unavailable');assert.equal(throwing.prompts.length,0);
 // After a refusal nothing is left pending, so a later request starts fresh instead of finding a queued one.
 const later=mediation();later.hide();await later.send();assert.equal(later.service.pending,0);
});

test('lock and disconnect withdraw the pending prompt as rejected and the request fails closed',async()=>{
 const locking=mediation();const first=locking.send();await flush();
 let aborted=false;locking.prompts[0].context.signal.addEventListener('abort',()=>{aborted=true;});locking.lock();
 await assert.rejects(first,/Unlock the desktop|Pair the browser again/);assert.equal(aborted,true);assert.equal(locking.focused,0);assert.equal(locking.service.pending,0);
 const dropping=mediation();const second=dropping.send();await flush();dropping.disconnect();
 await assert.rejects(second,/Pair the browser again/);assert.equal(dropping.focused,0);
 const closing=mediation();const third=closing.send();await flush();closing.service.close();await assert.rejects(third,/Pair the browser again/);assert.equal(closing.focused,0);
});

test('an approval that arrives after the lock never focuses the window',async()=>{
 const m=mediation();const pending=m.send();await flush();
 m.lock();m.prompts[0].resolve(true);
 await assert.rejects(pending);assert.equal(m.focused,0);
});

test('a failing prompt or focus action never reports shown',async()=>{
 const failing=mediation({confirm:async()=>{throw Error('C:\\private\\path');}});assert.equal((await failing.send()).state,'rejected');
 const focusFails=mediation({confirm:async()=>true,focus:async()=>{throw Error('C:\\private\\path');}});const answer=await focusFails.send();assert.equal(answer.state,'unavailable');assert.ok(!JSON.stringify(answer).includes('private'));
 const truthy=mediation({confirm:async()=>'yes'});assert.equal((await truthy.send()).state,'rejected','only an explicit true approves');
});

test('unpaired, expired, mismatched or malformed requests are refused before any prompt',async()=>{
 const m=mediation();
 for(const message of [{type:'focus-authenticator',session:'x'.repeat(43)},{type:'focus-authenticator',session:'short'},{type:'focus-authenticator',session,extra:1},{type:'focus-authenticator'},{type:'focus-authenticator',session,[Symbol('x')]:1},Object.assign(Object.create({session}),{type:'focus-authenticator'}),{type:'read-lock-state',session},{type:'focus-authenticator',session:5}])await assert.rejects(m.send(message));
 m.disconnect();await assert.rejects(m.send(),/Pair the browser again/);
 await assert.rejects(m.service.receive(origin,request),/Unsupported/);
 assert.equal(m.prompts.length,0);
 const expired=createBrowserConfirmMediation({getPair:()=>({session,expires:1000}),isUnlocked:()=>true,confirm:async()=>true,focusAuthenticator:async()=>{},now:()=>1000});
 await assert.rejects(expired.receive(origin,request,()=>{}),/Pair the browser again/);
});

test('the prompt names the origin, action and target in the chosen language with Reject as default and Escape',()=>{
 const english=confirmationOptions({origin,action:'focus-authenticator',language:'en'});
 assert.equal(english.defaultId,0);assert.equal(english.cancelId,0);assert.equal(english.buttons[0],'Reject');assert.equal(english.buttons.length,2);
 assert.match(english.detail,new RegExp('Origin: '+origin.replace(/[/]/g,'.')));assert.match(english.detail,/Action: Open authenticator/);assert.match(english.detail,/Target: The authenticator view/);
 const yue=confirmationOptions({origin,action:'focus-authenticator',language:'yue'});assert.equal(yue.buttons[0],'拒絕');assert.match(yue.detail,/來源：chrome-extension/);assert.match(yue.detail,/目標：/);assert.ok(!/Origin|Reject/.test(yue.title+yue.message+yue.detail+yue.buttons.join('')));
 const both=confirmationOptions({origin,action:'focus-authenticator',language:'bilingual'});assert.equal(both.buttons[0],'Reject · 拒絕');assert.match(both.detail,/Origin · 來源: /);assert.match(both.title,/Open authenticator · 開啟驗證器/);
 assert.equal(confirmationOptions({origin,action:'focus-authenticator',language:'unknown'}).buttons[0],'Reject');
 assert.throws(()=>confirmationOptions({origin,action:'run-command',language:'en'}),/Unsupported/);
});

test('the prompt approves only on the explicit second button and fails to reject everywhere else',async()=>{
 const seen=[];const parent={isDestroyed:()=>false};
 const make=(answer,extra={})=>createBrowserConfirmPrompt({getWindow:()=>parent,getLanguage:async()=>'yue',showMessageBox:async(owner,options)=>{seen.push({owner,options});return typeof answer==='function'?answer():answer;},...extra});
 assert.equal(await make({response:1}).confirm({origin,action:'focus-authenticator'}),true);
 assert.equal(seen[0].owner,parent);assert.equal(seen[0].options.buttons[0],'拒絕');
 assert.equal(await make({response:0}).confirm({origin,action:'focus-authenticator'}),false);
 assert.equal(await make({response:2}).confirm({origin,action:'focus-authenticator'}),false);
 assert.equal(await make(undefined).confirm({origin,action:'focus-authenticator'}),false);
 assert.equal(await make(()=>{throw Error('boom');}).confirm({origin,action:'focus-authenticator'}),false);
 assert.equal(await make({response:1}).confirm({origin,action:'other'}),false);
 assert.equal(await createBrowserConfirmPrompt({getWindow:()=>null,showMessageBox:async()=>({response:1})}).confirm({origin,action:'focus-authenticator'}),false);
 assert.equal(await createBrowserConfirmPrompt({getWindow:()=>({isDestroyed:()=>true}),showMessageBox:async()=>({response:1})}).confirm({origin,action:'focus-authenticator'}),false);
 const controller=new AbortController();controller.abort();assert.equal(await make({response:1}).confirm({origin,action:'focus-authenticator',signal:controller.signal}),false);
 const late=new AbortController();assert.equal(await make(()=>{late.abort();return {response:1};}).confirm({origin,action:'focus-authenticator',signal:late.signal}),false,'an answer that lands after the withdrawal is not an approval');
 assert.throws(()=>createBrowserConfirmPrompt({}),/Invalid/);
 const slow=createBrowserConfirmPrompt({getWindow:()=>parent,getLanguage:()=>new Promise(()=>{}),showMessageBox:async(owner,options)=>({response:options.buttons[0]==='Reject'?1:0})});
 assert.equal(await slow.confirm({origin,action:'focus-authenticator'}),true,'an unreadable language falls back to English within a second');
});

test('the Material dialog settles a withdrawn prompt as its cancel button',async()=>{
 const handles=new Map(),listeners=new Map(),windows=[];
 class FakeWindow{constructor(options){this.options=options;this.destroyed=false;this.events={};this.webContents={id:900+windows.length,on(){},setWindowOpenHandler(){}};windows.push(this);}on(name,fn){this.events[name]=fn;}once(name,fn){this.events[name]=fn;}isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;}setContentSize(){}loadFile(){return Promise.resolve();}}
 const dialogs=createMaterialDialogs({BrowserWindow:FakeWindow,ipcMain:{handle:(name,fn)=>handles.set(name,fn),on:(name,fn)=>listeners.set(name,fn)},nativeDialog:{showMessageBox:async()=>({response:1})},preloadPath:'p',pagePath:'q'});
 const controller=new AbortController(),parent={isDestroyed:()=>false};
 const pending=dialogs.showMessageBox(parent,{buttons:['Reject','Allow'],defaultId:0,cancelId:0,message:'m',signal:controller.signal});await flush();
 assert.equal(dialogs.pendingCount(),1);controller.abort();
 assert.deepEqual(await pending,{response:0,checkboxChecked:false});assert.equal(dialogs.pendingCount(),0);assert.equal(windows[0].destroyed,true);
 const before=new AbortController();before.abort();
 assert.equal((await dialogs.showMessageBox(parent,{buttons:['Reject','Allow'],defaultId:0,cancelId:0,message:'m',signal:before.signal})).response,0);
});

function framedBroker(options={}){
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>queueMicrotask(()=>{child.emit('exit',0);child.emit('close',0);});
 const state={unlocked:true,visible:true,prompts:[],focused:0};
 const broker=createBrowserNativeBroker({config,now:()=>0,hostPath:'C:\\Fixture\\MaterialFileEncryptor.BrowserHost.exe',authorizePair:async()=>true,isUnlocked:()=>state.unlocked,onProposal(){},spawnHost:()=>child,
  ...(options.withCallbacks===false?{}:{hasVisibleWindow:()=>state.visible,confirmAction:context=>new Promise(resolve=>{state.prompts.push({context,resolve});context.signal.addEventListener('abort',()=>resolve(false),{once:true});}),focusAuthenticator:async()=>{state.focused++;}}),...options.overrides});
 let counter=0;
 const send=(message,id=connectionId)=>new Promise(resolve=>{const requestId='22222222-2222-2222-2222-'+String(++counter).padStart(12,'0');const onData=bytes=>{const body=JSON.parse(bytes.subarray(4));if(body.requestId===requestId){child.stdin.off('data',onData);resolve(body.response);}};child.stdin.on('data',onData);child.stdout.write(nativeFrame({requestId,connectionId:id,origin,message}));});
 return {broker,child,state,send,async start(){const started=broker.start();child.stdout.write(nativeFrame({type:'ready',aclVerified:true}));await started;}};
}

test('native framed focus request needs the paired live connection and a native approval',async()=>{
 const f=framedBroker();await f.start();
 try{
  assert.deepEqual(await f.send({type:'focus-authenticator',session}),{type:'error',code:'HANDOFF_NOT_ACCEPTED'},'unpaired callers are refused');assert.equal(f.state.prompts.length,0);
  const pair=await f.send({type:'pair'});assert.equal(pair.type,'paired');
  const asked=f.send({type:'focus-authenticator',session:pair.session});await flush();await flush();
  assert.equal(f.state.prompts.length,1);assert.equal(f.state.focused,0,'nothing is focused before the person answers');
  f.state.prompts[0].resolve(true);assert.deepEqual(await asked,{type:'authenticator-focused',schemaVersion:1,state:'shown'});assert.equal(f.state.focused,1);
  const rejected=f.send({type:'focus-authenticator',session:pair.session});await flush();await flush();f.state.prompts[1].resolve(false);
  assert.equal((await rejected).state,'rejected');
  const again=f.send({type:'read-lock-state',session:pair.session});assert.equal((await again).state,'unlocked','a rejection leaves the pairing in place');
  assert.equal((await f.send({type:'focus-authenticator',session:pair.session,extra:true})).type,'error');
  await assert.rejects(f.broker.receive(origin,{type:'focus-authenticator',session:pair.session}),/connection identity/);
 }finally{await f.broker.close();}
});

test('a same-user impostor cannot finish the scope without the native approval callback',async()=>{
 const f=framedBroker({withCallbacks:false});await f.start();
 try{
  const pair=await f.send({type:'pair'});
  assert.deepEqual(await f.send({type:'focus-authenticator',session:pair.session}),{type:'authenticator-focused',schemaVersion:1,state:'unavailable'});
  assert.equal(f.state.focused,0);
 }finally{await f.broker.close();}
 const viaLifecycle=framedBroker({overrides:{confirmAction:undefined}});await viaLifecycle.start();
 try{const pair=await viaLifecycle.send({type:'pair'});assert.equal((await viaLifecycle.send({type:'focus-authenticator',session:pair.session})).state,'unavailable');assert.equal(viaLifecycle.state.focused,0);}finally{await viaLifecycle.broker.close();}
});

test('a hidden window refuses at once and locking withdraws the pending native prompt',async()=>{
 const f=framedBroker();await f.start();
 try{
  const pair=await f.send({type:'pair'});
  f.state.visible=false;assert.equal((await f.send({type:'focus-authenticator',session:pair.session})).state,'unavailable');assert.equal(f.state.prompts.length,0);
  f.state.visible=true;const asked=f.send({type:'focus-authenticator',session:pair.session});await flush();await flush();assert.equal(f.state.prompts.length,1);
  const second=await f.send({type:'focus-authenticator',session:pair.session});assert.equal(second.state,'busy');
  f.state.unlocked=false;f.broker.revoke();
  assert.equal((await asked).type,'error');assert.equal(f.state.focused,0);assert.equal(f.state.prompts[0].context.signal.aborted,true);
  f.state.unlocked=true;assert.equal((await f.send({type:'focus-authenticator',session:pair.session})).type,'error','the lock revoked the pairing');
 }finally{await f.broker.close();}
});

test('closing the broker withdraws a pending prompt',async()=>{
 const f=framedBroker();await f.start();
 const pair=await f.send({type:'pair'});const asked=f.send({type:'focus-authenticator',session:pair.session});await flush();await flush();
 const signal=f.state.prompts[0].context.signal;await f.broker.close();assert.equal(signal.aborted,true);void asked;
});

test('extension background relays the scope, validates the answer and rejects extra fields',async()=>{
 let listener,receive,nativeResponses=[];const sent=[];
 const chrome={runtime:{id:'fixture',getURL:p=>'chrome-extension://fixture/'+p,onInstalled:{addListener(){}},onMessage:{addListener(fn){listener=fn;}},connectNative:()=>({onDisconnect:{addListener(){}},onMessage:{addListener(fn){receive=fn;}},disconnect(){},postMessage(message){sent.push(message);queueMicrotask(()=>receive(message.type==='pair'?{type:'paired',session:'s'.repeat(43)}:nativeResponses.shift()));}})},contextMenus:{onClicked:{addListener(){}}}};
 const context=vm.createContext({chrome,URL,setTimeout,clearTimeout,queueMicrotask});vm.runInContext(await fs.readFile(new URL('../browser-extension/background.js',import.meta.url),'utf8'),context);
 context.deliver=message=>new Promise(resolve=>listener(message,{id:'fixture',url:chrome.runtime.getURL('options.html'),frameId:0},resolve));
 const send=async message=>JSON.parse(JSON.stringify(await vm.runInContext('deliver('+JSON.stringify(message)+')',context)));
 assert.deepEqual(await send({type:'authenticator-focus'}),{paired:false});assert.equal(sent.length,0);
 await send({type:'pair'});const before=sent.length;
 for(const state of ['shown','rejected','busy','unavailable']){nativeResponses=[{type:'authenticator-focused',schemaVersion:1,state}];assert.deepEqual(await send({type:'authenticator-focus'}),{schemaVersion:1,state});}
 assert.deepEqual(sent.slice(before).map(item=>item.type),Array(4).fill('focus-authenticator'));assert.deepEqual(Object.keys(sent[before]).sort(),['session','type']);
 for(const bad of [{type:'authenticator-focused',schemaVersion:1,state:'shown',code:'123456'},{type:'authenticator-focused',schemaVersion:1,state:'maybe'},{type:'authenticator-focused',schemaVersion:2,state:'shown'},{type:'other',schemaVersion:1,state:'shown'},{type:'authenticator-focused',schemaVersion:1}]){nativeResponses=[bad];assert.ok((await send({type:'authenticator-focus'})).error);}
 const count=sent.length;assert.ok((await send({type:'authenticator-focus',session:'x'})).error);assert.equal(sent.length,count);
});

test('the confirmation scope adds no storage, network or secret handling to the desktop modules',async()=>{
 for(const name of ['browser-confirm-mediation.js','browser-confirm-prompt.js']){const source=await fs.readFile(new URL('../src/main/'+name,import.meta.url),'utf8');assert.doesNotMatch(source,/localStorage|writeFile|randomBytes|fetch\(|process\.env|child_process|credential/);}
});
