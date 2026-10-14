import {randomBytes,timingSafeEqual} from 'node:crypto';

const exact=(value,keys)=>value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const secret=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const same=(a,b)=>secret(a)&&secret(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const PROFILE='local-profile',OPERATION='read-profile-summary',TARGET='profile-summary';
const TYPES=new Set(['protected-discover','protected-authenticate','protected-execute','protected-revoke']);

/** Native-only adapter contract. Authentication must perform fresh explicit local
 * authentication and consent, never infer authority from pairing or a snapshot.
 * authenticateProfile({origin, profileId, operation, target, signal}) returns
 * {profileId, revision, expiresAt, authority}. authority is an opaque host object.
 * validateAuthority({authority, profileId, revision, signal}) rechecks the live
 * native actor, credential revision and cancellation generation. readProfileSummary
 * receives that same context and returns only the exact safe summary below.
 * No native authority, revision or credential is serialized to the browser.
 */
export function createBrowserProtectedMediation({allowedOrigins,getPair,isUnlocked,authenticateProfile,validateAuthority,readProfileSummary,now=Date.now,timeoutMs=30000}={}){
 if(!Array.isArray(allowedOrigins)||!allowedOrigins.length||allowedOrigins.some(value=>typeof value!=='string'||!/^chrome-extension:\/\/[a-p]{32}\/$/.test(value))||typeof getPair!=='function'||typeof isUnlocked!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<25||timeoutMs>30000)throw Error('Protected browser mediation is unavailable.');
 const installed=[authenticateProfile,validateAuthority,readProfileSummary].every(value=>typeof value==='function');
 const origins=new Set(allowedOrigins),grants=new Map(),controllers=new Set();let generation=0,closed=false,busy=false;
 const revoke=()=>{generation++;grants.clear();for(const controller of controllers)controller.abort();};
 const bound=(origin,session)=>{if(closed||!origins.has(origin)||isUnlocked()!==true)throw Error('Protected browser access unavailable.');const pair=getPair(origin);if(!pair||pair.expires<=now()||!same(session,pair.session))throw Error('Pair the browser again.');return pair;};
 const current=(origin,session,pair,epoch,signal)=>{if(signal?.aborted||generation!==epoch||bound(origin,session)!==pair)throw Error('Protected browser operation cancelled.');};
 const scope=message=>{if(message.profileId!==PROFILE||message.operation!==OPERATION||message.target!==TARGET)throw Error('Unsupported protected browser scope.');};
 async function run(origin,message,task){
  if(busy)throw Error('Resolve the current protected browser request first.');
  const pair=bound(origin,message.session),epoch=generation,controller=new AbortController();busy=true;controllers.add(controller);
  let timer,abort;const cancelled=new Promise((_,reject)=>{abort=()=>reject(Error('Protected browser operation cancelled.'));controller.signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>controller.abort(),timeoutMs);});
  const check=()=>current(origin,message.session,pair,epoch,controller.signal);
  try{return await Promise.race([task({pair,signal:controller.signal,check}),cancelled]);}
  finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);controller.abort();controllers.delete(controller);busy=false;}
 }
 return{
  supports:type=>TYPES.has(type),
  async receive(origin,message){
   if(!origins.has(origin))throw Error('Protected browser caller is not allowed.');
   let encoded;try{encoded=JSON.stringify(message);}catch{throw Error('Invalid protected browser message.');}
   if(typeof encoded!=='string'||Buffer.byteLength(encoded)>65536)throw Error('Native message exceeds 64 KiB.');
   if(!exact(message,['type','session'])&&!(message?.type==='protected-authenticate'&&exact(message,['type','session','profileId','operation','target']))&&!(message?.type==='protected-execute'&&exact(message,['type','session','profileId','operation','target','grant'])))throw Error('Unsupported protected browser message.');
   if(!TYPES.has(message.type))throw Error('Unsupported protected browser message.');
   const pair=bound(origin,message.session);
   if(message.type==='protected-revoke'){revoke();return{type:'protected-revoked',schemaVersion:1};}
   if(message.type==='protected-discover')return{type:'protected-capabilities',schemaVersion:1,authentication:installed?'native-explicit':'unavailable',operations:installed?[{profileId:PROFILE,operation:OPERATION,target:TARGET}]:[]};
   scope(message);if(!installed)throw Error('Native profile authentication is unavailable.');
   if(message.type==='protected-authenticate')return run(origin,message,async({pair,signal,check})=>{
    const proof=await authenticateProfile({origin,profileId:PROFILE,operation:OPERATION,target:TARGET,signal});check();
    if(!exact(proof,['profileId','revision','expiresAt','authority'])||proof.profileId!==PROFILE||typeof proof.revision!=='string'||!proof.revision||proof.revision.length>160||!Number.isSafeInteger(proof.expiresAt)||proof.expiresAt<=now()||!proof.authority||typeof proof.authority!=='object')throw Error('Native authentication was not accepted.');
    const context={authority:proof.authority,profileId:PROFILE,revision:proof.revision,signal};
    if(await validateAuthority(context)!==true)throw Error('Native authentication is no longer current.');check();
    if(proof.expiresAt<=now())throw Error('Native authentication expired.');
    const grant=randomBytes(32).toString('base64url'),expires=Math.min(proof.expiresAt,pair.expires,now()+60000);
    grants.clear();grants.set(grant,{origin,pair,proof,expires,generation});
    return{type:'protected-granted',schemaVersion:1,grant,profileId:PROFILE,operation:OPERATION,target:TARGET,expiresInMilliseconds:expires-now()};
   });
   if(!secret(message.grant))throw Error('Invalid protected browser grant.');
   const entry=grants.get(message.grant);
   // Consume synchronously before any awaited validation, including failures.
   grants.delete(message.grant);
   if(!entry||entry.origin!==origin||entry.pair!==pair||entry.generation!==generation||entry.expires<=now())throw Error('Protected browser grant is unavailable.');
   return run(origin,message,async({signal,check})=>{
    const live=()=>{check();if(entry.expires<=now())throw Error('Protected browser grant expired.');};
    const context={authority:entry.proof.authority,profileId:PROFILE,revision:entry.proof.revision,signal};
    live();if(await validateAuthority(context)!==true)throw Error('Native authentication is no longer current.');live();
    const summary=await readProfileSummary(context);live();
    if(!exact(summary,['schemaVersion','profile','protectedAccess'])||summary.schemaVersion!==1||summary.profile!=='authenticated'||summary.protectedAccess!=='granted')throw Error('Protected profile summary is invalid.');
    if(await validateAuthority(context)!==true)throw Error('Native authentication is no longer current.');live();
    return{type:'protected-result',schemaVersion:1,profileId:PROFILE,operation:OPERATION,target:TARGET,summary:{schemaVersion:1,profile:'authenticated',protectedAccess:'granted'}};
   });
  },revoke,close(){closed=true;revoke();},get pending(){return busy?1:0;},
 };
}
