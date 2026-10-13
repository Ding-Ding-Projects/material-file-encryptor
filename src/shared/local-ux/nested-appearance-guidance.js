import {NESTED_PRACTICE} from './appearance-practice.js';
/** Explicit coverage for layer navigation and local logo controls. Other editor
 * tools remain pending; these records do not claim complete editor guidance. */
export const NESTED_APPEARANCE_GUIDANCE = Object.freeze([
 ['select-state','Interaction state','互動狀態','Choose which interaction state receives subsequent layer edits.','選擇之後圖層修改所屬嘅互動狀態。','normal','Selecting hover does not simulate a hover or change the normal state.','選擇 hover 唔會模擬滑鼠停留，亦唔會改 normal 狀態。','Choose focus before editing a keyboard focus outline.','先選 focus，再修改鍵盤焦點外框。','Use one of the twelve registered states.','只可選十二個已登記狀態。','Return to normal to inspect the base appearance.','返回 normal 檢查基本外觀。'],
 ['select-layer','Selected layer','所選圖層','Choose the layer that property fields and layer actions operate on.','選擇屬性欄及圖層操作要處理嘅圖層。','0','Selection changes the editor target without changing stored properties.','選取只會改編輯目標，唔會修改已儲存屬性。','Select the second layer before renaming it.','先選第二個圖層，再改佢個名。','The layer must exist in the currently open group.','圖層必須存在於目前開啟嘅群組。','Select the previous layer again; selection itself creates no style revision.','重新選之前嘅圖層，選取本身唔會新增樣式修訂。'],
 ['toggle-visible','Layer visibility','圖層可見性','Include or exclude this layer from the rendered composition.','決定呢個圖層會唔會參與畫面合成。',true,'Hiding retains the layer data while removing its visual contribution.','隱藏會保留圖層資料，但唔再顯示佢嘅效果。','Hide a shadow layer to compare the remaining composition.','隱藏陰影圖層，比較其餘合成效果。','Use the existing visibility action for this exact layer.','使用呢個圖層原有嘅可見性操作。','Show the same layer again or use appearance Undo.','重新顯示同一圖層，或者使用外觀復原。'],
 ['toggle-locked','Layer edit lock','圖層編輯鎖','Prevent property editing of this layer until its edit lock is released.','鎖住呢個圖層嘅屬性修改，直到解除編輯鎖。',false,'This editor lock is not a profile password or a credential permission.','呢個編輯鎖唔係設定檔密碼，亦唔代表憑證權限。','Lock a finished background layer before working above it.','背景圖層完成後鎖住，再編輯上面嘅圖層。','The original layer lock handler decides the state transition.','由原有圖層鎖處理程序決定狀態變更。','Use Unlock layer for the same layer.','使用同一圖層嘅解除鎖定操作。'],
 ['open-group','Open group','開啟群組','Navigate into an editable group to select its child layers.','進入可編輯群組，選取入面嘅子圖層。','Root group','Opening a rasterized editable group removes its generated raster preview through the original action.','開啟已點陣化但可編輯嘅群組，會透過原有操作移除產生嘅點陣預覽。','Open a text decoration group to edit its underline child.','開啟文字裝飾群組，修改入面嘅底線圖層。','Locked groups and immutable embedded sources cannot be entered.','已鎖定群組及不可變嵌入來源唔可以進入。','Return with Back to parent group; detach an embedded copy only through its separate action.','使用返回上層群組，嵌入副本必須透過獨立操作先可以分離。'],
 ['parent-group','Back to parent group','返回上層群組','Leave the current group and select its containing layer.','離開目前群組，選取包含佢嘅圖層。','Root group','Navigation preserves child properties and does not flatten the group.','導覽會保留子圖層屬性，唔會將群組合併。','Return after editing a nested border layer.','修改巢狀邊框圖層後返回上層。','Available only while a child group is open.','只限已開啟子群組時使用。','Open that group again to continue editing its children.','重新開啟該群組，繼續修改子圖層。'],
 ['logo-file','Choose a local logo','選擇本機標誌','Choose a static local image for conversion into the displayed logo.','選擇本機靜態圖片，轉換成顯示用標誌。',null,'The original converter stores a flattened 128 by 128 PNG locally.','原有轉換器會喺本機儲存已平面化嘅 128 × 128 PNG。','Choose a square static PNG with a transparent background.','選擇正方形、透明背景嘅靜態 PNG。','PNG, JPEG or WebP only; at most 4 MiB, 8192 per dimension and 16000000 decoded pixels.','只限 PNG、JPEG 或 WebP，最多 4 MiB、每邊 8192 及解碼後 16000000 像素。','Choose another valid image, or Reset logo to restore the original.','選另一張有效圖片，或者重設標誌恢復原樣。'],
 ['logo-fit','Logo fit','標誌填放方式','Choose whether the whole image fits or fills the square logo canvas.','選擇完整放入圖片，或者填滿正方形標誌畫布。','contain','Cover crops overflowing image edges; contain can leave transparent margins.','填滿會裁走超出部分，完整放入可能留透明邊位。','Use contain to retain a wide wordmark.','用完整放入保留闊身文字標誌。','Only contain and cover are offered by the original toggle.','原有切換只提供 contain 及 cover。','Toggle back to contain and inspect the preview.','切換返 contain，檢查預覽。'],
 ['logo-x','Horizontal focal point','水平焦點','Position the image horizontally within the logo conversion canvas.','調整圖片喺標誌轉換畫布嘅水平位置。',0.5,'The offset affects remaining space or cropped overflow, not image scale.','偏移會影響剩餘空間或裁切位置，唔會改圖片比例。','Move toward the right to retain a subject near the right edge in cover mode.','填滿時向右移，保留靠右邊嘅主體。','Use the original range from 0 to 1 in steps of 0.01.','使用原有 0 至 1、每格 0.01 嘅範圍控制項。','Return to 0.5 and inspect the converted preview.','返回 0.5，再檢查轉換預覽。'],
 ['logo-y','Vertical focal point','垂直焦點','Position the image vertically within the logo conversion canvas.','調整圖片喺標誌轉換畫布嘅垂直位置。',0.5,'The vertical offset determines which top or bottom overflow is cropped.','垂直偏移會決定裁走上面定下面超出嘅部分。','Move upward to retain a face near the top of a portrait.','向上移，保留直幅圖片上方嘅面部。','Use the original range from 0 to 1 in steps of 0.01.','使用原有 0 至 1、每格 0.01 嘅範圍控制項。','Return to 0.5 and inspect the converted preview.','返回 0.5，再檢查轉換預覽。'],
 ['logo-reset','Reset logo','重設標誌','Remove the locally stored custom logo and restore the original presentation.','移除本機儲存嘅自訂標誌，恢復原有顯示。',null,'The original reset clears the chosen file and notifies the logo consumer with null.','原有重設會清除所選檔案，並以 null 通知標誌接收端。','Reset after trying a seasonal logo.','試完節日標誌後重設。','Run only through the original reset control and its current permissions.','只可透過原有重設控制項及目前權限執行。','Choose the original local image again to recreate a custom logo; reset has no independent backup.','重新選擇本機圖片建立自訂標誌，重設本身冇獨立備份。'],
].map(([key,label,labelYue,purpose,purposeYue,defaultValue,effects,effectsYue,example,exampleYue,validation,validationYue,recovery,recoveryYue])=>Object.freeze({key,id:`nested-appearance:${key}`,label,labelYue,purpose,purposeYue,defaultValue,effects,effectsYue,example,exampleYue,validation,validationYue,recovery,recoveryYue})));

const OPTIONS={
 'select-state':['normal, hover, focus, active, selected, disabled, dragged, invalid, loading, success, warning, error','normal、hover、focus、active、selected、disabled、dragged、invalid、loading、success、warning、error'],
 'select-layer':['One existing layer in the current group.','目前群組內一個現有圖層。'],
 'toggle-visible':['Show or Hide this layer.','顯示或者隱藏呢個圖層。'],
 'toggle-locked':['Lock layer or Unlock layer.','鎖定或者解除鎖定圖層。'],
 'open-group':['Open the selected editable group.','開啟所選可編輯群組。'],
 'parent-group':['Return one group level.','返回上一層群組。'],
 'logo-file':['One static PNG, JPEG or WebP file selected locally.','一個本機靜態 PNG、JPEG 或 WebP 檔案。'],
 'logo-fit':['contain retains the whole image; cover fills the square.','contain 保留完整圖片，cover 填滿正方形。'],
 'logo-x':['0 through 1, with increments of 0.01.','0 至 1，每格 0.01。'],
 'logo-y':['0 through 1, with increments of 0.01.','0 至 1，每格 0.01。'],
 'logo-reset':['Restore the original logo; no file is selected afterward.','恢復原有標誌，之後唔會選取任何檔案。'],
};
export function nestedAppearanceGuidance(key,{language='en',instance='default',provenance='compiled-default'}={}){
 const row=NESTED_APPEARANCE_GUIDANCE.find(row=>row.key===key);if(!row)throw Error(`Unregistered nested appearance guidance: ${key}`);
 const yue=language==='yue',pick=field=>row[field+(yue?'Yue':'')];
 const concept=`nested-${key}`;
 return {...row,practice:NESTED_PRACTICE[key],id:`${row.id}:${instance}`,capable:true,concept,sourceId:'docs/features/interface/nested-appearance-guidance.md',help:`nested-appearance-guidance${yue?'.zh-HK':''}.md#${concept}`,purpose:pick('purpose'),effects:pick('effects'),example:pick('example'),validation:pick('validation'),recovery:pick('recovery'),options:OPTIONS[key][yue?1:0],default:JSON.stringify(row.defaultValue),provenance,steps:[pick('purpose'),pick('validation'),pick('effects')]};
}

/** A wizard invokes the existing event route and awaits its admitted consumer.
 * Capture-phase locks can block admission. No action closure is called here. */
export async function invokeNestedAppearanceControl(target,{eventType='click',resetFlight,getFlight}={}){
 if(target.disabled||target.readOnly||target.isConnected===false)throw Error('This control is unavailable.');
 if(typeof resetFlight!=='function'||typeof getFlight!=='function')throw Error('An original consumer admission adapter is required.');
 resetFlight();const EventType=target.ownerDocument?.defaultView?.Event||globalThis.Event;
 const admitted=target.dispatchEvent(new EventType(eventType,{bubbles:true,cancelable:true,composed:true}));
 const flight=getFlight();if(!admitted||!flight||typeof flight.then!=='function')throw Error('The original control did not admit this action.');
 return await flight;
}
