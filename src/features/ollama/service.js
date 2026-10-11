import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { OllamaClient,modelName,options,validatePayload,LIMITS } from './client.js';
import { OfficialCatalog,reconcile } from './catalog.js';
import { detectHardware,assessFit,modelEvidence } from './hardware.js';
import { ProfileManager } from './profiles.js';
export const OLLAMA_ACTIONS=Object.freeze(['status','catalog','refreshCatalog','models','show','deleteModel','copyModel','generate','hardware','cart','addToCart','removeFromCart','startPulls','cancel','retryPull','chat','sessions','session','renameSession','deleteSession','exportSession','profiles','preflight','launch','snapshots','restore']);
export function redactChat(text) {return text.replace(/(?:[A-Za-z]:[\\/]|\/home\/|\/Users\/)[^\s]+/g,'[private path]').replace(/\b(?:password|passwd|secret|api[_ -]?key|token|authorization)\s*[:=]\s*[^\s,;]+/gi,'[credential redacted]').replace(/\bBearer\s+\S+/gi,'[credential redacted]').replace(/\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]+\b/g,'[credential redacted]').replace(/\b[A-Z][A-Z_0-9]{2,}=[^\s]+/g,'[environment value redacted]');}
const HELP=Object.freeze({title:'Local Ollama recovery',steps:['Install the official Ollama desktop application with its verified platform installer if it is missing. Installation is never started automatically.','Open Ollama from your operating-system application launcher if the service is stopped. The local server must listen on 127.0.0.1:11434.','Choose Check runtime again. A successful version response confirms API health, not model compatibility.','If health fails, inspect the Ollama application logs using its own troubleshooting controls. No arbitrary command is required here.','Return to Model Store or Local chat after a successful check. Cached catalog, saved sessions, and profiles remain available offline.'],officialInstaller:'https://ollama.com/download',boundary:'This suite does not install, start, reconfigure, or expose Ollama over the network.'});
export function createOllamaService({dataDir,fetchImpl=fetch,hardwareProbe,profileLauncher,verifyExecutable,validateProfile,profileHealthCheck}={}) {
  if(!dataDir||!path.isAbsolute(dataDir))throw new Error('An absolute private data directory is required.');
  const client=new OllamaClient({fetchImpl}),catalogClient=new OfficialCatalog({fetchImpl}),profiles=new ProfileManager({launcher:profileLauncher,verifyExecutable,validateProfile,healthCheck:profileHealthCheck});
  const listeners=new Set(),operations=new Map(),metadataByTag=new Map();let catalog=null,cart=[],sessions=[],installed=[],running=[],hardware=null,loaded=false,reservingChat=false,saveQueue=Promise.resolve();
  const emit=e=>{for(const listener of listeners)try{listener(e);}catch{}};
  const persist=()=>{const value=JSON.stringify({version:1,catalog,cart,sessions});if(Buffer.byteLength(value)>32*1024*1024)throw new Error('Local state exceeds 32 MiB. Remove old sessions before continuing.');saveQueue=saveQueue.catch(()=>{}).then(async()=>{await fs.mkdir(dataDir,{recursive:true,mode:0o700});const temp=path.join(dataDir,'ollama-state.tmp');await fs.writeFile(temp,value,{mode:0o600});await fs.rename(temp,path.join(dataDir,'ollama-state.json'));});return saveQueue;};
  const load=async()=>{if(loaded)return;loaded=true;try{const file=path.join(dataDir,'ollama-state.json');if((await fs.stat(file)).size>32*1024*1024)throw new Error('Saved state is too large.');const s=JSON.parse(await fs.readFile(file,'utf8'));if(s.version===1){catalog=s.catalog;cart=Array.isArray(s.cart)?s.cart.slice(0,100).map(c=>({...c,state:c.state==='pulling'?'interrupted':c.state})):[];sessions=Array.isArray(s.sessions)?s.sessions.slice(0,100):[];}}catch(error){if(error.code!=='ENOENT')emit({type:'storage-warning',message:'Saved local state could not be read. The original file has been retained.'});}};
  const begin=async(kind,work)=>{if(operations.size>=4)throw new Error('Four operations are already active. Stop one before starting another.');const id=randomUUID(),controller=new AbortController();operations.set(id,{controller,kind});void Promise.resolve().then(()=>work(controller.signal,id)).then(result=>emit({type:'complete',operationId:id,result}),error=>emit({type:controller.signal.aborted?'cancelled':'error',operationId:id,message:controller.signal.aborted?'Operation cancelled.':error.message})).finally(()=>operations.delete(id));return {operationId:id,state:'started'};};
  const refreshModels=async()=>{const a=await client.call('installed');const b=await client.call('running');if(!Array.isArray(a.models)||!Array.isArray(b.models)||a.models.length>50000||b.models.length>50000)throw new Error('Invalid model inventory.');installed=a.models;running=b.models;return reconcile(catalog,installed,running);};
  const tagKnown=tag=>{modelName(tag);if(!reconcile(catalog,installed,running).some(v=>v.tag===tag))throw new Error('Select a verified catalog or installed tag first.');return tag;};
  const findSession=id=>{const s=sessions.find(s=>s.id===id);if(!s)throw new Error('Session not found.');return s;};
  const api={
    subscribe(listener){if(typeof listener!=='function')throw new Error('A listener is required.');listeners.add(listener);return ()=>listeners.delete(listener);},
    async registerPickedProfile(profile){return profiles.registerPicked(profile);},
    async request(action,p={}) {
      if(!OLLAMA_ACTIONS.includes(action))throw new Error('Unsupported suite action.');await load();
      if(!p||typeof p!=='object'||Array.isArray(p)||Buffer.byteLength(JSON.stringify(p))>LIMITS.request)throw new Error('Invalid suite payload.');
      switch(action){
        case 'status':try{const version=await client.call('version');if(typeof version.version!=='string'||!version.version)throw new Error('Invalid version response.');return {state:'healthy',version:version.version,help:HELP};}catch{return {state:'unavailable',diagnosis:'The local API is unreachable or unhealthy. Installation and stopped-service states cannot be distinguished without a host installation probe.',help:HELP};}
        case 'catalog':return {...(catalog||{variants:[],complete:false,lastSuccessfulRefresh:null}),ageMs:catalog?.lastSuccessfulRefresh?Date.now()-Date.parse(catalog.lastSuccessfulRefresh):null};
        case 'refreshCatalog':return begin('catalog',async(signal,id)=>{catalog=await catalogClient.refresh(catalog,{signal});await persist();emit({type:'catalog',operationId:id,catalog});return catalog;});
        case 'models':try{return {models:await refreshModels(),offline:false};}catch{return {models:reconcile(catalog,installed,running),offline:true};}
        case 'show':{const tag=tagKnown(p.model);const data=await client.call('show',{model:tag});metadataByTag.set(tag,data);const m=installed.find(m=>(m.name||m.model)===tag);if(m){m.capabilities=data.capabilities||[];m.details=data.details||m.details;m.model_info=data.model_info;}return data;}
        case 'deleteModel':{const tag=tagKnown(p.model);if(operations.size)throw new Error('Stop active operations before deleting a model.');if(p.confirmation!==tag)throw new Error('Confirm deletion with the exact model tag.');if(!installed.some(m=>(m.name||m.model)===tag))throw new Error('Select an installed model.');await client.call('delete',{model:tag});await refreshModels();return {deleted:tag};}
        case 'copyModel':{const source=tagKnown(p.model);if(!installed.some(m=>(m.name||m.model)===source))throw new Error('Select an installed model.');if(!['local-copy','local-copy-2','local-copy-3'].includes(p.slot))throw new Error('Select a registered copy destination.');const destination=source.split(':')[0]+':'+p.slot;if(installed.some(m=>(m.name||m.model)===destination))throw new Error('That destination already exists. Choose another copy slot.');await client.call('copy',{source,destination});await refreshModels();return {copied:destination};}
        case 'generate':{const model=tagKnown(p.model);if(!installed.some(m=>(m.name||m.model)===model))throw new Error('Select an installed model.');if(operations.size)throw new Error('Wait for the active operation first.');const body={model,prompt:p.prompt,system:p.system||'',options:p.options||{}};validatePayload('generate',body);const metadata=await client.call('show',{model});if(metadata.remote_host||metadata.remote_model)throw new Error('Choose a fully local model.');return begin('generate',async(signal,id)=>{let count=0;await client.call('generate',body,{signal,onChunk:v=>{const delta=v.response||'';if(typeof delta!=='string'||(count+=Buffer.byteLength(delta))>1024*1024)throw new Error('Response exceeded the 1 MiB text limit.');if(delta)emit({type:'generate',operationId:id,delta});}});return {model,generated:true};});}
        case 'hardware':hardware=await (hardwareProbe?hardwareProbe():detectHardware(dataDir));return {hardware,models:reconcile(catalog,installed,running).map(v=>{const evidence=modelEvidence(v,metadataByTag.get(v.tag));return {...v,fit:{...assessFit(evidence.model,hardware,evidence.context),assumptions:evidence.assumptions}};})};
        case 'cart':return cart;
        case 'addToCart':{const tag=tagKnown(p.model);if(cart.length>=100)throw new Error('Cart limit is 100 models.');if(!cart.some(c=>c.model===tag)){cart.push({model:tag,state:'queued',completed:0,total:null});await persist();}return cart;}
        case 'removeFromCart':if(cart.some(c=>c.model===p.model&&c.state==='pulling'))throw new Error('Cancel this pull before removing it.');cart=cart.filter(c=>c.model!==p.model);await persist();return cart;
        case 'retryPull':{const c=cart.find(c=>c.model===p.model);if(!c||!['failed','cancelled','interrupted'].includes(c.state))throw new Error('Select an interrupted or failed pull.');c.state='queued';await persist();return cart;}
        case 'startPulls':{if(operations.size||cart.some(c=>c.state==='pulling'))throw new Error('Wait for or cancel the active operation first.');if(!Number.isInteger(p.parallelism)||p.parallelism<1||p.parallelism>3||p.confirmNetwork!==true)throw new Error('Review the network transfer and choose parallelism from 1 to 3.');return begin('pulls',async(signal,id)=>{await refreshModels();let index=0;const queue=cart.filter(c=>c.state==='queued');await Promise.all(Array.from({length:p.parallelism},async()=>{while(index<queue.length&&!signal.aborted){const item=queue[index++];if(installed.some(m=>(m.name||m.model)===item.model)){item.state='skipped';continue;}item.state='pulling';await persist();try{await client.call('pull',{model:item.model},{signal,onChunk:v=>{item.status=v.status;item.completed=typeof v.completed==='number'?v.completed:0;item.total=typeof v.total==='number'?v.total:null;emit({type:'pull',operationId:id,item:{...item}});}});item.state='pulled';}catch(error){item.state=signal.aborted?'cancelled':'failed';item.error=signal.aborted?'Cancelled.':error.message;}await persist();emit({type:'pull',operationId:id,item:{...item}});}}));await persist();return {cart,success:cart.every(c=>['pulled','skipped'].includes(c.state))};});}
        case 'cancel':{const op=operations.get(p.operationId);if(!op)throw new Error('Operation is no longer active.');op.controller.abort();return {state:'cancelling'};}
        case 'sessions':return sessions.map(({messages,...s})=>({...s,messageCount:messages.length}));
        case 'session':return structuredClone(findSession(p.id));
        case 'renameSession':{const s=findSession(p.id);if(typeof p.name!=='string'||!p.name.trim()||p.name.length>100)throw new Error('Choose a session name of 1 to 100 characters.');s.name=p.name.trim();await persist();return {id:s.id,name:s.name};}
        case 'deleteSession':if([...operations.values()].some(o=>o.kind==='chat'))throw new Error('Stop the active response before deleting a session.');if(p.confirm!==true||p.confirmation!=='DELETE')throw new Error('Confirm session deletion by typing DELETE.');sessions=sessions.filter(s=>s.id!==p.id);await persist();return {deleted:true};
        case 'exportSession':{const s=findSession(p.id);return {format:'json',version:1,id:s.id,name:redactChat(s.name),model:s.model,createdAt:s.createdAt,messages:s.messages.map(m=>({role:m.role,content:redactChat(m.content),attachments:m.images?.length||0,interrupted:m.interrupted||false})),redacted:true,notice:'Automatic redaction cannot identify every secret. Review this local export before sharing. Image bytes and file metadata are always omitted.'};}
        case 'chat': {
          if(reservingChat || [...operations.values()].some(o=>o.kind==='chat'))throw new Error('Only one response can run at a time.');
          reservingChat=true;
          try {
            const model=tagKnown(p.model);
            if(!installed.some(m=>(m.name||m.model)===model))throw new Error('Pull the selected model before chatting.');
            options(p.options||{});
            if(typeof p.prompt!=='string'||!p.prompt.trim()||p.prompt.length>LIMITS.prompt||typeof(p.system||'')!=='string'||(p.system||'').length>LIMITS.prompt)throw new Error('Enter a bounded prompt and system instruction.');
            const userMessage={role:'user',content:p.prompt,...(p.images?.length?{images:p.images}:{})};
            validatePayload('chat',{model,messages:[userMessage],options:p.options||{}});
            if(Buffer.byteLength(JSON.stringify(sessions))+Buffer.byteLength(JSON.stringify(userMessage))>12*1024*1024)throw new Error('Chat history storage is full. Export and delete old sessions before continuing.');
            let s=p.sessionId?findSession(p.sessionId):null;
            if(s&&s.model!==model)throw new Error('Start a new session to change model.');
            const metadata=await client.call('show',{model});
            if(metadata.remote_host||metadata.remote_model)throw new Error('This model routes to a cloud service. Choose a fully local model.');
            if(p.images?.length&&!metadata.capabilities?.includes('vision'))throw new Error('The selected model does not report vision capability. Filter for a vision model.');
            if(!s){
              if(sessions.length>=100)throw new Error('Delete a session before creating another.');
              s={id:randomUUID(),name:'Local session '+(sessions.length+1),model,createdAt:new Date().toISOString(),messages:[]};sessions.push(s);
            }
            if(s.messages.length>=LIMITS.messages-2)throw new Error('Start a new session; this session reached the history limit.');
            const regenerate=p.regenerate===true&&s.messages.at(-1)?.role==='assistant';
            const messages=regenerate?s.messages.slice(0,-1):[...s.messages,userMessage];
            const requestBody={model,messages:[...(p.system?[{role:'system',content:p.system}]:[]),...messages].map(({role,content,images})=>({role,content,...(images?{images}:{})})),options:p.options||{}};
            validatePayload('chat',requestBody);
            s.messages=messages;await persist();
            return await begin('chat',async(signal,id)=>{
              let content='';
              try {
                await client.call('chat',requestBody,{signal,onChunk:v=>{
                  const delta=v.message?.content||'';
                  if(typeof delta!=='string'||Buffer.byteLength(content)+Buffer.byteLength(delta)>1024*1024)throw new Error('Response exceeded the 1 MiB text limit.');
                  content+=delta;if(delta)emit({type:'chat',operationId:id,sessionId:s.id,delta});
                }});
                s.messages.push({role:'assistant',content});await persist();return {sessionId:s.id};
              } catch(error) {
                if(content){s.messages.push({role:'assistant',content,interrupted:true});await persist();}throw error;
              }
            });
          } finally {reservingChat=false;}
        }
        case 'profiles':return [...profiles.profiles.values()];
        case 'preflight':{const tag=tagKnown(p.model),model=reconcile(catalog,installed,running).find(m=>m.tag===tag);return profiles.preflight(p.id,tag,assessFit(model,hardware||{}));}
        case 'launch':{const tag=tagKnown(p.model),model=reconcile(catalog,installed,running).find(m=>m.tag===tag);return profiles.launch(p.id,tag,assessFit(model,hardware||{}));}
        case 'snapshots':return profiles.snapshots;
        case 'restore':return profiles.restore(p.id);
      }
    },
    async dispose(){for(const op of operations.values())op.controller.abort();await saveQueue;listeners.clear();},
  };return api;
}
