import {randomUUID,timingSafeEqual} from 'node:crypto';
import {catalog as declaredCatalog} from '../features/converter/registry.mjs';
const FORMATS=new Set(['json-format','text-utf8','base64','hex']);
const LANGUAGES=['en','yue','bilingual'];
const UUID=/^[a-f0-9-]{36}$/;
const STATES=['queued','running','paused','completed','failed','cancelled'];
const keys={
 'converter-catalog':[], 'converter-prepare':[], 'converter-enqueue':['selection','adapterId'],
 'converter-list':['cursor'], 'converter-control':['id','action'],
};
export function validateBrowserConverterRequest(message){
 const fields=keys[message?.type];
 if(!fields||!message||Object.getPrototypeOf(message)!==Object.prototype||Reflect.ownKeys(message).length!==fields.length+3||!['type','session','language',...fields].every(key=>Object.hasOwn(message,key))||!LANGUAGES.includes(message.language))throw Error('Unsupported browser conversion request.');
 if(message.type==='converter-enqueue'&&((typeof message.selection!=='string'||!UUID.test(message.selection))||!FORMATS.has(message.adapterId)))throw Error('Unsupported browser conversion selection.');
 if(message.type==='converter-list'&&message.cursor!==null&&(typeof message.cursor!=='string'||!UUID.test(message.cursor)))throw Error('Invalid conversion page.');
 if(message.type==='converter-control'&&((typeof message.id!=='string'||!UUID.test(message.id))||!['pause','resume','cancel'].includes(message.action)))throw Error('Invalid conversion control.');
 return message;
}
const safeJob=row=>{
 if(!row||!UUID.test(row.id)||!FORMATS.has(row.adapterId)||!STATES.includes(row.state)||!Number.isFinite(row.progress)||row.progress<0||row.progress>100)throw Error('Invalid native conversion state.');
 return {id:row.id,adapterId:row.adapterId,state:row.state,progress:row.progress};
};

/** Host-only adapter. Native source/destination grants never cross the boundary. */
export function createBrowserConverterAdapter({getService,pickSource,pickDestination,confirm,releaseGrant}={}){
 const sessions=new Map();
 const state=pair=>{let value=sessions.get(pair);if(!value){value={owner:randomUUID(),selection:null,disposed:false,service:null,tasks:new Set(),releases:new Map(),scanClosed:false};sessions.set(pair,value);}return value;};
 const available=async()=>{const service=await getService();return {service,actual:await service.catalog()};};
 async function releaseOwned(local,id){
  let action=local.releases.get(id);if(!action){action={done:false,running:null};local.releases.set(id,action);}if(action.done)return;if(action.running)return action.running;
  action.running=Promise.resolve().then(()=>releaseGrant(id)).then(()=>{action.done=true;}).finally(()=>{action.running=null;});return action.running;
 }
 async function perform(message,{pair,check,signal},local){
  const language=message.language;check();const {service,actual}=await available();local.service=service;check();
  const formats=declaredCatalog().map(row=>{const native=actual.find(item=>item.id===row.id);return {id:row.id,category:row.category,name:row.name,sources:row.sources,target:row.target,metadata:row.metadata,encoding:row.encoding,lossy:row.lossy,enabled:FORMATS.has(row.id)&&native?.enabled===true,reason:!FORMATS.has(row.id)?'browser-options-unavailable':native?.enabled===true?'':'native-adapter-unavailable'};});
  if(message.type==='converter-catalog')return {type:'converter-catalog-result',schemaVersion:1,formats};
  if(message.type==='converter-list'){const page=await service.scanOwned({cursor:message.cursor},{owner:local.owner,checkAdmission:check});check();return {type:'converter-list-result',schemaVersion:1,rows:page.rows.map(safeJob),nextCursor:page.nextCursor};}
  if(message.type==='converter-control'){
   if(!await confirm({kind:'control',language,action:message.action,check,signal}))return {type:'converter-control-result',schemaVersion:1,outcome:'cancelled'};check();
   const row=await service.control({id:message.id,action:message.action},{owner:local.owner,checkAdmission:check});check();return {type:'converter-control-result',schemaVersion:1,outcome:'updated',job:safeJob(row)};
  }
  if(message.type==='converter-prepare'){
   if(!await confirm({kind:'prepare',language,check,signal}))return {type:'converter-prepare-result',schemaVersion:1,outcome:'cancelled'};check();
   const source=await pickSource({language,check,signal});let retained=false;
   try{check();if(!source)return {type:'converter-prepare-result',schemaVersion:1,outcome:'cancelled'};
    const inspected=await service.inspect({sourceIds:[source]});check();const row=inspected[0];
    if(inspected.length!==1||typeof row.type!=='string'||!['pdf','png','jpeg','zip','xlsx','ods','wav','flac','mp3','mp4','riff','7z','rar','binary','json','text'].includes(row.type)||!Number.isSafeInteger(row.bytes)||row.bytes<0)throw Error('Invalid conversion inspection.');
    if(local.selection){const old=local.selection;local.selection=null;await releaseOwned(local,old.source);}check();
    local.selection={id:randomUUID(),source};retained=true;
    return {type:'converter-prepare-result',schemaVersion:1,outcome:'selected',selection:local.selection.id,sourceType:row.type,bytes:row.bytes};
   }finally{if(source&&!retained)await releaseOwned(local,source);}
  }
  const format=formats.find(row=>row.id===message.adapterId);
  if(!format?.enabled||!local.selection||local.selection.id!==message.selection)throw Error('Choose a supported format and source again.');
  const selected=local.selection;selected.inUse=true;let destination=null,accepted=false;
  try{destination=await pickDestination({language,extension:format.target,check,signal});check();if(!destination)return {type:'converter-enqueue-result',schemaVersion:1,outcome:'cancelled'};
   if(!await confirm({kind:'enqueue',language,format,source:selected.source,destination,check,signal}))return {type:'converter-enqueue-result',schemaVersion:1,outcome:'cancelled'};check();
   // The service checks immediately before its atomic publication. Once accepted,
   // durable work belongs to the desktop and is not tied to a transient browser.
   const row=await service.enqueue({sourceIds:[selected.source],destinationId:destination,adapterId:format.id,options:{},lossyConfirmed:true,overwriteConfirmed:false},{owner:local.owner,checkAdmission:check});accepted=true;local.selection=null;
   return {type:'converter-enqueue-result',schemaVersion:1,outcome:'accepted',job:safeJob(row)};
  }finally{try{if(destination&&!accepted)await releaseOwned(local,destination);}finally{selected.inUse=false;}}
 }
 function receive(message,context){const local=state(context.pair);if(local.disposed)return Promise.reject(Error('Browser conversion session disposed.'));const task=perform(message,context,local);local.tasks.add(task);return task.finally(()=>local.tasks.delete(task));}
 receive.dispose=async pair=>{
  const local=sessions.get(pair);if(!local)return;local.disposed=true;
  // An operation may still be deciding whether its grants belong to accepted
  // durable work. Wait for that decision before selecting disposal actions.
  await Promise.allSettled([...local.tasks]);
  const selected=local.selection;if(selected&&!local.releases.has(selected.source))local.releases.set(selected.source,{done:false,running:null});
  let failed=null;for(const [id,action]of local.releases)if(!action.done)try{await releaseOwned(local,id);}catch(error){failed=error;}
  if(selected&&local.releases.get(selected.source)?.done)local.selection=null;
  if(!local.scanClosed)try{await local.service?.closeOwnedScan(local.owner);local.scanClosed=true;}catch(error){failed=error;}
  if(failed)throw failed;
  sessions.delete(pair);
 };
 return receive;
}

export function createBrowserConverterMediation({getPair,isUnlocked,adapter,now=Date.now,timeoutMs=120000,dispose=adapter?.dispose}={}){
 const pairs=new Set(),disposals=new Map();let epoch=0,closed=false,active=null;
 const schedule=(pair,retry=false)=>{
  if(typeof dispose!=='function')return;let action=disposals.get(pair);
  if(action?.running||action&&!retry)return;if(!action){action={running:null,error:null};disposals.set(pair,action);}action.error=null;
  action.running=Promise.resolve().then(()=>dispose(pair)).then(()=>{disposals.delete(pair);},error=>{action.error=error;}).finally(()=>{action.running=null;});
 };
 const revoke=()=>{epoch++;active?.abort();for(const pair of pairs){pairs.delete(pair);schedule(pair);}};
 return {supports:type=>Object.hasOwn(keys,type),revoke,get pendingDisposals(){return disposals.size;},async disposePending(){await Promise.all([...disposals.values()].map(action=>action.running));const failed=[...disposals.values()].find(action=>action.error);if(failed)throw failed.error;},close(){closed=true;revoke();for(const [pair,action]of disposals)if(action.error&&!action.running)schedule(pair,true);},
 async receive(origin,message,checkConnection){
  validateBrowserConverterRequest(message);if(typeof adapter!=='function')throw Error('Browser conversion unavailable.');
  const pair=getPair(origin),generation=epoch;
  const check=()=>{checkConnection();const supplied=message.session;if(closed||generation!==epoch||isUnlocked()!==true||!pair||getPair(origin)!==pair||pair.expires<=now()||typeof supplied!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(supplied)||supplied.length!==pair.session?.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(pair.session)))throw Error('Browser conversion authorization expired.');};check();pairs.add(pair);
  if(active)throw Error('Resolve the pending native conversion request.');
  const controller=new AbortController();active=controller;const live=()=>{check();if(controller.signal.aborted)throw Error('Browser conversion cancelled.');};
  let timer,abort,settled=false;
  const cancelled=new Promise((_,reject)=>{abort=()=>reject(Error('Browser conversion cancelled. Check the desktop for work already accepted.'));controller.signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>controller.abort(),timeoutMs);});
  const task=Promise.resolve().then(()=>{live();return adapter(message,{pair,check:live,signal:controller.signal});}).finally(()=>{settled=true;if(controller.signal.aborted&&active===controller)active=null;});
  try{const response=await Promise.race([task,cancelled]);check();return response;}
  finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);controller.abort();if(settled&&active===controller)active=null;}
 }};
}
