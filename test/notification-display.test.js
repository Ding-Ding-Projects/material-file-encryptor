import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfaceModel} from '../src/shared/surface/model.js';

const originalHTMLElement=globalThis.HTMLElement,originalCustomElements=globalThis.customElements,originalDocument=globalThis.document;
globalThis.HTMLElement=class{};
const registry=new Map();globalThis.customElements={get:key=>registry.get(key),define:(key,value)=>registry.set(key,value)};
const {NotificationCenter}=await import('../src/shared/surface/notification-center.js');
class Node{
 constructor(tag){this.tag=tag;this.textContent='';this.className='';this.children=[];}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(name,value){this[name]=value;}
 addEventListener(name,callback){this.listeners??={};this.listeners[name]=callback;}
}
globalThis.document={createElement:tag=>new Node(tag)};

test('notification display transforms never change persisted records or exports',async()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 const model=createSurfaceModel({storage});model.addNotification({title:'Canonical title',message:'Canonical message'});
 const center=Object.create(NotificationCenter.prototype);center.model=model;center.search={filter:async rows=>rows};center.entries=new Node('entries');center.renderText=value=>value.replaceAll('Canonical','Synthetic');center.language='en';
 await center.renderEntries();
 assert.equal(center.entries.children[0].children.find(node=>node.tag==='h3').textContent,'Synthetic title');
 assert.equal(center.entries.children[0].children.find(node=>node.tag==='p').textContent,'Synthetic message');
 assert.equal(model.getState().notifications[0].title,'Canonical title');
 assert.ok(!values.get('surface-state').includes('Synthetic'));
 assert.ok(!model.exportNotifications().includes('Synthetic'));
 assert.ok(!model.exportNotifications('csv').includes('Synthetic'));
});

test.after(()=>{
 for(const [key,value]of [['HTMLElement',originalHTMLElement],['customElements',originalCustomElements],['document',originalDocument]])if(value===undefined)delete globalThis[key];else globalThis[key]=value;
});


test('progress and recovery controls invoke only the supplied host callback',async()=>{
 const model=createSurfaceModel();model.addNotification({title:'Task',progress:{value:35,label:'Working'},recovery:[{id:'retry:task',label:'Retry'}]});
 const center=Object.create(NotificationCenter.prototype);center.model=model;center.search={filter:async rows=>rows};center.entries=new Node('entries');center.renderText=value=>value;center.language='en';const received=[];center.onAction=async(id,record)=>received.push([id,record.title]);
 await center.renderEntries();const children=center.entries.children[0].children;
 assert.equal(children.find(node=>node.tag==='md-linear-progress').value,0.35);
 const retry=children.find(node=>node.tag==='md-text-button'&&node.textContent==='Retry');await retry.listeners.click({target:retry});
 assert.deepEqual(received,[['retry:task','Task']]);assert.equal(retry.disabled,false);
});
