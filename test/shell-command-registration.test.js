import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {registerOwnedCommands} from '../src/shared/surface/control-guidance.js';
import {createSurfaceModel} from '../src/shared/surface/model.js';

// Exercise the production foundation with lightweight external component hosts.
// The real Material DOM and rendering cost are covered by renderer acceptance.
const source=await readFile(new URL('../src/renderer/features/shell/index.js',import.meta.url),'utf8');
function fixture(){
 const nodes=[],listeners=new Map();
 class Host{
  constructor(tag='host'){this.localName=tag;this.children=[];this.calls={render:0,configure:0,commands:0};this.dataset={};}
  append(...children){for(const child of children){child.parentNode=this;this.children.push(child);}}
  insertBefore(child,before){child.parentNode=this;const index=this.children.indexOf(before);if(index<0)this.children.push(child);else this.children.splice(index,0,child);}
  setAttribute(){}addEventListener(){}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);}
  replaceChildren(...children){this.children=[];this.append(...children);}
  configure(value){this.calls.configure++;Object.assign(this,value);}
  render(){this.calls.render++;this.search={query:'',regex:false};this.dialog={open:false};}
  setCommands(value){this.calls.commands++;this.commands=value;}
 }
 const doc={createElement:tag=>new Host(tag),body:new Host('body'),addEventListener:(type,run)=>listeners.set(type,run),removeEventListener:type=>listeners.delete(type)};
 const element=(tag,properties={})=>{const node=Object.assign(new Host(tag),properties);node.ownerDocument=doc;nodes.push(node);return node;};
 const menu=element('mfe-context-menu'),overlay={menu,destroy(){}};
 const localized=value=>typeof value==='object'?value.en:value;
 const context={HTMLElement:Host,document:doc,customElements:{get:()=>true,define(){},upgrade:node=>{node.shadowRoot=new Host('shadow');}},CSSStyleSheet:class{replaceSync(){}},
  element,localized,text:(en,yue)=>({en,yue}),createSurfaceModel,registerOwnedCommands,getContextOverlay:()=>overlay,
  createNotificationAudio:()=>({destroy(){}}),mountNavigationFrame:()=>({setActive(){},destroy(){}}),homeEntries:()=>[],HOME_ID:'home',HOME_LABEL:{en:'Home'},
  openContextMenu(){},closeContextMenu(){},isNewTabShortcut:()=>false,clearTimeout,setTimeout};
 const mount=vm.runInNewContext(source.slice(source.indexOf('export function mountSurfaceFoundation')).replace('export function','function')+';mountSurfaceFoundation;',context);
 const host=element('main');doc.body.append(host);const foundation=mount({host,storage:{getItem(){return null;},setItem(){}},tabs:[{id:'drive',label:'Drive'}]});
 return{foundation,nodes,listeners};
}

test('appearance-sized command lifetimes update the palette without rebuilding shell surfaces',()=>{
 const {foundation,nodes,listeners}=fixture(),palette=foundation.palette;
 const retainedSearch=palette.search,retainedDialog=palette.dialog;retainedSearch.query='appearance';retainedSearch.regex=true;retainedDialog.open=true;
 const before=new Map(nodes.map(node=>[node,{...node.calls}]));let invoked=0;
 const dispose=[];
 for(let index=0;index<1500;index++)dispose.push(foundation.registerCommands([{id:'appearance:'+index,label:'Appearance '+index,...(index===1499?{shortcut:'Control+z'}:{}),run:()=>invoked++}]));
 assert.equal(palette.commands.filter(command=>command.id.startsWith('appearance:')).length,1500);
 listeners.get('keydown')({ctrlKey:true,shiftKey:false,key:'z',preventDefault(){}});assert.equal(invoked,1);
 for(const [node,calls]of before){assert.equal(node.calls.render,calls.render,node.localName+' render');assert.equal(node.calls.configure,calls.configure,node.localName+' configure');}
 assert.equal(palette.search,retainedSearch);assert.equal(palette.dialog,retainedDialog);assert.equal(palette.search.query,'appearance');assert.equal(palette.search.regex,true);assert.equal(palette.dialog.open,true);
 for(const remove of dispose)remove();dispose[0]();assert.equal(palette.commands.some(command=>command.id.startsWith('appearance:')),false);
 assert.ok(palette.commands.some(command=>command.id==='view:drive'));
 for(const [node,calls]of before){assert.equal(node.calls.render,calls.render,node.localName+' cleanup render');assert.equal(node.calls.configure,calls.configure,node.localName+' cleanup configure');}
 foundation.destroy();
});
