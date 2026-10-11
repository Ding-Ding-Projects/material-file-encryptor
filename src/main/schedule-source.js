import {lookup as dnsLookup} from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import {isIP} from 'node:net';
import {createHash} from 'node:crypto';

export const SCHEDULE_SOURCE_LIMITS=Object.freeze({url:2048,body:32768,timeout:5000,concurrency:4,minInterval:30000,records:100});
const identifier=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(id);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const fail=message=>{throw new Error(message);};
function abortable(promise,signal){return new Promise((resolve,reject)=>{const abort=()=>reject(new Error('Schedule source request cancelled or timed out.'));if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});}
export function isPublicAddress(address){
  if(isIP(address)===4){const a=address.split('.').map(Number),[x,y,z]=a;return !(x===0||x===10||x===127||x>=224||(x===100&&y>=64&&y<=127)||(x===169&&y===254)||(x===172&&y>=16&&y<=31)||(x===192&&(y===168||y===0||y===2))||(x===198&&(y===18||y===19||y===51&&z===100))||(x===203&&y===0&&z===113));}
  if(isIP(address)!==6)return false;
  // Only global unicast, excluding transition/documentation/special blocks.
  const first=parseInt(address.split(':')[0]||'0',16);
  if(first<0x2000||first>0x3fff)return false;
  const second=parseInt(address.split(':')[1]||'0',16);
  return !(first===0x2002||(first===0x2001&&(second<=0x1ff||second===0xdb8)));
}
function validateSettings(values){
  if(!object(values)||Object.keys(values).length>12)fail('Invalid schedule settings.');
  const enums={language:['en','yue','bilingual'],theme:['system','light','dark'],density:['compact','comfortable','spacious'],motion:['system','full','reduced']};
  for(const [key,value]of Object.entries(values)){
    if(enums[key]){if(!enums[key].includes(value))fail('Invalid scheduled setting value.');}
    else if(['funnyEnglish','funnyCantonese','fontScale','fontWeight'].includes(key)){const [min,max]=key==='fontScale'?[.75,2]:key==='fontWeight'?[100,900]:[1,5];if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail('Invalid scheduled numeric value.');}
    else if(key==='emoji'){if(typeof value!=='boolean')fail('Invalid scheduled boolean.');}
    else if(['seed','fontFamily','displayName'].includes(key)){if(typeof value!=='string'||value.length>160||/[\x00-\x1f\x7f]/.test(value)||(key==='seed'&&!/^#[0-9a-f]{6}$/i.test(value)))fail('Invalid scheduled text.');}
    else fail('Unsupported schedule setting.');
  }
  return structuredClone(values);
}
function boundedJson(text){
  let value;try{value=JSON.parse(text);}catch{fail('Schedule source returned malformed JSON.');}
  const stack=[];
  for(let i=0;i<text.length;i++){
    if(text[i]==='{')stack.push(new Set());else if(text[i]==='[')stack.push(null);else if(text[i]==='}'||text[i]===']')stack.pop();
    else if(text[i]==='"'){const start=i;for(i++;i<text.length;i++){if(text[i]==='\\'){i++;continue;}if(text[i]==='"')break;}let next=i+1;while(/\s/.test(text[next]||'')&&next<text.length)next++;if(text[next]===':'){const key=JSON.parse(text.slice(start,i+1)),keys=stack.at(-1);if(!keys||keys.has(key))fail('Duplicate schedule response field.');keys.add(key);}}
  }
  function visit(v,depth=0){if(depth>6)fail('Schedule response exceeds the nesting limit.');if(v&&typeof v==='object'){if(Object.keys(v).length>128)fail('Schedule response has too many fields.');for(const [k,item]of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k))fail('Unsafe schedule response field.');visit(item,depth+1);}}}
  visit(value);return value;
}
export function createScheduleSource({credentials,lookup=dnsLookup,request,allowLoopbackDevelopment=false,allowedPorts=[443,8123,8443],authorizeCredentialMutation,now=()=>Date.now(),timeout=5000,minInterval=30000}={}){
  if(typeof allowLoopbackDevelopment!=='boolean'||!Array.isArray(allowedPorts)||allowedPorts.length>16||allowedPorts.some(p=>!Number.isInteger(p)||p<1||p>65535)||!Number.isInteger(timeout)||timeout<100||timeout>SCHEDULE_SOURCE_LIMITS.timeout||!Number.isInteger(minInterval)||minInterval<1000||minInterval>3600000)throw new Error('Invalid schedule source bounds.');
  const active=new Map(),last=new Map();let disposed=false;
  function endpoint(source){
    if(!object(source)||Object.keys(source).some(k=>!['type','url','entityId','entity','id'].includes(k))||!['api','home-assistant'].includes(source.type)||typeof source.url!=='string'||source.url.length>SCHEDULE_SOURCE_LIMITS.url)fail('Invalid schedule source configuration.');
    if(source.entityId!==undefined&&source.entity!==undefined&&source.entityId!==source.entity)fail('Conflicting Home Assistant entity identifiers.');
    const entity=source.entityId??source.entity;
    let url;try{url=new URL(source.url);}catch{fail('Invalid schedule source URL.');}
    if(url.username||url.password||url.hash||!['https:','http:'].includes(url.protocol))fail('Schedule URL must use HTTPS without credentials or fragments.');
    if([...url.searchParams.keys()].some(key=>/token|secret|password|authorization|api.?key/i.test(key)))fail('Schedule URL cannot carry credential parameters.');
    const rawHost=source.url.match(/^https?:\/\/(\[[^\]]+\]|[^/:?#]+)/i)?.[1];
    if(!rawHost||rawHost.includes('%')||rawHost.includes('@'))fail('Invalid schedule source host.');
    const host=url.hostname.replace(/^\[|\]$/g,''),literal=isIP(host),loopback=allowLoopbackDevelopment&&['127.0.0.1','[::1]'].includes(rawHost)&&['127.0.0.1','::1'].includes(host);
    if(url.protocol==='http:'&&!loopback)fail('HTTP is restricted to the explicit literal loopback development route.');
    if(literal&&!loopback&&(!isPublicAddress(host)||rawHost.replace(/^\[|\]$/g,'').toLowerCase()!==host.toLowerCase()))fail('Schedule source address is not an approved public target.');
    const port=Number(url.port||(url.protocol==='https:'?443:80));if(!allowedPorts.includes(port)&&!(loopback&&[80,443,8123,8443].includes(port)))fail('Schedule source port is not allowed.');
    if(source.type==='home-assistant'){
      if(typeof entity!=='string'||!/^(?:binary_sensor|input_boolean)\.[a-z0-9_]{1,128}$/.test(entity)||url.search||(url.pathname!=='/'&&url.pathname!==''))fail('Home Assistant requires an origin URL and a boolean entity identifier.');
      url.pathname='/api/states/'+entity;
    }else if(entity!==undefined&&entity!=='')fail('Unexpected entity identifier for API source.');
    return {url,host,port,literal,loopback,entity};
  }
  async function resolve(target){
    if(target.literal)return {address:target.host,family:target.literal};
    let addresses;try{addresses=await Promise.race([lookup(target.host,{all:true,verbatim:true}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Schedule DNS resolution timed out.')),timeout);timer.unref?.();})]);}catch{fail('Schedule source DNS resolution failed.');}
    if(!Array.isArray(addresses)||!addresses.length||addresses.length>16||addresses.some(a=>!isPublicAddress(a.address)||isIP(a.address)!==a.family))fail('Schedule DNS returned a private, special or invalid address.');
    return addresses[0];
  }
  async function load(target,pin,token,signal){
    return new Promise((resolve,reject)=>{
      let done=false,req,timer;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
      const cancel=()=>{finish(new Error('Schedule source request cancelled.'));req?.destroy();};
      const options={protocol:target.url.protocol,hostname:target.host,port:target.port,path:target.url.pathname+target.url.search,method:'GET',agent:false,family:pin.family,autoSelectFamily:false,rejectUnauthorized:true,servername:target.literal?undefined:target.host,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{})},lookup(_hostname,opts,cb){if(typeof opts==='function'){cb=opts;opts={};}opts?.all?cb(null,[pin]):cb(null,pin.address,pin.family);}};
      try{
        req=(request||(target.url.protocol==='https:'?https.request:http.request))(options,res=>{
          if(res.statusCode!==200){res.resume();finish(new Error(res.statusCode>=300&&res.statusCode<400?'Schedule source redirects are not allowed.':'Schedule source returned an unsuccessful status.'));req?.destroy();return;}
          const type=String(res.headers['content-type']||'').split(';')[0].trim().toLowerCase(),encoding=res.headers['content-encoding'];
          if(!(type==='application/json'||/^application\/[a-z0-9.-]+\+json$/.test(type))||(encoding&&encoding!=='identity')||Number(res.headers['content-length']||0)>SCHEDULE_SOURCE_LIMITS.body){res.resume();finish(new Error('Schedule source returned an unsupported or oversized body.'));req?.destroy();return;}
          const chunks=[];let bytes=0;
          res.on('data',chunk=>{if(done)return;bytes+=chunk.length;if(bytes>SCHEDULE_SOURCE_LIMITS.body){finish(new Error('Schedule source response exceeded its size limit.'));req?.destroy();return;}chunks.push(Buffer.from(chunk));});
          res.on('error',()=>finish(new Error('Schedule source response was interrupted.')));
          res.on('end',()=>{if(done)return;try{const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));finish(null,boundedJson(text));}catch{finish(new Error('Schedule source returned invalid JSON data.'));}});
        });
        req.on('error',()=>finish(new Error('Schedule source network request failed.')));
        timer=setTimeout(()=>{finish(new Error('Schedule source request timed out.'));req.destroy();},timeout);
        if(signal?.aborted){cancel();return;}signal?.addEventListener('abort',cancel,{once:true});req.end();
      }catch{finish(new Error('Schedule source could not be requested.'));}
    });
  }
  async function fetchSource(source,{id=source?.id,signal}={}){
    if(disposed)fail('Schedule source adapter is closed.');if(!identifier(id))fail('A stable schedule identifier is required.');const target=endpoint(source);
    const identity=createHash('sha256').update(source.type+'\n'+target.url.href).digest('hex'),key=id+':'+identity;
    if(active.has(key))return active.get(key).promise;
    if(active.size>=SCHEDULE_SOURCE_LIMITS.concurrency)fail('Too many concurrent schedule requests.');
    if(last.has(id)&&now()-last.get(id)<minInterval)fail('Schedule refresh is rate limited.');
    if(last.size>=SCHEDULE_SOURCE_LIMITS.records&&!last.has(id))fail('Too many registered schedule sources.');last.set(id,now());
    const controller=new AbortController(),combined=AbortSignal.any([...(signal?[signal]:[]),controller.signal,AbortSignal.timeout(timeout)]);
    const promise=(async()=>{
      const pin=await abortable(resolve(target),combined);if(combined.aborted)fail('Schedule source request cancelled.');
      let token;if(source.type==='home-assistant'){const stored=await abortable(credentials?.get('schedule:'+id),combined);if(!object(stored)||stored.origin!==target.url.origin)fail('A protected Home Assistant credential bound to this origin is required.');token=stored.token;if(typeof token!=='string'||!token||token.length>8192||/[\r\n]/.test(token))fail('A protected Home Assistant credential is required.');}
      const data=await load(target,pin,token,combined),checkedAt=new Date(now()).toISOString(),provenance={transport:target.url.protocol.slice(0,-1),host:target.host,sourceHash:identity,checkedAt};
      if(source.type==='api'){if(!object(data)||Object.keys(data).some(k=>!['version','settings'].includes(k))||data.version!==1)fail('Expected a version 1 schedule settings response.');return {version:1,settings:validateSettings(data.settings),checkedAt,provenance};}
      if(!object(data)||data.entity_id!==target.entity||!['on','off'].includes(data.state))fail('Home Assistant returned an invalid boolean entity state.');
      return {state:data.state,active:data.state==='on',checkedAt,provenance};
    })().finally(()=>active.delete(key));
    active.set(key,{promise,controller});return promise;
  }
  return {
    fetch:fetchSource,
    async registerToken(id,token,context){if(!identifier(id)||typeof token!=='string'||!token||token.length>8192||/[\r\n]/.test(token))fail('Invalid protected schedule credential.');if(!authorizeCredentialMutation||await authorizeCredentialMutation(context)!==true)fail('Native credential authorization is required.');if(context?.source?.type!=='home-assistant')fail('Native credential registration requires the approved Home Assistant source.');const target=endpoint(context.source);if(!credentials?.set)fail('Protected credential storage is unavailable.');await credentials.set('schedule:'+id,{token,origin:target.url.origin});return {id,stored:true};},
    async deleteToken(id,context){if(!identifier(id)||!authorizeCredentialMutation||await authorizeCredentialMutation(context)!==true)fail('Native credential authorization is required.');if(!credentials?.delete)fail('Protected credential storage is unavailable.');await credentials.delete('schedule:'+id);return {id,deleted:true};},
    async dispose(){disposed=true;for(const job of active.values())job.controller.abort();await Promise.allSettled([...active.values()].map(job=>job.promise));},
  };
}
