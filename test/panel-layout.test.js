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
test('contextual keyboard layout preserves content without permanent helper controls',()=>{
 const win={innerWidth:900,innerHeight:732,addEventListener(){},removeEventListener(){}};
 const content={identity:'existing content'},listeners={};let provider,removed=false;
 const panel={style:{},ownerDocument:{defaultView:win},parentElement:{clientWidth:900,clientHeight:700},clientWidth:500,clientHeight:400,children:[content],focus(){},setAttribute(){},removeAttribute(){},addEventListener(name,fn){listeners[name]=fn;},removeEventListener(){}};
 const layout=mountPanelLayout(panel,{id:'test',registerContextActions:(root,value)=>{assert.equal(root,panel);provider=value;return()=>{removed=true;};}});
 const items=provider({target:panel}).items;assert.equal(items.length,3);items[1].run();listeners.keydown({target:panel,key:'ArrowRight',shiftKey:true,preventDefault(){}});assert.equal(panel.style.width,'540px');
 items[0].run();listeners.keydown({target:panel,key:'ArrowDown',preventDefault(){}});assert.equal(panel.style.transform,'translate(0px,10px)');assert.deepEqual(panel.children,[content]);
 items[2].run();assert.equal(layout.model.get(),null);layout.destroy();assert.equal(removed,true);
});

test('an optional view without a distinct panel does not abort workspace initialization',()=>{
 const result=mountPanelLayout(null,{id:'offline'});
 assert.equal(result.available,false);
 assert.equal(result.reason,'Panel element unavailable');
 assert.doesNotThrow(()=>{result.setLanguage('yue');result.reset();result.destroy();});
});
