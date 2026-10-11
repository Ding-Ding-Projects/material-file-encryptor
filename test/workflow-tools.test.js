import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkflowServices} from '../src/main/workflow-services.js';
const previous={HTMLElement:globalThis.HTMLElement,customElements:globalThis.customElements,document:globalThis.document};
globalThis.HTMLElement=class{};const definitions=new Map();globalThis.customElements={get:key=>definitions.get(key),define:(key,value)=>definitions.set(key,value)};
class Node{
 constructor(tag){this.tag=tag;this.localName=tag;this.children=[];this.listeners={};this.textContent='';this.value='';this.disabled=false;this.readOnly=false;this.query='';}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(name,value){this[name]=value;}addEventListener(name,fn){this.listeners[name]=fn;}dispatchEvent(event){this.listeners[event.type]?.(event);}focus(){this.focused=true;}remove(){this.removed=true;}
 querySelectorAll(selector){const all=this.children.flatMap(child=>[child,...(child.querySelectorAll?.('*')||[])]);return selector==='*'?all:all.filter(child=>selector.split(',').includes(child.tag));}
 get options(){return this.children;}
 async filter(rows){return rows.filter(row=>row.text.toLowerCase().includes(this.query.toLowerCase()));}
}
const doc={createElement:tag=>new Node(tag),createTreeWalker:()=>({nextNode:()=>false})};globalThis.document=doc;
const {mount}=await import('../src/shared/surface/workflow-tools.js');
test('mounted document flow browses, clears and saves through opaque native grants',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'workflow-ui-')),file=path.join(folder,'notes.txt');await fs.writeFile(file,'Original');
 const backend=createWorkflowServices({env:{},dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[file]})}});const host=new Node('host');host.ownerDocument=doc;const surface=mount(host,{services:{request:(action,payload)=>backend.dispatch(action,payload)}});
 const find=label=>host.querySelectorAll('*').find(node=>node.textContent===label);
 try{await surface.refresh();await find('Browse document').listeners.click();
 const content=host.querySelectorAll('*').find(node=>node.label==='Document content');assert.equal(content.value,'Original');
 await find('Clear Document content').listeners.click();assert.equal(content.value,'');assert.equal(content.focused,true);
 await find('Save document').listeners.click();assert.equal(await fs.readFile(file,'utf8'),'');
 const name=host.querySelectorAll('*').find(node=>node.label==='Document name');assert.equal(name.readOnly,true);assert.equal(find('Clear Document name').disabled,true);
 }finally{surface.destroy();await backend.close();await fs.rm(folder,{recursive:true,force:true});}
});
test.after(()=>{for(const[key,value]of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});

test('device authentication challenge is transient and cancellation rejects late challenge events',async()=>{const {mountPublicationPanel}=await import('../src/shared/surface/publication-panel.js');const host=new Node('host');host.ownerDocument=doc;let event,finish;const calls=[];const panel=mountPublicationPanel(host,{getSource:()=>({id:'grant',kind:'folder'}),subscribe:callback=>{event=callback;return()=>{};},request:async(action,payload)=>{calls.push([action,payload]);if(action==='accountState')return[{id:'alice',label:'Alice',active:true}];if(action==='owners')return[{id:'alice',label:'Alice',canFork:true}];if(action==='signInAccount')return new Promise(resolve=>finish=resolve);return{};}});const find=text=>host.querySelectorAll('*').find(node=>node.textContent===text);try{await panel.refresh();const pending=find('Add account').listeners.click();await Promise.resolve();event({type:'forge-authentication',item:{verificationUri:'https://github.com/login/device',userCode:'ABCD-EFGH'}});assert.equal(host.querySelectorAll('code')[0].textContent,'ABCD-EFGH');await find('Cancel authentication').listeners.click();event({type:'forge-authentication',item:{verificationUri:'https://github.com/login/device',userCode:'LATE-CODE'}});assert.equal(host.querySelectorAll('code').length,0);finish([]);await pending;assert.equal(host.querySelectorAll('code').length,0);assert.ok(calls.some(([action])=>action==='cancelPublication'));assert.ok(!JSON.stringify(calls).includes('ABCD-EFGH'));}finally{panel.destroy();}});

test('browser proposal destination review does not start its transfer',async()=>{const host=new Node('host');host.ownerDocument=doc;const calls=[];let prepared=false;const surface=mount(host,{services:{request:async(action,payload)=>{calls.push([action,payload]);if(action==='browserProposals')return prepared?[]:[{id:'proposal-1',filename:'example.zip',source:'https://example.com/example.zip',state:'awaiting-confirmation'}];if(action==='prepareCapturedDownload'){prepared=true;return{id:'download-1',state:'ready'};}if(action==='downloads')return prepared?[{id:'download-1',name:'example.zip',source:'https://example.com/example.zip',destination:'native destination',state:'ready',received:0,total:10}]:[];return[];}}});try{await surface.refresh();const find=text=>host.querySelectorAll('*').find(node=>node.textContent===text);assert.ok(find('Awaiting destination review. No transfer has started.'));await find('Review browser download destination').listeners.click();assert.ok(find('Start download'));assert.equal(calls.some(([action])=>action==='startDownload'),false);assert.ok(calls.some(([action,payload])=>action==='prepareCapturedDownload'&&payload.id==='proposal-1'));}finally{surface.destroy();}});
