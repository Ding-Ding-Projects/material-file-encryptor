import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {parseStrictJson} from '../shared/personal-vocabulary.js';

const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&/^[A-Za-z0-9_-]{43}$/.test(a)&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const extensionOrigin=/^chrome-extension:\/\/[a-p]{32}\/$/;
function proposal(value){
 if(!exact(value,['url','filename','browserDownloadId']))throw new Error('Invalid browser download proposal.');
 if(typeof value.url!=='string'||value.url.length>2048)throw new Error('Invalid browser download URL.');const url=new URL(value.url);
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw new Error('Use a public HTTPS download without credentials.');
 if(typeof value.filename!=='string'||!value.filename||value.filename.length>180||/[\\/<>:"|?*\x00-\x1f\x7f]/.test(value.filename)||['.','..'].includes(value.filename))throw new Error('Use a file name without a path.');
 if(!Number.isSafeInteger(value.browserDownloadId)||value.browserDownloadId<0)throw new Error('Invalid browser download identifier.');url.hash='';return{url:url.href,filename:value.filename,browserDownloadId:value.browserDownloadId};
}
/** Connect only to an OS-launched native host whose caller origin is in its manifest. */
export function createBrowserDownloadReceiver({allowedOrigins=[],authorizePair,isUnlocked,onProposal,pairingCodes=null,now=Date.now}={}){
 if(!Array.isArray(allowedOrigins)||!allowedOrigins.length||allowedOrigins.some(value=>!extensionOrigin.test(value))||typeof authorizePair!=='function'||typeof isUnlocked!=='function'||typeof onProposal!=='function')throw new Error('Native download receiver requires an exact extension allowlist and native consent.');
 const origins=new Set(allowedOrigins),sessions=new Map();let generation=0,active=0,closed=false;
 // A new connection revokes sessions but must not spend the code it is about to present.
 const revoke=()=>{generation++;sessions.clear();};
 const unlocked=()=>{if(closed||isUnlocked()!==true){revoke();pairingCodes?.clear();throw new Error('Unlock the desktop before receiving downloads.');}};
 return{
  async receive(origin,message){
   if(!origins.has(origin)||active>=2)throw new Error('Browser caller unavailable or not allowed.');unlocked();active++;
   try{
    if((exact(message,['type'])||exact(message,['type','code']))&&message.type==='pair'){
     const bound=generation,supplied=Object.hasOwn(message,'code');if(sessions.has(origin)&&sessions.get(origin).expires>now())throw new Error('This browser is already paired.');
     // A supplied code is checked before any prompt. The reply never repeats it.
     if(supplied&&(!pairingCodes||pairingCodes.verify(message.code)!==true))throw new Error('The pairing code was not accepted.');
     if(await authorizePair(supplied?{origin,codeMatched:true}:{origin})!==true||bound!==generation)throw new Error('Browser pairing was not approved.');unlocked();
     if(supplied&&pairingCodes.consume(message.code)!==true)throw new Error('The pairing code was not accepted.');
     const session=randomBytes(32).toString('base64url');sessions.set(origin,{session,expires:now()+900000,seen:new Set()});return{type:'paired',session,expiresInSeconds:900};
    }
    if(!exact(message,['type','session','proposal'])||message.type!=='propose')throw new Error('Unsupported native download message.');const paired=sessions.get(origin);if(!paired||paired.expires<=now()||!same(message.session,paired.session))throw new Error('Pair the browser again.');const item=proposal(message.proposal);
    if(paired.seen.size>=64||paired.seen.has(item.browserDownloadId))throw new Error('Browser proposal is duplicated or exceeds the session limit.');const bound=generation;paired.seen.add(item.browserDownloadId);
    const id=randomUUID();await onProposal({id,origin,...item});if(bound!==generation)throw new Error('The desktop locked during capture.');unlocked();return{type:'proposed',id,state:'awaiting-confirmation'};
   }finally{active--;}
  },
  // True only while this origin holds exactly this unexpired, unrevoked pairing session.
  holds(origin,session){const paired=sessions.get(origin);return Boolean(paired)&&paired.expires>now()&&same(session,paired.session);},
  revoke,close(){closed=true;revoke();pairingCodes?.clear();},
 };
}

/** Chrome native-messaging framing, no more than one bounded pending message. */
export function createNativeMessageDecoder(onMessage){
 let buffer=Buffer.alloc(0),failed=false;
 return{push(chunk){if(failed)throw new Error('Native message decoder is closed.');if(!Buffer.isBuffer(chunk)||chunk.length>65540||buffer.length+chunk.length>65540){failed=true;throw new Error('Native message exceeds 64 KiB.');}buffer=Buffer.concat([buffer,chunk]);const messages=[];
  try{while(buffer.length>=4){const size=buffer.readUInt32LE(0);if(!size||size>65536)throw new Error('Native message exceeds 64 KiB.');if(buffer.length<4+size)break;const value=parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(4,4+size)));buffer=buffer.subarray(4+size);messages.push(onMessage(value));}return messages;}catch(error){failed=true;buffer=Buffer.alloc(0);throw error;}
 },end(){if(buffer.length)throw new Error('Native message ended before its frame completed.');failed=true;}};
}
