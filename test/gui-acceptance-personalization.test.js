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
