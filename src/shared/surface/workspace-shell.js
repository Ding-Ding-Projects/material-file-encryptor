import { SurfaceElement, element, register, localized, text } from './registry.js';
import './search.js';
import './provenance.js';
import './context-menu.js';
import './group-manager.js';
export class WorkspaceShell extends SurfaceElement {
  connectedCallback(){this.render();}
  configure({model,language,labels,onActivate,onContext}){Object.assign(this,{model,language,labels,onActivate,onContext});this.render();}
  render(){this.style(`.bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.tabs{min-width:0;flex:1;overflow:auto}md-tabs{min-width:max-content}.tools{display:flex;gap:4px;flex-wrap:wrap}.groups{display:flex;gap:4px;flex-wrap:wrap}.status{font-size:12px}mfe-search{margin-top:8px} .heading{font-size:14px;margin:0} .search-row{margin-bottom:8px}`);
    if(!this.model)return;
    this.search=element('mfe-search',{label:this.t('Find open tabs','搜尋已開分頁')});this.search.language=this.language;
    this.tabsHost=element('div',{class:'tabs'});this.groupsHost=element('div',{class:'groups'});this.selected??=new Set();
    this.manager=element('mfe-group-manager');this.manager.model=this.model;this.manager.language=this.language;this.manager.changed=()=>this.renderTabs();
    const restore=element('md-outlined-button',{text:this.t('Restore closed tab','還原已關閉分頁'),disabled:!this.model.getState().closedTabs.length,onclick:()=>{const id=this.model.restoreTab();if(id)this.activate(id);}});
    const find=element('md-text-button',{text:this.t('Find tabs','搜尋分頁'),'aria-expanded':'false',onclick:()=>{this.search.hidden=!this.search.hidden;find.setAttribute('aria-expanded',String(!this.search.hidden));if(!this.search.hidden)this.search.input.focus();}});
    this.search.hidden=true;
    const manage=element('md-outlined-button',{text:this.t('Manage groups','管理群組'),onclick:()=>this.manager.open()});
    const bulk=element('md-text-button',{text:this.t('Close selected tabs','關閉所選分頁'),onclick:()=>{this.model.closeTabs([...this.selected]);this.selected.clear();this.onActivate?.(this.model.getState().activeTabId);this.render();}});
    this.shadowRoot.append(element('div',{class:'bar'},[this.tabsHost,element('div',{class:'tools'},[find,restore,manage,bulk])]),this.groupsHost,this.search,this.manager);
    this.search.addEventListener('search-change',()=>this.renderTabs());this.renderTabs();
  }
  label(tab){return localized(this.labels?.get(tab.id)||tab.label,this.language);}
  activate(id){if(this.model.activateTab(id)){this.onActivate?.(id);this.render();}}
  async renderTabs(){const state=this.model.getState();const rows=await this.search.filter(state.tabs.map(tab=>({id:tab.id,text:`${this.label(tab)} ${state.groups.find(g=>g.id===tab.group)?.label||tab.group}`})));if(!rows)return;const tabs=element('md-tabs',{'aria-label':this.t('Workspace tabs','工作區分頁')});
    for(const row of rows){const tab=state.tabs.find(x=>x.id===row.id);if(state.groups.find(g=>g.id===tab.group)?.collapsed&&tab.id!==state.activeTabId&&!this.search.query)continue;const label=`${this.selected.has(tab.id)?'✓ ':''}${tab.pinned?'● ':''}${this.label(tab)}`;const node=element('md-primary-tab',{text:label,active:tab.id===state.activeTabId,'aria-label':label});node.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey){if(this.selected.has(tab.id))this.selected.delete(tab.id);else this.selected.add(tab.id);this.renderTabs();}else this.activate(tab.id);});node.addEventListener('contextmenu',e=>{e.preventDefault();this.openTabMenu(tab,node);});node.addEventListener('keydown',e=>{if((e.shiftKey&&e.key==='F10')||e.key==='ContextMenu'){e.preventDefault();this.openTabMenu(tab,node);}});tabs.append(node);}
    this.tabsHost.replaceChildren(tabs);this.groupsHost.replaceChildren();const active=state.tabs.find(x=>x.id===state.activeTabId);if(active)this.groupsHost.append(element('md-text-button',{text:this.t('Tab actions','分頁操作'),onclick:e=>this.openTabMenu(active,e.currentTarget)}));
    for(const group of state.groups)this.groupsHost.append(element('md-text-button',{text:`${group.collapsed?'▸':'▾'} ${group.label}`,'aria-expanded':String(!group.collapsed),onclick:()=>{this.model.collapseGroup(group.id,!group.collapsed);this.renderTabs();}}));
    if(!rows.length)this.tabsHost.append(element('p',{role:'status',text:this.t('No matching tabs','沒有相符分頁')}));
  }
  openTabMenu(tab,anchor){this.onContext?.({anchor,language:this.language,items:[
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
