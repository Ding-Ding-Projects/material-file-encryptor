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
