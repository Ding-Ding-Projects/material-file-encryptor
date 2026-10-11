import {mountControlGuidance} from '../../../shared/surface/control-guidance.js';
import {PREPARATION_GUIDANCE,preparationTranslator} from './copy.js';

/** Preparation only. No action accepts license consent or starts an execution target. */
export function mountServerPreparation(host,services={}){
 const doc=host.ownerDocument,t=preparationTranslator(services.getLanguage),root=doc.createElement('section');root.className='server-preparation';host.append(root);
 let alive=true,epoch=0,busy=false,reading=false,dirty=false,snapshot=null,page=null,selected=null,message='',query='',queryGeneration=0;const mounted=[],life=[];
 const available=()=>alive&&host.isConnected!==false;
 const node=(tag,text)=>{const item=doc.createElement(tag);if(text)item.textContent=t(text);return item;};
 const request=(action,payload={})=>{if(!available()||typeof services.request!=='function')throw Error('The native preparation service is unavailable on this surface.');return services.request(action,payload);};
 function guidance(target,key,run,context=''){
  const row=PREPARATION_GUIDANCE.find(row=>row.key===key);const helpBase=services.guidanceHelpBase||'docs/features/server-manager/preparation.md';
  const module=mountControlGuidance(target,{descriptor:{...row,id:`server-preparation:${key}:${context}`,labelYue:t(row.label),sourceId:'docs/features/server-manager/preparation.md',concept:key,help:helpBase+'#'+key,steps:[row.purpose,row.validation]},t,run,validate:()=>{if(!available()||target.isConnected===false||target.disabled)throw Error(t('This action is no longer available.'));},registerHelp:services.registerHelp,registerCommands:services.registerCommands,openHelp:services.openGuidanceHelp,getDetails:()=>context?{provenance:context}:{} });mounted.push(()=>module.destroy());
 }
 function action(parent,label,key,operation,{disabled=false,reason='',context=''}={}){
  const button=node('md-outlined-button',label);button.type='button';button.disabled=disabled||typeof services.request!=='function';button.setAttribute('aria-label',t(label));if(reason)button.title=t(reason);parent.append(button);const generation=epoch;let flight=null;
  const click=()=>{if(!available()||generation!==epoch||button.disabled||flight)return;flight=Promise.resolve().then(operation);flight.catch(()=>{if(available()){message=t('The preparation action was not completed. Review source, capacity or recovery state before retrying.');render();}});flight.finally(()=>{flight=null;}).catch(()=>{});};button.addEventListener('click',click);mounted.push(()=>button.removeEventListener('click',click));
  guidance(button,key,async()=>{if(flight)throw Error(t('This action is no longer available.'));button.click();if(!flight||await flight!==true)throw Error(t('This action is no longer available.'));},context);return button;
 }
 async function transact(operation){if(busy||!available())return false;busy=true;try{const result=await operation();if(!available())return false;return result;}finally{busy=false;if(available())render();}}
 async function refreshState(){if(!available())return;if(reading){dirty=true;return;}reading=true;try{do{dirty=false;const result=await request('snapshot');if(!available())return;snapshot=result;}while(dirty&&available());render();}catch{if(available()){message=t('The native preparation service is unavailable on this surface.');render();}}finally{reading=false;}}
 async function refreshCatalogue(){return transact(async()=>{snapshot=await request('refreshCatalogue');if(!available())return false;selected=null;page=await request('versions',{catalogueId:snapshot.catalogue.sourceSha256,cursor:'0'});return true;});}
 function render(){
  if(!available())return;epoch++;queryGeneration++;mounted.splice(0).forEach(dispose=>dispose());root.replaceChildren();root.append(node('h2','Prepare a local Java server'),node('p','Preparation does not start a server.'),node('p','Start is unavailable: native supervision, compatible runtime, version-bound network configuration, resource limits and lease IPC remain unintegrated.'));
  const status=node('p');status.setAttribute('role','status');status.textContent=message;root.append(status);
  action(root,'Refresh official versions','refresh',refreshCatalogue,{disabled:busy,reason:busy?'Version details are being resolved.':''});
  const catalog=snapshot?.catalogue;
  if(!catalog?.sourceSha256)root.append(node('p','No verified catalogue is loaded. Refresh explicitly to contact the official source.'));
  else{
   for(const [label,value]of [['Source identity',catalog.sourceSha256],['Retrieved at',catalog.retrievedAt],['Available versions',catalog.total]]){const item=node('p');item.textContent=t(label)+': '+value;root.append(item);}root.append(node('p',catalog.state));
   if(!page||page.catalogueId!==catalog.sourceSha256){page=null;selected=null;}
  }
  if(page){
   const search=node('mfe-search');search.setAttribute('label',t('Search loaded versions'));search.setAttribute('scope','server-preparation-versions');search.language=services.getLanguage?.()||'en';root.append(search);search.query=query;if(search.input)search.input.value=query;
   const list=node('div');list.setAttribute('role','list');root.append(list);root.append(node('p','Search covers loaded versions only. Load more to inspect the complete catalogue.'));const rows=[],catalogueId=page.catalogueId,nextCursor=page.next;
   for(const version of page.versions){const row=node('div');row.setAttribute('role','listitem');list.append(row);rows.push({node:row,version});const choose=action(row,'Choose version','choose',()=>transact(async()=>{const result=await request('resolveVersion',{catalogueId,versionId:version.id});if(!available())return false;selected=result;return true;}),{disabled:busy,context:version.id});choose.textContent=t('Choose version')+': '+version.id;choose.setAttribute('aria-label',choose.textContent);row.append(node('p'));Array.from(row.children).at(-1).textContent=version.channel+' · '+version.releaseTime;}
   const filter=async()=>{query=search.query;const generation=++queryGeneration;const matches=await search.filter(rows.map(({version},index)=>({id:String(index),text:version.id+' '+version.channel})));if(!available()||generation!==queryGeneration||matches===null)return;const ids=new Set(matches.map(row=>row.id));rows.forEach((row,index)=>row.node.hidden=!ids.has(String(index)));};search.addEventListener('search-change',filter);mounted.push(()=>search.removeEventListener('search-change',filter));guidance(search,'search',()=>{search.input?.focus();return true;});
   action(root,'Clear version search','clear',()=>{if(search.input?.disabled||search.input?.readOnly||typeof search.emitChange!=='function')return false;search.query='';query='';if(search.input){search.input.value='';search.input.focus();}search.emitChange();return true;});
   if(page.next)action(root,'Load more versions','page',()=>transact(async()=>{const next=await request('versions',{catalogueId,cursor:nextCursor});if(!available())return false;page={...next,versions:[...page.versions,...next.versions]};return true;}),{disabled:busy});
  }
  if(selected){const details=node('section');root.append(details);details.append(node('p'));Array.from(details.children).at(-1).textContent=t('Selected version')+': '+selected.version;details.append(node('p'));Array.from(details.children).at(-1).textContent=t('Expected bytes')+': '+(selected.size??t('Unavailable'));
   if(!selected.preparable)details.append(node('p','Official metadata has no preparable server distribution, or it exceeds the one GiB preparation bound.'));
   action(details,'Prepare verified server files','prepare',()=>transact(async()=>{const result=await request('prepare',{selectionId:selected.selectionId});if(!available()||!result?.id)return false;await refreshState();return true;}),{disabled:busy||!selected.preparable||snapshot?.operations.some(item=>['admitting','downloading'].includes(item.status)),reason:!selected.preparable?'Official metadata has no preparable server distribution, or it exceeds the one GiB preparation bound.':''});
  }
  for(const operation of snapshot?.operations||[]){const card=node('article');root.append(card);const heading=node('h3');heading.textContent=operation.version;card.append(heading,node('p',operation.status));const progress=node('p');progress.textContent=t(operation.bytesVerified?'Verified SHA-256':'Received bytes, not yet verified')+': '+(operation.bytesVerified?operation.distributionSha256:operation.receivedBytes+' / '+operation.expectedBytes);card.append(progress,node('p','License remains unaccepted; eula=false.'));
   if(['admitting','downloading'].includes(operation.status))action(card,'Cancel preparation','cancel',async()=>{await request('cancel',{operationId:operation.id});await refreshState();return true;},{context:operation.id});
   if(operation.recoveryRequired)card.append(node('p','Retained owned files require explicit recovery. Nothing was deleted or adopted.'));
   if(operation.status==='prepared')action(card,'Review server license','license',async()=>{const contract=await request('reviewLicense',{serverId:operation.serverId});if(!available()||contract.url!=='https://www.minecraft.net/en-us/eula'||contract.accepted!==false)throw Error('Invalid license review.');const review=node('section');review.append(node('p','No license acceptance or server startup is provided by this workflow.'));const link=node('a','Read official EULA');link.href=contract.url;link.target='_blank';link.rel='noopener noreferrer';review.append(link);card.append(review);return true;},{context:operation.serverId});
  }
  root.append(node('p','Other execution targets remain unavailable.'));for(const label of ['Local container','SSH process','SSH container'])root.append(node('p',label));
 }
 if(services.subscribeLanguage){const off=services.subscribeLanguage(()=>{if(available())render();});if(typeof off==='function')life.push(off);}
 render();if(services.subscribe){const off=services.subscribe(()=>{void refreshState();});if(typeof off==='function')life.push(off);}void refreshState();
 return{refresh:refreshState,setLanguage(){render();},destroy(){if(!alive)return;alive=false;queryGeneration++;mounted.splice(0).forEach(dispose=>dispose());life.splice(0).forEach(dispose=>dispose());root.remove();}};
}
