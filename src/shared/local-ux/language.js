import {ACCESS_COPY} from '../../renderer/features/access/copy.js';
import {APPEARANCE_COPY} from '../../renderer/features/personalization/appearance-copy.js';
import {LOCAL_COPY} from './local-copy.js';
export const COPY = {
 'Personalization':'個人設定','Language and voice':'語言同語音','Appearance':'外觀','Schedules':'時間表','Attention':'專注設定','Language':'語言','English':'英文','Cantonese':'廣東話','Bilingual':'雙語','English playfulness':'英文趣味程度','Cantonese playfulness':'廣東話趣味程度','Show emojis in dialogs and message boxes':'對話框及訊息框顯示表情符號','Theme':'主題','System':'跟隨系統','Light':'淺色','Dark':'深色','Density':'密度','Compact':'緊密','Comfortable':'舒適','Spacious':'寬鬆','Accent color':'重點顏色','Font family':'字型','Font scale':'字體比例','Font weight':'字體粗幼','Motion':'動畫','Full':'完整','Reduced':'減少','Display name':'顯示名稱','Reset name':'重設名稱','Narrator':'語音旁白','Narration language':'旁白語言','Both':'兩種語言','English voice':'英文聲線','Cantonese voice':'廣東話聲線','Choose automatically':'自動選擇','Rate':'語速','Pitch':'音調','Test narration':'試聽旁白','Focus':'聚焦目前工作','Low stimulation':'減少刺激','Time awareness':'顯示經過時間','One thing at a time':'一次一件事','Momentum':'閒置提醒','Next action':'下一步','Not now (one hour)':'一小時內唔提醒','Mode name':'模式名稱','Enable mode':'啟用模式','Turn off mode':'關閉模式','Local unlock credential':'本機解鎖密碼','Set local credential':'設定本機密碼','Add schedule':'新增時間表','Schedule name':'時間表名稱','Start date':'開始日期','End date':'結束日期','Start time':'開始時間','End time':'結束時間','Timezone':'時區','Priority':'優先次序','Setting':'設定','Value':'數值','Remove':'移除','Enabled':'啟用','Reset':'重設','Export settings':'匯出設定','Import settings':'匯入設定','Search settings':'搜尋設定','No matching settings':'搵唔到相符設定','Saved':'已儲存','Default':'預設','On':'開','Off':'關','Source':'來源','Local':'本機','HTTPS API':'HTTPS API','Home Assistant':'Home Assistant','Endpoint':'網址','Entity':'實體','Monday':'星期一','Tuesday':'星期二','Wednesday':'星期三','Thursday':'星期四','Friday':'星期五','Saturday':'星期六','Sunday':'星期日','Clear':'清除','Close':'關閉','Help':'說明','Session elapsed':'本次已用時間','Since last change':'距離上次修改','No action chosen':'未選擇下一步','Local vocabulary':'本機個人用詞','Upload JSON':'上載 JSON','Clear local vocabulary':'清除本機個人用詞','Unlock local profile':'解鎖本機個人設定','No local vocabulary loaded':'未載入本機個人用詞','Local profile locked':'本機個人設定已鎖定','Local profile unlocked':'本機個人設定已解鎖',
};
Object.assign(COPY,LOCAL_COPY,APPEARANCE_COPY,ACCESS_COPY);
export const MESSAGE_STYLES = Object.freeze({
 en:['','', ' The details are right here.',' The paperwork is keeping up.',' No mystery hidden in the small print.',' The fine print has nowhere to hide.'],
 yue:['','', ' 詳情喺呢度。',' 手續跟得上。',' 唔使估，細節寫清楚。',' 細字今次冇地方匿埋。'],
});
export const SETTING_LABELS = Object.freeze({language:'Language',theme:'Theme',density:'Density',seed:'Accent color',fontFamily:'Font family',fontScale:'Font scale',fontWeight:'Font weight',motion:'Motion',displayName:'Display name',emoji:'Show emojis in dialogs and message boxes',funnyEnglish:'English playfulness',funnyCantonese:'Cantonese playfulness'});
export function createTranslator(getSettings,{vocabulary,dictionary={}}={}) {
 const words={...COPY,...dictionary};
 const translate=(source,options={})=>{
  options=options&&typeof options==='object'?options:{};
  const {message=false,factual=false,values}=options&&typeof options==='object'?options:{};
  const settings=getSettings()||{},school=settings.school?.enabled===true,language=school?'en':(['en','yue','bilingual'].includes(options.language)?options.language:settings.language||'en');
  const text=String(source??'');let en=text,yue=words[text]??text;
  if(message&&!factual&&!school){const level=value=>Math.max(1,Math.min(5,Math.round(Number(value)||5)));en+=MESSAGE_STYLES.en[level(settings.funnyEnglish)];yue+=MESSAGE_STYLES.yue[level(settings.funnyCantonese)];}
  let output=language==='yue'?yue:language==='bilingual'&&yue!==en?`${en} · ${yue}`:en;
  if(!school&&vocabulary?.isAuthenticated?.()===true)output=vocabulary.replace?.(output)||output;
  if(values)output=output.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(match,key)=>Object.hasOwn(values,key)?String(values[key]):match);
  return output;
 };
 translate.format=(source,values,options={})=>translate(source,{...options,values});
 translate.has=source=>Object.hasOwn(words,source);
 translate.message=(source,values)=>translate(source,{message:true,values});
 translate.dictionary=Object.freeze(words);
 return translate;
}