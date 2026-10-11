import os from 'node:os';
import fs from 'node:fs/promises';
export async function detectHardware(directory) {
  let freeDiskBytes=null;try{const s=await fs.statfs(directory);freeDiskBytes=Number(s.bavail)*Number(s.bsize);}catch{}
  return {at:new Date().toISOString(),architecture:os.arch(),platform:os.platform(),ramBytes:os.totalmem(),availableRamBytes:os.freemem(),freeDiskBytes:null,applicationDataFreeBytes:freeDiskBytes,gpu:null,vramBytes:null,backendSupported:null,evidence:['Node operating-system memory and architecture','Application-data filesystem available blocks; actual Ollama model storage volume is not established','GPU and driver evidence unavailable; no GPU assumption']};
}
export function modelEvidence(model,metadata={},requestedContext=2048) {
  const info=metadata.model_info||{},architecture=info['general.architecture'];
  const count=info['general.parameter_count'],layers=info[`${architecture}.block_count`],heads=info[`${architecture}.attention.head_count`],kvHeads=info[`${architecture}.attention.head_count_kv`],embedding=info[`${architecture}.embedding_length`],declared=info[`${architecture}.context_length`];
  const valid=[layers,heads,kvHeads,embedding,declared,requestedContext].every(n=>Number.isSafeInteger(n)&&n>0)&&embedding%heads===0&&requestedContext<=declared;
  return {model:{...model,parameterCount:count||null,quantization:metadata.details?.quantization_level||null,contextLength:declared||null},context:{contextLength:requestedContext,contextBytes:valid?2*2*layers*kvHeads*(embedding/heads)*requestedContext:null},assumptions:valid?['F16 key/value cache: 2 bytes per element, key and value, all reported transformer layers. Additional allocator overhead is covered only by the weights safety allowance.']:['Architecture dimensions or declared context are unavailable; no context memory estimate.']};
}
export function assessFit(model,hardware,{contextLength=model.contextLength,contextBytes=null}={}) {
  const evidence={modelBytes:model.sizeBytes??null,parameterCount:model.parameterCount??null,quantization:model.quantization??null,contextLength:contextLength??null,contextBytes,hardware};
  const result=(verdict,reason)=>({verdict,reason,evidence,at:new Date().toISOString()});
  if(!Number.isFinite(model.sizeBytes)||model.sizeBytes<=0||!Number.isFinite(hardware?.freeDiskBytes))return result('Unknown','Exact model size or free destination storage is unavailable.');
  if(hardware.freeDiskBytes<model.sizeBytes*1.2)return result('Unlikely','Free destination storage is below the model size plus a 20% safety allowance.');
  if(!Number.isFinite(contextBytes)||contextBytes<0||!Number.isFinite(contextLength)||!model.parameterCount||!model.quantization||!Number.isFinite(hardware.availableRamBytes))return result('Unknown','Parameter, quantization, context-memory, or current RAM evidence is unavailable.');
  const need=model.sizeBytes*1.2+contextBytes;
  if(hardware.availableRamBytes<need)return result('Unlikely','Current available RAM is below weights, context, and safety allowance.');
  if(hardware.backendSupported!==true||!Number.isFinite(hardware.vramBytes))return result('Runs with limits','RAM is sufficient for the estimate; supported GPU/driver and usable VRAM are not verified. CPU performance is uncertain.');
  if(hardware.vramBytes<need)return result('Runs with limits','Estimated memory exceeds usable VRAM; partial CPU execution may be required.');
  return result('Runs well','Verified memory and supported backend meet the conservative estimate. This is not a speed guarantee.');
}
