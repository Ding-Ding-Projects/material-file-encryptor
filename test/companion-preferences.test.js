import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionPreferences,createCompanionSharedSettings,assertCompanionRequest} from '../docs/site/local-adapter.js';

test('schedule bridge preserves the source and stable id expected by the host',async()=>{
 const calls=[],request=async(feature,action,payload={})=>{assertCompanionRequest('featureRequest',{feature,action,payload});calls.push({feature,action,payload});return {state:'on'};};
 const bridge=createCompanionPreferences(request),source={type:'home-assistant',url:'https://example.test',entity:'input_boolean.theme'};
 assert.deepEqual(await bridge.fetchScheduleSource(source,{id:'theme',timeout:5000}),{state:'on'});
 assert.deepEqual(calls[0],{feature:'personalization',action:'fetchScheduleSource',payload:{source,id:'theme'}});
 await bridge.listFonts();assert.equal(calls[1].action,'listFonts');
 for(const action of ['setScheduleCredential','clearScheduleCredential','normalizeImage','fontMetadata','cancelFontMetadata'])assert.throws(()=>assertCompanionRequest('featureRequest',{feature:'personalization',action,payload:{}}));
 assert.throws(()=>assertCompanionRequest('featureRequest',{feature:'ollama',action:'configureRuntime',payload:{port:11434}}));
});
test('shared settings subscribe once per changed snapshot and unsubscribe honestly',async()=>{
 let value={enabled:false},reads=0;const updates=[];
 const bridge=createCompanionSharedSettings({request:async()=>{reads++;return value;},isConnected:()=>true});
 const off=bridge.subscribe(value=>updates.push(value));await bridge.refresh();await bridge.refresh();
 assert.equal(reads,2);assert.deepEqual(updates,[{enabled:false}]);
 value={enabled:true};await bridge.refresh();assert.deepEqual(updates,[{enabled:false},{enabled:true}]);
 off();value={enabled:false};await bridge.refresh();assert.equal(updates.length,2);bridge.destroy();
});
test('stale pairing response cannot overwrite a new session or prevent its refresh',async()=>{
 const pending=[],updates=[];let connected=true;
 const bridge=createCompanionSharedSettings({request:()=>new Promise(resolve=>pending.push(resolve)),isConnected:()=>connected});
 bridge.subscribe(value=>updates.push(value));const old=bridge.refresh();await bridge.refresh();assert.equal(pending.length,1);
 connected=false;bridge.invalidate();connected=true;const next=bridge.refresh();assert.equal(pending.length,2);
 pending[0]({enabled:true});await old;assert.deepEqual(updates,[]);
 pending[1]({enabled:false});await next;assert.deepEqual(updates,[{enabled:false}]);
 connected=false;await bridge.refresh();assert.equal(pending.length,2);bridge.destroy();
});
test('destroy and disconnected errors cannot notify a former session',async()=>{
 let reject;const errors=[],updates=[];const bridge=createCompanionSharedSettings({request:()=>new Promise((_,no)=>{reject=no;}),isConnected:()=>true,onError:error=>errors.push(error)});
 bridge.subscribe(value=>updates.push(value));const work=bridge.refresh();bridge.destroy();reject(Error('obsolete'));await work;assert.deepEqual(errors,[]);assert.deepEqual(updates,[]);
});
