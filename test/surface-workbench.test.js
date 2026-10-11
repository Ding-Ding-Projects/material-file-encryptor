import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkbenchStore,describePattern,capabilities,guidedTokens} from '../src/shared/surface/regex-workbench.js';
import {commandSearchText} from '../src/shared/surface/command-search.js';
import {createSurfaceModel} from '../src/shared/surface/model.js';
import {shouldOpenRegisteredView} from '../src/shared/surface/view-registration.js';
function storage(){const map=new Map();return{getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value)};}
test('snippet persistence is isolated by surface and history requires opt-in',()=>{
 const disk=storage(),a=createWorkbenchStore(disk,'a');a.add('Letters','\\p{L}+','u');a.remember('secret','u');assert.deepEqual(a.get().history,[]);
 a.setHistory(true);a.remember('a+','u');assert.equal(createWorkbenchStore(disk,'a').get().history[0].pattern,'a+');assert.equal(createWorkbenchStore(disk,'b').get().snippets.length,0);
 a.setHistory(false);assert.equal(createWorkbenchStore(disk,'a').get().history.length,0);
});
test('invalid snippets are rejected without replacing existing state',()=>{
 const model=createWorkbenchStore(storage(),'a');model.add('valid','a','u');assert.throws(()=>model.import({version:1,snippets:[{name:'broken',pattern:'[',flags:'u'}]}));assert.equal(model.get().snippets[0].name,'valid');
 const exported=JSON.parse(model.export());assert.deepEqual(Object.keys(exported).sort(),['snippets','version']);
});
test('lexical explanation identifies groups and warns about nested repetition',()=>{
 const description=describePattern('^(a+)+$');assert.equal(description.tokens[0].kind,'anchor');assert.equal(description.tokens.find(t=>t.kind==='group-open').closesAt,4);assert.ok(description.warnings.length);assert.equal(description.traceAvailable,false);
 assert.ok(guidedTokens.some(t=>t[0]==='namedReference'));assert.ok(capabilities.some(c=>c.en==='Atomic groups'&&!c.supported));
});
test('palette searches localized metadata and current values safely',()=>{
 const command={label:{en:'Theme',yue:'主題'},description:{en:'Color scheme',yue:'配色'},group:{en:'Appearance',yue:'外觀'},keywords:['contrast'],control:{get:()=> 'dark'}};
 assert.equal(commandSearchText(command,'yue'),'主題 配色 外觀 contrast dark');command.control.get=()=>{throw Error('Unavailable');};assert.equal(commandSearchText(command,'en'),'Theme Color scheme Appearance contrast');
});
test('registering views after reload preserves closed tabs and explicit reopen restores them',()=>{
 const disk=storage(),tabs=[{id:'home',label:'Home'},{id:'history',label:'History'}];const first=createSurfaceModel({storage:disk,tabs});first.closeTab('history');const restored=createSurfaceModel({storage:disk,tabs});
 for(const view of tabs)if(shouldOpenRegisteredView(restored.getState(),view.id))restored.openTab(view);
 assert.deepEqual(restored.getState().tabs.map(tab=>tab.id),['home']);assert.equal(shouldOpenRegisteredView(restored.getState(),'converter'),true);
 restored.openTab(tabs[1]);assert.equal(shouldOpenRegisteredView(restored.getState(),'history'),true);
});
test('closed-tab registration choices survive the shorter undo stack',()=>{
 const disk=storage(),tabs=Array.from({length:30},(_,index)=>({id:`view-${index}`,label:`View ${index}`}));const model=createSurfaceModel({storage:disk,tabs});for(let i=1;i<30;i++)model.closeTab(tabs[i].id);
 const restored=createSurfaceModel({storage:disk,tabs});assert.equal(restored.getState().closedTabs.length,20);assert.equal(shouldOpenRegisteredView(restored.getState(),'view-1'),false);
});
