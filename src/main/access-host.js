import {waitingAnswer} from '../renderer/features/access/wait-answer.js';
import {createAccessChallenges} from './access-challenges.js';
import {createAccessHistory} from './access-history.js';
export const ACCESS_HOST_ACTIONS=Object.freeze(['displayNameSet','displayNameRead','localVerify','waitChallenge','waitStatus','waitAnswer','waitCancel','historySetup','historyUnlock','historyLock','historyStatus','historyList','historyExport','historyDiff','historyRestore','historyLabel','historyRetention','historyPrune']);
const text=(limit,optional=false)=>value=>optional&&value===undefined||typeof value==='string'&&value.length<=limit;
const id=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const target=value=>typeof value==='string'&&(['profile','history'].includes(value)||/^element:[^\x00-\x1f\x7f]{1,256}$/.test(value));
const credentials=value=>value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).every(key=>['password','pin','totp'].includes(key))&&Object.values(value).every(text(4096));
const answer=waitingAnswer;
export function validateAccessHostRequest(action,payload){
 const schemas={displayNameSet:{value:text(160)},displayNameRead:{},localVerify:{target,credentials},waitChallenge:{target},waitStatus:{target},waitAnswer:{target,nonce:text(80),answer},waitCancel:{target},historySetup:{password:text(4096)},historyUnlock:{password:text(4096)},historyLock:{},historyStatus:{},historyList:{query:text(512,true),from:text(40,true),to:text(40,true),action:text(80,true)},historyExport:{},historyDiff:{first:id,second:id},historyRestore:{id},historyLabel:{id,label:text(160)},historyRetention:{days:value=>Number.isInteger(value)&&value>=1&&value<=3650},historyPrune:{}};
 const schema=schemas[action];if(!schema||!payload||Object.getPrototypeOf(payload)!==Object.prototype||Reflect.ownKeys(payload).some(key=>typeof key!=='string'||!Object.hasOwn(schema,key))||Object.entries(schema).some(([key,valid])=>!valid(payload[key])))throw Error('Unsupported access host payload.');return payload;
}
export function createAccessHost(options){
 const challenges=createAccessChallenges(options),history=createAccessHistory({...options,verifyHistory:password=>challenges.request('localVerify',{target:'history',credentials:{password}})});let closed=false;
 return {request(action,payload={}){if(closed)throw Error('Local access service is closed.');validateAccessHostRequest(action,payload);if(action==='historyStatus')return Promise.all([history.request(action,payload),challenges.request('waitStatus',{target:'history'})]).then(([state,waiting])=>({...state,until:waiting.until}));return action.startsWith('history')||action.startsWith('displayName')?history.request(action,payload):challenges.request(action,payload);},setCredential(key,value){if(closed)throw Error('Local access service is closed.');return history.setCredential(key,value);},deleteCredential(key){if(closed)throw Error('Local access service is closed.');return history.deleteCredential(key);},close(){closed=true;challenges.close();history.close();}};
}
