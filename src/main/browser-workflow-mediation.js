import {timingSafeEqual} from 'node:crypto';
const exact=value=>value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===(value.type==='workflow-editor-open'?3:2)&&Object.hasOwn(value,'type')&&Object.hasOwn(value,'session')&&(value.type!=='workflow-editor-open'||Object.hasOwn(value,'language')&&['en','yue','bilingual'].includes(value.language));
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&/^[A-Za-z0-9_-]{43}$/.test(a)&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));

/** A single native-picked editor operation. No browser path, executable, document
 * identifier, credential, or general feature dispatch is accepted. */
export function createBrowserWorkflowMediation({getPair,isUnlocked,openEditor,now=Date.now,timeoutMs=120000}={}){
 if(typeof getPair!=='function'||typeof isUnlocked!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<25||timeoutMs>120000)throw Error('Invalid browser workflow configuration.');
 let closed=false,epoch=0,active=null;
 const revoke=()=>{epoch++;active?.abort();};
 return {supports:type=>['workflow-discover','workflow-editor-open'].includes(type),revoke,close(){closed=true;revoke();},
 async receive(origin,message,checkConnection){
  if(!exact(message)||!['workflow-discover','workflow-editor-open'].includes(message.type)||typeof checkConnection!=='function')throw Error('Unsupported browser workflow.');
  const pair=getPair(origin),generation=epoch;
  const check=()=>{checkConnection();if(closed||generation!==epoch||isUnlocked()!==true||!pair||getPair(origin)!==pair||pair.expires<=now()||!same(message.session,pair.session))throw Error('Browser workflow is no longer authorized.');};
  check();
  if(message.type==='workflow-discover')return {type:'workflow-capabilities',schemaVersion:1,externalEditor:typeof openEditor==='function'};
  if(typeof openEditor!=='function'||active)throw Error('Native editor workflow unavailable or busy.');
  const controller=new AbortController();active=controller;
  const live=()=>{check();if(controller.signal.aborted)throw Error('Browser workflow cancelled.');};
  let timer,abort;
  const cancelled=new Promise((_,reject)=>{abort=()=>reject(Error('Browser workflow cancelled.'));controller.signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>controller.abort(),timeoutMs);});
  let settled=false;const task=Promise.resolve().then(()=>{live();return openEditor({origin,language:message.language,signal:controller.signal,check:live});}).finally(()=>{settled=true;if(controller.signal.aborted&&active===controller)active=null;});
  try{
   const result=await Promise.race([task,cancelled]);live();
   if(!result||Object.keys(result).join(',')!=='outcome'||!['opened','cancelled'].includes(result.outcome))throw Error('Invalid native editor result.');
   return {type:'workflow-editor-result',schemaVersion:1,outcome:result.outcome};
  }finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);controller.abort();if(settled&&active===controller)active=null;}
 }};
}
