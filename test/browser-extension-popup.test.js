import {styleExtensionMessage} from '../scripts/browser-extension-language-entry.js';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
import {readPreferences,applyPreferences,acquireStorage} from '../browser-extension/preferences.js';import {applyAccent} from '../browser-extension/accent.js';import {readLogo} from '../browser-extension/local-records.js';
const source=await fs.readFile(new URL('../browser-extension/popup.js',import.meta.url),'utf8');
async function fixture(send,storage=null,extra={}){const nodes=new Map(),languages=['en','yue','bilingual'].map(language=>({dataset:{language},listeners:{},setAttribute(){},addEventListener(name,handler){this.listeners[name]=handler;}}));const node=id=>{if(!nodes.has(id))nodes.set(id,{id,textContent:'',listeners:{},setAttribute(){},setLanguage(){},filter:async rows=>rows,addEventListener(name,handler){this.listeners[name]=handler;}});return nodes.get(id);};const calls=[];const document={getElementById:node,documentElement:{setAttribute(){}},querySelectorAll:selector=>selector==='[data-language]'?languages:['step-one','step-two','step-three'].map(node)};vm.runInNewContext(source.replace(/^import [^\r\n]*;\r?\n/gm,''),{document,window:{addEventListener(){},close(){extra.closed=(extra.closed||0)+1;}},readPreferences,applyPreferences,applyAccent,readLogo,acquireStorage:()=>storage,styleExtensionMessage,chrome:{runtime:{getURL:name=>'chrome-extension://fixture/'+name,openOptionsPage:()=>{calls.push({type:'open-options-page'});},sendMessage:async payload=>{calls.push(payload);return send(payload);}},tabs:extra.tabs,windows:extra.windows},Set,Promise});await new Promise(resolve=>setTimeout(resolve,0));return{nodes,node,calls,languages};}
test('popup only invokes explicit pairing transport and renders authoritative connection state',async()=>{const f=await fixture(({type})=>({paired:type!=='disconnect'}));assert.match(f.node('status').textContent,/Paired/);assert.equal(f.node('pair').disabled,true);assert.equal(f.node('disconnect').disabled,false);await f.node('disconnect').listeners.click();assert.match(f.node('status').textContent,/Not paired/);assert.deepEqual(f.calls.map(row=>row.type),['status','disconnect']);});
test('popup transport failures never print raw host details',async()=>{const f=await fixture(()=>({error:'private-host-diagnostic'}));assert.match(f.node('status').textContent,/Open the installed desktop/);assert.ok(!f.node('status').textContent.includes('private-host-diagnostic'));});
test('popup uses local Material and shared regex search with no raw external controls or CDN',async()=>{const html=await fs.readFile(new URL('../browser-extension/popup.html',import.meta.url),'utf8');assert.doesNotMatch(html,/<(?:button|input|select|textarea)\b/i);assert.match(html,/<mfe-search/);assert.match(source,/vendor\/search\.js/);assert.doesNotMatch(html,/<script[^>]+https?:/i);assert.match(html,/No transfer starts from this popup/);});

const SECTIONS=['connection','personalization','changelog','notes','docs','support','dimsum','models','status'];
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
test('the mini home page has one icon button per section in workspace order, inside the 380 pixel popup',async()=>{
 const html=await fs.readFile(new URL('../browser-extension/popup.html',import.meta.url),'utf8'),css=await fs.readFile(new URL('../browser-extension/popup.css',import.meta.url),'utf8');
 const cells=[...html.matchAll(/<li id="launch-cell-([a-z]+)"><md-icon-button id="launch-([a-z]+)" type="button" aria-label="Open [^"]+"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="[^"]+"\/><\/svg><\/md-icon-button><span id="launch-([a-z]+)-name" aria-hidden="true">[^<]+<\/span><\/li>/g)];
 assert.deepEqual(cells.map(match=>match[1]),SECTIONS);for(const[,a,b,c]of cells)assert.deepEqual([a,b,c],[a,a,a]);
 assert.match(css,/\.launcher-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/body\{margin:0;width:380px;max-width:100vw\}/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.launcher-grid>li,\.launcher-grid>li::before\{transition:none\}\}/);
 for(const id of ['pair','disconnect','status','workspace'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.ok(html.indexOf('id="pair"')<html.indexOf('class="launcher"'),'the pairing controls stay above the launcher');
});
test('each launcher button opens the workspace at its own section in a new tab',async()=>{
 const tabs={created:[],updated:[],query:async()=>[],create:async details=>{tabs.created.push(details);},update:async(id,details)=>{tabs.updated.push([id,details]);}},extra={tabs};
 const f=await fixture(()=>({paired:false}),null,extra);
 for(const id of SECTIONS){await f.node('launch-cell-'+id).listeners.click();await settle();}
 assert.deepEqual(tabs.created.map(row=>row.url),SECTIONS.map(id=>'chrome-extension://fixture/options.html#'+id));
 assert.deepEqual(tabs.updated,[]);assert.equal(extra.closed,SECTIONS.length,'the popup closes after opening');
 assert.deepEqual(f.calls.map(row=>row.type),['status'],'opening a section sends nothing to the desktop');
});
test('an open workspace tab is reused and focused instead of opening another',async()=>{
 const windows={focused:[],update:async(id,details)=>{windows.focused.push([id,details]);}},tabs={created:[],updated:[],query:async filter=>{tabs.filter=filter;return [{id:7,windowId:3}];},create:async details=>{tabs.created.push(details);},update:async(id,details)=>{tabs.updated.push([id,details]);}};
 const f=await fixture(()=>({paired:false}),null,{tabs,windows});
 await f.node('launch-cell-models').listeners.click();await settle();
 const plain=value=>JSON.parse(JSON.stringify(value));
 assert.deepEqual(plain(tabs.filter),{url:'chrome-extension://fixture/options.html*'});
 assert.deepEqual(plain(tabs.updated),[[7,{url:'chrome-extension://fixture/options.html#models',active:true}]]);
 assert.deepEqual(plain(windows.focused),[[3,{focused:true}]]);assert.deepEqual(plain(tabs.created),[]);
});
test('launcher buttons fall back to the options page when tabs cannot be opened, and follow the language',async()=>{
 const none=await fixture(()=>({paired:false}));
 await none.node('launch-cell-notes').listeners.click();await settle();
 assert.ok(none.calls.some(row=>row.type==='open-options-page'));
 const tabs={query:async()=>{throw new Error('blocked');},create:async()=>{throw new Error('blocked');}};
 const blocked=await fixture(()=>({paired:false}),null,{tabs});
 await blocked.node('launch-cell-docs').listeners.click();await settle();
 assert.ok(blocked.calls.some(row=>row.type==='open-options-page'));
 const yue=await fixture(()=>({paired:false}));yue.languages[1].listeners.click();
 assert.equal(yue.node('launch-docs-name').textContent,'說明文件');assert.equal(yue.node('launcher-heading').textContent,'開啟工作區部分');
 const both=await fixture(()=>({paired:false}));both.languages[2].listeners.click();
 assert.equal(both.node('launch-docs-name').textContent,'Documentation\n說明文件');
});
test('popup language write failure applies page state and reports unsaved outcome',async()=>{const storage={getItem:()=>null,setItem(){throw new Error('blocked');}};const f=await fixture(()=>({paired:false}),storage);f.languages[1].listeners.click();assert.match(f.node('preferences-status').textContent,/儲存唔到/);assert.match(f.node('heading').textContent,/下載/);});
