import test from 'node:test';
import assert from 'node:assert/strict';
import {renderNoteText} from '../browser-extension/notes.js';
import {renderMarkdown} from '../src/renderer/features/documentation/markdown.js';
class Element {
 constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.childNodes=[];this.dataset={};this.style={};}
 set textContent(value){this.text='';this.childNodes=[];if(value!==''){const text=new Element('#text',this.ownerDocument);text.text=String(value);this.append(text);}}
 get textContent(){return (this.text||'')+this.childNodes.map(n=>n.textContent).join('');}
 append(...nodes){for(const n of nodes){n.parent=this;this.childNodes.push(n);}}
 replaceChildren(...nodes){this.text='';this.childNodes=[];this.append(...nodes);}
 replaceWith(node){const at=this.parent.childNodes.indexOf(this);this.parent.childNodes.splice(at,1,node);node.parent=this.parent;}
 setAttribute(name,value){this[name]=value;}
 addEventListener(){}
 querySelectorAll(tag){return this.childNodes.flatMap(n=>[...(n.tagName===tag?[n]:[]),...n.querySelectorAll(tag)]);}
}
const doc={createElement:tag=>new Element(tag,doc),createTextNode:text=>{const n=new Element('#text',doc);n.textContent=text;return n;}};
function render(text){globalThis.document=doc;const host=doc.createElement('div');renderNoteText(host,text,renderMarkdown);return host;}
test('full note renderer formats headings, emphasis, lists and fenced code without executing HTML',()=>{
 const h=render('# Heading\n\n**Strong**\n\n- One\n- Two\n\n~~~js\n<script>bad()</script>\n~~~');
 assert.equal(h.querySelectorAll('h1')[0].textContent,'Heading');assert.equal(h.querySelectorAll('strong')[0].textContent,'Strong');assert.equal(h.querySelectorAll('li').length,2);assert.equal(h.querySelectorAll('code')[0].textContent,'<script>bad()</script>');assert.equal(h.querySelectorAll('script').length,0);
});
test('untrusted links cannot open insecure, credential-bearing or executable destinations',()=>{
 const h=render('[Safe](https://example.com/a) [Insecure](http://example.com) [Credential](https://person:secret@example.com) [Script](javascript:alert(1)) [Relative](../notes.md)\n\n![Tracking](https://example.com/pixel.png)');
 const links=h.querySelectorAll('a');assert.equal(links.length,1);assert.equal(links[0].href,'https://example.com/a');assert.equal(links[0].rel,'noopener noreferrer');assert.equal(links[0].referrerPolicy,'no-referrer');assert.equal(h.querySelectorAll('img').length,0);assert.match(h.textContent,/Tracking/);
});
test('empty and over-limit input are explicit and rejected input leaves prior view intact',()=>{
 const h=render('');assert.equal(h.textContent,'No text was provided.');h.textContent='Previous';assert.throws(()=>renderNoteText(h,'a'.repeat(4001),renderMarkdown),/4,000/);assert.equal(h.textContent,'Previous');
 const full=render('a'.repeat(4000));assert.equal(full.textContent.length,4000);
});
