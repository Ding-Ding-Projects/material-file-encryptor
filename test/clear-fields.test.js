import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installClearFields} from '../src/renderer/clear-fields.js';
import {createAccessDocument} from './helpers/local-access-dom.js';

function fixture(t,{tag='input',type='text',disabled=false,readOnly=false}={}){
 const doc=createAccessDocument(),form=doc.createElement('form'),input=doc.createElement(tag);
 input.type=type;input.disabled=disabled;input.readOnly=readOnly;input.value='Synthetic value';input.labels=[{textContent:' Folder '}];
 const nativeMatches=input.matches.bind(input);input.matches=selector=>selector===':disabled'?input.disabled:nativeMatches(selector);
 input.before=node=>{const parent=input.parentNode,index=parent.childNodes.indexOf(input);node.parentNode=parent;parent.childNodes.splice(index,0,node);};
 input.setCustomValidity=value=>{input.validityMessage=value;};
 input.focus=options=>{doc.activeElement=input;input.focusOptions=options;};
 doc.createElementNS=(namespace,tag)=>{const node=doc.createElement(tag);node.namespaceURI=namespace;return node;};
 form.append(input);doc.body.append(form);
 const query=doc.body.querySelectorAll.bind(doc.body);doc.body.querySelectorAll=selector=>selector==='input,textarea'?[...query('input'),...query('textarea')]:query(selector);
 const original=globalThis.MutationObserver;let callback,disconnected=false;
 globalThis.MutationObserver=class{constructor(fn){callback=fn;}observe(){}disconnect(){disconnected=true;}};
 t.after(()=>{globalThis.MutationObserver=original;});
 let language='en';const translate=value=>language==='yue'?({'Clear field':'清除欄位','Text field':'文字欄位'}[value]||value):value;
 const api=installClearFields(doc.body,translate),wrapper=input.parentNode,button=wrapper.children.find(node=>node.tagName==='MD-ICON-BUTTON');
 return{doc,form,input,wrapper,button,api,mutate:()=>callback(),setLanguage:value=>{language=value;},disconnected:()=>disconnected};
}
function assertAnatomy(button){
 assert.equal(button.tagName,'MD-ICON-BUTTON');assert.equal(button.type,'button');assert.equal(button.textContent,'');
 const svg=button.children[0];assert.equal(svg.tagName,'SVG');assert.equal(svg.namespaceURI,'http://www.w3.org/2000/svg');
 for(const[key,value]of Object.entries({viewBox:'0 0 24 24',width:'24',height:'24','aria-hidden':'true',focusable:'false'}))assert.equal(svg.getAttribute(key),value);
 assert.equal(svg.children[0].getAttribute('fill'),'currentColor');assert.equal(svg.children[0].namespaceURI,svg.namespaceURI);
}
test('clear helper uses the registered icon button and local accessible SVG anatomy',t=>{
 const f=fixture(t);assertAnatomy(f.button);assert.equal(f.button.getAttribute('aria-label'),'Clear field: Folder');
 const svg=f.button.children[0];f.button.replaceChildren('×');assert.throws(()=>assertAnatomy(f.button));f.button.replaceChildren(svg);assertAnatomy(f.button);
});
test('clear preserves the original input, form ancestry, events and focus without submit',async t=>{
 const f=fixture(t),events=[];f.input.id='owned-field';f.input.name='folder';f.input.setAttribute('data-owned','kept');f.input.dispatchEvent=e=>events.push({type:e.type,bubbles:e.bubbles});
 f.api.refresh();assert.equal(f.wrapper.parentNode,f.form);assert.equal(f.wrapper.children[0],f.input);assert.equal(f.wrapper.children.length,2);
 await f.button.click();assert.equal(f.input.value,'');assert.equal(f.input.validityMessage,'');assert.deepEqual(events,[{type:'input',bubbles:true},{type:'change',bubbles:true}]);
 assert.equal(f.doc.activeElement,f.input);assert.deepEqual(f.input.focusOptions,{preventScroll:true});assert.equal(f.input.id,'owned-field');assert.equal(f.input.name,'folder');assert.equal(f.input.getAttribute('data-owned'),'kept');
});
test('disabled and readonly fields reject stale helper activation and refresh state',async t=>{
 const f=fixture(t);for(const key of ['disabled','readOnly']){f.input[key]=true;f.mutate();assert.equal(f.button.disabled,true);await f.button.click();assert.equal(f.input.value,'Synthetic value');f.input[key]=false;f.mutate();assert.equal(f.button.disabled,false);}
});
test('locale and label refresh never put field values in accessible text',t=>{
 const f=fixture(t);f.setLanguage('yue');f.input.setAttribute('aria-label','資料夾');f.api.refresh();assert.equal(f.button.getAttribute('aria-label'),'清除欄位: 資料夾');assert.equal(f.button.title,'清除欄位: 資料夾');assert.doesNotMatch(f.button.title,/Synthetic value/);
});
test('hidden or noneditable inputs hide the owned helper and textarea remains supported',t=>{
 const f=fixture(t,{tag:'textarea'});assertAnatomy(f.button);f.input.hidden=true;f.mutate();assert.equal(f.wrapper.hidden,true);f.input.hidden=false;f.mutate();assert.equal(f.wrapper.hidden,false);f.api.disconnect();assert.equal(f.disconnected(),true);
});
test('type changes hide a password helper without changing its field identity',t=>{
 const f=fixture(t,{type:'password'});f.input.type='checkbox';f.mutate();assert.equal(f.wrapper.hidden,true);f.input.type='password';f.mutate();assert.equal(f.wrapper.hidden,false);assert.equal(f.wrapper.children[0],f.input);
});
test('host placement keeps component state and touch styling under vendor ownership',async()=>{
 const css=await readFile(new URL('../src/renderer/modern.css',import.meta.url),'utf8');
 const check=value=>{assert.match(value,/\.clearable-field>md-icon-button\.field-clear\{[^}]*right:4px;top:4px;width:40px;height:40px;min-width:40px;min-height:40px/);assert.doesNotMatch(value,/\.field-clear:(?:hover|disabled)/);assert.doesNotMatch(value,/\.drive-picker-input \.field-clear\{/);};
 check(css);assert.throws(()=>check(css.replace('width:40px;height:40px','width:44px;height:44px')));
 const imports=await readFile(new URL('../src/shared/surface/material-entry.js',import.meta.url),'utf8');assert.match(imports,/@material\/web\/iconbutton\/icon-button\.js/);
});
