import {waitingAnswer} from '../renderer/features/access/wait-answer.js';
import {randomUUID} from 'node:crypto';
import {WaitLadder,LOCK_POLICIES} from '../renderer/features/access/locks.js';
import {verifyPassword,verifyTotp} from '../renderer/features/access/crypto.js';

const STATE_KEY='lock:access-attempts:v1',BUDGET_KEY='lock:access-budget:v1';
const boundedTarget=value=>typeof value==='string'&&(['profile','history'].includes(value)||/^element:[^\x00-\x1f\x7f]{1,256}$/.test(value));
export function createAccessChallenges({credentials,getActor,getSchoolMode=async()=>false,getDishChallenge,now=Date.now}={}){
 let chain=Promise.resolve(),closed=false;const epochs=new Map(),ladders=new Map();
 const actor=()=>{const value=getActor?.();if(typeof value!=='string'||!value||value.length>160)throw Error('Trusted access actor is unavailable.');return value;};
 const target=value=>{if(!boundedTarget(value))throw Error('Invalid access target.');return value;};
 const identity=(who,id)=>JSON.stringify([who,id]),generation=key=>epochs.get(key)||0;
 const checkOpen=()=>{if(closed)throw Error('Local access service is closed.');};
 const serial=fn=>{const pending=chain.catch(()=>{}).then(()=>{checkOpen();return fn();});chain=pending;return pending;};
 const state=async()=>{const value=await credentials.get(STATE_KEY)||{version:1,targets:{}};if(value.version!==1||!value.targets||Array.isArray(value.targets)||Object.keys(value.targets).length>1000)throw Error('Access waiting state is invalid.');return value;};
 const attempts=(value,id)=>{const record=value.targets[id]||{failures:0,level:0,until:0};if(!Number.isSafeInteger(record.failures)||record.failures<0||record.failures>5||!Number.isSafeInteger(record.level)||record.level<0||record.level>100000||!Number.isSafeInteger(record.until)||record.until<0)throw Error('Access waiting state is invalid.');return record;};
 const budget=async()=>{const value=await credentials.get(BUDGET_KEY)||{version:1,uses:[]};if(value.version!==1||!Array.isArray(value.uses)||value.uses.length>3||value.uses.some(at=>!Number.isSafeInteger(at)||at<0))throw Error('Access waiting budget is invalid.');return {version:1,uses:value.uses.filter(at=>at>now()-3600000)};};
 const snapshot=(a,ok=false)=>({ok,failures:a.failures,level:a.level,until:a.until});
 return {
  request(action,payload={}){
   checkOpen();const who=actor(),id=target(payload.target),key=identity(who,id);
   if(action==='waitCancel'){epochs.set(key,generation(key)+1);ladders.delete(key);return Promise.resolve(true);}
   const epoch=generation(key);const current=()=>{checkOpen();if(actor()!==who||generation(key)!==epoch)throw Error('Local access operation was cancelled.');};
   return serial(async()=>{
    current();const saved=await state(),a=attempts(saved,id);current();
    if(action==='waitStatus')return snapshot(a);
    if(action==='localVerify'){
     if(Object.keys(saved.targets).length>=1000&&!Object.hasOwn(saved.targets,id))throw Error('Too many protected access targets.');
     const supplied=payload.credentials;if(!supplied||typeof supplied!=='object'||Array.isArray(supplied)||Object.keys(supplied).some(k=>!['password','pin','totp'].includes(k))||Object.values(supplied).some(v=>typeof v!=='string'||v.length>4096))throw Error('Invalid access credentials.');
     if(a.until>now())return snapshot(a);
     const record=await credentials.get(id==='profile'?'local-profile:v1':id==='history'?'lock:access-history:v1':'element-lock:'+id.slice(8));current();let valid=false;
     if(id==='profile'||id==='history')valid=!!record&&await verifyPassword(supplied.password||'',id==='history'?record.verifier:record);
     else if(record&&LOCK_POLICIES[record.policy]){valid=true;for(const factor of LOCK_POLICIES[record.policy]){valid=(factor==='totp'?await verifyTotp(record.factors.totp,supplied.totp||'',now()):await verifyPassword(supplied[factor]||'',record.factors[factor]))&&valid;current();}}
     current();if(valid){delete saved.targets[id];ladders.delete(key);await credentials.set(STATE_KEY,saved);current();return snapshot({failures:0,level:0,until:0},true);}
     if(++a.failures>=5){a.level++;a.until=now()+Math.min(3600000,30000*2**Math.min(a.level-1,20));a.failures=0;}saved.targets[id]=a;await credentials.set(STATE_KEY,saved);current();return snapshot(a);
    }
    if(a.until<=now())return action==='waitAnswer'?{won:false,...snapshot(a)}:null;
    const limits=await budget();current();if(limits.uses.length>=3)return action==='waitAnswer'?{won:false,...snapshot(a)}:null;
    let session=ladders.get(key);const schoolMode=await getSchoolMode();current();
    if(!session||session.until!==a.until){session={until:a.until,ladder:new WaitLadder({now,schoolMode:schoolMode===true,getDishChallenge})};ladders.set(key,session);}
    if(schoolMode===true&&session.ladder.rung==='dish'){session.ladder.rung='sums';session.ladder.pending=null;}session.ladder.schoolMode=schoolMode===true;
    if(action==='waitChallenge'){const challenge=session.ladder.challenge();return challenge?{...challenge,expires:now()+120000,until:a.until}:null;}
    if(action==='waitAnswer'){
     if(typeof payload.nonce!=='string'||payload.nonce.length>80)throw Error('Invalid waiting challenge.');
     const answer=payload.answer;if(!waitingAnswer(answer))throw Error('Invalid waiting answer.');
     const won=session.ladder.answer(payload.nonce,answer);current();if(!won)return {won:false,...snapshot(a)};
     limits.uses.push(now());await credentials.set(BUDGET_KEY,limits);current();
     a.until=now();saved.targets[id]=a;await credentials.set(STATE_KEY,saved);current();ladders.delete(key);return {won:true,...snapshot(a)};
    }
    throw Error('Unsupported local access action.');
   });
  },
  close(){closed=true;ladders.clear();epochs.clear();},
 };
}
