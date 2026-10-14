import {timingSafeEqual} from 'node:crypto';

const TYPES=new Set(['read-lock-state','read-update-state']);
const exact=value=>value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===2&&Object.hasOwn(value,'type')&&Object.hasOwn(value,'session');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&/^[A-Za-z0-9_-]{43}$/.test(a)&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const version=value=>typeof value==='string'&&/^\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[0-9A-Za-z.-]{1,32})?$/.test(value)?value:null;
const PHASES={checking:'checking',downloading:'downloading',ready:'ready',confirming:'ready',installing:'ready','preparing-restart':'ready','manual-restart-required':'ready','restart-requested':'ready',idle:'idle',current:'idle',available:'idle'};

/** Status-mode scopes: they need a valid pairing and no desktop prompt, and they
 * answer with fixed non-secret fields only. No path, URL, feed detail, file name
 * or credential can appear in either response shape. */
export function createBrowserStatusMediation({getPair,isUnlocked,readUpdateState,now=Date.now}={}){
 if(typeof getPair!=='function'||typeof isUnlocked!=='function')throw Error('Invalid browser status configuration.');
 let closed=false;
 return {supports:type=>TYPES.has(type),revoke(){},close(){closed=true;},
 async receive(origin,message,checkConnection){
  if(!exact(message)||!TYPES.has(message.type)||typeof checkConnection!=='function')throw Error('Unsupported browser status request.');
  const pair=getPair(origin);
  const check=()=>{checkConnection();if(closed||!pair||getPair(origin)!==pair||pair.expires<=now()||!same(message.session,pair.session))throw Error('Pair the browser again.');};
  check();
  if(message.type==='read-lock-state'){let state;try{state=isUnlocked()===true?'unlocked':'locked';}catch{state='unavailable';}check();return {type:'lock-state',schemaVersion:1,state};}
  let source=null;try{source=typeof readUpdateState==='function'?await readUpdateState():null;}catch{source=null;}
  check();
  const desktopVersion=version(source?.desktopVersion);
  if(!desktopVersion)return {type:'update-state',schemaVersion:1,desktopVersion:'unknown',availableVersion:null,phase:'unavailable',progress:null};
  const raw=source.status?.state,phase=Object.hasOwn(PHASES,raw)?PHASES[raw]:'unavailable';
  const progress=phase==='ready'?1:null;
  return {type:'update-state',schemaVersion:1,desktopVersion,availableVersion:phase==='unavailable'?null:version(source.status?.update?.version),phase,progress};
 }};
}
