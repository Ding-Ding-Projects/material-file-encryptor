import test from 'node:test';
import assert from 'node:assert/strict';
import {LockController} from '../src/renderer/features/access/locks.js';

test('one-activation session is consumed before callback reentry and after exceptions',async()=>{
 const controller=new LockController();await controller.set('one','pin',{pin:'1234'},0,'once');
 assert.equal(await controller.unlock('one',{pin:'1234'}),true);
 let count=0;controller.run('one',()=>{count++;assert.equal(controller.run('one',()=>count++),false);});
 assert.equal(count,1);assert.equal(controller.isLocked('one'),true);
 assert.equal(await controller.unlock('one',{pin:'1234'}),true);
 assert.throws(()=>controller.run('one',()=>{throw new Error('synthetic');}),/synthetic/);
 assert.equal(controller.isLocked('one'),true);
});

test('timed sessions retain repeated activation and invalid modes are rejected',async()=>{
 const controller=new LockController();await controller.set('normal','pin',{pin:'1234'});
 await controller.unlock('normal',{pin:'1234'});assert.equal(controller.run('normal',()=>1),1);assert.equal(controller.run('normal',()=>2),2);
 await assert.rejects(controller.set('invalid','pin',{pin:'1234'},0,'unknown'),/valid unlock session/);
 assert.equal(controller.describe('normal').sessionMode,'timed');
});

test('one activation is consumed on an allowed DOM action, not pointer preparation',async()=>{
 const controller=new LockController();await controller.set('one','pin',{pin:'1234'},0,'once');await controller.unlock('one',{pin:'1234'});
 const handlers=new Map(),root={addEventListener:(type,handler)=>handlers.set(type,handler),removeEventListener:type=>handlers.delete(type)};
 const dispose=controller.intercept(root,()=> 'one');let prevented=0;const event=type=>({type,target:{},preventDefault:()=>prevented++,stopImmediatePropagation(){}});
 handlers.get('pointerdown')(event('pointerdown'));assert.equal(controller.isLocked('one'),false);
 handlers.get('click')(event('click'));assert.equal(prevented,0);assert.equal(controller.isLocked('one'),true);
 handlers.get('click')(event('click'));assert.equal(prevented,1);dispose();assert.equal(handlers.size,0);
});

test('combined capture and event guard admit once without admitting reentry or another event',async()=>{
 const c=new LockController();await c.set('one','pin',{pin:'1234'},0,'once');await c.unlock('one',{pin:'1234'});const handlers=new Map();c.intercept({addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener(){}},()=> 'one');let ran=0,blocked=0;const event={type:'click',target:{},preventDefault(){blocked++;},stopImmediatePropagation(){}};handlers.get('click')(event);assert.equal(c.runForEvent('one',event,()=>{ran++;assert.equal(c.runForEvent('one',event,()=>ran++),false);}),undefined);assert.equal(ran,1);handlers.get('click')({...event});assert.equal(blocked,1);assert.equal(c.runForEvent('one',{...event},()=>ran++),false);
 await c.unlock('one',{pin:'1234'});const reverse={...event};c.runForEvent('one',reverse,()=>{handlers.get('click')(reverse);ran++;assert.equal(c.runForEvent('one',reverse,()=>ran++),false);});assert.equal(ran,2);assert.equal(blocked,1);
});

test('guarded generated control actions admit only owned synchronous events',async()=>{
 const c=new LockController();await c.set('one','pin',{pin:'1234'},0,'once');const handlers=new Map();c.intercept({addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener(){}},()=> 'one');let blocked=0,ran=0;const button={tagName:'BUTTON'},input={tagName:'INPUT'};const dispatch=(target,type)=>handlers.get(type)({target,type,isTrusted:false,preventDefault(){blocked++;},stopImmediatePropagation(){}});
 await c.unlock('one',{pin:'1234'});c.runControl('one',button,()=>{dispatch(button,'click');ran++;assert.equal(c.runControl('one',button,()=>ran++),false);dispatch(button,'click');});assert.equal(ran,1);assert.equal(blocked,1);dispatch(button,'click');assert.equal(blocked,2);
 await c.unlock('one',{pin:'1234'});c.runControl('one',input,()=>{dispatch(input,'input');dispatch(input,'change');dispatch(button,'click');});assert.equal(blocked,3);dispatch(input,'change');assert.equal(blocked,4);assert.equal(c.isLocked('one'),true);
});

test('captured admissions expire and relocking invalidates them; generated events hand off once',async()=>{
 const c=new LockController();await c.set('one','pin',{pin:'1234'},0,'once');const handlers=new Map();c.intercept({addEventListener:(n,f)=>handlers.set(n,f),removeEventListener(){}},()=> 'one');const button={tagName:'BUTTON'};const event=()=>({type:'click',target:button,isTrusted:false,preventDefault(){},stopImmediatePropagation(){}});let ran=0;
 await c.unlock('one',{pin:'1234'});const stale=event();handlers.get('click')(stale);await Promise.resolve();assert.equal(c.runForEvent('one',stale,()=>ran++),false);
 await c.unlock('one',{pin:'1234'});const relocked=event();handlers.get('click')(relocked);c.lock('one');assert.equal(c.runForEvent('one',relocked,()=>ran++),false);
 await c.unlock('one',{pin:'1234'});c.runControl('one',button,()=>{const e=event();handlers.get('click')(e);c.runForEvent('one',e,()=>ran++);assert.equal(c.runForEvent('one',e,()=>ran++),false);});assert.equal(ran,1);
});


test('shadow control identity protects the public host and consumes one activation exactly once',async()=>{
 const controller=new LockController();await controller.set('shadow','pin',{pin:'1234'},0,'once');
 const handlers=new Map();controller.intercept({addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener(){}});
 const host={tagName:'MD-TEXT-BUTTON',dataset:{materialPrimitive:'md-text-button',lockId:'shadow'},closest(){return this;}};
 const inner={tagName:'BUTTON',closest(){return null;}};let blocked=0,ran=0;
 const event=type=>({type,target:host,isTrusted:false,composedPath:()=>[inner,host],preventDefault(){blocked++;},stopImmediatePropagation(){}});
 handlers.get('click')(event('click'));assert.equal(blocked,1);
 await controller.unlock('shadow',{pin:'1234'});
 const preparation=event('mfe-action-request');handlers.get('mfe-action-request')(preparation);assert.equal(controller.isLocked('shadow'),false);
 controller.runControl('shadow',host,()=>{const e=event('click');handlers.get('click')(e);controller.runForEvent('shadow',e,()=>ran++);assert.equal(controller.runForEvent('shadow',e,()=>ran++),false);handlers.get('click')(event('click'));});
 assert.equal(ran,1);assert.equal(blocked,2);assert.equal(controller.isLocked('shadow'),true);
});

test('adjacent picker admission uses its dispatch source and rejects forged detail identity',async()=>{
 const controller=new LockController();await controller.set('picker','pin',{pin:'1234'});const handlers=new Map();controller.intercept({addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener(){}});
 const host={tagName:'MD-OUTLINED-SELECT',dataset:{materialPrimitive:'md-outlined-select',lockId:'picker'},closest(){return this;}};let blocked=0;
 const e={type:'mfe-action-request',target:host,detail:{target:{dataset:{lockId:'other'}}},composedPath:()=>[host],preventDefault(){blocked++;},stopImmediatePropagation(){}};
 handlers.get(e.type)(e);assert.equal(blocked,1);await controller.unlock('picker',{pin:'1234'});handlers.get(e.type)(e);assert.equal(blocked,1);
});


test('editable Material controls do not spend one activation opening their picker',async()=>{
 const c=new LockController();await c.set('choice','pin',{pin:'1234'},0,'once');await c.unlock('choice',{pin:'1234'});const handlers=new Map();c.intercept({addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener(){}});
 const host={tagName:'MD-OUTLINED-SELECT',dataset:{materialPrimitive:'md-outlined-select',lockId:'choice'},closest(){return this;}};let blocked=0;const dispatch=type=>handlers.get(type)({type,target:host,composedPath:()=>[host],preventDefault(){blocked++;},stopImmediatePropagation(){}});
 dispatch('click');assert.equal(c.isLocked('choice'),false);dispatch('input');assert.equal(c.isLocked('choice'),false);dispatch('change');assert.equal(c.isLocked('choice'),true);assert.equal(blocked,0);dispatch('change');assert.equal(blocked,1);
});


test('cancelled lock creation cannot persist a late credential record',async()=>{
 const records=new Map();let release,started;const ready=new Promise(r=>started=r),hold=new Promise(r=>release=r);const store={get:async key=>records.get(key),set:async(key,value)=>{started();await hold;records.set(key,value);},delete:async key=>records.delete(key)};
 const c=new LockController({store});const pending=c.set('cancelled-create','pin',{pin:'1234'});await ready;c.cancel('cancelled-create');release();await assert.rejects(pending,/cancelled/);assert.equal(c.describe('cancelled-create'),null);assert.equal(records.has('element-lock:cancelled-create'),false);
});


test('nested noncomposed changes remain locked and composed capture consumes once across roots',async()=>{
 const c=new LockController();await c.set('nested','pin',{pin:'1234'},0,'once');
 const target=()=>({handlers:new Map(),addEventListener(type,fn){this.handlers.set(type,fn);},removeEventListener(type){this.handlers.delete(type);}});
 const root=target(),shadow=target(),outer={dataset:{lockId:'nested'},closest(){return this;},shadowRoot:shadow};shadow.host=outer;
 const input={tagName:'MD-OUTLINED-SELECT',dataset:{materialPrimitive:'md-outlined-select'},closest(){return null;},getRootNode:()=>shadow};root.querySelectorAll=()=>[outer];shadow.querySelectorAll=()=>[input];
 const dispose=c.intercept(root);let blocked=0;const event=path=>({type:'change',target:input,composedPath:()=>path,preventDefault(){blocked++;},stopImmediatePropagation(){}});
 shadow.handlers.get('change')(event([input,shadow]));assert.equal(blocked,1);
 await c.unlock('nested',{pin:'1234'});const composed=event([input,shadow,outer,root]);root.handlers.get('change')(composed);shadow.handlers.get('change')(composed);assert.equal(blocked,1);assert.equal(c.isLocked('nested'),true);
 root.handlers.get('change')(composed);assert.equal(blocked,2);dispose();assert.equal(root.handlers.size,0);assert.equal(shadow.handlers.size,0);
});
