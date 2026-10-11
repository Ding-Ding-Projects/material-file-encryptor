import {validateRule,ruleMatches} from '../../../shared/local-ux/schedules.js';
/** Motion presets use the existing local clock matcher, without provider access. */
export function validateMotionSchedules(rules,presets={}){
 if(!Array.isArray(rules))throw Error('Invalid motion schedules.');
 const ids=new Set();return rules.map(rule=>{if(!rule||typeof rule.enabled!=='boolean'||ids.has(rule.id))throw Error('Invalid motion schedule identity or enabled state.');ids.add(rule.id);if(rule.source?.type&&rule.source.type!=='local')throw Error('Motion schedules support local presets only; no provider request is made.');if(typeof rule.preset!=='string'||!Object.hasOwn(presets,rule.preset))throw Error('Choose an existing motion preset for this schedule.');for(const key of['startDate','endDate'])if(rule[key]){const date=new Date(rule[key]+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==rule[key])throw Error('Choose a real motion schedule calendar date.');}const {preset,...clockRule}=rule;return{...validateRule({...clockRule,values:{},source:{type:'local'}}),preset};});
}
export function resolveMotionSchedule(model,now=new Date()){
 const rules=validateMotionSchedules(model.unknown.schedules||[],model.unknown.presets||{});
 const active=[...rules].sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id)).filter(({preset,...clockRule})=>ruleMatches(clockRule,now)).at(-1);
 return active?structuredClone(model.unknown.presets[active.preset]):model;
}
export function newMotionSchedule(preset,id=crypto.randomUUID()){return{id,label:'Motion schedule',enabled:true,preset,start:'09:00',end:'17:00',startDate:'',endDate:'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',weekdays:[1,2,3,4,5],priority:0,values:{},source:{type:'local'}};}
