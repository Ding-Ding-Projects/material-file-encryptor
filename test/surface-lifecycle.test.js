import test from 'node:test';
import assert from 'node:assert/strict';
const originalHTMLElement=globalThis.HTMLElement,originalElements=globalThis.customElements,originalDocument=globalThis.document;
globalThis.HTMLElement=class{};const registry=new Map();globalThis.customElements={get:key=>registry.get(key),define:(key,value)=>registry.set(key,value)};
const {SurfaceSearch}=await import('../src/shared/surface/search.js');
const {CommandPalette}=await import('../src/shared/surface/command-palette.js');
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
class Node{constructor(){this.children=[];this.textContent='';this.classList={toggle(){}};}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}setAttribute(){}addEventListener(){}}
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
 const pending=deferred();const palette=Object.assign(Object.create(CommandPalette.prototype),{dialog:{open:true},commands:[{id:'old',label:'Old'}],language:'en',results:new Node(),search:{filter:()=>pending.promise}});
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
 let renders=0;const palette=Object.assign(Object.create(CommandPalette.prototype),{dialog:{open:true},isConnected:true,renderResults(){renders++;}});
 palette.setCommands([{id:'removed'}]);palette.isConnected=false;palette.disconnectedCallback();await Promise.resolve();assert.equal(renders,0);
 palette.isConnected=true;palette.setCommands([{id:'current'}]);await Promise.resolve();assert.equal(renders,1);assert.equal(palette.commands[0].id,'current');
});
test('command replacement invalidates an already pending search before queued projection',async()=>{
 const pending=deferred(),latest=deferred(),results=new Node();let searches=0;
 const palette=Object.assign(Object.create(CommandPalette.prototype),{dialog:{open:true},commands:[{id:'old',label:'Old'}],language:'en',results,search:{filter:()=>searches++===0?pending.promise:latest.promise}});
 const older=palette.renderResults();pending.resolve([{id:'old'}]);palette.setCommands([{id:'new',label:'New'}]);await older;assert.equal(results.children.length,0);
 latest.resolve([{id:'new'}]);await Promise.resolve();assert.equal(results.children[0].children[0].children[0].textContent,'New');
});
test('connected status receives results and a detached palette ignores pending output',async()=>{
 const input=search();input.status={textContent:'old'};assert.equal((await input.filter([{id:'a',text:'Alpha'}])).length,1);assert.equal(input.status.textContent,'');
 const pending=deferred(),results=new Node();const palette=Object.assign(Object.create(CommandPalette.prototype),{dialog:{open:true},commands:[{id:'old',label:'Old'}],language:'en',results,search:{filter:()=>pending.promise}});
 const rendering=palette.renderResults();palette.disconnectedCallback();pending.resolve([{id:'old'}]);await rendering;assert.equal(results.children.length,0);
});
test.after(()=>{for(const[key,value]of [['HTMLElement',originalHTMLElement],['customElements',originalElements],['document',originalDocument]])if(value===undefined)delete globalThis[key];else globalThis[key]=value;});

test('closed palette does not project appearance command bursts until opened', async () => {
 const renders=[];
 const palette=Object.assign(Object.create(CommandPalette.prototype),{
  dialog:{open:false,show(){this.open=true;},close(){this.open=false;}},
  search:{input:{focus(){}}},isConnected:true,
  renderResults(){renders.push(this.commands);}
 });
 for(let index=0;index<1500;index++)palette.setCommands([{id:'appearance:'+index}]);
 await Promise.resolve();
 assert.equal(renders.length,0,'hidden command controls must not be constructed');
 palette.open();await Promise.resolve();
 assert.equal(renders.length,1);
 assert.equal(renders[0][0].id,'appearance:1499');
});

test('closing a palette discards asynchronous search output', async () => {
 const pending=deferred(),results=new Node(),dialog={open:true};
 const palette=Object.assign(Object.create(CommandPalette.prototype),{
  dialog,commands:[{id:'old',label:'Old'}],language:'en',results,
  search:{filter:()=>pending.promise}
 });
 const rendering=palette.renderResults();dialog.open=false;
 pending.resolve([{id:'old'}]);await rendering;
 assert.equal(results.children.length,0);
});

test('opening before a queued registration refresh projects the latest list once', async () => {
 let renders=0;
 const palette=Object.assign(Object.create(CommandPalette.prototype),{
  dialog:{open:false,show(){this.open=true;}},search:{input:{focus(){}}},
  renderResults(){renders++;}
 });
 palette.setCommands([{id:'latest'}]);palette.open();await Promise.resolve();
 assert.equal(renders,1);assert.equal(palette.commands[0].id,'latest');
});


test('opening waits for the Material dialog asynchronous show lifecycle', async () => {
 const pending=deferred();let renders=0,focuses=0;
 const dialog={open:false,async show(){await pending.promise;this.open=true;}};
 const palette=Object.assign(Object.create(CommandPalette.prototype),{
  dialog,search:{input:{focus(){focuses++;}}},renderResults(){renders++;}
 });
 const opening=palette.open();await Promise.resolve();
 assert.equal(renders,0);assert.equal(focuses,0);
 pending.resolve();await opening;
 assert.equal(renders,1);assert.equal(focuses,1);
});

test('disconnect during asynchronous opening cancels projection and focus', async () => {
 const pending=deferred();let renders=0,focuses=0;
 const dialog={open:true,show(){return pending.promise;}};
 const palette=Object.assign(Object.create(CommandPalette.prototype),{
  dialog,search:{input:{focus(){focuses++;}}},renderResults(){renders++;}
 });
 const opening=palette.open();palette.disconnectedCallback();
 pending.resolve();await opening;
 assert.equal(renders,0);assert.equal(focuses,0);
});


test('close during asynchronous opening cancels projection and focus', async () => {
 const pending=deferred();let renders=0,focuses=0;
 const dialog={open:true,show(){return pending.promise;},close(){}};
 const palette=Object.assign(Object.create(CommandPalette.prototype),{
  dialog,search:{input:{focus(){focuses++;}}},renderResults(){renders++;}
 });
 const opening=palette.open();palette.close();
 pending.resolve();await opening;
 assert.equal(renders,0);assert.equal(focuses,0);
});


test('restored dialog opening refreshes the current palette only', () => {
 const addListener=Node.prototype.addEventListener;
 Node.prototype.addEventListener=function(type,listener){(this.listeners??={})[type]=listener;};
 try {
  let renders=0;
  const palette=Object.assign(Object.create(CommandPalette.prototype),{
   shadowRoot:new Node(),style(){},t(en){return en;},renderResults(){renders++;}
  });
  palette.render();const dialog=palette.dialog;renders=0;
  dialog.listeners.opened();assert.equal(renders,1);
  dialog.listeners.close();assert.equal(palette.closing,true);
  dialog.listeners.open();assert.equal(palette.closing,false);
  palette.openingDialog=dialog;dialog.listeners.opened();assert.equal(renders,1);
  palette.openingDialog=null;palette.dialog={};dialog.listeners.opened();assert.equal(renders,1);
 } finally {Node.prototype.addEventListener=addListener;}
});


test('Material dismissal cancels output while the closing animation remains open', async () => {
 const pending=deferred(),results=new Node();
 const palette=Object.assign(Object.create(CommandPalette.prototype),{
  dialog:{open:true},commands:[{id:'old',label:'Old'}],language:'en',results,
  search:{filter:()=>pending.promise}
 });
 const rendering=palette.renderResults();palette.cancelPendingResults();
 pending.resolve([{id:'old'}]);await rendering;
 assert.equal(results.children.length,0);
 await palette.renderResults();assert.equal(results.children.length,0);
});


test('Material close event during show prevents late projection and focus', async () => {
 const addListener=Node.prototype.addEventListener;
 Node.prototype.addEventListener=function(type,listener){(this.listeners??={})[type]=listener;};
 try {
  const pending=deferred();let renders=0,focuses=0;
  const palette=Object.assign(Object.create(CommandPalette.prototype),{
   shadowRoot:new Node(),style(){},t(en){return en;},renderResults(){renders++;}
  });
  palette.render();renders=0;
  const dialog=palette.dialog;dialog.open=true;dialog.show=()=>pending.promise;
  palette.search.input={focus(){focuses++;}};
  const opening=palette.open();dialog.listeners.close();dialog.listeners.opened();
  pending.resolve();await opening;
  assert.equal(renders,0);assert.equal(focuses,0);
 } finally {Node.prototype.addEventListener=addListener;}
});
