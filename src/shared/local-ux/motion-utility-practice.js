import {definePractice} from '../surface/guidance-playground.js';
export const MOTION_UTILITY_COPY={};
const say=(en,yue)=>{MOTION_UTILITY_COPY[en]=yue;return en;};
const rows=[
 ['bezier-x1','Bezier X1','貝茲 X1','number',.4,0,1,.7,'curve'],['bezier-y1','Bezier Y1','貝茲 Y1','number',0,-5,5,.4,'curve'],['bezier-x2','Bezier X2','貝茲 X2','number',.2,0,1,.6,'curve'],['bezier-y2','Bezier Y2','貝茲 Y2','number',1,-5,5,.7,'curve'],
 ['step-count','Step count','步級數目','number',4,-1000,1000,8,'steps'],['step-jump','Step jump position','步級跳躍位置','select','jump-end',null,null,'jump-start','steps'],['linear-stops','Linear easing stops','線性緩動停點','text','[[0,0],[1,100]]',null,null,'[[0,0],[0.4,50],[1,100]]','curve'],
 ['spring-mass','Spring mass','彈簧質量','number',1,.001,10000,2,'spring'],['spring-stiffness','Spring stiffness','彈簧剛度','number',100,0,10000,200,'spring'],['spring-damping','Spring damping','彈簧阻尼','number',10,0,10000,20,'spring'],['spring-velocity','Spring initial velocity','彈簧初始速度','number',0,-10000,10000,5,'spring'],
 ['track-markers','Track markers','軌道標記','text','[{"name":"Start","time":150},{"name":"Finish","time":750}]',null,null,'[{"name":"Middle","time":400}]','markers'],['timeline-markers','Timeline markers','時間軸標記','text','[{"name":"Start","time":150},{"name":"Finish","time":750}]',null,null,'[{"name":"Middle","time":400}]','markers'],['marker-name','Marker name','標記名稱','text','Start',null,null,'Opening','markers'],['marker-time','Marker time','標記時間','number',150,0,1000,400,'markers'],['preset-name','Motion preset name','動態預設名稱','text','',null,null,'Sample quiet','preset'],
];
const actions=[['spring-clear','Clear unavailable spring','清除未支援彈簧','spring'],['marker-add','Add timeline marker','新增時間軸標記','markers'],['marker-remove','Remove marker','移除標記','markers'],['marker-seek','Seek timeline marker','定位時間軸標記','markers'],['preset-save','Save motion preset','儲存動態預設','preset'],['preset-apply','Apply motion preset','套用動態預設','preset']];
const descriptions={
 curve:['Edit one authored curve parameter and inspect its local graph.','編輯一個預先編寫曲線參數，檢查本機圖表。','The sample shows the resulting curve and halfway progress; no native easing is installed.','樣本顯示結果曲線同中段進度，唔會安裝原生緩動。'],
 steps:['Edit the sample step count or jump convention.','編輯樣本步級數目或跳躍方式。','A local step graph shows discrete progress; count input uses the original rounded minimum-one rule.','本機步級圖顯示離散進度，數目輸入使用原有四捨五入同最少一格規則。'],
 spring:['Edit or remove synthetic spring metadata without starting physics playback.','編輯或移除合成彈簧中繼資料，唔會啟動物理播放。','The retained sample parameters and derived physical quantities are visible. Native spring playback is unavailable.','保留樣本參數同推導物理數值會顯示，原生彈簧播放無法使用。'],
 markers:['Edit only the authored sample marker list or selected marker.','只編輯預先編寫樣本標記清單或已選標記。','The local ruler and marker records change without changing keyframes or seeking a real handle.','本機尺規同標記記錄改變，唔會改變影格或定位真實控制。'],
 preset:['Name, capture or apply an isolated authored motion snapshot.','命名、擷取或套用獨立預先編寫動態快照。','Only sample names and snapshots change; preset capture omits nested presets and schedules.','只有樣本名稱同快照改變，擷取預設會排除巢狀預設同時間表。'],
};
const record={curve:[.4,0,.2,1],steps:{count:4,jump:'jump-end'},linear:[[0,0],[1,100]],spring:{mass:1,stiffness:100,damping:10,initialVelocity:0},trackMarkers:[{name:'Start',time:150},{name:'Finish',time:750}],markers:[{name:'Start',time:150},{name:'Finish',time:750}],playhead:400,presetName:'',model:{tracks:[{id:'sample-track',name:'Sample active',timing:{duration:300}}],unknown:{presets:{Historical:{tracks:[]}},schedules:[{id:'sample-clock'}]}},presets:{'Sample quiet':{tracks:[{id:'sample-quiet',name:'Sample quiet',timing:{duration:0}}],unknown:{}}}};
const input=say('All curves, markers, names and snapshots below are fixed public samples. No current motion data is read.','以下曲線、標記、名稱同快照全部係固定公開樣本，唔會讀取目前動態資料。');
const fixtures={},descriptors={};
const meanings={
 'bezier-x1':['Move the first Bezier control point horizontally to change early time progression.','水平移動第一個貝茲控制點，改變早段時間進度。'],
 'bezier-y1':['Move the first Bezier control point vertically to change early output acceleration.','垂直移動第一個貝茲控制點，改變早段輸出加速。'],
 'bezier-x2':['Move the second Bezier control point horizontally to change late time progression.','水平移動第二個貝茲控制點，改變後段時間進度。'],
 'bezier-y2':['Move the second Bezier control point vertically to change approach or overshoot at the end.','垂直移動第二個貝茲控制點，改變終段接近或超越幅度。'],
 'step-count':['Round the requested step count and retain at least one discrete timing interval.','將要求步級數目四捨五入，保留最少一個離散時間區間。'],
 'step-jump':['Choose whether discrete progress jumps at interval starts, ends, both boundaries or neither boundary.','選擇離散進度喺區間起點、終點、兩邊或兩邊都唔跳躍。'],
 'linear-stops':['Author output and percentage pairs for a piecewise linear easing curve.','為分段線性緩動曲線編寫輸出同百分比配對。'],
 'spring-mass':['Retain the requested spring mass as portable physics metadata.','將要求彈簧質量保留為可攜物理中繼資料。'],
 'spring-stiffness':['Retain the spring restoring-force coefficient independently of its mass and damping.','獨立於質量同阻尼，保留彈簧回復力係數。'],
 'spring-damping':['Retain the spring attenuation coefficient without enabling unsupported playback.','保留彈簧衰減係數，唔會啟用未支援播放。'],
 'spring-velocity':['Retain the initial signed spring velocity without changing the other physics parameters.','保留帶正負號初始彈簧速度，唔會改變其他物理參數。'],
 'spring-clear':['Remove the selected track spring metadata that makes native physics preview unavailable.','移除所選軌道令原生物理預覽不可用嘅彈簧中繼資料。'],
 'track-markers':['Replace only the selected track marker list, leaving global timeline markers unchanged.','只取代所選軌道標記清單，全域時間軸標記保持不變。'],
 'timeline-markers':['Replace the global timeline marker list without editing track keyframes.','取代全域時間軸標記清單，唔會編輯軌道影格。'],
 'marker-name':['Rename this exact timeline marker while preserving its timestamp.','重新命名呢個確切時間軸標記，保留時間戳記。'],
 'marker-time':['Move this exact timeline marker to a nonnegative document timestamp.','將呢個確切時間軸標記移到非負文件時間戳記。'],
 'marker-add':['Append one global marker at the current playhead through the original motion mutation.','透過原有動態修改，喺目前播放頭加入一個全域標記。'],
 'marker-remove':['Remove this exact global marker without deleting another marker or keyframe.','移除呢個確切全域標記，唔會刪除另一個標記或影格。'],
 'marker-seek':['Seek the original playback handle to this named marker without saving a model change.','將原有播放控制定位到呢個具名標記，唔會儲存模型修改。'],
 'preset-name':['Draft the name used by the next explicit motion preset capture.','編寫下一次明確動態預設擷取使用嘅名稱草稿。'],
 'preset-save':['Capture the current validated motion under its drafted name, excluding nested presets and schedules.','用草稿名稱擷取目前有效動態，排除巢狀預設同時間表。'],
 'preset-apply':['Apply this named motion snapshot while retaining the current preset and schedule collections.','套用呢份具名動態快照，保留目前預設同時間表集合。'],
};
function descriptor(key,label,yue,fixture,reset=false){const [purpose,purposeYue]=meanings[fixture.key],effects=descriptions[fixture.domain][2],effectsYue=descriptions[fixture.domain][3];return descriptors[key]=Object.freeze({utility:true,id:'motion.utility:'+key,label:say(label,yue),concept:key,sourceId:'docs/features/interface/guidance-playgrounds.md',help:'docs/features/interface/guidance-playgrounds.md#motion-utility-practices',purpose:say(reset?'Restore '+label.slice(13)+' through its existing Reset value action.':purpose,reset?'透過現有重設數值操作還原「'+yue.slice(5)+'」。':purposeYue),options:say('Use the adjacent original control; the practice has its own authored bounds.','使用旁邊原有控制項，練習有自己嘅預先編寫範圍。'),default:String(fixture.fallback??fixture.initial),effects:say(effects,effectsYue),example:fixture.action,validation:say('Original validation and admission remain authoritative. The sample never authorizes a real change.','原有驗證同許可仍然作準，樣本唔會批准真實修改。'),recovery:say('Reset the sample independently, or close the information to return to the original control.','獨立重設樣本，或者關閉說明返回原有控制項。'),practice:fixture,steps:[say('Review the original control and its consequences.','檢查原有控制項同影響。'),say('Run the original operation once.','執行原有操作一次。')]});}
for(const[key,label,yue,control,initial,min,max,example,domain]of rows){const common={kind:'motion-utility',key,domain,control,label:say('Sample '+label,'樣本'+yue),initial,min,max,record,input,action:say(`Try ${String(example)} in the sample ${label}.`,`喺樣本「${yue}」試用 ${String(example)}。`),expected:say(descriptions[domain][2],descriptions[domain][3]),...(key==='step-jump'?{choices:['jump-start','jump-end','jump-none','jump-both','start','end'].map(value=>({value,label:value}))}:{})};
 const fixture=definePractice({...common,id:'motion-utility-sample:'+key});fixtures[key]=fixture;descriptor(key,label,yue,fixture);
 const reset=definePractice({...common,id:'motion-utility-sample:reset-'+key,variant:'reset',control:'action',initial:example,fallback:initial,label:say('Reset sample '+label,'重設樣本'+yue),action:say('Restore this sample field to the authored opening value.','將呢個樣本欄位還原為預先編寫開啟數值。')});fixtures['reset-'+key]=reset;descriptor('reset-'+key,'Reset value: '+label,'重設數值：'+yue,reset,true);
}
for(const[key,label,yue,domain]of actions){const fixture=definePractice({id:'motion-utility-sample:'+key,kind:'motion-utility',key,domain,control:key==='preset-save'?'text-action':'action',label:say(label,yue),initial:key==='preset-save'?'Sample saved':0,record,input,action:say(descriptions[domain][0],descriptions[domain][1]),expected:say(descriptions[domain][2],descriptions[domain][3])});fixtures[key]=fixture;descriptor(key,label,yue,fixture);}
export const MOTION_UTILITY_PRACTICE=Object.freeze(fixtures);
export const MOTION_UTILITY_GUIDANCE=Object.freeze(descriptors);
export const MOTION_UTILITY_FIELD_KEYS=Object.freeze(Object.fromEntries(rows.map(([key,label])=>[label,key])));
export const MOTION_UTILITY_BUTTON_KEYS=Object.freeze(Object.fromEntries(actions.filter(([key])=>!['marker-seek','preset-apply'].includes(key)).map(([key,label])=>[label,key])));
export function motionUtilityGuidance(key,{context='default',label}={}){const row=Object.hasOwn(descriptors,key)?descriptors[key]:null;return row?{...row,id:row.id+':'+context,...(label?{label}:{})}:null;}
