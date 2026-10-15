export const preferenceKey='mfe-extension-preferences-v1';
export const defaults=Object.freeze({version:3,language:'en',theme:'system',tab:'home',funnyEnglish:5,funnyCantonese:5,emoji:false,displayName:'',accent:''});
const KEYS='accent,displayName,emoji,funnyCantonese,funnyEnglish,language,tab,theme,version';
// A display name is plain text: bounded, trimmed and free of control characters.
export function validDisplayName(value){return typeof value==='string'&&value.length<=60&&value===value.trim()&&!/[\u0000-\u001f\u007f-\u009f<>]/.test(value);}
// An accent colour is empty (the built-in palette) or #rrggbb / #rrggbbaa.
export function validAccent(value){return value===''||/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/.test(value);}
export function validatePreferences(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==KEYS||value.version!==3||!Number.isInteger(value.funnyEnglish)||value.funnyEnglish<1||value.funnyEnglish>5||!Number.isInteger(value.funnyCantonese)||value.funnyCantonese<1||value.funnyCantonese>5||typeof value.emoji!=='boolean'||!['en','yue','bilingual'].includes(value.language)||!['system','light','dark'].includes(value.theme)||!['home','connection','personalization','changelog','notes','docs','support','dimsum','models','status','publishing'].includes(value.tab)||!validDisplayName(value.displayName)||!validAccent(value.accent))throw new Error('Invalid local preferences.');
 return {...value};
}
export function readPreferences(storage){try{const raw=storage.getItem(preferenceKey);if(raw===null)return {value:{...defaults},state:'default'};if(raw.length>2048)throw new Error();return {value:validatePreferences(migrate(JSON.parse(raw))),state:'saved'};}catch{return {value:{...defaults},state:'unavailable'};}}
export function savePreferences(storage,value){const next=validatePreferences(value);storage.setItem(preferenceKey,JSON.stringify(next));return next;}
export function tabTarget(key,index,count){if(key==='Home')return 0;if(key==='End')return count-1;if(key==='ArrowRight')return (index+1)%count;if(key==='ArrowLeft')return (index+count-1)%count;return null;}

export function applyPreferences(storage,current,change){const value=validatePreferences({...current,...change});try{savePreferences(storage,value);return {value,state:'saved'};}catch{return {value,state:'write-failed'};}}

function migrate(value){
 // Older versions remembered the last open tab. The workspace now opens on Home, so a migrated record starts there.
 if(value?.version===1&&Object.keys(value).sort().join(',')==='language,tab,theme,version')return {...defaults,...value,version:3,tab:'home'};
 if(value?.version===2&&Object.keys(value).sort().join(',')==='emoji,funnyCantonese,funnyEnglish,language,tab,theme,version')return {...value,version:3,tab:'home',displayName:'',accent:''};
 return value;
}

export function acquireStorage(root=globalThis){try{return root.localStorage;}catch{return null;}}
