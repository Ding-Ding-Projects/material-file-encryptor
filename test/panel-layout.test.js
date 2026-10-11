import test from 'node:test';
import assert from 'node:assert/strict';
import {createPanelLayoutModel,normalizePanelLayout} from '../src/shared/surface/panel-layout.js';
test('panel bounds persist, clamp after viewport changes and reset',()=>{
 const map=new Map(),storage={getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};let bounds={width:900,height:700};
 const model=createPanelLayoutModel({storage,key:'panel',bounds:()=>bounds});assert.equal(model.get(),null);
 model.change({x:100,y:50,width:500,height:400});assert.deepEqual(createPanelLayoutModel({storage,key:'panel',bounds:()=>bounds}).get(),{x:100,y:50,width:500,height:400});
 bounds={width:320,height:480};assert.deepEqual(model.get(),{x:0,y:50,width:320,height:400});model.reset();assert.equal(model.get(),null);assert.equal(map.size,0);
});
test('malformed persisted geometry cannot place controls outside bounds',()=>{
 assert.deepEqual(normalizePanelLayout({x:9999,y:9999,width:-1,height:9999},{width:320,height:480}),{x:80,y:436,width:240,height:480});
 const model=createPanelLayoutModel({storage:{getItem:()=>'{invalid'},key:'panel'});assert.equal(model.get(),null);
});
import {mountPanelLayout} from '../src/shared/surface/panel-layout.js';
test('panel keyboard and pointer controls change layout and reset without rebuilding content',()=>{
 const oldSheet=globalThis.CSSStyleSheet;globalThis.CSSStyleSheet=class{replaceSync(){}};
 const node=()=>({style:{},children:[],listeners:{},append(...values){this.children.push(...values);},attachShadow(){return this.shadowRoot=node();},addEventListener(name,fn){this.listeners[name]=fn;},setPointerCapture(){},remove(){this.removed=true;}});
 const win={innerWidth:900,innerHeight:732,addEventListener(){},removeEventListener(){}};const doc={defaultView:win,createElement:()=>node()};
 const panel={...node(),ownerDocument:doc,parentElement:{clientWidth:900},getBoundingClientRect:()=>({width:500,height:400}),prepend(value){this.controls=value;}};panel.children.push({identity:'existing content'});const existing=panel.children[0];
 try{
  const layout=mountPanelLayout(panel,{id:'test'});const [move,resize,reset]=panel.controls.shadowRoot.children[0].children;
  resize.listeners.keydown({key:'ArrowRight',shiftKey:true,preventDefault(){}});assert.equal(panel.style.width,'540px');
  move.listeners.pointerdown({button:0,clientX:0,clientY:0,pointerId:1,preventDefault(){}});move.listeners.pointermove({clientX:20,clientY:10,pointerId:1});assert.equal(panel.style.transform,'translate(20px,10px)');
  assert.equal(panel.children[0],existing);reset.listeners.click();assert.equal(layout.model.get(),null);assert.equal(panel.style.width,undefined);layout.destroy();assert.equal(panel.controls.removed,true);
 }finally{if(oldSheet===undefined)delete globalThis.CSSStyleSheet;else globalThis.CSSStyleSheet=oldSheet;}
});

test('an optional view without a distinct panel does not abort workspace initialization',()=>{
 const result=mountPanelLayout(null,{id:'offline'});
 assert.equal(result.available,false);
 assert.equal(result.reason,'Panel element unavailable');
 assert.doesNotThrow(()=>{result.setLanguage('yue');result.reset();result.destroy();});
});
