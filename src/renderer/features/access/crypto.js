const utf8 = new TextEncoder();
const bytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const base64 = value => {const input=new Uint8Array(value);let binary='';for(let start=0;start<input.length;start+=8192)binary+=String.fromCharCode(...input.subarray(start,start+8192));return btoa(binary);};
export const randomId = () => crypto.randomUUID();
export async function passwordVerifier(value, iterations = 310000) {
  if (typeof value !== 'string' || !value.length) throw new Error('A credential is required.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', utf8.encode(value), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256);
  return {version:1,iterations,salt:base64(salt),hash:base64(hash)};
}
export async function verifyPassword(value, record) {
  if (!record || record.version !== 1 || record.iterations < 100000 || record.iterations > 2000000) return false;
  try {
    const key = await crypto.subtle.importKey('raw',utf8.encode(value),'PBKDF2',false,['deriveBits']);
    const actual = new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes(record.salt),iterations:record.iterations},key,256));
    const expected = bytes(record.hash); let difference = actual.length ^ expected.length;
    for (let i=0;i<actual.length;i++) difference |= actual[i] ^ expected[i];
    return difference === 0;
  } catch { return false; }
}
export async function createSessionKey() { return crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']); }
export async function deriveCacheKey(password,salt) {
  const material=await crypto.subtle.importKey('raw',utf8.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations:310000},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function seal(value,key,identity) {
  const plain=utf8.encode(JSON.stringify(value));if(plain.byteLength>1048576)throw new Error('Protected record exceeds the 1 MiB limit.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8.encode(identity)},key,plain);
  return {version:1,iv:base64(iv),ciphertext:base64(ciphertext)};
}
export async function unseal(record,key,identity) {
  if (record?.version !== 1) throw new Error('Unsupported protected record.');
  if(typeof record.ciphertext!=='string'||record.ciphertext.length>22369624||typeof record.iv!=='string'||record.iv.length!==16)throw new Error('Protected record exceeds its limits.');
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(record.iv),additionalData:utf8.encode(identity)},key,bytes(record.ciphertext));
  return JSON.parse(new TextDecoder().decode(plain));
}
export function decodeBase32(value) {
  const clean = value.toUpperCase().replace(/[\s=-]/g,'');
  if (!clean || !/^[A-Z2-7]+$/.test(clean)) throw new Error('Invalid base32 secret.');
  let buffer=0,bits=0; const out=[];
  for (const c of clean) { buffer=(buffer<<5)|'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);bits+=5;if(bits>=8){bits-=8;out.push((buffer>>bits)&255);} }
  return new Uint8Array(out);
}
export function parseOtpUri(value) {
  const uri = new URL(value);
  if(uri.protocol!=='otpauth:' || uri.hostname!=='totp') throw new Error('Only TOTP registration is supported.');
  const label=decodeURIComponent(uri.pathname.slice(1)); const p=uri.searchParams;
  const result={secret:p.get('secret')||'',issuer:p.get('issuer')||label.split(':')[0]||'',account:label.includes(':')?label.slice(label.indexOf(':')+1):label,algorithm:(p.get('algorithm')||'SHA1').replace('-','').toUpperCase(),digits:Number(p.get('digits')||6),period:Number(p.get('period')||30)};
  validateOtp(result); return result;
}
export function validateOtp(entry) {
  decodeBase32(entry.secret);
  if(!['SHA1','SHA256','SHA512'].includes(entry.algorithm)||![6,7,8].includes(entry.digits)||!Number.isSafeInteger(entry.period)||entry.period<1||entry.period>86400) throw new Error('Invalid TOTP parameters.');
}
export async function totp(entry,time=Date.now()) {
  validateOtp(entry); let counter=BigInt(Math.floor(time/1000/entry.period)); const data=new Uint8Array(8);
  for(let i=7;i>=0;i--){data[i]=Number(counter&255n);counter>>=8n;}
  const key=await crypto.subtle.importKey('raw',decodeBase32(entry.secret),{name:'HMAC',hash:entry.algorithm.replace('SHA','SHA-')},false,['sign']);
  const hash=new Uint8Array(await crypto.subtle.sign('HMAC',key,data)); const offset=hash[hash.length-1]&15;
  const number=((hash[offset]&127)*16777216)+(hash[offset+1]<<16)+(hash[offset+2]<<8)+hash[offset+3];
  return String(number%10**entry.digits).padStart(entry.digits,'0');
}
export async function verifyTotp(entry,code,time=Date.now()) {
  if(!new RegExp(`^\\d{${entry.digits}}$`).test(String(code))) return false;
  for(const skew of [-1,0,1]) if(time+skew*entry.period*1000>=0 && await totp(entry,time+skew*entry.period*1000)===String(code)) return true;
  return false;
}
