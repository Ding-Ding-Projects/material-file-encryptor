import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessDocument} from './helpers/local-access-dom.js';
import {createImageStateController,resolveTargetImageLayers,targetImageStates} from '../src/renderer/features/personalization/image-state-controller.js';
import {mountAppearanceEditor} from '../src/renderer/features/personalization/appearance.js';
import {renderImageLayers,defaultImageTransform} from '../src/renderer/features/personalization/image-layers.js';
const tick=()=>new Promise(resolve=>queueMicrotask(resolve));
function fixture(){
 const doc=createAccessDocument(),listeners=new Map();
 doc.addEventListener=(name,fn)=>{const set=listeners.get(name)||new Set();set.add(fn);listeners.set(name,set);};
 doc.removeEventListener=(name,fn)=>listeners.get(name)?.delete(fn);
 const dispatch=event=>{for(const fn of listeners.get(event.type)||[])fn(event);};
 const create=doc.createElement.bind(doc);doc.createElement=tag=>{const node=create(tag);node.style={};if(tag==='mfe-context-menu')node.close=()=>{node.hidden=true;};node.contains=other=>node===other||node.children.some(child=>child.contains(other));node.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100});const original=node.matches.bind(node);node.pseudos=new Set();node.matches=selector=>selector.startsWith(':')?node.pseudos.has(selector):original(selector);return node;};
 doc.createElementNS=(_ns,tag)=>doc.createElement(tag);
 const root=doc.createElement('main'),a=doc.createElement('button'),b=doc.createElement('button');root.append(a,b);doc.body.append(root);
 let mutation,disconnected=false;class Observer{constructor(fn){mutation=fn;}observe(){}disconnect(){disconnected=true;}}
 return {doc,root,a,b,dispatch,listeners,Observer,mutate:()=>mutation(),get disconnected(){return disconnected;}};
}
const image=name=>({name,visible:true,imageSource:{version:1,mime:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAAAAAAAAAAAAUlEQVQBAAAAAAAAAABJRU5EAAAAAA==',width:2,height:3,bytes:58},imageTransform:{...defaultImageTransform(),x:name.includes('hover')?10:name.includes('pressed')?20:0}});
test('live target events update independent image overlays and keyboard release restores normal',async()=>{
 const f=fixture(),model={elements:{a:{normal:[image('a-normal')],hover:[image('a-hover')],active:[image('a-pressed')]},b:{normal:[image('b-normal')],hover:[image('b-hover')]}},inheritance:{a:{hover:'none',active:'none'},b:{hover:'none'}}};
 let overlays=[];const paint=()=>{overlays.forEach(node=>node.remove());overlays=[];for(const [id,target]of [['a',f.a],['b',f.b]])if(target.isConnected){const overlay=renderImageLayers(target,resolveTargetImageLayers(model,id,controller.states(target)),v=>v);if(overlay)overlays.push(overlay);}};
 const controller=createImageStateController(f.root,paint,{MutationObserverClass:f.Observer});controller.sync([f.a,f.b]);paint();
 const images=()=>f.doc.body.querySelectorAll('image').map(node=>node.parentElement.parentElement.getAttribute('transform'));
 f.a.pseudos.add(':hover');f.dispatch({type:'pointerover',target:f.a});await tick();assert.deepEqual(images(),['translate(10 0) translate(50 50) rotate(0) skewX(0) skewY(0) scale(1 1) translate(-50 -50)','translate(0 0) translate(50 50) rotate(0) skewX(0) skewY(0) scale(1 1) translate(-50 -50)']);
 f.dispatch({type:'keydown',key:' ',target:f.a});await tick();assert.deepEqual(images(),['translate(20 0) translate(50 50) rotate(0) skewX(0) skewY(0) scale(1 1) translate(-50 -50)','translate(0 0) translate(50 50) rotate(0) skewX(0) skewY(0) scale(1 1) translate(-50 -50)']);
 f.a.pseudos.clear();f.dispatch({type:'keyup',key:' ',target:f.a});await tick();assert.deepEqual(images(),Array(2).fill('translate(0 0) translate(50 50) rotate(0) skewX(0) skewY(0) scale(1 1) translate(-50 -50)'));
 controller.destroy();overlays.forEach(node=>node.remove());assert.equal(f.doc.body.querySelectorAll('image').length,0);
});
test('attribute states follow authored precedence and explicit inheritance without editor state',()=>{
 const f=fixture();f.a.pseudos.add(':focus-visible');f.a.setAttribute('aria-busy','true');f.a.setAttribute('aria-disabled','true');
 const model={elements:{a:{hover:[image('hover')],focus:[image('focus')],disabled:[image('disabled')],loading:[image('loading')],normal:[image('normal')]}},inheritance:{a:{focus:'hover',loading:'none'}}};
 assert.deepEqual(resolveTargetImageLayers(model,'a',targetImageStates(f.a)).map(l=>l.name),['loading']);
 f.a.setAttribute('aria-busy','false');f.a.setAttribute('aria-disabled','false');assert.deepEqual(resolveTargetImageLayers(model,'a',targetImageStates(f.a)).map(l=>l.name),['normal','hover','focus']);
 for(const [attribute,state]of [['aria-selected','selected'],['aria-grabbed','dragged'],['aria-invalid','invalid'],['data-state','error']]){f.a.setAttribute(attribute,attribute==='data-state'?'error':'true');assert.ok(targetImageStates(f.a).has(state));}
});
test('detached targets and destroyed controllers cannot retain or deliver stale state',async()=>{
 const f=fixture();let calls=0;const controller=createImageStateController(f.root,()=>calls++,{MutationObserverClass:f.Observer});controller.sync([f.a,f.b]);
 f.dispatch({type:'keydown',key:'Enter',target:f.a});await tick();assert.ok(controller.states(f.a).has('active'));
 f.a.remove();f.mutate();await tick();assert.equal(controller.states(f.a).has('active'),false);
 const before=calls;f.dispatch({type:'keydown',key:'Enter',target:f.a});await tick();assert.equal(calls,before);
 f.b.pseudos.add(':hover');f.dispatch({type:'pointerover',target:f.b});controller.destroy();await tick();assert.equal(calls,before);assert.equal(f.disconnected,true);assert.equal([...f.listeners.values()].reduce((n,set)=>n+set.size,0),0);
});

test('mounted appearance editor applies live state to one target and destroys its observers',async()=>{
 const f=fixture();f.a.id='a';f.b.id='b';f.doc.documentElement={style:{setProperty(){}}};f.doc.adoptedStyleSheets=[];
 f.doc.defaultView={CSSStyleSheet:class{replaceSync(){}},MutationObserver:f.Observer};
 const previous={CSS:globalThis.CSS,addEventListener:globalThis.addEventListener,removeEventListener:globalThis.removeEventListener};
 globalThis.CSS={escape:value=>value};globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
 let editor;
 try {
  editor=mountAppearanceEditor(f.root,{storage:{getItem:()=>null,setItem(){}}});
  editor.setState({version:1,elements:{'id:a':{normal:[image('a-normal')],hover:[image('a-hover')]},'id:b':{normal:[image('b-normal')],hover:[image('b-hover')]}},inheritance:{'id:a':{hover:'none'},'id:b':{hover:'none'}}});
  f.a.pseudos.add(':hover');f.dispatch({type:'pointerover',target:f.a});await tick();
  assert.deepEqual(f.doc.body.querySelectorAll('image').map(node=>node.parentElement.parentElement.getAttribute('transform')),['translate(10 0) translate(50 50) rotate(0) skewX(0) skewY(0) scale(1 1) translate(-50 -50)','translate(0 0) translate(50 50) rotate(0) skewX(0) skewY(0) scale(1 1) translate(-50 -50)']);
  f.a.remove();f.mutate();await tick();assert.deepEqual(f.doc.body.querySelectorAll('image').map(node=>node.parentElement.parentElement.getAttribute('transform')),['translate(0 0) translate(50 50) rotate(0) skewX(0) skewY(0) scale(1 1) translate(-50 -50)']);
  f.root.append(f.a);f.mutate();await tick();assert.equal(f.doc.body.querySelectorAll('image').length,2,'reattachment automatically restores the overlay');
  const added=f.doc.createElement('button');added.id='a';f.root.append(added);f.mutate();await tick();assert.equal(f.doc.body.querySelectorAll('image').length,3,'new matching target automatically receives its image');
  const stable=[...f.doc.body.querySelectorAll('image')];
  // Repeated observer deliveries caused by our generated SVG/defs must settle,
  // rather than replace overlays again and cause an unbounded mutation cycle.
  for(let i=0;i<20;i++){f.mutate();await tick();}
  assert.deepEqual(f.doc.body.querySelectorAll('image'),stable,'owned rendering mutations do not repaint an unchanged target topology');
  editor.destroy();editor=null;f.b.pseudos.add(':hover');f.dispatch({type:'pointerover',target:f.b});await tick();assert.equal(f.doc.body.querySelectorAll('image').length,0);assert.equal(f.disconnected,true);
 }finally{editor?.destroy();for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
