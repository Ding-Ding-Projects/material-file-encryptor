import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement=class{};const registry=new Map();globalThis.customElements={get:key=>registry.get(key),define:(key,value)=>registry.set(key,value)};
class Node{constructor(){this.children=[];this.listeners={};this.attributes={};}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}setAttribute(key,value){this.attributes[key]=value;}addEventListener(key,fn){this.listeners[key]=fn;}focus(){this.focused=true;}}
globalThis.document={createElement:()=>new Node()};
const {WorkspaceShell}=await import('../src/shared/surface/workspace-shell.js');
const {SurfaceSearch}=await import('../src/shared/surface/search.js');
const {createSurfaceModel}=await import('../src/shared/surface/model.js');
function fixture(){const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};const model=createSurfaceModel({storage,tabs:[{id:'home',label:'Home'},{id:'converter',label:'Converter'}]});model.closeTab('converter');const search=Object.assign(Object.create(SurfaceSearch.prototype),{query:'converter',regex:false,flags:'iu',generation:0,hidden:false,language:'en'});const shell=Object.assign(Object.create(WorkspaceShell.prototype),{model,labels:new Map([['home',{en:'Home',yue:'首頁'}],['converter',{en:'Converter',yue:'轉換器'}]]),language:'en',search,tabsHost:new Node(),groupsHost:new Node(),selected:new Set(),activate(id){this.model.activateTab(id);this.activated=id;}});return{model,shell,storage};}
test('all-view search finds a persisted closed registered view and reopens the actual model',async()=>{
 const {shell,model,storage}=fixture();await shell.renderTabs();const result=shell.tabsHost.children[0].children[0];assert.equal(result.textContent,'Converter · Closed');result.listeners.click({});assert.equal(model.getState().activeTabId,'converter');assert.ok(model.getState().tabs.some(tab=>tab.id==='converter'));assert.ok(!model.getState().closedTabIds.includes('converter'));assert.equal(createSurfaceModel({storage}).getState().activeTabId,'converter');await shell.renderTabs();assert.equal(shell.tabsHost.children[0].children[0].focused,true);
});
test('dynamic registration is discoverable and hidden discovery keeps only open tabs',async()=>{
 const {shell}=fixture();shell.labels.set('updates',{en:'Updates',yue:'更新'});shell.search.query='updates';await shell.renderTabs();assert.equal(shell.tabsHost.children[0].children[0].textContent,'Updates · Closed');shell.search.hidden=true;assert.deepEqual(shell.viewRows(shell.model.getState(),false).map(row=>row.id),['home']);
});
test('all-view search retains the regex filter path and localizes state labels',async()=>{
 const {shell}=fixture();shell.language='yue';shell.search.query='^轉換器';shell.search.regex=true;shell.search.evaluate=async({rows})=>({matches:rows.filter(row=>new RegExp(shell.search.query).test(row.text)).map(row=>row.id)});await shell.renderTabs();assert.equal(shell.tabsHost.children[0].children[0].textContent,'轉換器 · 已關閉');
});
test('tab strip owns a full grid row and secondary actions wrap independently',()=>{
 let css;WorkspaceShell.prototype.render.call({style:value=>{css=value;}});assert.match(css,/\.bar\{display:grid;grid-template-columns:minmax\(0,1fr\)/);assert.match(css,/\.tabs\{min-width:0;width:100%;overflow-x:auto\}/);assert.match(css,/\.tools\{display:flex;width:100%;gap:4px;flex-wrap:wrap\}/);
});

test('collapsing discovery renders all open tabs while retaining the query for reopening',async()=>{
 const {shell}=fixture();shell.search.query='converter';await shell.renderTabs();assert.equal(shell.tabsHost.children[0].children[0].textContent,'Converter · Closed');
 shell.search.hidden=true;await shell.renderTabs();assert.deepEqual(shell.tabsHost.children[0].children.map(node=>node.textContent),['Home']);assert.equal(shell.search.query,'converter');
 shell.search.hidden=false;await shell.renderTabs();assert.deepEqual(shell.tabsHost.children[0].children.map(node=>node.textContent),['Converter · Closed']);
});
