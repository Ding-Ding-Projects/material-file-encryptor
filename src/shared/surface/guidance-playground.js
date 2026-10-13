import {evaluateMotionPractice} from '../local-ux/motion-practice-evaluator.js';
import {evaluateTypographyPractice} from '../local-ux/typography-practice-evaluator.js';
import {evaluateColorPractice} from '../local-ux/color-practice-evaluator.js';
/** Authored data and pure evaluation only. No original control or service enters
 * this module. Material primitives are constructed directly: production helper,
 * command, admission and shared-overlay factories are deliberately not imported. */
const authored = new WeakSet();
let invocationSerial=0;
const kinds = new Set(['text','search','number','toggle','choice','color','remove','reset','append','navigation','file','schedule','credential','date','operation','tabs','image','color-lab','typography','motion']);
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
 'The sample requests an already loaded bundled face. Exact glyph rendering is unverified; this practice does not load a font.':'樣本要求已載入隨附字型。精確字形顯示未經驗證，呢個練習唔會載入字型。',
 'Automatic duration requires native timeline support.':'自動持續時間需要原生時間軸支援。','Native repeat-delay playback is unavailable.':'原生重複延遲播放無法使用。','This easing has no authored sample interpolation.':'呢個緩動未有預先編寫樣本插值。','Native progress and attachment playback is unavailable in this sample.':'呢個樣本無法使用原生進度同連接播放。','This value has no authored sample opacity interpolation.':'呢個數值未有預先編寫樣本透明度插值。','This property has no authored sample interpolation.':'呢個屬性未有預先編寫樣本插值。',
 'Enter a valid sample motion value within the authored bounds.':'請輸入預先編寫範圍內嘅有效樣本動態數值。','The sample predecessor is missing or creates a cycle.':'樣本前置軌道缺失或造成循環。','The sample playback range is reversed.':'樣本播放範圍倒轉。','Choose distinct sample weekdays from zero through six.':'請選擇零至六之間互不重複嘅樣本星期日子。','Choose a real sample calendar date.':'請選擇有效樣本日曆日期。','The sample calendar boundaries are reversed.':'樣本日曆邊界倒轉。','Synthetic motion timeline':'合成動態時間軸',
 'The sample typography draft is empty; accepted styling is unchanged.':'樣本文字排版草稿係空白，已接受樣式保持不變。','Enter a valid sample typography value within the authored bounds.':'請輸入預先編寫範圍內嘅有效樣本文字排版數值。',
 'Enter a sample name from 1 to 100 characters.':'請輸入一至一百個字元嘅樣本名稱。','Enter a whole sample speed level from 1 to 10.':'請輸入一至十嘅整數樣本速度等級。','Enter valid color notation within the sRGB gamut.':'請輸入 sRGB 色域內嘅有效顏色格式。','The sample draft is empty; the accepted color is unchanged.':'樣本草稿係空白，已接受顏色保持不變。',
 'Sample crop must have positive dimensions and remain inside the source.':'樣本裁剪必須有正數尺寸，並保持喺來源範圍內。','The sample draft is empty; accepted placement is unchanged.':'樣本草稿係空白，已接受擺位保持不變。','Synthetic image placement':'合成圖像擺位',
 'The sample polygon needs three non-collinear points.':'樣本多邊形需要三個唔共線嘅頂點。','Synthetic polygon and guides':'合成多邊形同參考線','Synthetic bytes or digest do not match.':'合成位元組或摘要唔相符。','Completed sample operations cannot be canceled.':'唔可以取消已完成樣本操作。','The synthetic page cursor is stale.':'合成頁面游標已過期。','Sample frame offsets must remain between zero and one.':'樣本影格偏移必須保持零至一。','At least one sample property must remain.':'最少必須保留一個樣本屬性。','The selected sample snapshot is in use.':'所選樣本快照使用中。','Preview only. No real operation is performed.':'只作預覽，唔會執行真實操作。','Year':'年份','Month':'月份','Day':'日期','Choose a real calendar date between 2000 and 2099.':'請選擇 2000 至 2099 年之間嘅有效日期。','Confirm this synthetic operation first.':'請先確認呢個合成操作。','Sample input is invalid. Review its displayed bounds.':'樣本輸入無效，請檢查顯示嘅範圍。','Choose two different sample entries.':'請選擇兩個不同嘅樣本記錄。','The sample file has an unsupported version.':'樣本檔案版本未獲支援。','Practice with sample data':'用樣本資料練習','Sample input':'樣本輸入','Sample action':'樣本操作','Expected result':'預期結果','Reset example':'重設例子','Clear sample input':'清除樣本輸入','Apply to sample':'套用至樣本','Confirm sample removal':'確認移除樣本','Sample result':'樣本結果','Sample label':'樣本標籤','Sample caption':'樣本說明','Enabled':'啟用','Disabled':'停用','No matching sample rows.':'冇符合嘅樣本項目。','Enter a value within the sample bounds.':'請輸入樣本範圍內嘅數值。','Use a six-digit hexadecimal color, such as #52643f.':'請使用六位十六進位顏色，例如 #52643f。','Choose one of the authored sample options.':'請選擇其中一個預先編寫嘅樣本選項。','Enter between 1 and 80 characters without control characters.':'請輸入 1 至 80 個字元，唔好用控制字元。','Confirm removal before changing the sample list.':'修改樣本清單前，請先確認移除。','No sample items remain.':'冇剩餘樣本項目。','Use HH:MM within one day.':'請使用一日內嘅 HH:MM 時間。','Sample is disposed.':'樣本已關閉。','Only the fixed demonstration text is accepted.':'只接受固定示範文字。','Demonstration accepted. No credential was stored.':'示範已接受，冇儲存任何憑證。','Practice is unavailable for this control. Its specific fixture has not been implemented.':'呢個控制項未有專用練習樣本，暫時無法練習。',
};
/** Pure evaluator returns a new JSON result. User input is never evaluated as code
 * or applied as arbitrary style, HTML, a URL or a regular expression. */
function evaluateImage(fixture,state){
 const image=copy(fixture.image),value=state.value,invalid=message=>({valid:false,message});
 const emptyDraft=fixture.control==='clear'&&state.applied;
 if(['number','clear'].includes(fixture.control)&&!emptyDraft){
  const n=Number(value);if(String(value).trim()===''||!Number.isFinite(n)||n<fixture.min||n>fixture.max)return invalid('Enter a value within the sample bounds.');
  if(fixture.key.startsWith('crop'))image.crop[Number(fixture.key.slice(4))]=n*(fixture.normalized?100:1);else image[fixture.key]=n;
 }
 if(['buttons','select'].includes(fixture.control)){if(!fixture.choices.some(row=>row.value===value))return invalid('Choose one of the authored sample options.');image[fixture.key]=value;}
 if(fixture.key==='reset'&&state.applied)Object.assign(image,{crop:[0,0,100,100],focalX:50,focalY:50,x:0,y:0,scaleX:1,scaleY:1,rotate:0,skewX:0,skewY:0,opacity:1,blend:'normal'});
 if(fixture.key==='reset'&&state.applied)delete image.fit;
 const [x,y,w,h]=image.crop;if(w<=0||h<=0||x+w>100||y+h>100)return invalid('Sample crop must have positive dimensions and remain inside the source.');
 const sourceSize=fixture.sourceSize||[200,100],padding=(image.safeArea||0)*100,size=100-2*padding,source=[sourceSize[0]*x/100,sourceSize[1]*y/100,sourceSize[0]*w/100,sourceSize[1]*h/100],fit=image.fit||'contain',scale=fit==='cover'?Math.max(size/source[2],size/source[3]):Math.min(size/source[2],size/source[3]),dw=fit==='stretch'?size:source[2]*scale,dh=fit==='stretch'?size:source[3]*scale,destination=[padding+(size-dw)*image.focalX/100,padding+(size-dh)*image.focalY/100,dw,dh].map(n=>n===0?0:n);
 const record={image,sourceSize,source,destination,explicit:!!image.fit,...(fixture.key==='apply'?{accepted:state.applied?copy(image):null}:{})};
 return{valid:true,text:emptyDraft?'The sample draft is empty; accepted placement is unchanged.':JSON.stringify(record,null,2),...record,emptyDraft};
}
function renderImageSample(doc,preview,result,t){
 if(!result.source)return;
 const make=tag=>doc.createElementNS('http://www.w3.org/2000/svg',tag),svg=make('svg'),back=make('rect'),group=make('g'),viewport=make('svg'),image=result.image;
 svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('role','img');svg.setAttribute('aria-label',t('Synthetic image placement'));Object.assign(svg.style,{width:'100%',height:'180px',overflow:'hidden',isolation:'isolate'});back.setAttribute('width','100');back.setAttribute('height','100');back.setAttribute('fill','#aabbaa');svg.append(back,group);
 group.setAttribute('opacity',String(image.opacity));group.style.mixBlendMode=image.blend;group.setAttribute('transform',`translate(${image.x} ${image.y}) translate(50 50) rotate(${image.rotate}) skewX(${image.skewX}) skewY(${image.skewY}) scale(${image.scaleX} ${image.scaleY}) translate(-50 -50)`);
 for(const[index,key]of ['x','y','width','height'].entries())viewport.setAttribute(key,String(result.destination[index]));viewport.setAttribute('viewBox',result.source.join(' '));viewport.setAttribute('preserveAspectRatio','none');viewport.style.overflow='hidden';
 for(const[index,color]of ['#bd5757','#577dbd','#d6bc57','#8261a3','#8261a3','#d6bc57','#577dbd','#bd5757'].entries()){const rect=make('rect');rect.setAttribute('x',String((index%4)*result.sourceSize[0]/4));rect.setAttribute('y',String(Math.floor(index/4)*result.sourceSize[1]/2));rect.setAttribute('width',String(result.sourceSize[0]/4));rect.setAttribute('height',String(result.sourceSize[1]/2));rect.setAttribute('fill',color);viewport.append(rect);}if(['lock','key'].includes(image.preset)){viewport.replaceChildren();viewport.setAttribute('viewBox','0 0 128 128');const path=make('path');path.setAttribute('d',image.preset==='lock'?'M40 48V36A24 24 0 0 1 88 36V48 M28 48H100V108H28Z M64 70V90':'M66 44A22 22 0 1 1 22 44A22 22 0 1 1 66 44 M60 60L103 103 M82 82L94 70');path.setAttribute('fill','none');path.setAttribute('stroke','#6750a4');path.setAttribute('stroke-width','10');path.setAttribute('stroke-linecap','round');viewport.append(path);}group.append(viewport);preview.replaceChildren(svg);
}
function renderMotionSample(doc,preview,result,t){
 const make=tag=>doc.createElementNS('http://www.w3.org/2000/svg',tag),svg=make('svg'),bar=make('rect'),playhead=make('line'),frame=make('circle'),sample=make('rect');svg.setAttribute('viewBox','0 0 320 100');svg.setAttribute('role','img');svg.setAttribute('aria-label',t('Synthetic motion timeline'));svg.style.width='100%';svg.style.height='120px';
 const bounded=n=>Math.max(0,Math.min(300,Number.isFinite(n)?n:0)),scale=.3*result.preview.zoom;bar.setAttribute('x',String(10+bounded(result.timing.start*scale)));bar.setAttribute('y','20');bar.setAttribute('width',String(bounded(typeof result.timing.active==='number'?result.timing.active*scale:0)));bar.setAttribute('height','16');bar.setAttribute('fill','#6750a4');
 const pos=10+bounded(result.preview.snapped*scale);playhead.setAttribute('x1',String(pos));playhead.setAttribute('x2',String(pos));playhead.setAttribute('y1','10');playhead.setAttribute('y2','48');playhead.setAttribute('stroke','currentColor');frame.setAttribute('cx',String(10+bounded(result.frame.atMilliseconds*scale)));frame.setAttribute('cy','28');frame.setAttribute('r','4');frame.setAttribute('fill','#ffffff');sample.setAttribute('x','10');sample.setAttribute('y','60');sample.setAttribute('width','80');sample.setAttribute('height','24');sample.setAttribute('fill','#6750a4');sample.setAttribute('opacity',String(result.timing.opacity===null?0:Math.max(0,Math.min(1,result.timing.opacity))));svg.append(bar,playhead,frame,sample);preview.replaceChildren(svg);
}
function evaluateOperation(fixture,state){
 const draft=state.value,invalid=message=>({valid:false,message});
 for(const field of fixture.fields){const value=draft?.[field.key];if(field.type==='number'&&(String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<field.min||Number(value)>field.max))return invalid('Sample input is invalid. Review its displayed bounds.');if(field.type==='select'&&!field.choices.some(option=>option.value===value))return invalid('Choose one of the authored sample options.');if(field.type==='text'&&(typeof value!=='string'||value.length>80||/[\u0000-\u001f\u007f]/.test(value)))return invalid('Sample input is invalid. Review its displayed bounds.');}
 if(fixture.demonstration&&draft.demonstration!=='DEMO-ONLY')return invalid('Only the fixed demonstration text is accepted.');
 if(!state.applied){const record=fixture.operation==='clear-field'?{...fixture.record,value:draft.value,...(fixture.record.rows?{visibleRows:fixture.record.rows.filter(row=>row.toLowerCase().includes(String(draft.value).toLowerCase()))}:{})}:fixture.record;return{valid:true,text:JSON.stringify(record,null,2),record:copy(record)};}
 const input=state.appliedValue||draft,record=copy(fixture.record);
 if(fixture.confirmation&&!input.confirm)return invalid('Confirm this synthetic operation first.');
 switch(fixture.operation){
 case 'font-axes':record.axes=fixture.key==='reset'?copy(fixture.defaults):Object.fromEntries(fixture.fields.map(field=>[field.key,Number(input[field.key])]));break;
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
 case 'clear-field':record.value='';if(record.rows)record.visibleRows=copy(record.rows);break;
 case 'snapshot-capture':record.snapshots=[...record.snapshots,{id:'sample-new',label:input.label,reference:{version:1,reference:'sample-new'},snapshot:copy(record.base)}];break;
 case 'workbench': {
  switch(fixture.key){
   case 'drawing':record.points.push([Number(input.x),Number(input.y)]);record.area=Math.abs(record.points.reduce((sum,[x,y],index,points)=>{const[nextX,nextY]=points[(index+1)%points.length];return sum+x*nextY-nextX*y;},0))/2;if(record.area===0)return invalid('The sample polygon needs three non-collinear points.');break;
   case 'apply':if(record.points.length<3)return invalid('The sample polygon needs three non-collinear points.');record.saved=copy(record.points);break;
   case 'clear':record.points=[];break;
   case 'guide-x':case 'guide-y':record.guides.push({id:'sample-new',axis:fixture.key==='guide-x'?'x':'y',position:Number(input.position)});break;
   case 'guide-edit':record.guides[0].position=Number(input.position);break;
   case 'guide-remove':record.guides=record.guides.filter(row=>row.id!=='sample-x');break;
   default:throw Error('Unknown synthetic workbench operation.');
  }break;
 }
 case 'server-preparation': {
  switch(fixture.key){
   case 'runtimeCheck':record.match=Number(input.major)===record.requiredMajor;record.offeredMajor=Number(input.major);record.executed=false;break;
   case 'runtimePrepare':case 'prepare':if(!input.matchingDigest||record.receivedBytes!==record.expectedBytes)return invalid('Synthetic bytes or digest do not match.');record.state='prepared-example';if(fixture.key==='runtimePrepare')record.registered=true;else record.prepared=true;break;
   case 'runtimeCancel':case 'cancel':if(input.phase==='completed')return invalid('Completed sample operations cannot be canceled.');record.state='canceled-example';record.canceled=true;record.recoveryRequired=true;break;
   case 'refresh':record.catalogId='sample-current';record.selected=null;record.loaded=copy(fixture.catalog);break;
   case 'page':if(input.cursor!=='current')return invalid('The synthetic page cursor is stale.');record.loaded.push(...copy(fixture.catalog.slice(record.nextIndex)));record.nextIndex=null;break;
   case 'choose':record.selected=copy(fixture.catalog.find(row=>row.id===input.version));break;
   case 'license':record.reviewed=true;break;
   default:throw Error('Unknown synthetic server operation.');
  }break;
 }
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
 case 'motion':return evaluateMotionPractice(fixture,state);
 case 'typography':return evaluateTypographyPractice(fixture,state);
 case 'image':return evaluateImage(fixture,state);
 case 'color-lab':return evaluateColorPractice(fixture,state);
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
 return {get state(){active();return copy(state);},get result(){active();return evaluatePractice(fixture,state);},edit(value){active();dataOnly(value);state={...state,value:copy(value),...((['image','color-lab'].includes(fixture.kind)&&fixture.control==='clear'||fixture.kind==='typography')?{applied:false,appliedValue:null}:{})};return this.result;},confirm(value){active();state={...state,confirm:value===true};},apply(){active();if(fixture.kind==='remove'&&!state.confirm)return{valid:false,message:'Confirm removal before changing the sample list.'};const candidate={...state,applied:true,appliedValue:copy(state.value)},result=evaluatePractice(fixture,candidate);if(result.valid)state={...candidate,...(fixture.kind==='typography'&&fixture.variant==='step'?{value:result.parsed}:{})};return result;},reset(){active();state={value:copy(fixture.initial),applied:false,confirm:false,appliedValue:null};return this.result;},dispose(){disposed=true;state=null;}};
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
 const render=result=>{if(tabs&&result.valid){const index=fixture.choices.findIndex(row=>row.value===result.choice);tabs.activeTabIndex=index;tabButtons.forEach((tab,i)=>{tab.active=i===index;tab.tabIndex=i===index?0:-1;tab.setAttribute('aria-selected',String(i===index));});preview.setAttribute('aria-labelledby',tabButtons[index].id);}for(const{field}of recordFields){field.setAttribute('aria-invalid',String(!result.valid));field.error=!result.valid;field.errorText=result.valid?'':t(result.message);}output.textContent=t(result.valid?result.text:result.message)+(result.notices?.length?'\n'+result.notices.map(t).join('\n'):'');if(control){control.setAttribute('aria-invalid',String(!result.valid));control.error=!result.valid;control.errorText=result.valid?'':t(result.message);}preview.hidden=!result.valid||result.visible===false||result.removed===true;if(result.valid){preview.textContent=t(['text','choice','navigation','file','reset','append','remove','operation','date','tabs'].includes(fixture.kind)?result.text:'Sample caption');if(fixture.kind==='motion'&&result.motion)renderMotionSample(doc,preview,result.motion,t);if(fixture.kind==='typography'&&result.style){preview.style.maxHeight='240px';preview.style.overflow='auto';const line=element('div'),sample=element('span','Sample label'),reference=element('span',' Sample caption');line.style.minHeight='80px';line.style.lineHeight='2';line.style.fontSize='16px';sample.style.textDecorationLine=fixture.key.startsWith('textDecoration')?'underline':'none';Object.assign(fixture.key==='textAlign'||fixture.key==='direction'||fixture.key==='lineHeight'?line.style:sample.style,result.style);line.append(reference,sample,element('br'),element('span','Sample caption'));preview.replaceChildren(line);}if(result.color)preview.style.backgroundColor=result.color;if(fixture.kind==='color-lab'){preview.style.height='80px';preview.style.backgroundImage=result.rainbow?'linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff)':'none';preview.textContent='';}if(result.preview==='font-axis'||fixture.visual==='font-axes'){const sampleAxes=result.preview==='font-axis'?{[fixture.axisTag]:result.number}:result.record.axes;preview.style.fontFamily='"'+fixture.family+'", sans-serif';preview.style.fontVariationSettings=Object.entries(sampleAxes).map(([tag,value])=>'"'+tag+'" '+value).join(', ');preview.style.fontWeight=String(sampleAxes.wght||400);preview.style.fontStretch=String(sampleAxes.wdth||100)+'%';preview.textContent=t('Sample caption');output.textContent+='\n'+t('The sample requests an already loaded bundled face. Exact glyph rendering is unverified; this practice does not load a font.');}if(result.preview==='font-size')preview.style.fontSize=`${result.number}px`;if(result.preview==='font-weight')preview.style.fontWeight=String(result.number);if(result.preview==='opacity')preview.style.opacity=String(result.number);if(result.preview==='theme'){const dark=result.choice==='dark';preview.dataset.sampleTheme=dark?'dark':'light';preview.style.backgroundColor=result.sampleColors?.surface||'var(--md-sys-color-surface)';preview.style.color=result.sampleColors?.onSurface||'var(--md-sys-color-on-surface)';preview.style.padding='16px';}if(result.preview==='density'){const spacing=result.choice==='compact'?'8px':'16px';preview.style.display='grid';preview.style.gap=spacing;preview.style.padding=spacing;preview.replaceChildren(element('span','Sample label'),element('span','Sample caption'));}if(result.preview==='control-state'){preview.style.opacity=result.choice==='disabled'?'0.38':'1';preview.textContent=t('Sample caption');}if(result.preview==='font-choice'&&Number.isFinite(result.sampleWeight)&&result.sampleWeight>=100&&result.sampleWeight<=900)preview.style.fontWeight=String(result.sampleWeight);if(result.preview==='font-family')preview.style.fontFamily=result.choice==='serif'?'serif':'sans-serif';if(fixture.kind==='image')renderImageSample(doc,preview,result,t);if(fixture.visual==='polygon'&&result.record){const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('role','img');svg.setAttribute('aria-label',t('Synthetic polygon and guides'));svg.style.width='100%';svg.style.height='160px';const shape=doc.createElementNS('http://www.w3.org/2000/svg','polygon');shape.setAttribute('points',result.record.points.map(point=>point.join(',')).join(' '));shape.setAttribute('fill','none');shape.setAttribute('stroke','currentColor');shape.setAttribute('stroke-width','1');svg.append(shape);for(const guide of result.record.guides){const line=doc.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',guide.axis==='x'?String(guide.position):'0');line.setAttribute('x2',guide.axis==='x'?String(guide.position):'100');line.setAttribute('y1',guide.axis==='y'?String(guide.position):'0');line.setAttribute('y2',guide.axis==='y'?String(guide.position):'100');line.setAttribute('stroke','currentColor');line.setAttribute('stroke-dasharray','2 2');svg.append(line);}preview.replaceChildren(svg);}}};
 if(fixture.kind==='motion'){
  control=element(fixture.control==='select'?'md-outlined-select':'md-outlined-text-field');control.label=t(fixture.label);control.value=String(fixture.initial);if(fixture.control==='select'){control.menuPositioning='absolute';for(const option of fixture.choices){const row=element('md-select-option'),label=element('span',option.label);row.value=option.value;label.slot='headline';row.append(label);control.append(row);}}else{control.type=fixture.control==='number'?'number':'text';if(fixture.numeric){control.min=String(fixture.min);control.max=String(fixture.max);control.step=fixture.integer?'1':'any';}if(fixture.inputType)control.supportingText=fixture.inputType==='date'?'YYYY-MM-DD':'HH:mm';}listen(control,fixture.control==='select'?'change':'input',()=>render(session.edit(control.value)));fields.append(control);
 }else if(fixture.kind==='typography'){
  if(fixture.variant!=='choose'){control=element(fixture.type==='choice'&&fixture.variant==='field'?'md-outlined-select':'md-outlined-text-field');control.label=t(fixture.label);control.value=String(fixture.initial);if(control.tagName.toLowerCase()==='md-outlined-select'){control.menuPositioning='absolute';for(const option of fixture.choices){const row=element('md-select-option'),label=element('span',option.label);row.value=option.value;label.slot='headline';row.append(label);control.append(row);}listen(control,'change',()=>render(session.edit(control.value)));}else{control.type=fixture.type==='number'?'number':'text';if(fixture.type==='number'){control.min=String(fixture.min);control.max=String(fixture.max);control.step=fixture.key==='fontWeight'?'1':'0.1';}listen(control,'input',()=>render(session.edit(control.value)));}fields.append(control);}
  if(fixture.variant!=='field'){const button=element('md-text-button',fixture.variant==='clear'?'Clear sample input':'Apply to sample');button.type='button';listen(button,'click',()=>{const result=session.apply();render(result);if(result.valid&&fixture.variant==='step'&&control)control.value=result.parsed;if(result.emptyDraft&&control){control.value='';control.error=true;control.errorText=t(result.text);control.setAttribute('aria-invalid','true');control.focus();}});fields.append(button);}
 }else if(['image','color-lab'].includes(fixture.kind)){
  if(['number','clear','text','text-action','slider'].includes(fixture.control)){control=element(fixture.control==='slider'?'md-slider':'md-outlined-text-field');control.type=fixture.min===undefined?'text':'number';control.label=t(fixture.label);control.value=String(fixture.initial);if(fixture.min!==undefined){control.min=String(fixture.min);control.max=String(fixture.max);}control.step=fixture.control==='slider'?0.1:fixture.key==='speed'?'1':'any';listen(control,'input',()=>render(session.edit(control.value)));fields.append(control);}
  if(fixture.control==='select'){control=element('md-outlined-select');control.label=t(fixture.label);control.value=fixture.initial;control.menuPositioning='absolute';for(const option of fixture.choices){const row=element('md-select-option'),label=element('span',option.label);row.value=option.value;label.slot='headline';row.append(label);control.append(row);}listen(control,'change',()=>render(session.edit(control.value)));fields.append(control);}
  if(fixture.control==='buttons'){for(const option of fixture.choices){const button=element('md-outlined-button',option.label);button.type='button';button.setAttribute('aria-pressed',String(option.value===fixture.initial));listen(button,'click',()=>{render(session.edit(option.value));choiceButtons.forEach((row,index)=>row.setAttribute('aria-pressed',String(fixture.choices[index].value===option.value)));});fields.append(button);choiceButtons.push(button);}}
  if(['clear','action','text-action'].includes(fixture.control)){const button=element('md-filled-button',fixture.control==='clear'?'Clear sample input':'Apply to sample');button.type='button';listen(button,'click',()=>{const result=session.apply();render(result);if(result.emptyDraft){control.value='';control.setAttribute('aria-invalid','true');control.error=true;control.errorText=t(result.text);control.focus();}});fields.append(button);}
 }else if(fixture.kind==='tabs'){
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
