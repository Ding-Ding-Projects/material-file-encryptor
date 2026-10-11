import { SurfaceElement, element, register } from './registry.js';
import './search.js';
export class NotificationCenter extends SurfaceElement {
  connectedCallback(){this.render();}
  configure({model,language='en',onExport}){this.model=model;this.language=language;this.onExport=onExport;this.render();}
  render(){this.style(`:host{background:var(--md-sys-color-surface-container,#f0f1f7);border:1px solid var(--md-sys-color-outline-variant,#bbb);border-radius:16px;padding:16px;max-height:75vh;overflow:auto}.entry{padding:12px;border-bottom:1px solid var(--md-sys-color-outline-variant,#bbb);overflow-wrap:anywhere}.entry.unread{border-inline-start:3px solid var(--md-sys-color-primary,#5466a8)}h2{margin:0;font-size:20px}h3{margin:0;font-size:15px}`);
    this.search=element('mfe-search',{label:this.t('Search notification history','搜尋通知記錄')});this.search.language=this.language;
    const unread=element('md-switch',{selected:!!this.unread,'aria-label':this.t('Unread only','只顯示未讀'),onchange:()=>{this.unread=unread.selected;this.renderEntries();}});
    const filters=element('div',{class:'row'},[unread,element('span',{text:this.t('Unread only','只顯示未讀')})]);
    for(const level of ['all','info','success','warning','error'])filters.append(element('md-text-button',{text:({all:this.t('All','全部'),info:this.t('Information','資訊'),success:this.t('Success','完成'),warning:this.t('Warning','警告'),error:this.t('Errors','錯誤')})[level],'aria-pressed':String((this.level||'all')===level),onclick:()=>{this.level=level;this.render();}}));
    this.entries=element('div',{'aria-live':'polite'});
    const actions=element('div',{class:'row'},[
      element('md-text-button',{text:this.t('Mark all read','全部標示為已讀'),onclick:()=>{for(const n of this.model?.getState().notifications||[])this.model.readNotification(n.id);this.renderEntries();}}),
      ...['json','csv'].map(format=>element('md-outlined-button',{text:`${this.t('Export','匯出')} ${format.toUpperCase()}`,disabled:!this.onExport,onclick:()=>this.onExport?.({name:`notifications.${format}`,mime:format==='json'?'application/json':'text/csv',content:this.model.exportNotifications(format)})}))]);
    this.shadowRoot.append(element('h2',{text:this.t('Notifications','通知')}),this.search,filters,this.entries,actions);
    this.search.addEventListener('search-change',()=>this.renderEntries());this.renderEntries();
  }
  async renderEntries(){if(!this.model)return;const candidates=this.model.getState().notifications.filter(n=>(!this.unread||!n.read)&&(!this.level||this.level==='all'||n.level===this.level));const rows=await this.search.filter(candidates.map(n=>({id:n.id,text:`${n.title} ${n.message}`})));if(!rows)return;this.entries.replaceChildren();for(const row of rows){const n=candidates.find(x=>x.id===row.id);this.entries.append(element('section',{class:`entry ${n.read?'':'unread'}`},[element('h3',{text:n.title}),element('p',{text:n.message}),element('p',{class:'muted',text:`${n.level} · ${new Date(n.createdAt).toLocaleString()}`}),element('div',{class:'row'},[element('md-text-button',{text:n.read?this.t('Mark unread','標示為未讀'):this.t('Mark read','標示為已讀'),onclick:()=>{this.model.readNotification(n.id,!n.read);this.renderEntries();}}),element('md-text-button',{text:this.t('Dismiss','移除'),onclick:()=>{this.model.dismissNotification(n.id);this.renderEntries();}})])]));}if(!rows.length)this.entries.append(element('p',{role:'status',text:this.t('No matching notifications','沒有相符通知')}));}
}
register('mfe-notification-center',NotificationCenter);
