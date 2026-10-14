import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyConnectedRenderer} from '../scripts/test-renderer-browser.mjs';
import {openRendererBrowser,createRendererCdpTransport} from '../scripts/test-renderer-browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const expectedUrl='http://127.0.0.1:49151/';
function browser(targetInfos,events){return {async newBrowserCDPSession(){events.push('connected-session');return {async send(method){assert.equal(method,'Target.getTargets');events.push('connected-target-inventory');return {targetInfos};},async detach(){events.push('detached');}};}};}
test('connected renderer requires actual client peer proof after the connected target inventory',async()=>{
 const events=[];
 const result=await verifyConnectedRenderer(browser([{type:'page',url:expectedUrl,targetId:'owned'}],events),{expectedUrl,targetId:'owned'},async input=>{
  assert.deepEqual(events,['connected-session','connected-target-inventory','detached']);
  assert.equal(input.clientPid,process.pid);events.push('native-connected-peer-proof');
  return {client_ok:true,clientIdentity:{pid:process.pid},establishedPeerPair:{clientPid:process.pid},exactUrl:expectedUrl,targetId:'owned'};
 });
 assert.equal(result.client_ok,true);
 assert.equal(events.at(-1),'native-connected-peer-proof');
});
test('matching earlier URL cannot hide changed ownership between proof and connection',async()=>{
 const events=[];
 await assert.rejects(verifyConnectedRenderer(browser([{type:'page',url:expectedUrl,targetId:'owned'}],events),{expectedUrl,targetId:'owned'},async()=>{throw new Error('Listener owner changed after initial proof.');}),/Listener owner changed/);
 assert.deepEqual(events,['connected-session','connected-target-inventory','detached']);
});
test('changed connected target and missing actual peer identity fail closed',async()=>{
 let proofCalled=false;
 await assert.rejects(verifyConnectedRenderer(browser([{type:'page',url:expectedUrl,targetId:'different'}],[]),{expectedUrl,targetId:'owned'},async()=>{proofCalled=true;}),/inventory changed/);
 assert.equal(proofCalled,false);
 for(const result of [{client_ok:true,exactUrl:expectedUrl},{client_ok:true,clientIdentity:{pid:process.pid+1},establishedPeerPair:{clientPid:process.pid},exactUrl:expectedUrl}])await assert.rejects(verifyConnectedRenderer(browser([{type:'page',url:expectedUrl,targetId:'owned'}],[]),{expectedUrl,targetId:'owned'},async()=>result),/peer ownership proof/);
});
test('actual renderer wrapper disconnects an unproved transport without closing or accessing its browser',{skip:process.platform!=='win32'},async()=>{
 const events=[];
 let originalState,port;
 const evidenceRoot=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-rejected-connection-unit-'));
 const unproved={async newBrowserCDPSession(){return {async send(method){events.push(method);if(method!=='Target.getTargets')throw new Error('Unproved browser action.');return {targetInfos:[{type:'page',url:expectedUrl,targetId:'owned'}]};},async detach(){events.push('detach-read-only-session');}};},contexts(){events.push('UNPROVED:page-access');throw new Error('Unproved page access.');},async close(){events.push('UNPROVED:browser.close');throw new Error('Unproved browser close.');}};
 const runtime={executable:process.execPath,sourceCommit:'a'.repeat(40),chromium:{executablePath:()=>process.execPath,async connectOverCDP(transport){events.push('connect');return unproved;}},
  async createTransport(){return {transport:{},async disconnect(){events.push('disconnect-owned-socket-only');}};},
  async fetch(){return {async json(){return [{id:'owned',type:'page',url:expectedUrl,webSocketDebuggerUrl:`ws://127.0.0.1:${port}/devtools/page/owned`}];}};},
  async command(executable,args,input){const operation=args[1];if(operation==='bind-client')return {client_ok:true,clientBinding:{clientIdentity:{pid:process.pid}}};if(operation==='launch'){originalState=args[3];port=input.cdp.port;await fs.writeFile(originalState,JSON.stringify({fixtureOnly:true,process:{pid:123},desktop:'owned-original-unit'}));}if(operation==='prove-cdp'&&input?.clientPid){events.push('connected-proof-rejected');throw new Error('Exact established peer ownership rejected.');}if(operation==='cleanup'){assert.equal(args[3],originalState);events.push('independently-owned-original-state-cleanup');return {client_ok:true,recordedProcessesAbsent:true,desktopClosed:true};}if(operation==='prepare-exit'||operation==='confirm-exit'){events.push(operation);throw new Error('Unproved transport reached browser closure.');}return {client_ok:true};}}
 await assert.rejects(openRendererBrowser(expectedUrl,{evidenceRoot,runtime}),/Exact established peer ownership rejected/);
 assert.deepEqual(events,['connect','Target.getTargets','detach-read-only-session','connected-proof-rejected','disconnect-owned-socket-only','independently-owned-original-state-cleanup']);
 const [attempt]=await fs.readdir(evidenceRoot);
 const retained=JSON.parse(await fs.readFile(path.join(evidenceRoot,attempt,'helper-outcomes.normalized.json'),'utf8'));
 assert.equal(retained.connectionOwned,false);
 assert.equal(retained.closure.transportDisconnected,true);
});
test('supported CDP transport close disconnects only its socket',async()=>{
 const events=[];
 class Socket {
  listeners=new Map();
  constructor(url){events.push(['socket',url]);queueMicrotask(()=>this.emit('open',{}));}
  addEventListener(name,fn){const list=this.listeners.get(name)||[];list.push(fn);this.listeners.set(name,list);}
  emit(name,event){for(const fn of this.listeners.get(name)||[])fn(event);}
  send(text){events.push(['socket-send',JSON.parse(text)]);}
  close(){events.push(['socket-disconnect']);this.emit('close',{});}
 }
 const connection=await createRendererCdpTransport('http://127.0.0.1:49150',{fetchImpl:async()=>({text:async()=>JSON.stringify({webSocketDebuggerUrl:'ws://127.0.0.1:49150/devtools/browser/owned'})}),WebSocketImpl:Socket});
 await connection.disconnect();
 assert.deepEqual(events,[['socket','ws://127.0.0.1:49150/devtools/browser/owned'],['socket-disconnect']]);
});
test('CDP diagnostics retain attachment identity and codes without protocol payloads',async()=>{
 const observations=[],forwarded=[];let socket;
 class Socket {
  listeners=new Map();
  constructor(){socket=this;queueMicrotask(()=>this.emit('open',{}));}
  addEventListener(name,fn){const list=this.listeners.get(name)||[];list.push(fn);this.listeners.set(name,list);}
  emit(name,event){for(const fn of this.listeners.get(name)||[])fn(event);}
  send(){}
  close(){this.emit('close',{});}
 }
 const connection=await createRendererCdpTransport('http://127.0.0.1:49150',{observe:value=>observations.push(value),fetchImpl:async()=>({text:async()=>JSON.stringify({webSocketDebuggerUrl:'ws://127.0.0.1:49150/devtools/browser/owned'})}),WebSocketImpl:Socket});
 connection.transport.onmessage=value=>forwarded.push(value);
 connection.transport.send({id:1,method:'Target.setAutoAttach',params:{synthetic:'excluded'}});
 const messages=[{method:'Target.attachedToTarget',params:{targetInfo:{targetId:'owned',type:'page',url:'synthetic-private-url'},sessionId:'excluded'}},{id:1,error:{code:-32000,message:'synthetic-private-message',data:'excluded'}},{method:'Inspector.targetCrashed',params:{synthetic:'excluded'}}];
 for(const message of messages)socket.emit('message',{data:JSON.stringify(message)});
 assert.deepEqual(forwarded,messages,'Observations must not alter delivery');
 const normalized=JSON.parse(JSON.stringify(observations));
 assert.deepEqual(normalized,[{direction:'send',method:'Target.setAutoAttach',id:1},{direction:'receive',method:'Target.attachedToTarget',targetId:'owned',targetType:'page'},{direction:'receive',method:'Target.setAutoAttach',id:1,errorCode:-32000},{direction:'receive',method:'Inspector.targetCrashed'}]);
 assert.doesNotMatch(JSON.stringify(normalized),/synthetic-private|excluded/);
 await connection.disconnect();
});
