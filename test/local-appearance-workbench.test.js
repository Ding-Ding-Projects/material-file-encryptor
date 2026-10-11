import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePoint,snapPoint,freehandSelection,validateGuides,mountSelectionWorkbench,mountStatePreviews} from '../src/renderer/features/personalization/appearance-workbench.js';
import {defaultAppearance,newLayer,validateAppearance,selectionStyle} from '../src/renderer/features/personalization/appearance.js';
import {createAccessDocument} from './helpers/local-access-dom.js';
test('freehand coordinates are bounded and produce a real polygon mask',()=>{assert.deepEqual(normalizePoint(-10,110),[0,100]);const selection=freehandSelection([[0,0],[100,0],[50,100]]);assert.equal(selectionStyle(selection).clipPath,'polygon(0% 0%, 100% 0%, 50% 100%)');assert.throws(()=>freehandSelection([[0,0]]));assert.ok(freehandSelection(Array.from({length:1024},(_,i)=>[i%100,i%100])).values.length<=64);});
test('guides snap independently by axis and validate persistent bounds',()=>{const guides=[{axis:'x',value:30},{axis:'y',value:60}];assert.deepEqual(snapPoint([29,58.5],guides),[30,60]);assert.deepEqual(snapPoint([27,58.5],guides),[27,60]);assert.throws(()=>validateGuides([{axis:'z',value:10}]));assert.throws(()=>validateGuides([{axis:'x',value:101}]));const model=defaultAppearance();model.elements.x={normal:[{...newLayer(),guides}]};assert.deepEqual(validateAppearance(model),model);});

function workbenchDocument(){
 const document=createAccessDocument(),create=document.createElement.bind(document);
 document.createElement=tag=>{const node=create(tag);node.classList={add(...names){node.className=[node.className||'',...names].join(' ').trim();}};node.getBoundingClientRect=()=>({left:0,top:0,width:116,height:116});node.setPointerCapture=()=>{};node.setCustomValidity=value=>node.validationMessage=value;node.reportValidity=()=>!node.validationMessage;return node;};
 document.createElementNS=(_namespace,tag)=>document.createElement(tag);
 class Sheet {replaceSync(text){this.text=text;}}
 document.defaultView={CSSStyleSheet:Sheet};document.adoptedStyleSheets=[];
 // Global event registration is deliberately absent: workbenches must use owned nodes only.
 return document;
}
const action=(root,text)=>root.querySelectorAll('button').find(node=>node.textContent===text);
const key=(node,value,extra={})=>node.dispatchEvent({type:'keydown',key:value,preventDefault(){},...extra});

test('mounted drawing applies keyboard polygon, cancels without changing selection, and persists guides',async()=>{
 const document=workbenchDocument(),host=document.createElement('div');document.body.append(host);const applied=[],saved=[];let searches=0,disposed=0;
 const workbench=mountSelectionWorkbench(host,{onSelection:value=>applied.push(value),onGuides:value=>saved.push(value),attachSearch(input,scope){assert.equal(input.type,'search');assert.equal(scope.tagName,'SECTION');searches++;return()=>disposed++;}});
 const surface=host.querySelector('svg');await key(surface,' ');await key(surface,'ArrowRight',{shiftKey:true});await key(surface,' ');await key(surface,'ArrowDown',{shiftKey:true});await key(surface,' ');await key(surface,'Enter');
 assert.deepEqual(applied,[{kind:'polygon',values:[50,50,60,50,60,60]}]);
 await key(surface,'Escape');await key(surface,'Enter');assert.equal(applied.length,1,'cancelled drawing must not overwrite prior selection');
 await surface.dispatchEvent({type:'pointerdown',button:0,pointerId:1,clientX:20,clientY:20,preventDefault(){}});await surface.dispatchEvent({type:'pointermove',clientX:30,clientY:20});await surface.dispatchEvent({type:'pointermove',clientX:30,clientY:30});await surface.dispatchEvent({type:'pointercancel'});await key(surface,'Enter');assert.equal(applied.length,1,'pointer cancel must discard the unfinished stroke without overwriting the prior selection');
 action(host,'Add vertical guide').onclick();assert.deepEqual(saved.at(-1),[{axis:'x',value:50}]);
 const numeric=host.querySelectorAll('input').find(node=>node.type==='number');numeric.value='33';numeric.onchange();assert.deepEqual(saved.at(-1),[{axis:'x',value:33}]);
 numeric.value='101';numeric.onchange();assert.deepEqual(saved.at(-1),[{axis:'x',value:33}]);assert.ok(numeric.validationMessage);
 assert.equal(searches,1);workbench.destroy();assert.equal(disposed,1);assert.equal(host.children.length,0);
});

test('mounted state previews preserve unrelated sheets, own teardown, and omit private field values',()=>{
 const document=workbenchDocument(),unrelated={text:'unrelated'},host=document.createElement('div'),target=document.createElement('input');document.adoptedStyleSheets=[unrelated];document.body.append(host);target.value='private-form-value';target.setAttribute('type','password');target.setAttribute('aria-label','Protected field');let disposed=0;
 const preview=mountStatePreviews(host,{target,states:[{name:'normal',properties:{color:'#123456'}},{name:'hover',properties:{opacity:'.5'}}],attachSearch(){return()=>disposed++;}});
 assert.equal(document.adoptedStyleSheets.length,2);assert.equal(document.adoptedStyleSheets[0],unrelated);assert.match(document.adoptedStyleSheets[1].text,/color:#123456/);assert.match(document.adoptedStyleSheets[1].text,/opacity:.5/);
 assert.doesNotMatch(host.textContent,/private-form-value/);assert.match(host.textContent,/Protected field/);assert.equal(host.querySelectorAll('input').length,1,'only the local search input is rendered');
 preview.destroy();assert.deepEqual(document.adoptedStyleSheets,[unrelated]);assert.equal(disposed,1);assert.equal(host.children.length,0);
});
