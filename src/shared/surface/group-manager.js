import {SurfaceElement,element,register} from './registry.js';
import './search.js';
export class GroupManager extends SurfaceElement {
 connectedCallback(){this.render();}
 open(){this.render();this.dialog.show();}
 render(){this.style('md-dialog{width:min(660px,calc(100vw - 24px));max-height:90vh}.groups{display:grid;gap:12px}.group{padding:12px;border:1px solid var(--md-sys-color-outline-variant,#bbb);border-radius:12px}');
  this.dialog=element('md-dialog',{'aria-label':this.t('Manage tab groups','管理分頁群組')});
  this.search=element('mfe-search',{label:this.t('Search tab groups','搜尋分頁群組'),scope:'tab-groups'});this.search.language=this.language;
  const name=element('md-outlined-text-field',{label:this.t('New group name','新群組名稱'),maxLength:128});
  const add=element('md-outlined-button',{text:this.t('Create group','建立群組'),onclick:()=>{const label=name.value.trim();if(!label)return;const id=this.model?.createGroup({id:`group-${crypto.randomUUID()}`,label});if(id){name.value='';this.refresh();this.changed?.();}}});
  this.list=element('div',{class:'groups'});
  this.dialog.append(element('span',{slot:'headline',text:this.t('Manage tab groups','管理分頁群組')}),element('div',{slot:'content',class:'stack'},[this.search,element('div',{class:'row'},[name,add]),this.list]),element('md-text-button',{slot:'actions',text:this.t('Close','關閉'),onclick:()=>this.dialog.close()}));
  this.shadowRoot.append(this.dialog);this.search.addEventListener('search-change',()=>this.refresh());this.refresh();
 }
 async refresh(){if(!this.model)return;const groups=this.model.getState().groups;const rows=await this.search.filter(groups.map(g=>({id:g.id,text:g.label})));if(!rows)return;this.list.replaceChildren();for(const row of rows){const group=groups.find(g=>g.id===row.id);const name=element('md-outlined-text-field',{label:this.t('Group name','群組名稱'),value:group.label,maxLength:128,onchange:()=>{if(this.model.renameGroup(group.id,name.value)){this.changed?.();}else name.value=group.label;}});const collapsed=element('md-switch',{selected:group.collapsed,'aria-label':this.t('Collapse group','收起群組'),onchange:()=>{this.model.collapseGroup(group.id,collapsed.selected);this.changed?.();}});this.list.append(element('section',{class:'group stack'},[name,element('label',{class:'row'},[collapsed,document.createTextNode(this.t('Collapse group','收起群組'))]),element('md-text-button',{text:this.t('Remove group (keep tabs)','移除群組（保留分頁）'),onclick:()=>{this.model.removeGroup(group.id,{ungroup:true});this.refresh();this.changed?.();}})]));}if(!rows.length)this.list.append(element('p',{role:'status',text:this.t('No matching groups','沒有相符群組')}));}
}
register('mfe-group-manager',GroupManager);
