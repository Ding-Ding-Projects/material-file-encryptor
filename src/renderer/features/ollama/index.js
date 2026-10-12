import {ollamaCantonese} from './locales.js';
import { createRegexFilter } from './regex.js';
/** Local-only UI. The host supplies an authenticated request and event bridge. */
export function mountOllama(root,{services,translate=(s)=>s,confirm:confirmAction=async()=>false}={}) {
  const bridge=services?.ollama;if(!root||!bridge?.request)throw new Error('The authenticated local model bridge is required.');
  const t=translate, request=(action,p={})=>bridge.request(action,p);
  let models=[],cart=[],catalog={},sessions=[],profiles=[],hardware=null,selected=null,operation=null,sessionId=null,disposed=false;
  const regexFilter=createRegexFilter();let searchRevision=0;
  const elements={};const section=document.createElement('section');section.className='ollama-suite';section.setAttribute('aria-label',t('Local models'));root.append(section);
  const el=(tag,text,parent=section)=>{const e=document.createElement(tag);if(text)e.textContent=t(text);parent.append(e);return e;};
  const button=(text,parent,fn)=>{const b=el('button',text,parent);b.type='button';b.addEventListener('click',()=>safe(fn));return b;};
  const label=(text,type,parent)=>{const l=el('label',text,parent),input=el(type,null,l);return input;};
  const row=parent=>{const r=el('div',null,parent);r.className='ollama-row';return r;};
  const select=(text,values,parent)=>{const s=label(text,'select',parent);for(const [value,name] of values){const o=el('option',name,s);o.value=value;}return s;};
  const status=el('p','Check the local runtime to begin.');status.className='ollama-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const safe=async(fn)=>{try{await fn();}catch(error){status.textContent=error.message;}};
  const tabs=el('nav');tabs.setAttribute('aria-label',t('Local model sections'));
  const panels={};for(const name of ['Model Store','Pull cart','Local chat','Profiles','Help']){const p=el('article');p.hidden=name!=='Model Store';panels[name]=p;button(name,tabs,()=>{Object.entries(panels).forEach(([n,v])=>v.hidden=n!==name);});el('h3',name,p);}
  let runtimeState=null;
  const runtimePanel=createRuntimeInstallationPanel(panels['Model Store'],{request,configureRuntime:bridge.configureRuntime,confirm:confirmAction,getLanguage:()=>{const value=t('Local models');return value==='本機模型'?'yue':value.includes('本機模型')?'bilingual':'en';},onRuntime:value=>{runtimeState=value;registerProfileButton.disabled=!value.actions?.registerProfile;}});
  async function checkRuntime(){await runtimePanel.refresh();}
  const summary=el('p','No verified catalog is stored.',panels['Model Store']);
  const controls=row(panels['Model Store']);

  button('Refresh official catalog',controls,async()=>{const r=await request('refreshCatalog');operation=r.operationId;status.textContent=t('Refreshing all official model families and tags. Installed models remain available.');});
  button('Refresh installed models',controls,refresh);
  const search=label('Search models','input',panels['Model Store']);search.type='search';
  const filters=row(panels['Model Store']);
  const installedFilter=select('Installed state',[['all','All states'],['installed','Installed'],['running','Running'],['available','Available to pull']],filters);
  const capability=select('Capability',[['all','All capabilities'],['vision','Vision'],['tools','Tools'],['embedding','Embedding'],['thinking','Thinking']],filters);
  const fitFilter=select('Hardware fit',[['all','All verdicts'],['Runs well','Runs well'],['Runs with limits','Runs with limits'],['Unlikely','Unlikely'],['Unknown','Unknown']],filters);
  const sort=select('Sort',[['name','Name'],['size','Size']],filters);
  const familyFilter=label('Family','input',filters);familyFilter.type='search';
  const quantFilter=label('Quantization','input',filters);quantFilter.type='search';
  const regexDetails=el('details',null,panels['Model Store']);el('summary','Regular expression builder',regexDetails);
  const regexMode=select('Search mode',[['plain','Plain text'],['regex','Regular expression']],regexDetails);
  const anchor=select('Match location',[['any','Anywhere'],['start','Starts with'],['exact','Exact match']],regexDetails);
  el('p','Regex searches run in a disposable worker with a 150 ms deadline, a 128-character pattern limit, and a 4 MiB text limit.',regexDetails);
  const list=el('div',null,panels['Model Store']);list.className='ollama-list';
  const detail=el('div',null,panels['Model Store']);
  async function renderModels(){
    const revision=++searchRevision;regexFilter.cancel();
    const query=search.value.toLowerCase();
    let filtered=models.filter(m=>(installedFilter.value==='all'||(installedFilter.value==='available'?!m.installed:m[installedFilter.value]))&&(capability.value==='all'||m.capabilities?.includes(capability.value))&&(fitFilter.value==='all'||(m.fit?.verdict||'Unknown')===fitFilter.value)&&(!familyFilter.value||m.family?.toLowerCase().includes(familyFilter.value.toLowerCase()))&&(!quantFilter.value||m.quantization?.toLowerCase().includes(quantFilter.value.toLowerCase())));
    const text=m=>[m.tag,m.family,m.variant,m.quantization,m.description].join(' ');
    if(query&&regexMode.value==='regex'){
      // Do not leave rows from a previous query actionable while an expression
      // is pending, invalid or timed out.
      list.replaceChildren();status.textContent=t('Searching in an isolated worker.');
      try {const matches=await regexFilter.filter(query,filtered.map(text),anchor.value);if(disposed||revision!==searchRevision)return;filtered=matches.map(i=>filtered[i]);}
      catch(error){if(!disposed&&revision===searchRevision){list.replaceChildren();status.textContent=t(error.message);}return;}
    }else if(query)filtered=filtered.filter(m=>text(m).toLowerCase().includes(query));
    if(disposed||revision!==searchRevision)return;
    filtered.sort(sort.value==='size'?(a,b)=>(a.sizeBytes??Infinity)-(b.sizeBytes??Infinity):(a,b)=>a.tag.localeCompare(b.tag));list.replaceChildren();
    el('p',`${filtered.length} ${t('matching variants')}`,list);
    for(const m of filtered.slice(0,200)){const b=button(`${m.tag} · ${m.installed?t('Installed'):t('Available')} · ${m.fit?.verdict||t('Unknown')} · ${m.sizeBytes?formatBytes(m.sizeBytes):t('Size unknown')}`,list,()=>showModel(m));b.className='ollama-model';}
    if(filtered.length>200)el('p','Refine the search to show more variants. All variants are included in filtering.',list);
  }
  for(const control of [search,installedFilter,capability,fitFilter,sort,familyFilter,quantFilter,regexMode,anchor])control.addEventListener('input',()=>safe(renderModels));
  async function showModel(m){selected=m;detail.replaceChildren();el('h4',m.tag,detail);el('p',m.description||'Official variant; detailed metadata is available after installation.',detail);el('p',`${t('Context')}: ${m.contextLength??t('Unknown')} · ${t('Quantization')}: ${m.quantization??t('Unknown')} · ${t('Parameters')}: ${m.parameterCount??t('Unknown')}`,detail);el('p',m.fit?.reason||'Hardware fit is unknown. Refresh hardware evidence before deciding.',detail);button('Add to pull cart',detail,async()=>{cart=await request('addToCart',{model:m.tag});renderCart();status.textContent=t('Added to local pull cart. No download has started.');});const inspect=button('Inspect installed metadata',detail,async()=>{const data=await request('show',{model:m.tag});m.capabilities=data.capabilities||[];m.quantization=data.details?.quantization_level;m.parameterCount=data.details?.parameter_size;el('pre',JSON.stringify({capabilities:m.capabilities,details:data.details,modelInfo:data.model_info},null,2),detail);});inspect.disabled=!m.installed;inspect.title=m.installed?'':t('Pull this model first to inspect local metadata.');
    if(m.installed){const slot=select('Copy destination',[['local-copy',m.family+':local-copy'],['local-copy-2',m.family+':local-copy-2'],['local-copy-3',m.family+':local-copy-3']],detail);button('Copy installed model',detail,async()=>{await request('copyModel',{model:m.tag,slot:slot.value});await refresh();status.textContent=t('Model copy created.');});button('Delete installed model',detail,async()=>{if(!await confirmAction({title:t('Delete installed model?'),message:m.tag,destructive:true,requiredText:m.tag}))return;await request('deleteModel',{model:m.tag,confirmation:m.tag});detail.replaceChildren();await refresh();status.textContent=t('Installed model removed.');});}
  }
  const hardwareEvidence=el('pre',null,panels['Model Store']);
  button('Refresh hardware evidence',panels['Model Store'],async()=>{const h=await request('hardware');hardware=h.hardware;models=h.models;hardwareEvidence.textContent=JSON.stringify(hardware,null,2);renderModels();status.textContent=t('Hardware evidence refreshed. Missing GPU or context evidence remains unknown.');});
  const transfer=el('p','Pulls download model data from Ollama. They consume network transfer and local storage. No download starts until you confirm.',panels['Pull cart']);
  const parallelism=select('Parallel downloads',[['1','1 (recommended)'],['2','2'],['3','3']],panels['Pull cart']);
  const cartList=el('div',null,panels['Pull cart']);
  function renderCart(){cartList.replaceChildren();let total=0,unknown=false;for(const c of cart){const model=models.find(m=>m.tag===c.model);if(model?.sizeBytes)total+=model.sizeBytes*1.2;else unknown=true;const r=row(cartList);el('span',`${c.model}: ${c.state} · ${formatBytes(c.completed||0)} / ${c.total?formatBytes(c.total):t('Unknown')}`,r);button('Remove',r,async()=>{cart=await request('removeFromCart',{model:c.model});renderCart();});if(['failed','cancelled','interrupted'].includes(c.state))button('Retry',r,async()=>{cart=await request('retryPull',{model:c.model});renderCart();});}transfer.textContent=`${t('Estimated additional storage')}: ${formatBytes(total)}${unknown?' + '+t('unknown variants'):''}. ${t('Free space')}: ${hardware?.freeDiskBytes?formatBytes(hardware.freeDiskBytes):t('Unknown')}. ${t('Pulls download model data and consume network transfer.')}`;}
  button('Review and start pulls',panels['Pull cart'],async()=>{if(!await confirmAction({title:t('Download selected models?'),message:transfer.textContent,destructive:false}))return;const r=await request('startPulls',{parallelism:Number(parallelism.value),confirmNetwork:true});operation=r.operationId;status.textContent=t('Downloads started.');});
  button('Cancel active operation',panels['Pull cart'],()=>operation?request('cancel',{operationId:operation}):Promise.reject(new Error(t('No active operation.'))));
  const chatPanel=panels['Local chat'];
  const modelSelect=select('Installed model',[],chatPanel),sessionSelect=select('Saved session',[['','New session']],chatPanel);
  sessionSelect.addEventListener('change',()=>safe(async()=>{sessionId=sessionSelect.value||null;if(!sessionId){output.textContent='';return;}const s=await request('session',{id:sessionId});modelSelect.value=s.model;sessionName.value=s.name;output.textContent=s.messages.map(m=>`${m.role}: ${m.content}`).join('\n\n');}));
  const sessionName=label('Session name','input',chatPanel);sessionName.maxLength=100;
  const sessionActions=row(chatPanel);button('Rename',sessionActions,async()=>{await request('renameSession',{id:sessionId,name:sessionName.value});await refreshSessions();});
  button('Delete session',sessionActions,async()=>{if(!sessionId)throw new Error(t('Select a session first.'));if(!await confirmAction({title:t('Delete local session permanently?'),message:t('All messages in this session will be removed.'),destructive:true,requiredText:'DELETE'}))return;await request('deleteSession',{id:sessionId,confirm:true,confirmation:'DELETE'});sessionId=null;await refreshSessions();output.textContent='';});
  button('Export redacted session',sessionActions,async()=>{const result=await request('exportSession',{id:sessionId});const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='local-chat-redacted.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  const system=label('System instruction','textarea',chatPanel);system.maxLength=65536;
  const parameters=row(chatPanel),temperature=label('Temperature (recommended 0.7)','input',parameters);temperature.type='number';temperature.min='0';temperature.max='2';temperature.step='.1';temperature.value='.7';
  const context=select('Context limit',[['2048','2048 (recommended)'],['4096','4096'],['8192','8192']],parameters),length=select('Response limit',[['512','512'],['1024','1024 (recommended)'],['2048','2048']],parameters);length.value='1024';
  const prompt=label('Message','textarea',chatPanel);prompt.maxLength=65536;
  const attachment=label('Image attachments','input',chatPanel);attachment.type='file';attachment.accept='image/png,image/jpeg,image/webp';attachment.multiple=true;attachment.disabled=true;attachment.title=t('Select and inspect an installed vision model to enable image attachments.');
  modelSelect.addEventListener('change',()=>safe(async()=>{attachment.disabled=true;const m=await request('show',{model:modelSelect.value});attachment.disabled=!m.capabilities?.includes('vision');attachment.title=attachment.disabled?t('This model does not report vision capability. Filter Model Store by Vision and pull a compatible model.'):'Up to 4 images, 1 MB each.';}));
  const output=el('div',null,chatPanel);output.className='ollama-output';output.setAttribute('role','log');output.setAttribute('aria-live','polite');
  async function send(regenerate=false){const files=[...attachment.files];if(files.length>4||files.some(f=>f.size>1024*1024))throw new Error(t('Choose up to four images, each at most 1 MB.'));const images=await Promise.all(files.map(f=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(f);})));const r=await request('chat',{model:modelSelect.value,prompt:prompt.value,system:system.value,sessionId,options:{temperature:Number(temperature.value),num_ctx:Number(context.value),num_predict:Number(length.value)},images,regenerate});operation=r.operationId;output.textContent='';status.textContent=t('Generating locally.');}
  const sendRow=row(chatPanel);button('Send',sendRow,()=>send());button('Regenerate',sendRow,()=>send(true));button('Stop',sendRow,()=>request('cancel',{operationId:operation}));
  button('Generate a single response',sendRow,async()=>{const r=await request('generate',{model:modelSelect.value,prompt:prompt.value,system:system.value,options:{temperature:Number(temperature.value),num_ctx:Number(context.value),num_predict:Number(length.value)}});operation=r.operationId;output.textContent='';});
  const profileSelect=select('Registered profile',[],panels.Profiles),profilePreview=el('pre',null,panels.Profiles);
  const recipe=select('Native profile recipe',[['version','Ollama version check'],['models','Installed model list'],['inspect','Model metadata inspection']],panels.Profiles);
  const registerProfileButton=button('Register profile with native pickers',panels.Profiles,async()=>{await request('registerProfile',{recipe:recipe.value});await refresh();});registerProfileButton.disabled=true;

  button('Preflight selected model',panels.Profiles,async()=>{profilePreview.textContent=JSON.stringify(await request('preflight',{id:profileSelect.value,model:selected?.tag||modelSelect.value}),null,2);});
  button('Launch reviewed profile',panels.Profiles,async()=>{const model=selected?.tag||modelSelect.value;const preview=await request('preflight',{id:profileSelect.value,model});profilePreview.textContent=JSON.stringify(preview,null,2);if(!preview.ready)throw new Error(preview.blockers.join(' '));if(!await confirmAction({title:t('Launch selected profile?'),message:JSON.stringify(preview),destructive:false}))return;const r=await request('launch',{id:profileSelect.value,model});status.textContent=r.state;if(r.internal==='local-chat')Object.entries(panels).forEach(([n,p])=>p.hidden=n!=='Local chat');});
  const snapshots=select('Configuration snapshot',[],panels.Profiles);button('Refresh snapshots',panels.Profiles,async()=>{snapshots.replaceChildren();for(const s of await request('snapshots')){const o=el('option',s.at,snapshots);o.value=s.id;}});button('Restore selected snapshot',panels.Profiles,async()=>{await request('restore',{id:snapshots.value});status.textContent=t('Profile snapshot restored.');});
  for(const text of ['This suite uses only the configured loopback Ollama API. No cloud model account is used.','Use Install managed Ollama runtime to download and verify the official command-line runtime. Installation does not start it or download a model. Use Start verified local runtime separately.','Catalog offline: use the last successful catalog and installed models. A refresh that loses a family, tag, or page does not replace the previous catalog.','Pull failed: check available storage and connectivity, then retry the individual item. Completed models are retained.','Model incompatible: inspect its declared capabilities and select another installed model. GPU, driver, or context evidence that cannot be verified is shown as Unknown.','External profiles require a host-provided executable picker, allowlist, and readiness verifier. No freeform shell commands or environment values are accepted.','Session exports redact recognized credentials, environment values, and private paths, and omit image bytes. Review the export locally before sharing because automatic redaction cannot identify every secret.'])el('p',text,panels.Help);
  async function refreshSessions(){sessions=await request('sessions');sessionSelect.replaceChildren();const n=el('option','New session',sessionSelect);n.value='';for(const s of sessions){const o=el('option',s.name,sessionSelect);o.value=s.id;}sessionSelect.value=sessionId||'';}
  async function refresh(){const results=await Promise.all([request('models'),request('catalog'),request('profiles'),request('cart')]);if(disposed)return;models=results[0].models;catalog=results[1];profiles=results[2];cart=results[3];summary.textContent=catalog.lastSuccessfulRefresh?`${t('Last successful refresh')}: ${catalog.lastSuccessfulRefresh} · ${catalog.familyCount} ${t('families')} · ${catalog.variants.length} ${t('variants')} · ${catalog.pageCount} ${t('pages')} · ${catalog.stale?t('Stale'):t('Verified refresh')} · ${t('Global completeness unknown')}`:t('No complete official catalog has been stored. Refresh the official catalog to discover models.');modelSelect.replaceChildren();for(const m of models.filter(m=>m.installed)){const o=el('option',m.tag,modelSelect);o.value=m.tag;}profileSelect.replaceChildren();for(const p of profiles){const o=el('option',p.name,profileSelect);o.value=p.id;}renderModels();renderCart();await refreshSessions();}
  const unsubscribe=bridge.subscribe?.(event=>{if(disposed)return;if(event.type==='runtime-installation'){runtimePanel.consume(event.installation);return;}if(event.type==='chat'){sessionId=event.sessionId;output.textContent+=event.delta;}if(event.type==='generate')output.textContent+=event.delta;if(event.type==='pull'){const i=cart.findIndex(c=>c.model===event.item.model);if(i>=0)cart[i]=event.item;else cart.push(event.item);renderCart();}if(['complete','error','cancelled'].includes(event.type)){operation=null;status.textContent=event.message||t('Operation finished. Review its outcome.');safe(refresh);}if(event.type==='catalog'){catalog=event.catalog;safe(refresh);}});
  safe(refresh);void runtimePanel.refresh();
  return {refresh,setLanguage(){runtimePanel.refreshLabels();},destroy(){disposed=true;runtimePanel.destroy();searchRevision++;regexFilter.dispose();unsubscribe?.();section.remove();}};
}
function formatBytes(n){if(!Number.isFinite(n))return 'Unknown';if(n<1024)return `${n} B`;const unit=Math.min(Math.floor(Math.log(n)/Math.log(1024)),4);return `${(n/1024**unit).toFixed(1)} ${['B','KiB','MiB','GiB','TiB'][unit]}`;}


let runtimePanelSequence=0;
const INSTALL_PHASES=['idle','checking','awaiting-consent','downloading','verifying','extracting','registering','checking-installation','complete'];
const INSTALL_COPY={idle:'Ready to inspect installation.',checking:'Checking installation requirements.','awaiting-consent':'Waiting for installation confirmation.',downloading:'Downloading the official runtime.',verifying:'Verifying the complete runtime archive.',extracting:'Preparing the complete runtime files.',registering:'Registering the verified runtime. Cancellation is no longer available.','checking-installation':'Checking the installed runtime.',complete:'Installation finished.'};
const INSTALL_OUTCOMES={'installed-stopped':'Managed runtime installation completed.',cancelled:'Installation cancelled. Any previously verified runtime is retained.',failed:'Installation did not complete.',unavailable:'Managed installation is unavailable.'};
/** Actual runtime region, also exercised by the synthetic DOM tests. */
export function createRuntimeInstallationPanel(parent,{request,configureRuntime,confirm=async()=>false,getLanguage=()=> 'en',onRuntime=()=>{}}={}){
 const doc=parent.ownerDocument||document,region=doc.createElement('section');region.className='ollama-runtime';region.setAttribute('aria-label','Local runtime');parent.append(region);
 let disposed=false,runtime=null,snapshot=null,pending=false,cancelling=false,revision=0,notice='',poll=null,restoring=false,startupResult=null,stopNotice='',runtimeRequestRevision=0;const retired=new Set(),labels=[];
 const language=()=>{const value=getLanguage();return ['en','yue','bilingual'].includes(value)?value:'en';};
 const text=(node,en)=>{node.replaceChildren();const yue=ollamaCantonese[en]||en,mode=language();const primary=doc.createElement('span');primary.textContent=mode==='yue'?yue:en;node.append(primary);if(mode==='bilingual'&&yue!==en){const secondary=doc.createElement('span');secondary.className='ollama-secondary';secondary.lang='yue-Hant';secondary.textContent=yue;node.append(secondary);}};
 const named=(tag,en,host=region)=>{const node=doc.createElement(tag);host.append(node);labels.push([node,en]);text(node,en);return node;};
 const heading=named('h4','Local runtime');heading.tabIndex=-1;
 named('p','Install a verified, application-managed copy of the official Ollama command-line runtime. No model is downloaded, no existing process is stopped, and the runtime is not started.');
 const state=doc.createElement('p');state.className='ollama-runtime-state';state.setAttribute('role','status');state.setAttribute('aria-live','polite');state.setAttribute('aria-atomic','true');region.append(state);
 const health=doc.createElement('p');health.className='ollama-runtime-health';health.setAttribute('role','status');health.setAttribute('aria-live','polite');region.append(health);
 const startupDiagnostic=doc.createElement('p');startupDiagnostic.className='ollama-runtime-startup-diagnostic';startupDiagnostic.setAttribute('role','status');region.append(startupDiagnostic);
 const stopDiagnostic=doc.createElement('p');stopDiagnostic.className='ollama-runtime-stop-diagnostic';stopDiagnostic.setAttribute('role','status');region.append(stopDiagnostic);
 const metadata=doc.createElement('p');metadata.className='ollama-runtime-metadata';region.append(metadata);
 const progress=doc.createElement('md-linear-progress');progress.setAttribute('aria-label','Runtime installation progress');progress.hidden=true;region.append(progress);
 const bytes=doc.createElement('p');region.append(bytes);
 const actions=doc.createElement('div');actions.className='ollama-runtime-actions';region.append(actions);
 const active=()=>snapshot&&snapshot.phase!=='idle'&&snapshot.phase!=='complete';
 const invoke=(name,fn,primary=false)=>{const button=named(primary?'md-filled-button':'md-outlined-button',name,actions);button.type='button';button.addEventListener('click',()=>{if(!button.disabled&&!disposed)void fn().catch(()=>{if(!disposed){notice='The runtime request could not be completed. Check runtime before retrying.';paint();}});});return button;};
 const install=invoke('Install managed Ollama runtime',async()=>{
  if(pending||active())return;pending=true;runtimeRequestRevision++;notice='';paint();
  try{const result=await request('runtimeInstall',{confirmed:true,language:language()});if(!disposed)consume(result,true);}
  catch{if(!disposed)notice='The runtime request could not be completed. Check runtime before retrying.';}
  finally{pending=false;if(!disposed){paint();void refresh();}}
 },true);
 const cancel=invoke('Cancel installation',async()=>{if(!snapshot?.cancellable||cancelling)return;cancelling=true;notice='';paint();const id=snapshot.operationId;try{const result=await request('runtimeInstallCancel',{operationId:id});if(!disposed&&snapshot?.operationId===id)consume(result);}finally{cancelling=false;if(!disposed)paint();}});
 const check=invoke('Check runtime',refresh);
 const start=invoke('Start verified local runtime',async()=>{if(pending||active())return;pending=true;runtimeRequestRevision++;startupResult=null;stopNotice='';notice='';paint();try{if(await confirm({title:local('Start the verified local runtime?'),message:local('Starts the verified Ollama executable with a loopback-only address and cloud features disabled. No model will be downloaded.'),destructive:false})){const result=await request('runtimeStart',{confirmed:true,language:language()});if(disposed)return;startupResult=result;await refresh();}}catch(error){if(!disposed){startupResult={state:'unavailable',next:error?.code==='USER_CANCELLED'?'Runtime startup was cancelled. No process was started.':'Runtime startup could not complete. Check runtime before retrying.'};await refresh();}}finally{pending=false;if(!disposed)paint();}});
 const startReason=doc.createElement('p');startReason.id='ollama-start-reason-'+(++runtimePanelSequence);startReason.className='ollama-runtime-start-reason';region.append(startReason);start.setAttribute('aria-describedby',startReason.id);
 const stop=invoke('Stop owned runtime',async()=>{
  if(pending||active()||runtime?.ownedManaged!==true||runtime?.actions?.stop!==true)return;
  pending=true;runtimeRequestRevision++;stopNotice='Stopping the owned runtime. Waiting for verified exit.';notice='';paint();
  try{const result=await request('runtimeStop',{confirmed:true,language:language()});if(disposed)return;
   if(result?.state!=='stopped'||result.ownedManaged!==false||result.exitVerified!==true||result.leaseReleased!==true)throw Error('Unverified stop result');
   stopNotice='Owned runtime stopped. Native exit and lease release were verified.';await refresh();
  }catch(error){if(!disposed){stopNotice=error?.code==='USER_CANCELLED'?'Runtime stop was cancelled. Ownership remains with the host.':'Owned runtime stop is unverified. The host retains unresolved ownership. Check runtime before retrying.';await refresh();}}
  finally{pending=false;if(!disposed)paint();}
 });
 const stopReason=doc.createElement('p');stopReason.id='ollama-stop-reason-'+(++runtimePanelSequence);stopReason.className='ollama-runtime-stop-reason';region.append(stopReason);stop.setAttribute('aria-describedby',stopReason.id);
 const locate=invoke('Locate installed runtime',async()=>{if(pending||active())return;pending=true;runtimeRequestRevision++;paint();try{await request('chooseRuntimeExecutable');await refresh();}finally{pending=false;if(!disposed)paint();}});
 const advanced=doc.createElement('div');advanced.id='ollama-runtime-connection-'+(++runtimePanelSequence);advanced.hidden=true;
 const connectionToggle=named('md-outlined-button','Connection settings');connectionToggle.type='button';connectionToggle.setAttribute('aria-controls',advanced.id);connectionToggle.setAttribute('aria-expanded','false');connectionToggle.addEventListener('click',()=>{if(disposed)return;advanced.hidden=!advanced.hidden;connectionToggle.setAttribute('aria-expanded',String(!advanced.hidden));});region.append(advanced);
 const connection=doc.createElement('div');connection.className='ollama-runtime-actions';advanced.append(connection);
 const port=doc.createElement('md-outlined-text-field');port.type='number';port.min='1024';port.max='65535';port.value='11434';connection.append(port);
 const apply=named('md-outlined-button','Apply runtime port',connection);apply.type='button';apply.addEventListener('click',()=>{if(apply.disabled)return;void(async()=>{const value=Number(port.value);if(!Number.isInteger(value)||value<1024||value>65535){notice='Choose a port from 1024 to 65535.';paint();return;}pending=true;runtimeRequestRevision++;paint();try{await configureRuntime({port:value});await refresh();}catch{notice='The runtime request could not be completed. Check runtime before retrying.';}finally{pending=false;if(!disposed)paint();}})();});
 function local(en){const yue=ollamaCantonese[en]||en;return language()==='yue'?yue:language()==='bilingual'&&yue!==en?en+' · '+yue:en;}
 function paint(){if(disposed)return;const working=active(),locked=pending||working;const previous=doc.activeElement;
  text(install,snapshot&&['failed','cancelled'].includes(snapshot.outcome)?'Retry managed installation':'Install managed Ollama runtime');
  install.disabled=locked||!runtime?.actions?.install||snapshot?.installed===true;
  cancel.disabled=!working||!snapshot.cancellable||cancelling;check.disabled=pending;start.disabled=locked||!runtime?.actions?.start;stop.disabled=locked||runtime?.ownedManaged!==true||runtime?.actions?.stop!==true;locate.disabled=locked||!runtime?.actions?.selectExecutable;apply.disabled=locked||typeof configureRuntime!=='function';port.disabled=locked;
  text(cancel,cancelling?'Stopping installation…':'Cancel installation');
  const message=notice||(cancelling?'Stopping installation…':working?INSTALL_COPY[snapshot.phase]:snapshot?.outcome?INSTALL_OUTCOMES[snapshot.outcome]:runtime?'Ready to inspect installation.':'Checking local runtime.');text(state,message);
  const healthMessage=!runtime?'Runtime status is unknown. Check runtime.':runtime.state==='healthy'?'The configured local API is responding.':runtime.state==='stopped'?'The detected runtime is stopped.':runtime.state==='missing'?'No local runtime was detected.':runtime.state==='unhealthy'?'The local runtime or endpoint is not healthy.':'Runtime status is unknown. Check runtime.';
  text(health,healthMessage);
  if(runtime?.reason&&runtime.state!=='healthy'){const detail=doc.createElement('span');detail.className='ollama-runtime-reason';text(detail,runtime.reason);health.append(detail);}
  const diagnostic=startupResult&&startupResult.state!=='healthy'?(startupResult.next||'Runtime startup could not complete. Check runtime before retrying.'):'';startupDiagnostic.hidden=!diagnostic;text(startupDiagnostic,diagnostic);
  const disabledReason=working?'Finish or cancel installation before starting.':pending?'Wait for the current runtime action to finish.':!runtime?'Check runtime before starting.':runtime.state==='healthy'?'The configured endpoint is already responding. Another start is not needed.':runtime.state==='unhealthy'?'Resolve the current runtime or endpoint problem before starting.':runtime.state==='unknown'?'Runtime status is unknown. Check runtime before starting.':!runtime.installed?'Install or locate a verified runtime before starting.':runtime.executableTrusted===false?'The detected executable has not passed runtime trust verification.':!runtime.actions?.start?'Verified startup is unavailable through the current host capability. Check runtime before retrying.':'';
  startReason.hidden=!start.disabled;text(startReason,start.disabled?disabledReason:'');
  const stopDisabledReason=working?'Finish or cancel installation before stopping.':pending?'Wait for the current runtime action to finish.':!runtime?'Check runtime before stopping.':runtime.ownedManaged!==true?runtime.state==='healthy'?'The endpoint is responding, but this controller does not own it. It cannot be stopped here.':'This controller has no owned managed runtime to stop.':'The host has not enabled stopping for the retained runtime. Check runtime before retrying.';
  stopReason.hidden=!stop.disabled;text(stopReason,stop.disabled?stopDisabledReason:'');stopDiagnostic.hidden=!stopNotice;text(stopDiagnostic,stopNotice);
  metadata.textContent=[snapshot?.version,snapshot?.architecture,runtime?.version,runtime?.endpoint].filter(Boolean).join(' · ');
  const detail=snapshot?.outcome==='installed-stopped'?null:snapshot?.reason;if(detail){const reason=doc.createElement('span');reason.className='ollama-runtime-reason';reason.textContent=local(detail);state.append(reason);}
  progress.hidden=!working;progress.indeterminate=!(snapshot?.phase==='downloading'&&snapshot.totalBytes>0);progress.value=progress.indeterminate?0:Math.min(1,snapshot.receivedBytes/snapshot.totalBytes);
  progress.setAttribute('aria-label',local('Runtime installation progress'));
  bytes.textContent=working&&snapshot.phase==='downloading'?formatBytes(snapshot.receivedBytes)+(snapshot.totalBytes>0?' / '+formatBytes(snapshot.totalBytes):''):'';
  port.label=local('Local runtime port');port.setAttribute('aria-label',local('Local runtime port'));region.setAttribute('aria-label',local('Local runtime'));region.setAttribute('aria-busy',String(Boolean(locked)));
  if(previous?.disabled&&[install,cancel,start,stop,locate,apply].includes(previous))heading.focus();
  clearTimeout(poll);poll=null;if(working&&!restoring)poll=setTimeout(()=>{void restore();},1000);
 }
 function consume(value,admission=false){if(disposed||!value||!INSTALL_PHASES.includes(value.phase))return false;const id=value.operationId;
  if(id!==null&&typeof id!=='string')return false;
  if(retired.has(id))return false;
  if(snapshot?.operationId===id){if(snapshot.phase==='complete'&&value.phase!=='complete')return false;if(INSTALL_PHASES.indexOf(value.phase)<INSTALL_PHASES.indexOf(snapshot.phase))return false;if(value.phase==='downloading'&&snapshot.phase==='downloading'&&value.receivedBytes<snapshot.receivedBytes)return false;}
  else if(snapshot?.operationId){if(!admission&&active())return false;if(!id)return false;retired.add(snapshot.operationId);}
  if(snapshot&&JSON.stringify(snapshot)===JSON.stringify(value))return false;
  const terminal=value.phase==='complete'&&(snapshot?.operationId!==id||snapshot?.phase!=='complete');snapshot={...value};revision++;notice='';paint();if(terminal)void refresh();return true;
 }
 async function restore(){if(disposed||restoring)return;restoring=true;clearTimeout(poll);poll=null;const at=revision;try{const value=await request('runtimeInstallStatus');if(!disposed&&revision===at)consume(value);}catch{if(!disposed)notice='Installation status is unavailable. Check runtime to reconnect.';}finally{restoring=false;if(!disposed)paint();}}
 async function refresh(){const at=revision,requestRevision=++runtimeRequestRevision;try{const value=await request('status');if(disposed||requestRevision!==runtimeRequestRevision)return;runtime=value;onRuntime(value);if(value.endpoint)port.value=new URL(value.endpoint).port;if(value.installation&&revision===at)consume(value.installation);paint();}catch{if(!disposed&&requestRevision===runtimeRequestRevision){runtime=null;notice='The runtime request could not be completed. Check runtime before retrying.';paint();}}}
 function refreshLabels(){for(const[node,en]of labels)text(node,en);paint();}
 paint();return{refresh,consume,refreshLabels,restore,destroy(){disposed=true;runtimeRequestRevision++;clearTimeout(poll);region.remove();}};
}
