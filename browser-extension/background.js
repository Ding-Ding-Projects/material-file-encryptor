const HOST='org.dingding.material_file_encryptor.downloads';
let port=null,session=null,sequence=0,pending=null,captureId=null,connectionEpoch=0;
function disconnect(){connectionEpoch++;port?.disconnect();port=null;session=null;captureId=null;if(pending){clearTimeout(pending.timer);pending.reject(new Error('Desktop connection closed.'));pending=null;}}
function connect(){if(port)return port;port=chrome.runtime.connectNative(HOST);const ownPort=port;port.onDisconnect.addListener(()=>{if(port!==ownPort)return;connectionEpoch++;port=null;session=null;captureId=null;if(pending){clearTimeout(pending.timer);pending.reject(new Error('Desktop receiver is unavailable.'));pending=null;}});port.onMessage.addListener(message=>{if(port!==ownPort||!pending)return;const request=pending;pending=null;clearTimeout(request.timer);if(message?.type==='error')request.reject(new Error('Desktop did not accept the handoff.'));else request.resolve(message);});return port;}
function request(message,timeoutMs=30000){if(pending)return Promise.reject(new Error('Resolve the current desktop handoff first.'));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending=null;disconnect();reject(new Error('Desktop handoff timed out.'));},timeoutMs);pending={resolve,reject,timer};try{connect().postMessage(message);}catch(error){clearTimeout(timer);pending=null;disconnect();reject(new Error('Install and open the desktop receiver first.'));}});}
async function pair(){const result=await request({type:'pair'});if(result?.type!=='paired'||typeof result.session!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(result.session))throw new Error('Desktop pairing response is invalid.');session=result.session;return{paired:true};}
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
 }if(message?.type==='pair'){pair().then(respond,error=>respond({error:error.message}));return true;}if(message?.type==='status'){if(!session||!captureId){respond({paired:!!session});return false;}request({type:'status',session,id:captureId}).then(result=>{if(result?.type!=='status'||result.id!==captureId||!['awaiting-confirmation','downloading','completed','failed','cancelled'].includes(result.state))throw new Error('Desktop status response is invalid.');respond({paired:true,capture:{id:result.id,state:result.state,received:Number.isSafeInteger(result.received)&&result.received>=0?result.received:0,total:Number.isSafeInteger(result.total)&&result.total>=0?result.total:null}});}).catch(()=>respond({paired:!!session,error:'Desktop transfer status is unavailable.'}));return true;}if(message?.type==='disconnect'){disconnect();respond({paired:false});return false;}return false;});
