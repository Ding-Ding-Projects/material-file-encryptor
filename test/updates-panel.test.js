import test from 'node:test';
import assert from 'node:assert/strict';
class Node{constructor(){this.children=[];this.listeners={};this.attributes={};}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}attachShadow(){return this.shadowRoot=new Node();}addEventListener(name,fn){this.listeners[name]=fn;}setAttribute(name,value){this.attributes[name]=value;}remove(){this.removed=true;}}
globalThis.HTMLElement=Node;globalThis.CSSStyleSheet=class{replaceSync(){}};globalThis.customElements={items:new Map(),get(name){return this.items.get(name);},define(name,type){this.items.set(name,type);}};globalThis.document={createElement:name=>{const Type=customElements.get(name)||Node;return new Type();}};
const {UpdatesPanel,mountUpdates}=await import('../src/renderer/features/updates/index.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('update panel invokes only explicit allowed actions and keeps Later local',async()=>{
 const calls=[];let callback;const root=new Node();const view=mountUpdates(root,{services:{request:async(action,payload)=>{calls.push({action,payload});return{state:'ready',unsigned:true,currentVersion:'1.0.0',update:{version:'1.1.0',sourceCommit:'abc'}};},subscribe:fn=>{callback=fn;return()=>{callback=null;};}}});await tick();const panel=root.children[0];assert.deepEqual(calls.map(x=>x.action),['status']);assert.equal(panel.buttons.install.disabled,false);
 panel.buttons.later.listeners.click();assert.match(panel.status.textContent,/deferred/);assert.equal(calls.length,1);panel.buttons.install.listeners.click();await tick();assert.deepEqual(calls.map(x=>x.action),['status','install']);view.destroy();assert.equal(callback,null);
});
test('busy and browser snapshots never enable installation and states stay truthful',async()=>{
 const panel=new UpdatesPanel();panel.request=async()=>({});for(const snapshot of [{state:'ready',desktopAvailable:false},{state:'ready',canInstall:false},{state:'ready',busy:true},{state:'ready',activeWork:true},{state:'downloading'},{state:'confirming'},{state:'unavailable'},{state:'failed'}]){panel.update(snapshot);assert.equal(panel.buttons.install.disabled,true,JSON.stringify(snapshot));}
 panel.update({state:'downloading'});assert.equal(panel.progress.hidden,false);assert.equal(panel.progress.indeterminate,true);panel.update({state:'ready',update:{version:'2'}});assert.equal(panel.buttons.install.disabled,false);assert.equal(panel.progress.hidden,true);
});
test('locale refresh preserves snapshot and deferral without resubmitting actions',()=>{
 const panel=new UpdatesPanel();panel.request=async()=>({});panel.update({state:'ready',unsigned:true,currentVersion:'1.0.0',update:{version:'2.0.0'}});panel.buttons.later.listeners.click();panel.setLanguage('yue');assert.equal(panel.status.textContent,'已延後安裝');assert.equal(panel.buttons.install.textContent,'重新啟動並安裝');panel.setLanguage('bilingual');assert.match(panel.status.textContent,/Installation deferred/);assert.match(panel.status.textContent,/已延後安裝/);assert.equal(panel.rows.version.value.textContent,'1.0.0');
});
test('pending requests block duplicate actions and late results cannot restore disposed panel',async()=>{
 let finish,calls=0;const panel=new UpdatesPanel();panel.request=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};panel.update({state:'ready'});const pending=panel.act('install');panel.buttons.install.listeners.click();assert.equal(calls,1);panel.destroy();finish({state:'restart-requested'});await pending;assert.equal(panel.snapshot.state,'ready');
});
