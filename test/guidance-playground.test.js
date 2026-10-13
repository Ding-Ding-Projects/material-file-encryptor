import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {definePractice,createPracticeSession,evaluatePractice,mountGuidancePlayground,practiceCoverage,assertPracticeCoverage} from '../src/shared/surface/guidance-playground.js';
import {settingsOperationPractice,clearSettingPractice} from '../src/shared/local-ux/settings-operation-practice.js';
import {settingsPractice,scheduledValuePractice,SETTINGS_PRACTICE_COPY} from '../src/shared/local-ux/settings-practice.js';
import {settingsGuidance,SETTINGS_GUIDANCE_INVENTORY} from '../src/shared/local-ux/settings-guidance.js';
import {NESTED_PRACTICE,FONT_PRACTICE,APPEARANCE_PRACTICE_COPY} from '../src/shared/local-ux/appearance-practice.js';
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
 assert.equal(coverage.filter(row=>row.status==='missing').length,0);assertPracticeCoverage(actual.map(row=>row.id),actual);
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
 const adapterImport="import {evaluateColorPractice} from '../local-ux/color-practice-evaluator.js';",mathImport="import {parseColorEntry,parseColor,colorRepresentations,contrastRatio,rainbowDuration} from '../../renderer/features/personalization/color.js';";
 const typographyImport="import {evaluateTypographyPractice} from '../local-ux/typography-practice-evaluator.js';",typographyMathImport="import {parseColorEntry} from '../../renderer/features/personalization/color.js';";
 const motionImport="import {evaluateMotionPractice} from '../local-ux/motion-practice-evaluator.js';";
 const remainingImport="import {evaluateMotionRemaining} from '../local-ux/motion-remaining-evaluator.js';";
 const utilityImport="import {evaluateMotionUtility} from '../local-ux/motion-utility-evaluator.js';";
 assert.ok(source.includes(adapterImport));assert.ok(source.includes(typographyImport));assert.ok(source.includes(motionImport));assert.ok(source.includes(utilityImport));assert.ok(source.startsWith(remainingImport));const core=source.replace(adapterImport,'').replace(typographyImport,'').replace(motionImport,'').replace(utilityImport,'').replace(remainingImport,'');verify(core);
 const adapter=await fs.readFile(new URL('../src/shared/local-ux/color-practice-evaluator.js',import.meta.url),'utf8'),math=await fs.readFile(new URL('../src/renderer/features/personalization/color.js',import.meta.url),'utf8');assert.ok(adapter.startsWith(mathImport));verify(adapter.replace(mathImport,''));verify(math);
 const typography=await fs.readFile(new URL('../src/shared/local-ux/typography-practice-evaluator.js',import.meta.url),'utf8');assert.ok(typography.startsWith(typographyMathImport));verify(typography.replace(typographyMathImport,''));
 verify(await fs.readFile(new URL('../src/shared/local-ux/motion-practice-evaluator.js',import.meta.url),'utf8'));
 verify(await fs.readFile(new URL('../src/shared/local-ux/motion-utility-evaluator.js',import.meta.url),'utf8'));
 verify(await fs.readFile(new URL('../src/shared/local-ux/motion-remaining-evaluator.js',import.meta.url),'utf8'));
 assert.throws(()=>verify(core+'\nimport original from "./controls.js";'),assert.AssertionError);assert.throws(()=>verify(math+'\nfetch("https://example.invalid")'),assert.AssertionError);assert.throws(()=>verify(adapter.replace(mathImport,'')+'\nlocalStorage.setItem("a","b")'),assert.AssertionError);
});

test('every authored appearance choice preserves its Cantonese result including expected output',()=>{
 for(const fixture of [...Object.values(NESTED_PRACTICE),...Object.values(FONT_PRACTICE)].filter(row=>row.choices))for(const option of fixture.choices){
  assert.ok(APPEARANCE_PRACTICE_COPY[option.result],fixture.id+': '+option.result);
  assert.notEqual(APPEARANCE_PRACTICE_COPY[option.result],option.result,fixture.id+': translated result');
  assert.match(APPEARANCE_PRACTICE_COPY[option.result],/[\u3400-\u9fff]/);
 }
 const fixture=NESTED_PRACTICE['select-state'];assert.equal(fixture.expected,fixture.choices[1].result);assert.equal(APPEARANCE_PRACTICE_COPY[fixture.expected],'樣本圖層狀態：焦點，唔會模擬真實焦點。');
 const regression={...APPEARANCE_PRACTICE_COPY,[fixture.expected]:fixture.expected};assert.throws(()=>assert.notEqual(regression[fixture.expected],fixture.expected),assert.AssertionError);
});
test('local Material selects change only the theme, density or font sample and reset the same field',async()=>{
 const doc=createAccessDocument(),prototype=Object.getPrototypeOf(doc.body),previous=Object.getOwnPropertyDescriptor(prototype,'style');Object.defineProperty(prototype,'style',{configurable:true,get(){return this._style||={};}});
 try{for(const[label,value,property,expected]of [['Theme','dark','backgroundColor','#1c1b1f'],['Density','compact','gap','8px'],['Font family','serif','fontFamily','serif']]){
  const mount=doc.createElement('section'),other=doc.createElement('section');doc.body.append(mount,other);const first=mountGuidancePlayground(mount,{fixture:settingsPractice(label)}),second=mountGuidancePlayground(other,{fixture:settingsPractice(label)});
  const field=mount.querySelector('md-outlined-select'),preview=mount.querySelector('[data-practice-preview]'),otherPreview=other.querySelector('[data-practice-preview]');assert.ok(field,label);assert.equal(field.menuPositioning,'absolute');assert.equal(field.children.length,settingsPractice(label).choices.length);const before=preview.style[property],otherBefore=otherPreview.style[property];
  field.value=value;await field.dispatchEvent({type:'change'});assert.equal(preview.style[property],expected);assert.equal(otherPreview.style[property],otherBefore);assert.equal(doc.body.style[property],undefined);
  await mount.querySelectorAll('md-text-button').find(node=>node.textContent==='Reset example').click();assert.equal(field.value,settingsPractice(label).initial);assert.equal(preview.style[property],before);assert.equal(mount.querySelector('md-outlined-select'),field);
  first.destroy();second.destroy();assert.equal(field.open,false);assert.equal(field.listeners.get('change').length,0);
 }}finally{if(previous)Object.defineProperty(prototype,'style',previous);else delete prototype.style;}
});
test('radio samples have unique invocation ownership and reset without changing siblings',async()=>{
 const doc=createAccessDocument(),a=doc.createElement('section'),b=doc.createElement('section');doc.body.append(a,b);const fixture=NESTED_PRACTICE['logo-fit'],first=mountGuidancePlayground(a,{fixture}),second=mountGuidancePlayground(b,{fixture}),radios=a.querySelectorAll('md-radio'),other=b.querySelectorAll('md-radio');
 assert.equal(radios.length,2);assert.notEqual(radios[0].name,other[0].name);radios[1].checked=true;await radios[1].dispatchEvent({type:'change'});assert.equal(first.session.state.value,'cover');assert.equal(second.session.state.value,'contain');assert.equal(other[0].checked,true);assert.equal(radios[0].checked,false);
 await a.querySelectorAll('md-text-button').find(node=>node.textContent==='Reset example').click();assert.equal(radios[0].checked,true);assert.equal(radios[1].checked,false);first.destroy();second.destroy();assert.equal(radios[1].listeners.get('change').length,0);
});

test('all 88 static settings descriptors have distinct authored fixtures and omission remains red',()=>{
 const rows=SETTINGS_GUIDANCE_INVENTORY.map(row=>settingsGuidance(row.label));assert.equal(rows.length,88);assertPracticeCoverage(rows.map(row=>row.id),rows);assert.equal(new Set(rows.map(row=>row.practice.id)).size,88);
 const omitted=rows.map(row=>row.label==='Unlock history'?{...row,practice:null}:row);assert.throws(()=>assertPracticeCoverage(rows.map(row=>row.id),omitted),/Missing authored/);
});
test('synthetic dates validate the calendar without rollover and own independent drafts',()=>{
 for(const label of ['Start date','End date','From date','To date']){const sample=createPracticeSession(settingsPractice(label));assert.equal(sample.result.text,'2030-01-15 UTC');assert.equal(sample.edit({year:2030,month:2,day:29}).valid,false);assert.equal(sample.edit({year:2032,month:2,day:29}).valid,true);assert.equal(sample.edit({year:2032,month:2,day:30}).valid,false);assert.equal(sample.reset().text,'2030-01-15 UTC');}
});
test('consequential sample actions produce specific local records and no unconditional success',()=>{
 const expected={
 'Set local credential':['credentialConfigured',true],'Store credential':['credentialConfigured',true],'Enable mode':['restrictionEnabled',true],'Turn off mode':['restrictionEnabled',false],'Configure credential':['editor','open'],'Clear credential':['credentialConfigured',false],'Cancel':['draft',''],'Enable':['enabled',true],'Disable':['enabled',false],'Reset':['theme','system'],'Set up history password':['passwordConfigured',true],'Unlock history':['locked',false],'Lock history':['locked',true],'Set retention':['retentionDays',30],'Save label':['label','Before appearance change'],'Not now (one hour)':['reminderAfter','2030-01-15T11:00:00Z']};
 for(const[label,[key,value]]of Object.entries(expected)){const fixture=settingsOperationPractice(label),sample=createPracticeSession(fixture);if(fixture.confirmation){assert.equal(sample.apply().valid,false);assert.equal(sample.state.applied,false);sample.edit({...sample.state.value,confirm:true});}const result=sample.apply();assert.equal(result.valid,true,label);assert.deepEqual(result.record[key],value,label);sample.reset();assert.deepEqual(sample.result.record,fixture.record,label+' reset');}
 const auth=createPracticeSession(settingsOperationPractice('Unlock history'));auth.edit({demonstration:'different'});assert.equal(auth.apply().valid,false);assert.equal(auth.state.applied,false);
 const voice=createPracticeSession(settingsOperationPractice('Test narration'));voice.edit({voice:'sample-yue',rate:1.5});const speech=voice.apply();assert.equal(speech.record.sequence[0].voice,'sample-yue');assert.equal(speech.record.audioPlayed,false);
 const editor=createPracticeSession(settingsOperationPractice('Edit this surface'));editor.edit({layer:'background'});assert.equal(editor.apply().record.selectedLayer,'background');
});
test('history and settings previews redact, compare, prune, restore and validate authored imports',()=>{
 const settings=createPracticeSession(settingsOperationPractice('Export settings')).apply();assert.deepEqual(settings.record,{version:1,settings:{theme:'dark',fontScale:1.25}});assert.ok(!settings.text.includes('privateDemo'));
 const history=createPracticeSession(settingsOperationPractice('Export redacted history')).apply();assert.equal(history.record.entries.length,2);assert.ok(!history.text.includes('snapshot'));
 const compare=createPracticeSession(settingsOperationPractice('Compare selected entries'));assert.equal(compare.apply().record.differences.length,2);compare.reset();compare.edit({first:'sample-a',second:'sample-a'});assert.equal(compare.apply().valid,false);
 const prune=createPracticeSession(settingsOperationPractice('Prune expired entries'));prune.edit({days:365,confirm:true});assert.deepEqual(prune.apply().record.entries,[{id:'recent',ageDays:10}]);assert.equal(prune.reset().record.entries.length,2);
 const restore=createPracticeSession(settingsOperationPractice('Restore'));restore.edit({confirm:true});assert.deepEqual(restore.apply().record.settings,{theme:'light',fontScale:1});
 const imported=createPracticeSession(settingsOperationPractice('Import settings'));imported.edit({file:'invalid'});assert.equal(imported.apply().valid,false);assert.equal(imported.state.applied,false);imported.edit({file:'valid'});assert.deepEqual(imported.apply().record.settings,{theme:'dark',fontScale:1.25});
});
test('clear and every scalar scheduled value select authored metadata instead of live values',()=>{
 const clear=createPracticeSession(clearSettingPractice('Search settings'));clear.edit({value:'Changed sample query'});assert.equal(clear.result.record.value,'Changed sample query');assert.equal(clear.apply().record.value,'');assert.equal(clear.reset().record.value,'Sample text');
 for(const domain of ['language','theme','density','seed','fontFamily','fontScale','fontWeight','motion','displayName','emoji','funnyEnglish','funnyCantonese','appearance','logo']){const fixture=scheduledValuePractice(domain);assert.ok(fixture,domain);assert.equal(createPracticeSession(fixture).result.valid,true);}
 assert.equal(scheduledValuePractice('unknown'),null);
});
test('authored font face choices change the sample weight and restore it on reset',async()=>{
 const doc=createAccessDocument(),prototype=Object.getPrototypeOf(doc.body),previous=Object.getOwnPropertyDescriptor(prototype,'style');Object.defineProperty(prototype,'style',{configurable:true,get(){return this._style||={};}});
 try{const mount=doc.createElement('section');doc.body.append(mount);const sample=mountGuidancePlayground(mount,{fixture:FONT_PRACTICE.face}),preview=mount.querySelector('[data-practice-preview]'),radios=mount.querySelectorAll('md-radio');assert.equal(preview.style.fontWeight,'400');radios[1].checked=true;await radios[1].dispatchEvent({type:'change'});assert.equal(preview.style.fontWeight,'700');await mount.querySelectorAll('md-text-button').find(node=>node.textContent==='Reset example').click();assert.equal(preview.style.fontWeight,'400');sample.destroy();}finally{if(previous)Object.defineProperty(prototype,'style',previous);else delete prototype.style;}
});

test('synthetic snapshot capture and removal retain authored properties and reject an in-use reference',()=>{
 for(const label of ['Capture current appearance','Capture current logo']){const fixture=settingsOperationPractice(label),session=createPracticeSession(fixture);const result=session.apply();assert.equal(result.record.snapshots.length,1);assert.deepEqual(result.record.snapshots[0].snapshot,fixture.record.base);assert.equal(session.reset().record.snapshots.length,0);}
 const removal=createPracticeSession(settingsOperationPractice('Remove local snapshot'));removal.edit({reference:'sample-used',confirm:true});assert.equal(removal.apply().valid,false);assert.equal(removal.state.applied,false);removal.edit({reference:'sample-unused',confirm:true});assert.deepEqual(removal.apply().record.snapshots,[{id:'sample-used',inUse:true}]);
});
test('mounted consequential preview edits, validates, applies and resets only its own synthetic record',async()=>{
 const doc=createAccessDocument(),prototype=Object.getPrototypeOf(doc.body),previous=Object.getOwnPropertyDescriptor(prototype,'style');Object.defineProperty(prototype,'style',{configurable:true,get(){return this._style||={};}});
 try{
 const mount=doc.createElement('section'),other=doc.createElement('section');doc.body.append(mount,other);const fixture=settingsOperationPractice('Prune expired entries'),first=mountGuidancePlayground(mount,{fixture}),second=mountGuidancePlayground(other,{fixture});
 const apply=mount.querySelector('md-filled-button'),confirm=mount.querySelector('md-checkbox');await apply.click();assert.equal(first.session.state.applied,false);assert.equal(doc.activeElement,confirm);assert.equal(confirm.getAttribute('aria-invalid'),'true');confirm.checked=true;await confirm.dispatchEvent({type:'change'});await apply.click();assert.equal(first.session.result.record.entries.length,1);assert.equal(second.session.result.record.entries.length,2);
 await mount.querySelectorAll('md-text-button').find(node=>node.textContent==='Reset example').click();assert.equal(confirm.checked,false);assert.equal(first.session.result.record.entries.length,2);first.destroy();second.destroy();
 const clearMount=doc.createElement('section');doc.body.append(clearMount);const cleared=mountGuidancePlayground(clearMount,{fixture:clearSettingPractice('Search settings')}),field=clearMount.querySelector('md-outlined-text-field');field.value='New sample';await field.dispatchEvent({type:'input'});assert.equal(cleared.session.result.record.value,'New sample');await clearMount.querySelector('md-filled-button').click();assert.equal(field.value,'');assert.equal(cleared.session.result.record.value,'');assert.equal(doc.activeElement,field);await clearMount.querySelectorAll('md-text-button').find(node=>node.textContent==='Reset example').click();assert.equal(field.value,'Sample text');cleared.destroy();
 }finally{if(previous)Object.defineProperty(prototype,'style',previous);else delete prototype.style;}
});

test('all settings choices register authored Cantonese labels and result strings',()=>{
 const technical=new Set(['UTC','Asia/Hong_Kong']);
 for(const row of SETTINGS_GUIDANCE_INVENTORY){const fixture=settingsPractice(row.label);for(const option of fixture.choices||[]){for(const key of ['label','result']){assert.ok(Object.hasOwn(SETTINGS_PRACTICE_COPY,option[key]),row.id+': '+option[key]);if(!technical.has(option[key]))assert.match(SETTINGS_PRACTICE_COPY[option[key]],/[\u3400-\u9fff]/,option[key]);}}}
 for(const[en,yue]of [['Sample palette: dark','樣本色彩：深色'],['Sample spacing: 8 px','樣本間距：8 px'],['Sample family: serif','樣本字型家族：serif']])assert.equal(SETTINGS_PRACTICE_COPY[en],yue);
 const broken={...SETTINGS_PRACTICE_COPY};delete broken['Sample palette: dark'];assert.throws(()=>assert.ok(Object.hasOwn(broken,'Sample palette: dark')),assert.AssertionError);
});
test('Priority practice rejects fractional input and recovers at the declared integer step',()=>{
 const fixture=settingsPractice('Priority');assert.equal(fixture.integer,true);assert.equal(fixture.step,1);const sample=createPracticeSession(fixture);assert.equal(sample.edit('0.5').valid,false);assert.equal(sample.edit('-999.5').valid,false);assert.equal(sample.edit('1').valid,true);assert.equal(sample.result.number,1);assert.equal(sample.edit('-1000').valid,true);assert.equal(sample.edit('1001').valid,false);
 const broken=definePractice({...fixture,integer:false});assert.throws(()=>assert.equal(createPracticeSession(broken).edit('0.5').valid,false),assert.AssertionError);
});
test('editing Year repairs all date field diagnostics after an invalid leap day',async()=>{
 const doc=createAccessDocument(),mount=doc.createElement('section');doc.body.append(mount);const sample=mountGuidancePlayground(mount,{fixture:settingsPractice('Start date')}),fields=mount.querySelectorAll('md-outlined-text-field'),[year,month,day]=fields;
 month.value='2';await month.dispatchEvent({type:'input'});day.value='29';await day.dispatchEvent({type:'input'});assert.equal(sample.session.result.valid,false);assert.equal(day.getAttribute('aria-invalid'),'true');assert.equal(day.error,true);
 year.value='2032';await year.dispatchEvent({type:'input'});assert.equal(sample.session.result.valid,true);for(const field of fields){assert.equal(field.getAttribute('aria-invalid'),'false');assert.equal(field.error,false);assert.equal(field.errorText,'');}assert.equal(sample.session.result.text,'2032-02-29 UTC');sample.destroy();
});
test('mounted settings choice options and visible results use Cantonese and bilingual copy',async()=>{
 const doc=createAccessDocument(),prototype=Object.getPrototypeOf(doc.body),previous=Object.getOwnPropertyDescriptor(prototype,'style');Object.defineProperty(prototype,'style',{configurable:true,get(){return this._style||={};}});
 try{for(const mode of ['yue','bilingual'])for(const[label,value,en]of [['Theme','dark','Sample palette: dark'],['Density','compact','Sample spacing: 8 px'],['Font family','serif','Sample family: serif']]){
  const t=text=>SETTINGS_PRACTICE_COPY[text]?(mode==='yue'?SETTINGS_PRACTICE_COPY[text]:text+' / '+SETTINGS_PRACTICE_COPY[text]):text,mount=doc.createElement('section');doc.body.append(mount);const fixture=settingsPractice(label),sample=mountGuidancePlayground(mount,{fixture,t}),field=mount.querySelector('md-outlined-select');assert.deepEqual(field.children.map(row=>row.textContent),fixture.choices.map(row=>t(row.label)));field.value=value;await field.dispatchEvent({type:'change'});const result=mount.querySelector('[role="status"]');assert.equal(result.textContent,t(en));assert.match(result.textContent,/[\u3400-\u9fff]/);sample.destroy();
 }}finally{if(previous)Object.defineProperty(prototype,'style',previous);else delete prototype.style;}
});
