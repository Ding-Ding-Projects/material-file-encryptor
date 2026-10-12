import fs from 'node:fs/promises';
import path from 'node:path';
import {createCipheriv,createDecipheriv,randomBytes,randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {passwordVerifier,verifyPassword} from '../renderer/features/access/crypto.js';

const execute=promisify(execFile),VAULT_KEY='lock:access-history:v1',TAIL_KEY='lock:access-history-tail:v1',PENDING_KEY='lock:access-history-pending:v1',DISPLAY_KEY='profile:access-display-name:v1';
const actionNames=new Set(['display-name-changed','authenticator-created','authenticator-updated','authenticator-removed','authenticator-index-updated','authenticator-restored','history-labelled','history-retention-changed','history-pruned','mutation-rolled-back']);
const clone=value=>structuredClone(value),hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const metadata=(record)=>({id:record.id,at:record.at,action:record.action,label:record.label||'',source:record.source||null,omitted:'Credential values and encrypted snapshots are omitted.'});
const validKey=key=>typeof key==='string'&&(key===DISPLAY_KEY||/^authenticator:[a-zA-Z0-9:_.-]{1,160}$/.test(key));
export function createAccessHistory({dataDirectory,credentials,getActor,now=Date.now,executeGit=execute,verifyHistory,getHistoryWaiting}={}){
 const directory=path.join(dataDirectory,'access-history'),recordsDirectory=path.join(directory,'records');
 let chain=Promise.resolve(),closed=false,initialized=false;const grants=new Map(),epochs=new Map();
 const actor=()=>{const value=getActor?.();if(typeof value!=='string'||!value||value.length>160)throw Error('Trusted access actor is unavailable.');return value;};
 const epoch=who=>epochs.get(who)||0;
 const serial=fn=>{const pending=chain.catch(()=>{}).then(()=>{if(closed)throw Error('Access history is closed.');return fn();});chain=pending;return pending;};
 const authorization=who=>{const current=epoch(who),check=()=>{if(closed||actor()!==who||epoch(who)!==current||!(grants.get(who)>now()))throw Error('Unlock access history with its own password first.');};check();return check;};
 const git=async args=>executeGit('git',['-c','core.hooksPath='+(process.platform==='win32'?'NUL':'/dev/null'),'-c','commit.gpgsign=false','-c','user.name=Material File Encryptor','-c','user.email=local@material-file-encryptor.invalid',...args],{cwd:directory,windowsHide:true,maxBuffer:3*1024*1024,timeout:15000});
 async function initialize(){if(initialized)return;await fs.mkdir(directory,{recursive:true,mode:0o700});if((await fs.lstat(directory)).isSymbolicLink())throw Error('Access history storage must not be a symbolic link.');await fs.mkdir(recordsDirectory,{recursive:true,mode:0o700});if((await fs.lstat(recordsDirectory)).isSymbolicLink())throw Error('Access history storage must not be a symbolic link.');try{await git(['init','--quiet']);}catch{throw Error('Local Git history is unavailable. Install the supported Git runtime and retry.');}initialized=true;}
 async function key(){const record=await credentials.get(VAULT_KEY);if(!record?.key||typeof record.key!=='string')throw Error('Access history has not been configured.');const value=Buffer.from(record.key,'base64');if(value.length!==32)throw Error('Access history key is unavailable.');return value;}
 function encrypt(value,key,header){const clear=Buffer.from(JSON.stringify(value));if(clear.length>1024*1024)throw Error('Access history snapshot exceeds its limit.');try{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(JSON.stringify(header)));return {iv:iv.toString('base64'),data:Buffer.concat([cipher.update(clear),cipher.final()]).toString('base64'),tag:cipher.getAuthTag().toString('base64')};}finally{clear.fill(0);}}
 function decrypt(value,key){try{const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(value.sealed.iv,'base64'));cipher.setAAD(Buffer.from(JSON.stringify({version:value.version,id:value.id,sequence:value.sequence,previous:value.previous})));cipher.setAuthTag(Buffer.from(value.sealed.tag,'base64'));const clear=Buffer.concat([cipher.update(Buffer.from(value.sealed.data,'base64')),cipher.final()]);try{return JSON.parse(clear.toString('utf8'));}finally{clear.fill(0);}}catch{throw Error('Access history integrity check failed.');}}

 async function recoverPending(){const pending=await credentials.get(PENDING_KEY);if(!pending)return;
  if(pending.version!==1||!/^records\/[0-9]{8}-[a-f0-9-]{36}\.json$/.test(pending.relative)||!/^[a-f0-9]{64}$/.test(pending.hash)||typeof pending.previous!=='string'||pending.staged!==undefined&&!/^pending\/[a-f0-9-]{36}\.json$/.test(pending.staged))throw Error('Access history recovery intent is invalid.');
  const tail=await credentials.get(TAIL_KEY);if((tail?.hash||'')!==pending.previous&&(tail?.hash||'')!==pending.hash)throw Error('Access history recovery ownership changed.');
  const inspect=async relative=>{const filename=path.join(directory,relative);const info=await fs.lstat(filename);if(!info.isFile()||info.isSymbolicLink()||info.size>2*1024*1024)throw Error('Access history recovery integrity check failed.');let envelope;try{envelope=JSON.parse(await fs.readFile(filename,'utf8'));}catch{throw Error('Access history recovery integrity check failed.');}if(hash(envelope)!==pending.hash||envelope.previous!==pending.previous)throw Error('Access history recovery integrity check failed.');return envelope;};
  let history=await git(['log','-1','--format=%H','--all','--',pending.relative]),revision=history.stdout.trim();
  if(!revision){try{await inspect(pending.relative);}catch(error){if(error.code!=='ENOENT')throw error;if(!pending.staged)throw Error('Access history pending record requires recovery.');await inspect(pending.staged).catch(()=>{throw Error('Access history recovery integrity check failed.');});await fs.rename(path.join(directory,pending.staged),path.join(directory,pending.relative));}await git(['add','--',pending.relative]);await git(['commit','--quiet','-m','Recover interrupted encrypted history record','--',pending.relative]);history=await git(['log','-1','--format=%H','--all','--',pending.relative]);revision=history.stdout.trim();}
  if(!/^[a-f0-9]{40,64}$/.test(revision))throw Error('Access history pending record requires recovery.');
  const committed=await git(['show',revision+':'+pending.relative]);let envelope;try{envelope=JSON.parse(committed.stdout);}catch{throw Error('Access history pending record requires recovery.');}
  if(hash(envelope)!==pending.hash||envelope.previous!==pending.previous)throw Error('Access history recovery integrity check failed.');
  await inspect(pending.relative);await credentials.set(TAIL_KEY,{version:1,hash:pending.hash});await credentials.delete(PENDING_KEY);
 }
 async function read(key){await initialize();await recoverPending();const names=(await fs.readdir(recordsDirectory)).filter(name=>/^[0-9]{8}-[a-f0-9-]{36}\.json$/.test(name)).sort();if(names.length>10000)throw Error('Access history record limit reached.');const rows=[];let previous='',totalBytes=0;for(const name of names){const file=path.join(recordsDirectory,name),info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>2*1024*1024)throw Error('Access history record is invalid.');totalBytes+=info.size;if(totalBytes>64*1024*1024)throw Error('Access history storage limit reached.');const envelope=JSON.parse(await fs.readFile(file,'utf8'));if(envelope.version!==1||envelope.sequence!==rows.length+1||envelope.previous!==previous)throw Error('Access history chain is invalid.');const record=decrypt(envelope,key);if(record.id!==envelope.id||!actionNames.has(record.action)||typeof record.at!=='string')throw Error('Access history record is invalid.');rows.push(record);previous=hash(envelope);}const tail=await credentials.get(TAIL_KEY);if((tail?.hash||'')!==previous)throw Error('Access history tail requires recovery.');return {rows,previous};}

 async function append(action,snapshot,key,extra={}){if(!actionNames.has(action))throw Error('Invalid access history action.');const current=await read(key),id=randomUUID(),record={id,action,at:new Date(now()).toISOString(),snapshot,...extra},header={version:1,id,sequence:current.rows.length+1,previous:current.previous},envelope={...header,sealed:encrypt(record,key,header)},relative='records/'+String(envelope.sequence).padStart(8,'0')+'-'+id+'.json',filename=path.join(directory,relative),staged='pending/'+id+'.json',intent={version:1,previous:current.previous,hash:hash(envelope),relative,staged};
  const pendingDirectory=path.join(directory,'pending');await fs.mkdir(pendingDirectory,{recursive:true,mode:0o700});if((await fs.lstat(pendingDirectory)).isSymbolicLink())throw Error('Access history storage must not be a symbolic link.');const handle=await fs.open(path.join(directory,staged),'wx',0o600);try{await handle.writeFile(JSON.stringify(envelope));await handle.sync();}finally{await handle.close();}
  await credentials.set(PENDING_KEY,intent);
  try{await fs.rename(path.join(directory,staged),filename);await git(['add','--',relative]);await git(['commit','--quiet','-m',action,'--',relative]);}
  catch{const recorded=await git(['log','-1','--format=%H','--all','--',relative]).catch(()=>null);if(recorded&&recorded.stdout.trim()===''){await git(['update-index','--force-remove','--',relative]);await fs.rm(filename,{force:true});await credentials.delete(PENDING_KEY);}throw Error('Access history could not record the mutation.');}
  await credentials.set(TAIL_KEY,{version:1,hash:intent.hash});await credentials.delete(PENDING_KEY);return record;
 }
 async function snapshot(){const keys=await credentials.list('authenticator:');if(await credentials.get(DISPLAY_KEY)!==null)keys.push(DISPLAY_KEY);if(keys.length>1001)throw Error('Too many authenticator records.');const result={};for(const id of keys){if(!validKey(id))throw Error('Invalid authenticator record identifier.');result[id]=await credentials.get(id);}return result;}
 async function writeSnapshot(value,before){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>1001||Object.keys(value).some(id=>!validKey(id)))throw Error('Invalid encrypted authenticator snapshot.');
  if(typeof credentials.readVersioned!=='function'||typeof credentials.compareAndSetVersioned!=='function')throw Error('Atomic protected-record updates are unavailable.');
  const changes=[...new Set([...Object.keys(before),...Object.keys(value)])].filter(id=>hash(before[id]??null)!==hash(value[id]??null)),written=[];
  const rollback=async()=>{for(const {id,revision} of [...written].reverse()){const result=await credentials.compareAndSetVersioned(id,revision,before[id]??null);if(!result.updated)throw Error('Access records changed concurrently. Review local history before retrying.');}};
  try{for(const id of changes){const current=await credentials.readVersioned(id);if(hash(current.value??null)!==hash(before[id]??null))throw Error('Access records changed concurrently. Review local history before retrying.');const result=await credentials.compareAndSetVersioned(id,current.revision,value[id]??null);if(!result.updated)throw Error('Access records changed concurrently. Review local history before retrying.');written.push({id,revision:result.revision});}}catch(error){await rollback();throw error;}return {rollback,changed:changes.length>0};
 }
 async function mutation(action,transform,{source}={}){const who=actor(),check=authorization(who);return serial(async()=>{check();const k=await key();try{const before=await snapshot(),after=transform(clone(before));check();const transaction=await writeSnapshot(after,before);try{check();if(transaction.changed)await append(typeof action==='function'?action(before):action,after,k,source?{source}:{});check();return true;}catch(error){await transaction.rollback();if(transaction.changed)await append('mutation-rolled-back',before,k).catch(()=>{});throw error;}}finally{k.fill(0);}});}
 const api={
  setCredential(id,value){if(!validKey(id))throw Error('Invalid authenticator record identifier.');return mutation(before=>id===DISPLAY_KEY?'display-name-changed':id==='authenticator:index:v1'?'authenticator-index-updated':Object.hasOwn(before,id)?'authenticator-updated':'authenticator-created',before=>({...before,[id]:clone(value)}));},
  deleteCredential(id){if(!validKey(id))throw Error('Invalid authenticator record identifier.');return mutation('authenticator-removed',before=>{delete before[id];return before;});},
  request(action,payload={}){
   const who=actor();
   if(action==='displayNameSet'){if(typeof payload.value!=='string'||!payload.value||payload.value.length>160||/[\x00-\x1f]/.test(payload.value))throw Error('Invalid display name.');return api.setCredential(DISPLAY_KEY,{value:payload.value});}
   if(action==='displayNameRead')return credentials.get(DISPLAY_KEY).then(record=>({value:record?.value||null}));
   if(action==='historyLock'){epochs.set(who,epoch(who)+1);grants.delete(who);return Promise.resolve(true);}
   if(action==='historyStatus')return Promise.resolve({unlocked:grants.get(who)>now()});
   if(action==='historySetup'||action==='historyUnlock'){
    const start=epoch(who);return serial(async()=>{
     if(typeof payload.password!=='string'||!payload.password||payload.password.length>4096)throw Error('Enter a bounded history password.');
     const current=()=>{if(closed||epoch(who)!==start||actor()!==who)throw Error('Access history '+(action==='historySetup'?'setup':'unlock')+' was cancelled.');};
     const checkWaiting=async()=>{if(getHistoryWaiting){const waiting=await getHistoryWaiting();current();if(waiting.until>now())throw Error('Access history is waiting. Wait until its deadline before retrying.');}};
     let record=await credentials.get(VAULT_KEY),installed;
     try{
      if(action==='historySetup'){
       if(record)throw Error('Access history already has a password.');
       if(typeof credentials.readVersioned!=='function'||typeof credentials.compareAndSetVersioned!=='function')throw Error('Atomic protected-record updates are unavailable.');
       const initial=await credentials.readVersioned(VAULT_KEY);if(initial.value!==null)throw Error('Access history already has a password.');
       await checkWaiting();await initialize();const verifier=await passwordVerifier(payload.password);current();await checkWaiting();
       record={version:1,verifier,key:randomBytes(32).toString('base64')};installed=await credentials.compareAndSetVersioned(VAULT_KEY,initial.revision,record);
       if(!installed.updated)throw Error('Access history already has a password.');current();await checkWaiting();
      }
      if(!record)throw Error('The access history password did not match.');
      const verified=verifyHistory?await verifyHistory(payload.password):{ok:await verifyPassword(payload.password,record.verifier)};
      current();if(!verified.ok){if(verified.until>now())throw Error('Access history is waiting. Wait until its deadline before retrying.');throw Error('The access history password did not match.');}
      const k=await key();try{await read(k);}finally{k.fill(0);}current();grants.set(who,now()+600000);return {unlocked:true};
     }catch(error){
      if(installed?.updated){const restored=await credentials.compareAndSetVersioned(VAULT_KEY,installed.revision,null);if(!restored.updated)throw Error('Access history setup changed concurrently. Review its configuration before retrying.');}
      throw error;
     }
    });
   }
   if(action==='historyRestore'){const check=authorization(who);return serial(async()=>{check();const k=await key();try{const {rows}=await read(k),entry=rows.find(r=>r.id===payload.id);if(!entry)throw Error('Access history entry was not found.');check();const before=await snapshot(),transaction=await writeSnapshot(entry.snapshot,before);try{check();await append('authenticator-restored',entry.snapshot,k,{source:entry.id});check();return {restored:true,displayName:entry.snapshot[DISPLAY_KEY]?.value||null};}catch(error){await transaction.rollback();await append('mutation-rolled-back',before,k).catch(()=>{});throw error;}}finally{k.fill(0);}});}
   const check=authorization(who);return serial(async()=>{check();const k=await key();try{const {rows}=await read(k);check();const retention=rows.filter(r=>r.action==='history-retention-changed').at(-1)?.days||365,pruned=new Set(rows.filter(r=>r.action==='history-pruned').flatMap(r=>r.prunedIds||[])),visible=rows.filter(r=>!pruned.has(r.id));const find=id=>{const entry=visible.find(r=>r.id===id);if(!entry)throw Error('Access history entry was not found.');return entry;};
    if(action==='historyList'){const query=typeof payload.query==='string'?payload.query.toLocaleLowerCase():'';return visible.map(record=>{const label=rows.filter(r=>r.action==='history-labelled'&&r.source===record.id).at(-1)?.label||'';return metadata({...record,label});}).filter(r=>(!query||(r.action+' '+r.label).toLocaleLowerCase().includes(query))&&(!payload.from||r.at>=payload.from)&&(!payload.to||r.at<=payload.to)&&(!payload.action||r.action===payload.action)).reverse();}
    if(action==='historyExport')return {version:1,records:visible.map(metadata),omitted:'Encrypted snapshots, credential values, authenticator secrets and generated codes are omitted.'};
    if(action==='historyDiff'){const a=find(payload.first).snapshot,b=find(payload.second).snapshot;return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(id=>hash(a[id]??null)!==hash(b[id]??null)).map(id=>({id,change:!Object.hasOwn(a,id)?'added':!Object.hasOwn(b,id)?'removed':'changed',valuesOmitted:true}));}
    if(action==='historyLabel'){if(typeof payload.label!=='string'||payload.label.length>160)throw Error('Use a label no longer than 160 characters.');const entry=find(payload.id);await append('history-labelled',await snapshot(),k,{source:entry.id,label:payload.label});check();return true;}
    if(action==='historyRetention'){if(!Number.isInteger(payload.days)||payload.days<1||payload.days>3650)throw Error('Retention must be 1 to 3650 days.');await append('history-retention-changed',await snapshot(),k,{days:payload.days});check();return true;}
    if(action==='historyPrune'){const cutoff=new Date(now()-retention*86400000).toISOString();await append('history-pruned',await snapshot(),k,{prunedIds:visible.filter(r=>r.at<cutoff).map(r=>r.id)});check();return {pruned:true,encryptedHistoryRetained:true};}
    throw Error('Unsupported access history action.');
   }finally{k.fill(0);}});
  },
  close(){closed=true;grants.clear();epochs.clear();},
 };
 return api;
}
