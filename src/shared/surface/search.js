import { SurfaceElement, element, register } from './registry.js';
import { mountWorkbenchTools } from './workbench-tools.js';
import { createWarmWorkerRunner } from './warm-worker.js';

export class SurfaceSearch extends SurfaceElement {
  constructor() { super(); this.query = ''; this.regex = false; this.flags = 'iu'; this.pending = new Map(); this.generation = 0; }
  connectedCallback() { this.render(); }
  disconnectedCallback() { this.closeBuilder();this.generation++; for (const stop of this.pending.values()) stop(); this.pending.clear(); this.releaseRunner(); }
  setLanguage(language) { this.language=language; this.render(); }
  render() {
    this.closeBuilder();this.generation++;for(const stop of this.pending.values())stop();this.pending.clear();
    this.style(`.builder{position:fixed;inset:auto;margin:0;width:min(620px,calc(100vw - 24px));z-index:11000;padding:16px;border-radius:16px;border:1px solid var(--md-sys-color-outline,#74777f);background:var(--md-sys-color-surface-container,#f0f1f7);max-height:65vh;overflow:auto}.builder[hidden]{display:none}.tokens{display:flex;flex-wrap:wrap;gap:4px}pre{white-space:pre-wrap;overflow-wrap:anywhere} .query{min-width:120px;flex:1} .row{align-items:center} h3{margin:0}:host([data-menu-search]) .query{min-width:min(240px,100%)}`);
    this.input=element('md-outlined-text-field',{label:this.getAttribute('label') || this.t('Search','搜尋'),value:this.query,maxLength:512,class:'query',oninput:()=> { this.query=this.input.value; this.emitChange(); }});
    this.toggle=element('md-outlined-button',{text:this.t('Regex builder','正則表達式工具'),'aria-expanded':'false',onclick:()=>this.builder.hidden?this.openBuilder():this.closeBuilder()});
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
    this.builder=element('section',{hidden:true,popover:'manual',class:'builder stack','aria-label':this.t('Regular expression workbench','正則表達式工作台')},[
      element('h3',{text:this.t('JavaScript RegExp · local worker · 1000 ms match budget','JavaScript RegExp · 本機 worker · 1000 毫秒運算上限')}),
      element('label',{class:'row'},[enabled,document.createTextNode(this.t('Use regular expression','使用正則表達式'))]), flags,tokenBox,escaped,sample,replacement,test,
      element('p',{text:this.t('Supports Unicode classes, anchors, groups, lookarounds and replacement captures. The capability matrix below probes this engine directly. Evaluation stops after 1000 ms of matching; complex expressions may time out.','支援 Unicode 字元類別、錨點、群組、環視及替換擷取。下方功能表直接檢查此引擎。運算在匹配 1000 毫秒後停止，複雜表達式可能逾時。')}),result]);
    this.status=element('div',{class:'status','aria-live':'polite'});
    this.shadowRoot.append(element('div',{class:'row'},[this.input,this.toggle]),this.builder,this.status);
    tokenBox.remove();
    this.workbench=mountWorkbenchTools(this,{sample,replacement,result,enabled});
  }
  openBuilder(){
    this.builder.hidden=false;this.toggle.setAttribute('aria-expanded','true');const rect=this.toggle.getBoundingClientRect();this.builder.style.left=Math.max(12,Math.min(rect.left,innerWidth-Math.min(620,innerWidth-24)-12))+'px';this.builder.style.top=Math.min(rect.bottom+8,Math.max(12,innerHeight-260))+'px';this.builder.style.maxHeight=Math.max(120,innerHeight-parseFloat(this.builder.style.top)-12)+'px';this.builder.showPopover?.();this.builderController?.abort();this.builderController=new AbortController();const options={capture:true,signal:this.builderController.signal};this.ownerDocument.addEventListener('pointerdown',event=>{if(!event.composedPath().includes(this.builder)&&!event.composedPath().includes(this.toggle))this.closeBuilder();},options);this.ownerDocument.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();this.closeBuilder();this.toggle.focus();}},options);
  }
  closeBuilder(){this.builderController?.abort();this.builderController=null;if(this.builder){try{this.builder.hidePopover?.();}catch{}this.builder.hidden=true;}this.toggle?.setAttribute('aria-expanded','false');}
  emitChange(){this.generation++;this.workbench?.explain();this.emit('search-change',{query:this.query,regex:this.regex,flags:this.flags});}
  evaluate(extra) {
    if(this.query.length>512 || !/^[dgimsuv]*$/.test(this.flags) || new Set(this.flags).size!==this.flags.length) return Promise.resolve({error:this.t('Invalid pattern or flags.','表達式或旗標無效。')});
    // Result filtering and the builder's test button each own a worker, so one cannot cancel the other.
    const slot=extra&&extra.rows?'runner':'testRunner';
    this[slot]=this[slot]||createWarmWorkerRunner({createWorker:()=>new Worker(new URL('./regex-worker.js',import.meta.url),{type:'module'})});
    const runner=this[slot],key=Symbol();
    this.pending.set(key,()=>runner.cancel());
    return runner.run({pattern:this.query,flags:this.flags,...extra}).then(value=>value,error=>{
      if(error?.code==='superseded')return {error:'Search cancelled'};
      if(error?.code==='match-timeout')return {error:this.t('Expression took longer than 1000 ms to match. Simplify the pattern.','表達式匹配超過 1000 毫秒。請簡化。')};
      if(error?.code==='start-timeout'||error?.code==='start-failed')return {error:this.t('The search worker could not start. Try again.','搜尋 worker 未能啟動，請再試一次。')};
      return {error:this.t('Expression could not be evaluated.','未能運算表達式。')};
    }).finally(()=>{this.pending.delete(key);});
  }
  releaseRunner() { this.runner?.release(); this.testRunner?.release(); }
  async filter(rows, { reportOutcome = false } = {}) {
    const generation=this.generation,sequence=this.filterSequence=(this.filterSequence||0)+1;
    const output=(matched,outcome)=>reportOutcome?{rows:matched,outcome}:matched;
    const request=(matched,outcome)=>generation===this.generation?output(matched,outcome):output(null,'superseded');
    if(!this.regex) {if(this.status)this.status.textContent='';const q=this.query.toLocaleLowerCase();return request(rows.filter(row=>row.text.toLocaleLowerCase().includes(q)),'ready');}
    if(rows.length>10000){if(this.status)this.status.textContent=this.t('Too many rows for regex. Narrow the collection first.','資料太多，請先縮小範圍。');return request([],'unavailable');}
    const result=await this.evaluate({rows});
    if(generation!==this.generation)return output(null,'superseded');
    if(sequence!==this.filterSequence)return reportOutcome?output(null,'superseded'):(result.error?[]:rows.filter(row=>result.matches.includes(row.id)));
    if(this.status)this.status.textContent=result.error || this.t(`${result.matches.length} matches`,`${result.matches.length} 個結果`);
    return request(result.error?[]:rows.filter(row=>result.matches.includes(row.id)),result.error?'failed':'ready');
  }
}
register('mfe-search',SurfaceSearch);
