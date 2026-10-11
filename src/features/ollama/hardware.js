import os from 'node:os';
import fs from 'node:fs/promises';
export async function detectHardware(directory) {
  let freeDiskBytes=null;try{const s=await fs.statfs(directory);freeDiskBytes=Number(s.bavail)*Number(s.bsize);}catch{}
  return {at:new Date().toISOString(),architecture:os.arch(),platform:os.platform(),ramBytes:os.totalmem(),availableRamBytes:os.freemem(),freeDiskBytes,gpu:null,vramBytes:null,backendSupported:null,evidence:['Node operating-system memory and architecture','Filesystem available blocks','GPU and driver evidence unavailable; no GPU assumption']};
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
