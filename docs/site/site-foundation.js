import {mountVisitorPersonalization,VISITOR_PREFIX} from './visitor-personalization.js';
import {mountVisitorAccess} from './visitor-access.js';
import {confirmDestructiveAction} from '../../src/shared/surface/workflow-confirm.js';

/** Two-key super confirmation for a registered destructive action on the public pages. Resolves true only after both keys and the full slider. */
export function confirmSiteDestructive(id,{affected,language=()=>'en'}={}){
  return confirmDestructiveAction(document.body,id,{affected,getLanguage:language});
}
import {cantonese,localized} from './locales.js';
import {mountSurfaceFoundation} from '../../src/renderer/features/shell/index.js';
import {element, text, localized as localizedLabel} from '../../src/shared/surface/registry.js';
import '../../src/shared/surface/search.js';
import {control as materialControl,upgradeControls,controlKind,CONTROL_SELECTOR,setControlLanguage} from '../../src/shared/surface/controls.js';

const preparedDocuments=new WeakSet();
/** Prepare real components before callers retain nodes or attach listeners. */
export function preparePublicDocumentControls(document){
 for(const old of document.querySelectorAll('button.icon-button,button#search-clear,button#part-limit-clear,button.button-tonal,button.button-outline,a#preview-download')){
  const props=Object.fromEntries([...old.attributes].map(attribute=>[attribute.name,attribute.value]));
  props.type='button';props.disabled=old.disabled;
  const icon=old.classList.contains('icon-button')||['search-clear','part-limit-clear'].includes(old.id);
  const primitive=icon?'md-icon-button':old.classList.contains('button-tonal')?'md-filled-tonal-button':old.classList.contains('button-outline')?'md-outlined-button':'md-filled-button';
  const children=[...old.childNodes];
  if(icon&&!old.querySelector('svg')){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','24');svg.setAttribute('height','24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');path.setAttribute('fill','currentColor');path.setAttribute('d','M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12Z');svg.append(path);children.splice(0,children.length,svg);}
  const next=materialControl(primitive,props,children,document);old.replaceWith(next);
 }
 upgradeControls(document);
 const limit=document.getElementById('part-limit'),clear=document.getElementById('part-limit-clear');
 if(limit&&clear){clear.slot='trailing-icon';limit.append(clear);}
 document.querySelectorAll('.select-field>svg').forEach(node=>node.remove());
 if(preparedDocuments.has(document))return;
 document.getElementById('preferences-close')?.addEventListener('click',()=>document.getElementById('preferences-dialog').close());
 const header=document.querySelector('.site-header');
 if(header){const measure=()=>document.documentElement.style.setProperty('--site-header-height',header.getBoundingClientRect().height+'px');measure();if(typeof ResizeObserver==='function')new ResizeObserver(measure).observe(header);document.fonts?.ready.then(measure);}
 setControlLanguage(document,document.documentElement.dataset.language||'en');
 preparedDocuments.add(document);
}

const routeNames = [['index.html','Home','首頁'],['library.html','Documentation library','文件總覽'],['wiki.html','Wiki','維基'],['gallery.html','Capture gallery','畫面紀錄集']];
// Namespace shared chrome state per document, without storing content or local file metadata.
export function scopedStorage(storage, scope) {
 const prefix='mfe.public-document.'+scope+'.', memory=new Map();let persistent=!!storage;
 return {get persistent(){return persistent;},getItem(key){const name=prefix+key;if(persistent)try{const value=storage.getItem(name);memory.set(name,value);return value;}catch{persistent=false;}return memory.get(name)??null;},setItem(key,value){const name=prefix+key;memory.set(name,String(value));if(persistent)try{storage.setItem(name,String(value));}catch{persistent=false;}},removeItem(key){const name=prefix+key;memory.delete(name);if(persistent)try{storage.removeItem(name);}catch{persistent=false;}}};
}
export function mountSiteFoundation({document,storage,getPreferences,onPreferences,onSearch,onSchool,onCanonicalSettings=()=>{},onAuthentication=()=>{}}={}) {
 const main=document.querySelector('#main');
 const base=new URL('./',new URL(import.meta.url));
 let schoolEnabled=false;
 const language=()=>schoolEnabled?'en':getPreferences().language;
 const host=element('mfe-public-document-tools',{class:'container public-document-tools'});
 main.before(host);
 const role=element('p',{class:'small',text:'Documentation, release downloads and browser preferences. This page does not open vaults, mount drives or run native product actions.'});host.append(role);
 const current=document.title.split(' · ')[0];
 const sections=[...main.children].filter(node=>node.matches('section[id],div.surface-band[id]'));
 const home=location.pathname.endsWith('/index.html')||location.pathname.endsWith('/');
 const sectionLabels={overview:text('Overview','概覽'),workflow:text('How it works','使用方法'),offline:text('Offline access','離線存取'),security:text('Security','保安'),screenshots:text('Capture gallery','畫面紀錄集'),documentation:text('Documentation','文件'),faq:text('Questions','常見問題'),download:text('Release downloads','版本下載')};
 const views=home?sections.map(node=>({id:node.id,label:sectionLabels[node.id]||text(node.id,node.id),root:node})):[];
 const tabs=views.length?views.map(({id,label})=>({id,label})): [{id:'document',label:current}];
 const local=scopedStorage(storage,location.pathname);
 const activate=id=>{if(views.length)for(const view of views)view.root.hidden=view.id!==id;};
 const download=({name,mime,content})=>{const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=element('a',{href:url,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const foundation=mountSurfaceFoundation({host,before:role,storage:local,language:language(),tabs,onActivate:activate,onExport:download});
 const toolsPanel=element('div',{id:'page-tools-panel',class:'page-tools-panel',hidden:true});
 const toolsButton=element('md-outlined-button',{id:'page-tools-toggle',text:localizedLabel(text('Page tools','頁面工具'),language()),'aria-expanded':'false','aria-controls':toolsPanel.id});
 const setToolsOpen=open=>{
  if(!open&&toolsPanel.contains(document.activeElement))toolsButton.focus();
  toolsPanel.hidden=!open;toolsButton.setAttribute('aria-expanded',String(open));
  if(!open&&toolsPanel.contains(foundation.palette.returnFocus))foundation.palette.returnFocus=toolsButton;
 };
 toolsButton.addEventListener('click',()=>setToolsOpen(toolsPanel.hidden));
 host.prepend(toolsButton,toolsPanel);
 for(const node of [...host.children])if(node.matches('mfe-build-provenance,mfe-top-bar,mfe-workspace-shell'))toolsPanel.append(node);
 // Home content and notification delivery remain outside the collapsed chrome.
 const newTab=foundation.shell.openNewTab,activateView=foundation.shell.activateView;
 foundation.shell.openNewTab=function(...args){setToolsOpen(true);return newTab.apply(this,args);};
 foundation.shell.activateView=function(...args){setToolsOpen(true);return activateView.apply(this,args);};
 const toolsEscape=event=>{if(event.key==='Escape'&&!toolsPanel.hidden&&event.composedPath().includes(toolsPanel)){setToolsOpen(false);toolsButton.focus();}};
 toolsPanel.addEventListener('keydown',toolsEscape);
 const paletteReturn=()=>{const target=foundation.palette.returnFocus;if(target&&(target===toolsButton||!target.isConnected||toolsPanel.hidden&&toolsPanel.contains(target)))toolsButton.focus();};
 foundation.palette.shadowRoot.addEventListener('closed',paletteReturn,true);

 async function openPreferenceControl(resolveControl){
  const dialog=document.getElementById('preferences-dialog'),inner=dialog.dialog;
  const opening=inner&&!inner.open?new Promise(resolve=>{const finish=()=>{inner.removeEventListener('opened',finish);inner.removeEventListener('closed',finish);resolve();};inner.addEventListener('opened',finish);inner.addEventListener('closed',finish);}):inner?.updateComplete;
  onPreferences();await opening;if(!dialog.open)return;
  const control=resolveControl();await control?.updateComplete;control?.focus();control?.scrollIntoView({block:'center'});
 }
 const openSection=id=>{if(!views.some(view=>view.id===id))return;foundation.model.openTab({id,label:localizedLabel(views.find(view=>view.id===id).label,language())});foundation.shell.activate(id);};
 activate(foundation.model.getState().activeTabId);
 const commands=routeNames.map(([route,en,yue])=>({id:'route:'+route,label:text(en,yue),description:text('Read this documentation page','閱讀此說明頁面'),run:()=>location.assign(new URL(route,base))}));
 commands.push(...views.map(view=>({id:'section:'+view.id,label:view.label,run:()=>openSection(view.id)})));
 commands.push({id:'preferences',label:text('Website preferences','網站偏好設定'),run:onPreferences});
 // Index actual settings controls, including upload and reset, and reveal the exact control.
 for(const control of document.querySelector('#preferences-dialog').querySelectorAll(CONTROL_SELECTOR)) {
  if(!control.id)continue;
  const caption=document.querySelector(`label[for="${control.id}"]`)?.cloneNode(true);caption?.querySelectorAll('output').forEach(node=>node.remove());
  const label=(caption?.textContent||control.getAttribute('aria-label')||control.textContent||control.id).trim();
  const kind=controlKind(control);
  const binding=kind==='range'?{type:'range',min:Number(control.min),max:Number(control.max),get:()=>Number(control.value),set:value=>{control.value=Number(value);control.dispatchEvent(new Event('input',{bubbles:true}));}}:['checkbox','switch'].includes(kind)?{type:'switch',get:()=>control.checked,set:value=>{control.checked=value;control.dispatchEvent(new Event('change',{bubbles:true}));}}:kind==='select'?{type:'select',get:()=>control.value,options:[...control.options].map(option=>({value:option.value,label:text(option.textContent,cantonese[option.textContent]||option.textContent)})),set:value=>{control.value=value;control.dispatchEvent(new Event('change',{bubbles:true}));}}:undefined;
  const reveal=()=>openPreferenceControl(()=>control);
  commands.push({id:'setting:'+control.id,control:binding,label:{en:label,yue:cantonese[label]||label},description:text('Website preference','網站偏好設定'),reveal,run:reveal});
 }
 foundation.registerCommands(commands);
 const oldSearch=document.querySelector('#doc-search'), oldRow=oldSearch?.closest('.search-field');
 const guides=[...document.querySelectorAll('.guide')];
 const original=new Map(guides.map(node=>[node,`${node.dataset.search||''} ${node.textContent}`]));
 let generation=0,settingsGeneration=0,destroyed=false;
 const search=element('mfe-search',{label:'Find in this page','data-site-search':'content'});
 if(oldRow){oldRow.hidden=true;document.querySelector('label[for="doc-search"]')?.setAttribute('hidden','');oldRow.after(search);}else main.prepend(search);
 const refresh=async()=>{const ticket=++generation;const rows=await search.filter(guides.map((node,index)=>({id:String(index),text:original.get(node)+' '+node.textContent})));if(!rows||ticket!==generation)return;const ids=new Set(rows.map(row=>row.id));guides.forEach((node,index)=>node.hidden=!ids.has(String(index)));for(const group of document.querySelectorAll('[data-gallery-group]')){group.hidden=![...group.querySelectorAll('.guide')].some(node=>!node.hidden);for(const link of document.querySelectorAll('[data-gallery-group-link]'))if(link.dataset.galleryGroupLink===group.id)link.hidden=group.hidden;}const empty=document.querySelector('#no-results');if(empty)empty.hidden=rows.length>0;const status=document.querySelector('#search-status');if(status)status.textContent=`${rows.length} / ${guides.length}`;};
 search.addEventListener('search-change',()=>{if(oldSearch)oldSearch.value=search.query;refresh();});
 onSearch({refresh,get query(){return search.query;},setQuery:value=>{search.query=value;search.input.value=value;},clear:()=>{search.query='';search.input.value='';refresh();}});
 if(oldSearch)oldSearch.addEventListener('input',()=>{search.query=oldSearch.value;search.input.value=search.query;refresh();});
 const dialog=document.querySelector('#preferences-dialog'), settingsSearch=element('mfe-search',{label:'Search website preferences','data-site-search':'settings'});
 const content=dialog.querySelector('.dialog-content');content.prepend(settingsSearch);
 // Results teleport to controls; do not hide unmatched labels or detach their descriptions.
 const results=element('div',{class:'site-setting-results',role:'status'});settingsSearch.after(results);
 let settings=commands.filter(command=>command.id.startsWith('setting:'));
 const refreshSettings=async()=>{
  const ticket=++settingsGeneration;
  const rows=await settingsSearch.filter(settings.map(command=>({id:command.id,text:command.label.en+' '+command.label.yue})));
  if(!rows||ticket!==settingsGeneration||destroyed)return;
  const summary=rows.length?text(`${rows.length} preferences match.`,`${rows.length} 個偏好設定符合。`):text('No matching preferences. Try another search.','搵唔到符合嘅偏好設定，請試另一個搜尋。');
  results.replaceChildren(element('p',{text:localizedLabel(summary,language())}),...rows.map(row=>{const command=settings.find(item=>item.id===row.id);return element('md-text-button',{text:localizedLabel(command.label,language()),onclick:command.reveal||command.run});}));
 };
 settingsSearch.addEventListener('search-change',refreshSettings);
 const changed=event=>{if(!event.target.closest('#preferences-dialog'))return;foundation.notify({title:language()==='yue'?'偏好設定已更改':'Preference changed',message:language()==='yue'?'此頁面已套用目前選擇。':'This page now uses the current selection.',level:'info'});};
 dialog.addEventListener('change',changed);
 const visibleCommands=()=>commands.filter(command=>!schoolEnabled||!command.id.startsWith('setting:')||(command.id==='setting:theme-select'||!['setting:language-select','setting:success-tone','setting:search-tone','setting:language','setting:funnyEnglish','setting:funnyCantonese','setting:vocabulary-file','setting:vocabulary-status','setting:vocabulary-reset'].includes(command.id)));
 const handleLanguage=event=>{const value=schoolEnabled?'en':event.detail.language;toolsButton.textContent=localizedLabel(text('Page tools','頁面工具'),value);setControlLanguage(document,value);foundation.setLanguage(value);search.setAttribute('label',localized('Find in this page',value));if(search.language!==value)search.setLanguage(value);settingsSearch.setAttribute('label',localized('Search website preferences',value));if(settingsSearch.language!==value)settingsSearch.setLanguage(value);if(settingsSearch.query||results.childElementCount)refreshSettings();foundation.palette.setCommands(visibleCommands());role.textContent=value==='yue'?'說明文件、版本下載同瀏覽器偏好設定。此頁面唔會開啟保險庫、掛載磁碟或執行本機操作。':value==='bilingual'?'Documentation, downloads and browser preferences. 此頁面提供說明文件、下載同瀏覽器偏好設定。 No native actions. 唔會執行本機操作。':'Documentation, release downloads and browser preferences. This page does not open vaults, mount drives or run native product actions.';};
 window.addEventListener('site-language',handleLanguage);
 // Reveal before the browser's default anchor action, including an unchanged fragment.
 // Leave URL updates and history entries to native navigation.
 const temporaryFocus=new Map();let anchorFrame=0;
 const revealAnchor=fragment=>{
  let id;try{id=decodeURIComponent(fragment.slice(1));}catch{return;}
  const target=document.getElementById(id);if(!target)return;
  const view=views.find(view=>view.root===target||view.root.contains(target));if(view)openSection(view.id);
  if(target.closest('.guide')){search.query='';search.input.value='';if(oldSearch)oldSearch.value='';guides.forEach(node=>node.hidden=false);for(const group of document.querySelectorAll('[data-gallery-group]'))group.hidden=false;refresh();}
  for(let node=target;node;node=node.parentElement)if(node.localName==='details')node.open=true;
  if(!target.hasAttribute('tabindex')&&target.tabIndex<0){
   target.setAttribute('tabindex','-1');
   const restore=()=>{target.removeAttribute('tabindex');target.removeEventListener('blur',restore);temporaryFocus.delete(target);};
   temporaryFocus.set(target,restore);target.addEventListener('blur',restore);
  }
  target.focus({preventScroll:true});
  cancelAnimationFrame(anchorFrame);anchorFrame=requestAnimationFrame(()=>{if(!destroyed&&target.isConnected)target.scrollIntoView({block:'start'});});
 };
 const hash=()=>revealAnchor(location.hash);
 const anchorClick=event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.composedPath().find(node=>node?.matches?.('a[href]'));
  if(!link||link.hasAttribute('download'))return;
  const target=link.getAttribute('target')||document.querySelector('base[target]')?.getAttribute('target');
  if(target&&target.toLowerCase()!=='_self')return;
  let url;try{url=new URL(link.href,document.baseURI);}catch{return;}
  if(url.origin!==location.origin||url.pathname!==location.pathname||url.search!==location.search||!url.hash)return;
  revealAnchor(url.hash);
 };
 document.addEventListener('click',anchorClick);window.addEventListener('hashchange',hash);hash();
 const shared=event=>{if(event.detail?.verified!==true||typeof event.detail?.school?.enabled!=='boolean')return;const enabled=event.detail.school.enabled;schoolEnabled=enabled;for(const group of document.querySelectorAll('[data-school-suppressed]'))group.hidden=enabled;settings=commands.filter(command=>command.id.startsWith('setting:')&&(!enabled||(command.id==='setting:theme-select'||!['setting:language-select','setting:success-tone','setting:search-tone','setting:language','setting:funnyEnglish','setting:funnyCantonese','setting:vocabulary-file','setting:vocabulary-status','setting:vocabulary-reset'].includes(command.id))));foundation.palette.setCommands(visibleCommands());++settingsGeneration;results.replaceChildren();for(const id of ['language-select','success-tone','search-tone','emoji-toggle','vocabulary-file','vocabulary-reset','english-tone-reset','cantonese-tone-reset']){const control=document.getElementById(id);if(control){control.hidden=enabled;const label=document.querySelector(`label[for="${id}"]`);if(label)label.hidden=enabled;}}onSchool(enabled);foundation.setLanguage(enabled?'en':language());};
 window.addEventListener('site-shared-settings',shared);
 // Keep the old controls only as migration/programmatic bindings. Visitors use the real adapters.
 const legacy=element('div',{hidden:true,class:'legacy-public-preferences'});
 for(const node of [...content.children])if(node!==settingsSearch&&node!==results)legacy.append(node);
 content.append(legacy);
 const wording=element('section',{'data-school-suppressed':'','aria-label':'Personal vocabulary'});
 const heading=[...legacy.querySelectorAll('h3')].find(node=>node.textContent==='Personal vocabulary');
 if(heading){let node=heading;while(node){const next=node.nextSibling;wording.append(node);node=next;}}
 content.append(wording);
 const accessHost=element('section',{'data-visitor-access':''}),personalizationHost=element('section',{'data-visitor-personalization':''});content.append(accessHost,personalizationHost);
 let visitorAccess=null,visitorPersonalization=null;
 visitorAccess=mountVisitorAccess(accessHost,{storage,foundation,language:language(),schoolMode:()=>schoolEnabled,
  onAuthentication:authenticated=>{visitorPersonalization?.onAuthentication?.(authenticated);return Promise.resolve(onAuthentication(authenticated,visitorAccess)).catch(()=>foundation.notify({title:localized('Website preferences',language()),message:localized('Default wording is active.',language()),level:'warning'}));},
  notify:message=>foundation.notify({title:localized('Website preferences',language()),message,level:'warning'})});
 const hadVisitorSettings=(()=>{try{return storage.getItem(VISITOR_PREFIX+'material-file-encryptor.local-ux.v1')!==null;}catch{return false;}})();
 const prior={...getPreferences()};
 visitorPersonalization=mountVisitorPersonalization(personalizationHost,{storage,foundation,bundledFontBaseURL:new URL('./fonts/',import.meta.url).href,historyCredentialStore:visitorAccess.historyCredentialStore,historyManager:visitorAccess.historyManager,isAuthenticated:()=>visitorAccess.authenticated,credentialCapabilities:visitorAccess.credentialCapabilities,
  onChange:value=>{shared({detail:{verified:true,school:value.school}});onCanonicalSettings(value);visitorAccess?.setLanguage(value.school.enabled?'en':value.language);},
  onLock:target=>visitorAccess.openLockWizard(target.id||'public-element-'+crypto.randomUUID(),target)});
 if(!hadVisitorSettings)visitorPersonalization.store.update({language:prior.language,emoji:prior.emoji},'website preferences migrated');
 const settingsMap=[['language','Language','language','select',[['en','English'],['yue','Cantonese'],['bilingual','Bilingual']]],['funnyEnglish','English playfulness','language','range',1,5],['funnyCantonese','Cantonese playfulness','language','range',1,5],['emoji','Show emojis in dialogs and message boxes','language','switch'],['theme','Theme','appearance','select',[['system','System'],['light','Light'],['dark','Dark']]],['density','Density','appearance','select',[['compact','Compact'],['comfortable','Comfortable'],['spacious','Spacious']]],['fontFamily','Font family','appearance','text'],['fontScale','Font scale','appearance','range',.75,2],['fontWeight','Font weight','appearance','range',100,900],['motion','Motion','appearance','select',[['system','System'],['full','Full'],['reduced','Reduced']]],['displayName','Display name','appearance','text']];
 // Retire the old hidden preference commands, then index the adapter's canonical live values.
 for(let index=commands.length-1;index>=0;index--)if(commands[index].id.startsWith('setting:'))commands.splice(index,1);
 for(const [key,label,section,type,options,max]of settingsMap){const reveal=()=>openPreferenceControl(()=>{visitorPersonalization.open(section);return personalizationHost.querySelector(`[data-setting="${label}"]`)?.querySelector(CONTROL_SELECTOR);});commands.push({id:'setting:'+key,label:text(label,cantonese[label]||label),control:{type,min:type==='range'?options:undefined,max,options:type==='select'?options.map(([value,title])=>({value,label:text(title,cantonese[title]||title)})):undefined,get:()=>visitorPersonalization.getSettings()[key],set:value=>visitorPersonalization.store.update({[key]:value},'website preference changed')},reveal,run:reveal});}
 for(const id of ['vocabulary-file','vocabulary-status','vocabulary-reset']){const node=document.getElementById(id);if(!node)continue;if(id==='vocabulary-status')node.tabIndex=-1;const label=id==='vocabulary-file'?'Choose a vocabulary JSON file':id==='vocabulary-reset'?'Reset vocabulary':'Personal vocabulary';commands.push({id:'setting:'+id,label:text(label,cantonese[label]||label),run:()=>openPreferenceControl(()=>node)});}
 commands.push({id:'visitor-access',label:text('Visitor local access','訪客本機存取'),run:()=>openPreferenceControl(()=>accessHost.querySelector(CONTROL_SELECTOR))});
 settings=commands.filter(command=>command.id.startsWith('setting:'));foundation.palette.setCommands(visibleCommands());
 const accessLanguage=event=>visitorAccess.setLanguage(schoolEnabled?'en':event.detail.language);window.addEventListener('site-language',accessLanguage);
 fetch(new URL('site-provenance.json',base),{credentials:'omit',cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Build provenance unavailable');return response.json();}).then(value=>foundation.setProvenance(value)).catch(()=>foundation.setProvenance(null));
 const destroy=()=>{if(destroyed)return;destroyed=true;++generation;++settingsGeneration;cancelAnimationFrame(anchorFrame);toolsPanel.removeEventListener('keydown',toolsEscape);foundation.palette.shadowRoot.removeEventListener('closed',paletteReturn,true);foundation.shell.openNewTab=newTab;foundation.shell.activateView=activateView;toolsButton.remove();toolsPanel.remove();for(const restore of temporaryFocus.values())restore();visitorPersonalization?.destroy();visitorAccess?.destroy();window.removeEventListener('site-language',accessLanguage);foundation.destroy();window.removeEventListener('site-language',handleLanguage);window.removeEventListener('site-shared-settings',shared);window.removeEventListener('hashchange',hash);document.removeEventListener('click',anchorClick);settingsSearch.removeEventListener('search-change',refreshSettings);dialog.removeEventListener('change',changed);window.removeEventListener('pagehide',pagehide);};
 const pagehide=event=>{if(!event.persisted)destroy();};window.addEventListener('pagehide',pagehide);
 return {...foundation,visitorAccess,visitorPersonalization,destroy};
}
