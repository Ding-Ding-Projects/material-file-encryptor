import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuidanceSession,mountControlGuidance,assertGuidanceCoverage,registerOwnedCommands} from '../src/shared/surface/control-guidance.js';
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
