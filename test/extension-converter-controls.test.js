import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {mountBrowserConverter} from '../browser-extension/converter.js';
class Node {
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.listeners={};this.attributes={};}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(name,fn){this.listeners[name]=fn;}
 setLanguage(){}
 filter(rows){return Promise.resolve(rows);}
 focus(){this.ownerDocument.focused=this;}
 all(){return [this,...this.children.flatMap(item=>item.all())];}
}
const fixture=()=>{const doc={createElement:tag=>new Node(tag,doc)};return {doc,root:doc.createElement('section')};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const selection='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';
test('production converter controls perform native selection, compatible format review and accepted queue display',async()=>{
 const {root}=fixture(),calls=[];const view=mountBrowserConverter(root,{send:async message=>{calls.push(message);return message.type==='converter-prepare'?{outcome:'selected',selection,sourceType:'text',bytes:7}:message.type==='converter-catalog'?{formats:[{id:'base64',name:'Encode Base64',category:'Binary Encodings',sources:['*'],enabled:true},{id:'json-format',name:'Format JSON',category:'Structured Data/Spreadsheets',sources:['json'],enabled:true}]}:{outcome:'accepted',job:{id,adapterId:'base64',state:'queued',progress:0}};}});
 const button=text=>root.all().find(n=>n.tag.startsWith('md-')&&n.textContent===text);
 assert.equal(button('Choose source on desktop').disabled,true);view.setConnection(true);await button('Choose source on desktop').listeners.click();await button('Load verified formats').listeners.click();await tick();assert.equal(button('Format JSON').disabled,true);button('Encode Base64').listeners.click();await button('Choose output and confirm on desktop').listeners.click();assert.deepEqual(calls.map(row=>row.type),['converter-prepare','converter-catalog','converter-enqueue']);assert.deepEqual(calls[2],{type:'converter-enqueue',language:'en',selection,adapterId:'base64'});assert.ok(root.all().some(n=>n.textContent==='Queued (0%)'));assert.ok(root.all().some(n=>n.tag==='mfe-search'));
});
test('production converter disconnect suppresses late selection and reports accepted-job uncertainty',async()=>{
 const {root}=fixture();let resolve,disconnected=false;const confirmed=[];const view=mountBrowserConverter(root,{send:()=>new Promise(done=>resolve=done),disconnect:()=>{disconnected=true;},confirm:(id,run)=>{confirmed.push(id);run();}});view.setConnection(true);const button=text=>root.all().find(n=>n.tag.startsWith('md-')&&n.textContent===text);const pending=button('Choose source on desktop').listeners.click();button('Stop waiting and disconnect').listeners.click();resolve({outcome:'selected',selection,sourceType:'text',bytes:7});await pending;assert.deepEqual(confirmed,['extension.converter-disconnect']);assert.equal(disconnected,true);assert.equal(button('Choose source on desktop').disabled,true);assert.ok(root.all().some(n=>n.textContent==='No source selected.'));assert.ok(root.all().some(n=>n.textContent?.includes('this did not cancel them')));
});
test('production shared lease cannot release editor ownership and preserves converter cancellation',async()=>{
 const {root}=fixture(),source=await fs.readFile(new URL('../browser-extension/options.js',import.meta.url),'utf8');let resolve,calls=0;
 const context={mountBrowserConverter,$:()=>root,prefs:{language:'en'},busy:true,editorPending:true,converterBusy:false,generation:0,render(){},chrome:{runtime:{sendMessage:()=>{calls++;return new Promise(done=>resolve=done);}}}};vm.createContext(context);const declaration=source.split(/\r?\n/).find(line=>line.startsWith('var converterView=mountBrowserConverter'));assert.ok(declaration);vm.runInContext(declaration,context);context.converterView.setConnection(true);
 const button=text=>root.all().find(n=>n.tag.startsWith('md-')&&n.textContent===text);await button('Choose source on desktop').listeners.click();assert.equal(calls,0);assert.equal(context.busy,true);
 context.busy=false;context.editorPending=false;const pending=button('Choose source on desktop').listeners.click();assert.equal(button('Stop waiting and disconnect').hidden,false);context.editorPending=true;resolve({error:'External busy'});await pending;assert.equal(context.busy,true);assert.equal(context.converterBusy,false);
});
