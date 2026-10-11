/** Explicit control inventory. Values and choices come from each real consumer. */
const fields=[
 ['Mode name','Name the shared presentation restriction','為共用顯示限制命名'],
 ['Local unlock credential','Authorize a protected presentation-mode change','授權修改受保護的顯示模式'],
 ['Language','Choose the language of controls and messages','選擇控制項及訊息的語言'],
 ['English playfulness','Set English message humor independently','獨立設定英文訊息的趣味程度'],
 ['Cantonese playfulness','Set Cantonese message humor independently','獨立設定廣東話訊息的趣味程度'],
 ['Show emojis in dialogs and message boxes','Decorate dialog messages without changing facts','裝飾對話訊息而不改變事實'],
 ['Narrator','Enable sequential speech for supported events','啟用支援事件的順序語音旁白'],
 ['Narration language','Choose the language spoken by the narrator','選擇旁白使用的語言'],
 ['English voice','Choose an installed English speech voice','選擇已安裝的英文聲線'],
 ['Cantonese voice','Choose an installed Cantonese speech voice','選擇已安裝的廣東話聲線'],
 ['Rate','Adjust speech playback speed','調整語音播放速度'],['Pitch','Adjust speech pitch','調整語音音調'],
 ['Theme','Choose light, dark or device-following colors','選擇淺色、深色或跟隨裝置的顏色'],
 ['Density','Choose spacing between working controls','選擇工作控制項之間的距離'],
 ['Accent color','Choose the six-digit accent color','選擇六位數的重點顏色'],
 ['Font family','Choose the preferred local font with a CJK fallback','選擇首選本機字型並保留中日韓後備字型'],
 ['Font scale','Scale the interface type size','調整介面文字大小比例'],
 ['Font weight','Choose numeric interface font weight','選擇介面字體的數值粗幼'],
 ['Motion','Choose the rendering motion preference','選擇畫面動畫偏好'],
 ['Display name','Rename presentation while preserving installed identity','修改顯示名稱並保留安裝識別資料'],
 ['Focus','Reduce competing interface decoration','減少介面中分散注意力的裝飾'],
 ['Low stimulation','Request a quieter visual presentation','使用較平靜的視覺顯示'],
 ['Time awareness','Show session and idle timing','顯示本次使用及閒置時間'],
 ['One thing at a time','Keep the chosen next action visible','持續顯示已選擇的下一步'],
 ['Momentum','Offer an idle reminder after twenty minutes','閒置二十分鐘後提供提醒'],
 ['Next action','Save the task shown by the attention aid','儲存專注輔助顯示的工作'],
 ['Schedule name','Identify this schedule in the local list','識別本機清單中的這個時間表'],
 ['Start date','Limit the first matching calendar date','限制最早符合條件的日期'],
 ['End date','Limit the last matching calendar date','限制最後符合條件的日期'],
 ['Start time','Set the beginning of the local time window','設定本地時間範圍的起點'],
 ['End time','Set the exclusive end, including overnight windows','設定不包括在內的終點並支援跨夜範圍'],
 ['Timezone','Choose the timezone used to evaluate this rule','選擇用來計算規則的時區'],
 ['Priority','Resolve precedence between overlapping schedules','決定重疊時間表的優先次序'],
 ['Setting','Choose the setting this rule overrides','選擇這條規則覆寫的設定'],
 ['Value','Supply an override in the selected setting type','按所選設定類型提供覆寫值'],
 ['Source','Choose local values or an authenticated external provider','選擇本機數值或已驗證的外部來源'],
 ['Endpoint','Locate the HTTPS schedule provider','指定 HTTPS 時間表來源的位置'],
 ['Entity','Identify the Home Assistant entity supplying values','識別提供數值的 Home Assistant 實體'],
 ['History password','Unlock encrypted history with its independent password','使用獨立密碼解鎖加密歷史'],
 ['Search history','Filter recorded action and label text','篩選記錄的操作及標籤文字'],
 ['From date','Filter the earliest history timestamp','篩選最早的歷史時間'],
 ['To date','Filter the inclusive final history date','篩選包括在內的最後歷史日期'],
 ['Action filter','Match an exact recorded history action','配對完全相符的歷史操作'],
 ['Entry label','Append a descriptive label to a history snapshot','為歷史快照附加描述標籤'],
 ['Retention days','Set the retention period before separately confirmed pruning','設定獨立確認清理前的保留期限'],
 ['Search settings','Find controls and their contextual explanations','搜尋控制項及其相關解釋'],
 ['Access token','Enter the provider credential only in protected input','只在受保護輸入欄位填寫來源憑證'],
];
const actions=[
 ['Set local credential','Store the mode credential in protected storage','把模式憑證儲存在受保護空間'],
 ['Enable mode','Enable the presentation restriction after credential setup','設定憑證後啟用顯示限制'],
 ['Turn off mode','Restore previous choices after credential verification','核對憑證後還原先前選擇'],
 ['Test narration','Speak a sample using the selected voice settings','使用所選聲線設定朗讀樣本'],
 ['Reset name','Restore the original presentation name','還原原有顯示名稱'],
 ['Edit this surface','Open the editor for this exact settings surface','開啟這個設定介面的編輯器'],
 ['Add schedule','Validate and save the complete schedule draft','驗證並儲存完整時間表草稿'],
 ['Enable','Activate this saved schedule','啟用這個已儲存的時間表'],
 ['Disable','Suspend this schedule while retaining its configuration','暫停這個時間表並保留設定'],
 ['Remove','Remove this schedule from the local settings list','從本機設定清單移除這個時間表'],
 ['Configure credential','Open protected provider credential setup','開啟受保護來源憑證設定'],
 ['Clear credential','Delete this provider credential from protected storage','從受保護空間刪除這個來源憑證'],
 ['Store credential','Save the provider secret through the host adapter','透過主程式儲存來源秘密'],
 ['Cancel','Close provider setup and clear its secret input','關閉來源設定並清空秘密輸入'],
 ['Export settings','Download redacted versioned settings JSON','下載已移除敏感內容並有版本的設定 JSON'],
 ['Reset','Restore local preferences through required confirmation','透過必要確認還原本機偏好設定'],
 ['Set up history password','Create an independent encrypted-history password','建立加密歷史的獨立密碼'],
 ['Unlock history','Decrypt retained history after password verification','核對密碼後解密保留的歷史'],
 ['Lock history','Forget the in-memory history encryption key','清除記憶體中的歷史加密金鑰'],
 ['Compare selected entries','Compare exactly two selected history snapshots','比較剛好兩個已選取的歷史快照'],
 ['Export redacted history','Download history metadata without private snapshots','下載不含私人快照的歷史中繼資料'],
 ['Set retention','Record the selected history retention period','記錄所選的歷史保留期限'],
 ['Prune expired entries','Remove expired history after live session confirmation','在有效工作階段確認後移除過期歷史'],
 ['Restore','Apply the selected snapshot through current validation','透過目前驗證規則套用所選快照'],
 ['Save label','Append a labelled version of this history snapshot','附加帶標籤的歷史快照版本'],
 ['Import settings','Load a bounded versioned local settings file','載入有大小限制及版本的本機設定檔'],
 ['Not now (one hour)','Pause momentum reminders for one hour','暫停閒置提醒一小時'],
 ['Language and voice','Open language and speech preferences','開啟語言及語音偏好設定'],
 ['Appearance','Open surface appearance preferences','開啟介面外觀偏好設定'],
 ['Schedules','Open local schedule construction and management','開啟本機時間表建立及管理'],
 ['Attention','Open independent attention accommodations','開啟獨立的專注輔助選項'],
 ['Private local history','Open encrypted settings history management','開啟加密設定歷史管理'],
];
const slug=label=>label.toLowerCase().replace(/[^a-z0-9]+/g,'-');
const defaults={'Mode name':'School mode','Local unlock credential':'','Language':'en','English playfulness':5,'Cantonese playfulness':5,'Show emojis in dialogs and message boxes':false,Narrator:false,'Narration language':'en','English voice':'','Cantonese voice':'',Rate:1,Pitch:1,Theme:'system',Density:'comfortable','Accent color':'#52643f','Font family':'system-ui','Font scale':1,'Font weight':400,Motion:'system','Display name':'Material File Encryptor',Focus:false,'Low stimulation':false,'Time awareness':false,'One thing at a time':false,Momentum:false,'Next action':'','Schedule name':'','Start date':'','End date':'','Start time':'09:00','End time':'17:00',Timezone:'Current device timezone',Priority:0,Setting:'theme',Value:'dark',Source:'local',Endpoint:'',Entity:'','History password':'','Search history':'','From date':'','To date':'','Action filter':'','Entry label':'','Retention days':365,'Search settings':'','Access token':''};
export const SETTINGS_GUIDANCE_COPY={
 'Guidance documentation is unavailable.':'指引說明文件目前無法使用。','Empty':'空白','Not invoked':'尚未執行','None':'沒有','Available choices at this control':'這個控制項提供的選項',
 'Read the exact target and its current value.':'請閱讀確切目標及目前數值。',
 'Review required setup and consequences at the original control.':'請在原有控制項檢查必要設定及操作影響。',
 'The original action retains its validation, permissions and confirmation.':'原有操作會保留驗證、權限及確認要求。',
};
const pair=(en,yue)=>{SETTINGS_GUIDANCE_COPY[en]=yue;return en;};
export const SETTINGS_GUIDANCE_INVENTORY=[...fields.map(row=>[...row,false]),...actions.map(row=>[...row,true])].map(([label,en,yue,action])=>({
 id:`settings.${action?'action.':''}${slug(label)}`,label,capable:true,complexity:action?'complicated':'simple',
 reason:action?'Invokes a workflow or changes retained state.':'Edits one explicit field through its original consumer.',
 concept:`${action?'action':'setting'}-${slug(label)}`,help:`#${action?'action':'setting'}-${slug(label)}`,
 purpose:pair(en,yue),options:action?'The original action retains its validation, permissions and confirmation.':'Available choices at this control',default:action?'Not invoked':'None',
 effects:pair(`${en}. The original consumer applies this change.`,`${yue}，修改由原有處理程序套用。`),
 example:pair(`Use ${label} only for this target: ${en.toLowerCase()}.`,`這個目標的操作用途：${yue}。`),
 validation:pair(`Check the original ${label} control for its valid choices and unmet conditions.`,`請在原有控制項檢查「${yue}」的有效選項及尚未符合的條件。`),
 recovery:pair(`Return to ${label}, correct its input or cancel its open dialog. Completed changes remain visible at the target.`,`返回原有控制項修正輸入，或取消已開啟的對話框。已完成的修改會繼續顯示在目標。`),
 steps:action?[pair(en,yue),'Review required setup and consequences at the original control.','The original action retains its validation, permissions and confirmation.']:[pair(en,yue)],
}));
for(const row of SETTINGS_GUIDANCE_INVENTORY)if(Object.hasOwn(defaults,row.label))row.default=defaults[row.label]===''?'Empty':String(defaults[row.label]);
for(const [day,yue]of [['Sunday','星期日'],['Monday','星期一'],['Tuesday','星期二'],['Wednesday','星期三'],['Thursday','星期四'],['Friday','星期五'],['Saturday','星期六']])SETTINGS_GUIDANCE_INVENTORY.push({...SETTINGS_GUIDANCE_INVENTORY.find(r=>r.label==='Start date'),id:`settings.weekday.${slug(day)}`,label:day,concept:`weekday-${slug(day)}`,help:`#weekday-${slug(day)}`,purpose:pair(`Include ${day} as a starting day for this schedule.`,`將${yue}包括在時間表的開始日。`),effects:pair(`${day} controls whether this starting weekday matches.`,`${yue}決定這個開始日是否符合規則。`),default:'true',steps:[pair(`Choose whether this rule starts on ${day}.`,`選擇規則是否在${yue}開始。`)]});
export const NESTED_SETTINGS_GUIDANCE_PENDING=[
 {id:'appearance.editor',reason:'Appearance owner must register every property, layer, state and motion control.'},
 {id:'logo.editor',reason:'Logo conversion and nested controls require their own asynchronous workflow descriptors.'},
 {id:'access.profile',reason:'Access is a separately mounted credential and recovery surface.'},
 {id:'search.workbench',reason:'Regex-builder nested controls require their dedicated inventory.'},
];
// These workflow-specific steps use the same live fields and final consumer.
const workflows={
 'Add schedule':[
  ['Choose a descriptive schedule name and starting weekdays.','選擇有描述性的時間表名稱及開始的星期。'],
  ['Review dates, timezone and start/end times. Overnight windows belong to their starting day.','檢查日期、時區及起止時間。跨夜範圍屬於開始的一日。'],
  ['Choose the real setting, a compatible value and priority. External sources require an available host adapter.','選擇實際設定、相容數值及優先次序。外部來源需要可用的主程式支援。'],
  ['Validate the complete draft and save it through Add schedule.','驗證完整草稿，再透過新增時間表儲存。'],
 ],
 'Prune expired entries':[
  ['Unlock the local profile, then unlock history with its separate password.','解鎖本機設定檔，再使用獨立密碼解鎖歷史。'],
  ['Review retention days and export redacted history if metadata must be retained. Removed snapshots cannot be recovered.','檢查保留日數，需要保留中繼資料時先匯出。已移除的快照不能復原。'],
  ['Continue to the two-key and full-slider confirmation. Authentication loss or page navigation cancels approval.','繼續至兩個開關及完整滑桿確認。驗證失效或頁面導覽會取消授權。'],
 ],
 'Reset':[
  ['Export settings if the current language, appearance, attention or schedules must be retained.','需要保留目前語言、外觀、專注設定或時間表時，請先匯出設定。'],
  ['Disable an active protected mode through its verified control before resetting that state.','重設受保護模式狀態前，請先透過已驗證控制項停用模式。'],
  ['Continue to the required destructive-action confirmation. Cancelling leaves settings unchanged.','繼續至必要的破壞性操作確認。取消會保留原有設定。'],
 ],
 'Import settings':[
  ['Choose a local versioned settings JSON file smaller than 256 KiB.','選擇小於 256 KiB 並有版本的本機設定 JSON 檔。'],
  ['The original importer validates the entire file. Credentials and private image data are never restored.','原有匯入程序會驗證整個檔案，憑證及私人圖片資料不會還原。'],
  ['Protected mode changes still require the separate verified mode control.','修改受保護模式仍然需要獨立的已驗證模式控制項。'],
 ],
};
for(const[label,steps]of Object.entries(workflows)){const row=SETTINGS_GUIDANCE_INVENTORY.find(row=>row.label===label);row.steps=steps.map(([en,yue])=>pair(en,yue));row.options=row.steps[0];row.effects=row.steps[1];row.validation=row.steps.at(-1);row.recovery=pair(`Cancel ${label} before its final confirmation. Exported settings can restore supported preferences through the validated importer.`,`在最後確認前取消這個操作。已匯出的設定可透過已驗證匯入程序還原支援的偏好設定。`);}
for(const label of ['Local unlock credential','History password','Source','Value','Timezone','Setting']){
 const row=SETTINGS_GUIDANCE_INVENTORY.find(row=>row.label===label);row.complexity='complicated';row.reason='Requires credential setup, unfamiliar type selection or schedule dependencies.';row.steps=[row.purpose,row.validation,row.recovery];
}
export function settingsGuidance(label,{context='',helpBase='docs/features/interface/settings-guidance.md',defaultValue,options}={}){
 const row=SETTINGS_GUIDANCE_INVENTORY.find(value=>value.label===label)||(label.startsWith('Reset ')?SETTINGS_GUIDANCE_INVENTORY.find(value=>value.label===label.slice(6)):null);if(!row)throw Error(`Unregistered settings guidance: ${label}`);
 return {...row,label,id:(label.startsWith('Reset ')?`settings.action.${slug(label)}`:row.id)+(context?`.${context}`:''),help:helpBase+row.help,default:defaultValue===undefined?row.default:defaultValue===''?'Empty':String(defaultValue),options:options||row.options};
}
