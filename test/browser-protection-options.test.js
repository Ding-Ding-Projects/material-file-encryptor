import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
import {defaults,readPreferences,applyPreferences,tabTarget} from '../browser-extension/preferences.js';import {styleExtensionMessage} from '../scripts/browser-extension-language-entry.js';import {EXPORT_FORMATS,exportChangelog,validateExport} from '../browser-extension/exports.js';import {readHistory,recordChanges,clearHistory} from '../browser-extension/history.js';import {ACCENT_PRESETS,accentPalette,applyAccent} from '../browser-extension/accent.js';import {checkLogoFile,readLogo,saveLogo,clearLogo,readAttention,saveAttention,attentionDefaults} from '../browser-extension/local-records.js';import {NOTE_LIMITS,checkNote,readNotes,addNote,deleteNotes,notesMarkdown,readDraft,saveDraft,clearDraft,linkParts} from '../browser-extension/notes.js';import {SCHEDULE_VALUES,readSchedules,addSchedule,cancelSchedule,takeDue,timeZoneLabel} from '../browser-extension/schedules.js';import {readVocabulary,saveVocabulary,clearVocabulary,applyVocabulary} from '../browser-extension/vocabulary.js';import {readNarration,saveNarration,voicesFor,narrationScript,speak,stopSpeech} from '../browser-extension/narration.js';import {TICKET_CATEGORIES,TICKET_STATUSES,checkAttachment,saveTicket,readTickets,deleteTicket,diagnosticsText,ticketExport} from '../browser-extension/tickets.js';import {CATALOG_URL,RELEASES_URL,normaliseCatalog,photoMap,categories,searchDishes,readFavourites,toggleFavourite} from '../browser-extension/dimsum.js';import {DEFAULT_PORT,ORIGIN_PATTERN,LIMITS,parsePort,modelName,validatePayload,callLocal,formatSize,installedModels,runningNames,pullProgress,chatDelta} from '../browser-extension/local-models.js';import {parseRichText} from '../browser-extension/rich-text.js';
import {normalizePairingCode,validPairingCode,scanSupported,createPairingScanner} from '../browser-extension/pairing-code.js';
import {RELEASES_API,parseReleaseCodeName,parsePhotoUrl,matchRelease,releasePageUrl,installerAsset} from '../browser-extension/release-code-name.js';
const defaultCoverage={schemaVersion:1,sourceCommit:'a'.repeat(40),total:4,counts:{missing:1,unverified:2,'not-applicable':1},extensionTargets:[],rows:[
 {id:'language',status:'unverified',behaviorVerdict:'partial',evidenceVerdict:'current-runtime-unverified',reason:'English and Cantonese settings are wired. Runtime unverified.'},
 {id:'regex-builder',status:'missing',behaviorVerdict:'missing',evidenceVerdict:'current-runtime-unverified',reason:'No regex builder in the popup.'},
 {id:'notifications',status:'unverified',behaviorVerdict:'present',evidenceVerdict:'current-runtime-unverified',reason:'Non-blocking notices exist but are unverified.'},
 {id:'landing-site',status:'not-applicable',behaviorVerdict:'not-applicable',evidenceVerdict:'current-runtime-unverified',reason:'Belongs to the site.'}]};
// This shell fixture isolates feature mounts; dedicated tests exercise production note, converter and model behavior.
const renderNoteText=(host,markdown,renderer,translate)=>renderer(host,markdown,{translate});
const mountBrowserConverter=()=>({setConnection(){},refreshLabels(){}});
const source=await fs.readFile(new URL('../browser-extension/options.js',import.meta.url),'utf8'),html=await fs.readFile(new URL('../browser-extension/options.html',import.meta.url),'utf8');
async function fixture(snapshot,language='en',{changelog={schemaVersion:1,entries:[{title:'Material sweep',date:'2026-10-14',items:['Converted tabs'],yue:'轉做 Material'},{title:'Startup',date:'2026-10-11',items:['Readiness'],yue:''}]},provenance={schemaVersion:1,version:'0.1.0',sourceCommit:'a'.repeat(40),sourceModified:false,stagedAtUtc:'2026-10-14T09:30:00.000Z'},records:seed=null,extras={},docsCatalog={schemaVersion:1,documents:[{id:'readme',source:'docs/features/README.md',title:'Features',markdown:'# Features\nSee [workspace](workflows/browser-extension-workspace.md).',headings:[]},{id:'workspace',source:'docs/features/workflows/browser-extension-workspace.md',title:'Browser extension workspace',markdown:'# Browser extension workspace\nNotes and schedules.',headings:[]},{id:'workspace-yue',source:'docs/features/workflows/browser-extension-workspace.zh-HK.md',title:'瀏覽器擴充功能工作區',markdown:'# 瀏覽器擴充功能工作區\n筆記。',headings:[]}],assets:[]}}={}){
 const nodes=new Map(),calls=[],sentMessages=[],schoolRequests=[],lockRequests=[],ladderRequests=[],attributes=new Map(),created=[];const node=id=>{if(!nodes.has(id))nodes.set(id,{id,textContent:'',dataset:{},listeners:{},setAttribute(name,value){attributes.set(id+':'+name,value);},removeAttribute(name){attributes.delete(id+':'+name);},replaceChildren(...children){this.textContent=children.map(child=>child.textContent??'').join('');},append(...children){for(const child of children)this.textContent+=child.textContent;},addEventListener(name,fn){this.listeners[name]=fn;},setLanguage(){},filter:async rows=>rows,focus(){},show(){this.open=true;return Promise.resolve();},close(){this.open=false;}});return nodes.get(id);};
 const copies=[...html.matchAll(/data-copy="([^"]+)"/g)].map((match,index)=>{const item=node('copy-'+index);item.dataset.copy=match[1];return item;});const permissionRequests=[];const tabs=['connection','personalization','changelog','notes','docs','support','dimsum','models','status'].map(tab=>{const item=node('tab-'+tab);item.dataset.tab=tab;return item;});const languages=['en','yue','bilingual'].map(value=>{const item=node('language-'+value);item.dataset.language=value;return item;});const themes=['system','light','dark'].map(value=>{const item=node('theme-'+value);item.dataset.theme=value;return item;});const stored={value:JSON.stringify({...defaults,language})};const history={value:null},records=seed??new Map();const storage={getItem:key=>key==='mfe-extension-history-v1'?history.value:key==='mfe-extension-preferences-v1'?stored.value:(records.get(key)??null),setItem(key,value){if(key==='mfe-extension-history-v1')history.value=value;else if(key==='mfe-extension-preferences-v1')stored.value=value;else records.set(key,value);},removeItem(key){if(key==='mfe-extension-history-v1')history.value=null;else records.delete(key);},stored,history,records};
 const win={listeners:{},addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}};const document={getElementById:node,documentElement:{dataset:{},style:{props:{},setProperty(name,value){this.props[name]=value;},removeProperty(name){delete this.props[name];}}},createTextNode:text=>({textContent:text}),createElement:tag=>{const made=node('generated-'+nodes.size);made.localName=tag;created.push(made);return made;},querySelectorAll:selector=>({'[data-copy]':copies,'[data-tab]':tabs,'[data-language]':languages,'[data-theme]':themes,'[data-guidance]':[]}[selector]||[])};
 vm.runInNewContext(source.replace(/^import [^\r\n]*;\r?\n/gm,''),{renderNoteText,mountBrowserConverter,changelog,provenance,EXPORT_FORMATS,exportChangelog,validateExport,readHistory,recordChanges,clearHistory,ACCENT_PRESETS,accentPalette,applyAccent,checkLogoFile,readLogo,saveLogo,clearLogo,readAttention,saveAttention,attentionDefaults,NOTE_LIMITS,checkNote,readNotes,addNote,deleteNotes,notesMarkdown,readDraft,saveDraft,clearDraft,linkParts,SCHEDULE_VALUES,readSchedules,addSchedule,cancelSchedule,takeDue,timeZoneLabel,readVocabulary,saveVocabulary,clearVocabulary,applyVocabulary,Intl,docsCatalog,readNarration,saveNarration,voicesFor,narrationScript,speak,stopSpeech,TICKET_CATEGORIES,TICKET_STATUSES,checkAttachment,saveTicket,readTickets,deleteTicket,diagnosticsText,ticketExport,CATALOG_URL,RELEASES_URL,normaliseCatalog,photoMap,categories,searchDishes,readFavourites,toggleFavourite,DEFAULT_PORT,ORIGIN_PATTERN,LIMITS,parsePort,modelName,validatePayload,callLocal,formatSize,installedModels,runningNames,pullProgress,chatDelta,normalizePairingCode,validPairingCode,scanSupported,createPairingScanner,parseRichText,AbortController,setTimeout,clearTimeout,RELEASES_API,parseReleaseCodeName,parsePhotoUrl,matchRelease,releasePageUrl,installerAsset,...(extras.pairingGlobals||{}),coverage:extras.coverage===undefined?defaultCoverage:extras.coverage,fetch:extras.fetch,caches:extras.caches,Response:class{constructor(body,init){this.body=body;this.headers=new Map(Object.entries(init?.headers||{}));}async json(){return JSON.parse(this.body);}},speechSynthesis:extras.speechSynthesis,navigator:extras.navigator,MediaRecorder:extras.MediaRecorder,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},URL:{createObjectURL:()=>'blob:recording',revokeObjectURL(){}},Blob:class{constructor(parts,options){this.parts=parts;this.type=options?.type;}},renderMarkdown:(host,markdown,context)=>{host.textContent=markdown;host.context=context;},FileReader:class{readAsDataURL(file){this.result=file.dataUrl;queueMicrotask(()=>this.onload());}readAsText(file){this.result=file.text;queueMicrotask(()=>this.onload());}},defaults,document,window:win,location:extras.location,history:extras.history,readPreferences,applyPreferences,tabTarget,acquireStorage:()=>storage,styleExtensionMessage,chrome:{permissions:{request:async details=>{permissionRequests.push(details);return extras.grant!==false;}},runtime:{getManifest:()=>({version:'0.1.0'}),sendMessage:async message=>{calls.push(message.type);sentMessages.push(JSON.stringify(message));if(message.type==='desktop-status'){if(extras.desktop instanceof Error)throw extras.desktop;return extras.desktop??{paired:false};}if(extras.paired===false&&message.type==='status')return {paired:false};if(message.type==='authenticator-focus'){if(extras.authenticator instanceof Error)throw extras.authenticator;if(typeof extras.authenticator==='function')return extras.authenticator();return extras.authenticator??{schemaVersion:1,state:'shown'};}if(message.type==='school-mode-read'||message.type==='school-mode-set'){const entry=message.type==='school-mode-read'?extras.schoolRead:extras.schoolSet;if(message.type==='school-mode-set')schoolRequests.push(message);if(entry instanceof Error)throw entry;if(typeof entry==='function')return entry(message);if(entry!==undefined)return entry;if(extras.paired===false)return {paired:false};return message.type==='school-mode-read'?{schemaVersion:1,enabled:false,name:'School mode'}:{schemaVersion:1,state:'changed',enabled:true};}if(message.type==='element-locks-read'||message.type==='element-lock-set'){const entry=message.type==='element-locks-read'?extras.locksRead:extras.lockSet;if(message.type==='element-lock-set')lockRequests.push(message);if(entry instanceof Error)throw entry;if(typeof entry==='function')return entry(message);if(entry!==undefined)return entry;if(extras.paired===false)return {paired:false};return message.type==='element-locks-read'?{schemaVersion:1,locked:[]}:{schemaVersion:1,state:'changed',target:message.target,locked:message.locked};}if(message.type==='unlock-ladder-read'||message.type==='unlock-step-request'){const entry=message.type==='unlock-ladder-read'?extras.ladderRead:extras.ladderStep;if(message.type==='unlock-step-request')ladderRequests.push(message);if(entry instanceof Error)throw entry;if(typeof entry==='function')return entry(message);if(entry!==undefined)return entry;if(extras.paired===false)return {paired:false};return message.type==='unlock-ladder-read'?{schemaVersion:1,level:'level-0',levels:['level-0','level-1','level-2'],cooldownUntil:null,recovery:'none'}:{schemaVersion:1,state:'complete',level:'level-0',cooldownUntil:null};}if(message.type==='protection-status'){if(snapshot instanceof Error)throw snapshot;return snapshot;}return {paired:true};}}}});await new Promise(resolve=>setTimeout(resolve,0));return{node,calls,sentMessages,schoolRequests,lockRequests,ladderRequests,permissionRequests,attributes,storage,win,document,nodesWith:text=>[...nodes.values()].filter(item=>String(item.textContent).includes(text)),find:(tag,name)=>[...created].reverse().find(item=>item.localName===tag&&attributes.get(item.id+':aria-label')===name),prefs:()=>JSON.parse(storage.stored.value)};
}
test('options separates paired connection from unavailable browser authority and localizes observed states',async()=>{const f=await fixture({schemaVersion:1,profile:'authenticated',sharedMode:'active',browserPermission:'unavailable'},'yue');assert.match(f.node('connection-state').textContent,/已配對/);assert.match(f.node('profile-state').textContent,/已驗證/);assert.match(f.node('shared-state').textContent,/已啟用/);assert.deepEqual(f.calls,['status','protection-status','workflow-discover']);assert.equal(f.attributes.get('home-view:aria-label'),'Material File Encryptor · 工作區');});
test('options failed or malformed protection reads retain connection while clearing observations',async()=>{for(const snapshot of [new Error('fixture unavailable'),{schemaVersion:1,profile:'authenticated',sharedMode:'inactive',browserPermission:'granted'},{schemaVersion:2,profile:'authenticated',sharedMode:'inactive',browserPermission:'unavailable'}]){const f=await fixture(snapshot);assert.match(f.node('connection-state').textContent,/Paired/);assert.match(f.node('profile-state').textContent,/unavailable/);assert.match(f.node('shared-state').textContent,/unavailable/);}});
test('workspace shows the bundled changelog offline and filters it locally',async()=>{const f=await fixture({schemaVersion:1,profile:'authenticated',sharedMode:'inactive',browserPermission:'unavailable'});assert.equal(f.node('changelog-count').textContent,'2 of 2 releases');assert.match(f.node('changelog-list').textContent,/Material sweep · 2026-10-14Converted tabs/);f.node('changelog-filter').value='readiness';f.node('changelog-filter').listeners.input();assert.equal(f.node('changelog-count').textContent,'1 of 2 releases');assert.match(f.node('changelog-list').textContent,/^Startup/);const yue=await fixture(new Error('x'),'yue');assert.match(yue.node('changelog-list').textContent,/轉做 Material/);assert.doesNotMatch(yue.node('changelog-list').textContent,/Converted tabs/);});
test('status shows the staged version, source commit and staging time, or says they are unavailable',async()=>{const f=await fixture(new Error('x'));assert.equal(f.node('source-commit').textContent,'Source commit: aaaaaaaaaaaa');assert.equal(f.node('staged-at').textContent,'Staged: 2026-10-14 09:30 UTC');const missing=await fixture(new Error('x'),'en',{provenance:null,changelog:null});assert.equal(missing.node('source-commit').textContent,'Source commit unavailable');const modified=await fixture(new Error('x'),'en',{provenance:{schemaVersion:1,version:'0.1.0',sourceCommit:'b'.repeat(40),sourceModified:true,stagedAtUtc:'2026-10-14T09:30:00.000Z'}});assert.equal(modified.node('source-commit').textContent,'Source commit: bbbbbbbbbbbb with uncommitted changes');assert.equal(missing.node('changelog-count').textContent,'The changelog is unavailable in this build.');});
test('command palette lists every workspace action, filters it and disables actions that cannot run',async()=>{const f=await fixture({schemaVersion:1,profile:'authenticated',sharedMode:'inactive',browserPermission:'unavailable'});const list=f.node('palette-list');assert.match(html,/<md-dialog id="palette"/);assert.match(list.textContent,/Open Changelog/);assert.match(list.textContent,/Use dark theme/);f.node('palette-filter').value='theme';f.node('palette-filter').listeners.input();assert.doesNotMatch(list.textContent,/Open Changelog/);assert.match(list.textContent,/Use light theme/);});
test('export formats serialise, neutralise spreadsheet formulas and validate their own row counts',()=>{const entries=[{title:'Sweep',date:'2026-10-14',items:['=SUM(A1)','Plain, "quoted"'],yue:'摘要'},{title:'Empty',date:'',items:[],yue:''}];const json=exportChangelog(entries,'json');assert.equal(JSON.parse(json).entries.length,2);assert.ok(validateExport(json,'json',entries));const csv=exportChangelog(entries,'csv');assert.ok(csv.includes(",'=SUM(A1),"));assert.ok(csv.includes('"Plain, ""quoted"""'));assert.ok(validateExport(csv,'csv',entries));assert.equal(validateExport(csv+'extra\r\n','csv',entries),false);const markdown=exportChangelog(entries,'markdown');assert.ok(markdown.startsWith('## Sweep · 2026-10-14'));assert.ok(validateExport(markdown,'markdown',entries));assert.throws(()=>exportChangelog(entries,'xml'),/Choose an export format/);});
test('workspace export previews the filtered releases and offers only a validated file',async()=>{const f=await fixture(new Error('x'));f.node('changelog-filter').value='readiness';f.node('changelog-filter').listeners.input();f.node('export-format').value='csv';f.node('export-preview').listeners.click();assert.equal(f.node('export-dialog').open,true);assert.match(f.node('export-summary').textContent,/^1 releases as CSV/);assert.match(f.node('export-text').textContent,/Startup,Readiness/);assert.equal(f.node('export-save').disabled,false);});
test('setting details show current values and follow changes',async()=>{const f=await fixture(new Error('x'));assert.match(f.node('setting-details').textContent,/Language: English/);assert.match(f.node('setting-details').textContent,/Theme: System/);f.node('theme-dark').listeners.click();assert.match(f.node('setting-details').textContent,/Theme: Dark/);});
test('resetting every setting needs both confirmation keys and the full slider',async()=>{const f=await fixture(new Error('x'));f.node('theme-dark').listeners.click();assert.equal(f.prefs().theme,'dark');f.node('reset').listeners.click();assert.equal(f.node('confirm-dialog').open,true);assert.equal(f.node('confirm-execute').disabled,true);f.node('confirm-execute').listeners.click();assert.equal(f.prefs().theme,'dark');f.node('confirm-first').selected=true;f.node('confirm-first').listeners.change();assert.equal(f.node('confirm-slider').disabled,true);f.node('confirm-second').selected=true;f.node('confirm-second').listeners.change();assert.equal(f.node('confirm-slider').disabled,false);f.node('confirm-slider').value=60;f.node('confirm-slider').listeners.change();assert.equal(f.node('confirm-execute').disabled,true);f.node('confirm-slider').value=100;f.node('confirm-slider').listeners.change();assert.equal(f.node('confirm-execute').disabled,false);f.node('confirm-execute').listeners.click();assert.equal(f.prefs().theme,'system');assert.equal(f.node('confirm-dialog').open,false);f.node('theme-light').listeners.click();f.node('reset').listeners.click();f.node('confirm-cancel').listeners.click();assert.equal(f.prefs().theme,'light');});
test('tab shortcuts use Alt and a digit and leave browser-reserved combinations alone',async()=>{const f=await fixture(new Error('x'));const press=init=>{const event={altKey:false,ctrlKey:false,metaKey:false,prevented:false,preventDefault(){this.prevented=true;},...init};for(const fn of f.win.listeners.keydown)fn(event);return event;};assert.equal(press({key:'3',altKey:true}).prevented,true);assert.equal(f.prefs().tab,'changelog');assert.equal(press({key:'2',ctrlKey:true}).prevented,false);assert.equal(f.prefs().tab,'changelog');assert.equal(press({key:'k',ctrlKey:true}).prevented,true);assert.ok(f.node('palette-list').textContent.includes('Open NotesAlt+4'));assert.ok(f.node('palette-list').textContent.includes('Open DocumentationAlt+5'));assert.ok(f.node('palette-list').textContent.includes('Open SupportAlt+6'));assert.ok(f.node('palette-list').textContent.includes('Open Dim sumAlt+7'));assert.ok(f.node('palette-list').textContent.includes('Open ModelsAlt+8'));assert.ok(f.node('palette-list').textContent.includes('Open StatusAlt+9'));assert.equal(press({key:'8',altKey:true}).prevented,true);assert.equal(f.prefs().tab,'models');assert.equal(press({key:'9',altKey:true}).prevented,true);assert.equal(f.prefs().tab,'status');});
test('a local product name reaches the title, version line and the Home navigation name, and rejects markup',async()=>{const f=await fixture(new Error('x'));const name=f.node('display-name');name.value='Family vault';name.listeners.change();assert.equal(f.prefs().displayName,'Family vault');assert.equal(f.document.title,'Family vault · Extension workspace');assert.equal(f.node('version').textContent,'Family vault 0.1.0');assert.equal(f.node('workspace-heading').textContent,'Family vault · Extension workspace');assert.equal(f.attributes.get('home-view:aria-label'),'Family vault · Workspace');name.value='<b>bold</b>';name.listeners.change();assert.equal(name.error,true);assert.equal(f.prefs().displayName,'Family vault');});
test('an accent is applied only when its text contrast passes, with opacity composited',async()=>{const f=await fixture(new Error('x'));const hex=f.node('accent-hex');hex.value='#f5f5a0';hex.listeners.input();assert.match(f.node('accent-contrast').textContent,/Text contrast/);hex.value='#2f6b5e';hex.listeners.input();assert.match(f.node('accent-contrast').textContent,/meets the 4.5:1 minimum/);assert.equal(f.node('accent-apply').disabled,false);f.node('accent-apply').listeners.click();assert.equal(f.prefs().accent,'#2f6b5e');assert.equal(f.document.documentElement.style.props['--md-sys-color-primary'],'#2f6b5e');f.node('accent-reset').listeners.click();assert.equal(f.prefs().accent,'');assert.equal(f.document.documentElement.style.props['--md-sys-color-primary'],undefined);const pale=accentPalette('#2f6b5e33',false),solid=accentPalette('#2f6b5e',false);assert.notEqual(pale.primary,solid.primary);assert.equal(solid.onPrimary,'#ffffff');assert.equal(pale.onPrimary,'#000000');});
test('recent changes record setting changes, restore one value and clear only after confirmation',async()=>{const f=await fixture(new Error('x'));f.node('theme-dark').listeners.click();f.node('tab-status').listeners.click();const entries=readHistory(f.storage);assert.equal(entries.length,1);assert.deepEqual([entries[0].field,entries[0].from,entries[0].to],['theme','system','dark']);assert.match(f.node('history-list').textContent,/Theme: System → Dark/);recordChanges(f.storage,{...defaults},{...defaults,emoji:true});f.node('history-clear').listeners.click();assert.equal(f.node('confirm-dialog').open,true);f.node('confirm-cancel').listeners.click();assert.equal(readHistory(f.storage).length,2);f.node('history-clear').listeners.click();f.node('confirm-first').selected=true;f.node('confirm-first').listeners.change();f.node('confirm-second').selected=true;f.node('confirm-second').listeners.change();f.node('confirm-slider').value=100;f.node('confirm-slider').listeners.change();f.node('confirm-execute').listeners.click();assert.equal(readHistory(f.storage).length,0);assert.equal(f.prefs().theme,'dark');});
test('history keeps only named settings and discards malformed records',()=>{const store={value:null,getItem(){return this.value;},setItem(key,value){this.value=value;}};recordChanges(store,{...defaults},{...defaults,tab:'status',theme:'light'},new Date('2026-10-14T10:00:00Z'));const rows=readHistory(store);assert.deepEqual(rows.map(row=>row.field),['theme']);store.value=JSON.stringify([...rows,{id:'x',at:'2026',field:'session',from:'a',to:'b'},'junk']);assert.equal(readHistory(store).length,1);});
test('collapsed changelog filters keep their criteria and say they are active',async()=>{const f=await fixture(new Error('x'));const filter=f.node('changelog-filter');filter.value='readiness';filter.listeners.input();f.node('filters-toggle').listeners.click();assert.equal(f.node('changelog-filters').hidden,true);assert.equal(f.node('filters-toggle').textContent,'Filters (active)');assert.equal(f.node('changelog-count').textContent,'1 of 2 releases');f.node('filters-toggle').listeners.click();assert.equal(f.node('changelog-filters').hidden,false);assert.equal(filter.value,'readiness');});
test('a local logo is type and size checked before reading and appears beside the heading',async()=>{const f=await fixture(new Error('x'));const pick=file=>{f.node('logo-file').files=[file];f.node('logo-file').listeners.change();};pick({type:'image/gif',size:10});assert.match(f.node('logo-state').textContent,/PNG, JPEG or WebP/);pick({type:'image/png',size:70000});assert.match(f.node('logo-state').textContent,/64 KB or less/);pick({type:'image/png',size:100,dataUrl:'data:image/png;base64,iVBORw0KGgo='});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(readLogo(f.storage),'data:image/png;base64,iVBORw0KGgo=');assert.equal(f.node('workspace-logo').hidden,false);assert.equal(f.node('workspace-logo').alt,'Material File Encryptor');f.node('logo-reset').listeners.click();assert.equal(readLogo(f.storage),'');assert.equal(f.node('workspace-logo').hidden,true);assert.equal(saveLogo(f.storage,'data:text/html;base64,PHA+'),false);});
test('attention modes switch on and off locally and reduced stimulus hides emoji decoration',async()=>{const f=await fixture(new Error('x'));f.node('emoji').selected=true;f.node('emoji').listeners.change();assert.equal(f.node('preview-emoji').hidden,false);f.node('attention-reduced').selected=true;f.node('attention-reduced').listeners.change();assert.equal(f.document.documentElement.dataset.reducedStimulus,'true');assert.equal(f.node('preview-emoji').hidden,true);f.node('attention-focus').selected=true;f.node('attention-focus').listeners.change();assert.equal(f.document.documentElement.dataset.focus,'true');assert.deepEqual(readAttention(f.storage),{focus:true,reducedStimulus:true,guided:false});f.node('attention-reset').listeners.click();assert.deepEqual(readAttention(f.storage),{...attentionDefaults});assert.equal(f.document.documentElement.dataset.focus,'false');});
test('the status tab links to the exact deployed documentation home page',()=>{assert.ok(html.includes('<md-text-button id="docs-link" href="https://ding-ding-projects.github.io/material-file-encryptor/" target="_blank" rel="noopener noreferrer"'));});
test('a new note goes through three steps in a side sheet, validates inline and returns focus',async()=>{const f=await fixture(new Error('x'));let focused='';f.node('note-new').focus=()=>{focused='note-new';};f.node('note-new').listeners.click();assert.equal(f.node('note-sheet').hidden,false);assert.equal(f.node('note-step').textContent,'Step 1 of 3');f.node('note-next').listeners.click();assert.equal(f.node('note-error').textContent,'Enter a title.');f.node('note-title').value='Groceries';f.node('note-title').listeners.input();f.node('note-next').listeners.click();assert.equal(f.node('note-step').textContent,'Step 2 of 3');f.node('note-next').listeners.click();assert.equal(f.node('note-error').textContent,'Write the note before saving.');f.node('note-back').listeners.click();assert.equal(f.node('note-step').textContent,'Step 1 of 3');f.node('note-next').listeners.click();f.node('note-body').value='Milk';f.node('note-body').listeners.input();f.node('note-next').listeners.click();assert.equal(f.node('note-review-title').textContent,'Groceries');f.node('note-next').listeners.click();assert.equal(f.node('note-sheet').hidden,true);assert.equal(focused,'note-new');assert.deepEqual(readNotes(f.storage).map(note=>note.title),['Groceries']);assert.equal(readDraft(f.storage),null);});
test('a cancelled note keeps its draft and restores it on the next new note',async()=>{const f=await fixture(new Error('x'));f.node('note-new').listeners.click();f.node('note-title').value='Half done';f.node('note-title').listeners.input();f.node('note-next').listeners.click();f.node('note-cancel').listeners.click();assert.equal(f.node('note-sheet').hidden,true);assert.deepEqual(readDraft(f.storage),{title:'Half done',body:'',step:2});f.node('note-new').listeners.click();assert.equal(f.node('note-title').value,'Half done');assert.equal(f.node('note-step').textContent,'Step 2 of 3');assert.equal(f.node('note-error').textContent,'A draft was restored.');});
test('selected notes are deleted together only after confirmation, with a per-note summary',async()=>{const f=await fixture(new Error('x'));for(const title of ['A','B','C'])addNote(f.storage,{title,body:title+' body'});f.node('tab-notes').listeners.click();assert.equal(f.node('notes-delete').disabled,true);for(const title of ['A','B']){const box=f.find('md-checkbox','Select '+title);box.checked=true;box.listeners.change();}assert.equal(f.node('notes-status').textContent,'2 of 3 notes selected.');f.node('notes-delete').listeners.click();assert.equal(f.node('confirm-dialog').open,true);f.node('confirm-cancel').listeners.click();assert.equal(readNotes(f.storage).length,3);f.node('notes-delete').listeners.click();f.node('confirm-first').selected=true;f.node('confirm-first').listeners.change();f.node('confirm-second').selected=true;f.node('confirm-second').listeners.change();f.node('confirm-slider').value=100;f.node('confirm-slider').listeners.change();f.node('confirm-execute').listeners.click();assert.equal(readNotes(f.storage).length,1);assert.equal(f.node('notes-status').textContent,'Deleted 2 of 2.');});
test('a personal wording file changes interface copy only, rejects bad files whole and clears back',async()=>{const f=await fixture(new Error('x'));const pick=file=>{f.node('wording-file').files=[file];f.node('wording-file').listeners.change();};pick({size:20,text:'{broken'});await new Promise(resolve=>setTimeout(resolve,0));assert.match(f.node('wording-status').textContent,/not valid JSON. Nothing was changed/);assert.deepEqual(readVocabulary(f.storage),[]);pick({size:60,text:JSON.stringify({schemaVersion:1,entries:{Changelog:'Release notes',Notes:'Jottings'}})});await new Promise(resolve=>setTimeout(resolve,0));assert.match(f.node('wording-status').textContent,/2 wording entries imported/);assert.ok(f.nodesWith('Release notes').filter(item=>item.id.startsWith('copy-')).length>0);f.node('wording-clear').listeners.click();assert.equal(f.node('wording-status').textContent,'Original wording restored.');assert.equal(f.nodesWith('Release notes').filter(item=>item.id.startsWith('copy-')).length,0);});
test('scheduled changes show the time zone, refuse clashes and apply missed changes when the workspace opens',async()=>{const f=await fixture(new Error('x'));assert.match(f.node('schedule-zone').textContent,/time zone: .*UTC[+-]\d\d:\d\d/);f.node('schedule-field').value='theme';f.node('schedule-value').value='dark';f.node('schedule-at').value='2001-01-01T00:00';f.node('schedule-add').listeners.click();assert.equal(f.node('schedule-status').textContent,'Choose a time at least one minute from now.');addSchedule(f.storage,{field:'theme',value:'dark',at:'2099-01-01T00:00:00Z'});f.node('schedule-field').listeners.change();assert.match(f.node('schedule-list').textContent,/Theme → Dark/);f.storage.records.set('mfe-extension-schedules-v1',JSON.stringify([{id:'old1',field:'theme',value:'light',at:'2020-01-01T00:00:00.000Z',createdAt:'2019-12-31T00:00:00.000Z'}]));const g=await fixture(new Error('x'),'en',{records:f.storage.records});assert.equal(g.prefs().theme,'light');assert.match(g.node('schedule-status').textContent,/missed while this workspace was closed/);assert.equal(readSchedules(g.storage).length,0);});
test('offline documentation lists bundled articles, searches them and follows internal links',async()=>{const f=await fixture(new Error('x'));assert.equal(f.node('docs-count').textContent,'2 of 2 articles');assert.match(f.node('docs-article').textContent,/^# Features/);f.node('docs-article').context.open('workspace');assert.match(f.node('docs-article').textContent,/^# Browser extension workspace/);f.node('docs-search').value='schedules';f.node('docs-search').listeners.input();assert.equal(f.node('docs-count').textContent,'1 of 2 articles');const yue=await fixture(new Error('x'),'yue');assert.ok(yue.node('docs-list').textContent.includes('瀏覽器擴充功能工作區'));assert.ok(!yue.node('docs-list').textContent.includes('Browser extension workspace'));const empty=await fixture(new Error('x'),'en',{docsCatalog:null});assert.equal(empty.node('docs-count').textContent,'Documentation is unavailable in this build.');});
test('narration reads the open tab with the chosen rate, stops on request and when the tab changes',async()=>{const spoken=[];const synth={speaking:false,getVoices:()=>[{name:'Hong Kong',lang:'zh-HK'},{name:'London',lang:'en-GB'}],cancel(){spoken.push('cancel');},speak(utterance){spoken.push(utterance.text+'@'+utterance.rate);}};const f=await fixture(new Error('x'),'en',{extras:{speechSynthesis:synth}});assert.match(f.node('narration-voice').textContent,/London \(en-GB\)/);assert.doesNotMatch(f.node('narration-voice').textContent,/Hong Kong/);f.node('narration-rate').value=1.5;f.node('narration-rate').listeners.change();f.node('narration-read').listeners.click();assert.equal(spoken[0],'cancel');assert.match(f.node('narration-status').textContent,/^Reading \d+ items from this tab\.$/);f.node('narration-stop').listeners.click();assert.equal(spoken.at(-1),'cancel');assert.equal(f.node('narration-status').textContent,'Reading stopped.');spoken.length=0;f.node('tab-changelog').listeners.click();assert.deepEqual(spoken,['cancel']);const none=await fixture(new Error('x'));assert.equal(none.node('narration-read').disabled,true);assert.equal(none.node('narration-status').textContent,'Speech is not available in this browser.');});
test('support tickets are created, edited and exported with diagnostics only when chosen',async()=>{const f=await fixture(new Error('x'));f.node('ticket-save').listeners.click();assert.equal(f.node('ticket-status').textContent,'Enter a title.');f.node('ticket-title').value='Pairing fails';f.node('ticket-description').value='The desktop never asks.';f.node('ticket-category').value='problem';f.node('ticket-status-field').value='open';f.node('ticket-save').listeners.click();assert.equal(f.node('ticket-status').textContent,'Saved “Pairing fails”.');const [ticket]=readTickets(f.storage);assert.equal(ticket.diagnostics,false);f.find('md-text-button','')?.listeners;const edit=[...f.nodesWith('Edit')].find(item=>item.localName==='md-text-button');edit.listeners.click();assert.equal(f.node('ticket-title').value,'Pairing fails');f.node('ticket-status-field').value='closed';f.node('ticket-diagnostics').checked=true;f.node('ticket-save').listeners.click();assert.equal(readTickets(f.storage)[0].status,'closed');assert.equal(readTickets(f.storage)[0].diagnostics,true);assert.equal(readTickets(f.storage).length,1);f.node('ticket-file').files=[{name:'tool.exe',type:'application/x-msdownload',size:10}];f.node('ticket-file').listeners.change();assert.equal(f.node('ticket-status').textContent,'Attach PNG, JPEG, WebP, text or JSON files.');assert.match(f.node('ticket-diagnostics-text').textContent,/Source commit: aaaaaaaaaaaa/);});
test('a screen recording starts only from the browser picker and can be saved only after the privacy review',async()=>{const stopped=[];class Recorder{constructor(stream){this.stream=stream;this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:{size:4}});this.onstop();}}let refuse=true;const navigator={mediaDevices:{getDisplayMedia:async()=>{if(refuse)throw new Error('NotAllowedError');return {getTracks:()=>[{stop:()=>stopped.push('track'),addEventListener(){}}]};}}};const f=await fixture(new Error('x'),'en',{extras:{navigator,MediaRecorder:Recorder}});await f.node('recording-start').listeners.click();assert.equal(f.node('recording-status').textContent,'Recording did not start because no tab or window was chosen.');refuse=false;await f.node('recording-start').listeners.click();assert.equal(f.node('recording-stop').disabled,false);f.node('recording-stop').listeners.click();assert.deepEqual(stopped,['track']);assert.equal(f.node('recording-preview').hidden,false);assert.equal(f.node('recording-save').disabled,true);f.node('recording-reviewed').checked=true;f.node('recording-reviewed').listeners.change();assert.equal(f.node('recording-save').disabled,false);f.node('recording-discard').listeners.click();assert.equal(f.node('recording-preview').hidden,true);assert.equal(f.node('recording-status').textContent,'Recording discarded.');});
test('links in notes open only over https, without referrer or opener, and other links say why they stay text',async()=>{const f=await fixture(new Error('x'));addNote(f.storage,{title:'Links',body:'Guide https://example.org/help. Old http://example.org and javascript:alert(1)'});f.node('tab-notes').listeners.click();const link=[...f.nodesWith('https://example.org/help')].find(item=>item.localName==='a');assert.equal(link.href,'https://example.org/help');assert.equal(link.rel,'noopener noreferrer');assert.equal(link.referrerPolicy,'no-referrer');assert.ok(f.nodesWith('http://example.org (only secure https links open)').length>0);assert.ok(f.nodesWith('javascript:alert(1) (only secure https links open)').length>0);assert.ok(!f.nodesWith('javascript:alert(1)').some(item=>item.localName==='a'));});
test('the status tab states plainly that nothing is for sale',()=>{assert.ok(html.includes('There are no purchases, subscriptions or paid features'));});
test('the dim sum catalogue loads only on request without cookies or referrer, labels illustrations honestly and shows missing ones',async()=>{const requests=[];const catalog={title:'Catalog',dishes:[{id:'hk-dish-0001',slug:'har-gow',name:{en:'Classic Har Gow',zhHant:'蝦餃'},jyutping:'haa1 gaau2',category:'steamed-dim-sum',description:{en:'Shrimp dumpling.',yue:'蒸餃。'},ingredients:['shrimp'],allergens:['shellfish'],image:{path:'images/hk-dish-0001-har-gow.png',alt:{en:'Har gow',yue:'蝦餃'}}},{id:'hk-dish-0002',slug:'siu-mai',name:{en:'Siu Mai',zhHant:'燒賣'},jyutping:'siu1 maai2',category:'steamed-dim-sum',description:{en:'Pork dumpling.',yue:'燒賣。'},image:{path:'images/hk-dish-0002-siu-mai.png'}}]};const releases=[{tag_name:'catalog-v1',draft:false,prerelease:false,assets:[{name:'hk-dish-0001-har-gow.png',state:'uploaded',size:10,browser_download_url:'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-har-gow.png'}]}];const fetch=async(url,options)=>{requests.push([url,options.credentials,options.referrerPolicy]);return {ok:true,text:async()=>JSON.stringify(url===CATALOG_URL?catalog:releases)};};const f=await fixture(new Error('x'),'en',{extras:{fetch}});assert.equal(requests.length,0);assert.equal(f.node('dimsum-browser').hidden,true);await f.node('dimsum-load').listeners.click();await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(requests,[[CATALOG_URL,'omit','no-referrer'],[RELEASES_URL,'omit','no-referrer']]);assert.equal(f.node('dimsum-status').textContent,'2 dishes loaded from GitHub.');assert.equal(f.node('dimsum-count').textContent,'2 of 2 dishes');const harGow=[...f.nodesWith('Classic Har Gow')].find(item=>item.localName==='md-list-item');harGow.listeners.click();assert.ok(f.nodesWith('Generated illustration from the public dim sum catalogue (catalog-v1), not a photograph of a real dish.').length>0);const image=[...f.nodesWith('')].find(item=>item.localName==='img'&&item.src?.endsWith('hk-dish-0001-har-gow.png'));assert.equal(image.referrerPolicy,'no-referrer');const siuMai=[...f.nodesWith('Siu Mai')].find(item=>item.localName==='md-list-item');siuMai.listeners.click();assert.ok(f.nodesWith('No illustration has been published for this dish yet.').length>0);f.node('dimsum-search').value='蝦餃';f.node('dimsum-search').listeners.input();assert.equal(f.node('dimsum-count').textContent,'1 of 2 dishes');const offline=await fixture(new Error('x'),'en',{extras:{fetch:async()=>{throw new Error('offline');}}});await offline.node('dimsum-load').listeners.click();await new Promise(resolve=>setTimeout(resolve,0));assert.match(offline.node('dimsum-status').textContent,/could not be loaded/);});


// Models tab: a fake local server stands in for Ollama; nothing here talks to a real installation.
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
const encoded = new TextEncoder();
const finished = chunks => ({ok: true, status: 200, body: new ReadableStream({start(controller) { for (const chunk of chunks) controller.enqueue(encoded.encode(chunk)); controller.close(); }})});
const openStream = () => { let controller; const body = new ReadableStream({start(c) { controller = c; }}); return {response: {ok: true, status: 200, body}, push: text => controller.enqueue(encoded.encode(text)), end: () => controller.close()}; };
const modelServer = ({tags = [{name: 'alpha:latest', size: 4200000000}, {name: 'beta:2b', size: 1500000000}], running = [{name: 'alpha:latest'}], chat = () => finished(['{"message":{"content":"ok"},"done":true}']), pull = () => finished(['{"status":"success"}'])} = {}) => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({url, method: init.method, body: init.body ? JSON.parse(init.body) : null});
    const path = new URL(url).pathname;
    if (path === '/api/version') return finished(['{"version":"0.5.1"}']);
    if (path === '/api/tags') return finished([JSON.stringify({models: tags})]);
    if (path === '/api/ps') return finished([JSON.stringify({models: running})]);
    if (path === '/api/chat') return chat(init);
    if (path === '/api/pull') return pull(init);
    if (path === '/api/delete') return finished([]);
    throw new Error('unexpected request ' + url); };
  return {fetch, calls};
};
const connected = async (server, language = 'en', extras = {}) => { const f = await fixture(new Error('x'), language, {extras: {fetch: server.fetch, ...extras}}); f.node('models-connect').listeners.click(); await settle(); return f; };
const elements = (f, tag) => f.nodesWith('').filter(item => item.localName === tag);

test('the models tab is reachable, remembered and starts without any network request', async () => {
  const server = modelServer();
  const f = await fixture(new Error('x'), 'en', {extras: {fetch: server.fetch}});
  f.node('tab-models').listeners.click();
  assert.equal(f.prefs().tab, 'models');
  assert.equal(f.node('panel-models').hidden, false);
  assert.equal(f.node('models-status').textContent, 'Not connected. Choose Connect to allow access to 127.0.0.1 and check the server.');
  assert.equal(f.node('chat-send').disabled, true);
  assert.equal(f.node('models-pull').disabled, true);
  assert.equal(server.calls.length, 0);
  assert.equal(f.permissionRequests.length, 0);
});

test('connecting asks for the loopback permission first, and a refusal changes nothing and sends nothing', async () => {
  const server = modelServer();
  const f = await fixture(new Error('x'), 'en', {extras: {fetch: server.fetch, grant: false}});
  f.node('models-port').value = '8080';
  f.node('models-connect').listeners.click();
  await settle();
  assert.equal(JSON.stringify(f.permissionRequests), JSON.stringify([{origins: [ORIGIN_PATTERN]}]));
  assert.equal(ORIGIN_PATTERN, 'http://127.0.0.1/*');
  assert.equal(server.calls.length, 0);
  assert.match(f.node('models-status').textContent, /Permission to reach 127\.0\.0\.1 was not granted, so nothing was changed\./);
  assert.equal(f.node('models-refresh').disabled, true);
  assert.equal(f.node('chat-send').disabled, true);
});

test('a bad port is refused before any permission request', async () => {
  const f = await fixture(new Error('x'), 'en', {extras: {fetch: modelServer().fetch}});
  for (const bad of ['80', 'abc', '70000']) { f.node('models-port').value = bad; f.node('models-connect').listeners.click(); await settle(); assert.equal(f.node('models-status').textContent, 'Use a port from 1024 to 65535.'); }
  assert.equal(f.permissionRequests.length, 0);
});

test('a granted connection reads the version, installed and running models from 127.0.0.1 only', async () => {
  const server = modelServer();
  const f = await connected(server);
  assert.equal(f.node('models-status').textContent, 'Connected: server version 0.5.1 on port 11434.');
  assert.ok(server.calls.length >= 3 && server.calls.every(call => call.url.startsWith('http://127.0.0.1:11434/api/')));
  assert.deepEqual(server.calls.map(call => call.method), server.calls.map(() => 'GET'));
  const list = f.node('models-list').textContent;
  assert.ok(list.includes('alpha:latest') && list.includes('4.2 GB') && list.includes('running'));
  assert.ok(list.includes('beta:2b') && list.includes('1.5 GB'));
  assert.equal(list.match(/running/g).length, 1);
  assert.equal(f.node('chat-send').disabled, false);
  assert.equal(f.node('models-refresh').disabled, false);
  assert.equal(f.node('chat-model').value, 'alpha:latest');
});

test('a server that is not running shows a readable state, and the port in use follows the field', async () => {
  const f = await fixture(new Error('x'), 'en', {extras: {fetch: async () => { throw new TypeError('Failed to fetch'); }}});
  f.node('models-port').value = '9090';
  f.node('models-connect').listeners.click();
  await settle();
  assert.equal(f.node('models-status').textContent, 'The local model server is not running on port 9090. Start it, then choose Connect.');
  assert.equal(f.node('chat-send').disabled, true);
  const cantonese = await fixture(new Error('x'), 'yue', {extras: {fetch: async () => { throw new TypeError('Failed to fetch'); }}});
  cantonese.node('models-connect').listeners.click();
  await settle();
  assert.match(cantonese.node('models-status').textContent, /本機模型伺服器冇喺埠 11434 運行/);
});

test('models copy shows Cantonese when chosen and both languages when bilingual', async () => {
  const yue = await connected(modelServer(), 'yue');
  assert.equal(yue.node('models-status').textContent, '已連線：伺服器版本 0.5.1（埠 11434）。');
  assert.ok(yue.node('models-list').textContent.includes('運行中'));
  const both = await connected(modelServer(), 'bilingual');
  assert.ok(both.node('models-status').textContent.includes('Connected: server version 0.5.1'));
  assert.ok(both.node('models-status').textContent.includes('已連線'));
});

test('a pull streams its progress, can be cancelled, and refuses cloud tags', async () => {
  const stream = openStream();
  const server = modelServer({pull: () => stream.response});
  const f = await connected(server);
  f.node('models-pull-name').value = 'llama3.2:3b-cloud';
  f.node('models-pull').listeners.click();
  await settle();
  assert.match(f.node('models-pull-status').textContent, /Cloud models are not supported/);
  assert.equal(server.calls.filter(call => call.url.endsWith('/api/pull')).length, 0);
  f.node('models-pull-name').value = 'llama3.2:3b';
  f.node('models-pull').listeners.click();
  await settle();
  assert.equal(f.node('models-pull-progress').hidden, false);
  assert.equal(f.node('models-pull').disabled, true);
  assert.equal(f.node('models-pull-cancel').disabled, false);
  stream.push('{"status":"pulling abc","total":200,"completed":50}\n');
  await settle();
  assert.equal(f.node('models-pull-progress').value, 0.25);
  assert.equal(f.node('models-pull-progress').indeterminate, false);
  assert.equal(f.node('models-pull-status').textContent, 'Pulling “llama3.2:3b”: pulling abc (25%).');
  stream.push('{"status":"pulling abc","total":200,"completed":150}\n');
  await settle();
  assert.equal(f.node('models-pull-progress').value, 0.75);
  f.node('models-pull-cancel').listeners.click();
  await settle();
  assert.match(f.node('models-pull-status').textContent, /Pull cancelled/);
  assert.equal(f.node('models-pull-progress').hidden, true);
  assert.equal(f.node('models-pull').disabled, false);
  assert.deepEqual(server.calls.find(call => call.url.endsWith('/api/pull')).body, {model: 'llama3.2:3b', stream: true});
  const done = openStream();
  const second = await connected(modelServer({pull: () => done.response}));
  second.node('models-pull-name').value = 'mistral';
  second.node('models-pull').listeners.click();
  await settle();
  done.push('{"status":"success"}\n');
  done.end();
  await settle();
  assert.equal(second.node('models-pull-status').textContent, 'Pulled “mistral”.');
});

test('deleting needs a dialog that names the exact tag, and Cancel is the default action', async () => {
  assert.match(html, /<md-filled-button id="models-delete-cancel"[^>]* autofocus>/);
  const server = modelServer();
  const f = await connected(server);
  const deleteButton = () => f.find('md-text-button', 'Delete alpha:latest');
  deleteButton().listeners.click();
  assert.equal(f.node('models-delete-dialog').open, true);
  assert.ok(f.node('models-delete-text').textContent.includes('“alpha:latest”'));
  assert.equal(server.calls.some(call => call.method === 'DELETE'), false);
  f.node('models-delete-cancel').listeners.click();
  await settle();
  assert.equal(f.node('models-delete-dialog').open, false);
  assert.equal(server.calls.some(call => call.method === 'DELETE'), false);
  f.node('models-delete-confirm').listeners.click();
  await settle();
  assert.equal(server.calls.some(call => call.method === 'DELETE'), false);
  deleteButton().listeners.click();
  f.node('models-delete-confirm').listeners.click();
  await settle();
  const removal = server.calls.find(call => call.method === 'DELETE');
  assert.deepEqual(removal.body, {model: 'alpha:latest'});
  assert.equal(removal.url, 'http://127.0.0.1:11434/api/delete');
  assert.equal(f.node('models-status').textContent, 'Deleted “alpha:latest”.');
});

test('chat streams a reply into safe rich text, with copy actions and a session-only history', async () => {
  const stream = openStream();
  const copied = [];
  const server = modelServer({chat: () => stream.response});
  const f = await connected(server, 'en', {navigator: {clipboard: {writeText: async text => { copied.push(text); }}}});
  f.node('chat-prompt').value = 'Say hello';
  f.node('chat-send').listeners.click();
  await settle();
  assert.equal(f.node('chat-send').disabled, true);
  assert.equal(f.node('chat-stop').disabled, false);
  assert.equal(f.node('chat-prompt').value, '');
  assert.deepEqual(server.calls.find(call => call.url.endsWith('/api/chat')).body, {model: 'alpha:latest', messages: [{role: 'user', content: 'Say hello'}], stream: true});
  stream.push('{"message":{"content":"**Hel"},"done":false}\n');
  await settle();
  stream.push('{"message":{"content":"lo** see [docs](https://example.com/a) and [bad](javascript:alert(1)) <b>x</b>\\n```js\\nlet a = 1;\\n```"},"done":false}\n{"message":{"content":""},"done":true}\n');
  stream.end();
  await settle();
  assert.equal(f.node('chat-send').disabled, false);
  assert.equal(f.node('chat-stop').disabled, true);
  assert.equal(f.node('chat-status').textContent, '2 messages in this conversation. It is kept in this page only and is never saved.');
  assert.ok(elements(f, 'strong').some(item => item.textContent === 'Hello'));
  const anchors = elements(f, 'a');
  assert.ok(anchors.length >= 1);
  assert.deepEqual([...new Set(anchors.map(item => [item.href, item.target, item.rel, item.referrerPolicy, item.textContent].join('|')))], ['https://example.com/a|_blank|noopener noreferrer|no-referrer|docs']);
  assert.ok(f.node('chat-log').textContent.includes('[bad](javascript:alert(1))'));
  assert.ok(f.node('chat-log').textContent.includes('<b>x</b>'));
  assert.equal(elements(f, 'b').length, 0);
  assert.ok(elements(f, 'code').some(item => item.textContent === 'let a = 1;'));
  const copyReply = f.nodesWith('Copy response').find(item => item.localName === 'md-text-button');
  copyReply.listeners.click();
  await settle();
  assert.equal(copied.at(-1), '**Hello** see [docs](https://example.com/a) and [bad](javascript:alert(1)) <b>x</b>\n```js\nlet a = 1;\n```');
  assert.equal(f.node('models-copy-status').textContent, 'Copied to the clipboard.');
  const copyCode = f.nodesWith('Copy code').find(item => item.localName === 'md-text-button');
  copyCode.listeners.click();
  await settle();
  assert.equal(copied.at(-1), 'let a = 1;');
  const stored = [...f.storage.records.values(), f.storage.stored.value, f.storage.history.value ?? ''].join('\n');
  assert.ok(!stored.includes('Say hello') && !stored.includes('Hello'));
  f.node('chat-clear').listeners.click();
  assert.equal(f.node('chat-log').textContent, '');
  assert.equal(f.node('chat-clear').disabled, true);
});

test('a follow-up message sends the whole conversation, Stop keeps the partial reply, and a failed first reply restores the prompt', async () => {
  let stream = openStream();
  const server = modelServer({chat: () => stream.response});
  const f = await connected(server);
  f.node('chat-prompt').value = 'one';
  f.node('chat-send').listeners.click();
  await settle();
  stream.push('{"message":{"content":"partial"},"done":false}\n');
  await settle();
  f.node('chat-stop').listeners.click();
  await settle();
  assert.equal(f.node('chat-status').textContent, 'Stopped. The partial reply is kept.');
  assert.ok(f.node('chat-log').textContent.includes('partial'));
  assert.equal(f.node('chat-send').disabled, false);
  stream = openStream();
  f.node('chat-prompt').value = 'two';
  f.node('chat-send').listeners.click();
  await settle();
  const chats = server.calls.filter(call => call.url.endsWith('/api/chat'));
  assert.deepEqual(chats[1].body.messages, [{role: 'user', content: 'one'}, {role: 'assistant', content: 'partial'}, {role: 'user', content: 'two'}]);
  f.node('chat-stop').listeners.click();
  await settle();
  const broken = await connected(modelServer({chat: () => ({ok: false, status: 503, body: null})}));
  broken.node('chat-prompt').value = 'keep me';
  broken.node('chat-send').listeners.click();
  await settle();
  assert.match(broken.node('chat-status').textContent, /HTTP 503/);
  assert.equal(broken.node('chat-prompt').value, 'keep me');
  assert.equal(broken.node('chat-log').textContent, '');
});

test('chat refuses an empty message and a missing connection before sending anything', async () => {
  const server = modelServer();
  const f = await connected(server);
  const before = server.calls.length;
  f.node('chat-prompt').value = '   ';
  f.node('chat-send').listeners.click();
  await settle();
  assert.equal(f.node('chat-status').textContent, 'Write a message first.');
  assert.equal(server.calls.length, before);
});

test('the renderer builds every node with createElement and textContent, never from markup strings', () => {
  for (const pattern of [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /DOMParser/, /createContextualFragment/, /\.srcdoc/]) assert.doesNotMatch(source, pattern, String(pattern));
  const start = source.indexOf('function richInline'), end = source.indexOf('function copyText');
  assert.ok(start > 0 && end > start);
  const renderer = source.slice(start, end);
  assert.match(renderer, /createElement/);
  assert.match(renderer, /textContent/);
  assert.match(renderer, /rel='noopener noreferrer'/);
  assert.match(renderer, /target='_blank'/);
  assert.match(source, /navigator\.clipboard\.writeText/);
});

test('the Home card, panel, whitelist and shortcut list all include the models section', () => {
  assert.match(html, /<button type="button" class="home-card" id="tab-models" data-tab="models"/);
  assert.match(html, /<section role="tabpanel" id="panel-models"/);
  assert.match(source, /const TAB_SHORTCUTS=\['connection','personalization','changelog','notes','docs','support','dimsum','models','status'\]/);
  for (const id of ['models-port', 'models-connect', 'models-refresh', 'models-list', 'models-pull-name', 'models-pull', 'models-pull-cancel', 'models-pull-progress', 'chat-model', 'chat-prompt', 'chat-send', 'chat-stop', 'models-delete-dialog']) assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(html, /<md-linear-progress id="models-pull-progress"/);
  assert.match(html, /<md-dialog id="models-delete-dialog"/);
});

// Status tab: release code name (network only on request) and feature coverage (bundled record).
const idle = {schemaVersion: 1, profile: 'authenticated', sharedMode: 'inactive', browserPermission: 'unavailable'};
const photoUrl = 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-har-gow.png';
const releaseBody = (commit = 'c'.repeat(40), image = photoUrl) => `Unsigned release from \`${commit}\`.\n\nCode name: Classic Har Gow / 蝦餃. Photo is linked from the authoritative public catalog release.\n\n![Classic Har Gow 蝦餃](${image})\n`;
const releaseFetch = (releases, log, status = 200) => async (url, options) => { log.push([url, options]); return {ok: status < 400, status, text: async () => JSON.stringify(releases)}; };
const imageNodes = f => f.nodesWith('').filter(item => item.localName === 'img');

test('the status tab fetches releases only after the button, with no cookies, referrer or redirects', async () => {
  const log = [];
  const f = await fixture(idle, 'en', {extras: {fetch: releaseFetch([{tag_name: 'v1.2.1', draft: false, prerelease: false, body: releaseBody()}], log)}});
  assert.equal(log.length, 0);
  assert.equal(f.node('release-status').textContent, 'Releases have not been checked in this session.');
  assert.equal(f.node('release-result').hidden, true);
  await f.node('release-check').listeners.click();
  await settle();
  assert.equal(log.length, 1);
  assert.equal(log[0][0], 'https://api.github.com/repos/Ding-Ding-Projects/material-file-encryptor/releases?per_page=30');
  assert.equal(log[0][1].credentials, 'omit');
  assert.equal(log[0][1].referrerPolicy, 'no-referrer');
  assert.equal(log[0][1].redirect, 'error');
  assert.ok(log[0][1].signal, 'a timeout signal is attached');
});

test('a build with no matching release shows the latest release labelled as latest published, never as this build', async () => {
  const log = [];
  const releases = [
    {tag_name: 'v1.9.1', draft: true, prerelease: false, published_at: '2026-10-10T00:00:00Z', body: releaseBody()},
    {tag_name: 'v1.8.1', draft: false, prerelease: true, published_at: '2026-10-09T00:00:00Z', body: releaseBody()},
    {tag_name: 'v1.7.1', draft: false, prerelease: false, published_at: '2026-10-08T00:00:00Z', body: releaseBody()},
  ];
  const f = await fixture(idle, 'en', {extras: {fetch: releaseFetch(releases, log)}});
  await f.node('release-check').listeners.click();
  await settle();
  assert.match(f.node('release-status').textContent, /No published release matches this build \(version 0\.1\.0\)\..*not this build/);
  assert.equal(f.node('release-tag').textContent, 'Latest published (not this build): v1.7.1');
  assert.equal(f.node('release-name').textContent, 'Code name: Classic Har Gow / 蝦餃');
  assert.equal(f.node('release-result').hidden, false);
  assert.equal(f.node('release-link').href, 'https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/tag/v1.7.1');
  const image = imageNodes(f).find(item => item.src === photoUrl);
  assert.ok(image, 'the validated dish photo is shown');
  assert.equal(image.referrerPolicy, 'no-referrer');
  assert.equal(f.node('release-figure').hidden, false);
});

test('a release matching the staged commit is shown as this build, in the chosen language', async () => {
  const log = [];
  const f = await fixture(idle, 'yue', {extras: {fetch: releaseFetch([{tag_name: 'v1.5.1', draft: false, prerelease: false, body: releaseBody('a'.repeat(40))}], log)}});
  await f.node('release-check').listeners.click();
  await settle();
  assert.equal(f.node('release-tag').textContent, '發行版本 v1.5.1');
  assert.equal(f.node('release-name').textContent, '代號：Classic Har Gow / 蝦餃');
  assert.match(f.node('release-status').textContent, /搵到呢個組建對應/);
});

test('an unsafe photo address is never loaded and a release without a code name says so', async () => {
  const log = [];
  const releases = [{tag_name: 'v1.3.1', draft: false, prerelease: false, body: releaseBody('b'.repeat(40), 'https://example.com/tracker.png')}, {tag_name: 'v1.2.1', draft: false, prerelease: false, body: 'No name.'}];
  const f = await fixture(idle, 'en', {extras: {fetch: releaseFetch(releases, log)}});
  await f.node('release-check').listeners.click();
  await settle();
  assert.equal(imageNodes(f).length, 0);
  assert.equal(f.node('release-figure').hidden, true);
  assert.equal(f.node('release-tag').textContent, 'Latest published (not this build): v1.3.1');
  const none = await fixture(idle, 'en', {extras: {fetch: releaseFetch([{tag_name: 'v1.2.1', draft: false, prerelease: false, body: 'No name.'}], [])}});
  await none.node('release-check').listeners.click();
  await settle();
  assert.equal(none.node('release-name').textContent, 'This release lists no code name.');
});

test('offline, rate limited and empty release checks show readable messages and leave the button usable', async () => {
  const offline = await fixture(idle, 'en', {extras: {fetch: async () => { throw new Error('offline'); }}});
  await offline.node('release-check').listeners.click();
  await settle();
  assert.match(offline.node('release-status').textContent, /could not be checked/);
  assert.equal(offline.node('release-check').disabled, false);
  assert.equal(offline.node('release-result').hidden, true);
  const limited = await fixture(idle, 'en', {extras: {fetch: releaseFetch([], [], 429)}});
  await limited.node('release-check').listeners.click();
  await settle();
  assert.match(limited.node('release-status').textContent, /limiting requests/);
  const forbidden = await fixture(idle, 'yue', {extras: {fetch: releaseFetch([], [], 403)}});
  await forbidden.node('release-check').listeners.click();
  await settle();
  assert.match(forbidden.node('release-status').textContent, /限制咗請求/);
  const empty = await fixture(idle, 'en', {extras: {fetch: releaseFetch([], [])}});
  await empty.node('release-check').listeners.click();
  await settle();
  assert.match(empty.node('release-status').textContent, /No published release was found/);
  assert.equal(empty.node('release-result').hidden, true);
  const malformed = await fixture(idle, 'en', {extras: {fetch: async () => ({ok: true, status: 200, text: async () => '{"not":"a list"}'})}});
  await malformed.node('release-check').listeners.click();
  await settle();
  assert.match(malformed.node('release-status').textContent, /could not be checked/);
});

test('feature coverage shows counts, filters by status and searches ids and reasons', async () => {
  const f = await fixture(idle);
  assert.match(f.node('coverage-counts').textContent, /^4 records from commit aaaaaaaaaaaa: 1 missing, 1 not applicable, 2 unverified\.$/);
  assert.equal(f.node('coverage-shown').textContent, 'Showing 4 of 4 records.');
  const list = f.node('coverage-list');
  assert.match(list.textContent, /languageEnglish and Cantonese settings are wired/);
  f.node('coverage-search').value = 'regex';
  f.node('coverage-search').listeners.input();
  assert.equal(f.node('coverage-shown').textContent, 'Showing 1 of 4 records.');
  assert.match(list.textContent, /regex-builder/);
  assert.doesNotMatch(list.textContent, /notifications/);
  f.node('coverage-search').value = 'NON-BLOCKING';
  f.node('coverage-search').listeners.input();
  assert.match(list.textContent, /notifications/);
  f.node('coverage-search').value = '';
  f.node('coverage-status').value = 'unverified';
  f.node('coverage-status').listeners.change();
  assert.equal(f.node('coverage-shown').textContent, 'Showing 2 of 4 records.');
  assert.doesNotMatch(list.textContent, /regex-builder|landing-site/);
  f.node('coverage-search').value = 'nothing matches this';
  f.node('coverage-search').listeners.input();
  assert.equal(f.node('coverage-shown').textContent, 'Showing 0 of 4 records.');
});

test('the coverage status select is populated and its chosen option is selected after it is connected', async () => {
  const f = await fixture(idle);
  const select = f.node('coverage-status');
  const selected = [];
  select.updateComplete = Promise.resolve();
  select.selectIndex = index => selected.push(index);
  select.replaceChildren = (...children) => { select.children = children; };
  f.node('language-yue').listeners.click();
  await settle();
  assert.deepEqual(select.children.map(option => option.value), ['', 'missing', 'not-applicable', 'unverified']);
  assert.deepEqual(selected, [0]);
  select.value = 'missing';
  select.listeners.change();
  f.node('language-en').listeners.click();
  await settle();
  assert.equal(select.value, 'missing');
  assert.deepEqual(selected.at(-1), 1);
  assert.equal(f.node('coverage-shown').textContent, 'Showing 1 of 4 records.');
});

test('coverage statuses are labelled as records, localized, and the note says they are not proof of delivery', async () => {
  const f = await fixture(idle, 'yue');
  assert.match(f.node('coverage-counts').textContent, /4 項紀錄（提交 aaaaaaaaaaaa）/);
  assert.match(f.node('coverage-list').textContent, /未驗證/);
  const note = copyText => html.includes('data-copy="coverageNote"') && source.includes(copyText);
  assert.ok(note('inventory records, not proof of delivery'));
  assert.ok(source.includes('並非已交付嘅證明'));
  const missing = await fixture(idle, 'en', {extras: {coverage: null}});
  assert.equal(missing.node('coverage-counts').textContent, 'The coverage record is unavailable in this build.');
  assert.equal(missing.node('coverage-list').textContent, '');
});

test('the new status sections build elements without markup strings and keep the controls reachable', () => {
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
  for (const id of ['release-check', 'release-status', 'release-result', 'release-tag', 'release-name', 'release-figure', 'release-link', 'coverage-counts', 'coverage-search', 'coverage-status', 'coverage-shown', 'coverage-list']) assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(html, /<md-outlined-button id="release-check"/);
  assert.match(html, /<md-outlined-select id="coverage-status"/);
  assert.match(html, /<md-list id="coverage-list"[^>]*tabindex="0"/);
  assert.match(html, /<a id="release-link"[^>]*rel="noopener noreferrer"/);
  assert.match(source, /redirect:'error'/);
  assert.match(source, /Array\.from\(select\.children\|\|\[\]\)/);
});

test('status section styles respect reduced motion and keep rows inside a narrow window', async () => {
  const css = await fs.readFile(new URL('../browser-extension/options.css', import.meta.url), 'utf8');
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.release-result,\.coverage-row\{animation:none\}\}/);
  assert.match(css, /\.coverage-list\{[^}]*overflow:auto[^}]*\}/);
  assert.match(css, /\.coverage-row \[slot=headline\][^}]*overflow-wrap:anywhere/);
  assert.match(css, /#coverage-search,#coverage-status\{min-inline-size:0;flex:1 1 12rem\}/);
});

// Desktop section of the Status tab: native messaging only, and only after the button.
const desktopAnswer = (update = {}) => ({schemaVersion: 1, lock: 'unlocked', update: {desktopVersion: '0.2.0', availableVersion: null, phase: 'idle', progress: null, ...update}});
const desktopProvenance = (desktopVersion) => ({schemaVersion: 1, version: '0.1.0', desktopVersion, sourceCommit: 'a'.repeat(40), sourceModified: false, stagedAtUtc: '2026-10-14T09:30:00.000Z'});
test('the desktop section asks nothing before Refresh and offers the button', async () => {
  const f = await fixture(idle, 'en', {extras: {desktop: desktopAnswer()}});
  assert.ok(!f.calls.includes('desktop-status'));
  assert.equal(f.node('desktop-state').textContent, 'Desktop status has not been read in this session.');
  assert.equal(f.node('desktop-lock').textContent, 'Desktop lock state: not read');
  assert.equal(f.node('desktop-progress').hidden, true);
  assert.match(html, /<md-outlined-button id="desktop-refresh"/);
  assert.match(html, /<md-linear-progress id="desktop-progress"[^>]*aria-label=/);
});
test('an unpaired browser is told to pair first and shows no desktop values', async () => {
  const f = await fixture(idle, 'en', {extras: {desktop: {paired: false}}});
  await f.node('desktop-refresh').listeners.click();
  assert.deepEqual(f.calls.filter(type => type === 'desktop-status'), ['desktop-status']);
  assert.equal(f.node('desktop-state').textContent, 'Pair the browser first, on the Connection tab.');
  assert.equal(f.node('desktop-version').textContent, 'Desktop version: not read');
  assert.equal(f.node('desktop-progress').hidden, true);
});
test('a matching desktop shows lock state, version and update phase with no mismatch warning', async () => {
  const f = await fixture(idle, 'en', {provenance: desktopProvenance('0.2.0'), extras: {desktop: desktopAnswer()}});
  await f.node('desktop-refresh').listeners.click();
  assert.equal(f.node('desktop-lock').textContent, 'Desktop lock state: unlocked');
  assert.equal(f.node('desktop-version').textContent, 'Desktop version: 0.2.0');
  assert.equal(f.node('desktop-update').textContent, 'Update: nothing in progress');
  assert.equal(f.node('desktop-compat').textContent, 'The extension and the desktop are the same version (0.2.0).');
  assert.equal(f.node('desktop-progress').hidden, true);
});
test('a desktop update shows the progress bar and a version mismatch tells the person where to load the extension again', async () => {
  const f = await fixture(idle, 'en', {provenance: desktopProvenance('0.2.0'), extras: {desktop: desktopAnswer({desktopVersion: '0.3.0', availableVersion: '0.4.0', phase: 'downloading', progress: 0.25})}});
  await f.node('desktop-refresh').listeners.click();
  const bar = f.node('desktop-progress');
  assert.equal(bar.hidden, false);
  assert.equal(bar.value, 0.25);
  assert.equal(bar.indeterminate, false);
  assert.equal(f.node('desktop-update').textContent, 'Update: downloading (version 0.4.0)');
  assert.match(f.node('desktop-compat').textContent, /packaged with desktop 0\.2\.0 but the desktop is now 0\.3\.0/);
  assert.ok(f.node('desktop-compat').textContent.includes('app-0.3.0\\resources\\browser-extension'));
});
test('an unknown progress is indeterminate unless reduced motion is requested, and an unknown packaged version is not guessed', async () => {
  const f = await fixture(idle, 'en', {extras: {desktop: desktopAnswer({phase: 'downloading', progress: null})}});
  await f.node('desktop-refresh').listeners.click();
  assert.equal(f.node('desktop-progress').indeterminate, true);
  assert.match(f.node('desktop-compat').textContent, /packaged with is unknown/);
  const quiet = await fixture(idle, 'en', {extras: {desktop: desktopAnswer({phase: 'downloading', progress: null})}});
  quiet.win.matchMedia = () => ({matches: true});
  quiet.win.matchMedia = query => ({matches: query === '(prefers-reduced-motion: reduce)'});
  await quiet.node('desktop-refresh').listeners.click();
  assert.equal(quiet.node('desktop-progress').hidden, false);
  assert.equal(quiet.node('desktop-progress').indeterminate, false);
  assert.equal(quiet.node('desktop-progress').value, 0);
});
test('desktop answers with extra or malformed fields, and failures, show a plain error state', async () => {
  for (const answer of [{...desktopAnswer(), path: 'C:\\private'}, desktopAnswer({url: 'https://example.invalid'}), desktopAnswer({phase: 'installing'}), desktopAnswer({progress: 3}), desktopAnswer({desktopVersion: '<b>x</b>'}), {...desktopAnswer(), lock: 'maybe'}, new Error('offline'), {error: 'Desktop status did not complete.'}]) {
    const f = await fixture(idle, 'en', {extras: {desktop: answer}});
    await f.node('desktop-refresh').listeners.click();
    assert.equal(f.node('desktop-state').textContent, 'The desktop did not answer. Open and unlock it, pair again and refresh.');
    assert.equal(f.node('desktop-version').textContent, 'Desktop version: not read');
  }
});
test('the desktop section follows the chosen language and the source builds no markup strings', async () => {
  const f = await fixture(idle, 'yue', {provenance: desktopProvenance('0.2.0'), extras: {desktop: desktopAnswer({desktopVersion: '0.3.0'})}});
  await f.node('desktop-refresh').listeners.click();
  assert.equal(f.node('desktop-lock').textContent, '桌面鎖定狀態：已解鎖');
  assert.match(f.node('desktop-compat').textContent, /重新由 app-0\.3\.0/);
  const both = await fixture(idle, 'bilingual', {extras: {desktop: {paired: false}}});
  await both.node('desktop-refresh').listeners.click();
  assert.match(both.node('desktop-state').textContent, /Pair the browser first.*請先喺/);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
});

// Authenticator button on the Connection tab: nothing is sent until the person chooses it.
test('the authenticator button is disabled and explains pairing when unpaired, and sends nothing', async () => {
  const f = await fixture(idle, 'en', {extras: {paired: false}});
  assert.equal(f.node('authenticator-open').disabled, true);
  assert.equal(f.node('authenticator-state').textContent, 'Pair the browser first.');
  await f.node('authenticator-open').listeners.click();
  assert.ok(!f.calls.includes('authenticator-focus'));
  assert.match(html, /<md-outlined-button id="authenticator-open"/);
  assert.match(html, /id="authenticator-state" role="status" aria-live="polite"/);
});
test('a paired browser sees an enabled button and no message is sent before the click', async () => {
  const f = await fixture(idle, 'en');
  assert.equal(f.node('authenticator-open').disabled, false);
  assert.ok(!f.calls.includes('authenticator-focus'));
  assert.equal(f.node('authenticator-state').textContent, 'Ready. Every request needs approval on the desktop.');
  assert.equal(f.node('authenticator-open').textContent, 'Open authenticator on desktop');
});
test('each desktop outcome is rendered in plain words and the button is usable again', async () => {
  const expected = {shown: /now in front/, rejected: /rejected on the desktop/, busy: /already asking a question/, unavailable: /cannot show the authenticator/};
  for (const [state, pattern] of Object.entries(expected)) {
    const f = await fixture(idle, 'en', {extras: {authenticator: {schemaVersion: 1, state}}});
    await f.node('authenticator-open').listeners.click();
    assert.deepEqual(f.calls.filter(type => type === 'authenticator-focus'), ['authenticator-focus']);
    assert.match(f.node('authenticator-state').textContent, pattern);
    assert.equal(f.node('authenticator-open').disabled, false);
  }
  const yue = await fixture(idle, 'yue', {extras: {authenticator: {schemaVersion: 1, state: 'rejected'}}});
  await yue.node('authenticator-open').listeners.click();
  assert.match(yue.node('authenticator-state').textContent, /桌面已拒絕/);
  const both = await fixture(idle, 'bilingual', {extras: {authenticator: {schemaVersion: 1, state: 'busy'}}});
  await both.node('authenticator-open').listeners.click();
  assert.match(both.node('authenticator-state').textContent, /already asking a question.*已經喺度問緊/);
});
test('a malformed, failed or unpaired answer shows a plain failure and never a shown state', async () => {
  for (const extras of [{authenticator: {schemaVersion: 1, state: 'shown', code: '123456'}}, {authenticator: {schemaVersion: 1, state: 'maybe'}}, {authenticator: {schemaVersion: 2, state: 'shown'}}, {authenticator: {error: 'x'}}, {authenticator: new Error('gone')}]) {
    const f = await fixture(idle, 'en', {extras});
    await f.node('authenticator-open').listeners.click();
    assert.equal(f.node('authenticator-state').textContent, 'The request did not complete. Refresh and try again.');
    assert.doesNotMatch(f.node('authenticator-state').textContent, /123456/);
  }
  const unpairedLate = await fixture(idle, 'en', {extras: {authenticator: {paired: false}}});
  await unpairedLate.node('authenticator-open').listeners.click();
  assert.equal(unpairedLate.node('authenticator-state').textContent, 'Pair the browser first.');
});
test('only one authenticator request is in flight and the button is disabled while waiting', async () => {
  let release;
  const f = await fixture(idle, 'en', {extras: {authenticator: () => new Promise(resolve => { release = () => resolve({schemaVersion: 1, state: 'shown'}); })}});
  const first = f.node('authenticator-open').listeners.click();
  await settle();
  assert.equal(f.node('authenticator-open').disabled, true);
  assert.equal(f.node('authenticator-state').textContent, 'Waiting for your answer on the desktop.');
  await f.node('authenticator-open').listeners.click();
  assert.equal(f.calls.filter(type => type === 'authenticator-focus').length, 1);
  release(); await first; await settle();
  assert.match(f.node('authenticator-state').textContent, /now in front/);
  assert.equal(f.node('authenticator-open').disabled, false);
});

// School mode on the Status tab: nothing is sent until the person chooses a button.
test('school mode sends nothing on load, explains pairing and is disabled when unpaired', async () => {
  const f = await fixture(idle, 'en', {extras: {paired: false}});
  assert.equal(f.node('school-read').disabled, true);
  assert.equal(f.node('school-toggle').disabled, true);
  assert.equal(f.node('school-state').textContent, 'Pair the browser first.');
  await f.node('school-read').listeners.click();
  await f.node('school-toggle').listeners.click();
  assert.ok(!f.calls.includes('school-mode-read') && !f.calls.includes('school-mode-set'));
  assert.match(html, /<md-outlined-button id="school-read"/);
  assert.match(html, /id="school-state" role="status" aria-live="polite"/);
  const paired = await fixture(idle, 'en');
  assert.equal(paired.node('school-read').disabled, false);
  assert.equal(paired.node('school-toggle').disabled, true, 'the button waits for a read');
  assert.ok(!paired.calls.includes('school-mode-read') && !paired.calls.includes('school-mode-set'));
  assert.equal(paired.node('school-state').textContent, 'School mode has not been read in this session.');
});
test('reading shows the mode name and state, and the button then offers the opposite change', async () => {
  const f = await fixture(idle, 'en', {extras: {schoolRead: {schemaVersion: 1, enabled: true, name: 'Study time'}}});
  await f.node('school-read').listeners.click(); await settle();
  assert.equal(f.node('school-state').textContent, 'Mode name: Study time. State: on.');
  assert.equal(f.node('school-toggle').textContent, 'Turn off school mode');
  assert.equal(f.node('school-toggle').disabled, false);
  assert.ok(!f.calls.includes('school-mode-set'), 'a read never changes anything');
  const yue = await fixture(idle, 'yue', {extras: {schoolRead: {schemaVersion: 1, enabled: false, name: 'Study time'}}});
  await yue.node('school-read').listeners.click(); await settle();
  assert.equal(yue.node('school-state').textContent, '模式名稱：Study time。狀態：已關閉。');
  assert.equal(yue.node('school-toggle').textContent, '開啟學校模式');
  const both = await fixture(idle, 'bilingual', {extras: {schoolRead: {schemaVersion: 1, enabled: false, name: 'Study time'}}});
  await both.node('school-read').listeners.click(); await settle();
  assert.match(both.node('school-state').textContent, /Mode name: Study time\. State: off\..*模式名稱/);
});
test('each school mode outcome is rendered in plain words and only the click sends the change', async () => {
  const expected = {
    changed: [{schemaVersion: 1, state: 'changed', enabled: true}, /School mode is now on\./],
    unchanged: [{schemaVersion: 1, state: 'unchanged', enabled: false}, /already off. Nothing changed/],
    rejected: [{schemaVersion: 1, state: 'rejected', enabled: false}, /did not confirm the change.*not changed/],
    busy: [{schemaVersion: 1, state: 'busy', enabled: null}, /already asking a question/],
    unavailable: [{schemaVersion: 1, state: 'unavailable', enabled: null}, /cannot ask now/],
  };
  for (const [state, [answer, pattern]] of Object.entries(expected)) {
    const f = await fixture(idle, 'en', {extras: {schoolSet: answer}});
    await f.node('school-read').listeners.click(); await settle();
    assert.equal(f.schoolRequests.length, 0);
    await f.node('school-toggle').listeners.click(); await settle();
    assert.deepEqual(JSON.parse(JSON.stringify(f.schoolRequests)), [{type: 'school-mode-set', enabled: true}], state);
    assert.match(f.node('school-state').textContent, pattern, state);
    assert.equal(f.node('school-toggle').disabled, false);
  }
  const yue = await fixture(idle, 'yue', {extras: {schoolSet: {schemaVersion: 1, state: 'rejected', enabled: false}}});
  await yue.node('school-read').listeners.click(); await settle();
  await yue.node('school-toggle').listeners.click(); await settle();
  assert.match(yue.node('school-state').textContent, /桌面冇確認/);
});
test('a malformed, failed or unpaired school mode answer shows a plain failure and never a changed state', async () => {
  for (const schoolSet of [{schemaVersion: 1, state: 'changed', enabled: true, token: 'x'}, {schemaVersion: 1, state: 'maybe', enabled: true}, {schemaVersion: 2, state: 'changed', enabled: true}, {schemaVersion: 1, state: 'changed', enabled: 'yes'}, {error: 'x'}, new Error('gone')]) {
    const f = await fixture(idle, 'en', {extras: {schoolSet}});
    await f.node('school-read').listeners.click(); await settle();
    await f.node('school-toggle').listeners.click(); await settle();
    assert.equal(f.node('school-state').textContent, 'The request did not complete. Refresh and try again.');
  }
  for (const schoolRead of [{schemaVersion: 1, enabled: 'yes', name: 'x'}, {schemaVersion: 1, enabled: true, name: ''}, {schemaVersion: 1, enabled: true, name: 'a'.repeat(81)}, {schemaVersion: 1, enabled: true, name: 'bad\u0007name'}, {schemaVersion: 1, enabled: true, name: 'x', path: 'C:'}, new Error('gone')]) {
    const f = await fixture(idle, 'en', {extras: {schoolRead}});
    await f.node('school-read').listeners.click(); await settle();
    assert.match(f.node('school-state').textContent, /could not be read/);
    assert.equal(f.node('school-toggle').disabled, true);
  }
  const late = await fixture(idle, 'en', {extras: {schoolRead: {paired: false}}});
  await late.node('school-read').listeners.click(); await settle();
  assert.equal(late.node('school-state').textContent, 'Pair the browser first.');
});
test('only one school mode change is in flight and the controls are disabled while waiting', async () => {
  let release;
  const f = await fixture(idle, 'en', {extras: {schoolSet: () => new Promise(resolve => { release = () => resolve({schemaVersion: 1, state: 'changed', enabled: true}); })}});
  await f.node('school-read').listeners.click(); await settle();
  const first = f.node('school-toggle').listeners.click();
  await settle();
  assert.equal(f.node('school-toggle').disabled, true);
  assert.equal(f.node('school-read').disabled, true);
  assert.equal(f.node('school-state').textContent, 'Waiting for you on the desktop.');
  await f.node('school-toggle').listeners.click();
  assert.equal(f.schoolRequests.length, 1);
  release(); await first; await settle();
  assert.match(f.node('school-state').textContent, /now on/);
  assert.equal(f.node('school-toggle').textContent, 'Turn off school mode');
});
test('the school mode code writes no markup, storage or credential handling', () => {
  const schoolCode = source.slice(source.indexOf('function renderSchoolMode'), Math.min(source.indexOf('const VERSION_PATTERN'), source.indexOf('// Unlock level (Status tab). The desktop owns')));
  assert.ok(schoolCode.length > 500);
  assert.doesNotMatch(schoolCode, /storage|innerHTML|insertAdjacentHTML|outerHTML|document\.write|password\b.*=|credential/i);
});

// Locks on the Status tab: the desktop owns every lock and nothing is sent until the person chooses a button.
const openStatus = async (f) => { await f.node('tab-status').listeners.click(); await settle(); };
test('locks send nothing on load, are shown on the Status tab only and are disabled when unpaired', async () => {
  const f = await fixture(idle, 'en', {extras: {paired: false}});
  assert.match(html, /<section id="locks-section" aria-labelledby="locks-heading" hidden>/);
  assert.match(html, /<md-outlined-button id="locks-read" disabled>/);
  assert.match(html, /id="locks-state" role="status" aria-live="polite"/);
  for (const tab of ['connection', 'personalization', 'changelog', 'notes', 'docs', 'support', 'dimsum', 'models', 'status']) assert.match(html, new RegExp('<md-outlined-button id="lock-' + tab + '-lock" disabled>'));
  assert.equal(f.node('locks-section').hidden, true, 'the Locks section belongs to the Status tab');
  await openStatus(f);
  assert.equal(f.node('locks-section').hidden, false);
  assert.equal(f.node('locks-read').disabled, true);
  assert.equal(f.node('locks-state').textContent, 'Pair the browser first.');
  await f.node('locks-read').listeners.click();
  await f.node('lock-notes-lock').listeners.click();
  assert.deepEqual(f.calls.filter(type => type.startsWith('element-lock')), []);
  const paired = await fixture(idle, 'en'); await openStatus(paired);
  assert.equal(paired.node('locks-read').disabled, false);
  for (const tab of ['connection', 'notes', 'status']) { assert.equal(paired.node('lock-' + tab + '-lock').disabled, true, 'locking waits for a read'); assert.equal(paired.node('lock-' + tab + '-unlock').disabled, true); }
  assert.deepEqual(paired.calls.filter(type => type.startsWith('element-lock')), [], 'nothing is sent by being paired or by opening the tab');
  assert.equal(paired.node('locks-state').textContent, 'Locks have not been read in this session.');
});
test('reading marks locked tabs disabled with an accessible name, and only a button press sends a change', async () => {
  const f = await fixture(idle, 'en', {extras: {locksRead: {schemaVersion: 1, locked: ['notes', 'docs']}}}); await openStatus(f);
  await f.node('locks-read').listeners.click(); await settle();
  assert.equal(f.node('locks-state').textContent, 'Locked tabs: 2 of 9.');
  assert.equal(f.node('lock-notes-state').textContent, 'Locked'); assert.equal(f.node('lock-models-state').textContent, 'Unlocked');
  assert.equal(f.attributes.get('tab-notes:aria-disabled'), 'true'); assert.equal(f.attributes.get('tab-models:aria-disabled'), 'false');
  assert.equal(f.attributes.get('tab-notes:aria-label'), 'Notes, locked by the desktop');
  assert.equal(f.node('lock-mark-notes').textContent, '🔒', 'a visible lock indicator on the card'); assert.equal(f.node('lock-mark-notes').hidden, false);
  assert.equal(f.node('lock-mark-models').textContent, ''); assert.equal(f.node('lock-mark-models').hidden, true);
  assert.equal(f.attributes.has('tab-models:aria-label'), false);
  assert.equal(f.attributes.get('tab-models:aria-labelledby'), 'title-models', 'an unlocked card is named by its title');
  assert.equal(f.attributes.has('tab-notes:aria-labelledby'), false, 'a locked card is named by its locked label instead');
  assert.match(f.node('desc-notes').textContent, /Locked by the desktop/);
  assert.equal(f.node('lock-notes-lock').disabled, true); assert.equal(f.node('lock-notes-unlock').disabled, false);
  assert.equal(f.node('lock-models-lock').disabled, false); assert.equal(f.node('lock-models-unlock').disabled, true);
  assert.equal(f.node('lock-status-lock').disabled, true, 'the tab that holds the controls cannot be locked from here');
  assert.equal(f.attributes.get('lock-models-lock:aria-label'), 'Lock the Models tab');
  assert.equal(f.attributes.get('lock-notes-unlock:aria-label'), 'Unlock the Notes tab');
  assert.equal(f.lockRequests.length, 0, 'a read never changes anything');
  await f.node('lock-models-lock').listeners.click(); await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(f.lockRequests)), [{type: 'element-lock-set', target: 'models', locked: true}]);
  assert.equal(f.node('lock-models-state').textContent, 'Locked');
  assert.equal(f.node('locks-state').textContent, 'The Models tab is now locked by the desktop.');
  await f.node('lock-docs-unlock').listeners.click(); await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(f.lockRequests.at(-1))), {type: 'element-lock-set', target: 'docs', locked: false});
  assert.equal(f.lockRequests.length, 2);
});
test('selecting a locked tab shows the explanation instead of its panel, and the Locks section stays reachable when Status itself is locked', async () => {
  const f = await fixture(idle, 'en', {extras: {locksRead: {schemaVersion: 1, locked: ['notes', 'status']}}}); await openStatus(f);
  await f.node('locks-read').listeners.click(); await settle();
  assert.equal(f.node('locked-note').hidden, false, 'Status is locked, so it shows the explanation');
  assert.equal(f.node('panel-status').hidden, true);
  assert.equal(f.node('locks-section').hidden, false, 'the Locks section is not inside the locked panel');
  assert.match(f.node('locked-text').textContent, /Locks section stays available/);
  assert.equal(f.node('locks-read').disabled, false);
  await f.node('tab-notes').listeners.click(); await settle();
  assert.equal(f.node('locked-note').hidden, false); assert.equal(f.node('panel-notes').hidden, true);
  assert.equal(f.node('locked-heading').textContent, 'Notes is locked');
  assert.match(f.node('locked-text').textContent, /Open the Status tab/);
  assert.equal(f.node('locks-section').hidden, true);
  await f.node('tab-changelog').listeners.click(); await settle();
  assert.equal(f.node('locked-note').hidden, true); assert.equal(f.node('panel-changelog').hidden, false);
  const yue = await fixture(idle, 'yue', {extras: {locksRead: {schemaVersion: 1, locked: ['notes']}}}); await openStatus(yue);
  await yue.node('locks-read').listeners.click(); await settle();
  assert.equal(yue.attributes.get('tab-notes:aria-label'), '筆記，已由桌面鎖定');
  assert.equal(yue.node('locks-state').textContent, '已鎖定分頁：1 / 9。');
});
test('each lock outcome is shown in plain words and a refused change leaves the list as the desktop reported it', async () => {
  const cases = [['unchanged', true, /was already locked\. Nothing changed/], ['rejected', false, /did not confirm|only be changed on the desktop/], ['busy', null, /already asking a question/], ['unavailable', null, /cannot ask now/]];
  for (const [state, locked, pattern] of cases) {
    const f = await fixture(idle, 'en', {extras: {locksRead: {schemaVersion: 1, locked: []}, lockSet: {schemaVersion: 1, state, target: 'dimsum', locked}}}); await openStatus(f);
    await f.node('locks-read').listeners.click(); await settle();
    await f.node('lock-dimsum-lock').listeners.click(); await settle();
    assert.match(f.node('locks-state').textContent, pattern, state);
    assert.equal(f.node('lock-dimsum-state').textContent, locked === true ? 'Locked' : 'Unlocked', state);
    assert.equal(f.node('locks-stale').hidden, locked !== null, state + ' staleness');
  }
  const yue = await fixture(idle, 'yue', {extras: {locksRead: {schemaVersion: 1, locked: ['support']}, lockSet: {schemaVersion: 1, state: 'rejected', target: 'support', locked: true}}}); await openStatus(yue);
  await yue.node('locks-read').listeners.click(); await settle(); await yue.node('lock-support-unlock').listeners.click(); await settle();
  assert.match(yue.node('locks-state').textContent, /桌面冇確認/);
});
test('malformed, mismatched or failed lock answers show a plain failure and never a changed state', async () => {
  for (const lockSet of [{schemaVersion: 1, state: 'changed', target: 'notes', locked: true, token: 'x'}, {schemaVersion: 1, state: 'maybe', target: 'notes', locked: true}, {schemaVersion: 2, state: 'changed', target: 'notes', locked: true}, {schemaVersion: 1, state: 'changed', target: 'docs', locked: true}, {schemaVersion: 1, state: 'changed', target: 'notes', locked: null}, {schemaVersion: 1, state: 'changed', target: 'notes', locked: 'yes'}, {schemaVersion: 1, state: 'changed', target: 'notes'}, new Error('fixture unavailable')]) {
    const f = await fixture(idle, 'en', {extras: {locksRead: {schemaVersion: 1, locked: []}, lockSet}}); await openStatus(f);
    await f.node('locks-read').listeners.click(); await settle();
    await f.node('lock-notes-lock').listeners.click(); await settle();
    assert.equal(f.node('locks-state').textContent, 'The request did not complete. Refresh and try again.', JSON.stringify(lockSet));
    assert.equal(f.node('lock-notes-state').textContent, 'Unlocked'); assert.equal(f.attributes.get('tab-notes:aria-disabled'), 'false');
  }
  for (const locksRead of [{schemaVersion: 1, locked: ['popup']}, {schemaVersion: 1, locked: ['notes', 'notes']}, {schemaVersion: 1, locked: 'notes'}, {schemaVersion: 1, locked: [], path: 'C:'}, {schemaVersion: 2, locked: []}, new Error('fixture unavailable')]) {
    const f = await fixture(idle, 'en', {extras: {locksRead}}); await openStatus(f);
    await f.node('locks-read').listeners.click(); await settle();
    assert.match(f.node('locks-state').textContent, /Locks could not be read/);
    assert.equal(f.node('lock-notes-lock').disabled, true, 'no lock controls without a successful read');
  }
  const late = await fixture(idle, 'en', {extras: {locksRead: {paired: false}}}); await openStatus(late);
  await late.node('locks-read').listeners.click(); await settle();
  assert.equal(late.node('locks-state').textContent, 'Pair the browser first.');
});
test('when the desktop cannot be reached the last read is kept in memory only and is marked as possibly stale', async () => {
  let reads = 0;
  const f = await fixture(idle, 'en', {extras: {locksRead: () => { reads++; if (reads > 1) throw new Error('desktop gone'); return {schemaVersion: 1, locked: ['support']}; }}}); await openStatus(f);
  await f.node('locks-read').listeners.click(); await settle();
  assert.equal(f.node('locks-stale').hidden, true);
  await f.node('locks-read').listeners.click(); await settle();
  assert.equal(f.node('locks-stale').hidden, false);
  assert.match(f.node('locks-stale').textContent, /may be out of date/);
  assert.equal(f.node('lock-support-state').textContent, 'Locked', 'the last read is kept');
  assert.equal(f.attributes.get('tab-support:aria-disabled'), 'true');
  assert.equal(f.node('lock-support-unlock').disabled, false, 'a later successful read is still possible');
  const stored = JSON.stringify([...f.storage.records.entries()]) + f.storage.stored.value + String(f.storage.history.value);
  assert.ok(!/support|element-lock|lock/i.test(stored.replace(/"tab":"[a-z]+"/g, '')), 'nothing about locks is stored');
});
test('only one lock change is in flight and the controls are disabled while waiting', async () => {
  let release;
  const f = await fixture(idle, 'en', {extras: {locksRead: {schemaVersion: 1, locked: []}, lockSet: () => new Promise(resolve => { release = () => resolve({schemaVersion: 1, state: 'changed', target: 'notes', locked: true}); })}}); await openStatus(f);
  await f.node('locks-read').listeners.click(); await settle();
  const first = f.node('lock-notes-lock').listeners.click(); await settle();
  assert.equal(f.node('locks-read').disabled, true); assert.equal(f.node('lock-docs-lock').disabled, true); assert.equal(f.node('lock-notes-lock').disabled, true);
  assert.equal(f.node('locks-state').textContent, 'Waiting for you on the desktop.');
  await f.node('lock-docs-lock').listeners.click();
  assert.equal(f.lockRequests.length, 1);
  release(); await first; await settle();
  assert.equal(f.node('lock-notes-state').textContent, 'Locked');
});
test('the lock code writes no markup, storage or credential handling and the extension never unlocks locally', () => {
  const lockCode = source.slice(source.indexOf('function plainName'), Math.min(source.indexOf('const VERSION_PATTERN'), source.indexOf('// Unlock level (Status tab). The desktop owns')));
  assert.ok(lockCode.length > 2000);
  assert.doesNotMatch(lockCode, /storage|innerHTML|insertAdjacentHTML|outerHTML|document\.write|password\b.*=|credential/i);
  const sends = lockCode.match(/sendMessage\(\{type:'[a-z-]+'/g) || [];
  assert.deepEqual(sends.sort(), ["sendMessage({type:'element-lock-set'", "sendMessage({type:'element-locks-read'"]);
});

// Unlock level on the Status tab: the desktop owns the ladder and nothing is sent until the person chooses a button.
const ladderLevels = ['level-0', 'level-1', 'level-2', 'level-3', 'level-4'];
const ladderRead = (level = 'level-2', cooldownUntil = null, recovery = 'none') => ({schemaVersion: 1, level, levels: ladderLevels, cooldownUntil, recovery});
test('the unlock level sends nothing on load, belongs to the Status tab and is disabled when unpaired', async () => {
  const f = await fixture(idle, 'en', {extras: {paired: false}});
  assert.match(html, /<section id="ladder-section" aria-labelledby="ladder-heading" hidden>/);
  assert.match(html, /<md-outlined-button id="ladder-read" disabled>/);
  assert.match(html, /<md-outlined-button id="ladder-step" disabled>/);
  assert.match(html, /<md-linear-progress id="ladder-progress" max="1" value="0" hidden>/);
  assert.equal(f.node('ladder-section').hidden, true);
  await openStatus(f);
  assert.equal(f.node('ladder-section').hidden, false);
  assert.equal(f.node('ladder-read').disabled, true); assert.equal(f.node('ladder-step').disabled, true);
  assert.equal(f.node('ladder-state').textContent, 'Pair the browser first.');
  await f.node('ladder-read').listeners.click(); await f.node('ladder-step').listeners.click();
  assert.deepEqual(f.calls.filter(type => type.startsWith('unlock-')), []);
  const paired = await fixture(idle, 'en'); await openStatus(paired);
  assert.equal(paired.node('ladder-read').disabled, false); assert.equal(paired.node('ladder-step').disabled, true, 'the step waits for a read');
  assert.deepEqual(paired.calls.filter(type => type.startsWith('unlock-')), [], 'nothing is sent by being paired or by opening the tab');
  assert.equal(paired.node('ladder-state').textContent, 'The unlock level has not been read in this session.');
});
test('reading shows the level among the ladder with a linear progress position, and sending the step waits for the button', async () => {
  const f = await fixture(idle, 'en', {extras: {ladderRead: ladderRead('level-3')}}); await openStatus(f);
  await f.node('ladder-read').listeners.click(); await settle();
  assert.equal(f.node('ladder-state').textContent, 'Unlock level 3 of 4.');
  assert.equal(f.node('ladder-progress').hidden, false); assert.equal(f.node('ladder-progress').value, 0.75);
  assert.equal(f.attributes.get('ladder-progress:aria-label'), 'Unlock level 3 of 4');
  assert.equal(f.node('ladder-recovery').hidden, false); assert.equal(f.node('ladder-recovery').textContent, 'No recovery is needed.');
  assert.equal(f.node('ladder-cooldown').hidden, true);
  assert.equal(f.node('ladder-step').disabled, false);
  assert.equal(f.ladderRequests.length, 0, 'a read never asks for a step');
  await f.node('ladder-step').listeners.click(); await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(f.ladderRequests)), [{type: 'unlock-step-request'}]);
  assert.equal(f.node('ladder-state').textContent, 'There is no further step. The desktop has not escalated.', 'the fixture default answer is complete');
});
test('a cooling desktop shows a countdown and the step stays disabled, and recovery states are shown', async () => {
  const f = await fixture(idle, 'en', {extras: {ladderRead: ladderRead('level-2', Date.now() + 90000, 'available')}}); await openStatus(f);
  await f.node('ladder-read').listeners.click(); await settle();
  assert.equal(f.node('ladder-cooldown').hidden, false);
  assert.match(f.node('ladder-cooldown').textContent, /^Cooling down: 1:(2\d|30) left\.$/);
  assert.equal(f.node('ladder-step').disabled, true, 'a running cooldown is never skipped from the browser');
  assert.equal(f.node('ladder-recovery').textContent, 'Recovery is available on the desktop.');
  await f.node('ladder-step').listeners.click();
  assert.equal(f.ladderRequests.length, 0);
  const required = await fixture(idle, 'en', {extras: {ladderRead: ladderRead('level-1', null, 'required')}}); await openStatus(required);
  await required.node('ladder-read').listeners.click(); await settle();
  assert.equal(required.node('ladder-recovery').textContent, 'Recovery is required. Use the desktop.');
  const yue = await fixture(idle, 'yue', {extras: {ladderRead: ladderRead('level-1', Date.now() + 61000, 'none')}}); await openStatus(yue);
  await yue.node('ladder-read').listeners.click(); await settle();
  assert.equal(yue.node('ladder-state').textContent, '解鎖級別 1 / 4。');
  assert.match(yue.node('ladder-cooldown').textContent, /^冷卻中：仲有 1:0\d。$/);
  assert.equal(yue.node('ladder-recovery').textContent, '唔需要復原。');
});
test('each step outcome is shown in plain words and the level follows the desktop answer', async () => {
  const cases = [['advanced', 'level-0', null, /unlock level went down/], ['cooldown', 'level-3', Date.now() + 60000, /cooling down/], ['rejected', 'level-3', null, /did not confirm the step/], ['busy', null, null, /already asking a question/], ['unavailable', null, null, /cannot ask now/], ['complete', 'level-0', null, /no further step/]];
  for (const [state, level, cooldownUntil, pattern] of cases) {
    const f = await fixture(idle, 'en', {extras: {ladderRead: ladderRead('level-3'), ladderStep: {schemaVersion: 1, state, level, cooldownUntil}}}); await openStatus(f);
    await f.node('ladder-read').listeners.click(); await settle();
    await f.node('ladder-step').listeners.click(); await settle();
    assert.match(f.node('ladder-state').textContent, pattern, state);
    assert.equal(f.node('ladder-stale').hidden, level !== null, state + ' staleness');
    if (level) assert.equal(f.node('ladder-progress').value, ladderLevels.indexOf(level) / 4, state + ' position');
  }
  const yue = await fixture(idle, 'yue', {extras: {ladderRead: ladderRead('level-3'), ladderStep: {schemaVersion: 1, state: 'rejected', level: 'level-3', cooldownUntil: null}}}); await openStatus(yue);
  await yue.node('ladder-read').listeners.click(); await settle(); await yue.node('ladder-step').listeners.click(); await settle();
  assert.match(yue.node('ladder-state').textContent, /桌面冇確認呢一步/);
});
test('malformed, mismatched or failed ladder answers show a plain failure and never an advanced state', async () => {
  for (const ladderStep of [{schemaVersion: 1, state: 'advanced', level: 'level-0', cooldownUntil: null, token: 'x'}, {schemaVersion: 1, state: 'maybe', level: 'level-0', cooldownUntil: null}, {schemaVersion: 2, state: 'advanced', level: 'level-0', cooldownUntil: null}, {schemaVersion: 1, state: 'advanced', level: 'level-9', cooldownUntil: null}, {schemaVersion: 1, state: 'advanced', level: 'level-0', cooldownUntil: -4}, {schemaVersion: 1, state: 'advanced', level: 7, cooldownUntil: null}, {schemaVersion: 1, state: 'advanced', level: 'level-0'}, new Error('fixture unavailable')]) {
    const f = await fixture(idle, 'en', {extras: {ladderRead: ladderRead('level-3'), ladderStep}}); await openStatus(f);
    await f.node('ladder-read').listeners.click(); await settle();
    await f.node('ladder-step').listeners.click(); await settle();
    assert.equal(f.node('ladder-state').textContent, 'The request did not complete. Refresh and try again.', JSON.stringify(ladderStep));
    assert.equal(f.node('ladder-progress').value, 0.75, 'the level is unchanged by a bad answer');
  }
  for (const reading of [{schemaVersion: 1, level: 'level-9', levels: ladderLevels, cooldownUntil: null, recovery: 'none'}, {schemaVersion: 1, level: 'level-1', levels: ['level-1'], cooldownUntil: null, recovery: 'none'}, {schemaVersion: 1, level: 'level-1', levels: ['level-1', 'level-1'], cooldownUntil: null, recovery: 'none'}, {schemaVersion: 1, level: 'level-1', levels: ladderLevels, cooldownUntil: 0, recovery: 'none'}, {schemaVersion: 1, level: 'level-1', levels: ladderLevels, cooldownUntil: null, recovery: 'maybe'}, {schemaVersion: 1, level: 'level-1', levels: ladderLevels, cooldownUntil: null, recovery: 'none', path: 'C:'}, {schemaVersion: 2, level: 'level-1', levels: ladderLevels, cooldownUntil: null, recovery: 'none'}, new Error('fixture unavailable')]) {
    const f = await fixture(idle, 'en', {extras: {ladderRead: reading}}); await openStatus(f);
    await f.node('ladder-read').listeners.click(); await settle();
    assert.match(f.node('ladder-state').textContent, /could not be read/, JSON.stringify(reading));
    assert.equal(f.node('ladder-step').disabled, true, 'no step without a successful read');
    assert.equal(f.node('ladder-progress').hidden, true);
  }
  const late = await fixture(idle, 'en', {extras: {ladderRead: {paired: false}}}); await openStatus(late);
  await late.node('ladder-read').listeners.click(); await settle();
  assert.equal(late.node('ladder-state').textContent, 'Pair the browser first.');
});
test('when the desktop cannot be reached the last unlock level is kept in memory only and marked as possibly stale', async () => {
  let reads = 0;
  const f = await fixture(idle, 'en', {extras: {ladderRead: () => { reads++; if (reads > 1) throw new Error('desktop gone'); return ladderRead('level-2'); }}}); await openStatus(f);
  await f.node('ladder-read').listeners.click(); await settle();
  assert.equal(f.node('ladder-stale').hidden, true);
  await f.node('ladder-read').listeners.click(); await settle();
  assert.equal(f.node('ladder-stale').hidden, false);
  assert.match(f.node('ladder-stale').textContent, /may be out of date/);
  assert.equal(f.node('ladder-state').textContent, 'Unlock level 2 of 4.', 'the last read is kept');
  assert.equal(f.node('ladder-read').disabled, false, 'a later successful read is still possible');
  const stored = JSON.stringify([...f.storage.records.entries()]) + f.storage.stored.value + String(f.storage.history.value);
  assert.ok(!/level-|ladder|cooldown/i.test(stored), 'nothing about the ladder is stored');
});
test('only one ladder request is in flight and the controls are disabled while waiting', async () => {
  let release;
  const f = await fixture(idle, 'en', {extras: {ladderRead: ladderRead('level-2'), ladderStep: () => new Promise(resolve => { release = () => resolve({schemaVersion: 1, state: 'advanced', level: 'level-0', cooldownUntil: null}); })}}); await openStatus(f);
  await f.node('ladder-read').listeners.click(); await settle();
  const first = f.node('ladder-step').listeners.click(); await settle();
  assert.equal(f.node('ladder-read').disabled, true); assert.equal(f.node('ladder-step').disabled, true); assert.equal(f.node('lock-notes-lock').disabled, true);
  assert.equal(f.node('ladder-state').textContent, 'Waiting for you on the desktop.');
  await f.node('ladder-step').listeners.click();
  assert.equal(f.ladderRequests.length, 1);
  release(); await first; await settle();
  assert.equal(f.node('ladder-state').textContent, 'The desktop confirmed you and the unlock level went down.');
  assert.equal(f.node('ladder-step').disabled, true, 'nothing is left to climb at level 0');
});
test('the ladder code writes no markup, storage or credential handling and only the two reviewed messages are sent', () => {
  const start = source.indexOf('function stopLadderTimer'), ladderCode = source.slice(start, start + 9000);
  assert.ok(ladderCode.includes("sendMessage({type:'unlock-step-request'"));
  const section = ladderCode.slice(0, ladderCode.indexOf("$('ladder-step').addEventListener") + 1800);
  assert.doesNotMatch(section, /storage|innerHTML|insertAdjacentHTML|outerHTML|document\.write|password\b.*=|credential|setInterval/i);
  const sends = section.match(/sendMessage\(\{type:'[a-z-]+'/g) || [];
  assert.deepEqual([...new Set(sends)].sort(), ["sendMessage({type:'unlock-ladder-read'", "sendMessage({type:'unlock-step-request'"]);
  assert.ok(source.includes('ladderTimer?.unref?.()'), 'the countdown timer does not keep a page alive');
});

// Home: the page opens on a grid of section cards instead of a tab bar, and each section opens full width under a compact app bar.
const SECTIONS = ['connection', 'personalization', 'changelog', 'notes', 'docs', 'support', 'dimsum', 'models', 'status'];
const fakeHistory = (hash = '') => {
  const location = {hash, pathname: '/options.html', search: ''}, calls = [];
  const history = {pushState: (state, title, url) => { calls.push(['push', state.tab, url]); }, replaceState: (state, title, url) => { calls.push(['replace', state.tab, url]); }};
  return {location, history, calls};
};
const home = f => ({home: f.node('home-view').hidden === false, back: f.node('home-back').hidden === false, title: f.node('section-title').textContent, heading: f.node('workspace-heading').hidden === false});

test('the page has a Home grid with one card per section and no tab bar', () => {
  assert.doesNotMatch(html, /<md-tabs|<md-primary-tab/);
  const cards = [...html.matchAll(/<button type="button" class="home-card" id="tab-([a-z]+)" data-tab="([a-z]+)"[^>]*>(.*?)<\/button>/g)];
  assert.deepEqual(cards.map(match => match[1]), SECTIONS, 'cards follow the Alt+1 to Alt+9 order');
  for (const [, id, tab, body] of cards) {
    assert.equal(id, tab);
    assert.match(body, /<svg viewBox="0 0 24 24"[^>]*><path d="[^"]+"\/><\/svg>/, id + ' has an icon');
    assert.match(body, new RegExp('data-copy="' + id + '"'), id + ' has a name');
    assert.match(body, new RegExp('data-copy="' + id + 'Desc"'), id + ' has a one line description');
    assert.match(source, new RegExp(id + 'Desc:\\[\'[^\']+\',\'[^\']+\'\\]'), id + ' description is bilingual');
    assert.match(html, new RegExp('<section role="tabpanel" id="panel-' + id + '" aria-labelledby="section-title"'));
  }
  assert.match(html, /<md-icon-button id="home-back" type="button" hidden>/);
  assert.match(html, /<md-outlined-button id="palette-open"/);
  assert.match(html, /<mfe-search id="search"/);
});

test('the workspace starts on Home with every section closed, and a card opens its section full width', async () => {
  const f = await fixture(new Error('x'));
  assert.equal(f.prefs().tab, 'home');
  assert.deepEqual(home(f), {home: true, back: false, title: '', heading: true});
  for (const id of SECTIONS) assert.equal(f.node('panel-' + id).hidden, true, id);
  assert.equal(f.attributes.get('home-back:aria-label'), 'Back to Home');
  await f.node('tab-models').listeners.click(); await settle();
  assert.equal(f.prefs().tab, 'models');
  assert.deepEqual(home(f), {home: false, back: true, title: 'Models', heading: false});
  assert.equal(f.node('panel-models').hidden, false); assert.equal(f.node('panel-status').hidden, true);
  assert.equal(f.document.documentElement.dataset.view, 'section'); assert.equal(f.document.documentElement.dataset.nav, 'forward');
  await f.node('home-back').listeners.click(); await settle();
  assert.equal(f.prefs().tab, 'home');
  assert.deepEqual(home(f), {home: true, back: false, title: 'Models', heading: true});
  assert.equal(f.node('panel-models').hidden, true);
  assert.equal(f.document.documentElement.dataset.nav, 'back');
});

test('Home and section titles follow the chosen language', async () => {
  const yue = await fixture(new Error('x'), 'yue');
  assert.equal(yue.attributes.get('home-back:aria-label'), '返回主頁');
  await yue.node('tab-docs').listeners.click(); await settle();
  assert.equal(yue.node('section-title').textContent, '說明文件');
  assert.match(yue.nodesWith('同本機運行嘅模型對話。').map(node => node.id).join(','), /copy-/);
  const both = await fixture(new Error('x'), 'bilingual');
  assert.equal(both.attributes.get('home-back:aria-label'), 'Back to Home · 返回主頁');
});

test('opening a section adds a history entry, Back returns to Home and #section opens a section directly', async () => {
  const h = fakeHistory('');
  const f = await fixture(new Error('x'), 'en', {extras: {location: h.location, history: h.history}});
  assert.deepEqual(h.calls, [['replace', 'home', '/options.html']], 'the landing entry is replaced, not pushed');
  await f.node('tab-notes').listeners.click(); await settle();
  assert.deepEqual(h.calls.at(-1), ['push', 'notes', '#notes']);
  await f.node('home-back').listeners.click(); await settle();
  assert.deepEqual(h.calls.at(-1), ['push', 'home', '/options.html']);
  const before = h.calls.length;
  h.location.hash = '#status'; for (const fn of f.win.listeners.popstate) fn({});
  await settle();
  assert.equal(f.prefs().tab, 'status', 'browser Back or Forward selects the section named in the address');
  assert.equal(f.node('panel-status').hidden, false);
  assert.equal(h.calls.length, before, 'moving through history never pushes another entry');
  h.location.hash = ''; for (const fn of f.win.listeners.popstate) fn({});
  await settle();
  assert.equal(f.prefs().tab, 'home'); assert.equal(f.node('home-view').hidden, false);
  h.location.hash = '#models'; for (const fn of f.win.listeners.hashchange) fn({});
  await settle();
  assert.equal(f.prefs().tab, 'models', 'a changed address fragment opens its section');
});

test('loading options.html#models opens Models, and an unknown fragment or no fragment opens Home', async () => {
  const deep = fakeHistory('#models');
  const f = await fixture(new Error('x'), 'en', {extras: {location: deep.location, history: deep.history}});
  assert.equal(f.prefs().tab, 'models'); assert.equal(f.node('panel-models').hidden, false); assert.equal(f.node('home-view').hidden, true);
  assert.deepEqual(deep.calls, [['replace', 'models', '#models']]);
  const bad = fakeHistory('#chat');
  assert.equal((await fixture(new Error('x'), 'en', {extras: {location: bad.location, history: bad.history}})).prefs().tab, 'home');
  const stored = fakeHistory('');
  const seeded = await fixture(new Error('x'), 'en', {records: new Map([['mfe-extension-preferences-v1', JSON.stringify({...defaults, tab: 'status'})]]), extras: {location: stored.location, history: stored.history}});
  assert.equal(seeded.prefs().tab, 'home', 'without a fragment the page lands on Home');
});

test('Alt+0, Alt+1 to Alt+9 and the command palette still reach Home and every section', async () => {
  const f = await fixture(new Error('x'));
  const press = init => { const event = {altKey: true, ctrlKey: false, metaKey: false, prevented: false, preventDefault() { this.prevented = true; }, ...init}; for (const fn of f.win.listeners.keydown) fn(event); return event; };
  SECTIONS.forEach((id, index) => { assert.equal(press({key: String(index + 1)}).prevented, true); assert.equal(f.prefs().tab, id); });
  assert.equal(press({key: '0'}).prevented, true); assert.equal(f.prefs().tab, 'home');
  press({key: 'k', altKey: false, ctrlKey: true});
  const palette = f.node('palette-list').textContent;
  assert.ok(palette.includes('Open HomeAlt+0'));
  for (const [index, name] of ['Connection', 'Personalization', 'Changelog', 'Notes', 'Documentation', 'Support', 'Dim sum', 'Models', 'Status'].entries()) assert.ok(palette.includes('Open ' + name + 'Alt+' + (index + 1)), name);
});

test('a locked section keeps its card, marked disabled with the same name, and opens the explanation instead of its panel', async () => {
  const f = await fixture(new Error('x'), 'en', {extras: {locksRead: {schemaVersion: 1, locked: ['notes']}}});
  await openStatus(f); await f.node('locks-read').listeners.click(); await settle();
  assert.equal(f.attributes.get('tab-notes:aria-disabled'), 'true');
  assert.equal(f.attributes.get('tab-notes:aria-label'), 'Notes, locked by the desktop');
  await f.node('home-back').listeners.click(); await settle();
  await f.node('tab-notes').listeners.click(); await settle();
  assert.equal(f.node('panel-notes').hidden, true, 'the locked panel stays closed');
  assert.equal(f.node('locked-note').hidden, false);
  assert.equal(f.node('locked-heading').textContent, 'Notes is locked');
  assert.equal(f.node('section-title').textContent, 'Notes');
});

test('the Home sources add no network access, no markup strings and no new storage', () => {
  const nav = source.slice(source.indexOf('const SECTION_IDS'), source.indexOf('window.addEventListener(\'popstate\''));
  assert.doesNotMatch(nav, /innerHTML|insertAdjacentHTML|fetch\(|sendMessage|localStorage/);
  assert.match(nav, /history\.pushState\(\{tab\},'',url\)/);
});
const pairMessages = f => f.sentMessages.filter(text => JSON.parse(text).type === 'pair');
test('a typed pairing code is normalized, sent once with the pair request and cleared from the field', async () => {
  const f = await fixture(idle, 'en', {extras: {paired: false, desktop: desktopAnswer()}});
  f.node('pair-code').value = 'abcd-2345';
  await f.node('pair').listeners.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(pairMessages(f), ['{"type":"pair","code":"ABCD2345"}']);
  assert.equal(f.node('pair-code').value, '');
  assert.equal(f.node('pair-code-state').textContent, 'Pairing was approved on the desktop.');
  assert.equal(f.sentMessages.filter(text => text.includes('ABCD2345')).length, 1);
  assert.equal(f.storage.stored.value.includes('ABCD2345'), false);
  assert.equal([...f.storage.records.values()].some(value => String(value).includes('ABCD2345')), false);
});
test('pairing with an empty code field sends the original message with no code', async () => {
  const f = await fixture(idle, 'en', {extras: {paired: false, desktop: desktopAnswer()}});
  await f.node('pair').listeners.click();
  assert.deepEqual(pairMessages(f), ['{"type":"pair"}']);
});
test('a malformed code is explained and nothing is sent', async () => {
  const f = await fixture(idle, 'en', {extras: {paired: false}});
  f.node('pair-code').value = 'ABC0O1IL';
  await f.node('pair').listeners.click();
  assert.deepEqual(pairMessages(f), []);
  assert.match(f.node('pair-code-state').textContent, /8 letters and digits/);
});
test('scanning explains plainly when the browser cannot scan and opens no camera', async () => {
  const f = await fixture(idle, 'yue', {extras: {paired: false}});
  assert.match(f.node('pair-code-state').textContent, /不支援掃描/);
  await f.node('pair-scan').listeners.click();
  assert.match(f.node('pair-code-state').textContent, /不支援掃描/);
  assert.notEqual(f.node('pair-video').hidden, false);
});
test('after pairing the desktop version is shown beside the paired line', async () => {
  const f = await fixture(idle, 'en', {extras: {paired: false, desktop: desktopAnswer({desktopVersion: '0.3.1'})}});
  await f.node('pair').listeners.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.node('pair-identity').hidden, false);
  assert.equal(f.node('pair-identity').textContent, 'Paired with this desktop. Desktop version: 0.3.1');
});
test('a camera scan sends the scanned code once, stops the camera and keeps no frame', async () => {
  const stopped = [];
  const track = {stop() { stopped.push(true); }};
  const pairingGlobals = {BarcodeDetector: class { async detect() { return [{rawValue: 'ABCD2345'}]; } }};
  const navigator = {mediaDevices: {async getUserMedia() { return {getTracks: () => [track]}; }}};
  const f = await fixture(idle, 'en', {extras: {paired: false, desktop: desktopAnswer(), pairingGlobals, navigator}});
  const video = f.node('pair-video');
  video.videoWidth = 640; video.videoHeight = 480; video.play = async () => {}; video.pause = () => {};
  await f.node('pair-scan').listeners.click();
  for (let attempt = 0; attempt < 40 && pairMessages(f).length === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(pairMessages(f), ['{"type":"pair","code":"ABCD2345"}']);
  assert.deepEqual(stopped, [true]);
  assert.equal(video.srcObject, null);
  assert.equal(f.node('pair-code').value, '');
});

// Operations features: the personal wording boundary, the journal around state-changing requests and the Status section panel.
import {extensionOperations} from '../browser-extension/extension-operations.js';
import {journalKey} from '../browser-extension/operation-journal.js';
const withOps = extras => ({...extras, pairingGlobals: {extensionOperations}});
const importWording = async (f, entries) => { f.node('wording-file').files = [{size: 60, text: JSON.stringify({schemaVersion: 1, entries})}]; f.node('wording-file').listeners.change(); await new Promise(resolve => setTimeout(resolve, 0)); };
test('imported wording applies only while paired, and the page title always keeps the original copy', async () => {
  const entries = {Changelog: 'Release notes', 'Extension workspace': 'My private hub'};
  const paired = await fixture(idle, 'en', {extras: withOps({})});
  await importWording(paired, entries);
  assert.ok(paired.nodesWith('Release notes').filter(item => item.id.startsWith('copy-')).length > 0, 'applied while paired');
  assert.equal(paired.document.title, 'Material File Encryptor · Extension workspace', 'the title never carries imported wording');
  const unpaired = await fixture(idle, 'en', {extras: withOps({paired: false})});
  await importWording(unpaired, entries);
  assert.equal(unpaired.nodesWith('Release notes').filter(item => item.id.startsWith('copy-')).length, 0, 'original copy before pairing');
  assert.equal(unpaired.nodesWith('My private hub').length, 0);
  const reopened = await fixture(idle, 'en', {records: unpaired.storage.records, extras: withOps({paired: false})});
  assert.match(reopened.node('wording-status').textContent, /saved\. They apply only while this browser is paired/);
  assert.equal(reopened.node('wording-clear').disabled, false, 'saved wording can still be cleared');
  assert.equal(reopened.nodesWith('Release notes').length, 0);
  unpaired.node('wording-clear').listeners.click();
  assert.equal(unpaired.node('wording-status').textContent, 'Original wording restored.');
});
test('imported wording never reaches a message to the desktop or the saved journal', async () => {
  const f = await fixture(idle, 'en', {extras: withOps({schoolRead: {schemaVersion: 1, enabled: false, name: 'Study time'}, schoolSet: new Error('closed')})});
  await importWording(f, {School: 'Secretword', Pair: 'Secretpair'});
  await f.node('school-read').listeners.click(); await settle();
  await f.node('school-toggle').listeners.click(); await settle();
  const journal = f.storage.records.get(journalKey);
  assert.ok(journal, 'an unconfirmed state-changing request stays recorded');
  assert.ok(JSON.parse(journal).operations[0].kind === 'school-mode-set');
  for (const text of [journal, ...f.sentMessages]) assert.ok(!/Secret/.test(text));
});
test('a state-changing request that gets a definite answer leaves no journal record', async () => {
  const f = await fixture(idle, 'en', {extras: withOps({schoolRead: {schemaVersion: 1, enabled: false, name: 'Study time'}, schoolSet: {schemaVersion: 1, state: 'changed', enabled: true}})});
  await f.node('school-read').listeners.click(); await settle();
  await f.node('school-toggle').listeners.click(); await settle();
  assert.equal(f.storage.records.get(journalKey) ?? null, null);
});
test('the Status section shows procedures, interrupted operations and a truthful enrollment state', async () => {
  assert.match(html, /<div id="operations" class="operations"><\/div>/);
  const f = await fixture(idle, 'en', {extras: withOps({})});
  f.node('tab-status').listeners.click();
  const text = f.node('operations').textContent;
  assert.match(text, /Procedures/);
  assert.match(text, /Recover an interrupted operation/);
  assert.match(text, /Interrupted operations/);
  assert.match(text, /Status Hub enrollment/);
  assert.match(text, /Not enrolled/);
  assert.ok(!f.calls.includes('status-client-enroll'), 'nothing is sent until the person chooses it');
});
test('outbound paths never pass through personal wording', () => {
  const outbound = [/function openExport\(\)\{.*?\n/s, /function saveExport\(\)\{.*?\n/s, /function ticketDiagnostics\(\)\{.*?\n/, /\$\('notes-export'\)\.addEventListener.*?\n/, /async function copyText\(text\)\{.*?\n/];
  for (const pattern of outbound) {
    const match = source.match(pattern);
    assert.ok(match, String(pattern));
    const body = match[0].replace(/label\(\$\('export-summary'\)[^;]*;/, '');
    assert.doesNotMatch(body, /applyVocabulary|vocabularyEntries|\bt\(/, String(pattern));
  }
  assert.doesNotMatch(source, /console\.(log|info|warn|error|debug)/);
  assert.match(source, /document\.title=productName\(\)\+' · '\+\(ops\?ops\.publicCopy\(copy\.heading,prefs\.language\):t\(copy\.heading\)\)/);
});
