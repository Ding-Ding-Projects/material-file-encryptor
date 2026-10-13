import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {definePractice,createPracticeSession,evaluatePractice,mountGuidancePlayground,practiceCoverage,assertPracticeCoverage} from '../src/shared/surface/guidance-playground.js';
import {settingsPractice} from '../src/shared/local-ux/settings-practice.js';
import {settingsGuidance,SETTINGS_GUIDANCE_INVENTORY} from '../src/shared/local-ux/settings-guidance.js';
import {createAccessDocument} from './helpers/local-access-dom.js';

test('practice fixture admission rejects callbacks, accessors, live objects and missing examples',()=>{
 const fixture=settingsPractice('Display name');assert.ok(Object.isFrozen(fixture));
 assert.throws(()=>definePractice({...fixture,run(){}}),/JSON data/);
 let reads=0;assert.throws(()=>definePractice({...fixture,get current(){reads++;return 'private';}}),/accessors/);assert.equal(reads,0);
 assert.throws(()=>definePractice({...fixture,initial:new Date()}),/JSON data/);
 assert.throws(()=>definePractice({...fixture,expected:''}),/explicit worked/);
 assert.throws(()=>createPracticeSession({...fixture}),/authored/);
 assert.throws(()=>evaluatePractice({...fixture},{value:'anything'}),/authored/);
});
test('concurrent same and different fixtures own drafts, reset and disposal independently',()=>{
 const fixture=settingsPractice('Display name'),first=createPracticeSession(fixture),second=createPracticeSession(fixture),third=createPracticeSession(settingsPractice('Accent color'));
 const isolated=(a,b)=>{a.edit('Reading desk');assert.equal(b.state.value,'Sample workspace');a.reset();assert.equal(b.state.value,'Sample workspace');};
 isolated(first,second);
 assert.throws(()=>isolated(first,first),assert.AssertionError);first.reset();
 first.edit('Reading desk');third.edit('#315da8');assert.equal(second.state.value,'Sample workspace');assert.equal(first.state.value,'Reading desk');assert.equal(third.result.color,'#315da8');
 const returned=first.state;returned.value='mutated outside';assert.equal(first.state.value,'Reading desk');
 first.dispose();assert.throws(()=>first.edit('again'),/disposed/);assert.equal(second.state.value,'Sample workspace');
 const reopened=createPracticeSession(fixture);assert.equal(reopened.state.value,'Sample workspace');
});
test('bounded examples demonstrate search, color, number, confirmation and schedule behavior',()=>{
 const search=createPracticeSession(settingsPractice('Search settings'));assert.equal(search.result.count,2);assert.equal(search.edit('font').text,'Font scale changed');assert.equal(search.edit('[').count,0);
 const color=createPracticeSession(settingsPractice('Accent color'));assert.equal(color.edit('red; background:url(x)').valid,false);assert.equal(color.reset().color,'#52643f');
 const number=createPracticeSession(settingsPractice('Font weight'));assert.equal(number.edit(' ').valid,false);assert.equal(number.edit(901).valid,false);assert.equal(number.edit(700).number,700);
 const removal=createPracticeSession(settingsPractice('Remove'));assert.equal(removal.apply().valid,false);assert.equal(removal.state.applied,false);removal.confirm(true);assert.equal(removal.apply().removed,true);assert.equal(removal.reset().removed,false);
 const schedule=createPracticeSession(settingsPractice('Start time'));assert.equal(schedule.edit('25:01').valid,false);assert.equal(schedule.edit('10:30').text,'2030-01-15 10:30 UTC');
});
test('practice inventory compares exact identities and refuses missing descriptor support',()=>{
 const labels=['Display name','Accent color','Language','Language and voice','Appearance','Schedules','Attention','Private local history'],rows=labels.map(label=>settingsGuidance(label)),ids=rows.map(row=>row.id);
 assertPracticeCoverage(ids,rows);
 for(const omitted of [rows.slice(1),rows.filter(row=>row.id!=='settings.action.appearance')])assert.throws(()=>assertPracticeCoverage(ids,omitted),/mismatch/);
 assert.throws(()=>assertPracticeCoverage([...ids,'new-control'],rows),/mismatch/);
 assert.throws(()=>assertPracticeCoverage(ids,[...rows,rows[0]]),/Duplicate/);
 assert.throws(()=>assertPracticeCoverage(ids,rows.map((row,index)=>index?row:{...row,practice:null})),/Missing authored/);
 const actual=SETTINGS_GUIDANCE_INVENTORY.map(row=>settingsGuidance(row.label)),coverage=practiceCoverage(actual);
 assert.ok(coverage.some(row=>row.status==='missing'),'Incomplete families remain explicit, never falsely green');
});
test('mounted practice retains input node and local result through edits and reset, then removes handlers',async()=>{
 const doc=createAccessDocument(),mount=doc.createElement('section');doc.body.append(mount);
 const originalStyle=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(mount),'style');Object.defineProperty(Object.getPrototypeOf(mount),'style',{configurable:true,get(){return this._style||={};}});
 try{
 const sandbox=mountGuidancePlayground(mount,{fixture:settingsPractice('Display name')});const field=mount.querySelector('md-outlined-text-field');field.value='Reading desk';field.focus();await field.dispatchEvent({type:'input'});
 assert.equal(mount.querySelector('md-outlined-text-field'),field);assert.equal(doc.activeElement,field);assert.equal(sandbox.session.result.text,'Reading desk');
 await mount.querySelectorAll('md-text-button').find(node=>node.textContent==='Reset example').click();assert.equal(field.value,'Sample workspace');
 sandbox.destroy();assert.equal(mount.children.length,0);assert.equal(field.listeners.get('input').length,0);assert.throws(()=>sandbox.session.state,/disposed/);
 }finally{if(originalStyle)Object.defineProperty(Object.getPrototypeOf(mount),'style',originalStyle);else delete Object.getPrototypeOf(mount).style;}
});
test('sample module has no production helper imports or external-effect capability calls',async()=>{
 const source=await fs.readFile(new URL('../src/shared/surface/guidance-playground.js',import.meta.url),'utf8');
 const verify=text=>assert.doesNotMatch(text,/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|clipboard|showPicker|setTimeout|setInterval|registerCommands|registerHelp|dispatchEvent|eval|Function)\s*[.(]|\bimport\s|\.cloneNode\s*\(|\.innerHTML\s*=/);
 verify(source);assert.throws(()=>verify(source+'\nfetch("https://example.invalid")'),assert.AssertionError);assert.throws(()=>verify(source+'\nlocalStorage.setItem("a","b")'),assert.AssertionError);
});
