import {control as createControl,setControlLanguage} from '../src/shared/surface/controls.js';
import {createHistorySelection} from '../src/renderer/features/shell/history-selection.js';
import {createNotificationNarration} from '../src/renderer/features/shell/notification-narration.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { cantonese } from '../src/renderer/i18n.js';
import { createTranslator } from '../src/shared/local-ux/language.js';

const source = await fs.readFile(new URL('../src/renderer/app.js', import.meta.url), 'utf8');
function section(start, end) {
 const offset = source.indexOf(start);
 assert.ok(offset >= 0 && source.indexOf(end, offset) > offset);
 return source.slice(offset, source.indexOf(end, offset));
}
function fixture() {
 const elements = new Map();let doc;
 function element(text = '') {
  return {ownerDocument:doc,textContent:text, children:[], attributes:{}, dataset:{}, style:{setProperty(){}},
   set id(value) { this._id=value; elements.set(value,this); }, get id() { return this._id; },
   append(...children) { this.children.push(...children); },
   setAttribute(name,value) { this.attributes[name]=String(value); },
   getAttribute(name){return this.attributes[name]??null;},removeAttribute(name){delete this.attributes[name];},hasAttribute(name){return name in this.attributes;},replaceChildren(...children){this.children=children;},addEventListener(){},remove(){},querySelectorAll() { return []; }};
 }
 const get = id => { if (!elements.has(id)) elements.set(id,element()); return elements.get(id); };
 const preferences={language:'en',theme:'light',vocabulary:{replacements:[]}};
 doc={documentElement:element(),activeElement:null,querySelectorAll:()=>[],createElement:()=>element(),createTextNode:text=>element(text)};
 const context=vm.createContext({control:(tag,props,children)=>createControl(tag,props,children,doc),setControlLanguage,createHistorySelection,historySelection:null,historyRetentionDraft:false,historyRetentionRevision:0,formatDate:String,formatBytes:String,fileDetails:null,narrationEvents:createNotificationNarration({getNarrator:()=>null,getSettings:()=>preferences,isScreenReaderActive:()=>true}),preferences,cantonese,dictionary:new Map(),$:get,
  document:doc,
  state:null,view:'drive',busy:false,colorQuery:{matches:false},clearFields:{refresh(){}},
  historySearch:null,recycleSearch:null,createScopedSearch:()=>({refresh(){}}),api:{},
  mountState:()=>'',setText:(id,text)=>{get(id).textContent=text;},operation(){},
  displayPartSize:()=>({value:10,unit:'MB'}),renderFiles(){},renderAvailability(){},changeView(){},
  translateWorkspace:createTranslator(()=>preferences,{dictionary:cantonese}),
  vocabularyPersisted:true,foundation:null,fileSearch:null,featureMounts:new Map(),
  renderedFilesKey:'',privateWordingView:{refresh(){}},currentFiles:()=>[],renderOperations(){}});
 vm.runInContext(section('function t(source,options)', 'const privateWordingView') +
  section('function applyPreferences()', "colorQuery.addEventListener") +
  section('async function restoreHistoryVersion(', 'async function restoreRecycledSelection(') +
  section('function initializeArchive()', 'async function archiveMutation') +
  section('function render() {', 'function formatDate'),context);
 vm.runInContext('initializeArchive(); applyPreferences();',context);
 return {context,get,preferences};
}

test('existing history retention text and accessible name follow every language change',()=>{
 const {context,get,preferences}=fixture();
 const retention=get('history-retention');
 for(const [language,expected] of [['en','Show history'],['yue','顯示記錄'],['bilingual','Show history · 顯示記錄'],['en','Show history']]) {
  preferences.language=language;vm.runInContext('applyPreferences()',context);
  assert.equal(retention.label,expected,`${language}: visible field label`);
  assert.equal(retention.attributes['aria-label'],expected,`${language}: accessible name`);
  assert.equal(get('history-actions').children[1],retention,'language changes preserve the existing control');
 }
});

test('folder transport status renders the selected language after initial load and later changes',()=>{
 const {context,get,preferences}=fixture();
 context.state={locked:false,transport:{mode:'folder'},files:[],history:{versionCount:0,pendingVersionCount:0}};
 for(const [language,expected] of [['en','Synchronized folder'],['yue','同步資料夾'],['bilingual','Synchronized folder · 同步資料夾'],['en','Synchronized folder']]) {
  preferences.language=language;vm.runInContext('applyPreferences()',context);
  assert.ok(get('vault-storage-status').textContent.startsWith(`${expected} · `),`${language}: folder status`);
 }
});
