import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../browser-extension/background.js',import.meta.url),'utf8');
const unavailable={type:'protected-capabilities',schemaVersion:1,authentication:'unavailable',operations:[]};
function fixture(reply=()=>unavailable){
 let listener;const ports=[];
 const chrome={runtime:{id:'fixture',getURL:path=>'chrome-extension://fixture/'+path,connectNative:()=>{const port={disconnect(){this.closed?.();},onDisconnect:{addListener(fn){port.closed=fn;}},onMessage:{addListener(fn){port.receive=fn;}},postMessage(message){port.sent=message;if(message.type==='pair')queueMicrotask(()=>port.receive({type:'paired',session:'a'.repeat(43)}));else{const value=reply(message);if(value)queueMicrotask(()=>port.receive(value));}}};ports.push(port);return port;},onInstalled:{addListener(){}},onMessage:{addListener(fn){listener=fn;}}},contextMenus:{onClicked:{addListener(){}}},action:{setBadgeText(){},setTitle(){}}};
 vm.runInNewContext(source,{chrome,Object,URL,setTimeout,clearTimeout,queueMicrotask});const sender={id:'fixture',url:chrome.runtime.getURL('popup.html'),frameId:0};
 return{ports,listener,sender,ask:message=>new Promise(resolve=>listener(message,sender,resolve))};
}
test('extension forwards only paired read-only exact capability discovery without authentication authority',async()=>{
 const f=fixture();assert.match((await f.ask({type:'protected-discover'})).error,/unavailable/);await f.ask({type:'pair'});assert.deepEqual(JSON.parse(JSON.stringify(await f.ask({type:'protected-discover'}))),{schemaVersion:1,authentication:'unavailable',operations:[]});assert.deepEqual(JSON.parse(JSON.stringify(f.ports[0].sent)),{type:'protected-discover',session:'a'.repeat(43)});
 for(const message of [{type:'protected-discover',authenticated:true},Object.assign(Object.create({actor:'forged'}),{type:'protected-discover'}),{type:'protected-discover',[Symbol('extra')]:true}])assert.match((await f.ask(message)).error,/unavailable/);
 for(const type of ['protected-authenticate','protected-execute'])assert.equal(f.listener({type},f.sender,()=>{throw Error('Unexpected forwarding');}),false);
 let called=false;assert.equal(f.listener({type:'protected-discover'},{...f.sender,url:'https://public.example/'},()=>called=true),false);assert.equal(called,false);await f.ask({type:'disconnect'});
});
test('extension rejects altered capability scopes unknown fields and interrupted discovery',async()=>{
 for(const value of [{...unavailable,operations:[{profileId:'local-profile',operation:'shell',target:'file'}]},{...unavailable,authentication:'granted'},{...unavailable,extra:'private'}, {...unavailable,authentication:'native-explicit',operations:[{profileId:'other',operation:'read-profile-summary',target:'profile-summary'}]}]){const f=fixture(()=>value);await f.ask({type:'pair'});assert.match((await f.ask({type:'protected-discover'})).error,/unavailable/);await f.ask({type:'disconnect'});}
 const f=fixture(()=>null);await f.ask({type:'pair'});const pending=f.ask({type:'protected-discover'});await f.ask({type:'disconnect'});assert.match((await pending).error,/unavailable/);f.ports[0].receive(unavailable);
});
