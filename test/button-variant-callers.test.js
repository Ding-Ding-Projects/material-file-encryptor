import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {control} from '../src/shared/surface/controls.js';
import {createAccessDocument} from './helpers/local-access-dom.js';
const source=readFileSync(new URL('../src/renderer/app.js',import.meta.url),'utf8');

test('archive action callers create outlined primitives before attaching retained operations',()=>{
 const document=createAccessDocument(),dictionary=new Map(),translate=text=>text;
 const statement=source.match(/const button=\(id,text,handler\)=>\{[\s\S]*?return el;\};/)?.[0];assert.ok(statement);
 const factory=new Function('control','t','dictionary',statement+'return button;')((tag,props)=>control(tag,props,[],document),translate,dictionary);
 const original=()=>{},button=factory('owned-action','Owned action',original);
 assert.equal(button.localName,'md-outlined-button');assert.equal(button.dataset.materialPrimitive,'md-outlined-button');
 assert.equal(button.type,'button');assert.equal(button.id,'owned-action');assert.equal(button.onclick,original);assert.equal(dictionary.get(button),'Owned action');
});

test('descendant actions keep submit values while selecting the intended filled primary component',()=>{
 const document=createAccessDocument(),statement=source.split(/\r?\n/).find(line=>line.includes("const footer=document.createElement('footer')")&&line.includes('Restore explicitly selected descendants'));
 assert.ok(statement);const footer=new Function('document','control','t',statement+'return footer;')(document,(tag,props)=>control(tag,props,[],document),text=>text);
 assert.deepEqual(footer.children.map(node=>({tag:node.localName,type:node.type,value:node.value})),[
 {tag:'md-text-button',type:'submit',value:'cancel'},{tag:'md-text-button',type:'submit',value:'folder'},{tag:'md-filled-button',type:'submit',value:'subtree'}]);
 assert.equal(footer.children[2].textContent,'Restore explicitly selected descendants');
});
