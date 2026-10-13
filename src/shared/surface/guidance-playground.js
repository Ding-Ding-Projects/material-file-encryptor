/** Authored data and pure evaluation only. No original control or service enters
 * this module. Material primitives are constructed directly: production helper,
 * command, admission and shared-overlay factories are deliberately not imported. */
const authored = new WeakSet();
let invocationSerial=0;
const kinds = new Set(['text','search','number','toggle','choice','color','remove','reset','append','navigation','file','schedule','credential','date','operation','tabs']);
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
 if(['choice','navigation','file','tabs'].includes(definition.kind)&&(!Array.isArray(definition.choices)||definition.choices.length<2))throw Error('Practice choices must be authored.');
 if(definition.primitive&&!['select','radio','buttons'].includes(definition.primitive))throw Error('Unsupported practice primitive.');
 if(definition.palette&&Object.values(definition.palette).some(row=>!/^#[a-f\d]{6}$/i.test(row.surface)||!/^#[a-f\d]{6}$/i.test(row.onSurface)))throw Error('Sample palettes require bounded authored colors.');
 const result=freeze(copy(definition));authored.add(result);return result;
}
export const PRACTICE_COPY={
 'Sample frame offsets must remain between zero and one.':'樣本影格偏移必須保持零至一。','At least one sample property must remain.':'最少必須保留一個樣本屬性。','The selected sample snapshot is in use.':'所選樣本快照使用中。','Preview only. No real operation is performed.':'只作預覽，唔會執行真實操作。','Year':'年份','Month':'月份','Day':'日期','Choose a real calendar date between 2000 and 2099.':'請選擇 2000 至 2099 年之間嘅有效日期。','Confirm this synthetic operation first.':'請先確認呢個合成操作。','Sample input is invalid. Review its displayed bounds.':'樣本輸入無效，請檢查顯示嘅範圍。','Choose two different sample entries.':'請選擇兩個不同嘅樣本記錄。','The sample file has an unsupported version.':'樣本檔案版本未獲支援。','Practice with sample data':'用樣本資料練習','Sample input':'樣本輸入','Sample action':'樣本操作','Expected result':'預期結果','Reset example':'重設例子','Clear sample input':'清除樣本輸入','Apply to sample':'套用至樣本','Confirm sample removal':'確認移除樣本','Sample result':'樣本結果','Sample label':'樣本標籤','Sample caption':'樣本說明','Enabled':'啟用','Disabled':'停用','No matching sample rows.':'冇符合嘅樣本項目。','Enter a value within the sample bounds.':'請輸入樣本範圍內嘅數值。','Use a six-digit hexadecimal color, such as #52643f.':'請使用六位十六進位顏色，例如 #52643f。','Choose one of the authored sample options.':'請選擇其中一個預先編寫嘅樣本選項。','Enter between 1 and 80 characters without control characters.':'請輸入 1 至 80 個字元，唔好用控制字元。','Confirm removal before changing the sample list.':'修改樣本清單前，請先確認移除。','No sample items remain.':'冇剩餘樣本項目。','Use HH:MM within one day.':'請使用一日內嘅 HH:MM 時間。','Sample is disposed.':'樣本已關閉。','Only the fixed demonstration text is accepted.':'只接受固定示範文字。','Demonstration accepted. No credential was stored.':'示範已接受，冇儲存任何憑證。','Practice is unavailable for this control. Its specific fixture has not been implemented.':'呢個控制項未有專用練習樣本，暫時無法練習。',
};
/** Pure evaluator returns a new JSON result. User input is never evaluated as code
 * or applied as arbitrary style, HTML, a URL or a regular expression. */
function evaluateOperation(fixture,state){
 const draft=state.value,invalid=message=>({valid:false,message});
 for(const field of fixture.fields){const value=draft?.[field.key];if(field.type==='number'&&(String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<field.min||Number(value)>field.max))return invalid('Sample input is invalid. Review its displayed bounds.');if(field.type==='select'&&!field.choices.some(option=>option.value===value))return invalid('Choose one of the authored sample options.');if(field.type==='text'&&(typeof value!=='string'||value.length>80||/[\u0000-\u001f\u007f]/.test(value)))return invalid('Sample input is invalid. Review its displayed bounds.');}
 if(fixture.demonstration&&draft.demonstration!=='DEMO-ONLY')return invalid('Only the fixed demonstration text is accepted.');
 if(!state.applied){const record=fixture.operation==='clear-field'?{...fixture.record,value:draft.value}:fixture.record;return{valid:true,text:JSON.stringify(record,null,2),record:copy(record)};}
 const input=state.appliedValue||draft,record=copy(fixture.record);
 if(fixture.confirmation&&!input.confirm)return invalid('Confirm this synthetic operation first.');
 switch(fixture.operation){
 case 'credential-store':record.credentialConfigured=true;record.editor='closed';break;
 case 'credential-configure':record.editor='open';record.credentialConfigured=false;break;
 case 'credential-clear':record.credentialConfigured=false;break;
 case 'credential-cancel':record.editor='closed';record.draft='';break;
 case 'mode-enable':record.restrictionEnabled=true;record.language='en';break;
 case 'mode-disable':record.restrictionEnabled=false;record.language='bilingual';break;
 case 'speech-preview':record.sequence=[{voice:input.voice,rate:Number(input.rate),text:'Sample notice'}];record.audioPlayed=false;break;
 case 'editor-open':record.editor='open';record.selectedLayer=input.layer;break;
 case 'schedule-enable':record.enabled=true;break;
 case 'schedule-disable':record.enabled=false;break;
 case 'settings-export':return{valid:true,text:JSON.stringify({version:1,settings:{theme:record.theme,fontScale:record.fontScale}},null,2),record:{version:1,settings:{theme:record.theme,fontScale:record.fontScale}}};
 case 'settings-reset':record.theme='system';record.fontScale=1;record.displayName='Sample workspace';break;
 case 'history-setup':record.passwordConfigured=true;record.locked=false;break;
 case 'history-unlock':record.locked=false;record.visibleEntries=['Sample theme change'];break;
 case 'history-lock':record.locked=true;record.visibleEntries=[];break;
 case 'history-compare': {if(input.first===input.second)return invalid('Choose two different sample entries.');const before=fixture.entries.find(row=>row.id===input.first),after=fixture.entries.find(row=>row.id===input.second);record.differences=Object.keys(before.snapshot).filter(key=>before.snapshot[key]!==after.snapshot[key]).map(key=>({field:key,before:before.snapshot[key],after:after.snapshot[key]}));break;}
 case 'history-export':return{valid:true,text:JSON.stringify({version:1,entries:fixture.entries.map(({id,action,label})=>({id,action,label}))},null,2),record:{version:1,entries:fixture.entries.map(({id,action,label})=>({id,action,label}))}};
 case 'retention-set':record.retentionDays=Number(input.days);break;
 case 'history-prune':record.entries=record.entries.filter(row=>row.ageDays<=Number(input.days));break;
 case 'history-restore':record.settings=copy(fixture.snapshot);break;
 case 'history-label':record.label=input.label;break;
 case 'settings-import': {const file=fixture.files.find(row=>row.id===input.file);if(file.version!==1)return invalid('The sample file has an unsupported version.');record.settings=copy(file.settings);break;}
 case 'reminder-snooze':record.now='2030-01-15T10:00:00Z';record.reminderAfter='2030-01-15T11:00:00Z';record.timerScheduled=false;break;
 case 'clear-field':record.value='';break;
 case 'snapshot-capture':record.snapshots=[...record.snapshots,{id:'sample-new',label:input.label,reference:{version:1,reference:'sample-new'},snapshot:copy(record.base)}];break;
 case 'keyframe': {
  const frame=record.frames[0],numeric=value=>Number(value),coordinate=value=>Math.round(value*1000000)/1000000;
  switch(fixture.key){
   case 'select':record.selected=Number(input.index);record.selectedValue=record.frames[record.selected].value;break;
   case 'multi':record.selection=input.included?[0,1]:[0];break;
   case 'mode':delete frame.offset;delete frame.time;delete frame.relativeTime;frame[{offset:'offset',absolute:'time',relative:'relativeTime'}[input.mode]]=0;break;
   case 'time':frame.offset=numeric(input.position);record.resolvedTime=frame.offset*record.duration;break;
   case 'value':frame.value=numeric(input.value);break;
   case 'unit':record.draft.unit=input.unit;break;
   case 'apply':frame.value=String(numeric(input.number))+input.unit;break;
   case 'easing':{frame.easing=input.easing;let low=0,high=1;for(let i=0;i<32;i++){const t=(low+high)/2,x=3*(1-t)*(1-t)*t*0.42+3*(1-t)*t*t+t*t*t;if(x<0.5)low=t;else high=t;}const t=(low+high)/2;record.sampleMidpoint=input.easing==='linear'?0.5:input.easing==='ease-in'?coordinate(3*(1-t)*t*t+t*t*t):0;break;}
   case 'composition':frame.composite=input.composition;record.composedSample=['add','accumulate'].includes(input.composition)?15:5;break;
   case 'hold':frame.hold=input.hold;record.sampleMidpoint=input.hold?0.2:0.5;break;
   case 'add':record.frames.push({id:'sample-new',offset:1,value:'computed',easing:'linear',composite:'auto'});break;
   case 'copy':record.copiedFrames=record.frames.filter((_,index)=>record.selection.includes(index)).map(copy);break;
   case 'paste':record.frames.push(...record.copiedFrames.map(copy));break;
   case 'remove':record.frames=record.frames.filter((_,index)=>!record.selection.includes(index));record.selection=[];break;
   case 'move':{const delta=numeric(input.delta);if(record.frames.some((row,index)=>record.selection.includes(index)&&(row.offset+delta<0||row.offset+delta>1)))return invalid('Sample frame offsets must remain between zero and one.');record.frames=record.frames.map((row,index)=>record.selection.includes(index)?{...row,offset:coordinate(row.offset+delta)}:row);break;}
   case 'reorder':case 'later':[record.frames[0],record.frames[1]]=[record.frames[1],record.frames[0]];break;
   case 'reset':delete frame.time;delete frame.relativeTime;delete frame.hold;Object.assign(frame,{offset:0,value:'computed',easing:'linear',composite:'auto'});break;
   case 'clear':record.draft.number='';break;
   default:throw Error('Unknown synthetic keyframe operation.');
  }break;
 }
 case 'transition': {
  const row=record.rows[0];
  switch(fixture.key){
   case 'migrate':case 'expand':record.version=2;if(fixture.key==='expand')record.properties=copy(record.catalog);record.rows=record.properties.map((property,index)=>({id:'sample-property-'+index,property,from:record.from,to:record.to,behavior:'normal'}));break;
   case 'select':record.selected=Number(input.index);record.selectedProperty=record.rows[record.selected].property;break;
   case 'property':row.property=input.property;break;
   case 'add':record.rows.push({id:'sample-new',property:'letter-spacing',from:'computed',to:'computed',behavior:'normal'});break;
   case 'remove':if(record.rows.length<2)return invalid('At least one sample property must remain.');record.rows.splice(0,1);break;
   case 'earlier':case 'later':[record.rows[0],record.rows[1]]=[record.rows[1],record.rows[0]];break;
   case 'from':case 'to':row[fixture.key]=Number(input.value);break;
   case 'number':record.draft.number=Number(input.number);break;
   case 'unit':record.draft.unit=input.unit;break;
   case 'apply':record.rows[1].to=String(Number(input.number))+input.unit;break;
   case 'clear':record.draft.number='';break;
   case 'behavior':row.behavior=input.behavior;record.rendererPreview=input.behavior==='allow-discrete'?'unavailable':'not-run';break;
   case 'reset':Object.assign(row,{from:'computed',to:'computed',behavior:'normal'});break;
   default:throw Error('Unknown synthetic transition operation.');
  }break;
 }
 case 'snapshot-remove':if(record.snapshots.find(row=>row.id===input.reference)?.inUse)return invalid('The selected sample snapshot is in use.');record.snapshots=record.snapshots.filter(row=>row.id!==input.reference);break;
 default:throw Error('Unsupported synthetic operation.');
 }
 return{valid:true,text:JSON.stringify(record,null,2),record};
}
export function evaluatePractice(fixture,state){
 if(!authored.has(fixture))throw Error('Only authored practice fixtures are admitted.');
 const value=state.value,invalid=message=>({valid:false,message});
 switch(fixture.kind){
 case 'operation':return evaluateOperation(fixture,state);
 case 'date': {const {year,month,day}=value||{},y=Number(year),m=Number(month),d=Number(day),days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];return ![y,m,d].every(Number.isInteger)||y<2000||y>2099||m<1||m>12||d<1||d>days[m-1]?invalid('Choose a real calendar date between 2000 and 2099.'):{valid:true,text:`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')} UTC`};}
 case 'text': {const text=String(value);return text.length<1||text.length>80||/[\u0000-\u001f\u007f]/.test(text)?invalid('Enter between 1 and 80 characters without control characters.'):{valid:true,text};}
 case 'search': {const rows=fixture.rows.filter(row=>row.toLowerCase().includes(String(value).toLowerCase()));return{valid:true,text:rows.join(' · ')||'No matching sample rows.',count:rows.length};}
 case 'number': {const n=Number(value);return String(value).trim()===''||!Number.isFinite(n)||fixture.integer&&!Number.isInteger(n)||n<fixture.min||n>fixture.max?invalid('Enter a value within the sample bounds.'):{valid:true,text:`${n}${fixture.unit||''}`,number:n,preview:fixture.preview||null};}
 case 'color': return /^#[a-f\d]{6}$/i.test(String(value))?{valid:true,text:String(value),color:String(value)}:invalid('Use a six-digit hexadecimal color, such as #52643f.');
 case 'toggle': return{valid:true,text:value?'Enabled':'Disabled',visible:Boolean(value)};
 case 'choice':case 'navigation':case 'file':case 'tabs': {const option=fixture.choices.find(row=>row.value===value);return option?{valid:true,text:option.result,choice:option.value,preview:fixture.preview||null,sampleWeight:option.fontWeight||null,sampleColors:fixture.palette?.[option.value==='dark'?'dark':'light']||null}:invalid('Choose one of the authored sample options.');}
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
 let state={value:copy(fixture.initial),applied:false,confirm:false,appliedValue:null},disposed=false;
 const active=()=>{if(disposed)throw Error('Sample is disposed.');};
 return {get state(){active();return copy(state);},get result(){active();return evaluatePractice(fixture,state);},edit(value){active();dataOnly(value);state={...state,value:copy(value)};return this.result;},confirm(value){active();state={...state,confirm:value===true};},apply(){active();if(fixture.kind==='remove'&&!state.confirm)return{valid:false,message:'Confirm removal before changing the sample list.'};const candidate={...state,applied:true,appliedValue:copy(state.value)},result=evaluatePractice(fixture,candidate);if(result.valid)state=candidate;return result;},reset(){active();state={value:copy(fixture.initial),applied:false,confirm:false,appliedValue:null};return this.result;},dispose(){disposed=true;state=null;}};
}
export function mountGuidancePlayground(mount,{fixture,t=s=>s}={}){
 if(!authored.has(fixture))throw Error('Only authored practice fixtures are admitted.');
 const doc=mount.ownerDocument,session=createPracticeSession(fixture),listeners=[],invocation=++invocationSerial;
 const element=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=t(text);return node;};
 const listen=(node,type,fn)=>{node.addEventListener(type,fn);listeners.push(()=>node.removeEventListener(type,fn));};
 mount.dataset.guidanceSandbox=fixture.id;
 const title=element('h4','Practice with sample data');mount.append(title);
 for(const[key,label]of [['input','Sample input'],['action','Sample action'],['expected','Expected result']])mount.append(element('p',`${t(label)}: ${t(fixture[key])}`));
 const output=element('p'),preview=element('div','Sample caption');output.id=`practice-result-${invocation}`;preview.dataset.practicePreview=fixture.id;output.setAttribute('role','status');output.setAttribute('aria-live','polite');output.setAttribute('aria-label',t('Sample result'));
 const fields=element('div');fields.className='practice-controls';mount.append(fields,preview,output);
 let control,confirmation,tabs=null;const tabButtons=[];const choiceButtons=[],choiceRadios=[],recordFields=[];
 const render=result=>{if(tabs&&result.valid){const index=fixture.choices.findIndex(row=>row.value===result.choice);tabs.activeTabIndex=index;tabButtons.forEach((tab,i)=>{tab.active=i===index;tab.tabIndex=i===index?0:-1;tab.setAttribute('aria-selected',String(i===index));});preview.setAttribute('aria-labelledby',tabButtons[index].id);}for(const{field}of recordFields){field.setAttribute('aria-invalid',String(!result.valid));field.error=!result.valid;field.errorText=result.valid?'':t(result.message);}output.textContent=t(result.valid?result.text:result.message);if(control){control.setAttribute('aria-invalid',String(!result.valid));control.error=!result.valid;control.errorText=result.valid?'':t(result.message);}preview.hidden=!result.valid||result.visible===false||result.removed===true;if(result.valid){preview.textContent=t(['text','choice','navigation','file','reset','append','remove','operation','date','tabs'].includes(fixture.kind)?result.text:'Sample caption');if(result.color)preview.style.backgroundColor=result.color;if(result.preview==='font-size')preview.style.fontSize=`${result.number}px`;if(result.preview==='font-weight')preview.style.fontWeight=String(result.number);if(result.preview==='opacity')preview.style.opacity=String(result.number);if(result.preview==='theme'){const dark=result.choice==='dark';preview.dataset.sampleTheme=dark?'dark':'light';preview.style.backgroundColor=result.sampleColors?.surface||'var(--md-sys-color-surface)';preview.style.color=result.sampleColors?.onSurface||'var(--md-sys-color-on-surface)';preview.style.padding='16px';}if(result.preview==='density'){const spacing=result.choice==='compact'?'8px':'16px';preview.style.display='grid';preview.style.gap=spacing;preview.style.padding=spacing;preview.replaceChildren(element('span','Sample label'),element('span','Sample caption'));}if(result.preview==='font-choice'&&Number.isFinite(result.sampleWeight)&&result.sampleWeight>=100&&result.sampleWeight<=900)preview.style.fontWeight=String(result.sampleWeight);if(result.preview==='font-family')preview.style.fontFamily=result.choice==='serif'?'serif':'sans-serif';}};
 if(fixture.kind==='tabs'){
  tabs=element('md-tabs');tabs.autoActivate=true;tabs.setAttribute('aria-label',t(fixture.label));tabs.style.maxWidth='100%';preview.id=`practice-tabpanel-${invocation}`;preview.setAttribute('role','tabpanel');preview.tabIndex=0;
  fixture.choices.forEach((option,index)=>{const tab=element('md-primary-tab',option.label);tab.id=`practice-tab-${invocation}-${index}`;tab.setAttribute('aria-controls',preview.id);tabs.append(tab);tabButtons.push(tab);});
  listen(tabs,'change',()=>{const index=tabs.activeTabIndex;if(!Number.isInteger(index)||!fixture.choices[index])return;render(session.edit(fixture.choices[index].value));tabButtons[index].focus();});fields.append(tabs);
 }else if(['operation','date'].includes(fixture.kind)){
  fields.append(element('p','Preview only. No real operation is performed.'));
  const specs=fixture.kind==='date'?[{key:'year',label:'Year',type:'number',min:2000,max:2099},{key:'month',label:'Month',type:'number',min:1,max:12},{key:'day',label:'Day',type:'number',min:1,max:31}]:fixture.fields;
  for(const spec of specs){const field=element(spec.type==='checkbox'?'md-checkbox':spec.type==='select'?'md-outlined-select':'md-outlined-text-field');field.setAttribute('aria-label',t(spec.label));field.setAttribute('aria-describedby',output.id);field.label=t(spec.label);field.value=String(fixture.initial[spec.key]??'');if(spec.type==='checkbox'){field.checked=fixture.initial[spec.key]===true;const label=element('label',spec.label);label.append(field);fields.append(label);}else{if(spec.type!=='select')field.type=spec.type==='number'?'number':'text';if(spec.type==='number'){field.min=String(spec.min);field.max=String(spec.max);}if(spec.type==='select'){field.menuPositioning='absolute';for(const option of spec.choices){const row=element('md-select-option');row.value=option.value;const headline=element('span',option.label);headline.slot='headline';row.append(headline);field.append(row);}}fields.append(field);}
   listen(field,['checkbox','select'].includes(spec.type)?'change':'input',()=>{const value=spec.type==='checkbox'?field.checked:field.value,result=session.edit({...session.state.value,[spec.key]:value});field.setAttribute('aria-invalid',String(!result.valid));field.error=!result.valid;field.errorText=result.valid?'':t(result.message);render(result);});recordFields.push({field,spec});
  }
  if(fixture.kind==='operation'){const apply=element('md-filled-button','Apply to sample');apply.type='button';listen(apply,'click',()=>{const result=session.apply();if(!result.valid){const target=recordFields.find(({spec})=>spec.key===(fixture.confirmation&&!session.state.value.confirm?'confirm':fixture.demonstration?'demonstration':fixture.operation==='settings-import'?'file':fixture.operation==='history-compare'?'second':fixture.operation==='snapshot-remove'?'reference':fixture.fields[0]?.key));if(target){target.field.setAttribute('aria-invalid','true');target.field.error=true;target.field.errorText=t(result.message);target.field.focus();}}if(result.valid&&fixture.operation==='clear-field'){for(const{field,spec}of recordFields)if(spec.key==='value'){field.value='';session.edit({...session.state.value,value:''});field.focus();}}render(result);});fields.append(apply);preview.style.whiteSpace='pre-wrap';}
 }else if(fixture.kind==='toggle'){control=element('md-switch');control.selected=fixture.initial;listen(control,'change',()=>render(session.edit(control.selected)));fields.append(control);}
 else if(['choice','navigation','file'].includes(fixture.kind)){
  // Construct primitives directly inside this invocation. The production select
  // helper, shared popup and command registry are never attached.
  if(fixture.primitive==='select'){
   control=element('md-outlined-select');control.label=t(fixture.label);control.menuPositioning='absolute';control.value=String(fixture.initial);
   for(const option of fixture.choices){const row=element('md-select-option');row.value=option.value;const label=element('span',option.label);label.slot='headline';row.append(label);control.append(row);}
   listen(control,'change',()=>render(session.edit(control.value)));fields.append(control);
  }else if(fixture.primitive==='radio'){
   fields.setAttribute('role','radiogroup');fields.setAttribute('aria-label',t(fixture.label));
   for(const option of fixture.choices){const radio=element('md-radio');radio.name=`practice-choice-${invocation}`;radio.value=option.value;radio.checked=option.value===fixture.initial;radio.setAttribute('aria-label',t(option.label));radio.setAttribute('aria-describedby',output.id);listen(radio,'change',()=>{if(radio.checked){choiceRadios.forEach(other=>{other.checked=other===radio;});render(session.edit(option.value));}});const label=element('label',option.label);label.append(radio);fields.append(label);choiceRadios.push(radio);}
  }else {const buttons=fixture.choices.map(option=>{const button=element('md-outlined-button',option.label);button.type='button';button.setAttribute('aria-pressed',String(option.value===fixture.initial));listen(button,'click',()=>{render(session.edit(option.value));buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(fixture.choices[i].value===option.value)));});fields.append(button);choiceButtons.push(button);return button;});
  listeners.push(()=>buttons.length=0);}
 }else if(!['remove','reset','append'].includes(fixture.kind)){
  control=element('md-outlined-text-field');control.type=fixture.kind==='number'?'number':'text';control.label=t(fixture.label);control.value=String(fixture.initial);if(fixture.kind==='number'){control.min=String(fixture.min);control.max=String(fixture.max);control.step=String(fixture.step||1);}listen(control,'input',()=>render(session.edit(control.value)));fields.append(control);
  const clear=element('md-text-button','Clear sample input');clear.type='button';listen(clear,'click',()=>{control.value='';render(session.edit(''));control.focus();});fields.append(clear);
 }
 if(control){control.setAttribute('aria-label',t(fixture.label));control.setAttribute('aria-describedby',output.id);}
 if(fixture.kind==='remove'){confirmation=element('md-checkbox');confirmation.setAttribute('aria-label',t('Confirm sample removal'));listen(confirmation,'change',()=>session.confirm(confirmation.checked));const label=element('label','Confirm sample removal');label.append(confirmation);fields.append(label);}
 if(['remove','reset','append'].includes(fixture.kind)){const apply=element('md-filled-button','Apply to sample');apply.type='button';listen(apply,'click',()=>render(session.apply()));fields.append(apply);}
 const reset=element('md-text-button','Reset example');reset.type='button';listen(reset,'click',()=>{const result=session.reset();if(control){control.value=String(fixture.initial);control.selected=fixture.initial;}for(const{field,spec}of recordFields){field.value=String(fixture.initial[spec.key]??'');field.checked=fixture.initial[spec.key]===true;field.error=false;field.errorText='';field.setAttribute('aria-invalid','false');}if(confirmation)confirmation.checked=false;choiceRadios.forEach(radio=>{radio.checked=radio.value===fixture.initial;});choiceButtons.forEach((button,index)=>button.setAttribute('aria-pressed',String(fixture.choices[index].value===fixture.initial)));render(result);});fields.append(reset);
 for(const type of ['input','change','click'])listen(mount,type,event=>event.stopPropagation());
 render(session.result);
 return {session,destroy(){if(control&&fixture.primitive==='select')control.open=false;for(const{field,spec}of recordFields)if(spec.type==='select')field.open=false;listeners.splice(0).forEach(fn=>fn());session.dispose();mount.replaceChildren();delete mount.dataset.guidanceSandbox;}};
}
export function practiceCoverage(descriptors){return descriptors.map(row=>({id:row.id,fixtureId:row.practice?.id||null,status:authored.has(row.practice)?'implemented':'missing',reason:row.practiceGap||(!row.practice?'No authored control-specific fixture.':null)}));}
export function assertPracticeCoverage(expectedIds,descriptors){
 const ids=descriptors.map(row=>row.id);if(new Set(ids).size!==ids.length)throw Error('Duplicate practice descriptor identity.');
 for(const id of new Set([...expectedIds,...ids])){if(!expectedIds.includes(id)||!ids.includes(id))throw Error(`Practice inventory mismatch: ${id}`);}
 const missing=practiceCoverage(descriptors).filter(row=>row.status==='missing');if(missing.length)throw Error(`Missing authored practice: ${missing.map(row=>row.id).join(', ')}`);return true;
}
