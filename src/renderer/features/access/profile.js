import {passwordVerifier,verifyPassword,deriveCacheKey,seal,unseal} from './crypto.js';
import {WaitLadder} from './locks.js';
export class LocalProfile {
 #key=null;#generation=0;#failures=0;#waitUntil=0;#level=0;
 constructor({store,onAuthenticatedChange=()=>{},now=Date.now,waitBudget,getDishChallenge}={}){this.store=store;this.onAuthenticatedChange=onAuthenticatedChange;this.now=now;this.waitLadder=new WaitLadder({now,budget:waitBudget,getDishChallenge});this.waitIdentity=null;}
 get authenticated(){return this.#key!==null;}
 get waitState(){return {failures:this.#failures,level:this.#level,until:this.#waitUntil};}
 waiting(){return Math.max(0,this.#waitUntil-this.now());}
 cancelWait(){this.#generation++;this.waitLadder.pending=null;}
 logout(){this.#generation++;this.#key=null;this.waitLadder.pending=null;this.onAuthenticatedChange(false);}
 async challengeWait(_id,{schoolMode=false}={}){
  if(!this.waiting())return null;const generation=this.#generation,deadline=this.#waitUntil;
  if(this.waitIdentity!==deadline){this.waitIdentity=deadline;this.waitLadder.pending=null;this.waitLadder.rung=schoolMode?'sums':'dish';this.waitLadder.wrongDishes=0;}
  this.waitLadder.schoolMode=schoolMode;if(schoolMode&&this.waitLadder.rung==='dish')this.waitLadder.rung='sums';
  const challenge=await this.waitLadder.challengeAsync();if(generation!==this.#generation||deadline!==this.#waitUntil){this.waitLadder.pending=null;return null;}return challenge;
 }
 async answerWait(_id,nonce,answer){
  if(!this.waiting())return false;const generation=this.#generation,deadline=this.#waitUntil;
  if(!await this.waitLadder.answerAsync(nonce,answer))return false;
  if(generation!==this.#generation||deadline!==this.#waitUntil)return false;
  this.#waitUntil=this.now();return true;
 }
 async unlock(password,{create=false}={}){
  const generation=++this.#generation;
  const current=()=>{if(generation!==this.#generation)throw Error('Profile unlock was cancelled.');};
  if(this.now()<this.#waitUntil)throw Error('Wait before trying another profile password.');
  if(!this.store)throw Error('The local credential vault is unavailable.');
  let record=await this.store.get('local-profile:v1');current();
  if(create){if(record)throw Error('A local profile already exists. Unlock it instead.');record=await passwordVerifier(password);current();await this.store.set('local-profile:v1',record);current();}
  const valid=record&&await verifyPassword(password,record);current();
  if(!valid){if(++this.#failures>=5){this.#level++;this.#waitUntil=this.now()+Math.min(3600000,30000*2**(this.#level-1));this.#failures=0;}throw Error('The password did not match.');}
  const candidate=await deriveCacheKey(password,record.salt);current();
  this.#key=candidate;this.#failures=0;this.#level=0;this.#waitUntil=0;this.waitLadder.pending=null;this.onAuthenticatedChange(true);return true;
 }
 async encrypt(value,identity='personal-vocabulary'){if(!this.#key)throw Error('Unlock the local profile first.');const generation=this.#generation,result=await seal(value,this.#key,identity);if(generation!==this.#generation)throw Error('Profile operation was cancelled.');return result;}
 async decrypt(value,identity='personal-vocabulary'){if(!this.#key)throw Error('Unlock the local profile first.');const generation=this.#generation,result=await unseal(value,this.#key,identity);if(generation!==this.#generation)throw Error('Profile operation was cancelled.');return result;}
}
