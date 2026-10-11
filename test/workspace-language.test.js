import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Execute the production binding function with a small deterministic DOM fixture.
// Browser layout and native pairing are deliberately outside this unit's claims.
const source=await readFile(new URL('../docs/site/workspace.js',import.meta.url),'utf8');
const bindingSource=source.slice(source.indexOf('export function createWorkspaceCopyBindings'),source.indexOf('const root=document.querySelector'));
const {createWorkspaceCopyBindings}=await import(`data:text/javascript;base64,${Buffer.from(bindingSource).toString('base64')}`);
function fixture(){
 const text=(value,excluded=false)=>({nodeValue:value,parentElement:{closest:()=>excluded}});
 const heading=text('Connection'),label=text('One-use pairing code'),stream=text('Connection',true);
 const input={value:'unchanged input',selectionStart:3,selectionEnd:7,attributes:new Map([['aria-label','One-use pairing code']]),closest:()=>false,hasAttribute(name){return this.attributes.has(name);},getAttribute(name){return this.attributes.get(name);},setAttribute(name,value){this.attributes.set(name,value);}};
 const shadowText=text('Connection'),shadow={texts:[shadowText],querySelectorAll:()=>[]};
 const host={...input,attributes:new Map(),shadowRoot:shadow};
 const body={texts:[heading,label,stream],querySelectorAll:()=>[input,host]};
 const document={body,createTreeWalker(scope){let index=-1;return{currentNode:null,nextNode(){this.currentNode=scope.texts[++index];return Boolean(this.currentNode);}};}};
 return{document,heading,label,stream,input,host,shadowText};
}
const words={'Connection':'連線','One-use pairing code':'一次性配對碼'};
test('persistent labels refresh in all language modes while controls and state retain identity',()=>{
 const f=fixture();let language='en';const translate=value=>language==='yue'?words[value]:language==='bilingual'?`${value} · ${words[value]}`:value;
 const bindings=createWorkspaceCopyBindings({document:f.document,translate});
 for(const text of Object.keys(words))bindings.translate(text);
 const input=f.input,host=f.host;host.streamSubscription={active:true};
 for(const mode of ['yue','bilingual','en']){
  language=mode;bindings.refresh();
  assert.equal(f.heading.nodeValue,translate('Connection'));
  assert.equal(f.shadowText.nodeValue,translate('Connection'));
  assert.equal(f.input.getAttribute('aria-label'),translate('One-use pairing code'));
  assert.equal(f.input,input);assert.equal(f.host,host);assert.equal(host.streamSubscription.active,true);
  assert.equal(f.input.value,'unchanged input');assert.equal(f.input.selectionStart,3);assert.equal(f.input.selectionEnd,7);
  assert.equal(f.stream.nodeValue,'Connection');
 }
});
test('newly rendered status copy uses its current source rather than an earlier binding',()=>{
 const f=fixture();let language='en';const bindings=createWorkspaceCopyBindings({document:f.document,translate:value=>language==='yue'?words[value]:value});
 bindings.translate('Connection');bindings.translate('One-use pairing code');bindings.refresh();
 f.heading.nodeValue='One-use pairing code';language='yue';bindings.refresh();assert.equal(f.heading.nodeValue,'一次性配對碼');
 f.heading.nodeValue='A user supplied name';language='en';bindings.refresh();assert.equal(f.heading.nodeValue,'A user supplied name');
});
