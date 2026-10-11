import {renderMarkdown} from '../documentation/markdown.js';
import {control} from '../../../shared/surface/controls.js';

export const PROVIDER_FORMAT_LIMITS=Object.freeze({characters:262144,lines:2048,lineLength:8192,nesting:16,linksPerLine:128});
const EMPTY_CATALOG=Object.freeze({documents:[],assets:[]});
function formattingWithinBounds(text){
 if(text.length>PROVIDER_FORMAT_LIMITS.characters)return false;
 const lines=text.split('\n');if(lines.length>PROVIDER_FORMAT_LIMITS.lines)return false;
 let details=0;
 for(const line of lines){
  if(line.length>PROVIDER_FORMAT_LIMITS.lineLength||(line.match(/\[/g)||[]).length>PROVIDER_FORMAT_LIMITS.linksPerLine)return false;
  if(/^\s*<details>\s*$/.test(line)&&++details>PROVIDER_FORMAT_LIMITS.nesting)return false;
  if(/^\s*<\/details>\s*$/.test(line))details=Math.max(0,details-1);
  if((line.match(/^\s*/)?.[0].length||0)>32||(line.match(/^(?:\s*>)+/)?.[0].match(/>/g).length||0)>PROVIDER_FORMAT_LIMITS.nesting)return false;
 }
 return true;
}
/** Provider text is untrusted data. The bundled renderer never interprets HTML. */
export function renderProviderText(host,value,{translate=s=>s,streaming=false}={}){
 const text=typeof value==='string'?value:'',doc=host.ownerDocument;
 host.replaceChildren();host.className='ollama-message-content';
 const plain=(message)=>{if(message){const note=doc.createElement('p');note.className='ollama-format-notice';note.textContent=translate(message);host.append(note);}const pre=doc.createElement('pre');pre.className='ollama-plain-response';pre.textContent=text;host.append(pre);};
 if(!text){const empty=doc.createElement('p');empty.className='ollama-empty-response';empty.textContent=translate(streaming?'Waiting for a local response.':'No response text was returned.');host.append(empty);return{mode:'empty'};}
 if(!formattingWithinBounds(text)){plain('Formatting limits reached. The complete response is shown as plain text.');return{mode:'plain'};}
 try{
  const providerTranslate=value=>translate(value==='Documentation table'?'Response table':value==='Linked content is not bundled.'?'Link unavailable':value);
  renderMarkdown(host,text,{catalog:EMPTY_CATALOG,source:'provider-response.md',headings:[],translate:providerTranslate,open(){}});
  // The documentation resolver admits only HTTP(S). Provider links additionally
  // reject embedded credentials, and provider content never receives an asset catalog.
  for(const link of host.querySelectorAll('a')){
   let safe=false;try{const url=new URL(link.href);safe=['https:','http:'].includes(url.protocol)&&!url.username&&!url.password;}catch{}
   if(!safe){const replacement=doc.createElement('span');replacement.textContent=link.textContent;link.replaceWith(replacement);}
   else{link.rel='noopener noreferrer nofollow';link.referrerPolicy='no-referrer';}
  }
  for(const image of host.querySelectorAll('img')){const fallback=doc.createElement('span');fallback.textContent=translate('Image unavailable');image.replaceWith(fallback);}
  for(const input of host.querySelectorAll('input'))input.replaceWith(control('input',{type:'checkbox',disabled:true,checked:input.checked,'aria-label':input.getAttribute('aria-label')||translate('Task status')},[],doc));
  return{mode:'markdown'};
 }catch{host.replaceChildren();plain('Formatting could not complete. The complete response is shown as plain text.');return{mode:'plain'};}
}

/** One bounded render timer and an operation identity own each streamed response. */
export function createProviderTranscript(host,{translate=s=>s,delay=60,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const doc=host.ownerDocument;let alive=true,generation=0,messages=[],active=null,timer=null,streamSessionId=null;
 const retired=new Set();
 const remember=id=>{if(!id)return;retired.add(id);if(retired.size>64)retired.delete(retired.values().next().value);};
 const stopTimer=()=>{if(timer!==null){clearTimer(timer);timer=null;}};
 const invalidate=()=>{generation++;stopTimer();remember(active?.operationId);active=null;host.setAttribute('aria-busy','false');};
 function paint(){
  if(!alive)return;host.replaceChildren();
  if(!messages.length){const empty=doc.createElement('p');empty.textContent=translate('No messages yet. Send a message to an installed local model.');host.append(empty);return;}
  for(const [index,message]of messages.entries()){
   const row=doc.createElement('section');row.className='ollama-message';row.dataset.role=message.role;
   const label=doc.createElement('h4');label.textContent=translate(message.role==='assistant'?'Local model':message.role==='user'?'You':'System');
   const content=doc.createElement('div');row.append(label,content);host.append(row);
   if(message.role==='assistant'){renderProviderText(content,message.content,{translate,streaming:!!active&&active.index===index});if(active?.index===index)active.contentNode=content;}
   else{content.className='ollama-message-content ollama-user-message';content.textContent=message.content;}
   if(message.state&&message.state!=='complete'){const state=doc.createElement('p');state.className='ollama-response-state';state.textContent=translate(message.state==='cancelled'?'Response stopped. Partial text is retained.':message.state==='error'?'Response did not complete. Partial text is retained.':'Generating locally.');row.append(state);}
  }
 }
 function schedule(){if(timer!==null)return;const expected=generation;timer=setTimer(()=>{timer=null;if(alive&&generation===expected&&active?.contentNode)renderProviderText(active.contentNode,messages[active.index].content,{translate,streaming:true});},delay);}
 function begin({kind='chat',prompt='',regenerate=false,reset=false}={}){
  if(!alive)return null;invalidate();streamSessionId=null;if(reset)messages=[];
  if(regenerate&&messages.at(-1)?.role==='assistant')messages.pop();
  if(!regenerate&&prompt)messages.push({role:'user',content:prompt});
  messages.push({role:'assistant',content:'',state:'streaming'});active={generation,kind,index:messages.length-1,operationId:null,pending:new Map()};host.setAttribute('aria-busy','true');paint();return generation;
 }
 function bind(ticket,id){
  if(!alive||!active||ticket!==generation||typeof id!=='string'||retired.has(id))return false;
  active.operationId=id;const pending=active.pending.get(id);active.pending.clear();
  if(pending){if(pending.delta)consume({type:active.kind,operationId:id,delta:pending.delta,sessionId:pending.sessionId});if(pending.terminal)consume(pending.terminal);}
  return true;
 }
 function consume(event){
  if(!alive||!active||typeof event?.operationId!=='string'||retired.has(event.operationId))return false;
  if(active.operationId&&active.operationId!==event.operationId)return false;
  if(event.type!==active.kind&&!['complete','error','cancelled'].includes(event.type))return false;
  // Events can beat the request response. Keep them isolated by ID until the
  // response authoritatively binds this view, rather than adopting the first ID.
  if(!active.operationId){
   if(!active.pending.has(event.operationId)&&active.pending.size>=4)return false;
   const pending=active.pending.get(event.operationId)||{delta:'',terminal:null,sessionId:null};
   if(event.type===active.kind){if(typeof event.delta!=='string'||pending.delta.length+event.delta.length>1048576)return false;pending.delta+=event.delta;}
   else pending.terminal=event;
   if(event.type==='chat'&&typeof event.sessionId==='string')pending.sessionId=event.sessionId;
   active.pending.set(event.operationId,pending);return false;
  }
  if(event.type===active.kind){if(typeof event.delta!=='string')return false;if(event.type==='chat'&&typeof event.sessionId==='string')streamSessionId=event.sessionId;messages[active.index].content+=event.delta;schedule();return true;}
  if(typeof event.result?.sessionId==='string')streamSessionId=event.result.sessionId;
  messages[active.index].state=event.type;remember(event.operationId);active=null;stopTimer();host.setAttribute('aria-busy','false');paint();return true;
 }
 function reject(ticket){if(!alive||!active||ticket!==generation)return;messages[active.index].state='error';remember(active.operationId);active=null;stopTimer();host.setAttribute('aria-busy','false');paint();}
 function setHistory(history=[]){if(!alive)return;invalidate();streamSessionId=null;messages=history.filter(message=>['user','assistant','system'].includes(message?.role)&&typeof message.content==='string').map(message=>({role:message.role,content:message.content}));paint();}
 paint();
 return{begin,bind,consume,reject,setHistory,clear(){setHistory([]);},destroy(){if(!alive)return;invalidate();alive=false;messages=[];host.replaceChildren();},get generation(){return generation;},get running(){return !!active;},get sessionId(){return streamSessionId;}};
}
