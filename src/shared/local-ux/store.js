export const SETTINGS_KEY = 'material-file-encryptor.local-ux.v1';
export const DEFAULTS = Object.freeze({version:1,language:'en',funnyEnglish:5,funnyCantonese:5,emoji:false,theme:'system',density:'comfortable',seed:'#52643f',fontFamily:'system-ui',fontScale:1,fontWeight:400,motion:'system',displayName:'Material File Encryptor',school:{enabled:false,name:'School mode'},narrator:{enabled:false,language:'en',englishVoice:'',cantoneseVoice:'',rate:1,pitch:1},attention:{focus:false,lowStimulation:false,timeAwareness:false,oneThing:false,momentum:false,nextAction:'',snoozedUntil:0},schedules:[]});
const clone = value => structuredClone(value);
const forbidden = new Set(['__proto__','constructor','prototype']);
export function safeRecord(value, depth=0) {
 if(depth>12) throw new Error('Settings exceed the nesting limit.');
 if(value && typeof value==='object') for(const key of Object.keys(value)){if(forbidden.has(key)) throw new Error('Unsafe settings key.'); safeRecord(value[key],depth+1);}
 return value;
}
export function validateSettings(source) {
 safeRecord(source);
 if(!source || source.version!==1) throw new Error('Unsupported settings version.');
 const result=clone(DEFAULTS);
 const enums={language:['en','yue','bilingual'],theme:['system','light','dark'],density:['compact','comfortable','spacious'],motion:['system','full','reduced']};
 for(const [key,values] of Object.entries(enums)) if(values.includes(source[key])) result[key]=source[key];
 for(const [key,min,max] of [['funnyEnglish',1,5],['funnyCantonese',1,5],['fontScale',.75,2],['fontWeight',100,900]]) if(Number.isFinite(source[key])&&source[key]>=min&&source[key]<=max) result[key]=source[key];
 if(typeof source.emoji==='boolean') result.emoji=source.emoji;
 for(const key of ['seed','fontFamily','displayName']) if(typeof source[key]==='string'&&source[key].length<=160&&!/[\x00-\x1f]/.test(source[key])) result[key]=source[key];
 if(!/^#[\da-f]{6}$/i.test(result.seed)) result.seed=DEFAULTS.seed;
 if(source.school){result.school.enabled=source.school.enabled===true;if(typeof source.school.name==='string'&&source.school.name.trim()&&source.school.name.length<=80)result.school.name=source.school.name.trim();}
 if(source.narrator){const n=source.narrator;result.narrator.enabled=n.enabled===true;if(['en','yue','both'].includes(n.language))result.narrator.language=n.language;for(const k of ['englishVoice','cantoneseVoice'])if(typeof n[k]==='string'&&n[k].length<=500)result.narrator[k]=n[k];for(const k of ['rate','pitch'])if(Number.isFinite(n[k]))result.narrator[k]=Math.max(k==='rate'?.1:0,Math.min(k==='rate'?3:2,n[k]));}
 if(source.attention){for(const k of ['focus','lowStimulation','timeAwareness','oneThing','momentum'])result.attention[k]=source.attention[k]===true;if(typeof source.attention.nextAction==='string')result.attention.nextAction=source.attention.nextAction.slice(0,500);if(Number.isFinite(source.attention.snoozedUntil))result.attention.snoozedUntil=source.attention.snoozedUntil;}
 if(Array.isArray(source.schedules)&&source.schedules.length<=100)result.schedules=clone(source.schedules);
 return result;
}
export function createSettingsStore({storage=globalThis.localStorage,key=SETTINGS_KEY,onError=()=>{},history=()=>{}}={}) {
 let state=clone(DEFAULTS),provenance='default';const listeners=new Set();
 try{const raw=storage?.getItem(key);if(raw){if(raw.length>262144)throw Error('Settings are too large.');state=validateSettings(JSON.parse(raw));provenance='saved';}}catch(error){onError(error);}
 const emit=()=>{for(const fn of listeners)fn(clone(state));};
 return {get:()=>clone(state),get provenance(){return provenance;},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},update(patch,action='settings changed'){const next=validateSettings({...state,...patch});try{storage?.setItem(key,JSON.stringify(next));}catch(error){onError(error);throw error;}const before=state;state=next;provenance='saved';history({action,before:clone(before),after:clone(next),at:new Date().toISOString()});emit();return clone(state);},refresh(){try{const raw=storage?.getItem(key);state=raw?validateSettings(JSON.parse(raw)):clone(DEFAULTS);emit();}catch(error){onError(error);}},reset(){return this.update(clone(DEFAULTS),'settings reset');},export(){return JSON.stringify({version:1,settings:state,omitted:['Personal vocabulary and custom image data','Credentials and authenticator secrets']},null,2);}};
}
export function effectiveSettings(base, overrides={}) {const value=validateSettings({...base,...overrides});if(value.school.enabled){value.language='en';value.funnyEnglish=1;value.funnyCantonese=1;value.emoji=false;value.narrator.language='en';}return value;}
