import {passwordVerifier,verifyPassword,deriveCacheKey,seal,unseal} from './crypto.js';
export class LocalProfile {
 #key=null;#generation=0;#failures=0;#waitUntil=0;#level=0;
 constructor({store,onAuthenticatedChange=()=>{},now=Date.now}={}){this.store=store;this.onAuthenticatedChange=onAuthenticatedChange;this.now=now;}
 get authenticated(){return this.#key!==null;}
 logout(){this.#generation++;this.#key=null;this.onAuthenticatedChange(false);}
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
  this.#key=candidate;this.#failures=0;this.#level=0;this.onAuthenticatedChange(true);return true;
 }
 async encrypt(value,identity='personal-vocabulary'){if(!this.#key)throw Error('Unlock the local profile first.');return seal(value,this.#key,identity);}
 async decrypt(value,identity='personal-vocabulary'){if(!this.#key)throw Error('Unlock the local profile first.');return unseal(value,this.#key,identity);}
}
