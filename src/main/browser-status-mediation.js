import {timingSafeEqual} from 'node:crypto';

const TYPES=new Set(['read-lock-state','read-update-state','enroll-status-client']);
const exact=value=>value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===2&&Object.hasOwn(value,'type')&&Object.hasOwn(value,'session');
const plain=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const COUNTS=['notes','schedules','tickets','operations'];
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&/^[A-Za-z0-9_-]{43}$/.test(a)&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const version=value=>typeof value==='string'&&/^\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[0-9A-Za-z.-]{1,32})?$/.test(value)?value:null;
/** The extension's bounded status report: fixed fields only, no content, link, path or name. */
export function validStatusClientReport(report){return plain(report,['version','connection','lastRefresh','counts'])&&version(report.version)!==null&&report.connection==='paired'&&(report.lastRefresh===null||typeof report.lastRefresh==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(report.lastRefresh))&&plain(report.counts,COUNTS)&&COUNTS.every(key=>Number.isSafeInteger(report.counts[key])&&report.counts[key]>=0&&report.counts[key]<=9999);}
const PHASES={checking:'checking',downloading:'downloading',ready:'ready',confirming:'ready',installing:'ready','preparing-restart':'ready','manual-restart-required':'ready','restart-requested':'ready',idle:'idle',current:'idle',available:'idle'};

/** Status-mode scopes: they need a valid pairing and no desktop prompt, and they
 * answer with fixed non-secret fields only. No path, URL, feed detail, file name
 * or credential can appear in either response shape. */
export function createBrowserStatusMediation({getPair,isUnlocked,readUpdateState,enrollStatusClient,now=Date.now}={}){
 if(typeof getPair!=='function'||typeof isUnlocked!=='function')throw Error('Invalid browser status configuration.');
 let closed=false;
 return {supports:type=>TYPES.has(type),revoke(){},close(){closed=true;},
 async receive(origin,message,checkConnection){
  const enrolling=plain(message,['type','session','report'])&&message.type==='enroll-status-client';
  if(!(exact(message)&&message.type!=='enroll-status-client'||enrolling)||!TYPES.has(message.type)||typeof checkConnection!=='function')throw Error('Unsupported browser status request.');
  const pair=getPair(origin);
  const check=()=>{checkConnection();if(closed||!pair||getPair(origin)!==pair||pair.expires<=now()||!same(message.session,pair.session))throw Error('Pair the browser again.');};
  check();
  if(enrolling){
   // An independent status client is enrolled only through this paired, unlocked mediator, and only with the bounded report.
   if(!validStatusClientReport(message.report))throw Error('Unsupported browser status request.');
   let state='unavailable';try{const answer=typeof enrollStatusClient==='function'?await enrollStatusClient(Object.freeze({version:message.report.version,connection:message.report.connection,lastRefresh:message.report.lastRefresh,counts:Object.freeze({...message.report.counts})})):'unavailable';state=answer==='enrolled'||answer==='pending'?answer:'unavailable';}catch{state='unavailable';}
   check();return {type:'status-client',schemaVersion:1,state};
  }
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
