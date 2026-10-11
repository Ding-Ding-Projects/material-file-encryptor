import {safeRecord,DEFAULTS,validateSettings,effectiveSettings} from './store.js';
export const SCHEDULE_VERSION=2;
export const SCHEDULE_LIMITS=Object.freeze({rules:100,bytes:262144,externalBytes:32768});
export const SCHEDULE_FIELDS=Object.freeze(['language','theme','density','seed','fontFamily','fontScale','fontWeight','motion','displayName','emoji','funnyEnglish','funnyCantonese','narrator','attention','appearance','logo']);
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const reference=value=>object(value)&&Object.keys(value).length===2&&value.version===1&&typeof value.reference==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(value.reference);
function validDate(value){if(!DATE.test(value))return false;const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
export function validateSettingValues(values){
 safeRecord(values);
 if(!object(values)||bytes(values)>SCHEDULE_LIMITS.externalBytes)throw Error('Schedule settings must be a bounded object.');
 for(const[key,value]of Object.entries(values)){
  if(!SCHEDULE_FIELDS.includes(key))throw Error('Schedule contains unsupported settings.');
  if(key==='appearance'||key==='logo'){if(!reference(value))throw Error('Appearance and logo schedules require a versioned local snapshot reference.');continue;}
  if(key==='narrator'||key==='attention'){
   if(!object(value)||!Object.keys(value).length||Object.keys(value).some(field=>!Object.hasOwn(DEFAULTS[key],field)))throw Error('Unsupported nested schedule setting.');
   const validated=validateSettings({...DEFAULTS,[key]:{...DEFAULTS[key],...value}})[key];
   for(const[field,item]of Object.entries(value))if(typeof item!==typeof DEFAULTS[key][field]||validated[field]!==item||typeof item==='string'&&/[\x00-\x1f\x7f]/.test(item))throw Error('A scheduled value is outside the supported setting range.');
  }else{const validated=validateSettings({...DEFAULTS,[key]:value});if(typeof value!==typeof DEFAULTS[key]||validated[key]!==value||typeof value==='string'&&/[\x00-\x1f\x7f]/.test(value))throw Error('A scheduled value is outside the supported setting range.');}
 }
 return structuredClone(values);
}
export function validateRule(rule){
 safeRecord(rule);
 if(!object(rule)||![undefined,1,2].includes(rule.version)||Object.keys(rule).some(k=>!['version','id','label','enabled','start','end','startDate','endDate','timezone','weekdays','priority','values','source'].includes(k)))throw Error('Unsupported schedule rule schema.');
 if(typeof rule.id!=='string'||!rule.id||rule.id.length>80||typeof rule.label!=='string'||rule.label.length>120||/[\x00-\x1f\x7f]/.test(rule.id+rule.label)||typeof rule.enabled!=='boolean')throw Error('A schedule needs a bounded id, label and enabled state.');
 if(!TIME.test(rule.start)||!TIME.test(rule.end))throw Error('Choose complete start and end times.');
 for(const k of ['startDate','endDate'])if(rule[k]!==undefined&&rule[k]!==''&&!validDate(rule[k]))throw Error('Choose a valid date.');
 if(rule.startDate&&rule.endDate&&rule.startDate>rule.endDate)throw Error('End date must follow start date.');
 if(!Array.isArray(rule.weekdays)||!rule.weekdays.length||rule.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(rule.weekdays).size!==rule.weekdays.length)throw Error('Select at least one distinct weekday.');
 if(typeof rule.timezone!=='string'||!rule.timezone||rule.timezone.length>120)throw Error('Choose a valid timezone.');
 try{new Intl.DateTimeFormat('en',{timeZone:rule.timezone}).format();}catch{throw Error('Choose a valid timezone.');}
 const values=validateSettingValues(rule.values);
 if(!Number.isInteger(rule.priority)||Math.abs(rule.priority)>1000)throw Error('Priority must be between -1000 and 1000.');
 if(rule.source){if(!object(rule.source)||!['local','api','home-assistant'].includes(rule.source.type)||Object.keys(rule.source).some(k=>!['type','url','entity','entityId','id'].includes(k)))throw Error('Unknown or unsafe schedule source.');for(const [k,v]of Object.entries(rule.source))if(typeof v!=='string'||v.length>(k==='url'?2048:160))throw Error('Unbounded schedule source.');if(rule.source.url){let url;try{url=new URL(rule.source.url);}catch{throw Error('Invalid schedule source URL.');}if(url.username||url.password||url.hash||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Schedule sources require credential-free HTTPS or loopback development transport.');}}
 return {...structuredClone(rule),version:SCHEDULE_VERSION,values};
}
export function validateScheduleRules(rules){if(!Array.isArray(rules)||rules.length>SCHEDULE_LIMITS.rules||bytes(rules)>SCHEDULE_LIMITS.bytes)throw Error('Schedule list exceeds its limits.');const validated=rules.map(validateRule);if(new Set(validated.map(r=>r.id)).size!==validated.length)throw Error('Schedule identifiers must be distinct.');return validated;}
export function clockParts(now,timezone){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));const date=`${parts.year}-${parts.month}-${parts.day}`;return{date,minutes:Number(parts.hour)*60+Number(parts.minute),weekday:new Date(`${date}T12:00:00Z`).getUTCDay()};}
const minutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
export function ruleMatches(rule,now=new Date()){validateRule(rule);if(!rule.enabled)return false;let p=clockParts(now,rule.timezone);const start=minutes(rule.start),end=minutes(rule.end);if(start>end&&p.minutes<end){const previous=new Date(`${p.date}T12:00:00Z`);previous.setUTCDate(previous.getUTCDate()-1);p={...p,date:previous.toISOString().slice(0,10),weekday:previous.getUTCDay()};}if(rule.startDate&&p.date<rule.startDate||rule.endDate&&p.date>rule.endDate||!rule.weekdays.includes(p.weekday))return false;return start===end||start<end&&p.minutes>=start&&p.minutes<end||start>end&&(p.minutes>=start||p.minutes<end);}
function mergeValues(target,values){for(const[key,value]of Object.entries(values)){target[key]=['narrator','attention'].includes(key)?{...target[key],...value}:structuredClone(value);}return target;}
export function resolveSchedules(rules,now=new Date(),external=new Map()){const result={};for(const rule of validateScheduleRules(rules).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id))){if(!ruleMatches(rule,now))continue;const type=rule.source?.type||'local';if(type==='local')mergeValues(result,rule.values);else{const data=external.get(rule.id);if(type==='home-assistant'){if(data===true)mergeValues(result,rule.values);}else if(data)mergeValues(result,validateSettingValues(data));}}return result;}
export function validateExternalResponse(value){safeRecord(value);if(!object(value)||![1,2].includes(value.version)||Object.keys(value).some(k=>!['version','settings','checkedAt','provenance'].includes(k))||bytes(value)>SCHEDULE_LIMITS.externalBytes)throw Error('Expected a bounded versioned settings response.');return validateSettingValues(value.settings);}
export function createExternalScheduleResolver({fetchSource,onError=()=>{}}={}){let generation=0;const values=new Map();return{values,async refresh(rules){const validated=validateScheduleRules(rules),current=++generation;const ids=new Set(validated.filter(r=>r.enabled&&r.source?.type!=='local'&&r.source?.type).map(r=>r.id));for(const id of values.keys())if(!ids.has(id))values.delete(id);await Promise.all(validated.filter(r=>ids.has(r.id)).map(async rule=>{try{if(!fetchSource)throw Error('A privileged external-settings adapter is not available.');const response=await fetchSource(structuredClone(rule.source),{id:rule.id,timeout:5000,maxBytes:32768,redirect:'error'});if(current!==generation)return;if(rule.source.type==='home-assistant'){if(!['on','off'].includes(response?.state))throw Error('Home Assistant did not return on or off.');values.set(rule.id,response.state==='on');}else values.set(rule.id,validateExternalResponse(response));}catch(error){if(current===generation){values.delete(rule.id);onError(error,rule);}}}));},cancel(){generation++;values.clear();}};}
export function resolveScheduledSettings(base,overrides={}){const settings={...base};for(const[key,value]of Object.entries(overrides))if(!['appearance','logo'].includes(key))settings[key]=['narrator','attention'].includes(key)?{...base[key],...value}:value;return effectiveSettings(base,settings);}

// The host supplies transient consumers. No saved base, credential or history is overwritten.
export function createScheduledCustomizationController({getBaseSettings,applySettings,appearance,logo,onError=()=>{}}={}){
 let disposed=false,queue=Promise.resolve();
 const active={appearance:false,logo:false};
 async function apply(overrides){const report={};const base=getBaseSettings();await applySettings(resolveScheduledSettings(base,overrides));report.settings='applied';for(const[key,adapter]of [['appearance',appearance],['logo',logo]]){let attempted=false;try{if(overrides[key]){if(!adapter?.resolve||!adapter?.applyTransient||!adapter?.clearTransient)throw Error('Scheduled '+key+' consumer unavailable.');const snapshot=await adapter.resolve(overrides[key].reference);if(snapshot===undefined)throw Error('Local scheduled '+key+' snapshot unavailable.');attempted=true;if(await adapter.applyTransient(snapshot)===false)throw Error('Scheduled '+key+' application rejected.');active[key]=true;report[key]='applied';}else if(active[key]){if(await adapter.clearTransient()===false)throw Error('Scheduled '+key+' restoration rejected.');active[key]=false;report[key]='restored';}else report[key]='base';}catch(error){report[key]='failed';if(active[key]||attempted){try{if(await adapter.clearTransient()===false)throw Error('Scheduled '+key+' restoration rejected.');active[key]=false;}catch{report[key]='restore-failed';}}onError(error,key);}}return report;}
 return {update(overrides={}){if(disposed)return Promise.reject(Error('Scheduled customization controller disposed.'));const validated=Object.keys(overrides).length?validateSettingValues(overrides):{};const operation=queue.then(()=>disposed?{cancelled:true}:apply(validated));queue=operation.catch(()=>{});return operation;},async dispose(){disposed=true;await queue;return apply({});}};
}
