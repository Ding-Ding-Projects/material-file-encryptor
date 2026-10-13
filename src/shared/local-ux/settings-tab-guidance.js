import {definePractice} from '../surface/guidance-playground.js';
export const SETTINGS_TAB_COPY={};
const phrase=(en,yue)=>{SETTINGS_TAB_COPY[en]=yue;return en;};
const rows=[
 ['language','Language and voice','語言及聲線','Open the language and speech preference panel without changing either preference.','開啟語言同語音偏好面板，唔會修改任何偏好。','Sample language: English. Sample narration: off.','樣本語言：英文。樣本旁白：關。'],
 ['appearance','Appearance','外觀','Open the appearance panel to inspect its theme, typography and logo controls.','開啟外觀面板，查看主題、文字樣式同標誌控制項。','Sample theme: light. Sample font scale: 1.','樣本主題：淺色。樣本字型比例：1。'],
 ['schedules','Schedules','時間表','Open the schedule panel while preserving its saved rules and current draft.','開啟時間表面板，保留已儲存規則同目前草稿。','Sample morning: 09:00 to 17:00 UTC. No timer is running.','樣本早上時段：UTC 09:00 至 17:00，冇計時器運行。'],
 ['attention','Attention','專注','Open the attention panel without enabling an accommodation or reminder.','開啟專注面板，唔會啟用輔助設定或提醒。','Sample next action: Read sample notes.','樣本下一步：閱讀樣本筆記。'],
 ['history','Private local history','私人本機歷史','Open the encrypted history panel without unlocking its private entries.','開啟加密歷史面板，唔會解鎖私人記錄。','Sample history is locked. No private entries are present.','樣本歷史已鎖定，冇私人記錄。'],
];
const choices=rows.map(([value,label,yue,,,result,resultYue])=>({value,label:phrase(label,yue),result:phrase(result,resultYue)}));
const fixtures=new Map(rows.map(([key,label,yue])=>[key,definePractice({id:'settings-tab-sample:'+key,kind:'tabs',label,initial:key==='language'?'appearance':'language',choices,input:phrase('Five synthetic panels share one local tab strip. All contents are authored samples.','五個合成面板共用一條本機分頁列，全部內容都係預先編寫樣本。'),action:phrase(`Select the ${label} sample tab, then another tab.`,`選擇${yue}樣本分頁，再選另一個分頁。`),expected:phrase(`Only the sample panel changes to ${label}; real settings and real navigation remain unchanged.`,`只有樣本面板變成${yue}，真實設定同導覽保持不變。`)})]));
export const SETTINGS_TAB_IDS=Object.freeze(rows.map(([key])=>'settings.navigation.'+key));
export function settingsTabGuidance(key,{label,helpBase='docs/features/interface/settings-guidance.md'}={}){
 const row=rows.find(([id])=>id===key);if(!row)throw Error('Unknown settings navigation tab.');
 const[,name,yue,purpose,purposeYue]=row,anchor='action-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
 return{id:'settings.navigation.'+key,label:label||name,labelYue:yue,capable:true,complexity:'simple',reason:'Opens one existing settings panel.',concept:'navigation-'+key,sourceId:'docs/features/interface/settings-guidance.md',help:helpBase+'#'+anchor,practice:fixtures.get(key),purpose:phrase(purpose,purposeYue),options:phrase('Choose one of the five settings sections. The current panel is identified by its selected tab.','選擇五個設定分類之一，已選分頁標示目前面板。'),default:phrase('The currently selected section is retained until another tab is activated.','啟動另一個分頁前，保留目前已選分類。'),effects:phrase(`Displays the ${name} panel without applying a field value.`,`顯示${yue}面板，唔會套用欄位數值。`),example:fixtures.get(key).action,validation:phrase('The original tab must remain available; navigation does not bypass protected controls.','原有分頁必須仍然可用，導覽唔會繞過受保護控制項。'),recovery:phrase('Select the previous section to return; sample Reset affects only the sample tab strip.','選擇之前分類返回，样本重設只會影響樣本分頁列。'),steps:[phrase(`Review the ${name} section, then activate its original tab.`,`檢查${yue}分類，再啟動原有分頁。`)]};
}
// Populate shared translations before consumer dictionaries take their snapshot.
for(const[key]of rows)settingsTabGuidance(key);
