import {element} from './registry.js';
import {capabilities,createWorkbenchStore,describePattern,guidedTokens} from './regex-workbench.js';

export function mountWorkbenchTools(owner,{sample,replacement,result,enabled}) {
 let storage;try{storage=globalThis.localStorage;}catch{}
 const store=createWorkbenchStore(storage,`mfe.regex.${owner.getAttribute('scope')||owner.getAttribute('label')||'search'}`);
 const tools=element('div',{class:'stack'});let lastResult;let matchIndex=0;
 const heading=(en,yue)=>element('h4',{text:owner.t(en,yue)});
 const apply=(pattern,flags)=>{owner.query=pattern;owner.flags=flags;owner.regex=true;enabled.selected=true;owner.input.value=pattern;owner.flagsControl.value=flags;owner.emitChange();explain();};
 const literal=element('md-outlined-text-field',{label:owner.t('Literal text to insert safely','安全插入純文字'),maxLength:256});
 const tokens=element('div',{class:'tokens'});
 for(const [,en,yue,pattern]of guidedTokens)tokens.append(element('md-text-button',{text:owner.t(en,yue),onclick:()=>apply((owner.query+pattern).slice(0,512),owner.flags)}));
 tools.append(heading('Guided construction','引導式組合'),literal,element('md-text-button',{text:owner.t('Insert escaped text','插入已逸出文字'),onclick:()=>apply((owner.query+literal.value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).slice(0,512),owner.flags)}),tokens);
 const explanation=element('div',{class:'stack'});
 function explain(){const data=describePattern(owner.query);explanation.replaceChildren(...data.tokens.map(token=>element('div',{text:`${token.start}-${token.end}: ${JSON.stringify(token.text)} · ${token.kind} · ${owner.t('depth','層次')} ${token.depth}`})));for(const warning of data.warnings)explanation.append(element('p',{role:'status',text:owner.t(warning,'此表達式可能造成大量回溯。請使用短測試文字，並留意逾時。')}));}
 owner.input.addEventListener('input',explain);tools.append(heading('Lexical structure and diagnostics','詞法結構及診斷'),explanation);
 const cases=element('md-outlined-text-field',{type:'textarea',rows:3,label:owner.t('Test cases JSON: [{"text":"hello","match":true}]','測試案例 JSON: [{"text":"hello","match":true}]'),value:'[]',maxLength:32768});
 const display=element('div',{class:'stack','aria-live':'polite'});
 function showResult(){display.replaceChildren();if(!lastResult)return;if(lastResult.error){display.append(element('p',{role:'alert',text:lastResult.error}));return;}
   const data=lastResult;display.append(element('p',{text:owner.t(`${data.matches.length} matches · ${data.elapsedMs} ms${data.truncated?' · first 100 only':''}`,`${data.matches.length} 個符合 · ${data.elapsedMs} 毫秒${data.truncated?' · 只顯示首 100 個':''}`)}));
   if(data.matches.length){display.append(element('div',{class:'row'},[element('md-text-button',{text:owner.t('Previous match','上一個符合'),onclick:()=>{matchIndex=(matchIndex+data.matches.length-1)%data.matches.length;showResult();}}),element('md-text-button',{text:owner.t('Next match','下一個符合'),onclick:()=>{matchIndex=(matchIndex+1)%data.matches.length;showResult();}})]),element('pre',{text:JSON.stringify({number:matchIndex+1,...data.matches[matchIndex]},null,2)}));}
   display.append(heading('Replacement preview','替換預覽'),element('pre',{text:data.replacement}));
   for(const entry of data.cases||[])display.append(element('p',{text:owner.t(`Case ${entry.index+1}: ${entry.passed?'PASS':'FAIL'} (expected ${entry.expected}, actual ${entry.actual})`,`案例 ${entry.index+1}：${entry.passed?'通過':'失敗'}（預期 ${entry.expected}，實際 ${entry.actual}）`)}));
 }
 const run=element('md-outlined-button',{text:owner.t('Run suite and profile','執行案例及分析'),onclick:async()=>{
   let suite;try{suite=JSON.parse(cases.value);if(!Array.isArray(suite)||suite.length>50||suite.some(c=>typeof c.text!=='string'||c.text.length>4096||typeof c.match!=='boolean'))throw Error();}catch{display.replaceChildren(element('p',{role:'alert',text:owner.t('Invalid test cases. Use at most 50 objects containing text and boolean match.','測試案例無效。請使用最多 50 個包含 text 及布林 match 的物件。')}));return;}
   store.remember(owner.query,owner.flags);lastResult=await owner.evaluate({sample:sample.value,replacement:replacement.value,cases:suite});matchIndex=0;showResult();renderSaved();
 }});
 tools.append(heading('Test-case suite, profiling and match navigation','案例、效能分析及符合導覽'),cases,run,display);
 const name=element('md-outlined-text-field',{label:owner.t('Snippet name','範本名稱'),maxLength:80});const saved=element('div',{class:'stack'});
 function renderSaved(){saved.replaceChildren();const state=store.get();for(const [index,snippet]of state.snippets.entries())saved.append(element('div',{class:'row'},[element('md-text-button',{text:snippet.name,onclick:()=>apply(snippet.pattern,snippet.flags)}),element('md-text-button',{text:owner.t('Remove','移除'),onclick:()=>{store.remove(index);renderSaved();}})]));for(const entry of state.history)saved.append(element('md-text-button',{text:`${owner.t('Recent','最近')}: /${entry.pattern}/${entry.flags}`,onclick:()=>apply(entry.pattern,entry.flags)}));}
 const file=element('input',{type:'file',hidden:true,accept:'application/json,.json',onchange:async()=>{const selected=file.files?.[0];if(!selected)return;try{if(selected.size>131072)throw Error(owner.t('Import exceeds 128 KiB.','匯入超過 128 KiB。'));store.import(JSON.parse(await selected.text()));renderSaved();}catch(error){owner.status.textContent=error.message;}file.value='';}});
 const history=element('md-switch',{selected:store.get().rememberHistory,'aria-label':owner.t('Remember expression history','記住表達式記錄'),onchange:()=>{store.setHistory(history.selected);renderSaved();}});
 tools.append(heading('Saved expressions','已儲存表達式'),name,element('div',{class:'row'},[
   element('md-outlined-button',{text:owner.t('Save snippet locally','在本機儲存範本'),onclick:()=>{store.add(name.value,owner.query,owner.flags);renderSaved();}}),
   element('md-text-button',{text:owner.t('Import snippets','匯入範本'),onclick:()=>file.click()}),
   element('md-text-button',{text:owner.t('Export snippets','匯出範本'),onclick:()=>{const url=URL.createObjectURL(new Blob([store.export()],{type:'application/json'}));element('a',{href:url,download:'regex-snippets.json'}).click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}),
   element('md-text-button',{text:owner.t('Clear saved expressions','清除已儲存表達式'),onclick:()=>{store.clear();renderSaved();}}),
   element('md-text-button',{text:owner.t('Copy expression','複製表達式'),onclick:async()=>{try{await navigator.clipboard.writeText(JSON.stringify({pattern:owner.query,flags:owner.flags}));owner.status.textContent=owner.t('Copied.','已複製。');}catch{owner.status.textContent=owner.t('Clipboard unavailable; select the expression to copy it.','剪貼簿無法使用，請選取表達式複製。');}}})
 ]),file,element('label',{class:'row'},[history,document.createTextNode(owner.t('Remember local expression history (no samples)','記住本機表達式記錄（不包括測試文字）'))]),saved);
 tools.append(heading('Engine capability matrix','引擎功能表'),element('p',{text:`ECMAScript RegExp · ${globalThis.navigator?.userAgent||owner.t('Version unavailable','無法取得版本')}`}));
 for(const cap of capabilities)tools.append(element('p',{text:`${owner.t(cap.en,cap.yue)}: ${cap.supported?owner.t('Supported','支援'):owner.t('Unsupported by this engine','此引擎不支援')} · ${cap.pattern}`}));
 tools.append(element('p',{text:owner.t('The engine exposes no internal parse tree or backtracking trace. Lexical structure, measured worker time and a hard timeout are available instead. Samples are never saved or transmitted.','引擎不提供內部語法樹或回溯追蹤。此處提供詞法結構、worker 運算時間及逾時限制。測試文字不會儲存或傳送。')}));
 owner.builder.append(tools);explain();renderSaved();return{store,explain};
}
