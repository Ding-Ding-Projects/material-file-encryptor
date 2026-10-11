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
