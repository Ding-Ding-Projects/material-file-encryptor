import test from 'node:test';
import assert from 'node:assert/strict';
import {settingsTabGuidance,SETTINGS_TAB_IDS} from '../src/shared/local-ux/settings-guidance.js';
import {SETTINGS_TAB_COPY} from '../src/shared/local-ux/settings-tab-guidance.js';
import {assertPracticeCoverage,mountGuidancePlayground} from '../src/shared/surface/guidance-playground.js';
import {createAccessDocument} from './helpers/local-access-dom.js';
const keys=['language','appearance','schedules','attention','history'];

test('five navigation descriptors are distinct from field settings and target their authoritative articles',()=>{
 const rows=keys.map(key=>settingsTabGuidance(key));assert.deepEqual(rows.map(row=>row.id),SETTINGS_TAB_IDS);assertPracticeCoverage(SETTINGS_TAB_IDS,rows);assert.equal(new Set(rows.map(row=>row.purpose)).size,5);
 for(const[index,row]of rows.entries()){assert.equal(row.practice.kind,'tabs');assert.equal(row.concept,'navigation-'+keys[index]);assert.equal(row.practice.choices.length,5);assert.ok(row.help.startsWith('docs/features/interface/settings-guidance.md#action-'));for(const key of ['purpose','options','default','effects','example','validation','recovery'])assert.ok(SETTINGS_TAB_COPY[row[key]],row.id+': '+key);}
 assert.throws(()=>assertPracticeCoverage(SETTINGS_TAB_IDS,rows.slice(1)),/mismatch/);assert.throws(()=>settingsTabGuidance('unknown'),/Unknown/);
});
test('actual Material tab primitives select only synthetic panels, preserve ownership and reset',async()=>{
 const doc=createAccessDocument(),prototype=Object.getPrototypeOf(doc.body),previous=Object.getOwnPropertyDescriptor(prototype,'style');Object.defineProperty(prototype,'style',{configurable:true,get(){return this._style||={};}});
 try{for(const key of keys){const descriptor=settingsTabGuidance(key),fixture=descriptor.practice,a=doc.createElement('section'),b=doc.createElement('section');doc.body.append(a,b);const first=mountGuidancePlayground(a,{fixture}),second=mountGuidancePlayground(b,{fixture}),tabs=a.querySelector('md-tabs'),buttons=a.querySelectorAll('md-primary-tab'),otherButtons=b.querySelectorAll('md-primary-tab'),panel=a.querySelector('[role="tabpanel"]');
  assert.ok(tabs);assert.equal(tabs.autoActivate,true);assert.equal(buttons.length,5);assert.ok(buttons.every(button=>button.getAttribute('aria-controls')===panel.id));assert.ok(buttons.every(button=>!otherButtons.some(other=>other.id===button.id)));
  tabs.activeTabIndex=keys.indexOf(key);await tabs.dispatchEvent({type:'change'});assert.equal(first.session.state.value,key);assert.equal(second.session.state.value,fixture.initial);assert.equal(doc.activeElement,buttons[tabs.activeTabIndex]);assert.equal(panel.getAttribute('aria-labelledby'),buttons[tabs.activeTabIndex].id);assert.equal(panel.textContent,fixture.choices.find(row=>row.value===key).result);assert.equal(buttons.filter(button=>button.getAttribute('aria-selected')==='true').length,1);
  await a.querySelectorAll('md-text-button').find(button=>button.textContent==='Reset example').click();assert.equal(first.session.state.value,fixture.initial);assert.equal(tabs.activeTabIndex,keys.indexOf(fixture.initial));first.destroy();assert.equal(tabs.listeners.get('change').length,0);second.destroy();
 }}finally{if(previous)Object.defineProperty(prototype,'style',previous);else delete prototype.style;}
});
test('sample tab labels and panel contents translate without changing real navigation',async()=>{
 const doc=createAccessDocument(),prototype=Object.getPrototypeOf(doc.body),previous=Object.getOwnPropertyDescriptor(prototype,'style');Object.defineProperty(prototype,'style',{configurable:true,get(){return this._style||={};}});
 try{for(const mode of ['yue','bilingual']){const t=value=>SETTINGS_TAB_COPY[value]?(mode==='yue'?SETTINGS_TAB_COPY[value]:value+' / '+SETTINGS_TAB_COPY[value]):value,mount=doc.createElement('section');doc.body.append(mount);const fixture=settingsTabGuidance('history').practice,sample=mountGuidancePlayground(mount,{fixture,t}),tabs=mount.querySelector('md-tabs');tabs.activeTabIndex=4;await tabs.dispatchEvent({type:'change'});assert.equal(mount.querySelector('[role="tabpanel"]').textContent,t(fixture.choices[4].result));assert.deepEqual(mount.querySelectorAll('md-primary-tab').map(tab=>tab.textContent),fixture.choices.map(row=>t(row.label)));sample.destroy();const reopened=mountGuidancePlayground(mount,{fixture,t});assert.equal(reopened.session.state.value,'language');reopened.destroy();}}
 finally{if(previous)Object.defineProperty(prototype,'style',previous);else delete prototype.style;}
});
