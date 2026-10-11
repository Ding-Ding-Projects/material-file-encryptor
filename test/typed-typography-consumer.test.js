import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessDocument} from './helpers/local-access-dom.js';
import {mountTypographyInspector,TYPOGRAPHY_FIELDS,validateTypographyValue} from '../src/renderer/features/personalization/typography-inspector.js';
function fixture(){
 const doc=createAccessDocument(),create=doc.createElement.bind(doc),definitions=new Map(),Base=create('span').constructor;
 class HTMLElement extends Base{constructor(){super(doc,'mfe-control-guidance');}attachShadow(){this.shadowRoot=create('section');}}
 doc.adoptedStyleSheets=[];doc.documentElement={lang:'en'};doc.defaultView={HTMLElement,Event,CSSStyleSheet:class{replaceSync(){}},customElements:{get:tag=>definitions.get(tag),define:(tag,C)=>definitions.set(tag,C)}};
 doc.createElement=tag=>{const n=tag==='mfe-control-guidance'?new (definitions.get(tag))():create(tag);n.style={};n.before=function(node){node.parentNode=this.parentNode;this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this),0,node);};return n;};
 const host=create('section');doc.body.append(host);let current={fontSize:'16px',fontWeight:'400'},locked=false,writes=0,adapter=patch=>{for(const [key,value]of Object.entries(patch))if(value===undefined)delete current[key];else current[key]=value;writes++;return true;};
 const editor=mountTypographyInspector(host,{getCurrent:()=>current,mutate:patch=>adapter(patch),disabled:()=>locked,supports:()=>true});
 return{doc,host,editor,field:key=>host.querySelectorAll('md-outlined-text-field').find(n=>n.label===TYPOGRAPHY_FIELDS.find(row=>row[0]===key)[1]),get current(){return current;},get writes(){return writes;},replace:value=>current=value,lock:()=>locked=true,setAdapter:fn=>adapter=fn};
}
test('typed parsers reject malformed, nonfinite, out of range and executable values',()=>{
 const field=key=>TYPOGRAPHY_FIELDS.find(row=>row[0]===key);
 for(const [key,value]of [['fontSize','Infinitypx'],['fontSize','999px'],['fontSize','33em'],['fontWeight','1e3'],['lineHeight','NaN'],['letterSpacing','-21px'],['textAlign','script'],['textShadow','url(https://invalid)'],['webkitTextStroke','99px #ffffff']])assert.throws(()=>validateTypographyValue(field(key),value),key);
 assert.equal(validateTypographyValue(field('textShadow'),'0px 0px 8px #6750a4'),'0px 0px 8px #6750a4');
});
test('actual direct field uses the original consumer once and re-resolves replaced current state',async()=>{
 const f=fixture();try{f.replace({fontSize:'20px'});const input=f.field('fontSize');input.value='24px';await input.dispatchEvent({type:'change'});assert.equal(f.current.fontSize,'24px');assert.equal(f.writes,1);assert.equal(f.host.querySelector('p').style.fontSize,'24px');}finally{f.editor.destroy();}
});
test('actual invalid field never mutates and rejected storage retains accepted sample',async()=>{
 const f=fixture();try{const input=f.field('fontSize');input.value='900px';await assert.rejects(input.dispatchEvent({type:'change'}));assert.equal(f.writes,0);assert.equal(f.current.fontSize,'16px');f.setAdapter(()=>false);input.value='30px';await assert.rejects(input.dispatchEvent({type:'change'}));assert.equal(f.current.fontSize,'16px');assert.equal(f.host.querySelector('p').style.fontSize,'16px');}finally{f.editor.destroy();}
});
test('locked and disposed consumers reject mutation without a competing state store',async()=>{
 const f=fixture();f.lock();await assert.rejects(f.editor.commit('fontWeight','700'));assert.equal(f.writes,0);f.editor.destroy();await assert.rejects(f.editor.commit('fontWeight','700'));assert.equal(f.writes,0);
});
test('existing unsupported portable value is displayed unchanged until explicit replacement',()=>{
 const f=fixture();try{f.replace({textShadow:'1px 2px 3px red, 4px 5px 6px blue'});f.editor.refresh();assert.equal(f.field('textShadow').value,f.current.textShadow);assert.equal(f.writes,0);}finally{f.editor.destroy();}
});
test('actual optional guidance dispatches the original change consumer exactly once',async()=>{
 const f=fixture();try{const input=f.field('fontSize');input.value='25px';const guide=input.parentNode.children[0],panel=guide.shadowRoot.children.at(-1);await guide.shadowRoot.children[1].click();for(let n=0;n<3;n++)await panel.querySelector('md-filled-button').click();assert.equal(f.current.fontSize,'25px');assert.equal(f.writes,1);}finally{f.editor.destroy();}
});
test('guidance cannot apply after a lock appears during navigation',async()=>{
 const f=fixture();try{const input=f.field('fontSize');input.value='25px';const guide=input.parentNode.children[0],panel=guide.shadowRoot.children.at(-1);await guide.shadowRoot.children[1].click();await panel.querySelector('md-filled-button').click();f.lock();for(let n=0;n<2;n++)await panel.querySelector('md-filled-button').click();assert.equal(f.writes,0);}finally{f.editor.destroy();}
});
test('Material controls and exact primitive registration are independently required',async()=>{
 const f=fixture();try{assert.equal(f.host.querySelectorAll('input').length,0);assert.equal(f.host.querySelectorAll('button').length,0);const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../src/shared/surface/registry.js',import.meta.url),'utf8'));assert.ok(source.includes("tag: 'mfe-typography-inspector'"));assert.ok(!source.replace("tag: 'mfe-typography-inspector'","tag: 'missing'").includes("tag: 'mfe-typography-inspector'"));}finally{f.editor.destroy();}
});
test('actual appearance integration saves one typed action and rolls rejected storage back before retry',async()=>{
 const {mountAppearanceEditor}=await import('../src/renderer/features/personalization/appearance.js');const f=fixture();f.editor.destroy();const doc=f.doc,create=doc.createElement.bind(doc);doc.createElement=tag=>{const node=create(tag);node.getBoundingClientRect=()=>({left:0,top:0,right:100,bottom:100,width:100,height:100});node.contains=other=>node===other||node.children.some(child=>child.contains(other));return node;};doc.createElementNS=(_ns,tag)=>doc.createElement(tag);doc.documentElement={lang:'en',dataset:{},style:{setProperty(){}}};doc.addEventListener=()=>{};doc.removeEventListener=()=>{};
 const saved=Object.fromEntries(['CSS','innerWidth','innerHeight','addEventListener','removeEventListener'].map(key=>[key,globalThis[key]]));Object.assign(globalThis,{CSS:{escape:value=>value,supports:()=>true},innerWidth:1000,innerHeight:800,addEventListener(){},removeEventListener(){}});let editor,fail=false,changes=0;try{const root=doc.createElement('main'),target=doc.createElement('button');target.id='typed-target';root.append(target);doc.body.append(root);editor=mountAppearanceEditor(root,{storage:{getItem:()=>null,setItem(){if(fail){fail=false;throw Error('synthetic storage rejection');}}},onChange:()=>changes++,attachSearch:()=>()=>{}});editor.open(target);const field=()=>doc.body.querySelectorAll('md-outlined-text-field').find(node=>node.label==='Font size');field().value='24px';await field().dispatchEvent({type:'change'});assert.equal(editor.getState().elements['id:typed-target'].normal[0].properties.fontSize,'24px');assert.equal(changes,1);fail=true;field().value='28px';await assert.rejects(field().dispatchEvent({type:'change'}));assert.equal(editor.getState().elements['id:typed-target'].normal[0].properties.fontSize,'24px');assert.equal(changes,1);fail=false;field().value='30px';await field().dispatchEvent({type:'change'});assert.equal(editor.getState().elements['id:typed-target'].normal[0].properties.fontSize,'30px');assert.equal(changes,2);}finally{editor?.destroy();Object.assign(globalThis,saved);}
});
