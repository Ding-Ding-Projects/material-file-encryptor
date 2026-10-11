import test from 'node:test';
import assert from 'node:assert/strict';
const originalHTMLElement=globalThis.HTMLElement,originalElements=globalThis.customElements,originalDocument=globalThis.document;
globalThis.HTMLElement=class{};const registry=new Map();globalThis.customElements={get:key=>registry.get(key),define:(key,value)=>registry.set(key,value)};
const {SurfaceSearch}=await import('../src/shared/surface/search.js');
const {CommandPalette}=await import('../src/shared/surface/command-palette.js');
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
class Node{constructor(){this.children=[];this.textContent='';}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}setAttribute(){}addEventListener(){}}
globalThis.document={createElement:()=>new Node()};
function search(){return Object.assign(Object.create(SurfaceSearch.prototype),{query:'a',regex:false,flags:'iu',generation:0,pending:new Map(),language:'en'});}
test('literal filtering before connection does not require rendered status',async()=>{
 assert.deepEqual(await search().filter([{id:'a',text:'Alpha'},{id:'b',text:'Beta'}]),[{id:'a',text:'Alpha'},{id:'b',text:'Beta'}]);
});
test('disconnect invalidates pending regex result before status update',async()=>{
 const input=search(),pending=deferred();input.regex=true;input.evaluate=()=>pending.promise;
 const filtering=input.filter([{id:'a',text:'Alpha'}]);input.disconnectedCallback();pending.resolve({matches:['a']});assert.equal(await filtering,null);
});
test('rapid command replacement ignores results for the older registration',async()=>{
 const pending=deferred();const palette=Object.assign(Object.create(CommandPalette.prototype),{commands:[{id:'old',label:'Old'}],language:'en',results:new Node(),search:{filter:()=>pending.promise}});
 const older=palette.renderResults();palette.commands=[{id:'new',label:'New'}];palette.search={filter:async()=>[{id:'new'}]};await palette.renderResults();
 pending.resolve([{id:'old'}]);await older;
 assert.equal(palette.results.children.length,1);
 assert.equal(palette.results.children[0].children[0].children[0].textContent,'New');
});
test('connected status receives results and a detached palette ignores pending output',async()=>{
 const input=search();input.status={textContent:'old'};assert.equal((await input.filter([{id:'a',text:'Alpha'}])).length,1);assert.equal(input.status.textContent,'');
 const pending=deferred(),results=new Node();const palette=Object.assign(Object.create(CommandPalette.prototype),{commands:[{id:'old',label:'Old'}],language:'en',results,search:{filter:()=>pending.promise}});
 const rendering=palette.renderResults();palette.disconnectedCallback();pending.resolve([{id:'old'}]);await rendering;assert.equal(results.children.length,0);
});
test.after(()=>{for(const[key,value]of [['HTMLElement',originalHTMLElement],['customElements',originalElements],['document',originalDocument]])if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
