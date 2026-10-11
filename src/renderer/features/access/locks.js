import {passwordVerifier,verifyPassword,verifyTotp,randomId} from './crypto.js';
export const LOCK_POLICIES = Object.freeze({pin:['pin'],password:['password'],'pin-password':['pin','password'],'password-totp':['password','totp'],'pin-totp':['pin','totp'],'password-pin-totp':['password','pin','totp']});
// This controller is an opt-in local convenience lock, not an authorization boundary.
export class LockController {
  constructor({store,now=Date.now,onBlocked=()=>{},getDishChallenge}={}) { this.store=store;this.now=now;this.onBlocked=onBlocked;this.records=new Map();this.sessions=new Map();this.attempts=new Map();this.creating=new Set();this.waitLadder=new WaitLadder({now,getDishChallenge});this.waitTarget=null; }
  async load(ids=[]) { if(!this.store) return; for(const id of ids){const record=await this.store.get(`element-lock:${id}`);if(record)this.records.set(id,record);} }
  async set(id,policy,credentials,duration=0) {
    if(!id||!LOCK_POLICIES[policy])throw new Error('Select a valid lock policy.');
    if(this.creating.has(id)||this.records.has(id))throw new Error('This element already has a lock. Unlock and remove that lock before creating a replacement.');
    this.creating.add(id);
    try {
    if(this.store&&await this.store.get(`element-lock:${id}`))throw new Error('This element already has a lock. Unlock and remove that lock before creating a replacement.');
    const factors={};
    for(const factor of LOCK_POLICIES[policy]) {
      if(factor==='totp') {if(!credentials.totp || !await verifyTotp(credentials.totp,credentials.code,this.now()))throw new Error('Confirm the authenticator code first.');factors.totp=structuredClone(credentials.totp);}
      else {if(factor==='pin'&&!/^\d{4,12}$/.test(credentials.pin))throw new Error('Use a PIN of 4 to 12 digits.');factors[factor]=await passwordVerifier(credentials[factor]);}
    }
    const record={version:1,id,policy,factors,duration:Math.max(0,Math.min(Number(duration)||0,1440)),revision:randomId()};
    if(this.store)await this.store.set(`element-lock:${id}`,record);
    this.records.set(id,record);this.sessions.delete(id);return this.describe(id);
    } finally { this.creating.delete(id); }
  }
  describe(id) {const r=this.records.get(id);return r?{id,policy:r.policy,duration:r.duration,locked:this.isLocked(id)}:null;}
  list(){return [...this.records.keys()].map(id=>this.describe(id));}
  isLocked(id){if(!this.records.has(id))return false;const until=this.sessions.get(id);return until===undefined||until<=this.now();}
  lock(id){this.sessions.delete(id);}
  waiting(id){return Math.max(0,(this.attempts.get(id)?.until||0)-this.now());}
  challengeWait(id,{schoolMode=false}={}){
    if(!this.waiting(id))return null;
    const identity=`${id}:${this.attempts.get(id).until}`;
    if(this.waitTarget!==identity){this.waitLadder.pending=null;this.waitLadder.rung=schoolMode?'sums':'dish';this.waitLadder.wrongDishes=0;this.waitTarget=identity;}
    this.waitLadder.schoolMode=schoolMode;
    if(schoolMode&&this.waitLadder.rung==='dish'){this.waitLadder.pending=null;this.waitLadder.rung='sums';}
    return this.waitLadder.challenge();
  }
  answerWait(id,nonce,answer){
    const attempt=this.attempts.get(id);if(!attempt||!this.waiting(id)||this.waitTarget!==`${id}:${attempt.until}`)return false;
    if(!this.waitLadder.answer(nonce,answer))return false;
    // Only the deadline changes: no credential, failure count, escalation or session changes.
    attempt.until=this.now();return true;
  }
  async remove(id){if(this.store)await this.store.delete(`element-lock:${id}`);this.records.delete(id);this.sessions.delete(id);}
  async unlock(id,credentials) {
    const r=this.records.get(id);if(!r)return true;
    const a=this.attempts.get(id)||{failures:0,until:0,level:0};if(a.until>this.now())return false;
    let valid=true;
    for(const f of LOCK_POLICIES[r.policy])valid=(f==='totp'?await verifyTotp(r.factors.totp,credentials.totp,this.now()):await verifyPassword(credentials[f]||'',r.factors[f]))&&valid;
    if(!valid){a.failures++;if(a.failures>=5){a.level++;a.until=this.now()+Math.min(3600000,30000*2**(a.level-1));a.failures=0;}this.attempts.set(id,a);return false;}
    this.attempts.delete(id);this.sessions.set(id,r.duration?this.now()+r.duration*60000:Infinity);return true;
  }
  run(id,callback,...args){if(this.isLocked(id)){this.onBlocked(id);return false;}return callback(...args);}
  intercept(root,identity=element=>element.closest('[data-lock-id]')?.dataset.lockId){
    const handler=event=>{const id=identity(event.target);if(id&&this.isLocked(id)){event.preventDefault();event.stopImmediatePropagation();this.onBlocked(id,event.target);}};
    const events=['click','dblclick','pointerdown','keydown','input','change','submit','dragstart'];events.forEach(name=>root.addEventListener(name,handler,true));
    return ()=>events.forEach(name=>root.removeEventListener(name,handler,true));
  }
}
export class WaitLadder {
  constructor({now=Date.now,schoolMode=false,getDishChallenge}={}){this.now=now;this.schoolMode=schoolMode;this.getDishChallenge=getDishChallenge;this.skips=[];this.pending=null;this.rung=schoolMode?'sums':'dish';this.wrongDishes=0;}
  challenge(){
    this.skips=this.skips.filter(t=>t>this.now()-3600000);if(this.skips.length>=3||this.rung==='clock')return null;
    const nonce=randomId(),issued=this.now();let question,answer,dishUnavailable=false;
    if(this.rung==='dish'){
      let dish;try{dish=this.getDishChallenge?.();}catch{}
      // The host must obtain these factual labels from the reviewed public catalog.
      const valid=dish?.catalogSource==='https://github.com/Ding-Ding-Projects/dim-sum-photos'&&Array.isArray(dish.choices)&&dish.choices.length===4&&dish.choices.every(x=>typeof x==='string'&&x.length>0&&x.length<=120)&&typeof dish.prompt==='string'&&dish.prompt.length>0&&Number.isInteger(dish.answer)&&dish.answer>=0&&dish.answer<4;
      if(this.schoolMode||!valid){this.rung='sums';dishUnavailable=!this.schoolMode;}else{question={choices:[...dish.choices],prompt:dish.prompt};answer=dish.answer;}
    }
    if(this.rung==='sums'){question=Array.from({length:10},()=>{const a=crypto.getRandomValues(new Uint8Array(1))[0]%50,b=crypto.getRandomValues(new Uint8Array(1))[0]%50;return {a,b};});answer=question.map(x=>x.a+x.b);}
    else if(this.rung==='moles'){question=Array.from({length:12},(_,i)=>({cell:crypto.getRandomValues(new Uint8Array(1))[0]%9,start:i*700,end:i*700+600}));answer=null;}
    this.pending={nonce,issued,expires:issued+120000,rung:this.rung,answer,question};return {nonce,rung:this.rung,question,duration:this.rung==='moles'?8400:0,dishUnavailable};
  }
  answer(nonce,value){
    const p=this.pending;this.pending=null;if(!p||p.nonce!==nonce||this.now()>p.expires)return false;
    let correct=false;
    if(p.rung==='dish')correct=value===p.answer;
    else if(p.rung==='sums')correct=Array.isArray(value)&&value.length===10&&value.every((v,i)=>v===p.answer[i]);
    else if(this.now()-p.issued>=8400&&Array.isArray(value)) {const hits=new Set();for(const tap of value){const index=p.question.findIndex(m=>m.cell===tap.cell&&tap.time>=m.start&&tap.time<=m.end&&tap.time<=this.now()-p.issued);if(index>=0)hits.add(index);}correct=hits.size>=8;}
    if(correct){this.skips.push(this.now());return true;}
    if(p.rung==='dish'){if(++this.wrongDishes>=5)this.rung='sums';}else this.rung=p.rung==='sums'?'moles':'clock';return false;
  }
  // Callers may clear only a waiting deadline. This object never receives credentials or sessions.
}
