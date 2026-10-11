import {inspectImageAttachment} from './attachments.js';
import {localEndpoint} from './endpoint.js';
const ROUTES = Object.freeze({ version:['GET','/api/version'], installed:['GET','/api/tags'], running:['GET','/api/ps'], show:['POST','/api/show'], pull:['POST','/api/pull'], delete:['DELETE','/api/delete'], copy:['POST','/api/copy'], chat:['POST','/api/chat'], generate:['POST','/api/generate'] });
export const LIMITS = Object.freeze({ request: 6 * 1024 * 1024, response: 16 * 1024 * 1024, line: 1024 * 1024, messages: 128, prompt: 65536, images: 4, image: 1024 * 1024 });
export function modelName(value) {
  if (typeof value !== 'string' || value.length > 200 || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(value) || value.includes('..') || value.includes('//') || /(?:^|[-:])cloud(?:$|-)/i.test(value)) throw new Error('Select a valid local model tag. Cloud models are not supported.');
  return value;
}
export function options(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid model parameters.');
  const bounds = { temperature:[0,2], top_p:[0,1], top_k:[1,100], num_ctx:[512,131072], num_predict:[1,16384], seed:[0,2147483647], repeat_penalty:[0,2] };
  for (const [key,n] of Object.entries(value)) {
    if (!bounds[key] || typeof n !== 'number' || !Number.isFinite(n) || n < bounds[key][0] || n > bounds[key][1] || (!['temperature','top_p','repeat_penalty'].includes(key) && !Number.isInteger(n))) throw new Error(`Invalid parameter: ${key}`);
  }
  return value;
}
export function validatePayload(action, body) {
  const keys={version:[],installed:[],running:[],show:['model'],pull:['model'],delete:['model'],copy:['source','destination'],chat:['model','messages','options','keep_alive'],generate:['model','prompt','system','options','keep_alive']};
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k=>!keys[action].includes(k))) throw new Error('Unexpected request field.');
  const out={...body};
  for(const k of ['model','source','destination']) if(k in out) modelName(out[k]);
  if(['show','pull','delete','chat','generate'].includes(action) && !out.model) throw new Error('Select a model first.');
  if(action==='copy' && (!out.source || !out.destination)) throw new Error('Select a source and destination.');
  if(out.options) out.options=options(out.options);
  if('keep_alive' in out && ![0,'5m','10m'].includes(out.keep_alive)) throw new Error('Invalid keep-alive value.');
  for(const k of ['prompt','system']) if(k in out && (typeof out[k]!=='string' || out[k].length>LIMITS.prompt)) throw new Error('Prompt is too large.');
  if(action==='chat') {
    if(!Array.isArray(out.messages) || !out.messages.length || out.messages.length>LIMITS.messages) throw new Error('Chat history exceeds the supported limit.');
    for(const m of out.messages) {
      if(!m || Object.keys(m).some(k=>!['role','content','images'].includes(k)) || !['system','user','assistant'].includes(m.role) || typeof m.content!=='string' || m.content.length>LIMITS.prompt) throw new Error('Invalid chat message.');
      if(m.images && (!Array.isArray(m.images) || m.images.length>LIMITS.images || m.images.some(i=>typeof i!=='string' || i.length>LIMITS.image*4/3+4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(i)))) throw new Error('Invalid or oversized image attachment.');
      for(const image of m.images||[])inspectImageAttachment(image);
    }
  }
  if(['chat','generate','pull'].includes(action)) out.stream=true;
  if(Buffer.byteLength(JSON.stringify(out))>LIMITS.request) throw new Error('Request exceeds the supported limit.');
  return out;
}
export class OllamaClient {
  constructor({fetchImpl=fetch, timeout=120000,loopbackPort=11434}={}) { this.fetch=fetchImpl; this.timeout=timeout;Object.defineProperty(this,'endpoint',{value:localEndpoint(loopbackPort)}); }
  async call(action, body={}, {signal,onChunk}={}) {
    if(!Object.hasOwn(ROUTES,action)) throw new Error('Unsupported local API operation.');
    const data=validatePayload(action,body), [method,route]=ROUTES[action];
    const combined=signal ? AbortSignal.any([signal,AbortSignal.timeout(this.timeout)]) : AbortSignal.timeout(this.timeout);
    const response=await this.fetch(this.endpoint.url+route,{method,redirect:'error',signal:combined,headers:{'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(data)})});
    if(!response.ok) throw new Error(`Local Ollama returned HTTP ${response.status}. Use the runtime troubleshooter.`);
    if(!response.body) throw new Error('Local Ollama returned an empty response.');
    const reader=response.body.getReader(), decoder=new TextDecoder(); let text='', bytes=0, last={}, count=0;
    const streamed=['pull','chat','generate'].includes(action);
    const accept=line=>{if(Buffer.byteLength(line)>LIMITS.line)throw new Error('Local response line is too large.');let v;try{v=JSON.parse(line);}catch{throw new Error('Local Ollama returned malformed JSON.');}if(!v || typeof v!=='object'||Array.isArray(v))throw new Error('Invalid local response.');if(v.error)throw new Error('Ollama could not complete this operation. Check model compatibility and runtime status.');last=v;count++;onChunk?.(v);};
    try { while(true) { const part=await reader.read(); if(part.done)break; bytes+=part.value.byteLength;if(bytes>LIMITS.response)throw new Error('Local response exceeds the supported limit.');text+=decoder.decode(part.value,{stream:true});if(streamed){let i;while((i=text.indexOf('\n'))>=0){const line=text.slice(0,i).trim();text=text.slice(i+1);if(line)accept(line);}if(Buffer.byteLength(text)>LIMITS.line)throw new Error('Local response line is too large.');} } text+=decoder.decode();if(text.trim())accept(text.trim());if(!count)throw new Error('Local Ollama returned no data.');if(streamed && !(last.done===true || last.status==='success'))throw new Error('Ollama stream ended before completion.');return last; }
    finally { await reader.cancel().catch(()=>{}); }
  }
}
