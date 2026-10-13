import {definePractice} from '../surface/guidance-playground.js';
import {MOTION_PRACTICE,MOTION_PRACTICE_COPY} from './motion-practice.js';
export const MOTION_HELPER_COPY={};
const say=(en,yue)=>{MOTION_HELPER_COPY[en]=yue;return en;};
// The reset column mirrors the original field's reset semantics. Dynamic preset
// and timezone defaults use fixed authored context, never live editor options.
const resets=[
 ['duration',300,600],['start-delay',0,100],['end-delay',0,100],['repeat-count',1,2],['iteration-start',0,.5],['playback-rate',1,-1],['repeat-delay',0,150],['direction','normal','reverse'],['fill','none','both'],['global-easing','linear','ease-in'],
 ['animated-property','opacity','transform'],['after-track','','sample-fade'],['track-name','Animation','Sample edited track'],['parallel-group','','Sample group'],['sequence-offset',0,100],['stagger-offset',0,50],['target-scope','element','layer'],['target-state','normal','hover'],['composition','replace','add'],['iteration-composition','replace','accumulate'],
 ['trigger','entry','hover'],['from-state','any','normal'],['to-state','normal','hover'],['progress-threshold',0,.5],['debounce',0,250],['retrigger','restart','ignore'],['cancel-on-exit','true','false'],['trigger-priority',0,2],
 ['timeline-source','document','scroll'],['timeline-element','target','parent'],['timeline-axis','block','inline'],['view-inset','auto','10px'],['attachment-start','normal','entry 10%'],['attachment-end','normal','exit 90%'],
 ['timeline-zoom',1,2],['timeline-snapping',10,20],['playback-range-start',0,100],['playback-range-end',1000,800],['preview-frame-rate',60,24],['loop-preview','false','true'],['playhead',0,150],['preview-playback-speed',1,.5],
 ['schedule-name','Motion schedule','Sample edited schedule'],['schedule-enabled','true','false'],['scheduled-preset','Sample quiet','Sample active'],['schedule-start-time','09:00','10:00'],['schedule-end-time','17:00','18:00'],['schedule-first-date','','2030-01-10'],['schedule-last-date','','2030-01-20'],['schedule-timezone','UTC','America/Toronto'],['schedule-priority',0,2],['schedule-weekdays','[1,2,3,4,5]','[2,4]'],
];
const fixtures={},descriptors={},fields={};
function descriptor(key,label,yue,practice,purpose,purposeYue){return Object.freeze({utility:true,id:'motion.helper:'+key,label:say(label,yue),concept:key,sourceId:'docs/features/interface/guidance-playgrounds.md',help:'docs/features/interface/guidance-playgrounds.md#motion-contextual-helpers',purpose:say(purpose,purposeYue),options:say('The helper belongs only to its adjacent original field.','輔助控制只屬於相鄰原有欄位。'),default:say('The sample uses fixed authored context.','樣本使用固定預先編寫上下文。'),effects:practice.expected,example:practice.action,validation:say('Original field validation and asynchronous rejection remain authoritative.','原有欄位驗證同非同步拒絕仍然作準。'),recovery:say('Reset the example independently or return to the original field.','獨立重設例子或者返回原有欄位。'),steps:[say('Review the adjacent original field.','檢查相鄰原有欄位。'),say('Invoke this field helper once.','呼叫呢個欄位輔助控制一次。')],practice});}
for(const[key,restored,initial]of resets){
 const base=MOTION_PRACTICE[key],label=base.label.slice(7),yue=MOTION_PRACTICE_COPY[base.label].slice(2),id='reset-'+key;
 const practice=definePractice({...base,id:'motion-helper-sample:'+id,variant:'reset',initial,restored,label:say('Sample '+label,'樣本'+yue),input:say('The authored '+label+' starts with an edited value.','預先編寫「'+yue+'」由已編輯數值開始。'),action:say('Reset only the sample '+label+' and inspect the restored value.','只重設樣本「'+yue+'」，檢查還原值。'),expected:say('The sample '+label+' returns to '+String(restored)+'. Other sample fields are retained.','樣本「'+yue+'」還原為 '+String(restored)+'，其他樣本欄位保留。')});
 fixtures[id]=practice;fields[label]=key;descriptors[id]=descriptor(id,'Reset value: '+label,'重設數值：'+yue,practice,'Reset only '+label+' through its original field consumer.','只透過原有欄位操作重設「'+yue+'」。');
}
for(const[key,values]of [['animated-property',['opacity','transform']],['global-easing',['linear','ease-in','steps(4, jump-end)']]]){
 const base=MOTION_PRACTICE[key],label=base.label.slice(7),yue=MOTION_PRACTICE_COPY[base.label].slice(2),id='choose-'+key;
 const practice=definePractice({...base,id:'motion-helper-sample:'+id,variant:'choose',choices:values.map(value=>({value,label:value})),input:say('An authored menu offers bounded '+label+' choices.','預先編寫選單提供有界「'+yue+'」選項。'),action:say('Open the sample '+label+' menu and choose a value.','開啟樣本「'+yue+'」選單並選擇數值。'),expected:say('Only the sample '+label+' changes. Unsupported native interpolation remains unavailable.','只改變樣本「'+yue+'」，未支援原生插值仍然不可用。')});
 fixtures[id]=practice;descriptors[id]=descriptor(id,'Choose value: '+label,'選擇數值：'+yue,practice,'Open the original '+label+' choice menu. Selecting a value remains a separate field action.','開啟原有「'+yue+'」選擇選單，選擇數值仍然係另一個欄位操作。');
}
say('Reset sample field','重設樣本欄位');say('Choose sample value','選擇樣本數值');
export const MOTION_HELPER_PRACTICE=Object.freeze(fixtures);
export const MOTION_HELPER_GUIDANCE=Object.freeze(descriptors);
export const MOTION_HELPER_FIELD_KEYS=Object.freeze(fields);
export function motionHelperGuidance(key,{context='default'}={}){const row=Object.hasOwn(descriptors,key)?descriptors[key]:null;return row?{...row,id:row.id+':'+context}:null;}
