import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const load=relative=>fs.readFile(new URL('../'+relative,import.meta.url),'utf8');
const [overlaySource,layoutSource,menuSource,appearanceSource,controlsSource]=await Promise.all([
 'src/shared/surface/overlay.js','src/shared/surface/panel-layout.js','src/shared/surface/context-menu.js','src/renderer/features/personalization/appearance.js','src/shared/surface/controls.js'
].map(load));
const moduleBody=source=>source.replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
const providerStart=appearanceSource.indexOf(' const removeContextActions='),providerEnd=appearanceSource.indexOf(' const keyboard=e=>');
assert.ok(providerStart>0&&providerEnd>providerStart,'Actual appearance provider must be present');
const admission=appearanceSource.split(/\r?\n/).find(line=>line.startsWith(' function admittedTarget'));
const requestAdmission=controlsSource.split(/\r?\n/).find(line=>line.startsWith('export function requestControlAdmission'));
assert.ok(admission&&requestAdmission,'Actual target admission functions must be present');

function fixture({withLayout=true,legacy=false}={}){
 const context=vm.createContext({Promise});
 vm.runInContext(`
 class E {
  constructor(name){this.name=name;this.nodeType=1;this.style={};this.children=[];this.listeners={};this.isConnected=true;this.localName=name;this.focused=0;}
  append(child){child.parentNode=this;this.children.push(child);} contains(el){for(let node=el;node;node=node.parentNode)if(node===this)return true;return false;}
  getRootNode(){let node=this;while(node.parentNode)node=node.parentNode;return node;}
  closest(){return null;} addEventListener(type,fn){this.listeners[type]=fn;} removeEventListener(){} setAttribute(){} removeAttribute(){} focus(){this.focused++;}
  dispatchEvent(){admissionTargets.push(this.name);return !this.locked;}
  remove(){this.parentNode.children=this.parentNode.children.filter(child=>child!==this);}
 }
 const errors=[],opened=[],admissionTargets=[],win={innerWidth:1200,innerHeight:800,addEventListener(){},removeEventListener(){}};
 const doc={listeners:{},defaultView:win,addEventListener(type,fn){this.listeners[type]=fn;},removeEventListener(){},createElement(name){if(name==='mfe-context-menu')return menu;const node=new E(name);node.ownerDocument=this;return node;}};
 const html=new E('html'),body=new E('body'),view=new E('view-settings'),control=new E('md-outlined-button'),inner=new E('internal-div'),editor=new E('appearance-editor');
 for(const node of [html,body,view,control,inner,editor])node.ownerDocument=doc;
 html.append(body);body.append(view);body.append(editor);view.append(control);view.parentElement=body;body.clientWidth=1200;body.clientHeight=800;
 const shadow={host:control,parentNode:null};inner.parentNode=shadow;doc.body=body;
 const menu=new E('mfe-context-menu');menu.ownerDocument=doc;menu.epoch=0;menu.hidden=true;
 menu.open=function(options){this.close('replace',{restoreFocus:false});Object.assign(this,options);this.hidden=false;this.epoch++;this.itemsHost=new E('items');this.search={filter:async rows=>rows};};
 menu.close=function(...args){return ContextMenu.prototype.close.call(this,...args);};menu.emit=(_name,value)=>errors.push(value.error.message);
 const Element=E,SurfaceElement=E,document=doc,register=()=>{},localized=label=>typeof label==='object'?label.en:label;
 const CustomEvent=class{constructor(type,options){this.type=type;Object.assign(this,options);}};
 const element=(tag,attributes)=>{const node=doc.createElement(tag);Object.assign(node,attributes);return node;};
 `,context);
 vm.runInContext(requestAdmission.replace('export ',''),context);
 // Both the current and deliberate old-target variant execute the actual menu
 // rendering and admission path. Only the disputed target selection is mutated.
 let menu=moduleBody(menuSource);
 if(legacy){const corrected='capturedTarget=actionTargets.has(item)?actionTargets.get(item):this.target;';assert.ok(menu.includes(corrected));menu=menu.replace(corrected,'capturedTarget=this.target;');}
 vm.runInContext(menu,context);vm.runInContext(moduleBody(overlaySource),context);vm.runInContext(moduleBody(layoutSource),context);
 vm.runInContext(`const root=html,panel=editor,services={isAllowed:el=>!el.locked,onLock:el=>opened.push('lock:'+el.name)},t=x=>x;function open(el){opened.push(el.name);return true;}`+admission,context);
 if(withLayout)vm.runInContext("const layout=mountPanelLayout(view,{id:'settings',registerContextActions});",context);
 vm.runInContext(appearanceSource.slice(providerStart,providerEnd),context);
 const objects=vm.runInContext('({menu,inner,control,view,root,doc,errors,opened,admissionTargets})',context);
 return {...objects,context,
  dispatch:async(inner=true)=>{context.useInner=inner;vm.runInContext(`let composedCalls=0;const eventPath=useInner?[inner,shadow,control,view,body,html,doc,win]:[control,view,body,html,doc,win];const event={type:'contextmenu',clientX:20,clientY:20,defaultPrevented:false,composedPath(){composedCalls++;return eventPath;},preventDefault(){this.defaultPrevented=true;},stopPropagation(){}};doc.listeners.contextmenu(event);`,context);await vm.runInContext('ContextMenu.prototype.renderItems.call(menu)',context);return vm.runInContext('composedCalls',context);},
  button:id=>{const index=objects.menu.items.findIndex(item=>item.id===id);assert.ok(index>=0,'Expected merged action '+id);return objects.menu.itemsHost.children[index];},
  async invoke(id){this.button(id).listeners.click();await Promise.resolve();await Promise.resolve();}
 };
}
const list=value=>Array.from(value);

test('merged appearance action keeps its provider-resolved host for an inner shadow event',async()=>{
 const f=fixture();assert.equal(await f.dispatch(),1);assert.equal(f.menu.target,f.inner);assert.equal(f.root.contains(f.inner),false);assert.equal(f.root.contains(f.control),true);
 assert.deepEqual(f.menu.items.map(item=>item.id).join(','),'layout-move,layout-resize,layout-reset,appearance.edit,appearance.lock');
 await f.invoke('appearance.edit');assert.deepEqual(list(f.admissionTargets),['md-outlined-button']);assert.deepEqual(list(f.opened),['md-outlined-button']);assert.deepEqual(list(f.errors),[]);
 assert.equal(f.inner.focused,1,'Existing first-provider focus restoration is preserved');
});
test('old menu-wide target selection reproduces the rejected appearance action',async()=>{
 const f=fixture({legacy:true});await f.dispatch();await f.invoke('appearance.edit');assert.deepEqual(list(f.opened),[]);assert.deepEqual(list(f.errors),['This control is unavailable.']);assert.deepEqual(list(f.admissionTargets),['internal-div']);
});
test('light-DOM target and a shadow event without nearer layout still succeed',async()=>{
 for(const options of [{withLayout:true,inner:false},{withLayout:false,inner:true}]){const f=fixture(options);await f.dispatch(options.inner);await f.invoke('appearance.edit');assert.deepEqual(list(f.opened),['md-outlined-button']);assert.deepEqual(list(f.errors),[]);}
});
test('removed and newly locked provider targets are checked again at activation',async()=>{
 for(const change of [f=>f.control.isConnected=false,f=>f.control.locked=true]){const f=fixture();await f.dispatch();change(f);await f.invoke('appearance.edit');assert.deepEqual(list(f.opened),[]);assert.equal(f.menu.hidden,true);assert.deepEqual(list(f.errors),[]);}
});
test('one menu action cannot activate twice after closure',async()=>{const f=fixture();await f.dispatch();const button=f.button('appearance.edit');button.listeners.click();button.listeners.click();await Promise.resolve();await Promise.resolve();assert.deepEqual(list(f.opened),['md-outlined-button']);assert.deepEqual(list(f.admissionTargets),['md-outlined-button']);});
test('duplicate IDs retain the first action and its original provider target',async()=>{
 const f=fixture();vm.runInContext("const firstItem={id:'appearance.edit',label:'First edit',run:target=>opened.push('first:'+target.name)};registerContextActions(control,()=>({target:control,items:[firstItem]}));",f.context);
 await f.dispatch();assert.equal(f.menu.items.filter(item=>item.id==='appearance.edit').length,1);vm.runInContext("firstItem.contextTarget=inner;firstItem.run=()=>opened.push('mutated');",f.context);await f.invoke('appearance.edit');assert.deepEqual(list(f.opened),['first:md-outlined-button']);assert.deepEqual(list(f.admissionTargets),['md-outlined-button']);
});
test('disabled merged actions never request admission or execute',async()=>{const f=fixture();vm.runInContext("registerContextActions(control,()=>({target:control,items:[{id:'appearance.edit',label:'Disabled edit',disabled:true,run:()=>opened.push('wrong')}]}));",f.context);await f.dispatch();await f.invoke('appearance.edit');assert.deepEqual(list(f.opened),[]);assert.deepEqual(list(f.admissionTargets),[]);});
test('appearance lock receives the same provider-resolved target',async()=>{const f=fixture();await f.dispatch();await f.invoke('appearance.lock');assert.deepEqual(list(f.opened),['lock:md-outlined-button']);assert.deepEqual(list(f.admissionTargets),['md-outlined-button']);});

test('direct menus without provider metadata retain their explicit target',async()=>{const f=fixture();vm.runInContext("openContextMenu({target:control,anchor:control,items:[{id:'direct',label:'Direct',run:target=>opened.push(target.name)}]});",f.context);await vm.runInContext('ContextMenu.prototype.renderItems.call(menu)',f.context);await f.invoke('direct');assert.deepEqual(list(f.opened),['md-outlined-button']);assert.deepEqual(list(f.admissionTargets),['md-outlined-button']);});
test('an earlier rendered action stays invalid after menu replacement',async()=>{const f=fixture();await f.dispatch();const old=f.button('appearance.edit');vm.runInContext("menu.open({target:control,anchor:control,items:[]});",f.context);old.listeners.click();await Promise.resolve();assert.deepEqual(list(f.opened),[]);assert.deepEqual(list(f.admissionTargets),[]);});
