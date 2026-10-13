import {definePractice} from '../surface/guidance-playground.js';
export const COLOR_PRACTICE_COPY={};
const say=(en,yue)=>{COLOR_PRACTICE_COPY[en]=yue;return en;};
const record={draft:'#6750a480',target:'#335577ff',inherited:'#445566ff',override:true,name:'Sample violet',palette:[{id:'sample-violet',name:'Sample violet',value:'#6750a480'},{id:'sample-blue',name:'Sample blue',value:'#335577ff'}],recent:[],space:'hex',level:5};
const input=say('A fixed violet draft, blue accepted color and two synthetic palette entries are independent of your colors.','固定紫色草稿、藍色已接受顏色同兩個合成調色盤項目，全部獨立於你嘅顏色。');
const specs=[
 ['entry','Sample color entry','樣本顏色輸入','text','#6750a480','Enter #24996680 or another supported color notation.','輸入 #24996680 或其他支援顏色格式。','The sample swatch and contrast update while accepted color stays unchanged.','樣本色塊同對比更新，已接受顏色保持不變。'],
 ['space','Sample color notation','樣本顏色格式','buttons','hex','Choose any of the twelve color notations.','選擇十二種顏色格式之一。','The same synthetic red color is represented in the selected notation.','相同合成紅色會用所選格式表示。'],
 ['hue','Sample hue','樣本色相','number',256.42857143,'Enter hue 120.','輸入色相 120。','Only sample hue changes while alpha is retained.','只有樣本色相改變，透明度保留。'],
 ['saturation','Sample saturation','樣本飽和度','number',51.2195122,'Enter saturation 50.','輸入飽和度 50。','The sample moves toward gray without changing its alpha.','樣本向灰色移動，透明度保持不變。'],
 ['brightness','Sample brightness','樣本亮度','number',64.31372549,'Enter brightness 70.','輸入亮度 70。','Only the sample HSV brightness changes.','只有樣本 HSV 亮度改變。'],
 ['alpha','Sample alpha','樣本透明度','number',128/255,'Enter alpha 0.5.','輸入透明度 0.5。','The sample alpha is quantized to an eight-bit value.','樣本透明度量化成八位元數值。'],
 ['apply','Apply sample color','套用樣本顏色','action',0,'Apply the fixed violet draft.','套用固定紫色草稿。','Only the sample target and recent list receive the draft.','只有樣本目標同最近清單收到草稿。'],
 ['copy','Preview copied representation','預覽複製表示法','action',0,'Preview copying the sample HEX8 text.','預覽複製樣本 HEX8 文字。','A local copiedText result appears; the operating system clipboard is untouched.','本機 copiedText 結果顯示，作業系統剪貼簿保持不變。'],
 ['eyedropper','Preview sample pixel selection','預覽樣本像素選擇','action',0,'Select the authored green sample pixel.','選擇預先編寫綠色樣本像素。','The sample RGB changes and retains alpha; no screen is sampled.','樣本 RGB 改變並保留透明度，唔會取樣螢幕。'],
 ['swatch','Sample swatches','樣本色塊','buttons','violet','Choose the blue sample swatch.','選擇藍色樣本色塊。','The local draft changes without applying it to the accepted sample color.','本機草稿改變，唔會套用至已接受樣本顏色。'],
 ['name','Sample custom name','樣本自訂名稱','text','Sample violet','Enter a short sample label.','輸入簡短樣本標籤。','Only the synthetic unsaved name changes.','只有合成未儲存名稱改變。'],
 ['save','Save sample swatch','儲存樣本色塊','text-action','Sample violet','Name and add the sample violet to the local list.','為樣本紫色命名並加入本機清單。','One synthetic palette row is added; no saved palette is written.','加入一個合成調色盤列，唔會寫入已儲存調色盤。'],
 ['remove','Remove sample swatch','移除樣本色塊','action',0,'Remove only sample-violet.','只移除 sample-violet。','The blue sample entry and accepted color remain.','藍色樣本項目同已接受顏色保留。'],
 ['rainbow','Sample rainbow marker','樣本彩虹標記','action',0,'Preview choosing the structured rainbow marker.','預覽選擇結構化彩虹標記。','A static spectrum demonstrates the marker; no animation or real setting changes.','靜態光譜示範標記，唔會播放動畫或改變真實設定。'],
 ['speed','Sample rainbow speed','樣本彩虹速度','number',5,'Compare whole levels 1 and 10.','比較整數等級 1 同 10。','The authoritative mapping changes the sample duration from 55s to 1s.','正式換算將樣本週期由 55s 改為 1s。'],
 ['reset','Reset sample override','重設樣本覆寫','action',0,'Remove the synthetic explicit override.','移除合成明確覆寫。','The inherited sample color becomes effective and the sample palette is retained.','繼承樣本顏色生效，樣本調色盤保留。'],
];
const bounds={hue:[0,360,0],saturation:[0,100,1],brightness:[0,100,2],alpha:[0,1,3],speed:[1,10]};
const fixtures={};
for(const[key,label,yue,control,initial,action,actionYue,expected,expectedYue]of specs){const bound=bounds[key],choices=key==='space'?['named','hex','rgb','hsl','hsv','hsb','hwb','lab','lch','oklab','oklch','cmyk'].map(value=>({value,label:value})):key==='swatch'?[{value:'violet',label:say('Violet sample','紫色樣本'),color:'#6750a480'},{value:'blue',label:say('Blue sample','藍色樣本'),color:'#335577ff'}]:null;
 fixtures[key]=definePractice({id:'color-picker-sample:'+key,kind:'color-lab',key,control,label:say(label,yue),initial,record:key==='space'?{...record,draft:'#ff0000ff'}:record,input,action:say(action,actionYue),expected:say(expected,expectedYue),...(bound?{min:bound[0],max:bound[1],...(bound.length>2?{channel:bound[2]}:{})}:{}),...(choices?{choices}:{}),...(key==='eyedropper'?{pixel:'#249966ff'}:{})});
}
for(const key of ['entry','hue','saturation','brightness','alpha','speed','name'])fixtures['clear-'+key]=definePractice({...fixtures[key],id:'color-picker-sample:clear-'+key,control:'clear',label:say('Clear '+fixtures[key].label.toLowerCase(),'清除'+COLOR_PRACTICE_COPY[fixtures[key].label]),action:say('Clear only this synthetic draft field.','只清除呢個合成草稿欄位。'),expected:say('The draft is empty and invalid until corrected; accepted color and palette remain.','草稿空白同無效，修正後先可使用；已接受顏色同調色盤保留。')});
fixtures.search=definePractice({id:'color-picker-sample:search',kind:'search',label:say('Sample color search','樣本顏色搜尋'),initial:'blue',rows:['Sample violet #6750a480','Sample blue #335577ff'],input,action:say('Search blue, then clear the query.','搜尋 blue，再清除查詢。'),expected:say('The synthetic palette is filtered without changing its colors.','合成調色盤會篩選，顏色保持不變。')});
export const COLOR_PRACTICE=Object.freeze(fixtures);
export const COLOR_HUE_SLIDER_PRACTICE=definePractice({...fixtures.hue,id:'color-picker-sample:hue-slider',control:'slider'});
