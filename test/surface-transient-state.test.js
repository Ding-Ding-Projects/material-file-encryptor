import test from 'node:test';
import assert from 'node:assert/strict';
import {captureSurfaceState,restoreSurfaceState} from '../src/shared/surface/transient-state.js';
test('language reconstruction preserves query, selection and open dialog',()=>{
 const make=()=>{const input={localName:'input',value:'typed query',selectionStart:2,selectionEnd:6,getRootNode:()=>({activeElement:input}),setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;},focus(){this.focused=true;}};const dialog={localName:'md-dialog',open:true,getRootNode:()=>({}),show(){this.open=true;}};return{input,dialog,querySelectorAll:()=>[input,dialog]};};
 const original=make(),saved=captureSurfaceState(original),rebuilt=make();rebuilt.input.value='';rebuilt.input.selectionStart=0;rebuilt.dialog.open=false;
 restoreSurfaceState(rebuilt,saved);assert.equal(rebuilt.input.value,'typed query');assert.equal(rebuilt.input.selectionStart,2);assert.equal(rebuilt.input.selectionEnd,6);assert.equal(rebuilt.input.focused,true);assert.equal(rebuilt.dialog.open,true);
});
