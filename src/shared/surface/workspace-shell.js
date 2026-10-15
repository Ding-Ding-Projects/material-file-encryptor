import { SurfaceElement, element, register, localized, text } from './registry.js';
import { controlIcon } from './controls.js';
import './context-menu.js';
import './group-manager.js';
import {homeEntries,homeGlyph,HOME_ID,HOME_LABEL,HOME_DESCRIPTION} from './home.js';
export class WorkspaceShell extends SurfaceElement {
  connectedCallback(){this.render();}
  configure({model,language,labels,onActivate,onContext}){Object.assign(this,{model,language,labels,onActivate,onContext});this.render();}
  render(){
    const offset=this.tabsHost?.scrollLeft||0;
    this.style(`.bar{display:flex;align-items:center;gap:2px;min-width:0}.tabs{flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}.tabs::-webkit-scrollbar{display:none}md-tabs{min-width:max-content}md-primary-tab{max-width:240px} .tab-name{display:block;max-width:210px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}md-text-button{flex:none;min-width:40px}md-icon-button{flex:none}md-icon-button[hidden]{display:none}.tabs[data-empty]{min-height:48px}`);
    if(!this.model)return;
    this.selected??=new Set();
    this.tabsHost=element('div',{class:'tabs'});
    this.manager=element('mfe-group-manager');this.manager.model=this.model;this.manager.language=this.language;this.manager.changed=()=>this.renderTabs();
    this.previous=element('md-icon-button',{'aria-label':this.t('Scroll workspace tabs left','向左捲動工作區分頁'),title:this.t('Scroll workspace tabs left','向左捲動工作區分頁'),onclick:()=>this.scrollTabs(-1)});
    this.next=element('md-icon-button',{'aria-label':this.t('Scroll workspace tabs right','向右捲動工作區分頁'),title:this.t('Scroll workspace tabs right','向右捲動工作區分頁'),onclick:()=>this.scrollTabs(1)});this.previous.append(controlIcon('chevron-left',document));this.next.append(controlIcon('chevron-right',document));
    this.homeButton=element('md-icon-button',{class:'home-button','aria-label':this.t('Home','首頁'),title:this.t('Home: every section in one place','首頁：所有區段集中一頁'),onclick:()=>this.openHome()});this.homeButton.append(homeGlyph(HOME_ID));
    this.newButton=element('md-icon-button',{class:'new-tab','aria-label':this.t('New tab','新分頁'),title:this.t('New tab (Ctrl+T)','新分頁 (Ctrl+T)'),'aria-haspopup':'menu','aria-keyshortcuts':'Control+T',onclick:event=>this.openNewTab(event.currentTarget,event)});this.newButton.append(homeGlyph('add'));
    this.tabsHost.addEventListener('scroll',()=>this.updateOverflow());
    this.shadowRoot.append(element('div',{class:'bar'},[this.homeButton,this.previous,this.tabsHost,this.next,this.newButton]),this.manager);
    this.renderTabs();this.tabsHost.scrollLeft=offset;
    this.resizeObserver?.disconnect();if(typeof ResizeObserver!=='undefined'){this.resizeObserver=new ResizeObserver(()=>this.updateOverflow());this.resizeObserver.observe(this.tabsHost);}
  }
  disconnectedCallback(){this.resizeObserver?.disconnect();}
  label(tab){return localized(this.labels?.get(tab.id)||tab.label,this.language);}
  activate(id){
    const state=this.model.getState();
    if(!state.tabs.some(tab=>tab.id===id)){
      const saved=state.closedTabs.find(tab=>tab.id===id),label=this.labels?.get(id)||saved?.label;
      if(!label||!this.model.openTab({...saved,id,label:localized(label,'en')}))return false;
    }
    if(!this.model.activateTab(id))return false;
    this.onActivate?.(id);this.render();return true;
  }
  viewRows(state,all=false){
    const open=new Map(state.tabs.map(tab=>[tab.id,tab]));
    const rows=all?[...new Set([...open.keys(),...state.closedTabs.map(tab=>tab.id),...(this.labels?.keys()||[])])].map(id=>open.get(id)||state.closedTabs.find(tab=>tab.id===id)||{id,label:this.labels.get(id),group:'',pinned:false}):state.tabs;
    return rows.map(tab=>({...tab,closed:!open.has(tab.id),text:this.label(tab)}));
  }
  activateView(tab){this.pendingFocusId=tab.id;return this.activate(tab.id);}
  scrollTabs(direction){this.tabsHost.scrollBy({left:direction*Math.max(120,this.tabsHost.clientWidth*.75),behavior:'auto'});this.updateOverflow();}
  updateOverflow(){if(!this.tabsHost)return;const max=this.tabsHost.scrollWidth-this.tabsHost.clientWidth,overflowing=max>1;if(this.previous){this.previous.disabled=this.tabsHost.scrollLeft<=1;this.previous.hidden=!overflowing;}if(this.next){this.next.disabled=this.tabsHost.scrollLeft>=max-1;this.next.hidden=!overflowing;}}
  /** Opens or focuses the Home tab, which lists every destination as a card. */
  openHome(){if(this.labels&&!this.labels.has(HOME_ID))this.labels.set(HOME_ID,HOME_LABEL);return this.activateView({id:HOME_ID});}
  /** The compact "mini home": a searchable menu of every destination plus tab management, anchored to the New tab button. */
  openNewTab(anchor=this.newButton,event){
    const state=this.model.getState();
    this.onContext?.({anchor,event,target:this,language:this.language,align:'end',items:[
      {label:HOME_LABEL,description:HOME_DESCRIPTION,run:()=>this.openHome()},
      ...homeEntries(this.labels,state).map(entry=>({label:entry.label,description:entry.description,run:()=>this.activateView(entry)})),
      ...this.managementItems(state)
    ]});
  }
  managementItems(state){return [
      {label:text('Restore closed tab','還原已關閉分頁'),disabled:!state.closedTabs.length,run:()=>{const id=this.model.restoreTab();if(id)this.activate(id);}},
      {label:text('Manage groups','管理群組'),run:()=>this.manager.open()},
      {label:text('Close selected tabs','關閉所選分頁'),disabled:!this.selected.size,run:()=>{this.model.closeTabs([...this.selected]);this.selected.clear();this.onActivate?.(this.model.getState().activeTabId);this.render();}},
      ...state.groups.map(group=>({label:text(`${group.collapsed?'Expand':'Collapse'} group: ${group.label}`,`${group.collapsed?'展開':'收合'}群組：${group.label}`),run:()=>{this.model.collapseGroup(group.id,!group.collapsed);this.renderTabs();}}))
  ];}
  renderTabs(){
    if(!this.model||!this.tabsHost)return;
    const state=this.model.getState(),offset=this.tabsHost.scrollLeft;
    const tabs=element('md-tabs',{'aria-label':this.t('Open workspace tabs','已開啟工作區分頁')});
    for(const tab of this.viewRows(state)){
      if(state.groups.find(group=>group.id===tab.group)?.collapsed&&tab.id!==state.activeTabId)continue;
      const label=this.label(tab),name=element('span',{class:'tab-name',text:`${tab.pinned?'● ':''}${this.selected.has(tab.id)?'✓ ':''}${label}`});
      const node=element('md-primary-tab',{active:tab.id===state.activeTabId,'aria-label':label,title:label},[name]);
      node.setAttribute('data-tab-id',tab.id);
      node.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey){if(this.selected.has(tab.id))this.selected.delete(tab.id);else this.selected.add(tab.id);this.renderTabs();}else this.activateView(tab);});
      node.addEventListener('contextmenu',event=>{event.preventDefault();this.openTabMenu(tab,node,event);});
      node.addEventListener('keydown',event=>{if((event.shiftKey&&event.key==='F10')||event.key==='ContextMenu'){event.preventDefault();this.openTabMenu(tab,node,event);}});
      tabs.append(node);
    }
    this.tabsHost.replaceChildren(tabs);this.tabsHost.scrollLeft=offset;
    if(this.pendingFocusId){const node=[...tabs.children].find(tab=>tab.dataset?.tabId===this.pendingFocusId);node?.focus();node?.scrollIntoView?.({block:'nearest',inline:'nearest'});this.pendingFocusId=null;}
    this.updateOverflow();
  }
  openAllTabs(anchor,event){
    const state=this.model.getState();
    this.onContext?.({anchor,event,target:this,language:this.language,items:[
      ...this.viewRows(state,true).map(tab=>({label:text(`${localized(this.labels?.get(tab.id)||tab.label,'en')} · ${tab.closed?'Closed':'Open'}`,`${localized(this.labels?.get(tab.id)||tab.label,'yue')} · ${tab.closed?'已關閉':'已開啟'}`),run:()=>this.activateView(tab)})),
      ...this.managementItems(state)
    ]});
  }
  openTabMenu(tab,anchor,event){this.onContext?.({anchor,event,target:tab,language:this.language,items:[
    {label:tab.pinned?text('Unpin tab','取消固定分頁'):text('Pin tab','固定分頁'),run:()=>{this.model.pinTab(tab.id,!tab.pinned);this.render();}},
    {label:text('Close tab','關閉分頁'),shortcut:tab.id===this.model.getState().activeTabId?'Control+w':undefined,disabled:tab.pinned||this.model.getState().tabs.length<2,run:()=>{this.model.closeTab(tab.id);this.onActivate?.(this.model.getState().activeTabId);this.render();}},
    {label:text('Restore closed tab','還原已關閉分頁'),shortcut:'Control+Shift+t',disabled:!this.model.getState().closedTabs.length,run:()=>{const id=this.model.restoreTab();if(id)this.activate(id);}},
    {label:text('Select or deselect tab','選取或取消選取分頁'),run:()=>{if(this.selected.has(tab.id))this.selected.delete(tab.id);else this.selected.add(tab.id);this.renderTabs();}},
    {label:text('Move tab left','將分頁向左移'),run:()=>{this.model.moveTab(tab.id,this.model.getState().tabs.findIndex(t=>t.id===tab.id)-1);this.render();}},
    {label:text('Move tab right','將分頁向右移'),run:()=>{this.model.moveTab(tab.id,this.model.getState().tabs.findIndex(t=>t.id===tab.id)+1);this.render();}},
    {label:text('Close other unpinned tabs','關閉其他未固定分頁'),run:()=>{this.model.closeOtherTabs(tab.id);this.onActivate?.(this.model.getState().activeTabId);this.render();}},
    {label:text('Close unpinned tabs to the right','關閉右方未固定分頁'),run:()=>{this.model.closeTabsToRight(tab.id);this.onActivate?.(this.model.getState().activeTabId);this.render();}},
    ...this.model.getState().groups.map(group=>({label:text(`Move to ${group.label}`,`移至 ${group.label}`),run:()=>{this.model.groupTab(tab.id,group.id);this.render();}})),
    {label:text('Create or rename groups','建立或重新命名群組'),run:()=>this.manager.open()},
    {label:text('Remove from group','移出群組'),disabled:!tab.group,run:()=>{this.model.groupTab(tab.id,'');this.render();}}
  ]});}
}
register('mfe-workspace-shell',WorkspaceShell);
