import { SurfaceElement, element, register } from './registry.js';
import { mountWorkbenchTools } from './workbench-tools.js';

export class SurfaceSearch extends SurfaceElement {
  constructor() { super(); this.query = ''; this.regex = false; this.flags = 'iu'; this.pending = new Map(); this.generation = 0; }
  connectedCallback() { this.render(); }
  disconnectedCallback() { this.generation++; for (const stop of this.pending.values()) stop(); this.pending.clear(); }
  setLanguage(language) { this.language=language; this.render(); }
  render() {
    this.generation++;for(const stop of this.pending.values())stop();this.pending.clear();
    this.style(`.builder{margin-top:8px;padding:16px;border-radius:16px;border:1px solid var(--md-sys-color-outline,#74777f);background:var(--md-sys-color-surface-container,#f0f1f7);max-height:65vh;overflow:auto}.builder[hidden]{display:none}.tokens{display:flex;flex-wrap:wrap;gap:4px}pre{white-space:pre-wrap;overflow-wrap:anywhere} .query{min-width:120px;flex:1} .row{align-items:center} h3{margin:0}`);
    this.input=element('md-outlined-text-field',{label:this.getAttribute('label') || this.t('Search','搜尋'),value:this.query,maxLength:512,class:'query',oninput:()=> { this.query=this.input.value; this.emitChange(); }});
    this.toggle=element('md-outlined-button',{text:this.t('Regex builder','正則表達式工具'),'aria-expanded':'false',onclick:()=>{this.builder.hidden=!this.builder.hidden;this.toggle.setAttribute('aria-expanded',String(!this.builder.hidden));}});
    const enabled=element('md-switch',{selected:this.regex,'aria-label':this.t('Use regular expression','使用正則表達式'),onchange:()=>{this.regex=enabled.selected;this.emitChange();}});
    const flags=element('md-outlined-text-field',{label:this.t('Flags (d g i m s u v)','旗標 (d g i m s u v)'),value:this.flags,maxLength:7,oninput:()=>{this.flags=flags.value;this.emitChange();}});this.flagsControl=flags;
    const sample=element('md-outlined-text-field',{type:'textarea',rows:3,label:this.t('Test text (4096 characters maximum)','測試文字（最多 4096 字）'),maxLength:4096});
    const replacement=element('md-outlined-text-field',{label:this.t('Replacement template ($1, $<name>)','替換範本 ($1, $<name>)'),maxLength:512});
    const result=element('pre',{'aria-live':'polite',text:this.t('No test run yet.','尚未執行測試。')});
    const tokenBox=element('div',{class:'tokens'});
    for(const [label,value] of [['^','$START'],['$','$END'],['[a-z]','[a-z]'],['\\p{L}','\\p{L}'],['Named group','(?<name>text)'],['Alternative','(?:one|two)'],['Optional','?'],['One or more','+'],['Lookahead','(?=text)'],['Lookbehind','(?<=text)']]) {
      tokenBox.append(element('md-text-button',{text:label,onclick:()=>{this.query += value==='$START'?'^':value==='$END'?'$':value;this.input.value=this.query;this.regex=true;enabled.selected=true;this.emitChange();}}));
    }
    const test=element('md-outlined-button',{text:this.t('Test expression','測試表達式'),onclick:async()=>{const started=performance.now(); const value=await this.evaluate({sample:sample.value,replacement:replacement.value}); result.textContent=JSON.stringify({...value,elapsedMs:Math.round(performance.now()-started)},null,2);}});
    const escaped=element('md-text-button',{text:this.t('Escape query as literal','將查詢轉為純文字'),onclick:()=>{this.query=this.query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');this.input.value=this.query;this.emitChange();}});
    this.builder=element('section',{hidden:true,class:'builder stack','aria-label':this.t('Regular expression workbench','正則表達式工作台')},[
      element('h3',{text:this.t('JavaScript RegExp · local worker · 150 ms budget','JavaScript RegExp · 本機 worker · 150 毫秒上限')}),
      element('label',{class:'row'},[enabled,document.createTextNode(this.t('Use regular expression','使用正則表達式'))]), flags,tokenBox,escaped,sample,replacement,test,
      element('p',{text:this.t('Supports Unicode classes, anchors, groups, lookarounds and replacement captures. The capability matrix below probes this engine directly. Evaluation stops after 150 ms; complex expressions may time out.','支援 Unicode 字元類別、錨點、群組、環視及替換擷取。下方功能表直接檢查此引擎。運算在 150 毫秒後停止，複雜表達式可能逾時。')}),result]);
    this.status=element('div',{class:'status','aria-live':'polite'});
    this.shadowRoot.append(element('div',{class:'row'},[this.input,this.toggle]),this.builder,this.status);
    tokenBox.remove();
    this.workbench=mountWorkbenchTools(this,{sample,replacement,result,enabled});
  }
  emitChange(){this.generation++;this.workbench?.explain();this.emit('search-change',{query:this.query,regex:this.regex,flags:this.flags});}
  evaluate(extra) {
    if(this.query.length>512 || !/^[dgimsuv]*$/.test(this.flags) || new Set(this.flags).size!==this.flags.length) return Promise.resolve({error:this.t('Invalid pattern or flags.','表達式或旗標無效。')});
    return new Promise(resolve=>{
      const worker=new Worker(new URL('./regex-worker.js',import.meta.url),{type:'module'});
      const key=Symbol(); let timer;
      const finish=value=>{worker.terminate();clearTimeout(timer);this.pending.delete(key);resolve(value);};
      this.pending.set(key,()=>finish({error:'Search cancelled'}));
      timer=setTimeout(()=>finish({error:this.t('Expression exceeded 150 ms. Simplify the pattern.','表達式超過 150 毫秒。請簡化。')}),150);
      worker.onmessage=event=>finish(event.data); worker.onerror=()=>finish({error:this.t('Expression could not be evaluated.','未能運算表達式。')});
      worker.postMessage({pattern:this.query,flags:this.flags,...extra});
    });
  }
  async filter(rows) {
    const generation=this.generation;
    if(!this.regex) {if(this.status)this.status.textContent='';const q=this.query.toLocaleLowerCase();return rows.filter(row=>row.text.toLocaleLowerCase().includes(q));}
    if(rows.length>10000){if(this.status)this.status.textContent=this.t('Too many rows for regex. Narrow the collection first.','資料太多，請先縮小範圍。');return [];}
    const result=await this.evaluate({rows});
    if(generation!==this.generation)return null;
    if(this.status)this.status.textContent=result.error || this.t(`${result.matches.length} matches`,`${result.matches.length} 個結果`);
    return result.error?[]:rows.filter(row=>result.matches.includes(row.id));
  }
}
register('mfe-search',SurfaceSearch);
