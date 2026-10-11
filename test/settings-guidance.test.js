import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuidanceSession,mountControlGuidance,assertGuidanceCoverage,registerOwnedCommands,clearGuidedField} from '../src/shared/surface/control-guidance.js';
import {SETTINGS_GUIDANCE_INVENTORY,settingsGuidance} from '../src/shared/local-ux/settings-guidance.js';
import {createDesktopSettingsIntegrity} from '../src/shared/local-ux/settings-integrity.js';
import {validateRule} from '../src/shared/local-ux/schedules.js';

// Independent authored list prevents deleting a descriptor from hiding its gap.
const REQUIRED=['Mode name','Local unlock credential','Language','English playfulness','Cantonese playfulness','Show emojis in dialogs and message boxes','Narrator','Narration language','English voice','Cantonese voice','Rate','Pitch','Theme','Density','Accent color','Font family','Font scale','Font weight','Motion','Display name','Focus','Low stimulation','Time awareness','One thing at a time','Momentum','Next action','Schedule name','Start date','End date','Start time','End time','Timezone','Priority','Setting','Value','Source','Endpoint','Entity','History password','Search history','From date','To date','Action filter','Entry label','Retention days','Search settings','Access token','Set local credential','Enable mode','Turn off mode','Test narration','Reset name','Edit this surface','Add schedule','Enable','Disable','Remove','Configure credential','Clear credential','Store credential','Cancel','Export settings','Reset','Set up history password','Unlock history','Lock history','Compare selected entries','Export redacted history','Set retention','Prune expired entries','Restore','Save label','Import settings','Not now (one hour)','Language and voice','Appearance','Schedules','Attention','Private local history','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
test('authored inventory fails on missing controls, omitted rows, missing wizard and repeated filler',()=>{
 const required=REQUIRED.map(label=>settingsGuidance(label));assertGuidanceCoverage(required,SETTINGS_GUIDANCE_INVENTORY);
 assert.throws(()=>assertGuidanceCoverage([...required,{...required[0],id:'new-capable-control'}],SETTINGS_GUIDANCE_INVENTORY),/Missing guidance/);
 assert.throws(()=>assertGuidanceCoverage(required,SETTINGS_GUIDANCE_INVENTORY.slice(1)),/Missing guidance/);
 assert.throws(()=>assertGuidanceCoverage([{...required[0],steps:[]}],required),/Missing optional wizard/);
 assert.throws(()=>assertGuidanceCoverage([required[0],{...required[1],purpose:required[0].purpose}],required),/Duplicate generic/);
});
test('actual schedule consumer rejects invalid steps, Back preserves draft and Cancel writes nothing',async()=>{
 const rows=new Map(),storage={getItem:k=>rows.get(k),setItem:(k,v)=>rows.set(k,v)};
 const integrity=createDesktopSettingsIntegrity({storage});const draft={id:'guided',label:'',enabled:true,start:'09:00',end:'17:00',timezone:'invalid/timezone',weekdays:[1],priority:0,values:{theme:'dark'},source:{type:'local'}};
 const session=createGuidanceSession({steps:settingsGuidance('Add schedule').steps,validate:()=>validateRule(draft),run:()=>integrity.store.update({schedules:[draft]})});
 await assert.rejects(session.next());assert.equal(session.index,0);assert.equal(rows.size,0);
 draft.label='Work hours';draft.timezone='UTC';await session.next();session.back();assert.equal(draft.label,'Work hours');assert.equal(session.index,0);session.cancel();await session.next();assert.equal(rows.size,0);
 const next=createGuidanceSession({steps:['Review'],run:()=>integrity.store.update({schedules:[validateRule(draft)]})});await next.next();assert.equal(integrity.store.get().schedules.length,1);
 const protectedMode=createGuidanceSession({steps:['Review'],run:()=>integrity.store.update({school:{enabled:true,name:'Presentation'}})});await assert.rejects(protectedMode.next(),/Verify/);assert.equal(integrity.store.get().school.enabled,false);
});
test('owned palette disposal preserves unrelated commands across rerender and destroy',()=>{
 const unrelated={id:'unrelated'};let commands=[unrelated],refreshes=0;const consumer={get:()=>commands,set:value=>commands=value,refresh:()=>refreshes++};
 const first=registerOwnedCommands(consumer,[{id:'settings.help'}]);assert.equal(commands.length,2);first();const second=registerOwnedCommands(consumer,[{id:'settings.help'}]);first();assert.equal(commands.length,2);second();assert.deepEqual(commands,[unrelated]);assert.equal(refreshes,4);
});
test('asynchronous validation admits one consumer and rechecks availability after await',async()=>{
 let release,writes=0,available=true;const waiting=new Promise(resolve=>release=resolve);
 const session=createGuidanceSession({steps:['Review'],validate:()=>waiting,available:()=>available,run:()=>writes++});
 const first=session.next();assert.equal(session.state,'validating');await session.next();assert.equal(writes,0);release();await first;assert.equal(writes,1);
 let finish;const pending=new Promise(resolve=>finish=resolve);const changed=createGuidanceSession({steps:['Review'],validate:()=>pending,available:()=>available,run:()=>writes++});const flight=changed.next();available=false;finish();await assert.rejects(flight,/unavailable/);assert.equal(writes,1);
});
test('clear awaits the original asynchronous consumer and respects a blocked target event',async()=>{
 const target=new EventTarget();target.value='retained';target.focus=()=>{};let flight=null,locked=true;
 target.addEventListener('change',event=>{if(locked){event.preventDefault();event.stopImmediatePropagation();}});
 target.addEventListener('change',()=>{flight=Promise.reject(Error('host rejected'));});
 const options={getFlight:()=>flight,resetFlight:()=>{flight=null;}};
 await assert.rejects(clearGuidedField(target,options),/unavailable/);assert.equal(target.value,'retained');
 locked=false;await assert.rejects(clearGuidedField(target,options),/host rejected/);assert.equal(target.value,'retained');
 target.readOnly=true;await assert.rejects(clearGuidedField(target,options),/unavailable/);
});

function dom(){
 const definitions=new Map();let doc;
 class Node extends EventTarget{constructor(tag=''){super();this.tagName=tag;this.children=[];this.dataset={};this.hidden=false;this.disabled=false;this.readOnly=false;this.textContent='';this.attributes={};this.ownerDocument=doc;}get isConnected(){return !!this.parentNode?.isConnected||this.root===true;}append(...nodes){for(const node of nodes){node.parentNode=this;this.children.push(node);}}replaceChildren(...nodes){for(const node of this.children)node.parentNode=null;this.children=[];this.append(...nodes);}attachShadow(){this.shadowRoot=new Node('shadow');this.shadowRoot.root=true;}setAttribute(k,v){this.attributes[k]=String(v);}before(node){const parent=this.parentNode;node.parentNode=parent;parent.children.splice(parent.children.indexOf(this),0,node);}remove(){if(this.parentNode){this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;}}focus(){doc.activeElement=this;}click(){if(!this.disabled)this.dispatchEvent(new Event('click'));}querySelector(tag){return this.children.find(n=>n.tagName===tag)||this.children.map(n=>n.querySelector(tag)).find(Boolean);}checkValidity(){return this.valid!==false;}}
 doc={createElement(tag){const C=definitions.get(tag);return C?new C():new Node(tag);},defaultView:{HTMLElement:Node,customElements:{get:tag=>definitions.get(tag),define:(tag,C)=>definitions.set(tag,C)}}};const root=new Node('root');root.root=true;return {doc,root};
}
test('actual registered component sits above exact target, stays closed until invoked, and retains direct action',async()=>{
 const {doc,root}=dom(),target=doc.createElement('button');target.textContent='Theme';root.append(target);let writes=0;target.addEventListener('click',()=>writes++);
 const module=mountControlGuidance(target,{descriptor:settingsGuidance('Theme'),run:()=>target.click()});
 assert.equal(root.children[0],module.host);assert.equal(root.children[1],target);const shadow=module.host.shadowRoot,panel=shadow.children.at(-1);assert.equal(panel.hidden,true);
 target.click();assert.equal(writes,1);module.open();assert.equal(panel.hidden,false);const apply=panel.querySelector('md-filled-button');apply.click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(writes,2);
 module.destroy();assert.equal(root.children.length,1);assert.equal(root.children[0],target);target.click();assert.equal(writes,3);
});
test('cancelled validation cannot repaint a newly opened guidance invocation',async()=>{
 const {doc,root}=dom(),target=doc.createElement('button');root.append(target);let release,runs=0;
 const pending=new Promise(resolve=>release=resolve);const module=mountControlGuidance(target,{descriptor:settingsGuidance('Reset'),validate:()=>pending,run:()=>runs++});module.open();const panel=module.host.shadowRoot.children.at(-1);panel.querySelector('md-filled-button').click();
 module.open();const heading=panel.children[0].textContent;release();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(panel.children[0].textContent,heading);assert.equal(panel.children[2].textContent,'');assert.equal(runs,0);module.destroy();
});

test('actual personalization mounts every settings tab including all weekday guidance targets',async()=>{
 const {doc,root}=dom(),prototype=Object.getPrototypeOf(root),styles=new WeakMap();
 const matches=(node,selector)=>selector==='*'||(selector.startsWith('.')?String(node.className||node.attributes.class||'').split(' ').includes(selector.slice(1)):selector.startsWith('[data-')?Object.hasOwn(node.dataset,selector.slice(6,-1).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())):node.tagName===selector);
 prototype.querySelectorAll=function(selector){return this.children.flatMap(node=>[...(matches(node,selector)?[node]:[]),...node.querySelectorAll(selector)]);};
 prototype.querySelector=function(selector){return this.querySelectorAll(selector)[0];};
 prototype.closest=function(selector){let current=this;while(current){if(matches(current,selector))return current;current=current.parentNode;}return null;};
 const set=prototype.setAttribute;prototype.setAttribute=function(key,value){set.call(this,key,value);if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);else if(['id','type','class','role'].includes(key))this[key==='class'?'className':key]=String(value);};
 prototype.getAttribute=function(key){return this.attributes[key]??null;};prototype.removeAttribute=function(key){delete this.attributes[key];};
 Object.defineProperty(prototype,'parentElement',{get(){return this.parentNode;}});Object.defineProperty(prototype,'childNodes',{get(){return this.children;}});
 Object.defineProperty(prototype,'classList',{get(){const node=this;return{add(...values){node.className=[node.className||'',...values].join(' ');}};}});
 Object.defineProperty(prototype,'style',{get(){if(!styles.has(this))styles.set(this,{setProperty(){}});return styles.get(this);}});
 const events=new EventTarget(),disk=new Map();doc.body=root;doc.documentElement=root;doc.adoptedStyleSheets=[];doc.createElementNS=(_,tag)=>doc.createElement(tag);doc.getElementById=id=>root.querySelectorAll('*').find(node=>node.id===id);doc.addEventListener=events.addEventListener.bind(events);doc.removeEventListener=events.removeEventListener.bind(events);
 Object.assign(doc.defaultView,{Event,CSSStyleSheet:class{replaceSync(){}},localStorage:{getItem:key=>disk.get(key)??null,setItem:(key,value)=>disk.set(key,value),removeItem:key=>disk.delete(key)},matchMedia:()=>({matches:false}),addEventListener(){},removeEventListener(){},setInterval:()=>1,clearInterval(){}});
 const saved={document:globalThis.document,addEventListener:globalThis.addEventListener,removeEventListener:globalThis.removeEventListener};globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
 let mounted;try{
  const {mountPersonalization}=await import('../src/renderer/features/personalization/index.js');const host=doc.createElement('section');root.append(host);mounted=mountPersonalization(host,{storage:doc.defaultView.localStorage,surfaceRoot:root});
  for(const tab of ['language','appearance','schedules','attention','history']){mounted.open(tab);await new Promise(resolve=>setTimeout(resolve,0));assert.ok(host.querySelectorAll('*').some(node=>node.dataset.guidanceId),tab+' has registered guidance');if(tab==='schedules')for(const day of ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']){const input=doc.getElementById('local-ux-'+day);assert.ok(input,day+' is rendered');const index=input.parentNode.children.indexOf(input);assert.equal(input.parentNode.children[index-1].dataset.guidanceId,'settings.weekday.'+day);}}
 }finally{mounted?.destroy();for(const[key,value]of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
