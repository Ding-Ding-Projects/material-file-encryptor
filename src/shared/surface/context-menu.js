import { SurfaceElement, element, register, localized } from './registry.js';
import './search.js';
export class ContextMenu extends SurfaceElement {
  connectedCallback(){this.render();}
  open({items,anchor,language='en'}) {this.items=items;this.language=language;this.anchor=anchor;this.hidden=false;this.render();this.search.input.focus();}
  close(){this.hidden=true;this.anchor?.focus();}
  render(){
    this.style(`:host{position:fixed;z-index:10000;inset:12vh 16px auto auto;width:min(420px,calc(100vw - 32px));padding:16px;max-height:75vh;overflow:auto;background:var(--md-sys-color-surface-container,#f0f1f7);border:1px solid var(--md-sys-color-outline,#777);border-radius:16px;box-shadow:0 8px 24px #0004}.items{display:grid}md-text-button{width:100%;justify-content:flex-start}.shortcut{margin-inline-start:16px}`);
    this.setAttribute('role','dialog');this.setAttribute('aria-label',this.t('Context actions','操作選單'));
    this.search=element('mfe-search',{label:this.t('Filter actions','篩選操作')});this.search.language=this.language;
    this.itemsHost=element('div',{class:'items',role:'menu'});
    this.shadowRoot.append(this.search,this.itemsHost,element('md-text-button',{text:this.t('Close','關閉'),onclick:()=>this.close()}));
    this.search.addEventListener('search-change',()=>this.renderItems());this.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();if(this.search.query){this.search.query='';this.search.input.value='';this.renderItems();}else this.close();} if(event.key==='ArrowDown'||event.key==='ArrowUp'){const buttons=[...this.itemsHost.querySelectorAll('md-text-button:not([disabled])')];const index=buttons.indexOf(this.shadowRoot.activeElement);buttons[(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();event.preventDefault();}};this.renderItems();
  }
  async renderItems(){const list=await this.search.filter((this.items||[]).map((item,index)=>({id:String(index),text:localized(item.label,this.language)})));if(!list)return;this.itemsHost.replaceChildren();for(const row of list){const item=this.items[Number(row.id)];const button=element('md-text-button',{role:'menuitem',disabled:!!item.disabled,text:row.text,onclick:()=>{if(!item.disabled){this.close();item.run();}}});if(item.shortcut){button.setAttribute('aria-keyshortcuts',item.shortcut);button.append(element('span',{'aria-hidden':'true',class:'shortcut',text:item.shortcut}));}this.itemsHost.append(button);}if(!list.length)this.itemsHost.append(element('p',{role:'status',text:this.t('No matching actions','沒有相符操作')}));}
}
register('mfe-context-menu',ContextMenu);
