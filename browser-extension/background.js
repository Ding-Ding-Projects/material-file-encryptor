const HOST='org.dingding.material_file_encryptor.downloads';
// The reviewed list of lockable workspace tabs. src/shared/extension-lock-targets.js holds the same list; a test compares them.
const LOCK_TABS=['connection','personalization','changelog','notes','docs','support','dimsum','models','status'];
// Unlock ladder answers: the desktop sends ordered level ids and an optional end time for its shared cooldown.
const ladderLevelsValid=levels=>Array.isArray(levels)&&levels.length>=2&&levels.length<=16&&levels.every(level=>typeof level==='string'&&/^[a-z0-9-]{1,24}$/.test(level))&&new Set(levels).size===levels.length;
const ladderCooldownValid=value=>value===null||Number.isSafeInteger(value)&&value>0;
// Status client report: the same bounded shape src/main/browser-status-mediation.js accepts and browser-extension/status-client.js builds.
const REPORT_COUNTS=['notes','schedules','tickets','operations'];
const reportExact=(row,keys)=>row!==null&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).sort().join(',')===[...keys].sort().join(',');
const reportValid=report=>reportExact(report,['version','connection','lastRefresh','counts'])&&typeof report.version==='string'&&/^\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[0-9A-Za-z.-]{1,32})?$/.test(report.version)&&report.connection==='paired'&&(report.lastRefresh===null||typeof report.lastRefresh==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(report.lastRefresh))&&reportExact(report.counts,REPORT_COUNTS)&&REPORT_COUNTS.every(key=>Number.isSafeInteger(report.counts[key])&&report.counts[key]>=0&&report.counts[key]<=9999);
let port=null,session=null,sequence=0,pending=null,captureId=null,connectionEpoch=0;
function disconnect(){connectionEpoch++;port?.disconnect();port=null;session=null;captureId=null;if(pending){clearTimeout(pending.timer);pending.reject(new Error('Desktop connection closed.'));pending=null;}}
function connect(){if(port)return port;port=chrome.runtime.connectNative(HOST);const ownPort=port;port.onDisconnect.addListener(()=>{if(port!==ownPort)return;connectionEpoch++;port=null;session=null;captureId=null;if(pending){clearTimeout(pending.timer);pending.reject(new Error('Desktop receiver is unavailable.'));pending=null;}});port.onMessage.addListener(message=>{if(port!==ownPort||!pending)return;const request=pending;pending=null;clearTimeout(request.timer);if(message?.type==='error')request.reject(new Error('Desktop did not accept the handoff.'));else request.resolve(message);});return port;}
function request(message,timeoutMs=30000){if(pending)return Promise.reject(new Error('Resolve the current desktop handoff first.'));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending=null;disconnect();reject(new Error('Desktop handoff timed out.'));},timeoutMs);pending={resolve,reject,timer};try{connect().postMessage(message);}catch(error){clearTimeout(timer);pending=null;disconnect();reject(new Error('Install and open the desktop receiver first.'));}});}
// An optional one-time code shown on the desktop travels with the pair request only; it is never kept.
async function pair(code){const result=await request(code===undefined?{type:'pair'}:{type:'pair',code});if(result?.type!=='paired'||typeof result.session!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(result.session))throw new Error('Desktop pairing response is invalid.');session=result.session;return{paired:true};}
async function propose(link){if(!session)throw new Error('Pair this browser with the unlocked desktop first.');const url=new URL(link);if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||link.length>2048)throw new Error('Choose a public HTTPS link without credentials.');let filename;try{filename=decodeURIComponent(url.pathname.split('/').pop()||'download.bin');}catch{throw new Error('The download file name is invalid.');}filename=filename.replace(/[\\/<>:"|?*\x00-\x1f\x7f]/g,'_').slice(0,180)||'download.bin';if(['.','..'].includes(filename))filename='download.bin';const result=await request({type:'propose',session,proposal:{url:url.href,filename,browserDownloadId:++sequence}});if(result?.type!=='proposed'||result.state!=='awaiting-confirmation'||typeof result.id!=='string'||!/^[a-f0-9-]{36}$/.test(result.id))throw new Error('Desktop proposal response is invalid.');captureId=result.id;return{proposed:true,id:captureId,state:result.state};}
chrome.runtime.onInstalled.addListener(()=>{chrome.contextMenus.create({id:'propose-download',title:'Download with Material File Encryptor…',contexts:['link'],targetUrlPatterns:['https://*/*']});});
chrome.contextMenus.onClicked.addListener(info=>{if(info.menuItemId==='propose-download')void propose(info.linkUrl).catch(()=>{chrome.action.setBadgeText({text:'!'});chrome.action.setTitle({title:'Pair the browser and retry the download handoff.'});});});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{if(sender.id!==chrome.runtime.id||!['popup.html','options.html'].some(path=>sender.url===chrome.runtime.getURL(path))||sender.frameId!==undefined&&sender.frameId!==0)return false;
 if(['converter-catalog','converter-prepare','converter-enqueue','converter-list','converter-control'].includes(message?.type)){
  const fields={'converter-catalog':[],'converter-prepare':[],'converter-enqueue':['selection','adapterId'],'converter-list':['cursor'],'converter-control':['id','action']}[message.type];
  const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
  if(!session||!message||Object.getPrototypeOf(message)!==Object.prototype||Reflect.ownKeys(message).length!==fields.length+2||!['type','language',...fields].every(key=>Object.hasOwn(message,key))||!['en','yue','bilingual'].includes(message.language)||message.type==='converter-enqueue'&&(!uuid(message.selection)||!['json-format','text-utf8','base64','hex'].includes(message.adapterId))||message.type==='converter-list'&&message.cursor!==null&&!uuid(message.cursor)||message.type==='converter-control'&&(!uuid(message.id)||!['pause','resume','cancel'].includes(message.action))){respond({error:'Conversion request is invalid or unavailable.'});return false;}
  const ownSession=session,epoch=connectionEpoch;
  request({...message,session:ownSession},125000).then(value=>{
   if(session!==ownSession||connectionEpoch!==epoch||!value||value.type!==message.type+'-result'||value.schemaVersion!==1||JSON.stringify(value).length>60000)throw Error('Conversion response unavailable.');
   const exact=(row,keys)=>row&&Object.keys(row).sort().join(',')===keys.sort().join(',');
   const job=row=>exact(row,['id','adapterId','state','progress'])&&uuid(row.id)&&['json-format','text-utf8','base64','hex'].includes(row.adapterId)&&['queued','running','paused','completed','failed','cancelled'].includes(row.state)&&Number.isFinite(row.progress)&&row.progress>=0&&row.progress<=100;
   let valid=false;
   if(message.type==='converter-catalog')valid=exact(value,['type','schemaVersion','formats'])&&Array.isArray(value.formats)&&value.formats.length<=128&&value.formats.every(row=>exact(row,['id','category','name','sources','target','metadata','encoding','lossy','enabled','reason'])&&['id','category','name','target','metadata','encoding','reason'].every(key=>typeof row[key]==='string'&&row[key].length<=2000)&&/^[a-z0-9-]{1,80}$/.test(row.id)&&Array.isArray(row.sources)&&row.sources.length<=16&&row.sources.every(item=>typeof item==='string'&&/^[a-z0-9*]{1,16}$/.test(item))&&typeof row.enabled==='boolean'&&typeof row.lossy==='boolean'&&['','browser-options-unavailable','native-adapter-unavailable'].includes(row.reason));
   else if(message.type==='converter-list')valid=exact(value,['type','schemaVersion','rows','nextCursor'])&&(value.nextCursor===null||uuid(value.nextCursor))&&Array.isArray(value.rows)&&value.rows.length<=20&&value.rows.every(job);
   else if(value.outcome==='cancelled')valid=exact(value,['type','schemaVersion','outcome']);
   else if(message.type==='converter-prepare')valid=exact(value,['type','schemaVersion','outcome','selection','sourceType','bytes'])&&value.outcome==='selected'&&uuid(value.selection)&&['pdf','png','jpeg','zip','xlsx','ods','wav','flac','mp3','mp4','riff','7z','rar','binary','json','text'].includes(value.sourceType)&&Number.isSafeInteger(value.bytes)&&value.bytes>=0&&value.bytes<=67108864;
   else valid=exact(value,['type','schemaVersion','outcome','job'])&&value.outcome===(message.type==='converter-enqueue'?'accepted':'updated')&&job(value.job);
   if(!valid)throw Error('Invalid conversion response.');respond(value);
  }).catch(()=>respond({error:'Conversion request did not complete. Check the desktop for work already accepted.'}));return true;
 }
 if(['workflow-discover','workflow-editor-open'].includes(message?.type)){
  if(!message||Object.getPrototypeOf(message)!==Object.prototype||Reflect.ownKeys(message).length!==(message.type==='workflow-editor-open'?2:1)||message.type==='workflow-editor-open'&&!['en','yue','bilingual'].includes(message.language)||!session){respond({error:'Native editor workflow unavailable.'});return false;}
  const ownSession=session,epoch=connectionEpoch;
  request({type:message.type,session:ownSession,...(message.type==='workflow-editor-open'?{language:message.language}:{})},message.type==='workflow-editor-open'?125000:30000).then(value=>{
   if(session!==ownSession||connectionEpoch!==epoch)throw Error('Browser connection changed.');
   if(message.type==='workflow-discover'){
    if(!value||Object.keys(value).sort().join(',')!=='externalEditor,schemaVersion,type'||value.type!=='workflow-capabilities'||value.schemaVersion!==1||typeof value.externalEditor!=='boolean')throw Error('Invalid capabilities.');
    respond({schemaVersion:1,externalEditor:value.externalEditor});
   }else{
    if(!value||Object.keys(value).sort().join(',')!=='outcome,schemaVersion,type'||value.type!=='workflow-editor-result'||value.schemaVersion!==1||!['opened','cancelled'].includes(value.outcome))throw Error('Invalid editor result.');
    respond({schemaVersion:1,outcome:value.outcome});
   }
  }).catch(()=>respond({error:'Native editor request did not complete. Refresh the connection and try again.'}));return true;
 }
 if(message?.type==='status-client-enroll'){
  if(!message||Object.getPrototypeOf(message)!==Object.prototype||Reflect.ownKeys(message).length!==2||!reportValid(message.report)){respond({error:'Status report is unavailable.'});return false;}
  if(!session){respond({paired:false});return false;}
  const ownSession=session,epoch=connectionEpoch,report={version:message.report.version,connection:'paired',lastRefresh:message.report.lastRefresh,counts:Object.fromEntries(REPORT_COUNTS.map(key=>[key,message.report.counts[key]]))};
  // The desktop is the mediator. It answers with one fixed state word; nothing else comes back.
  request({type:'enroll-status-client',session:ownSession,report},30000).then(value=>{
   if(session!==ownSession||connectionEpoch!==epoch||!reportExact(value,['type','schemaVersion','state'])||value.type!=='status-client'||value.schemaVersion!==1||!['pending','enrolled','unavailable'].includes(value.state))throw Error('Invalid status client response.');
   respond({schemaVersion:1,state:value.state});
  }).catch(()=>respond({error:'Status enrollment did not complete. Open and unlock the desktop, pair again and retry.'}));return true;
 }
 if(message?.type==='desktop-status'){
  if(!message||Object.getPrototypeOf(message)!==Object.prototype||Reflect.ownKeys(message).length!==1){respond({error:'Desktop status is unavailable.'});return false;}
  if(!session){respond({paired:false});return false;}
  const ownSession=session,epoch=connectionEpoch,exact=(row,keys)=>row&&typeof row==='object'&&Object.keys(row).sort().join(',')===keys.sort().join(','),version=value=>typeof value==='string'&&/^\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[0-9A-Za-z.-]{1,32})?$/.test(value);
  (async()=>{
   const lock=await request({type:'read-lock-state',session:ownSession});
   if(session!==ownSession||connectionEpoch!==epoch||!exact(lock,['type','schemaVersion','state'])||lock.type!=='lock-state'||lock.schemaVersion!==1||!['unlocked','locked','unavailable'].includes(lock.state))throw Error('Invalid lock state.');
   const update=await request({type:'read-update-state',session:ownSession});
   if(session!==ownSession||connectionEpoch!==epoch||!exact(update,['type','schemaVersion','desktopVersion','availableVersion','phase','progress'])||update.type!=='update-state'||update.schemaVersion!==1||update.desktopVersion!=='unknown'&&!version(update.desktopVersion)||update.availableVersion!==null&&!version(update.availableVersion)||!['idle','checking','downloading','ready','unavailable'].includes(update.phase)||update.progress!==null&&!(Number.isFinite(update.progress)&&update.progress>=0&&update.progress<=1))throw Error('Invalid update state.');
   respond({schemaVersion:1,lock:lock.state,update:{desktopVersion:update.desktopVersion,availableVersion:update.availableVersion,phase:update.phase,progress:update.progress}});
  })().catch(()=>respond({error:'Desktop status did not complete. Open and unlock the desktop, pair again and retry.'}));return true;
 }
 if(message?.type==='authenticator-focus'){
  if(!message||Object.getPrototypeOf(message)!==Object.prototype||Reflect.ownKeys(message).length!==1){respond({error:'Authenticator request is unavailable.'});return false;}
  if(!session){respond({paired:false});return false;}
  const ownSession=session,epoch=connectionEpoch;
  // The desktop asks its user first. Only a fixed state word comes back: no code, account name or secret.
  request({type:'focus-authenticator',session:ownSession},40000).then(value=>{
   if(session!==ownSession||connectionEpoch!==epoch||!value||Object.keys(value).sort().join(',')!=='schemaVersion,state,type'||value.type!=='authenticator-focused'||value.schemaVersion!==1||!['shown','rejected','busy','unavailable'].includes(value.state))throw Error('Invalid authenticator response.');
   respond({schemaVersion:1,state:value.state});
  }).catch(()=>respond({error:'Authenticator request did not complete. Open and unlock the desktop, pair again and retry.'}));return true;
 }
 if(message?.type==='school-mode-read'){
  if(!message||Object.getPrototypeOf(message)!==Object.prototype||Reflect.ownKeys(message).length!==1){respond({error:'School mode request is unavailable.'});return false;}
  if(!session){respond({paired:false});return false;}
  const ownSession=session,epoch=connectionEpoch;
  request({type:'read-school-mode',session:ownSession}).then(value=>{
   if(session!==ownSession||connectionEpoch!==epoch||!value||Object.keys(value).sort().join(',')!=='enabled,name,schemaVersion,type'||value.type!=='school-mode'||value.schemaVersion!==1||typeof value.enabled!=='boolean'||typeof value.name!=='string'||!value.name||value.name.length>80||/\p{Cc}/u.test(value.name))throw Error('Invalid school mode response.');
   respond({schemaVersion:1,enabled:value.enabled,name:value.name});
  }).catch(()=>respond({error:'School mode could not be read. Open and unlock the desktop, pair again and retry.'}));return true;
 }
 if(message?.type==='school-mode-set'){
  if(!message||Object.getPrototypeOf(message)!==Object.prototype||Reflect.ownKeys(message).length!==2||typeof message.enabled!=='boolean'){respond({error:'School mode request is unavailable.'});return false;}
  if(!session){respond({paired:false});return false;}
  const ownSession=session,epoch=connectionEpoch,wanted=message.enabled;
  // The desktop re-authenticates the person first. Only a fixed state word and the on/off state come back.
  request({type:'set-school-mode',session:ownSession,enabled:wanted},40000).then(value=>{
   if(session!==ownSession||connectionEpoch!==epoch||!value||Object.keys(value).sort().join(',')!=='enabled,schemaVersion,state,type'||value.type!=='school-mode-set'||value.schemaVersion!==1||!['changed','unchanged','rejected','busy','unavailable'].includes(value.state)||value.enabled!==null&&typeof value.enabled!=='boolean')throw Error('Invalid school mode response.');
   respond({schemaVersion:1,state:value.state,enabled:value.enabled});
  }).catch(()=>respond({error:'School mode request did not complete. Open and unlock the desktop, pair again and retry.'}));return true;
 }
 if(message?.type==='element-locks-read'){
  if(!message||Object.getPrototypeOf(message)!==Object.prototype||Reflect.ownKeys(message).length!==1){respond({error:'Element lock request is unavailable.'});return false;}
  if(!session){respond({paired:false});return false;}
  const ownSession=session,epoch=connectionEpoch;
  request({type:'read-element-locks',session:ownSession}).then(value=>{
   if(session!==ownSession||connectionEpoch!==epoch||!value||Object.keys(value).sort().join(',')!=='locked,schemaVersion,type'||value.type!=='element-locks'||value.schemaVersion!==1||!Array.isArray(value.locked)||value.locked.length>LOCK_TABS.length||value.locked.some(tab=>!LOCK_TABS.includes(tab))||new Set(value.locked).size!==value.locked.length)throw Error('Invalid element lock response.');
   respond({schemaVersion:1,locked:value.locked.slice()});
  }).catch(()=>respond({error:'Locks could not be read. Open and unlock the desktop, pair again and retry.'}));return true;
 }
 if(message?.type==='element-lock-set'){
  if(!message||Object.getPrototypeOf(message)!==Object.prototype||Reflect.ownKeys(message).length!==3||!LOCK_TABS.includes(message.target)||typeof message.locked!=='boolean'){respond({error:'Element lock request is unavailable.'});return false;}
  if(!session){respond({paired:false});return false;}
  const ownSession=session,epoch=connectionEpoch,target=message.target,wanted=message.locked;
  // The desktop re-authenticates the person first, for locking and unlocking alike. Only a fixed state word comes back.
  request({type:'set-element-lock',session:ownSession,target,locked:wanted},40000).then(value=>{
   if(session!==ownSession||connectionEpoch!==epoch||!value||Object.keys(value).sort().join(',')!=='locked,schemaVersion,state,target,type'||value.type!=='element-lock-set'||value.schemaVersion!==1||value.target!==target||!['changed','unchanged','rejected','busy','unavailable'].includes(value.state)||value.locked!==null&&typeof value.locked!=='boolean')throw Error('Invalid element lock response.');
   respond({schemaVersion:1,state:value.state,target,locked:value.locked});
  }).catch(()=>respond({error:'Lock request did not complete. Open and unlock the desktop, pair again and retry.'}));return true;
 }
 if(message?.type==='unlock-ladder-read'){
  if(!message||Object.getPrototypeOf(message)!==Object.prototype||Reflect.ownKeys(message).length!==1){respond({error:'Unlock level request is unavailable.'});return false;}
  if(!session){respond({paired:false});return false;}
  const ownSession=session,epoch=connectionEpoch;
  request({type:'read-unlock-ladder',session:ownSession}).then(value=>{
   if(session!==ownSession||connectionEpoch!==epoch||!value||Object.keys(value).sort().join(',')!=='cooldownUntil,level,levels,recovery,schemaVersion,type'||value.type!=='unlock-ladder'||value.schemaVersion!==1||!ladderLevelsValid(value.levels)||!value.levels.includes(value.level)||!ladderCooldownValid(value.cooldownUntil)||!['none','available','required'].includes(value.recovery))throw Error('Invalid unlock level response.');
   respond({schemaVersion:1,level:value.level,levels:value.levels.slice(),cooldownUntil:value.cooldownUntil,recovery:value.recovery});
  }).catch(()=>respond({error:'The unlock level could not be read. Open and unlock the desktop, pair again and retry.'}));return true;
 }
 if(message?.type==='unlock-step-request'){
  if(!message||Object.getPrototypeOf(message)!==Object.prototype||Reflect.ownKeys(message).length!==1){respond({error:'Unlock step request is unavailable.'});return false;}
  if(!session){respond({paired:false});return false;}
  const ownSession=session,epoch=connectionEpoch;
  // The desktop re-authenticates the person first and runs its own challenge. Only fixed words and numbers come back.
  request({type:'request-unlock-step',session:ownSession},40000).then(value=>{
   if(session!==ownSession||connectionEpoch!==epoch||!value||Object.keys(value).sort().join(',')!=='cooldownUntil,level,schemaVersion,state,type'||value.type!=='unlock-step'||value.schemaVersion!==1||!['advanced','cooldown','complete','rejected','busy','unavailable'].includes(value.state)||value.level!==null&&(typeof value.level!=='string'||!/^[a-z0-9-]{1,24}$/.test(value.level))||!ladderCooldownValid(value.cooldownUntil))throw Error('Invalid unlock step response.');
   respond({schemaVersion:1,state:value.state,level:value.level,cooldownUntil:value.cooldownUntil});
  }).catch(()=>respond({error:'The unlock step did not complete. Open and unlock the desktop, pair again and retry.'}));return true;
 }
 if(message?.type==='protected-discover'){
  if(!message||Object.getPrototypeOf(message)!==Object.prototype||Reflect.ownKeys(message).length!==1||!session){respond({error:'Protected capabilities are unavailable.'});return false;}
  const ownSession=session,epoch=connectionEpoch;
  request({type:'protected-discover',session:ownSession}).then(value=>{
   if(session!==ownSession||connectionEpoch!==epoch||!value||Object.keys(value).sort().join(',')!=='authentication,operations,schemaVersion,type'||value.type!=='protected-capabilities'||value.schemaVersion!==1||!['unavailable','native-explicit'].includes(value.authentication)||!Array.isArray(value.operations)||value.operations.length>1)throw Error('Protected capability response is invalid.');
   if(value.authentication==='unavailable'&&value.operations.length!==0||value.authentication==='native-explicit'&&(value.operations.length!==1||Object.keys(value.operations[0]||{}).sort().join(',')!=='operation,profileId,target'||value.operations[0].profileId!=='local-profile'||value.operations[0].operation!=='read-profile-summary'||value.operations[0].target!=='profile-summary'))throw Error('Protected capability response is invalid.');
   respond({schemaVersion:1,authentication:value.authentication,operations:value.operations.map(item=>({profileId:item.profileId,operation:item.operation,target:item.target}))});
  }).catch(()=>respond({error:'Protected capabilities are unavailable.'}));return true;
 }
 if(message?.type==='protection-status'){
 if(!message||Object.keys(message).length!==1||!session){respond({error:'Protection observations are unavailable.'});return false;}
 const ownSession=session,epoch=connectionEpoch;
 request({type:'protection-status',session:ownSession}).then(value=>{if(session!==ownSession||connectionEpoch!==epoch||!value||Object.keys(value).sort().join(',')!=='browserPermission,profile,schemaVersion,sharedMode,type'||value.type!=='protection-status'||value.schemaVersion!==1||!['authenticated','locked','expired','unknown'].includes(value.profile)||!['active','inactive','unknown'].includes(value.sharedMode)||value.browserPermission!=='unavailable')throw Error('Protection observation is invalid.');respond({schemaVersion:1,profile:value.profile,sharedMode:value.sharedMode,browserPermission:'unavailable'});}).catch(()=>respond({error:'Protection observations are unavailable.'}));return true;
 }if(message?.type==='pair'){const keys=Reflect.ownKeys(message);if(!(keys.length===1||keys.length===2&&keys.includes('code'))||keys.length===2&&!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(message.code)){respond({error:'The pairing code is not valid.'});return false;}pair(keys.length===2?message.code:undefined).then(respond,error=>respond({error:error.message}));return true;}if(message?.type==='status'){if(!session||!captureId){respond({paired:!!session});return false;}request({type:'status',session,id:captureId}).then(result=>{if(result?.type!=='status'||result.id!==captureId||!['awaiting-confirmation','downloading','completed','failed','cancelled'].includes(result.state))throw new Error('Desktop status response is invalid.');respond({paired:true,capture:{id:result.id,state:result.state,received:Number.isSafeInteger(result.received)&&result.received>=0?result.received:0,total:Number.isSafeInteger(result.total)&&result.total>=0?result.total:null}});}).catch(()=>respond({paired:!!session,error:'Desktop transfer status is unavailable.'}));return true;}if(message?.type==='disconnect'){disconnect();respond({paired:false});return false;}return false;});
