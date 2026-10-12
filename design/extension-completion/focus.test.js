import test from 'node:test';
import assert from 'node:assert/strict';
import {captureFocusKey,restoreReferenceFocus} from './focus.js';
const control=(key,extra={})=>({dataset:{focusKey:key},isConnected:true,calls:[],focus(options){this.calls.push(options);},...extra});
const root=(controls,heading=control('heading'))=>({querySelectorAll:()=>controls,querySelector:()=>heading});
test('captures a stable key through nested Material component focus',()=>{
  const owner=control('reference-language:bilingual');
  owner.shadowRoot={activeElement:{getRootNode:()=>({host:owner})}};
  assert.equal(captureFocusKey({activeElement:owner}),'reference-language:bilingual');
});
test('restores the semantic control when label and component variant change',async()=>{
  const key=captureFocusKey({activeElement:control('reference-theme',{textContent:'Preview dark theme'})});
  const replacement=control('reference-theme',{textContent:'預覽淺色主題'}),heading=control('heading');
  assert.equal(await restoreReferenceFocus(root([replacement],heading),key),'control-restored');
  assert.deepEqual(replacement.calls,[{preventScroll:true}]);assert.equal(heading.calls.length,0);
});
test('state selector retains focus across a redraw',async()=>{
  const selected=control('reference-state:settings:appearance');
  assert.equal(await restoreReferenceFocus(root([selected]),selected.dataset.focusKey),'control-restored');
  assert.equal(selected.calls.length,1);
});
test('only a removed initiating control falls back to the heading',async()=>{
  const heading=control('heading');
  assert.equal(await restoreReferenceFocus(root([],heading),'reference-language:yue'),'heading-fallback');
  assert.equal(heading.calls.length,1);
});
test('initial render with no initiating control does not steal focus',async()=>{
  const heading=control('heading');
  assert.equal(await restoreReferenceFocus(root([],heading),null),'no-focus-request');
  assert.equal(heading.calls.length,0);
});
test('waits for asynchronous component rendering before focusing',async()=>{
  let finish;
  const target=control('tab-history',{updateComplete:new Promise(resolve=>{finish=resolve;})});
  const pending=restoreReferenceFocus(root([target]),'tab-history');
  assert.equal(target.calls.length,0);finish();
  assert.equal(await pending,'control-restored');assert.equal(target.calls.length,1);
});
test('a newer redraw prevents stale asynchronous focus restoration',async()=>{
  let finish,current=true;
  const target=control('reference-theme',{updateComplete:new Promise(resolve=>{finish=resolve;})});
  const pending=restoreReferenceFocus(root([target]),'reference-theme',()=>current);
  current=false;finish();
  assert.equal(await pending,'superseded');assert.equal(target.calls.length,0);
});
test('a detached component never receives restored focus',async()=>{
  const target=control('reference-theme',{isConnected:false});
  assert.equal(await restoreReferenceFocus(root([target]),'reference-theme'),'superseded');
  assert.equal(target.calls.length,0);
});
