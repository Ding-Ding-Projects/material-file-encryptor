/** Authored data and pure evaluation only. No original control or service enters
 * this module. Material primitives are constructed directly: production helper,
 * command, admission and shared-overlay factories are deliberately not imported. */
const authored = new WeakSet();
const kinds = new Set(['text','search','number','toggle','choice','color','remove','reset','append','navigation','file','schedule','credential']);
const copy = value => JSON.parse(JSON.stringify(value));
const freeze = value => { if(value && typeof value === 'object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value; };
function dataOnly(value){
 if(value===null||['string','boolean'].includes(typeof value))return;
 if(typeof value==='number'&&Number.isFinite(value))return;
 if(Array.isArray(value)){value.forEach(dataOnly);return;}
 if(value&&Object.getPrototypeOf(value)===Object.prototype){for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))){if(!('value'in descriptor))throw Error('Practice fixtures cannot contain accessors.');dataOnly(descriptor.value);}return;}
 throw Error('Practice fixtures must contain only authored JSON data.');
}
export function definePractice(definition){
 dataOnly(definition);
 if(!definition.id||!kinds.has(definition.kind)||!definition.label||!definition.input||!definition.action||!definition.expected||!Object.hasOwn(definition,'initial'))throw Error('An explicit worked practice fixture is required.');
 if(['choice','navigation','file'].includes(definition.kind)&&(!Array.isArray(definition.choices)||definition.choices.length<2))throw Error('Practice choices must be authored.');
 const result=freeze(copy(definition));authored.add(result);return result;
}
export const PRACTICE_COPY={
 'Practice with sample data':'用樣本資料練習','Sample input':'樣本輸入','Sample action':'樣本操作','Expected result':'預期結果','Reset example':'重設例子','Clear sample input':'清除樣本輸入','Apply to sample':'套用至樣本','Confirm sample removal':'確認移除樣本','Sample result':'樣本結果','Sample label':'樣本標籤','Sample caption':'樣本說明','Enabled':'啟用','Disabled':'停用','No matching sample rows.':'冇符合嘅樣本項目。','Enter a value within the sample bounds.':'請輸入樣本範圍內嘅數值。','Use a six-digit hexadecimal color, such as #52643f.':'請使用六位十六進位顏色，例如 #52643f。','Choose one of the authored sample options.':'請選擇其中一個預先編寫嘅樣本選項。','Enter between 1 and 80 characters without control characters.':'請輸入 1 至 80 個字元，唔好用控制字元。','Confirm removal before changing the sample list.':'修改樣本清單前，請先確認移除。','No sample items remain.':'冇剩餘樣本項目。','Use HH:MM within one day.':'請使用一日內嘅 HH:MM 時間。','Sample is disposed.':'樣本已關閉。','Only the fixed demonstration text is accepted.':'只接受固定示範文字。','Demonstration accepted. No credential was stored.':'示範已接受，冇儲存任何憑證。','Practice is unavailable for this control. Its specific fixture has not been implemented.':'呢個控制項未有專用練習樣本，暫時無法練習。',
};
/** Pure evaluator returns a new JSON result. User input is never evaluated as code
 * or applied as arbitrary style, HTML, a URL or a regular expression. */
export function evaluatePractice(fixture,state){
 if(!authored.has(fixture))throw Error('Only authored practice fixtures are admitted.');
 const value=state.value,invalid=message=>({valid:false,message});
 switch(fixture.kind){
 case 'text': {const text=String(value);return text.length<1||text.length>80||/[\u0000-\u001f\u007f]/.test(text)?invalid('Enter between 1 and 80 characters without control characters.'):{valid:true,text};}
 case 'search': {const rows=fixture.rows.filter(row=>row.toLowerCase().includes(String(value).toLowerCase()));return{valid:true,text:rows.join(' · ')||'No matching sample rows.',count:rows.length};}
 case 'number': {const n=Number(value);return String(value).trim()===''||!Number.isFinite(n)||n<fixture.min||n>fixture.max?invalid('Enter a value within the sample bounds.'):{valid:true,text:`${n}${fixture.unit||''}`,number:n,preview:fixture.preview||null};}
 case 'color': return /^#[a-f\d]{6}$/i.test(String(value))?{valid:true,text:String(value),color:String(value)}:invalid('Use a six-digit hexadecimal color, such as #52643f.');
 case 'toggle': return{valid:true,text:value?'Enabled':'Disabled',visible:Boolean(value)};
 case 'choice':case 'navigation':case 'file': {const option=fixture.choices.find(row=>row.value===value);return option?{valid:true,text:option.result,choice:option.value}:invalid('Choose one of the authored sample options.');}
 case 'remove': return state.applied&&!state.confirm?invalid('Confirm removal before changing the sample list.'):{valid:true,text:state.applied?'No sample items remain.':fixture.item,removed:Boolean(state.applied)};
 case 'reset':return{valid:true,text:String(state.applied?fixture.restored:fixture.initial)};
 case 'append':return{valid:true,text:[...fixture.rows,...(state.applied?[fixture.item]:[])].join(' · ')};
 case 'schedule': {if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)))return invalid('Use HH:MM within one day.');return{valid:true,text:`${fixture.date} ${value} ${fixture.timezone}`};}
 case 'credential':return value===fixture.initial?{valid:true,text:'Demonstration accepted. No credential was stored.'}:invalid('Only the fixed demonstration text is accepted.');
 default:throw Error('Unsupported practice kind.');
 }
}
export function createPracticeSession(fixture){
 if(!authored.has(fixture))throw Error('Only authored practice fixtures are admitted.');
 let state={value:copy(fixture.initial),applied:false,confirm:false},disposed=false;
 const active=()=>{if(disposed)throw Error('Sample is disposed.');};
 return {get state(){active();return copy(state);},get result(){active();return evaluatePractice(fixture,state);},edit(value){active();dataOnly(value);state={...state,value:copy(value)};return this.result;},confirm(value){active();state={...state,confirm:value===true};},apply(){active();if(fixture.kind==='remove'&&!state.confirm)return{valid:false,message:'Confirm removal before changing the sample list.'};state={...state,applied:true};return this.result;},reset(){active();state={value:copy(fixture.initial),applied:false,confirm:false};return this.result;},dispose(){disposed=true;state=null;}};
}
export function mountGuidancePlayground(mount,{fixture,t=s=>s}={}){
 if(!authored.has(fixture))throw Error('Only authored practice fixtures are admitted.');
 const doc=mount.ownerDocument,session=createPracticeSession(fixture),listeners=[];
 const element=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=t(text);return node;};
 const listen=(node,type,fn)=>{node.addEventListener(type,fn);listeners.push(()=>node.removeEventListener(type,fn));};
 mount.dataset.guidanceSandbox=fixture.id;
 const title=element('h4','Practice with sample data');mount.append(title);
 for(const[key,label]of [['input','Sample input'],['action','Sample action'],['expected','Expected result']])mount.append(element('p',`${t(label)}: ${t(fixture[key])}`));
 const output=element('p'),preview=element('div','Sample caption');output.id='practice-result';output.setAttribute('role','status');output.setAttribute('aria-live','polite');output.setAttribute('aria-label',t('Sample result'));
 const fields=element('div');fields.className='practice-controls';mount.append(fields,preview,output);
 let control,confirmation;const choiceButtons=[];
 const render=result=>{output.textContent=t(result.valid?result.text:result.message);if(control){control.setAttribute('aria-invalid',String(!result.valid));control.error=!result.valid;control.errorText=result.valid?'':t(result.message);}preview.hidden=!result.valid||result.visible===false||result.removed===true;if(result.valid){preview.textContent=t(['text','choice','navigation','file','reset','append','remove'].includes(fixture.kind)?result.text:'Sample caption');if(result.color)preview.style.backgroundColor=result.color;if(result.preview==='font-size')preview.style.fontSize=`${result.number}px`;if(result.preview==='font-weight')preview.style.fontWeight=String(result.number);if(result.preview==='opacity')preview.style.opacity=String(result.number);}};
 if(fixture.kind==='toggle'){control=element('md-switch');control.selected=fixture.initial;listen(control,'change',()=>render(session.edit(control.selected)));fields.append(control);}
 else if(['choice','navigation','file'].includes(fixture.kind)){
  // Each option is a local Material button, avoiding the document-wide select
  // helper and menu lifetime. The selected state is explicit and keyboard usable.
  const buttons=fixture.choices.map(option=>{const button=element('md-outlined-button',option.label);button.type='button';button.setAttribute('aria-pressed',String(option.value===fixture.initial));listen(button,'click',()=>{render(session.edit(option.value));buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(fixture.choices[i].value===option.value)));});fields.append(button);choiceButtons.push(button);return button;});
  listeners.push(()=>buttons.length=0);
 }else if(!['remove','reset','append'].includes(fixture.kind)){
  control=element('md-outlined-text-field');control.type=fixture.kind==='number'?'number':'text';control.label=t(fixture.label);control.value=String(fixture.initial);if(fixture.kind==='number'){control.min=String(fixture.min);control.max=String(fixture.max);control.step=String(fixture.step||1);}listen(control,'input',()=>render(session.edit(control.value)));fields.append(control);
  const clear=element('md-text-button','Clear sample input');clear.type='button';listen(clear,'click',()=>{control.value='';render(session.edit(''));control.focus();});fields.append(clear);
 }
 if(control){control.setAttribute('aria-label',t(fixture.label));control.setAttribute('aria-describedby','practice-result');}
 if(fixture.kind==='remove'){confirmation=element('md-checkbox');confirmation.setAttribute('aria-label',t('Confirm sample removal'));listen(confirmation,'change',()=>session.confirm(confirmation.checked));const label=element('label','Confirm sample removal');label.append(confirmation);fields.append(label);}
 if(['remove','reset','append'].includes(fixture.kind)){const apply=element('md-filled-button','Apply to sample');apply.type='button';listen(apply,'click',()=>render(session.apply()));fields.append(apply);}
 const reset=element('md-text-button','Reset example');reset.type='button';listen(reset,'click',()=>{const result=session.reset();if(control){control.value=String(fixture.initial);control.selected=fixture.initial;}if(confirmation)confirmation.checked=false;choiceButtons.forEach((button,index)=>button.setAttribute('aria-pressed',String(fixture.choices[index].value===fixture.initial)));render(result);});fields.append(reset);
 for(const type of ['input','change','click'])listen(mount,type,event=>event.stopPropagation());
 render(session.result);
 return {session,destroy(){listeners.splice(0).forEach(fn=>fn());session.dispose();mount.replaceChildren();delete mount.dataset.guidanceSandbox;}};
}
export function practiceCoverage(descriptors){return descriptors.map(row=>({id:row.id,fixtureId:row.practice?.id||null,status:authored.has(row.practice)?'implemented':'missing',reason:row.practiceGap||(!row.practice?'No authored control-specific fixture.':null)}));}
export function assertPracticeCoverage(expectedIds,descriptors){
 const ids=descriptors.map(row=>row.id);if(new Set(ids).size!==ids.length)throw Error('Duplicate practice descriptor identity.');
 for(const id of new Set([...expectedIds,...ids])){if(!expectedIds.includes(id)||!ids.includes(id))throw Error(`Practice inventory mismatch: ${id}`);}
 const missing=practiceCoverage(descriptors).filter(row=>row.status==='missing');if(missing.length)throw Error(`Missing authored practice: ${missing.map(row=>row.id).join(', ')}`);return true;
}
