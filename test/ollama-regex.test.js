import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {createRegexFilter} from '../src/renderer/features/ollama/regex.js';
const source=new URL('../src/renderer/features/ollama/regex-worker.js',import.meta.url).href;
let activeWorkers=0;
function createWorker(){
  const thread=new NodeWorker(`const {parentPort}=require('node:worker_threads');global.self={postMessage:data=>parentPort.postMessage(data)};import(${JSON.stringify(source)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true,execArgv:[]});
  activeWorkers++;let terminated=false;
  const bridge={onmessage:null,onerror:null,postMessage:data=>thread.postMessage(data),terminate(){if(!terminated){terminated=true;activeWorkers--;}void thread.terminate();}};
  thread.on('message',data=>bridge.onmessage?.({data}));thread.on('error',error=>bridge.onerror?.(error));return bridge;
}
test('actual worker evaluates expressions, reports syntax errors and honors anchored mode',async()=>{
  const filter=createRegexFilter({createWorker});try{
    assert.deepEqual(await filter.filter('alpha',['alpha','alphabet','beta'],'exact'),[0]);
    assert.deepEqual(await filter.filter('alpha',['alpha','alphabet','beta'],'start'),[0,1]);
    await assert.rejects(filter.filter('[',['alpha']),/invalid/);
  }finally{filter.dispose();}assert.equal(activeWorkers,0);
});
test('catastrophic expression is terminated while the main event loop stays responsive',async()=>{
  const filter=createRegexFilter({createWorker});const start=performance.now();let ticked=false;
  const timer=setTimeout(()=>{ticked=true;},25);
  try{await assert.rejects(filter.filter('a*'.repeat(20)+'b',['a'.repeat(100)]),/deadline/);assert.equal(ticked,true);assert.ok(performance.now()-start<2000);}
  finally{clearTimeout(timer);filter.dispose();}assert.equal(activeWorkers,0);
});
test('superseding and disposal terminate pending workers and enforce payload bounds',async()=>{
  const filter=createRegexFilter({createWorker});
  const pending=filter.filter('a*'.repeat(20)+'b',['a'.repeat(100)]);const rejected=assert.rejects(pending,/superseded/);
  assert.deepEqual(await filter.filter('b',['b']),[0]);await rejected;
  await assert.rejects(filter.filter('a'.repeat(129),['a']),/limits/);
  filter.dispose();assert.equal(activeWorkers,0);await assert.rejects(filter.filter('a',['a']),/closed/);
});
test('renderer does not evaluate user expressions on its event loop',async()=>{
  const renderer=await readFile(new URL('../src/renderer/features/ollama/index.js',import.meta.url),'utf8');
  assert.ok(renderer.includes('regexFilter.filter('));assert.ok(renderer.includes('regexFilter.dispose()'));assert.ok(!renderer.includes('new RegExp('));
});
