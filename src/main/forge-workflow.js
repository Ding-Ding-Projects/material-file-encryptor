import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';

const loginPattern=/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const repoPattern=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const validLogin=value=>typeof value==='string'&&loginPattern.test(value);
const validRepo=value=>typeof value==='string'&&repoPattern.test(value)&&!value.endsWith('.git');
export function runForgeCommand(file,args,{cwd,signal,env=process.env,interactive=false,onAuthenticationChallenge}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(file,args,{cwd,signal,env,shell:false,windowsHide:true,stdio:[interactive?'pipe':'ignore','pipe','pipe']});let output='',bytes=0,challengeSent=false,browserOpened=false;
  const timer=setTimeout(()=>child.kill(),interactive?600000:60000);
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>262144){child.kill();return;}output+=chunk.toString('utf8');if(interactive){const match=output.match(/(?:one-time code|code)\s*:\s*([A-Z0-9]{4}-[A-Z0-9]{4})\b/i);if(match&&!challengeSent){challengeSent=true;try{onAuthenticationChallenge?.({verificationUri:'https://github.com/login/device',userCode:match[1],expiresInSeconds:null});}catch{child.kill();}}if(!browserOpened&&/Press Enter to open/i.test(output)){browserOpened=true;child.stdin.write('\n');}}});
  child.once('error',()=>{clearTimeout(timer);reject(new Error('Forge command could not start.'));});
  child.once('close',code=>{clearTimeout(timer);if(bytes>262144)return reject(new Error('Forge response exceeded its limit.'));resolve({code,output});});
 });
}

/** gh owns account credentials. This service never returns credential values to callers. */
export function createForgeWorkflow({dataDirectory,execute=runForgeCommand,env=process.env,credentialStorageCheck,onAuthenticationChallenge=()=>{}}={}){
 let closed=false,busy=false,cancelGeneration=0;const controllers=new Set(),plans=new Map(),operationContext=new AsyncLocalStorage();
 const publicationUnavailable='Publication is unavailable: the supported GitHub CLI cannot durably bind every command and Git credential lookup to the reviewed account without exposing credentials. No repository was created or uploaded.';
 function checkCancellation(){const operation=operationContext.getStore();if(closed||operation&&operation.generation!==cancelGeneration)throw new Error('Forge operation cancelled. No further action will start.');}
 async function checked(promise){checkCancellation();const result=await promise;checkCancellation();return result;}
 const safeEnv={...env};for(const key of Object.keys(safeEnv))if(key.startsWith('GIT_')||['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN'].includes(key))delete safeEnv[key];safeEnv.GH_HOST='github.com';safeEnv.GH_PROMPT_DISABLED='1';safeEnv.GIT_CONFIG_GLOBAL=process.platform==='win32'?'NUL':'/dev/null';safeEnv.GIT_CONFIG_NOSYSTEM='1';safeEnv.GIT_TERMINAL_PROMPT='0';
 const storageCheck=credentialStorageCheck||(async()=>{
  if(process.platform!=='win32')throw new Error('Protected forge credentials require the supported Windows host.');
  const folder=env.GH_CONFIG_DIR||path.join(env.APPDATA||path.join(env.USERPROFILE||'','AppData','Roaming'),'GitHub CLI');
  try{const filename=path.join(folder,'hosts.yml'),stat=await fs.stat(filename);if(stat.size>262144)throw new Error('Forge account configuration exceeds its limit.');const text=await fs.readFile(filename,'utf8');if(/^\s*oauth_token\s*:/m.test(text))throw new Error('Forge credentials must use the operating-system credential store. Sign out and sign in with secure storage.');}catch(error){if(error.code!=='ENOENT')throw error;}
 });
 async function command(file,args,options={}){checkCancellation();const controller=new AbortController();controllers.add(controller);try{checkCancellation();return await checked(execute(file,args,{...options,onAuthenticationChallenge:options.interactive?onAuthenticationChallenge:undefined,signal:controller.signal,env:safeEnv}));}finally{controllers.delete(controller);}}
 async function gh(args,options){await checked(storageCheck());const result=await command('gh',args,options);if(result.code!==0)throw new Error('Forge command failed or was cancelled. Retry authentication or inspect the destination.');return result.output;}
 async function serialized(fn){if(busy)throw new Error('Another forge operation is active.');checkCancellation();busy=true;try{return await operationContext.run({generation:cancelGeneration},async()=>{checkCancellation();const result=await fn();checkCancellation();return result;});}finally{busy=false;}}
 async function accounts(){await checked(storageCheck());const result=await command('gh',['auth','status','--hostname','github.com']);if(result.code!==0)return[];const rows=[];let current;
  for(const line of result.output.split(/\r?\n/)){const match=line.match(/Logged in to github\.com account ([A-Za-z0-9-]+) \(([^)]+)\)/);if(match){if(!validLogin(match[1])||!/keyring|credential/i.test(match[2]))throw new Error('Forge credentials must use the operating-system credential store.');current={id:match[1],label:match[1],active:false};rows.push(current);}if(current&&/Active account: true/.test(line))current.active=true;}
  return rows;
 }
 async function active(accountId){if(!validLogin(accountId))throw new Error('Choose a signed-in account.');const list=await accounts();if(!list.some(row=>row.id===accountId&&row.active))throw new Error('Set the selected account active before continuing.');const viewer=JSON.parse(await gh(['api','user']));if(viewer.login!==accountId)throw new Error('The active account changed. Review the account again.');}
 async function owners(accountId){await active(accountId);const data=JSON.parse(await gh(['api','graphql','-f','query=query { viewer { login organizations(first:100) { nodes { login viewerCanCreateRepositories } } } }']));const viewer=data.data?.viewer;if(viewer?.login!==accountId)throw new Error('The selected account could not be verified.');return[{id:accountId,label:accountId,canFork:true},...(viewer.organizations?.nodes||[]).filter(row=>validLogin(row.login)&&row.viewerCanCreateRepositories===true).map(row=>({id:row.login,label:row.login,canFork:true}))];}
 async function sourceState(folder){const real=await checked(fs.realpath(folder));if(!(await checked(fs.lstat(real))).isDirectory())throw new Error('Choose a repository folder.');const root=await command('git',['-C',real,'rev-parse','--show-toplevel']);if(root.code||path.resolve(root.output.trim())!==real)throw new Error('Choose the repository root.');const status=await command('git',['-C',real,'-c','core.fsmonitor=false','status','--porcelain']);if(status.code||status.output.trim())throw new Error('Save and commit all source changes before publishing.');const head=await command('git',['-C',real,'rev-parse','HEAD']);if(head.code||! /^[a-f0-9]{40,64}$/.test(head.output.trim()))throw new Error('The source revision is unavailable.');return{folder:real,revision:head.output.trim()};}
 return{
  accounts,owners,
  signIn:()=>serialized(async()=>{await gh(['auth','login','--hostname','github.com','--git-protocol','https','--web'],{interactive:true});return accounts();}),
  refresh:({accountId})=>serialized(async()=>{if(!validLogin(accountId))throw new Error('Choose a signed-in account.');throw new Error('Account refresh is unavailable until the supported CLI refresh transaction can be durably bound to the selected account. Add the account again through browser sign-in.');}),
  setActive:({accountId})=>serialized(async()=>{if(!(await accounts()).some(row=>row.id===accountId))throw new Error('Choose a signed-in account.');await gh(['auth','switch','--hostname','github.com','--user',accountId]);return accounts();}),
  signOut:({accountId})=>serialized(async()=>{if(!(await accounts()).some(row=>row.id===accountId))throw new Error('Choose a signed-in account.');await gh(['auth','logout','--hostname','github.com','--user',accountId]);return accounts();}),
  prepare:({folder,accountId,ownerId,name,visibility,route,upstream})=>serialized(async()=>{
   if(!validRepo(name)||!validLogin(ownerId)||!['public','private'].includes(visibility)||!['copy-push','fork'].includes(route))throw new Error('Choose a valid destination and publication route.');if(!(await owners(accountId)).some(row=>row.id===ownerId))throw new Error('Choose an available owner.');
   const source=await sourceState(folder);if(route==='fork'&&(typeof upstream!=='string'||upstream.split('/').length!==2||!validLogin(upstream.split('/')[0])||!validRepo(upstream.split('/')[1])))throw new Error('Choose an exact upstream owner/repository.');if(route==='fork'){const original=JSON.parse(await gh(['repo','view',upstream,'--json','isPrivate']));if(original.isPrivate!==(visibility==='private'))throw new Error('A fork must retain the upstream visibility. Choose copy-and-push for another visibility.');}
   checkCancellation();const id=randomUUID(),plan={id,...source,accountId,ownerId,name,visibility,route,upstream:route==='fork'?upstream:null,destination:ownerId+'/'+name,state:'prepared'};plans.set(id,plan);return{id,revision:plan.revision,accountId,ownerId,name,visibility,route,destination:plan.destination,publicationAvailable:false,unavailableReason:publicationUnavailable,includesCompleteHistory:route==='copy-push',warning:route==='copy-push'?'The complete committed source history would be uploaded. Review it for private information before confirming.':'The provider would fork the selected upstream. Local changes would not be uploaded.'};
  }),
  publish:({id,confirmation})=>serialized(async()=>{
   const plan=plans.get(id);if(!plan||plan.state!=='prepared'||confirmation!==plan.destination)throw new Error('Confirm the exact prepared destination.');checkCancellation();throw new Error(publicationUnavailable);
  }),
  cancel(){cancelGeneration++;for(const controller of controllers)controller.abort();},
  close(){closed=true;cancelGeneration++;for(const controller of controllers)controller.abort();plans.clear();},
 };
}
