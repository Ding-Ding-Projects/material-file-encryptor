import test from 'node:test';
import assert from 'node:assert/strict';
class Node {
 constructor(tag){this.localName=tag;this.disabled=false;this.children=[];this.attributes={};this.listeners={};this.dataset={};}
 append(...values){this.children.push(...values);}replaceChildren(...values){this.children=values;}attachShadow(){return this.shadowRoot=new Node('shadow');}setAttribute(name,value){this.attributes[name]=value;}addEventListener(name,fn){this.listeners[name]=fn;}remove(){this.removed=true;}focus(){this.focused=true;}
}
globalThis.HTMLElement=Node;globalThis.CSSStyleSheet=class{replaceSync(){}};globalThis.customElements={map:new Map(),get(key){return this.map.get(key);},define(key,value){this.map.set(key,value);}};globalThis.document={createElement:tag=>customElements.get(tag)?new (customElements.get(tag))():new Node(tag)};
const {StorageMaintenance}=await import('../src/renderer/features/storage-maintenance/index.js');
const diagnostics={targetPartSizeBytes:83886080,pendingPackingFiles:2,activeWriters:1,packingRunning:false,packingError:null,currentReferencedParts:5,currentReferencedBytes:400,historicalOnlyParts:3,historicalOnlyBytes:200,temporaryFiles:0,temporaryBytes:0};
test('completed packing retains pending writer diagnostics and uses exact numeric target',async()=>{
 const panel=new StorageMaintenance();let submitted;
 panel.services={storageDiagnostics:async()=>diagnostics,operations:async()=>[{kind:'packing',operationId:'op',state:'completed',phase:'completed',bytesCompleted:100,totalBytes:100}],startPacking:async value=>{submitted=value;}};
 await panel.refresh();assert.equal(panel.rows.pending.value.textContent,'2');assert.equal(panel.rows.writers.value.textContent,'1');assert.match(panel.message.textContent,/active writers/);assert.equal(panel.pack.disabled,false);
 panel.size.value='80';await panel.start();assert.deepEqual(submitted,{partSizeBytes:83886080});
 panel.setLanguage('yue');assert.equal(panel.heading.textContent,'儲存空間維護');
});
test('pending admission blocks duplicates and destroyed panels ignore late diagnostics',async()=>{
 const panel=new StorageMaintenance();let finish,calls=0;
 panel.services={storageDiagnostics:()=>{calls++;return new Promise(resolve=>{finish=resolve;});},operations:async()=>[]};
 const read=panel.refresh();await panel.refresh();assert.equal(calls,1);assert.equal(panel.pack.disabled,true);panel.destroy();finish(diagnostics);await read;assert.equal(panel.diagnostics,null);
});
test('invalid target never invokes native packing and failed diagnostics clear stale admission',async()=>{
 const panel=new StorageMaintenance();panel.diagnostics=diagnostics;panel.render();let calls=0;panel.services={startPacking:async()=>calls++,storageDiagnostics:async()=>{throw Error('locked');},operations:async()=>[]};panel.size.value='86';await panel.start();assert.equal(calls,0);assert.equal(panel.size.focused,true);await panel.refresh();assert.equal(panel.diagnostics,null);assert.equal(panel.pack.disabled,true);
});
test('cancel targets only the displayed packing operation and stays disabled while cancelling',async()=>{
 const panel=new StorageMaintenance();panel.diagnostics=diagnostics;panel.operations=[{kind:'packing',operationId:'pack-1',state:'running',phase:'packing',bytesCompleted:10,totalBytes:20}];let id;
 panel.services={cancelOperation:async value=>{id=value;},storageDiagnostics:async()=>diagnostics,operations:async()=>[{kind:'packing',operationId:'pack-1',state:'cancelling'}]};panel.render();panel.operationList.children[0].children[2].listeners.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(id,'pack-1');assert.equal(panel.operationList.children[0].children[2].disabled,true);
});
test('durable pause preserves queued counts and Resume clears it through a new packing request',async()=>{
 const panel=new StorageMaintenance();let resumed=false,submitted;
 panel.services={storageDiagnostics:async()=>({...diagnostics,packingPaused:!resumed}),operations:async()=>[{kind:'packing',operationId:'old',state:'cancelled',phase:'packing'}],startPacking:async value=>{submitted=value;resumed=true;}};
 await panel.refresh();assert.equal(panel.pack.textContent,'Resume packing');assert.match(panel.message.textContent,/Queued files are retained/);assert.equal(panel.rows.pending.value.textContent,'2');assert.equal(panel.pack.disabled,false);
 panel.setLanguage('yue');assert.equal(panel.pack.textContent,'繼續整理');assert.match(panel.message.textContent,/排隊檔案會保留/);await panel.start();assert.deepEqual(submitted,{partSizeBytes:83886080});assert.equal(panel.diagnostics.packingPaused,false);assert.equal(panel.pack.textContent,'整理目前檔案');
});
