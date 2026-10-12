import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createAccessDocument} from './helpers/local-access-dom.js';
import {control,connectSelectSearch,controlHelperOwner,setControlLanguage} from '../src/shared/surface/controls.js';

const tick=()=>new Promise(resolve=>queueMicrotask(resolve));
function assertIcon(button){
 assert.equal(button.localName,'md-icon-button');
 const svg=button.children[0];
 assert.equal(svg?.localName,'svg');assert.equal(svg.namespaceURI,'http://www.w3.org/2000/svg');
 assert.equal(svg.getAttribute('viewBox'),'0 0 24 24');
 assert.equal(svg.getAttribute('width'),'24');assert.equal(svg.getAttribute('height'),'24');
 assert.equal(svg.getAttribute('aria-hidden'),'true');assert.equal(svg.getAttribute('focusable'),'false');
 assert.equal(svg.children[0].getAttribute('fill'),'currentColor');
 assert.equal(button.textContent,'');assert.equal(button.getAttribute('style'),null);
}

test('clear and select search render local SVG inside real icon buttons without resizing their touch targets',async()=>{
 const doc=createAccessDocument(),field=control('input',{label:'Folder',value:'owned'},[],doc),select=control('select',{label:'Format'},[],doc);doc.body.append(field,select);await tick();
 const clear=field.children.find(child=>child.localName==='md-icon-button');const search=doc.body.children.find(child=>child.hasAttribute('data-choice-search'));
 assertIcon(clear);assertIcon(search);assert.equal(clear.slot,'trailing-icon');assert.equal(clear.type,'button');assert.equal(search.type,'button');
 assert.equal(controlHelperOwner(clear),field);assert.equal(controlHelperOwner(search),select);
 const svg=clear.children[0];clear.replaceChildren(doc.createTextNode('×'));assert.throws(()=>assertIcon(clear));clear.replaceChildren(svg);assertIcon(clear);
});

test('clear preserves admission, value lifecycle and focus return',async()=>{
 const doc=createAccessDocument(),field=control('input',{label:'Folder',value:'owned'},[],doc);doc.body.append(field);await tick();
 const clear=field.children.find(child=>child.localName==='md-icon-button');const events=[];let admit=false;
 field.dispatchEvent=event=>{events.push(event.type);return event.type!=='mfe-action-request'||admit;};
 await clear.click();assert.equal(field.value,'owned');assert.deepEqual(events,['mfe-action-request']);
 admit=true;events.length=0;await clear.click();assert.equal(field.value,'');assert.deepEqual(events,['mfe-action-request','input','change']);assert.equal(doc.activeElement,field);
 field.value='kept';field.disabled=true;events.length=0;await clear.click();assert.equal(field.value,'kept');assert.deepEqual(events,[]);
});

test('select search keeps original identity, parent, selected value and customization across relabel and disposal',async()=>{
 const doc=createAccessDocument();doc.documentElement=doc.body;
 const form=doc.createElement('form'),select=control('select',{id:'format',label:'Format',value:'json'},[],doc);select.label='Format';select.setAttribute('style','--md-outlined-select-text-field-container-shape:20px');form.append(select);doc.body.append(form);await tick();
 const helper=form.children.find(child=>child.hasAttribute('data-choice-search')),dispose=connectSelectSearch(select);
 assert.equal(select.getAttribute('data-select-search-composition'),'adjacent');assert.equal(form.children[0],select);assert.equal(select.parentNode,form);assert.equal(select.value,'json');
 setControlLanguage(doc.body,'bilingual');assert.equal(form.children[1],helper);assert.equal(select.value,'json');assert.match(helper.getAttribute('aria-label'),/Search choices: Format.*搜尋選項：Format/);
 assert.equal(select.getAttribute('style'),'--md-outlined-select-text-field-container-shape:20px');
 dispose();assert.equal(select.parentNode,form);assert.equal(form.children.length,1);assert.equal(select.getAttribute('data-select-search-composition'),null);assert.equal(controlHelperOwner(helper),null);
});

test('dialog pairing reserves space through stylesheet composition without modifying control internals',async()=>{
 const css=await readFile(new URL('../src/renderer/modern.css',import.meta.url),'utf8');
 const check=text=>{assert.match(text,/\.dialog-body>md-outlined-select\[data-select-search-composition="adjacent"\]:has\(\+md-icon-button\[data-choice-search\]\)\{width:calc\(100% - 56px\);vertical-align:middle\}/);assert.match(text,/\.dialog-body>md-outlined-select\[data-select-search-composition="adjacent"\]\+md-icon-button\[data-choice-search\]\{vertical-align:middle;margin-inline:12px 4px\}/);};
 check(css);assert.throws(()=>check(css.replace('width:calc(100% - 56px)','width:100%')));
});

test('exact diagnostic design routes generate their own deterministic SVG content, not a populated drive fallback',async()=>{
 const source=await readFile(new URL('../design/gui-redesign/reference.js',import.meta.url),'utf8');
 const inventory=JSON.parse(await readFile(new URL('../design/gui-redesign/inventory.json',import.meta.url),'utf8'));
 const render=(screen,state,script=source)=>{const output={},document={documentElement:{dataset:{}},querySelector:()=>output};vm.runInNewContext(script,{location:{search:`?screen=${screen}&state=${state}&width=1180&height=752&scale=1.5&theme=light&lang=en`},URLSearchParams,document});return{svg:output.innerHTML,tuple:JSON.parse(document.documentElement.dataset.referenceTuple)};};
 for(const [screen,state,id]of [['drive','create-dialog','drive-create-dialog'],['history','filtered-empty','history-filtered-empty'],['recycle','filtered-empty','recycle-filtered-empty']]){
  const row=inventory.states.find(item=>item.id===id);assert.ok(row?.productionSelector);assert.ok(row.productionRoute);const result=render(screen,state);assert.equal(result.tuple.state,state);assert.doesNotMatch(result.svg,/Project notes\.txt|Archive\.zip/);assert.equal(result.svg,render(screen,state).svg);
  if(screen==='drive')assert.match(result.svg,/Encrypted storage transport/);else{assert.match(result.svg,/Synthetic query/);assert.match(result.svg,/No matching entries/);}
 }
 assert.notEqual(render('history','filtered-empty',source.replace(",'filtered-empty'",'')).tuple.state,'filtered-empty');
});
