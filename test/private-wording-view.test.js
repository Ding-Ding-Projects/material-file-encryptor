import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateWordingView} from '../src/shared/surface/private-wording-view.js';

function fixture(){
 const observers=[];
 class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(){this.active=true;}disconnect(){this.active=false;}}
 const make=(tag,content='')=>{
  const node={tag,children:[],attrs:new Map(),parentElement:null,ownerDocument:null,shadowRoot:null,
   append(child){child.parentElement=this;child.ownerDocument=document;this.children.push(child);},
   contains(target){return this===target||this.children.some(child=>child.contains?.(target));},
   closest(selector){if(selector.includes(this.tag)||this.attrs.has('data-private-wording-ignore'))return this;return this.parentElement?.closest(selector)||null;},
   getRootNode(){return this.parentElement?.getRootNode()||this;},
   querySelectorAll(){return this.children.flatMap(child=>child.tag?[child,...child.querySelectorAll()]:[]);},
   hasAttribute(name){return this.attrs.has(name);},getAttribute(name){return this.attrs.get(name);},setAttribute(name,value){this.attrs.set(name,value);}};
  if(content)node.children.push({nodeValue:content,parentElement:node,getRootNode:()=>node.getRootNode()});return node;
 };
 const document={defaultView:{MutationObserver:Observer},createTreeWalker(scope){const collect=n=>n.children.flatMap(child=>child.tag?collect(child):[child]);const values=collect(scope);let index=-1;return{currentNode:null,nextNode(){this.currentNode=values[++index];return Boolean(this.currentNode);}};}};
 const root=make('body');root.ownerDocument=document;
 const label=make('button','Canonical label');label.setAttribute('aria-label','Canonical label');root.append(label);
 const input=make('input');input.value='Canonical user value';root.append(input);
 const code=make('pre','Canonical code');root.append(code);
 const host=make('div');root.append(host);const shadow=make('shadow');shadow.host=host;shadow.ownerDocument=document;host.shadowRoot=shadow;
 const shadowLabel=make('span','Canonical shadow');shadow.append(shadowLabel);
 return{root,label,input,code,host,shadow,shadowLabel,make,observers,document};
}
test('projection changes display only and restores original text and attributes',()=>{
 const f=fixture();let active=true;const projection=createPrivateWordingView({root:f.root,isActive:()=>active,replace:value=>value.replaceAll('Canonical','Synthetic')});
 assert.equal(f.label.children[0].nodeValue,'Synthetic label');assert.equal(f.label.getAttribute('aria-label'),'Synthetic label');
 assert.equal(f.shadowLabel.children[0].nodeValue,'Synthetic shadow');assert.equal(f.input.value,'Canonical user value');assert.equal(f.code.children[0].nodeValue,'Canonical code');
 f.label.children[0].nodeValue='Canonical new label';projection.refresh();assert.equal(f.label.children[0].nodeValue,'Synthetic new label');
 active=false;projection.refresh();assert.equal(f.label.children[0].nodeValue,'Canonical new label');assert.equal(f.label.getAttribute('aria-label'),'Canonical label');assert.equal(f.shadowLabel.children[0].nodeValue,'Canonical shadow');
 projection.destroy();
});
test('mutation bursts queue one refresh and detached shadow observers are retired',async()=>{
 const f=fixture();const projection=createPrivateWordingView({root:f.root,isActive:()=>true,replace:value=>value.replaceAll('Canonical','Synthetic')});
 const label=f.make('span','Canonical added');f.root.append(label);
 const observer=f.observers[0];observer.callback();observer.callback();observer.callback();await Promise.resolve();
 assert.equal(label.children[0].nodeValue,'Synthetic added');assert.equal(f.observers.length,2);
 const shadowObserver=f.observers[1];f.root.children=f.root.children.filter(node=>node!==f.host);f.host.parentElement=null;projection.refresh();
 assert.equal(shadowObserver.active,false);assert.equal(f.shadowLabel.children[0].nodeValue,'Canonical shadow');
 projection.destroy();assert.equal(label.children[0].nodeValue,'Canonical added');assert.ok(f.observers.every(item=>!item.active));
 observer.callback();await Promise.resolve();assert.equal(label.children[0].nodeValue,'Canonical added');
});
test('replacement failures fail closed to canonical copy',()=>{
 const f=fixture();const projection=createPrivateWordingView({root:f.root,isActive:()=>true,replace(){throw new Error('Unavailable');}});
 assert.equal(f.label.children[0].nodeValue,'Canonical label');projection.destroy();
});

test('budget overflow atomically restores every prior projection',()=>{
 const f=fixture();const projection=createPrivateWordingView({root:f.root,maxNodes:12,isActive:()=>true,replace:value=>value.replaceAll('Canonical','Synthetic')});
 assert.equal(f.label.children[0].nodeValue,'Synthetic label');
 for(let i=0;i<20;i++)f.root.append(f.make('span','Canonical additional'));
 assert.deepEqual(projection.refresh(),{projected:false,reason:'node-budget'});
 assert.equal(f.label.children[0].nodeValue,'Canonical label');assert.equal(f.shadowLabel.children[0].nodeValue,'Canonical shadow');
 assert.ok(f.root.children.filter(node=>node.tag==='span').every(node=>node.children[0].nodeValue==='Canonical additional'));
 projection.destroy();
});
test('rapid wording and authentication changes restore the latest canonical text',async()=>{
 const f=fixture();let active=true,marker='Synthetic';const projection=createPrivateWordingView({root:f.root,isActive:()=>active,replace:value=>value.replaceAll('Canonical',marker)});
 marker='Alternate';projection.refresh();assert.equal(f.label.children[0].nodeValue,'Alternate label');
 f.label.children[0].nodeValue='Canonical translated label';f.observers[0].callback();active=false;await Promise.resolve();
 assert.equal(f.label.children[0].nodeValue,'Canonical translated label');
 active=true;projection.refresh();assert.equal(f.label.children[0].nodeValue,'Alternate translated label');
 active=false;projection.refresh();assert.equal(f.label.children[0].nodeValue,'Canonical translated label');projection.destroy();
});
