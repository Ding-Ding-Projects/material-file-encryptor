import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessDocument} from './helpers/local-access-dom.js';
import {mountAppearanceEditor} from '../src/renderer/features/personalization/appearance.js';

test('appearance adopts constructed rules and removes only its own sheet',()=>{
 const document=createAccessDocument(),root=document.createElement('main');
 document.body.append(root);document.documentElement={style:{setProperty(){}}};
 document.createElementNS=(_namespace,tag)=>document.createElement(tag);
 document.addEventListener=()=>{};document.removeEventListener=()=>{};
 const existing={},later={};document.adoptedStyleSheets=[existing];
 class Sheet{replaceSync(text){this.text=text;}}
 document.defaultView={CSSStyleSheet:Sheet};
 const create=document.createElement.bind(document);
 document.createElement=tag=>{assert.notEqual(tag,'style','CSP forbids an inline style element');return create(tag);};
 const previous={addEventListener:globalThis.addEventListener,removeEventListener:globalThis.removeEventListener,CSS:globalThis.CSS};
 globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};globalThis.CSS={escape:value=>value};
 try{
  const editor=mountAppearanceEditor(root,{storage:{getItem:()=>null,setItem(){}}});
  const sheet=document.adoptedStyleSheets[1];assert.ok(sheet instanceof Sheet);assert.equal(sheet.text,'');
  editor.setState({version:1,elements:{sample:{normal:[{name:'Base',properties:{color:'#123456'}}],hover:[{name:'Hover',properties:{opacity:'.5'}}]}}});
  assert.match(sheet.text,/color:#123456 !important/);assert.match(sheet.text,/:hover\{/);assert.match(sheet.text,/opacity:.5 !important/);
  editor.reset();assert.equal(sheet.text,'');
  document.adoptedStyleSheets=[...document.adoptedStyleSheets,later];editor.destroy();editor.destroy();
  assert.deepEqual(document.adoptedStyleSheets,[existing,later]);
 }finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
