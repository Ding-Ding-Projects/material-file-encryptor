import {randomInt,timingSafeEqual} from 'node:crypto';

// No 0, O, 1, I or L: nothing here can be misread across a desk or a camera.
export const PAIRING_ALPHABET='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PAIRING_CODE_LENGTH=8;
export const PAIRING_LIFETIME_MS=120000;
export const PAIRING_MAX_WRONG=5;
const wellFormed=value=>typeof value==='string'&&value.length===PAIRING_CODE_LENGTH&&[...value].every(character=>PAIRING_ALPHABET.includes(character));

/**
 * One active, single-use pairing code held only in memory. It is an extra
 * proof shown on the unlocked desktop; the native approval prompt still decides.
 */
export function createPairingCodes({now=Date.now,random=randomInt}={}){
 let active=null;
 const clear=()=>{if(active)active.bytes.fill(0);active=null;};
 const expired=()=>active!==null&&active.expires<=now();
 // Always compares two buffers of the same length, whatever was supplied.
 const matches=candidate=>{
  const ok=wellFormed(candidate);
  const probe=ok?Buffer.from(candidate,'ascii'):Buffer.alloc(PAIRING_CODE_LENGTH);
  return timingSafeEqual(probe,active.bytes)&&ok;
 };
 return{
  issue(){
   clear();let code='';
   for(let index=0;index<PAIRING_CODE_LENGTH;index++)code+=PAIRING_ALPHABET[random(PAIRING_ALPHABET.length)];
   active={bytes:Buffer.from(code,'ascii'),expires:now()+PAIRING_LIFETIME_MS,wrong:0};
   return{code,expiresAt:active.expires,expiresInSeconds:PAIRING_LIFETIME_MS/1000};
  },
  /** Checks a supplied code. Wrong attempts are counted and the fifth clears the code. */
  verify(candidate){
   if(!active)return false;
   if(expired()){clear();return false;}
   if(matches(candidate))return true;
   active.wrong++;if(active.wrong>=PAIRING_MAX_WRONG)clear();return false;
  },
  /** Spends the code after native approval. A code that changed in the meantime is refused. */
  consume(candidate){
   if(!active)return false;
   if(expired()){clear();return false;}
   if(!matches(candidate))return false;
   clear();return true;
  },
  clear,
  status(){if(expired())clear();return active?{active:true,expiresAt:active.expires}:{active:false};},
 };
}
