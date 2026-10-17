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
test('command registration bursts retain immediate state and render only the final list',async()=>{
 const search={query:'appearance',regex:true,flags:'iu'},dialog={open:true},renders=[];
 const palette=Object.assign(Object.create(CommandPalette.prototype),{search,dialog,isConnected:true,renderResults(){renders.push(this.commands);}});
 for(let index=0;index<1500;index++){const commands=[{id:'appearance:'+index}];palette.setCommands(commands);assert.equal(palette.commands,commands);}
 assert.equal(renders.length,0);await Promise.resolve();assert.equal(renders.length,1);assert.equal(renders[0][0].id,'appearance:1499');
 assert.equal(palette.search,search);assert.equal(palette.dialog,dialog);assert.equal(search.query,'appearance');assert.equal(search.regex,true);assert.equal(dialog.open,true);
 palette.setCommands([]);await Promise.resolve();assert.equal(renders.length,2);assert.deepEqual(renders[1],[]);
});
test('disconnect cancels queued command projection and a later connection can refresh',async()=>{
 let renders=0;const palette=Object.assign(Object.create(CommandPalette.prototype),{isConnected:true,renderResults(){renders++;}});
 palette.setCommands([{id:'removed'}]);palette.isConnected=false;palette.disconnectedCallback();await Promise.resolve();assert.equal(renders,0);
 palette.isConnected=true;palette.setCommands([{id:'current'}]);await Promise.resolve();assert.equal(renders,1);assert.equal(palette.commands[0].id,'current');
});
test('command replacement invalidates an already pending search before queued projection',async()=>{
 const pending=deferred(),latest=deferred(),results=new Node();let searches=0;
 const palette=Object.assign(Object.create(CommandPalette.prototype),{commands:[{id:'old',label:'Old'}],language:'en',results,search:{filter:()=>searches++===0?pending.promise:latest.promise}});
 const older=palette.renderResults();pending.resolve([{id:'old'}]);palette.setCommands([{id:'new',label:'New'}]);await older;assert.equal(results.children.length,0);
 latest.resolve([{id:'new'}]);await Promise.resolve();assert.equal(results.children[0].children[0].children[0].textContent,'New');
});
test('connected status receives results and a detached palette ignores pending output',async()=>{
 const input=search();input.status={textContent:'old'};assert.equal((await input.filter([{id:'a',text:'Alpha'}])).length,1);assert.equal(input.status.textContent,'');
 const pending=deferred(),results=new Node();const palette=Object.assign(Object.create(CommandPalette.prototype),{commands:[{id:'old',label:'Old'}],language:'en',results,search:{filter:()=>pending.promise}});
 const rendering=palette.renderResults();palette.disconnectedCallback();pending.resolve([{id:'old'}]);await rendering;assert.equal(results.children.length,0);
});
test.after(()=>{for(const[key,value]of [['HTMLElement',originalHTMLElement],['customElements',originalElements],['document',originalDocument]])if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
