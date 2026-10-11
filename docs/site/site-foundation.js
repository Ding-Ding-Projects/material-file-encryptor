import {mountSurfaceFoundation} from '../../src/renderer/features/shell/index.js';
import {element, text} from '../../src/shared/surface/registry.js';
import '../../src/shared/surface/search.js';

const routeNames = [['index.html','Home','首頁'],['library.html','Documentation library','文件總覽'],['wiki.html','Wiki','維基'],['gallery.html','Capture gallery','畫面紀錄集']];
// Namespace shared chrome state per document, without storing content or local file metadata.
export function scopedStorage(storage, scope) {
 const prefix='mfe.public-document.'+scope+'.';
 return {getItem:key=>storage.getItem(prefix+key),setItem:(key,value)=>storage.setItem(prefix+key,value),removeItem:key=>storage.removeItem(prefix+key)};
}
export function mountSiteFoundation({document,storage,getPreferences,onPreferences,onSearch,onSchool}={}) {
 const main=document.querySelector('#main');
 const base=new URL('./',new URL(import.meta.url));
 const language=()=>getPreferences().language;
 const host=element('mfe-public-document-tools',{class:'container public-document-tools'});
 main.before(host);
 const role=element('p',{class:'small',text:'Documentation, release downloads and browser preferences. This page does not open vaults, mount drives or run native product actions.'});host.append(role);
 const current=document.title.split(' · ')[0];
 const sections=[...main.children].filter(node=>node.matches('section[id],div.surface-band[id]'));
 const home=location.pathname.endsWith('/index.html')||location.pathname.endsWith('/');
 const views=home?sections.map(node=>({id:node.id,label:node.querySelector('h1,h2')?.textContent?.replace(/\s+/g,' ').trim()||node.id,root:node})):[];
 const tabs=views.length?views.map(({id,label})=>({id,label})): [{id:'document',label:current}];
 const local=scopedStorage(storage,location.pathname);
 const activate=id=>{if(views.length)for(const view of views)view.root.hidden=view.id!==id;};
 const download=({name,mime,content})=>{const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=element('a',{href:url,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const foundation=mountSurfaceFoundation({host,before:role,storage:local,language:language(),tabs,onActivate:activate,onExport:download});
 const openSection=id=>{if(!views.some(view=>view.id===id))return;foundation.model.openTab({id,label:views.find(view=>view.id===id).label});foundation.shell.activate(id);};
 activate(foundation.model.getState().activeTabId);
 const commands=routeNames.map(([route,en,yue])=>({id:'route:'+route,label:text(en,yue),description:text('Read this documentation page','閱讀此說明頁面'),run:()=>location.assign(new URL(route,base))}));
 commands.push({id:'preferences',label:text('Website preferences','網站偏好設定'),run:onPreferences});
 // Index actual settings controls, including upload and reset, and reveal the exact control.
 for(const control of document.querySelectorAll('#preferences-dialog input,#preferences-dialog select,#preferences-dialog button')) {
  if(!control.id)continue;
  const label=document.querySelector(`label[for="${control.id}"]`)?.textContent||control.getAttribute('aria-label')||control.textContent||control.id;
  commands.push({id:'setting:'+control.id,label:{en:label,yue:label},description:text('Website preference','網站偏好設定'),reveal:()=>{onPreferences();control.focus();control.scrollIntoView({block:'center'});},run:()=>{onPreferences();control.focus();}});
 }
 foundation.registerCommands(commands);
 const oldSearch=document.querySelector('#doc-search'), oldRow=oldSearch?.closest('.search-field');
 const guides=[...document.querySelectorAll('.guide')];
 const original=new Map(guides.map(node=>[node,`${node.dataset.search||''} ${node.textContent}`]));
 let generation=0;
 const search=element('mfe-search',{label:'Find in this page','data-site-search':'content'});
 if(oldRow){oldRow.hidden=true;oldRow.after(search);}else main.prepend(search);
 const refresh=async()=>{const ticket=++generation;const rows=await search.filter(guides.map((node,index)=>({id:String(index),text:original.get(node)+' '+node.textContent})));if(!rows||ticket!==generation)return;const ids=new Set(rows.map(row=>row.id));guides.forEach((node,index)=>node.hidden=!ids.has(String(index)));for(const group of document.querySelectorAll('[data-gallery-group]')){group.hidden=![...group.querySelectorAll('.guide')].some(node=>!node.hidden);for(const link of document.querySelectorAll('[data-gallery-group-link]'))if(link.dataset.galleryGroupLink===group.id)link.hidden=group.hidden;}const empty=document.querySelector('#no-results');if(empty)empty.hidden=rows.length>0;const status=document.querySelector('#search-status');if(status)status.textContent=`${rows.length} / ${guides.length}`;};
 search.addEventListener('search-change',()=>{if(oldSearch)oldSearch.value=search.query;refresh();});
 onSearch({refresh,get query(){return search.query;},setQuery:value=>{search.query=value;search.input.value=value;},clear:()=>{search.query='';search.input.value='';refresh();}});
 if(oldSearch)oldSearch.addEventListener('input',()=>{search.query=oldSearch.value;search.input.value=search.query;refresh();});
 const dialog=document.querySelector('#preferences-dialog'), settingsSearch=element('mfe-search',{label:'Search website preferences','data-site-search':'settings'});
 const content=dialog.querySelector('.dialog-content');content.prepend(settingsSearch);
 // Results teleport to controls; do not hide unmatched labels or detach their descriptions.
 const results=element('div',{class:'site-setting-results',role:'status'});settingsSearch.after(results);
 let settings=commands.filter(command=>command.id.startsWith('setting:'));
 settingsSearch.addEventListener('search-change',async()=>{const rows=await settingsSearch.filter(settings.map(command=>({id:command.id,text:command.label.en})));if(!rows)return;results.replaceChildren(...rows.map(row=>{const command=settings.find(item=>item.id===row.id);return element('md-text-button',{text:command.label.en,onclick:command.reveal});}));});
 const changed=event=>{if(!event.target.closest('#preferences-dialog'))return;foundation.notify({title:language()==='yue'?'偏好設定已更改':'Preference changed',message:language()==='yue'?'此頁面已套用目前選擇。':'This page now uses the current selection.',level:'info'});};
 dialog.addEventListener('change',changed);
 const handleLanguage=event=>{const value=event.detail.language;foundation.setLanguage(value);search.setLanguage(value);settingsSearch.setLanguage(value);role.textContent=value==='yue'?'說明文件、版本下載同瀏覽器偏好設定。此頁面唔會開啟保險庫、掛載磁碟或執行本機操作。':value==='bilingual'?'Documentation, downloads and browser preferences. 此頁面提供說明文件、下載同瀏覽器偏好設定。 No native actions. 唔會執行本機操作。':'Documentation, release downloads and browser preferences. This page does not open vaults, mount drives or run native product actions.';};
 window.addEventListener('site-language',handleLanguage);
 const hash=()=>{const target=document.getElementById(decodeURIComponent(location.hash.slice(1)));const view=views.find(view=>view.root===target||view.root.contains(target));if(view)openSection(view.id);};window.addEventListener('hashchange',hash);hash();
 const shared=event=>{if(event.detail?.verified!==true||typeof event.detail?.school?.enabled!=='boolean')return;const enabled=event.detail.school.enabled;for(const group of document.querySelectorAll('[data-school-suppressed]'))group.hidden=enabled;settings=commands.filter(command=>command.id.startsWith('setting:')&&(!enabled||command.id==='setting:theme-select'));foundation.palette.setCommands(commands.filter(command=>!enabled||!command.id.startsWith('setting:')||command.id==='setting:theme-select'));results.replaceChildren();for(const id of ['language-select','success-tone','search-tone','emoji-toggle','vocabulary-file','vocabulary-reset','english-tone-reset','cantonese-tone-reset']){const control=document.getElementById(id);if(control){control.hidden=enabled;const label=document.querySelector(`label[for="${id}"]`);if(label)label.hidden=enabled;}}onSchool(enabled);foundation.setLanguage(enabled?'en':language());};
 window.addEventListener('site-shared-settings',shared);
 fetch(new URL('site-provenance.json',base),{credentials:'omit',cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Build provenance unavailable');return response.json();}).then(value=>foundation.setProvenance(value)).catch(()=>foundation.setProvenance(null));
 window.addEventListener('pagehide',()=>{foundation.destroy();window.removeEventListener('site-language',handleLanguage);window.removeEventListener('site-shared-settings',shared);window.removeEventListener('hashchange',hash);dialog.removeEventListener('change',changed);},{once:true});
 return foundation;
}
