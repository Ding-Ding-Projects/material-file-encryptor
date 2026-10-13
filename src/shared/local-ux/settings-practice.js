import {definePractice} from '../surface/guidance-playground.js';
/** This catalog contains authored demonstration values, never saved settings.
 * Missing entries remain visible gaps instead of inferred live-control samples. */
export const SETTINGS_PRACTICE_COPY={};
const fixtures=new Map();
const phrase=(en,yue)=>{SETTINGS_PRACTICE_COPY[en]=yue;return en;};
function put(label,kind,initial,config,input,action,expected){
 fixtures.set(label,definePractice({id:`settings-sample:${label.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`,label,kind,initial,...config,input:phrase(...input),action:phrase(...action),expected:phrase(...expected)}));
}
for(const[label,initial,example,yue]of [
 ['Mode name','Classroom','Quiet study','安靜自修'],['Display name','Sample workspace','Reading desk','閱讀書桌'],['Next action','Read sample notes','Review chapter one','溫習第一章'],['Schedule name','Sample morning','Reading hours','閱讀時間'],['Entry label','Sample entry','Before layout change','修改版面之前'],['Entity','input_text.sample_theme','input_text.reading_theme','input_text.reading_theme'],['Endpoint','https://example.invalid/schedule','https://example.invalid/reading','https://example.invalid/reading']]){
 put(label,'text',initial,{},[`${label}: ${initial}`,`${label}：${initial}`],[`Replace the sample text with ${example}.`,`將樣本文字改為${yue}。`],[`Only the sample label becomes ${example}.`,`只有樣本標籤會變成${yue}。`]);
}
for(const[label,min,max,initial,unit,preview]of [
 ['English playfulness',1,5,5,' / 5'],['Cantonese playfulness',1,5,5,' / 5'],['Rate',0.1,10,1,'×'],['Pitch',0,2,1,'×'],['Font scale',0.75,2,1,'×'],['Font weight',100,900,400,'','font-weight'],['Priority',-1000,1000,0,''],['Retention days',1,3650,365,' days']]){
 put(label,'number',initial,{min,max,unit,step:0.1,...(preview?{preview}:{})},[`${label}: ${initial}`,`${label}：${initial}`],[`Enter another ${label.toLowerCase()} value from ${min} to ${max}.`,`輸入另一個 ${min} 至 ${max} 範圍內嘅樣本數值。`],[`The sample readout changes; the real ${label.toLowerCase()} remains unchanged.`,`樣本讀數會改變，實際設定保持不變。`]);
}
for(const label of ['Show emojis in dialogs and message boxes','Narrator','Focus','Low stimulation','Time awareness','One thing at a time','Momentum','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']){
 put(label,'toggle',true,{},[`${label}: enabled in the sample.`,`樣本嘅 ${label} 已啟用。`],[`Turn the sample ${label.toLowerCase()} switch off and on.`,`關閉再開啟樣本開關。`],['The sample caption disappears and returns; no speech or timer starts.','樣本說明會隱藏再出現，唔會啟動語音或計時器。']);
}
const choices={
 Language:[['en','English','Sample controls: English'],['yue','廣東話','樣本控制項：廣東話'],['bilingual','Bilingual','Sample / 樣本']],
 'Narration language':[['en','English','Sample narration language: English'],['yue','廣東話','樣本旁白語言：廣東話']],
 'English voice':[['sample-a','Sample voice A','Sample voice A selected; no audio plays.'],['sample-b','Sample voice B','Sample voice B selected; no audio plays.']],
 'Cantonese voice':[['sample-a','示範聲線甲','已選示範聲線甲，唔會播放聲音。'],['sample-b','示範聲線乙','已選示範聲線乙，唔會播放聲音。']],
 Theme:[['light','Light','Sample palette: light'],['dark','Dark','Sample palette: dark'],['system','Device preference','Sample palette follows a synthetic light preference.']],
 Density:[['comfortable','Comfortable','Sample spacing: 16 px'],['compact','Compact','Sample spacing: 8 px']],
 'Font family':[['sans-serif','Sans serif','Sample family: sans-serif'],['serif','Serif','Sample family: serif']],
 Motion:[['system','Device preference','Sample movement preference: device'],['reduced','Reduced','Sample movement preference: reduced'],['full','Full','Sample movement preference: full']],
 Timezone:[['UTC','UTC','Sample 09:00 UTC'],['Asia/Hong_Kong','Asia/Hong_Kong','Sample 09:00 Asia/Hong_Kong']],
 Setting:[['theme','Theme','Sample override field expects a palette choice.'],['fontScale','Font scale','Sample override field expects a number from 0.75 to 2.']],
 Value:[['dark','Dark','Sample theme override: dark'],['light','Light','Sample theme override: light']],
 Source:[['local','Local','Sample value comes from an in-memory row.'],['external','External provider','Sample provider is unavailable; no request is sent.']],
 'Action filter':[['rename','Rename','Sample matches: rename'],['theme','Theme','Sample matches: theme']],
};
for(const[label,options]of Object.entries(choices))put(label,'choice',options[0][0],{primitive:'select',...({'Theme':'theme','Density':'density','Font family':'font-family'}[label]?{preview:{'Theme':'theme','Density':'density','Font family':'font-family'}[label]}:{}),choices:options.map(([value,label,result])=>({value,label,result}))},[`${label}: ${options[0][1]}`,`${label}：${options[0][1]}`],['Choose a different authored sample option.','選擇另一個預先編寫嘅樣本選項。'],['The local sample result names the selected choice. Real settings are retained.','本機樣本結果會列出所選項目，實際設定保持不變。']);
for(const label of ['Search settings','Search history'])put(label,'search','theme',{rows:['Theme changed','Font scale changed','Theme restored']},['Query: theme; rows: Theme changed, Font scale changed, Theme restored.','查詢 theme，三個樣本列分別為 Theme changed、Font scale changed、Theme restored。'],['Replace theme with font.','將 theme 改為 font。'],['Only Font scale changed remains in the sample results.','樣本結果只剩 Font scale changed。']);
put('Accent color','color','#52643f',{},['Sample color: #52643f.','樣本顏色：#52643f。'],['Enter #315da8 in the sample color field.','在樣本顏色欄輸入 #315da8。'],['The sample swatch becomes blue; other surfaces retain their colors.','樣本色板變成藍色，其他介面顏色保持不變。']);
for(const label of ['Start time','End time'])put(label,'schedule',label==='Start time'?'09:00':'17:00',{date:'2030-01-15',timezone:'UTC'},['Sample date: 2030-01-15, timezone: UTC.','樣本日期為 2030-01-15，時區為 UTC。'],['Enter 10:30. This is a preview, not a scheduled task.','輸入 10:30。呢個只係預覽，唔會安排工作。'],['The occurrence preview reads 2030-01-15 10:30 UTC.','時間預覽顯示 2030-01-15 10:30 UTC。']);
for(const label of ['Local unlock credential','History password','Access token'])put(label,'credential','DEMO-ONLY',{},['Fixed public demonstration text: DEMO-ONLY.','固定公開示範文字：DEMO-ONLY。'],['Change the text to observe rejection, then Reset example.','修改文字查看拒絕結果，再重設例子。'],['Only DEMO-ONLY is accepted locally. Nothing is authenticated or stored.','本機只接受 DEMO-ONLY，唔會驗證身份或儲存資料。']);
for(const label of ['Language and voice','Appearance','Schedules','Attention','Private local history'])put(label,'navigation','overview',{choices:[{value:'overview',label:'Overview',result:`${label}: sample overview`},{value:'detail',label:'Details',result:`${label}: sample detail panel`}]},[`${label}: overview panel.`,`${label}：概覽面板。`],['Select Details, then Overview.','選擇詳細資料，再選概覽。'],['Only this sample panel changes. The real tab remains selected.','只有樣本面板會改變，實際分頁保持原來選取狀態。']);
for(const[label,initial,restored]of [['Reset English playfulness',2,5],['Reset Cantonese playfulness',2,5],['Reset name','Reading desk','Material File Encryptor']])put(label,'reset',initial,{restored},[`Sample current value: ${initial}.`,`樣本目前值：${initial}。`],['Apply the reset to the sample.','對樣本套用重設。'],[`Sample value becomes ${restored}; Reset example restores ${initial}.`,`樣本值變成 ${restored}，重設例子會還原 ${initial}。`]);
put('Remove','remove','Sample morning',{item:'Sample morning'},['One synthetic schedule: Sample morning.','一個合成時間表：Sample morning。'],['Confirm sample removal, then Apply to sample.','確認移除樣本，再套用至樣本。'],['The sample list becomes empty. Reset example restores the item.','樣本清單變成空白，重設例子會還原項目。']);
put('Add schedule','append','',{rows:['Sample morning'],item:'Sample evening 17:00 UTC'},['One synthetic schedule: Sample morning.','一個合成時間表：Sample morning。'],['Apply to sample to add Sample evening 17:00 UTC.','套用至樣本，加入 Sample evening 17:00 UTC。'],['Two sample schedules appear; no timer or stored schedule is created.','出現兩個樣本時間表，唔會建立計時器或已儲存時間表。']);
export function settingsPractice(label){return fixtures.get(label)||null;}
export const SETTINGS_PRACTICE_IDS=Object.freeze([...fixtures.values()].map(row=>row.id));
