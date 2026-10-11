import test from 'node:test';
import assert from 'node:assert/strict';
const previous={HTMLElement:globalThis.HTMLElement,document:globalThis.document};
globalThis.HTMLElement=class{};
class Node{constructor(){this.children=[];this.listeners={};this.selected=false;this.value=0;}append(...children){this.children.push(...children);}setAttribute(){}addEventListener(name,fn){this.listeners[name]=fn;}show(){}remove(){this.removed=true;}}
const doc={activeElement:{focus(){}},createElement:()=>new Node(),addEventListener(name,fn){this[name]=fn;},removeEventListener(name){delete this[name];}};globalThis.document=doc;
const {requestSuperConfirmation}=await import('../src/shared/surface/workflow-confirm.js');
function controls(host){const dialog=host.children[0],content=dialog.children[1];return{dialog,first:content.children[2],second:content.children[3],slider:content.children[4],execute:dialog.children[3],cancel:dialog.children[2]};}
test('confirmation gates actual callback until both keys and full slider, then resolves on Done',async()=>{
 const host=new Node();host.ownerDocument=doc;let runs=0;const result=requestSuperConfirmation(host,{action:'Discard',affected:'test draft',run:async()=>{runs++;return 'finished';}});const c=controls(host);
 await c.execute.listeners.click();assert.equal(runs,0);
 c.first.selected=true;c.first.listeners.change();c.slider.value=100;await c.execute.listeners.click();assert.equal(runs,0);
 c.second.selected=true;c.second.listeners.change();c.slider.value=99;c.slider.listeners.input();await c.execute.listeners.click();assert.equal(runs,0);
 c.slider.value=100;c.slider.listeners.change();await c.execute.listeners.click();assert.equal(runs,1);assert.equal(c.execute.textContent,'Done');await c.execute.listeners.click();assert.deepEqual(await result,{confirmed:true,result:'finished'});
});
test('Escape and owner teardown cancel without invoking the action',async()=>{
 for(const mode of ['escape','abort']){const host=new Node();host.ownerDocument=doc;const controller=new AbortController();let ran=false;const result=requestSuperConfirmation(host,{action:'Discard',affected:'test draft',run:async()=>{ran=true;},signal:controller.signal});if(mode==='escape')doc.keydown({key:'Escape',preventDefault(){}});else controller.abort();assert.deepEqual(await result,{confirmed:false});assert.equal(ran,false);}
});
test.after(()=>{for(const[key,value]of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});

test('approval-only mode resolves immediately without running or reporting an operation',async()=>{
 const host=new Node();host.ownerDocument=doc;let runs=0;const pending=requestSuperConfirmation(host,{action:'Delete',affected:'fixture',confirmationOnly:true,run:async()=>{runs++;}});const c=controls(host);
 c.first.selected=true;c.second.selected=true;c.slider.value=100;await c.execute.listeners.click();assert.deepEqual(await pending,{confirmed:true});assert.equal(runs,0);assert.equal(c.execute.textContent,'Confirm');assert.notEqual(c.dialog.children[1].children[5].textContent,'Operation completed.');
});
test('approval-only validation and abort never create a stored completion result',async()=>{
 const host=new Node();host.ownerDocument=doc;const owner=new AbortController();const pending=requestSuperConfirmation(host,{action:'Delete',affected:'fixture',confirmationOnly:true,signal:owner.signal,validateConfirmation:()=>{throw Error('Exact text required');}});const c=controls(host);
 c.first.selected=true;c.second.selected=true;c.slider.value=100;await c.execute.listeners.click();assert.equal(c.dialog.children[1].children[5].textContent,'Exact text required');owner.abort();await c.execute.listeners.click();assert.deepEqual(await pending,{confirmed:false});
});

test('owner abort during final approval validation wins over confirmation',async()=>{
 const host=new Node();host.ownerDocument=doc;const owner=new AbortController();const pending=requestSuperConfirmation(host,{action:'Delete',affected:'fixture',confirmationOnly:true,signal:owner.signal,validateConfirmation:()=>owner.abort()});const c=controls(host);
 c.first.selected=true;c.second.selected=true;c.slider.value=100;await c.execute.listeners.click();assert.deepEqual(await pending,{confirmed:false});
});
