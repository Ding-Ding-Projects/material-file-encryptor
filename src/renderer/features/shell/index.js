import '../../../shared/surface/material.js';
import {createSurfaceModel} from '../../../shared/surface/model.js';
import {element,localized,text} from '../../../shared/surface/registry.js';
import '../../../shared/surface/workspace-shell.js';
import '../../../shared/surface/command-palette.js';
import '../../../shared/surface/notification-center.js';
import {shouldOpenRegisteredView} from '../../../shared/surface/view-registration.js';

/** Mounts reusable chrome without mutating host content or acquiring host capabilities. */
export function mountSurfaceFoundation({host,before=null,storage,language='en',provenance,tabs=[],onActivate=()=>{},commands=[],onExport}={}) {
  if(!(host instanceof HTMLElement))throw new TypeError('A host element is required');
  tabs=[...tabs];
  const model=createSurfaceModel({storage,storageKey:'mfe.surface.tabs.v1',tabs:tabs.map(tab=>({...tab,label:localized(tab.label,'en')}))});
  const labels=new Map(tabs.map(tab=>[tab.id,typeof tab.label==='object'?tab.label:{en:tab.label,yue:tab.labelYue??tab.label}]));
  const shell=element('mfe-workspace-shell');const build=element('mfe-build-provenance');
  const context=element('mfe-context-menu',{hidden:true});const palette=element('mfe-command-palette');palette.storage=storage;
  const notifications=element('mfe-notification-center',{hidden:true});
  const toolbar=element('mfe-surface-actions');
  const views=new Map();let activeLanguage=language;let hostCommands=commands;
  let messageTimer;
  const live=element('mfe-live-notification',{role:'status','aria-live':'polite'});
  if(!customElements.get('mfe-surface-actions'))customElements.define('mfe-surface-actions',class extends HTMLElement{constructor(){super();this.attachShadow({mode:'open'});}});
  if(!customElements.get('mfe-live-notification'))customElements.define('mfe-live-notification',class extends HTMLElement{});
  // Upgrade newly defined elements before accessing their component internals.
  customElements.upgrade(toolbar);
  const showView=id=>{for(const [key,view]of views){view.root.hidden=key!==id;}onActivate(id);};
  const configure=()=>{
    shell.configure({model,language:activeLanguage,labels,onActivate:showView,onContext:options=>context.open(options)});
    build.language=activeLanguage;build.value=provenance;
    palette.language=activeLanguage;palette.render();palette.setCommands([...tabs.map(tab=>({id:`view:${tab.id}`,label:labels.get(tab.id),run:()=>{model.openTab({id:tab.id,label:localized(labels.get(tab.id),'en')});shell.activate(tab.id);}})),...hostCommands]);
    notifications.configure({model,language:activeLanguage,onExport});
    const sheet=new CSSStyleSheet();sheet.replaceSync(':host{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}');toolbar.shadowRoot.adoptedStyleSheets=[sheet];
    toolbar.shadowRoot.replaceChildren(element('md-outlined-button',{text:localized(text('Commands · Ctrl+Shift+F','指令 · Ctrl+Shift+F'),activeLanguage),onclick:()=>palette.open()}),element('md-outlined-button',{text:localized(text('Notifications','通知'),activeLanguage),onclick:()=>{notifications.hidden=!notifications.hidden;}}));
  };
  host.insertBefore(shell,before);host.insertBefore(build,before);host.insertBefore(toolbar,before);host.insertBefore(notifications,before);host.append(live);document.body.append(palette,context);configure();
  const keydown=event=>{
    if(!(event.ctrlKey||event.metaKey))return;
    if(event.shiftKey&&event.key.toLowerCase()==='f'){event.preventDefault();palette.open();}
    else if(event.shiftKey&&event.key.toLowerCase()==='t'){event.preventDefault();const id=model.restoreTab();if(id)shell.activate(id);}
    else if(!event.shiftKey&&event.key.toLowerCase()==='w'){event.preventDefault();if(model.closeTab(model.getState().activeTabId)){showView(model.getState().activeTabId);shell.render();}}
    else {const match=hostCommands.find(c=>c.shortcut?.toLowerCase()===[event.ctrlKey?'control':'meta',event.shiftKey?'shift':null,event.key.toLowerCase()].filter(Boolean).join('+'));if(match&&!match.disabled){event.preventDefault();Promise.resolve(match.run()).catch(error=>api.notify({title:'Command failed',message:error.message,level:'error'}));}}
  };
  document.addEventListener('keydown',keydown);
  const api={model,shell,palette,notifications,
    notify(input){const id=model.addNotification(input);notifications.renderEntries();live.textContent=`${input.title}: ${input.message||''}`;clearTimeout(messageTimer);messageTimer=setTimeout(()=>{live.textContent='';},8000);return id;},
    setLanguage(value){activeLanguage=['en','yue','bilingual'].includes(value)?value:'en';configure();},
    setProvenance(value){provenance=value;build.value=value;},
    registerCommands(value){hostCommands=[...hostCommands,...value];configure();},
    registerViews(value){const active=model.getState().activeTabId;for(const view of value){if(!view.id||!(view.root instanceof HTMLElement))throw new TypeError('A view id and root are required');views.set(view.id,view);if(!tabs.some(t=>t.id===view.id))tabs.push(view);labels.set(view.id,view.label);if(shouldOpenRegisteredView(model.getState(),view.id))model.openTab({id:view.id,label:localized(view.label,'en')});}model.activateTab(active);configure();showView(model.getState().activeTabId);},
    destroy(){clearTimeout(messageTimer);document.removeEventListener('keydown',keydown);for(const node of[shell,build,toolbar,notifications,live,palette,context])node.remove();}
  };
  palette.addEventListener('command-error',event=>api.notify({title:localized(text('Command failed','指令未能完成'),activeLanguage),message:event.detail.error.message,level:'error'}));
  return api;
}
