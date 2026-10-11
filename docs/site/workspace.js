import {mountSurfaceFoundation} from '../../src/renderer/features/shell/index.js';
import {mountDocumentation} from '../../src/renderer/features/documentation/index.js';
import {mountChangelog} from '../../src/renderer/features/documentation/changelog.js';
import {mountStatus} from '../../src/renderer/features/status/index.js';
import {documentationCantonese} from '../../src/renderer/features/documentation/localization.js';
import {mountPersonalization} from '../../src/renderer/features/personalization/index.js';
import {mountAccess} from '../../src/renderer/features/access/index.js';
import {mountConverter} from '../../src/renderer/features/converter/index.js';
import {mountOllama} from '../../src/renderer/features/ollama/index.js';
import {mountLocalAdapter} from './local-adapter.js';
import {emptyVocabulary,parseVocabulary,replaceVocabulary,serializeVocabulary} from './personal-vocabulary.js';
import {createTranslator} from '../../src/shared/local-ux/language.js';

/** Refreshes copy in place without remounting controls or changing user data. */
export function createWorkspaceCopyBindings({translate,document}) {
 const sources=new Map(),textRecords=new WeakMap(),attributeRecords=new WeakMap();
 const excluded='script,style,code,pre,textarea,input,.workspace-file>span,.ollama-output,[role=log]';
 function record(source,rendered){if(typeof source==='string'&&source){sources.set(source,source);sources.set(rendered,source);}return rendered;}
 function translateCopy(source,options){return record(source,translate(source,options));}
 function valueFor(current,recorded){
  const source=recorded&&current===recorded.rendered?recorded.source:sources.get(current);
  if(source===undefined)return null;
  return {source,rendered:record(source,translate(source))};
 }
 function refresh(scope=document.body){
  const walker=document.createTreeWalker(scope,4);
  while(walker.nextNode()){
   const node=walker.currentNode;if(node.parentElement?.closest(excluded))continue;
   const next=valueFor(node.nodeValue,textRecords.get(node));if(!next)continue;
   textRecords.set(node,next);if(node.nodeValue!==next.rendered)node.nodeValue=next.rendered;
  }
  for(const node of scope.querySelectorAll('*')){
   if(!node.closest('script,style,code,pre,.ollama-output,[role=log]'))for(const name of ['aria-label','title','placeholder','label']){
    if(!node.hasAttribute(name))continue;let records=attributeRecords.get(node);if(!records){records=new Map();attributeRecords.set(node,records);}
    const next=valueFor(node.getAttribute(name),records.get(name));if(!next)continue;
    records.set(name,next);if(node.getAttribute(name)!==next.rendered)node.setAttribute(name,next.rendered);
   }
   if(node.shadowRoot)refresh(node.shadowRoot);
  }
 }
 return {translate:translateCopy,record,refresh};
}

const root=document.querySelector('#workspace');
const modules=new Map(),roots=new Map(),canonicalTitles=new Map(),cleanup=[];let connectedFactory=null;
let foundation,adapter,access,paired=false,authenticated=false,schoolMode=false,language='en',vocabulary=emptyVocabulary(),wordingGeneration=0;
let workspaceSettings={language:'en',funnyEnglish:5,funnyCantonese:5,school:{enabled:false}};
const strings={...documentationCantonese,'Connect your desktop':'連接桌面程式','Start the local adapter in the desktop app, unlock your profile, and enter its address and one-use code. Approve the connection in the desktop app. This connection stays on this computer.':'請在桌面程式啟動本機連接服務，解鎖設定檔，再輸入地址及一次性代碼，並在桌面程式批准連線。連線只會留在這部電腦。','Local desktop address':'本機桌面地址','One-use pairing code':'一次性配對碼','Pair desktop':'配對桌面程式','Disconnect':'中斷連線','Not connected.':'尚未連線。','Connection ended. Unlock the desktop and pair again.':'連線已結束。請解鎖桌面程式並重新配對。','Enter the exact local address and current pairing code shown by the desktop.':'請輸入桌面程式顯示的完整本機地址及目前配對碼。','Waiting for desktop approval.':'等候桌面程式批准。','Connected to the authenticated local desktop.':'已連接通過驗證的本機桌面程式。','Pairing failed. Check the desktop address, code and approval, then try again.':'配對失敗。請檢查桌面地址、代碼及批准狀態，再試一次。','Disconnected.':'已中斷連線。','Local companion workspace':'本機配套工作區','Private local wording':'私人本機用詞','Search files':'搜尋檔案','No matching files.':'沒有相符檔案。','Workspace':'工作區','Connection':'連線','Files':'檔案','Personalization':'個人化','Local access':'本機存取','Documentation':'說明文件','Changelog':'更新記錄','Converter':'轉換工具','Local models':'本機模型','Status':'狀態','Refresh':'重新整理','Open in Explorer':'在檔案總管開啟','Sync now':'立即同步','Lock drive':'鎖定磁碟','Import files':'匯入檔案','Open':'開啟','Export copy':'匯出副本','Keep offline':'保留離線副本','Upload vocabulary JSON':'上載個人用詞 JSON','Clear vocabulary':'清除個人用詞','Disconnected. Pair an unlocked desktop to use native actions.':'未連線。請配對已解鎖的桌面程式以使用本機操作。','Original wording is active.':'目前使用原有用詞。','Local wording is active.':'已啟用本機用詞。','Unlock the local profile and pair the desktop before applying private wording.':'請先解鎖本機設定檔並配對桌面程式，才套用私人用詞。'};
const translateWorkspace=createTranslator(()=>workspaceSettings,{dictionary:strings});
const copyBindings=createWorkspaceCopyBindings({translate:translateWorkspace,document});
for(const source of Object.keys(translateWorkspace.dictionary))copyBindings.record(source,translateWorkspace(source));
function t(source,options){return copyBindings.translate(source,options);}
function refreshWorkspaceLanguage(){refreshPrivateCopy(false);copyBindings.refresh();renderWordingStatus();refreshPrivateCopy();}
function element(tag,text,properties={}){const node=document.createElement(tag);if(text!==undefined)node.textContent=t(text);Object.assign(node,properties);return node;}
function button(label,action){const node=element('md-outlined-button',label);node.addEventListener('click',()=>Promise.resolve().then(action).catch(report));return node;}
function report(error){foundation?.notify({title:'Operation unavailable',message:error?.message||String(error),level:'error'});}
function exportText({name,mime,text,content}){const url=URL.createObjectURL(new Blob([text??content??''],{type:mime||'text/plain'}));element('a',undefined,{href:url,download:name}).click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function view(id,title){const section=element('section',undefined,{id:`workspace-${id}`,className:'workspace-view',hidden:true});section.setAttribute('aria-label',title);root.append(section);roots.set(id,section);canonicalTitles.set(id,title);return section;}
function activate(id){for(const[key,node]of roots)node.hidden=key!==id;}
function openView(id){foundation.model.openTab({id,label:canonicalTitles.get(id)||id});foundation.shell.activate(id);}
async function native(action,params={}){if(!paired)throw Error(t('Disconnected. Pair an unlocked desktop to use native actions.'));return adapter.featureRequest(action,params);}
async function feature(featureName,action,payload={}){return native('featureRequest',{feature:featureName,action,payload});}

/** Applies private wording only after both actual authentication boundaries succeed. */
export async function setAuthenticatedLocalSession(value){
 const generation=++wordingGeneration;authenticated=value===true&&paired===true&&access?.authenticated===true;vocabulary=emptyVocabulary();
 if(authenticated){try{const raw=localStorage.getItem('mfe.workspace.private-wording.v1');if(raw){const clear=await access.decryptPrivateCache(JSON.parse(raw),'workspace-wording');if(generation===wordingGeneration)vocabulary=parseVocabulary(clear);}}catch{report(Error('Saved private wording could not be unlocked. Original wording remains active.'));}}
 if(generation!==wordingGeneration)return;renderWordingStatus();refreshPrivateCopy();modules.get('personalization')?.apply();
}
function renderWordingStatus(){const status=document.querySelector('#workspace-wording-status');if(status)status.textContent=t(authenticated?(vocabulary.replacements.length?'Local wording is active.':'Original wording is active.'):'Unlock the local profile and pair the desktop before applying private wording.');}
async function loadPrivateWording(file){if(!authenticated)throw Error(t('Unlock the local profile and pair the desktop before applying private wording.'));if(!file||file.size>256*1024)throw Error('Vocabulary JSON exceeds 256 KiB.');const generation=wordingGeneration;const next=parseVocabulary(await file.text());const sealed=await access.encryptPrivateCache(serializeVocabulary(next),'workspace-wording');if(generation!==wordingGeneration||!authenticated)throw Error('Authentication changed. Original wording remains active.');localStorage.setItem('mfe.workspace.private-wording.v1',JSON.stringify(sealed));vocabulary=next;renderWordingStatus();refreshPrivateCopy();modules.get('personalization')?.apply();}

const originalText=new WeakMap(),originalAttributes=new WeakMap(),observedRoots=new WeakSet();let copyQueued=false;
function refreshPrivateCopy(apply=true){
 const transform=value=>apply&&authenticated&&!schoolMode?replaceVocabulary(value,vocabulary):value;
 function scan(scope){
  if(!observedRoots.has(scope)){copyObserver.observe(scope,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder']});observedRoots.add(scope);}
  const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){const node=walker.currentNode;if(!node.textContent.trim()||node.parentElement?.closest('script,style,code,pre,textarea,input,.workspace-file,.ollama-output,[role=log]'))continue;let record=originalText.get(node);if(!record||node.textContent!==record.rendered)record={source:node.textContent};const rendered=transform(record.source);record.rendered=rendered;originalText.set(node,record);if(node.textContent!==rendered)node.textContent=rendered;}
  for(const node of scope.querySelectorAll('*')){for(const name of ['aria-label','title','placeholder']){if(!node.hasAttribute(name))continue;let map=originalAttributes.get(node);if(!map){map=new Map();originalAttributes.set(node,map);}let record=map.get(name);const current=node.getAttribute(name);if(!record||current!==record.rendered)record={source:current};record.rendered=transform(record.source);map.set(name,record);if(current!==record.rendered)node.setAttribute(name,record.rendered);}if(node.shadowRoot)scan(node.shadowRoot);}
 }
 scan(document.body);
}
const copyObserver=new MutationObserver(()=>{if(!copyQueued){copyQueued=true;queueMicrotask(()=>{copyQueued=false;refreshPrivateCopy();});}});

function localCredentialStore(){return{
 async get(key){const raw=localStorage.getItem(`mfe.workspace.credentials.${key}`);if(!raw)return null;const record=JSON.parse(raw);if(key==='local-profile:v1')return record;if(!access?.authenticated)return null;return access.decryptPrivateCache(record,`workspace-credential:${key}`);},
 async set(key,value){if(key==='local-profile:v1'){localStorage.setItem(`mfe.workspace.credentials.${key}`,JSON.stringify(value));return;}if(!access?.authenticated)throw Error('Unlock the local profile first.');const sealed=await access.encryptPrivateCache(value,`workspace-credential:${key}`);localStorage.setItem(`mfe.workspace.credentials.${key}`,JSON.stringify(sealed));},
 async delete(key){if(!access?.authenticated)throw Error('Unlock the local profile first.');localStorage.removeItem(`mfe.workspace.credentials.${key}`);}
};}
function attachSearch(input,area){const search=element('mfe-search');search.setAttribute('label',input.getAttribute('aria-label')||'Search settings');search.setAttribute('scope',`workspace-${area.id||input.id||input.parentElement.className||'settings'}`);search.language=language;input.hidden=true;input.before(search);let generation=0;const update=async()=>{const id=++generation;const nodes=[...area.querySelectorAll('.local-ux-field,.appearance-property,button')];const rows=await search.filter(nodes.map((node,index)=>({id:String(index),text:node.textContent})));if(id!==generation||rows===null)return;const visible=new Set(rows.map(row=>row.id));nodes.forEach((node,index)=>node.hidden=!visible.has(String(index)));};search.addEventListener('search-change',update);return()=>{generation++;search.remove();input.hidden=false;};}
async function confirmAction({title,message,requiredText}){const dialog=element('md-dialog');dialog.setAttribute('aria-label',title);dialog.append(element('span',title,{slot:'headline'}),element('p',message||'',{slot:'content'}));let field;if(requiredText){field=element('md-outlined-text-field',undefined,{slot:'content',label:`Type ${requiredText}`,autocomplete:'off'});dialog.append(field);}let accepted=false;const yes=button('Confirm',()=>{if(field&&field.value!==requiredText)return;accepted=true;dialog.close();});yes.slot='actions';const no=button('Cancel',()=>dialog.close());no.slot='actions';dialog.append(no,yes);document.body.append(dialog);dialog.show();await new Promise(resolve=>dialog.addEventListener('closed',resolve,{once:true}));dialog.remove();return accepted;}

async function start(){
 const[provenance,catalog]=await Promise.all([fetch('workspace-provenance.json').then(r=>{if(!r.ok)throw Error('Workspace provenance unavailable');return r.json();}).catch(()=>({})),fetch('workspace-catalog.json').then(r=>{if(!r.ok)throw Error('Bundled documentation unavailable');return r.json();})]);
 document.querySelector('#workspace-loading')?.remove();
 const definitions=[['connection','Connection'],['files','Files'],['personalization','Personalization'],['access','Local access'],['documentation','Documentation'],['changelog','Changelog'],['converter','Converter'],['ollama','Local models'],['status','Status']];
 definitions.forEach(([id,title])=>view(id,title));
 foundation=mountSurfaceFoundation({host:root,before:root.firstChild,storage:localStorage,language,provenance,tabs:definitions.map(([id,title])=>({id,label:title,labelYue:strings[title]})),onActivate:activate,onExport:exportText});
 const connection=roots.get('connection');adapter=mountLocalAdapter(connection,{translate:t,onAuthenticatedChange:value=>{paired=value;void setAuthenticatedLocalSession(value);if(value){void refreshFiles();connectedFactory?.();modules.get('status')?.refresh();const personalization=modules.get('personalization');if(personalization)feature('personalization','sharedRead').then(school=>personalization.store.update({school},'shared mode synchronized')).catch(report);}else{renderFiles([]);for(const id of ['converter','ollama']){modules.get(id)?.destroy();modules.delete(id);const host=roots.get(id);host?.replaceChildren(element('p','Disconnected. Pair an unlocked desktop to use native actions.'),button('Connection',()=>openView('connection')));}}}});
 const wording=element('section');wording.append(element('h3','Private local wording'));const upload=element('input',undefined,{type:'file',accept:'application/json,.json'});upload.setAttribute('aria-label','Upload vocabulary JSON');upload.addEventListener('change',async()=>{try{await loadPrivateWording(upload.files?.[0]);}catch(error){report(error);}finally{upload.value='';}});wording.append(upload,button('Clear vocabulary',()=>{wordingGeneration++;vocabulary=emptyVocabulary();localStorage.removeItem('mfe.workspace.private-wording.v1');renderWordingStatus();refreshPrivateCopy();}),element('p',undefined,{id:'workspace-wording-status',className:'workspace-status'}));connection.append(wording);
 const credentials=localCredentialStore();
 access=mountAccess(roots.get('access'),{credentialStore:credentials,translate:t,schoolMode:()=>schoolMode,notify:message=>report(Error(message)),onAuthenticatedChange:()=>{void setAuthenticatedLocalSession(paired);if(access?.authenticated)access.loadAuthenticators().catch(report);},dataPath:'Browser-local encrypted profile storage',openDataFolder:()=>{openView('connection');return Promise.resolve();}});modules.set('access',access);
 const historyCredentials={get:key=>credentials.get(`history:${key}`),set:(key,value)=>credentials.set(`history:${key}`,value),delete:key=>credentials.delete(`history:${key}`)};
 modules.set('personalization',mountPersonalization(roots.get('personalization'),{storage:localStorage,surfaceRoot:document.documentElement,historyCredentialStore:historyCredentials,attachSearch,notify:message=>foundation.notify({title:'Update',message:String(message),level:'info'}),vocabulary:{isAuthenticated:()=>false,replace:value=>value},onChange:settings=>{workspaceSettings=settings;schoolMode=settings.school.enabled;language=schoolMode?'en':settings.language;foundation.setLanguage(language);refreshWorkspaceLanguage();},onLock:target=>{const id=target.id||`workspace-element-${crypto.randomUUID()}`;target.dataset.lockId=id;openView('access');access.openLockWizard(id,target);},sharedSettings:{read:()=>feature('personalization','sharedRead'),write:value=>feature('personalization','sharedWrite',{value})},verifySharedCredential:password=>feature('personalization','verifySharedCredential',{password}),setSharedCredential:password=>feature('personalization','setSharedCredential',{password}),fetchScheduleSource:rule=>feature('personalization','fetchScheduleSource',{rule})}));
 access.bind(document.body);
 modules.set('documentation',mountDocumentation(roots.get('documentation'),{catalog,translate:t,onExport:exportText}));
 modules.set('changelog',mountChangelog(roots.get('changelog'),{entries:catalog.changelog,translate:t,onExport:exportText}));
 modules.set('status',mountStatus(roots.get('status'),{translate:t,getStatus:async()=>paired?feature('status','status'):{state:'unavailable'}}));
 const converterServices={converter:Object.fromEntries(['catalog','inspect','enqueue','list','control'].map(action=>[action,payload=>feature('converter',action,payload)])),pickSources:()=>feature('converter','pickSources'),pickDestination:payload=>feature('converter','pickDestination',payload),pickDestinationDirectory:()=>feature('converter','pickDestinationDirectory'),confirmOverwrite:()=>confirmAction({title:'Replace output file?',message:'The source stays unchanged. The selected output will be replaced.'})};
 const listeners=new Set();connectedFactory=()=>{if(!paired)return;for(const id of ['converter','ollama']){modules.get(id)?.destroy();roots.get(id).replaceChildren();}modules.set('converter',mountConverter(roots.get('converter'),{translate:t,services:converterServices}));modules.set('ollama',mountOllama(roots.get('ollama'),{translate:t,confirm:confirmAction,services:{ollama:{request:(action,payload)=>feature('ollama',action,payload),subscribe:callback=>{listeners.add(callback);return()=>listeners.delete(callback);}}}}));};
 if(paired)connectedFactory();else for(const id of ['converter','ollama'])roots.get(id).append(element('p','Disconnected. Pair an unlocked desktop to use native actions.'),button('Connection',()=>openView('connection')));
 let polling=false,eventCursor=0;const poll=setInterval(async()=>{if(!paired||polling)return;polling=true;try{const result=await feature('ollama','events',{after:eventCursor});if(result.gap)foundation.notify({title:t('Update'),message:t('Some live updates expired. Refresh the session to read its saved content.'),level:'info'});for(const event of result.events||[])for(const listener of listeners)listener(event.data);eventCursor=result.cursor;}catch{}finally{polling=false;}},1500);cleanup.push(()=>clearInterval(poll));
 const fileView=roots.get('files');fileView.append(element('h2','Files'));const actions=element('div',undefined,{className:'workspace-actions'});for(const[label,action]of[['Refresh',refreshFiles],['Open in Explorer',()=>native('openExplorer')],['Sync now',()=>native('sync')],['Lock drive',async()=>{await native('lockVault');await refreshFiles();}],['Import files',async()=>{const paths=await native('chooseFiles');if(paths?.length)await native('importSelected',{paths});await refreshFiles();}]])actions.append(button(label,action));
 const fileSearch=element('mfe-search');fileSearch.setAttribute('label','Search files');fileSearch.setAttribute('scope','workspace-files');const fileList=element('div',undefined,{id:'workspace-files-list',className:'workspace-list'});fileView.append(actions,fileSearch,fileList);fileSearch.addEventListener('search-change',()=>renderFiles(currentFiles));modules.set('fileSearch',fileSearch);
 foundation.registerCommands(definitions.map(([id,title])=>({id:`workspace:${id}`,label:{en:title,yue:strings[title]},run:()=>openView(id)})).concat(catalog.documents.map(document=>({id:`document:${document.id}`,label:document.title,description:document.category,run:()=>{openView('documentation');modules.get('documentation').open(document.id);}}))));
 activate(foundation.model.getState().activeTabId);renderWordingStatus();renderFiles([]);refreshWorkspaceLanguage();
 window.addEventListener('pagehide',()=>{wordingGeneration++;authenticated=false;vocabulary=emptyVocabulary();copyObserver.disconnect();for(const module of modules.values())module.destroy?.();adapter.dispose();foundation.destroy();for(const dispose of cleanup)dispose();},{once:true});
}
let currentFiles=[];
async function refreshFiles(){try{const state=await native('getState');currentFiles=state.files||[];await renderFiles(currentFiles);}catch(error){report(error);}}
async function renderFiles(files){const list=document.querySelector('#workspace-files-list');if(!list)return;const search=modules.get('fileSearch');const rows=search?await search.filter(files.map(file=>({id:file.id,text:file.path}))):[];if(rows===null)return;list.replaceChildren();if(!paired){list.append(element('p','Disconnected. Pair an unlocked desktop to use native actions.'));return;}for(const row of rows){const file=files.find(f=>f.id===row.id);const entry=element('div',undefined,{className:'workspace-file'});entry.append(element('span',file.path));for(const[label,action]of[['Open',()=>native('fileAction',{id:file.id,action:'open'})],['Keep offline',()=>native('fileAction',{id:file.id,action:'keepOffline'})],['Export copy',async()=>{const destination=await native('chooseExport',{name:file.path.split(/[\\/]/).at(-1)});if(destination)await native('fileAction',{id:file.id,action:'export',destination});}]])entry.append(button(label,action));list.append(entry);}if(!rows.length)list.append(element('p','No matching files.'));
}
start().catch(error=>{const loading=document.querySelector('#workspace-loading');if(loading)loading.textContent=`Workspace unavailable: ${error.message}. Reload to retry.`;});
