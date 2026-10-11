import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createPersonalizationAdapters} from '../scripts/gui-acceptance-personalization.mjs';
// Explicit frozen state/action inventory reviewed from f42916a.
const states=[
  {
    "id": "p-language",
    "actions": [
      "change-language",
      "change-english-playfulness",
      "change-cantonese-playfulness",
      "reload-preferences"
    ],
    "observable": "Language and two independent playfulness controls"
  },
  {
    "id": "p-school-enabled",
    "actions": [
      "enable-mode",
      "unlock-mode",
      "restore-base-language"
    ],
    "observable": "English-only mode while base preferences retained"
  },
  {
    "id": "p-narrator",
    "actions": [
      "select-voice",
      "test-narration",
      "disable-narration"
    ],
    "observable": "Independent voice choices and effective voice status"
  },
  {
    "id": "p-appearance",
    "actions": [
      "select-synthetic-logo",
      "change-focal-point",
      "reset-logo"
    ],
    "observable": "Appearance controls and local logo picker"
  },
  {
    "id": "p-schedules-draft",
    "actions": [
      "add-schedule",
      "reload-schedule"
    ],
    "observable": "Schedule controls and native date/time composition"
  },
  {
    "id": "p-history-locked",
    "actions": [
      "begin-unlock",
      "cancel-unlock"
    ],
    "observable": "History locked state"
  },
  {
    "id": "p-history-unlocked",
    "actions": [
      "select-version",
      "restore-version",
      "relock-history"
    ],
    "observable": "Private local version rows"
  },
  {
    "id": "appearance-context-pointer",
    "actions": [
      "edit-captured-target",
      "lock-captured-target"
    ],
    "observable": "Captured outer Material target and one menu"
  },
  {
    "id": "appearance-context-keyboard",
    "actions": [
      "keyboard-open",
      "escape-restores-focus"
    ],
    "observable": "Captured outer Material target and one menu"
  },
  {
    "id": "appearance-edit-normal",
    "actions": [
      "set-opacity",
      "verify-live-opacity",
      "reload-opacity"
    ],
    "observable": "Appearance editor and state tabs"
  },
  {
    "id": "appearance-edit-layer-locked",
    "actions": [
      "attempt-edit-no-mutation"
    ],
    "observable": "Disabled immutable layer controls"
  },
  {
    "id": "appearance-edit-image",
    "actions": [
      "change-image-placement",
      "reset-image-placement"
    ],
    "observable": "Image layer editor"
  },
  {
    "id": "appearance-motion-track",
    "actions": [
      "add-track",
      "edit-track",
      "remove-track"
    ],
    "observable": "Finite typed motion track controls"
  },
  {
    "id": "appearance-motion-transition",
    "actions": [
      "add-rule",
      "edit-rule",
      "remove-rule"
    ],
    "observable": "Finite typed transition controls"
  },
  {
    "id": "appearance-history-rollback",
    "actions": [
      "rollback",
      "reload-rollback"
    ],
    "observable": "Appearance history and rollback"
  },
  {
    "id": "p-schedule-narrator",
    "actions": [
      "select-narrator-settings",
      "save-schedule"
    ],
    "observable": "Typed narrator schedule controls"
  },
  {
    "id": "p-schedule-attention",
    "actions": [
      "select-attention-settings",
      "save-schedule"
    ],
    "observable": "Typed attention schedule controls"
  },
  {
    "id": "p-schedule-appearance-ref",
    "actions": [
      "capture-appearance-snapshot",
      "save-reference"
    ],
    "observable": "Bounded local appearance snapshot reference"
  },
  {
    "id": "p-schedule-logo-ref",
    "actions": [
      "capture-logo-snapshot",
      "save-reference"
    ],
    "observable": "Bounded local logo snapshot reference"
  },
  {
    "id": "p-schedule-active-override",
    "actions": [
      "activate-schedule",
      "verify-effective-snapshot"
    ],
    "observable": "Effective snapshot differs from preserved base"
  },
  {
    "id": "p-schedule-restored-base",
    "actions": [
      "end-schedule",
      "verify-restored-base"
    ],
    "observable": "Latest base restored without history or storage mutation"
  },
  {
    "id": "p-history-bulk-all",
    "actions": [
      "history.select-all-filtered"
    ],
    "observable": "Only visible records a and c are selected"
  },
  {
    "id": "p-history-bulk-invert",
    "actions": [
      "history.invert-filtered"
    ],
    "observable": "Inverting selected visible records leaves none selected"
  },
  {
    "id": "p-history-bulk-range",
    "actions": [
      "history.select-range"
    ],
    "observable": "Shift selection includes only the visible a to c range"
  },
  {
    "id": "p-history-export-selected",
    "actions": [
      "history.export-selected"
    ],
    "observable": "Export contains exactly selected visible IDs and an omission manifest"
  },
  {
    "id": "p-history-export-filtered",
    "actions": [
      "history.export-filtered"
    ],
    "observable": "Export contains exactly current visible IDs and an omission manifest"
  },
  {
    "id": "p-history-export-format",
    "actions": [
      "history.format"
    ],
    "observable": "All ten formats preserve records, schema and omissions with correct MIME and extension"
  },
  {
    "id": "p-logo-preset",
    "actions": [
      "logo.preset"
    ],
    "observable": "Lock and key presets update the local 128 pixel PNG and title consumer without network"
  },
  {
    "id": "p-logo-crop",
    "actions": [
      "logo.crop"
    ],
    "observable": "Crop X 0.25, width 0.5 and height 1 uses the correct region of a synthetic 256 by 128 PNG"
  },
  {
    "id": "p-logo-safe-area",
    "actions": [
      "logo.safe-area"
    ],
    "observable": "Safe area 0.125 produces a 16 pixel border in the 128 pixel output"
  },
  {
    "id": "p-logo-background",
    "actions": [
      "logo.background"
    ],
    "observable": "Static background #11223380 preserves alpha and animated background remains disabled"
  }
,
{
  "id": "p-logo-reopened-recipe",
  "actions": [
    "logo.reopen-recipe",
    "logo.edit-retained-source"
  ],
  "observable": "Reopening restores recipe controls and editing uses retained original without selecting another file"
},
{
  "id": "p-logo-title-preview",
  "actions": [
    "logo.verify-title-preview",
    "logo.verify-scheduled-preview"
  ],
  "observable": "Actual 20 pixel title preview matches effective logo while 64 and 128 pixel editing previews retain saved base"
}
];
const launch={cdp:{port:9222,expectedUrl:'file:///synthetic/index.html'}},receipt='C:/owned/receipt.json',binding={sourceCommit:'a'.repeat(40)};
const fixture=()=>({prepare:async()=>({sourceCommit:binding.sourceCommit,ownedSyntheticFixture:true,privateFieldsCleared:true,targetSelector:"#synthetic-control"}),restore:async()=>({sourceCommit:binding.sourceCommit,restored:true,privateFieldsCleared:true}),choose(){},inspect(){},unlock(){},lock(){},readExport(){},restoreSelected(){},observeSpeech(){},enter(){},observeTarget(){},openKeyboardContext(){},pressEscape(){}});
function setup(rows=states,fixtures={}){let mutations=0;const adapters=createPersonalizationAdapters({launch,receipt,inventory:{states:rows},fixtures,prepareOwnedFixture:async()=>{mutations++;return{ownedSyntheticFixture:true,sourceCommit:binding.sourceCommit};}});const executePlan=async plan=>({ok:true,results:plan.steps.map(step=>({id:step.id,value:step.op==='poll'?true:{language:'en',funnyEnglish:5,funnyCantonese:5}}))});return{adapters,executePlan,get mutations(){return mutations;}};}
test('all frozen personalization states and actions have explicit adapters while baseline attention stays separate',()=>{const f=setup();assert.equal(Object.keys(f.adapters).length,states.length);assert.equal(f.adapters['p-attention'],undefined);for(const row of states)assert.deepEqual(Object.keys(f.adapters[row.id].actions),row.actions);});
test('missing protected history, image, speech and target capabilities stop before native preparation or CDP mutation',async()=>{for(const state of ['p-history-unlocked','p-logo-crop','p-narrator','appearance-context-pointer']){const f=setup();let plans=0;await assert.rejects(f.adapters[state].prepare({binding,executePlan:async()=>{plans++;}}),/CAPABILITY_UNAVAILABLE/);assert.equal(f.mutations,0);assert.equal(plans,0);}});
test('unknown production action stops before any fixture mutation',async()=>{const f=setup([{id:'p-language',actions:['unmapped-action'],observable:'unknown'}]);await assert.rejects(f.adapters['p-language'].prepare({binding,executePlan:f.executePlan}),/CAPABILITY_UNAVAILABLE: production-action/);assert.equal(f.mutations,0);});
test('every frozen state passes only capability admission with supplied producers, never establishes runtime evidence',async()=>{const fixtures={history:fixture(),logo:fixture(),school:fixture(),voices:fixture(),appearance:fixture()};const f=setup(states,fixtures);for(const row of states){const result=await f.adapters[row.id].prepare({binding,executePlan:f.executePlan});assert.equal(result.ownedSyntheticFixture,true);assert.equal(result.sourceCommit,binding.sourceCommit);}assert.equal(f.mutations,states.length);});
test('a false state observation cannot pass even when transport reports ok',async()=>{const f=setup();await f.adapters['p-language'].prepare({binding,executePlan:f.executePlan});await assert.rejects(f.adapters['p-language'].assertState({executePlan:async plan=>({ok:true,results:plan.steps.map(step=>({id:step.id,value:false}))})}),/State observable did not pass/);});
test('missing or disabled original controls cannot produce a successful action',async()=>{for(const node of [null,{disabled:true,getClientRects:()=>[{}],closest:()=>null}]){const f=setup();await f.adapters['p-language'].prepare({binding,executePlan:f.executePlan});const executePlan=async plan=>{const step=plan.steps[0];const value=vm.runInNewContext(step.expression,{document:{querySelector:()=>node},Event});return{ok:true,results:[{id:step.id,value}]};};await assert.rejects(f.adapters['p-language'].actions['change-language']({executePlan}),/CONTROL_UNAVAILABLE/);}});
test('source binding mismatch stops preparation and every plan retains connection proof',async()=>{const f=createPersonalizationAdapters({launch,receipt,inventory:{states:[states[0]]},prepareOwnedFixture:async()=>({ownedSyntheticFixture:true,sourceCommit:'b'.repeat(40)})});await assert.rejects(f['p-language'].prepare({binding,executePlan:async()=>{throw Error('must not evaluate');}}));const g=setup([states[0]]);await g.adapters['p-language'].prepare({binding,executePlan:async plan=>{assert.equal(plan.startupOwnershipAttempts,3);assert.equal(plan.receipt,receipt);assert.equal(plan.expectedUrl,launch.cdp.expectedUrl);assert.equal(plan.allowEvaluate,true);return{ok:true,results:[{value:{language:'en',funnyEnglish:5,funnyCantonese:5}}]};}});});

test('repeated preparation retains the first preference baseline for restoration',async()=>{const f=setup([states.find(row=>row.id==='p-language')]);let reads=0;const executePlan=async plan=>({ok:true,results:plan.steps.map(step=>({id:step.id,value:++reads===1?{language:'en',funnyEnglish:5,funnyCantonese:5}:{language:'yue',funnyEnglish:7,funnyCantonese:3}}))});const adapter=f.adapters['p-language'];await adapter.prepare({binding,executePlan});await adapter.prepare({binding,executePlan});const plans=[];await adapter.restore({executePlan:async plan=>{plans.push(plan);return{ok:true,results:plan.steps.map(step=>({id:step.id,value:true}))};}});const restore=plans.flatMap(plan=>plan.steps).find(step=>step.id.endsWith('-restore-language'));const control={disabled:false,readOnly:false,getClientRects:()=>[{}],closest:()=>null,dispatchEvent(){}};vm.runInNewContext(restore.expression,{document:{querySelector:()=>control},Event});assert.equal(control.value,'en');assert.equal(reads,1);});
test('a preparation failure cannot be reported as a successful no-op restoration',async()=>{const f=createPersonalizationAdapters({launch,receipt,inventory:{states:[states[0]]},prepareOwnedFixture:async()=>({ownedSyntheticFixture:false})});await assert.rejects(f['p-language'].prepare({binding,executePlan:async()=>{}}));await assert.rejects(f['p-language'].restore({executePlan:async()=>{}}),/RESTORATION_UNVERIFIED/);});

test('playfulness uses the supported maximum and refuses out-of-range control bounds before mutation',async()=>{const f=setup();await f.adapters['p-language'].prepare({binding,executePlan:f.executePlan});let changed=0;const node={type:'range',localName:'md-slider',min:1,max:3,disabled:false,readOnly:false,getClientRects:()=>[{}],closest:()=>null,set value(value){changed++;},dispatchEvent(){changed++;}};await assert.rejects(f.adapters['p-language'].actions['change-english-playfulness']({executePlan:async plan=>{const step=plan.steps[0];return{ok:true,results:[{id:step.id,value:vm.runInNewContext(step.expression,{document:{querySelector:()=>node},Event})}]};}}),/CONTROL_VALUE_OUT_OF_RANGE/);assert.equal(changed,0);});
test('producer preparation and protected action receipts reject missing or stale source binding',async()=>{for(const sourceCommit of [undefined,'b'.repeat(40)]){const history=fixture();history.prepare=async()=>({ownedSyntheticFixture:true,privateFieldsCleared:true,sourceCommit});const f=setup(states,{history});await assert.rejects(f.adapters['p-history-locked'].prepare({binding,executePlan:f.executePlan}),/Producer source binding mismatch/);}const history=fixture();history.unlock=async()=>({completed:true,privateFieldsCleared:true,sourceCommit:'b'.repeat(40)});const f=setup(states,{history});await f.adapters['p-history-locked'].prepare({binding,executePlan:f.executePlan});await assert.rejects(f.adapters['p-history-locked'].actions['begin-unlock']({binding,executePlan:f.executePlan}),/Producer source binding mismatch/);history.restore=async()=>({restored:true,privateFieldsCleared:true});await assert.rejects(f.adapters['p-history-locked'].restore({binding,executePlan:f.executePlan}),/Producer source binding mismatch/);});

test('new logo scenarios use compiled production controls and expose no image bytes in action evidence',async()=>{for(const state of ['p-logo-reopened-recipe','p-logo-title-preview']){const logo=fixture();let choices=0;logo.choose=async()=>{choices++;return{sourceCommit:binding.sourceCommit,ownedSyntheticFixture:true};};logo.inspect=async()=>({sourceCommit:binding.sourceCommit,width:128,height:128,titleConsumerMatches:true,expectedPixelsMatch:true,externalNetworkRequests:0});const f=setup(states,{logo}),adapter=f.adapters[state],plans=[];const executePlan=async plan=>{plans.push(plan);return{ok:true,results:plan.steps.map(step=>{new vm.Script(step.expression);const value=step.op==='poll'?true:step.id.endsWith('-baseline')?{language:'en',funnyEnglish:5,funnyCantonese:5,scheduleIds:[]}:step.id.endsWith('-logo-clock')?{observedAt:'2026-10-11T12:00:00.000Z',start:'11:59',end:'12:10'}:step.id.endsWith('-logo-reference')?'synthetic-reference':step.id.endsWith('-logo-rule-id')?'synthetic-rule':step.id.endsWith('-schedule-before')?0:true;return{id:step.id,value};})};};await adapter.prepare({binding,executePlan});await adapter.enter({binding,executePlan});const before=choices;for(const action of states.find(row=>row.id===state).actions){const result=await adapter.actions[action]({binding,executePlan});assert.equal(result.observablePassed,true);assert.doesNotMatch(JSON.stringify(result.evidence),/data:image|base64|dataUrl/);}assert.equal(choices,before,'actions must not choose a replacement source');assert.ok(plans.flatMap(p=>p.steps).some(step=>step.expression.includes('-tab-language')||step.expression.includes('settings.action.disable.')));}});
test('retained-source and title-preview observations fail closed on absent or wrong production values',async()=>{for(const [state,action]of [['p-logo-reopened-recipe','logo.reopen-recipe'],['p-logo-title-preview','logo.verify-title-preview']]){const logo=fixture(),f=setup(states,{logo}),adapter=f.adapters[state];await adapter.prepare({binding,executePlan:f.executePlan});const executePlan=async plan=>{const step=plan.steps[0];if(step.op==='evaluate')return{ok:true,results:[{id:step.id,value:true}]};const value=vm.runInNewContext(step.expression,{window:{},document:{querySelector:()=>null},localStorage:{getItem:()=>null}});assert.equal(value,false);return{ok:true,results:[{id:step.id,value}]};};await assert.rejects(adapter.actions[action]({binding,executePlan}),/State observable did not pass/);}});

test('title preview observation requires actual target dimensions effective output and unchanged base previews',async()=>{const f=setup(states,{logo:fixture()}),adapter=f.adapters['p-logo-title-preview'];await adapter.prepare({binding,executePlan:f.executePlan});let expression;await adapter.actions['logo.verify-title-preview']({executePlan:async plan=>{expression=plan.steps[0].expression;return{ok:true,results:[{value:true}]};}});const image=(width,src)=>({width,height:width,src,getAttribute(){return this.src;}});for(const fault of [null,'title-size','effective-preview','base-output','base-editing','base-storage','missing-proof']){const small=image(20,'scheduled'),title=image(20,'scheduled'),output=image(128,'base'),editing=image(64,'base'),frame={getClientRects:()=>[{}],querySelector:()=>small};let stored='base',proof={base:'base',scheduled:'scheduled'};if(fault==='title-size')title.width=21;if(fault==='effective-preview')small.src='base';if(fault==='base-output')output.src='scheduled';if(fault==='base-editing')editing.src='scheduled';if(fault==='base-storage')stored='scheduled';if(fault==='missing-proof')proof=null;const value=vm.runInNewContext(expression,{window:{__guiPersonalizationLogoPreview:proof},localStorage:{getItem:()=>stored},document:{querySelector:selector=>selector.includes('window-brand]')?frame:selector.includes('.window-brand img')?title:selector.includes('normalized-output')?output:editing}});assert.equal(value,fault===null,fault||'valid observation');}});
