export const preferenceKey='mfe-extension-preferences-v1';
export const defaults=Object.freeze({version:2,language:'en',theme:'system',tab:'connection',funnyEnglish:5,funnyCantonese:5,emoji:false});
export function validatePreferences(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='emoji,funnyCantonese,funnyEnglish,language,tab,theme,version'||value.version!==2||!Number.isInteger(value.funnyEnglish)||value.funnyEnglish<1||value.funnyEnglish>5||!Number.isInteger(value.funnyCantonese)||value.funnyCantonese<1||value.funnyCantonese>5||typeof value.emoji!=='boolean'||!['en','yue','bilingual'].includes(value.language)||!['system','light','dark'].includes(value.theme)||!['connection','personalization','changelog','status'].includes(value.tab))throw new Error('Invalid local preferences.');
 return {...value};
}
export function readPreferences(storage){try{const raw=storage.getItem(preferenceKey);if(raw===null)return {value:{...defaults},state:'default'};if(raw.length>2048)throw new Error();return {value:validatePreferences(migrate(JSON.parse(raw))),state:'saved'};}catch{return {value:{...defaults},state:'unavailable'};}}
export function savePreferences(storage,value){const next=validatePreferences(value);storage.setItem(preferenceKey,JSON.stringify(next));return next;}
export function tabTarget(key,index,count){if(key==='Home')return 0;if(key==='End')return count-1;if(key==='ArrowRight')return (index+1)%count;if(key==='ArrowLeft')return (index+count-1)%count;return null;}

export function applyPreferences(storage,current,change){const value=validatePreferences({...current,...change});try{savePreferences(storage,value);return {value,state:'saved'};}catch{return {value,state:'write-failed'};}}

function migrate(value){if(value?.version===1&&Object.keys(value).sort().join(',')==='language,tab,theme,version')return {...defaults,...value,version:2};return value;}

export function acquireStorage(root=globalThis){try{return root.localStorage;}catch{return null;}}
