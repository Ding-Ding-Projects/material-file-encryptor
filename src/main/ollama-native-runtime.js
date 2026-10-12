import {localEndpoint} from '../features/ollama/endpoint.js';

const phases=new Set(['idle','running','stopping','stopped','unavailable','unknown']);
const identity=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const count=value=>value===null||Number.isSafeInteger(value)&&value>=0&&value<=0xffffffff;
const settled=value=>value.leaseReleased&&value.activeProcesses===0&&(value.exitVerified||(value.phase==='stopped'&&value.processId===null));
function snapshot(value){
 if(!value||typeof value!=='object'||typeof value.available!=='boolean'||typeof value.startAvailable!=='boolean'||!phases.has(value.phase)||!(value.operationId===null||identity(value.operationId))||!count(value.processId)||!count(value.activeProcesses)||typeof value.exitVerified!=='boolean'||typeof value.leaseReleased!=='boolean')throw new Error('The native runtime returned an invalid ownership status.');
 return Object.freeze({available:value.available,startAvailable:value.startAvailable,operationId:value.operationId,phase:value.phase,processId:value.processId,activeProcesses:value.activeProcesses,exitVerified:value.exitVerified,leaseReleased:value.leaseReleased});
}
export function createManagedOllamaRuntimeAdapter({nativeRequest,loopbackPort=11434}={}){
 const endpoint=localEndpoint(loopbackPort),owners=new Map(),settlements=new Map();let closing=false,starting=null,closePending=null;
 const request=async(method,payload)=>{if(typeof nativeRequest!=='function')throw new Error('The native runtime ownership service is unavailable.');try{return snapshot(await nativeRequest(method,payload));}catch{throw new Error('The native runtime ownership operation could not complete.');}};
 return Object.freeze({
  async available(){if(closing||typeof nativeRequest!=='function')return false;try{const value=await request('managedOllama.status',{});return value.available&&value.startAvailable;}catch{return false;}},
  launch(){
   if(closing||owners.size||starting)return Promise.reject(new Error('Wait for the owned native runtime to settle before startup.'));
   starting=(async()=>{
   const value=await request('managedOllama.start',{port:Number(new URL(endpoint.url).port)});
   if(!identity(value.operationId))throw new Error('The native runtime did not return an owned operation identity.');
   const operationId=value.operationId;owners.set(operationId,value);
   let stopping=null,terminal=null;
   const handle=Object.freeze({managed:true,pid:value.processId,async isRunning(){const current=await request('managedOllama.status',{operationId});if(current.operationId!==operationId)throw new Error('The native runtime operation identity changed.');owners.set(operationId,current);return current.phase==='running'&&current.activeProcesses>0;},stop(){if(!owners.has(operationId))return Promise.resolve(terminal);if(stopping)return stopping;stopping=(async()=>{const current=await request('managedOllama.stop',{operationId});if(current.operationId!==operationId)throw new Error('The native runtime operation identity changed.');owners.set(operationId,current);if(!settled(current))throw new Error('The owned native process tree has not confirmed exit.');const closed=await request('managedOllama.close',{operationId});if(closed.operationId!==operationId||!settled(closed))throw new Error('The native runtime close remains unverified.');owners.delete(operationId);terminal=closed;return closed;})();settlements.set(operationId,stopping);return stopping.finally(()=>{settlements.delete(operationId);stopping=null;});}});
   if(closing||value.phase!=='running'||value.activeProcesses<1||!value.processId){await handle.stop();throw new Error('The owned native runtime did not start.');}return handle;
   })();const pending=starting;return pending.finally(()=>{if(starting===pending)starting=null;});
  },
  close(){closing=true;if(closePending)return closePending;closePending=(async()=>{if(starting)await starting.catch(()=>{});for(const operationId of [...owners.keys()]){if(settlements.has(operationId))await settlements.get(operationId).catch(()=>{});if(!owners.has(operationId))continue;const value=await request('managedOllama.close',{operationId});owners.set(operationId,value);if(value.operationId!==operationId||!settled(value))throw new Error('The owned native process tree remains active or unknown.');owners.delete(operationId);}})();return closePending.finally(()=>{closePending=null;});},
  get pending(){return owners.size+(starting?1:0);}
 });
}
