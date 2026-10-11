import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createForgeToolResolver,captureSelectedForgeCredential} from './forge-transport.js';

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
export function quoteForgeHelper(executable){if(typeof executable!=='string'||!path.isAbsolute(executable)||/[\x00-\x1f\x7f]/.test(executable))throw new Error('Invalid bundled credential helper.');return "!'"+executable.replaceAll('\\','/').replaceAll("'","'\"'\"'")+"' auth git-credential";}
export function createForgeWorkflow({dataDirectory,toolsDirectory,resolveTool=createForgeToolResolver(toolsDirectory),captureCredential=captureSelectedForgeCredential,execute=runForgeCommand,env=process.env,credentialStorageCheck,onAuthenticationChallenge=()=>{}}={}){
 let closed=false,busy=false,cancelGeneration=0;const controllers=new Set(),plans=new Map(),operationContext=new AsyncLocalStorage();
 function checkCancellation(){const operation=operationContext.getStore();if(closed||operation&&operation.generation!==cancelGeneration)throw new Error('Forge operation cancelled. No further action will start.');}
 async function checked(promise){checkCancellation();const result=await promise;checkCancellation();return result;}
 const safeEnv={...env};for(const key of Object.keys(safeEnv))if(key.startsWith('GIT_')||['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN','GH_DEBUG','GH_REPO','GH_API_HOST'].includes(key))delete safeEnv[key];safeEnv.GH_HOST='github.com';safeEnv.GH_PROMPT_DISABLED='1';safeEnv.GIT_CONFIG_GLOBAL=process.platform==='win32'?'NUL':'/dev/null';safeEnv.GIT_CONFIG_NOSYSTEM='1';safeEnv.GIT_TERMINAL_PROMPT='0';
 const storageCheck=credentialStorageCheck||(async()=>{
  if(process.platform!=='win32')throw new Error('Protected forge credentials require the supported Windows host.');
  const folder=env.GH_CONFIG_DIR||path.join(env.APPDATA||path.join(env.USERPROFILE||'','AppData','Roaming'),'GitHub CLI');
  try{const filename=path.join(folder,'hosts.yml'),stat=await fs.stat(filename);if(stat.size>262144)throw new Error('Forge account configuration exceeds its limit.');const text=await fs.readFile(filename,'utf8');if(/^\s*oauth_token\s*:/m.test(text))throw new Error('Forge credentials must use the operating-system credential store. Sign out and sign in with secure storage.');}catch(error){if(error.code!=='ENOENT')throw error;}
 });
 async function command(file,args,options={}){checkCancellation();const executable=await checked(resolveTool(file));const controller=new AbortController();controllers.add(controller);try{checkCancellation();try{return await checked(execute(executable,args,{...options,onAuthenticationChallenge:options.interactive?onAuthenticationChallenge:undefined,signal:controller.signal,env:operationContext.getStore()?.boundEnv||safeEnv}));}catch{checkCancellation();throw new Error('Forge command failed. No diagnostic output is exposed.');}}finally{controllers.delete(controller);}}
 async function gh(args,options){await checked(storageCheck());const result=await command('gh',args,options);if(result.code!==0)throw new Error('Forge command failed or was cancelled. Retry authentication or inspect the destination.');return result.output;}
 async function serialized(fn){if(busy)throw new Error('Another forge operation is active.');checkCancellation();busy=true;try{return await operationContext.run({generation:cancelGeneration},async()=>{checkCancellation();const result=await fn();if(!(result?.published===false&&result.state==='cancelled'))checkCancellation();return result;});}finally{busy=false;}}
 async function withSelectedAccount(accountId,fn){
  if(!validLogin(accountId))throw new Error('Choose a signed-in account.');checkCancellation();const executable=await checked(resolveTool('gh'));await checked(storageCheck());const controller=new AbortController();controllers.add(controller);let credential,childEnvironment;
  try{
   try{checkCancellation();credential=await captureCredential(executable,accountId,{signal:controller.signal,env:safeEnv});checkCancellation();}catch{checkCancellation();throw new Error('The selected account protected credential is unavailable. Sign in to that account again.');}
   if(!Buffer.isBuffer(credential)||credential.length>4096)throw new Error('The selected account protected credential is unavailable.');const value=credential.toString('utf8').trim();if(!/^[A-Za-z0-9_]{1,4096}$/.test(value))throw new Error('The selected account protected credential is unavailable.');credential.fill(0);
   childEnvironment={...safeEnv,GH_TOKEN:value};const context=operationContext.getStore();context.boundEnv=childEnvironment;
   const viewer=JSON.parse(await gh(['api','user']));if(viewer.login!==accountId)throw new Error('The protected credential does not match the reviewed account. No publication will start.');checkCancellation();return await fn();
  }finally{credential?.fill?.(0);if(childEnvironment)delete childEnvironment.GH_TOKEN;const context=operationContext.getStore();if(context)delete context.boundEnv;controllers.delete(controller);}
 }
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
   checkCancellation();const id=randomUUID(),plan={id,...source,accountId,ownerId,name,visibility,route,upstream:route==='fork'?upstream:null,destination:ownerId+'/'+name,state:'prepared'};plans.set(id,plan);return{id,revision:plan.revision,accountId,ownerId,name,visibility,route,destination:plan.destination,publicationAvailable:true,includesCompleteHistory:route==='copy-push',warning:route==='copy-push'?'The complete committed source history will be uploaded. Review it for private information before confirming.':'The provider will fork the selected upstream. Local changes are not uploaded.'};
  }),
  publish:({id,confirmation})=>serialized(async()=>{
   const plan=plans.get(id);if(!plan||plan.state!=='prepared'||confirmation!==plan.destination)throw new Error('Confirm the exact prepared destination.');let staging;const completedActions=[],attemptedActions=[];
   try{return await withSelectedAccount(plan.accountId,async()=>{
    const source=await sourceState(plan.folder);if(source.revision!==plan.revision)throw new Error('The source changed. Prepare and review publication again.');plan.state='publishing';
    if(plan.route==='copy-push'){
     if(!dataDirectory)throw new Error('Publication staging is unavailable.');const parent=path.join(dataDirectory,'publication-staging');await checked(fs.mkdir(parent,{recursive:true,mode:0o700}));checkCancellation();staging=await fs.mkdtemp(path.join(parent,'publish-'));checkCancellation();
     const cloned=await command('git',['clone','--bare','--no-local','--no-hardlinks','--',plan.folder,staging]);if(cloned.code)throw new Error('Source snapshot could not be prepared.');
     checkCancellation();attemptedActions.push('repository-creation');await gh(['repo','create',plan.destination,'--'+plan.visibility]);completedActions.push('repository-created');
     const helper=quoteForgeHelper(await checked(resolveTool('gh')));checkCancellation();attemptedActions.push('revision-upload');const pushed=await command('git',['-C',staging,'-c','core.hooksPath='+path.join(staging,'disabled-hooks'),'-c','credential.helper=','-c','credential.helper='+helper,'-c','push.gpgSign=false','-c','protocol.ext.allow=never','push','--no-verify','https://github.com/'+plan.destination+'.git',plan.revision+':refs/heads/main']);if(pushed.code)throw new Error('Upload did not complete.');completedActions.push('revision-uploaded');
    }else{checkCancellation();attemptedActions.push('repository-fork');await gh(['repo','fork',plan.upstream,'--clone=false','--remote=false','--fork-name',plan.name,...(plan.ownerId===plan.accountId?[]:['--org',plan.ownerId])]);completedActions.push('repository-forked');}
    const result=JSON.parse(await gh(['repo','view',plan.destination,'--json','nameWithOwner,url,isPrivate,isFork']));if(result.nameWithOwner!==plan.destination||result.isPrivate!==(plan.visibility==='private')||plan.route==='fork'&&result.isFork!==true)throw new Error('Destination properties require review.');
    if(plan.route==='copy-push'){const helper=quoteForgeHelper(await checked(resolveTool('gh'))),proof=await command('git',['-C',staging,'-c','credential.helper=','-c','credential.helper='+helper,'ls-remote','https://github.com/'+plan.destination+'.git','refs/heads/main']);if(proof.code||proof.output.split(/\s/)[0]!==plan.revision)throw new Error('Uploaded revision could not be verified.');}checkCancellation();plan.state='completed';return{published:true,route:plan.route,destination:plan.destination,url:result.url,revision:plan.route==='copy-push'?plan.revision:null,completedActions};
   });}catch(error){plan.state='failed';return{published:false,route:plan.route,destination:plan.destination,state:closed||operationContext.getStore()?.generation!==cancelGeneration?'cancelled':'failed',completedActions,attemptedActions,externalStateRequiresReview:attemptedActions.length>0,error:closed||operationContext.getStore()?.generation!==cancelGeneration?'Publication cancelled. An attempted provider operation may have completed; inspect the destination.':'Publication did not complete. Inspect authentication, source and destination before preparing again.'};}finally{if(staging)await fs.rm(staging,{recursive:true,force:true});}
  }),
  cancel(){cancelGeneration++;for(const controller of controllers)controller.abort();},
  close(){closed=true;cancelGeneration++;for(const controller of controllers)controller.abort();plans.clear();},
 };
}
