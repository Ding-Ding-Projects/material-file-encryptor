import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export const NATIVE_PLAN_ROUTE='cheap-lowlevel-headless/native-v1-connected-cdp';
const helperPath=fileURLToPath(import.meta.url);
const RESULT_LIMIT=8*1024*1024,RESULT_DIAGNOSTIC_RESERVE=16384;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const descendant=(root,file)=>{const relative=path.relative(root,file);return Boolean(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};

async function physical(file,{directory=false}={}) {
 const resolved=path.resolve(file);assert.equal(await fs.realpath(resolved),resolved,'Redirected verification path');
 for(let cursor=resolved;;cursor=path.dirname(cursor)) {
  assert.equal((await fs.lstat(cursor)).isSymbolicLink(),false,'Linked verification path');
  if(path.dirname(cursor)===cursor)break;
 }
 const stat=await fs.lstat(resolved);assert.equal(directory?stat.isDirectory():stat.isFile(),true);
 if(!directory)assert.equal(stat.nlink,1,'Hard-linked verification receipt');
 return resolved;
}

export async function validateNativeCapturePath(file,receipt) {
 assert.equal(typeof file,'string');assert.ok(path.isAbsolute(file));
 const root=await physical(receipt.runRoot,{directory:true}),output=await physical(receipt.outputRoot,{directory:true});
 assert.ok(descendant(root,output),'Output directory must belong to the run');
 const destination=path.resolve(file);assert.ok(descendant(output,destination),'Capture must be a strict child of outputRoot');
 await physical(path.dirname(destination),{directory:true});
 try{await fs.lstat(destination);fail('OUTPUT_EXISTS','Capture destination already exists.');}catch(error){if(error.code!=='ENOENT')throw error;}
 return destination;
}

// Identical public mapping semantics to the existing prospective observer.
// Counts begin only after Runtime and Log subscriptions are enabled.
export class NativePlanObservation {
 constructor(clock=Date.now){this.clock=clock;this.finished=false;this.value={version:1,requested:true,enabled:false,complete:false,startedAt:null,endedAt:null,coverage:'cdp-plan-interval',startupHistoryObserved:false,mappingVersion:1,consoleErrorCount:null,unhandledExceptionCount:null,pageErrorCount:null,historicalEventsExcluded:0,invalidEventCount:0,interruptionCode:null,binding:null};}
 activate(){this.start=this.clock();Object.assign(this.value,{enabled:true,startedAt:new Date(this.start).toISOString(),consoleErrorCount:0,unhandledExceptionCount:0,pageErrorCount:0});}
 invalidate(code){if(!this.finished){this.value.invalidEventCount++;this.value.interruptionCode??=code;}}
 observe(method,params){
  if(!this.value.enabled||this.finished)return;
  if(method==='Runtime.consoleAPICalled'&&typeof params?.type!=='string'||method==='Log.entryAdded'&&typeof params?.entry?.level!=='string'){this.invalidate('INVALID_RUNTIME_EVENT');return;}
  let field,timestamp;
  if(method==='Runtime.consoleAPICalled'&&['error','assert'].includes(params?.type)){field='consoleErrorCount';timestamp=params.timestamp;}
  else if(method==='Runtime.exceptionThrown'){field='unhandledExceptionCount';timestamp=params?.timestamp;}
  else if(method==='Log.entryAdded'&&params?.entry?.level==='error'){field='pageErrorCount';timestamp=params.entry.timestamp;}else return;
  if(typeof timestamp!=='number'||!Number.isFinite(timestamp)||timestamp<0){this.invalidate('INVALID_EVENT_TIMESTAMP');return;}
  if(timestamp<this.start){this.value.historicalEventsExcluded++;return;}this.value[field]++;
 }
 finish(success){if(!this.finished){this.finished=true;this.value.endedAt=this.value.enabled?new Date(this.clock()).toISOString():null;this.value.complete=success&&this.value.enabled&&this.value.invalidEventCount===0&&this.value.interruptionCode===null;}return{...this.value};}
}

export function validateNativePlan(plan,{receiptPath,endpoint,expectedUrl}) {
 assert.equal(plan?.version,1);assert.equal(path.resolve(plan.receipt),receiptPath);assert.equal(plan.endpoint,endpoint);assert.equal(plan.expectedUrl,expectedUrl);
 assert.equal(plan.allowEvaluate,true);assert.ok(Number.isInteger(plan.timeoutMs)&&plan.timeoutMs>=1&&plan.timeoutMs<=120000);
 assert.ok(Array.isArray(plan.steps)&&plan.steps.length<=500);assert.ok(Buffer.byteLength(JSON.stringify(plan))<=1024*1024);
 const ids=new Set();
 for(const step of plan.steps){
  assert.equal(typeof step.id,'string');assert.ok(step.id.length>0&&step.id.length<=200&&!ids.has(step.id));ids.add(step.id);
  assert.ok(['evaluate','poll','emulate','click','type','capture'].includes(step.op),'Unsupported native plan operation');
  if(['evaluate','poll'].includes(step.op)){assert.equal(typeof step.expression,'string');assert.ok(step.expression.length>0&&Buffer.byteLength(step.expression)<=256*1024);}
  if(step.op==='poll'){assert.ok(Object.hasOwn(step,'equals'));assert.ok(Number.isInteger(step.intervalMs)&&step.intervalMs>=10&&step.intervalMs<=5000);}
  if(['click','type'].includes(step.op)){assert.equal(typeof step.selector,'string');assert.ok(step.selector.length>0&&step.selector.length<=4096);}
  if(step.op==='type'){assert.equal(typeof step.text,'string');assert.ok(Buffer.byteLength(step.text)<=65536);}
  if(step.op==='emulate'){for(const key of ['width','height'])assert.ok(Number.isInteger(step[key])&&step[key]>=1&&step[key]<=10000);assert.ok(Number.isFinite(step.scale)&&step.scale>=.25&&step.scale<=4);assert.equal(typeof step.mobile,'boolean');assert.equal(typeof step.touch,'boolean');}
  if(step.op==='capture'){assert.equal(typeof step.path,'string');assert.ok(path.isAbsolute(step.path));assert.notEqual(step.overwrite,true,'Existing evidence is never overwritten');}
 }
 return plan;
}

function selectorExpression(step){
 return `(()=>{const nodes=[...document.querySelectorAll(${JSON.stringify(step.selector)})];if(nodes.length!==1)throw Error('Exact control unavailable');const n=nodes[0],r=n.getBoundingClientRect(),s=getComputedStyle(n);if(!r.width||!r.height||s.visibility==='hidden'||s.display==='none'||n.disabled||n.readOnly)throw Error('Control unavailable');n.scrollIntoView({block:'center',inline:'center'});${step.op==='click'?'n.click();':`if(!('value'in n))throw Error('Editable control unavailable');n.value=${step.clear===true?'':"String(n.value)+"}${JSON.stringify(step.text)};n.dispatchEvent(new Event('input',{bubbles:true,composed:true}));n.dispatchEvent(new Event('change',{bubbles:true,composed:true}));`}return{ok:true,count:1};})()`;
}

export async function createNativePlanExecutor({opened}) {
 assert.equal(opened?.connectionOwned,true);assert.equal(opened.backend,'native-v1');
 const connection=opened.nativeConnection;assert.equal(connection?.route,'native-v1-connected-cdp');
 assert.equal(connection.expectedUrl,opened.target.expectedUrl);assert.equal(typeof connection.prove,'function');assert.equal(typeof connection.createPageSession,'function');
 const receiptPath=await physical(opened.statePath),receiptBytes=await fs.readFile(receiptPath),receipt=JSON.parse(receiptBytes);
 assert.equal(receipt.created,true);assert.equal(receipt.cleaned,false);assert.equal(receipt.runRoot,opened.runRoot);
 assert.equal(receipt.cdp.expectedUrl,opened.target.expectedUrl);assert.ok(Number.isInteger(receipt.cdp.port)&&receipt.cdp.port>=1024&&receipt.cdp.port<=65535);
 const launchReceiptSha256=hash(receiptBytes),helperSha256=hash(await fs.readFile(helperPath));
 const endpoint=`http://127.0.0.1:${receipt.cdp.port}`,expectedUrl=opened.target.expectedUrl;
 let session=null,inFlight=false,poisoned=false;
 const unchanged=async()=>{assert.equal(hash(await fs.readFile(await physical(receiptPath))),launchReceiptSha256,'Lifecycle receipt changed');assert.equal(hash(await fs.readFile(helperPath)),helperSha256,'Plan executor changed');};
 async function prove(){
  await unchanged();const proof=await connection.prove();
  assert.equal(proof?.client_ok,true);assert.equal(proof.clientIdentity?.pid,process.pid);assert.equal(proof.establishedPeerPair?.clientPid,process.pid);assert.equal(proof.targetId,connection.targetId);assert.equal(proof.exactUrl,expectedUrl);
  await unchanged();return proof;
 }
 const inspect=async()=>({ok:true,targetCount:1,exactUrl:expectedUrl,targetId:connection.targetId,driverRoute:NATIVE_PLAN_ROUTE,nativeProof:await prove()});
 async function execute(plan){
  assert.equal(inFlight,false,'Concurrent plans are prohibited');assert.equal(poisoned,false,'Timed-out executor cannot be reused');
  validateNativePlan(plan,{receiptPath,endpoint,expectedUrl});inFlight=true;
  const result={ok:false,targetCount:1,exactUrl:expectedUrl,targetId:connection.targetId,driverRoute:NATIVE_PLAN_ROUTE,proofCoverage:'before-plan-and-before-capture',results:[]};
  const observation=plan.observeRuntime===true?new NativePlanObservation():null,listeners=[],abort=new AbortController();let deadline=Date.now()+plan.timeoutMs,stepId=null,stopInterruptions,resultBytes=0;
  const timedOut=()=>{poisoned=true;abort.abort();return Object.assign(new Error('Native plan exceeded its deadline.'),{code:'PLAN_TIMEOUT'});};
  const bounded=async operation=>{const remaining=deadline-Date.now();if(remaining<=0)throw timedOut();let timer;try{return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(timedOut()),remaining);})]);}finally{clearTimeout(timer);}};
  const send=(method,params)=>bounded(()=>session.send(method,params));
  const evaluate=async expression=>{const response=await send('Runtime.evaluate',{expression,returnByValue:true});if(response.exceptionDetails)fail('EVALUATION_FAILED','Production expression raised an exception.');const value=response.result?.value??null;if(Buffer.byteLength(JSON.stringify(value))>2*1024*1024)fail('RESULT_TOO_LARGE','Evaluation exceeds result bound.');return value;};
  try{
   const nativeProof=await bounded(prove);
   resultBytes=Buffer.byteLength(JSON.stringify(result))+Buffer.byteLength(JSON.stringify(nativeProof))+32;
   if(resultBytes>RESULT_LIMIT-RESULT_DIAGNOSTIC_RESERVE)fail('RESULT_TOO_LARGE','Native proof exceeds whole-plan result bound.');
   result.nativeProof=nativeProof;
   if(!session)session=await bounded(()=>connection.createPageSession({signal:abort.signal}));
   if(observation){assert.equal(typeof connection.observeInterruptions,'function','Native interruption observation is required');stopInterruptions=connection.observeInterruptions(code=>observation.invalidate(code));for(const name of ['Runtime.consoleAPICalled','Runtime.exceptionThrown','Log.entryAdded']){const fn=params=>observation.observe(name,params);session.on(name,fn);listeners.push([name,fn]);}const crashed=()=>observation.invalidate('TARGET_CRASHED');session.on('Inspector.targetCrashed',crashed);listeners.push(['Inspector.targetCrashed',crashed]);}
   await send('Runtime.enable');if(observation){await send('Log.enable');observation.value.binding={helperSha256,launchReceiptSha256};observation.activate();}await send('Page.enable');
   for(const step of plan.steps){stepId=step.id;let value;
    if(step.op==='evaluate')value=await evaluate(step.expression);
    else if(step.op==='poll'){let attempts=0;for(;;){attempts++;value=await evaluate(step.expression);if(JSON.stringify(value)===JSON.stringify(step.equals))break;await bounded(()=>new Promise(resolve=>setTimeout(resolve,step.intervalMs)));}value={matched:true,attempts,value};}
    else if(['click','type'].includes(step.op))value=await evaluate(selectorExpression(step));
    else if(step.op==='emulate'){await send('Emulation.setDeviceMetricsOverride',{width:step.width,height:step.height,deviceScaleFactor:step.scale,mobile:step.mobile,screenWidth:step.width,screenHeight:step.height});await send('Emulation.setTouchEmulationEnabled',{enabled:step.touch,maxTouchPoints:1});value={width:step.width,height:step.height,scale:step.scale,mobile:step.mobile,touch:step.touch};}
    else if(step.op==='capture'){
     const destination=await validateNativeCapturePath(step.path,receipt);await bounded(prove);
     const startedAt=new Date().toISOString(),capture=await send('Page.captureScreenshot',{format:'png',fromSurface:true}),capturedAt=new Date().toISOString();
     if(typeof capture.data!=='string'||capture.data.length>64*1024*1024)fail('CAPTURE_TOO_LARGE','Missing or oversized PNG');
     const bytes=Buffer.from(capture.data,'base64');if(bytes.length>32*1024*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')fail('INVALID_CAPTURE','Invalid PNG');
     await unchanged();await validateNativeCapturePath(destination,receipt);await fs.writeFile(destination,bytes,{flag:'wx'});
     value={path:destination,bytes:bytes.length,sha256:hash(bytes),startedAt,capturedAt};
    }
    const row={id:step.id,op:step.op,value},rowBytes=Buffer.byteLength(JSON.stringify(row))+1;
    if(resultBytes+rowBytes>RESULT_LIMIT-RESULT_DIAGNOSTIC_RESERVE)fail('RESULT_TOO_LARGE','Whole-plan result exceeds 8 MiB.');
    result.results.push(row);resultBytes+=rowBytes;
   }
   await bounded(unchanged);result.ok=true;return result;
  }catch(error){result.code=error.code||'NATIVE_PLAN_FAILED';result.error=String(error.message).slice(0,4096);result.step=stepId;throw Object.assign(error,{helperCode:result.code,helperResult:result,step:stepId});}
  finally{if(observation)result.runtimeObservation=observation.finish(result.ok);stopInterruptions?.();if(session)for(const[name,fn]of listeners)session.off(name,fn);inFlight=false;}
 }
 return {execute,inspect,helperPath,driverRoute:NATIVE_PLAN_ROUTE};
}
