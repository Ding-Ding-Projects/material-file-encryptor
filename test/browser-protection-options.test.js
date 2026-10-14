import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
import {defaults,readPreferences,applyPreferences,tabTarget} from '../browser-extension/preferences.js';import {styleExtensionMessage} from '../scripts/browser-extension-language-entry.js';import {EXPORT_FORMATS,exportChangelog,validateExport} from '../browser-extension/exports.js';import {readHistory,recordChanges,clearHistory} from '../browser-extension/history.js';import {ACCENT_PRESETS,accentPalette,applyAccent} from '../browser-extension/accent.js';import {checkLogoFile,readLogo,saveLogo,clearLogo,readAttention,saveAttention,attentionDefaults} from '../browser-extension/local-records.js';import {NOTE_LIMITS,checkNote,readNotes,addNote,deleteNotes,notesMarkdown,readDraft,saveDraft,clearDraft,linkParts} from '../browser-extension/notes.js';import {SCHEDULE_VALUES,readSchedules,addSchedule,cancelSchedule,takeDue,timeZoneLabel} from '../browser-extension/schedules.js';import {readVocabulary,saveVocabulary,clearVocabulary,applyVocabulary} from '../browser-extension/vocabulary.js';import {readNarration,saveNarration,voicesFor,narrationScript,speak,stopSpeech} from '../browser-extension/narration.js';import {TICKET_CATEGORIES,TICKET_STATUSES,checkAttachment,saveTicket,readTickets,deleteTicket,diagnosticsText,ticketExport} from '../browser-extension/tickets.js';import {CATALOG_URL,RELEASES_URL,normaliseCatalog,photoMap,categories,searchDishes,readFavourites,toggleFavourite} from '../browser-extension/dimsum.js';import {DEFAULT_PORT,ORIGIN_PATTERN,LIMITS,parsePort,modelName,validatePayload,callLocal,formatSize,installedModels,runningNames,pullProgress,chatDelta} from '../browser-extension/local-models.js';import {parseRichText} from '../browser-extension/rich-text.js';
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
 const nodes=new Map(),calls=[],attributes=new Map(),created=[];const node=id=>{if(!nodes.has(id))nodes.set(id,{id,textContent:'',dataset:{},listeners:{},setAttribute(name,value){attributes.set(id+':'+name,value);},replaceChildren(...children){this.textContent=children.map(child=>child.textContent??'').join('');},append(...children){for(const child of children)this.textContent+=child.textContent;},addEventListener(name,fn){this.listeners[name]=fn;},setLanguage(){},filter:async rows=>rows,focus(){},show(){this.open=true;return Promise.resolve();},close(){this.open=false;}});return nodes.get(id);};
 const copies=[...html.matchAll(/data-copy="([^"]+)"/g)].map((match,index)=>{const item=node('copy-'+index);item.dataset.copy=match[1];return item;});const permissionRequests=[];const tabs=['connection','personalization','changelog','notes','docs','support','dimsum','models','status'].map(tab=>{const item=node('tab-'+tab);item.dataset.tab=tab;return item;});const languages=['en','yue','bilingual'].map(value=>{const item=node('language-'+value);item.dataset.language=value;return item;});const themes=['system','light','dark'].map(value=>{const item=node('theme-'+value);item.dataset.theme=value;return item;});const stored={value:JSON.stringify({...defaults,language})};const history={value:null},records=seed??new Map();const storage={getItem:key=>key==='mfe-extension-history-v1'?history.value:key==='mfe-extension-preferences-v1'?stored.value:(records.get(key)??null),setItem(key,value){if(key==='mfe-extension-history-v1')history.value=value;else if(key==='mfe-extension-preferences-v1')stored.value=value;else records.set(key,value);},removeItem(key){if(key==='mfe-extension-history-v1')history.value=null;else records.delete(key);},stored,history,records};
 const win={listeners:{},addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}};const document={getElementById:node,documentElement:{dataset:{},style:{props:{},setProperty(name,value){this.props[name]=value;},removeProperty(name){delete this.props[name];}}},createTextNode:text=>({textContent:text}),createElement:tag=>{const made=node('generated-'+nodes.size);made.localName=tag;created.push(made);return made;},querySelectorAll:selector=>({'[data-copy]':copies,'[data-tab]':tabs,'[data-language]':languages,'[data-theme]':themes,'[data-guidance]':[]}[selector]||[])};
 vm.runInNewContext(source.replace(/^import [^\r\n]*;\r?\n/gm,''),{renderNoteText,mountBrowserConverter,changelog,provenance,EXPORT_FORMATS,exportChangelog,validateExport,readHistory,recordChanges,clearHistory,ACCENT_PRESETS,accentPalette,applyAccent,checkLogoFile,readLogo,saveLogo,clearLogo,readAttention,saveAttention,attentionDefaults,NOTE_LIMITS,checkNote,readNotes,addNote,deleteNotes,notesMarkdown,readDraft,saveDraft,clearDraft,linkParts,SCHEDULE_VALUES,readSchedules,addSchedule,cancelSchedule,takeDue,timeZoneLabel,readVocabulary,saveVocabulary,clearVocabulary,applyVocabulary,Intl,docsCatalog,readNarration,saveNarration,voicesFor,narrationScript,speak,stopSpeech,TICKET_CATEGORIES,TICKET_STATUSES,checkAttachment,saveTicket,readTickets,deleteTicket,diagnosticsText,ticketExport,CATALOG_URL,RELEASES_URL,normaliseCatalog,photoMap,categories,searchDishes,readFavourites,toggleFavourite,DEFAULT_PORT,ORIGIN_PATTERN,LIMITS,parsePort,modelName,validatePayload,callLocal,formatSize,installedModels,runningNames,pullProgress,chatDelta,parseRichText,AbortController,setTimeout,clearTimeout,RELEASES_API,parseReleaseCodeName,parsePhotoUrl,matchRelease,releasePageUrl,installerAsset,coverage:extras.coverage===undefined?defaultCoverage:extras.coverage,fetch:extras.fetch,caches:extras.caches,Response:class{constructor(body,init){this.body=body;this.headers=new Map(Object.entries(init?.headers||{}));}async json(){return JSON.parse(this.body);}},speechSynthesis:extras.speechSynthesis,navigator:extras.navigator,MediaRecorder:extras.MediaRecorder,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},URL:{createObjectURL:()=>'blob:recording',revokeObjectURL(){}},Blob:class{constructor(parts,options){this.parts=parts;this.type=options?.type;}},renderMarkdown:(host,markdown,context)=>{host.textContent=markdown;host.context=context;},FileReader:class{readAsDataURL(file){this.result=file.dataUrl;queueMicrotask(()=>this.onload());}readAsText(file){this.result=file.text;queueMicrotask(()=>this.onload());}},defaults,document,window:win,readPreferences,applyPreferences,tabTarget,acquireStorage:()=>storage,styleExtensionMessage,chrome:{permissions:{request:async details=>{permissionRequests.push(details);return extras.grant!==false;}},runtime:{getManifest:()=>({version:'0.1.0'}),sendMessage:async message=>{calls.push(message.type);if(message.type==='desktop-status'){if(extras.desktop instanceof Error)throw extras.desktop;return extras.desktop??{paired:false};}if(message.type==='protection-status'){if(snapshot instanceof Error)throw snapshot;return snapshot;}return {paired:true};}}}});await new Promise(resolve=>setTimeout(resolve,0));return{node,calls,permissionRequests,attributes,storage,win,document,nodesWith:text=>[...nodes.values()].filter(item=>String(item.textContent).includes(text)),find:(tag,name)=>[...created].reverse().find(item=>item.localName===tag&&attributes.get(item.id+':aria-label')===name),prefs:()=>JSON.parse(storage.stored.value)};
}
test('options separates paired connection from unavailable browser authority and localizes observed states',async()=>{const f=await fixture({schemaVersion:1,profile:'authenticated',sharedMode:'active',browserPermission:'unavailable'},'yue');assert.match(f.node('connection-state').textContent,/已配對/);assert.match(f.node('profile-state').textContent,/已驗證/);assert.match(f.node('shared-state').textContent,/已啟用/);assert.deepEqual(f.calls,['status','protection-status','workflow-discover']);assert.equal(f.attributes.get('workspace-tabs:aria-label'),'Material File Encryptor · 工作區');});
test('options failed or malformed protection reads retain connection while clearing observations',async()=>{for(const snapshot of [new Error('fixture unavailable'),{schemaVersion:1,profile:'authenticated',sharedMode:'inactive',browserPermission:'granted'},{schemaVersion:2,profile:'authenticated',sharedMode:'inactive',browserPermission:'unavailable'}]){const f=await fixture(snapshot);assert.match(f.node('connection-state').textContent,/Paired/);assert.match(f.node('profile-state').textContent,/unavailable/);assert.match(f.node('shared-state').textContent,/unavailable/);}});
test('workspace shows the bundled changelog offline and filters it locally',async()=>{const f=await fixture({schemaVersion:1,profile:'authenticated',sharedMode:'inactive',browserPermission:'unavailable'});assert.equal(f.node('changelog-count').textContent,'2 of 2 releases');assert.match(f.node('changelog-list').textContent,/Material sweep · 2026-10-14Converted tabs/);f.node('changelog-filter').value='readiness';f.node('changelog-filter').listeners.input();assert.equal(f.node('changelog-count').textContent,'1 of 2 releases');assert.match(f.node('changelog-list').textContent,/^Startup/);const yue=await fixture(new Error('x'),'yue');assert.match(yue.node('changelog-list').textContent,/轉做 Material/);assert.doesNotMatch(yue.node('changelog-list').textContent,/Converted tabs/);});
test('status shows the staged version, source commit and staging time, or says they are unavailable',async()=>{const f=await fixture(new Error('x'));assert.equal(f.node('source-commit').textContent,'Source commit: aaaaaaaaaaaa');assert.equal(f.node('staged-at').textContent,'Staged: 2026-10-14 09:30 UTC');const missing=await fixture(new Error('x'),'en',{provenance:null,changelog:null});assert.equal(missing.node('source-commit').textContent,'Source commit unavailable');const modified=await fixture(new Error('x'),'en',{provenance:{schemaVersion:1,version:'0.1.0',sourceCommit:'b'.repeat(40),sourceModified:true,stagedAtUtc:'2026-10-14T09:30:00.000Z'}});assert.equal(modified.node('source-commit').textContent,'Source commit: bbbbbbbbbbbb with uncommitted changes');assert.equal(missing.node('changelog-count').textContent,'The changelog is unavailable in this build.');});
test('command palette lists every workspace action, filters it and disables actions that cannot run',async()=>{const f=await fixture({schemaVersion:1,profile:'authenticated',sharedMode:'inactive',browserPermission:'unavailable'});const list=f.node('palette-list');assert.match(html,/<md-dialog id="palette"/);assert.match(list.textContent,/Open Changelog/);assert.match(list.textContent,/Use dark theme/);f.node('palette-filter').value='theme';f.node('palette-filter').listeners.input();assert.doesNotMatch(list.textContent,/Open Changelog/);assert.match(list.textContent,/Use light theme/);});
test('export formats serialise, neutralise spreadsheet formulas and validate their own row counts',()=>{const entries=[{title:'Sweep',date:'2026-10-14',items:['=SUM(A1)','Plain, "quoted"'],yue:'摘要'},{title:'Empty',date:'',items:[],yue:''}];const json=exportChangelog(entries,'json');assert.equal(JSON.parse(json).entries.length,2);assert.ok(validateExport(json,'json',entries));const csv=exportChangelog(entries,'csv');assert.ok(csv.includes(",'=SUM(A1),"));assert.ok(csv.includes('"Plain, ""quoted"""'));assert.ok(validateExport(csv,'csv',entries));assert.equal(validateExport(csv+'extra\r\n','csv',entries),false);const markdown=exportChangelog(entries,'markdown');assert.ok(markdown.startsWith('## Sweep · 2026-10-14'));assert.ok(validateExport(markdown,'markdown',entries));assert.throws(()=>exportChangelog(entries,'xml'),/Choose an export format/);});
test('workspace export previews the filtered releases and offers only a validated file',async()=>{const f=await fixture(new Error('x'));f.node('changelog-filter').value='readiness';f.node('changelog-filter').listeners.input();f.node('export-format').value='csv';f.node('export-preview').listeners.click();assert.equal(f.node('export-dialog').open,true);assert.match(f.node('export-summary').textContent,/^1 releases as CSV/);assert.match(f.node('export-text').textContent,/Startup,Readiness/);assert.equal(f.node('export-save').disabled,false);});
test('setting details show current values and follow changes',async()=>{const f=await fixture(new Error('x'));assert.match(f.node('setting-details').textContent,/Language: English/);assert.match(f.node('setting-details').textContent,/Theme: System/);f.node('theme-dark').listeners.click();assert.match(f.node('setting-details').textContent,/Theme: Dark/);});
test('resetting every setting needs both confirmation keys and the full slider',async()=>{const f=await fixture(new Error('x'));f.node('theme-dark').listeners.click();assert.equal(f.prefs().theme,'dark');f.node('reset').listeners.click();assert.equal(f.node('confirm-dialog').open,true);assert.equal(f.node('confirm-execute').disabled,true);f.node('confirm-execute').listeners.click();assert.equal(f.prefs().theme,'dark');f.node('confirm-first').selected=true;f.node('confirm-first').listeners.change();assert.equal(f.node('confirm-slider').disabled,true);f.node('confirm-second').selected=true;f.node('confirm-second').listeners.change();assert.equal(f.node('confirm-slider').disabled,false);f.node('confirm-slider').value=60;f.node('confirm-slider').listeners.change();assert.equal(f.node('confirm-execute').disabled,true);f.node('confirm-slider').value=100;f.node('confirm-slider').listeners.change();assert.equal(f.node('confirm-execute').disabled,false);f.node('confirm-execute').listeners.click();assert.equal(f.prefs().theme,'system');assert.equal(f.node('confirm-dialog').open,false);f.node('theme-light').listeners.click();f.node('reset').listeners.click();f.node('confirm-cancel').listeners.click();assert.equal(f.prefs().theme,'light');});
test('tab shortcuts use Alt and a digit and leave browser-reserved combinations alone',async()=>{const f=await fixture(new Error('x'));const press=init=>{const event={altKey:false,ctrlKey:false,metaKey:false,prevented:false,preventDefault(){this.prevented=true;},...init};for(const fn of f.win.listeners.keydown)fn(event);return event;};assert.equal(press({key:'3',altKey:true}).prevented,true);assert.equal(f.prefs().tab,'changelog');assert.equal(press({key:'2',ctrlKey:true}).prevented,false);assert.equal(f.prefs().tab,'changelog');assert.equal(press({key:'k',ctrlKey:true}).prevented,true);assert.ok(f.node('palette-list').textContent.includes('Open NotesAlt+4'));assert.ok(f.node('palette-list').textContent.includes('Open DocumentationAlt+5'));assert.ok(f.node('palette-list').textContent.includes('Open SupportAlt+6'));assert.ok(f.node('palette-list').textContent.includes('Open Dim sumAlt+7'));assert.ok(f.node('palette-list').textContent.includes('Open ModelsAlt+8'));assert.ok(f.node('palette-list').textContent.includes('Open StatusAlt+9'));assert.equal(press({key:'8',altKey:true}).prevented,true);assert.equal(f.prefs().tab,'models');assert.equal(press({key:'9',altKey:true}).prevented,true);assert.equal(f.prefs().tab,'status');});
test('a local product name reaches the title, version line and tab list name, and rejects markup',async()=>{const f=await fixture(new Error('x'));const name=f.node('display-name');name.value='Family vault';name.listeners.change();assert.equal(f.prefs().displayName,'Family vault');assert.equal(f.document.title,'Family vault · Extension workspace');assert.equal(f.node('version').textContent,'Family vault 0.1.0');assert.equal(f.node('workspace-heading').textContent,'Family vault · Extension workspace');assert.equal(f.attributes.get('workspace-tabs:aria-label'),'Family vault · Workspace');name.value='<b>bold</b>';name.listeners.change();assert.equal(name.error,true);assert.equal(f.prefs().displayName,'Family vault');});
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

test('the tab bar, panel, whitelist and shortcut list all include the models tab', () => {
  assert.match(html, /<md-primary-tab id="tab-models" aria-controls="panel-models" data-tab="models"/);
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
