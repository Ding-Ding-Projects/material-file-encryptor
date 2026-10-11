import { SurfaceElement, element, register, localized } from './registry.js';
import './search.js';
import {commandSearchText} from './command-search.js';
import './context-menu.js';
export class CommandPalette extends SurfaceElement {
  constructor(){super();this.commands=[];this.full=false;}
  connectedCallback(){this.render();}
  setCommands(commands){this.commands=commands;this.renderResults();}
  open(){this.returnFocus=document.activeElement;this.dialog.show();queueMicrotask(()=>this.search.input.focus());}
  close(){this.dialog.close();this.returnFocus?.focus();}
  render(){this.style(`md-dialog{width:min(760px,calc(100vw - 32px));max-height:90vh;--md-dialog-container-color:var(--md-sys-color-surface-container,#f0f1f7)}md-dialog.full{width:calc(100vw - 24px);height:calc(100vh - 24px)}.result{padding:8px 0;display:flex;gap:12px;align-items:center;border-bottom:1px solid var(--md-sys-color-outline-variant,#ccc)}.label{flex:1;min-width:0;overflow-wrap:anywhere}.list{overflow:auto;max-height:55vh}.head{display:flex;justify-content:space-between}`);
    this.dialog=element('md-dialog',{'aria-label':this.t('Command palette','指令面板')});
    this.search=element('mfe-search',{label:this.t('Search commands and settings','搜尋指令及設定'),scope:'command-palette'});this.search.language=this.language;
    this.results=element('div',{class:'list','aria-live':'polite'});
    const size=element('md-text-button',{text:this.t('Change size','更改大小'),onclick:()=>{this.full=!this.full;this.dialog.classList.toggle('full',this.full);try{this.storage?.setItem('mfe.palette.size',this.full?'full':'card');}catch{}}});
    try{this.full=this.storage?.getItem('mfe.palette.size')==='full';}catch{}this.dialog.classList.toggle('full',this.full);
    this.dialog.append(element('div',{slot:'headline',class:'head'},[element('span',{text:this.t('Command palette','指令面板')}),size]),element('div',{slot:'content',class:'stack'},[this.search,this.results]),element('md-text-button',{slot:'actions',text:this.t('Close','關閉'),onclick:()=>this.close()}));
    this.choiceMenu=element('mfe-context-menu',{hidden:true});
    this.shadowRoot.append(this.dialog,this.choiceMenu);this.search.addEventListener('search-change',()=>this.renderResults());
    this.dialog.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp'].includes(event.key))return;const controls=[...this.results.querySelectorAll('md-text-button,md-switch,md-slider,md-outlined-text-field')].filter(c=>!c.disabled);if(!controls.length)return;const active=event.composedPath().find(node=>controls.includes(node));const index=controls.indexOf(active);controls[(index+(event.key==='ArrowDown'?1:controls.length-1))%controls.length].focus();event.preventDefault();});this.renderResults();
  }
  async renderResults(){if(!this.results)return;const rows=await this.search.filter(this.commands.map(command=>({id:command.id,text:commandSearchText(command,this.language)})));if(!rows)return;this.results.replaceChildren();for(const row of rows){const command=this.commands.find(item=>item.id===row.id);const title=localized(command.label,this.language);const label=element('span',{class:'label'},[element('strong',{text:title}),element('span',{text:localized(command.description,this.language)})]);let control;
      if(command.control?.type==='switch'){control=element('md-switch',{'aria-label':title,selected:!!command.control.get(),onchange:()=>this.change(command,control.selected)});}
      else if(command.control?.type==='checkbox'){control=element('md-checkbox',{'aria-label':title,checked:!!command.control.get(),onchange:()=>this.change(command,control.checked)});}
      else if(command.control?.type==='range'){control=element('md-slider',{'aria-label':row.text,min:command.control.min??0,max:command.control.max??100,value:command.control.get(),onchange:()=>this.change(command,control.value)});}
      else if(command.control?.type==='text'){control=element('md-outlined-text-field',{label:row.text,value:command.control.get(),onchange:()=>this.change(command,control.value)});}
      else if(command.control?.type==='number'){control=element('md-outlined-text-field',{label:title,type:'number',min:command.control.min,max:command.control.max,value:String(command.control.get()),onchange:()=>{const value=Number(control.value);if(Number.isFinite(value)&&(command.control.min===undefined||value>=command.control.min)&&(command.control.max===undefined||value<=command.control.max))this.change(command,value);else{control.error=true;control.errorText=this.t('Value is outside the allowed range.','數值超出可用範圍。');}}});}
      else if(command.control?.type==='select'){const options=command.control.options||[];const selected=options.find(option=>option.value===command.control.get());control=element('md-outlined-button',{text:selected?localized(selected.label,this.language):this.t('Choose value','選擇數值'),onclick:()=>this.choiceMenu.open({anchor:control,language:this.language,items:options.map(option=>({label:option.label,run:()=>this.change(command,option.value)}))})});}
      else control=element('md-text-button',{text:this.t('Open','開啟'),disabled:!!command.disabled,onclick:async()=>{this.close();try{await command.run();}catch(error){this.emit('command-error',{error});}}});
      control.disabled=!!command.disabled;
      const content=[label,control];if(command.reveal)content.push(element('md-text-button',{text:this.t('Show in page','在頁面中顯示'),onclick:()=>{this.close();command.reveal();}}));
      this.results.append(element('div',{class:'result'},content));
    }if(!rows.length)this.results.append(element('p',{role:'status',text:this.t('No matching commands','沒有相符指令')}));}
  async change(command,value){try{await command.control.set(value);}catch(error){this.emit('command-error',{error});}this.renderResults();}
}
register('mfe-command-palette',CommandPalette);
