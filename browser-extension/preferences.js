export const preferenceKey='mfe-extension-preferences-v1';
export const defaults=Object.freeze({version:1,language:'en',theme:'system',tab:'connection'});
export function validatePreferences(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='language,tab,theme,version'||value.version!==1||!['en','yue','bilingual'].includes(value.language)||!['system','light','dark'].includes(value.theme)||!['connection','personalization','status'].includes(value.tab))throw new Error('Invalid local preferences.');
 return {...value};
}
export function readPreferences(storage){try{const raw=storage.getItem(preferenceKey);if(raw===null)return {value:{...defaults},state:'default'};if(raw.length>2048)throw new Error();return {value:validatePreferences(JSON.parse(raw)),state:'saved'};}catch{return {value:{...defaults},state:'unavailable'};}}
export function savePreferences(storage,value){const next=validatePreferences(value);storage.setItem(preferenceKey,JSON.stringify(next));return next;}
export function tabTarget(key,index,count){if(key==='Home')return 0;if(key==='End')return count-1;if(key==='ArrowRight')return (index+1)%count;if(key==='ArrowLeft')return (index+count-1)%count;return null;}

export function applyPreferences(storage,current,change){const value=validatePreferences({...current,...change});try{savePreferences(storage,value);return {value,state:'saved'};}catch{return {value,state:'write-failed'};}}
