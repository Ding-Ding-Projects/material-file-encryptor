import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyConnectedRenderer} from '../scripts/test-renderer-browser.mjs';

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
