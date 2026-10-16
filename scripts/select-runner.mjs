import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Decides at run time which runner the Windows build job uses. A compatible self-hosted runner is used
// only when it is online, idle, accessible to this repository and carries every required label.
// Anything else (no permission, API error, no idle runner) falls back to the pinned hosted image.
export const HOSTED_FALLBACK='windows-2022';
export const DEFAULT_REQUIRED_LABELS=['self-hosted','Windows','X64'];
const API='https://api.github.com';

const norm=value=>String(value||'').trim().toLowerCase();
const labelNames=runner=>(Array.isArray(runner?.labels)?runner.labels:[]).map(label=>norm(typeof label==='string'?label:label?.name));

export function parseLabels(text){
 const list=String(text||'').split(',').map(label=>label.trim()).filter(Boolean);
 return list.length?list:DEFAULT_REQUIRED_LABELS.slice();
}

// Pure decision. `runners` is the combined inventory the caller could read; `inventoryError`, when set,
// means the inventory is unknown and the hosted fallback is chosen.
export function selectRunner({runners=[],requiredLabels=DEFAULT_REQUIRED_LABELS,hostedLabel=HOSTED_FALLBACK,inventoryError=null,sources=[]}={}){
 const required=requiredLabels.map(norm);
 const base={hostedLabel,requiredLabels:requiredLabels.slice(),sources,inventoryCount:Array.isArray(runners)?runners.length:0};
 if(inventoryError)return {...base,kind:'hosted',runner:hostedLabel,reason:'inventory-unavailable: '+inventoryError,considered:[]};
 const considered=(Array.isArray(runners)?runners:[]).map(runner=>{
  const labels=labelNames(runner);
  let skip=null;
  if(runner?.status!=='online')skip='offline';
  else if(runner?.busy)skip='busy';
  else if(!required.every(label=>labels.includes(label)))skip='missing-required-labels';
  return {name:String(runner?.name||''),id:runner?.id??null,status:runner?.status??null,busy:Boolean(runner?.busy),skipped:skip};
 });
 const available=considered.filter(row=>!row.skipped).sort((a,b)=>a.name.localeCompare(b.name));
 if(available.length)return {...base,kind:'self-hosted',runner:requiredLabels.slice(),reason:`${available.length} idle online runner(s) match every required label; first by name: ${available[0].name}`,considered,idle:available.length};
 return {...base,kind:'hosted',runner:hostedLabel,reason:considered.length?'no online idle runner carries every required label':'no self-hosted runners visible to this repository',considered,idle:0};
}

async function getJson(fetchImpl,url,token){
 const response=await fetchImpl(url,{headers:{accept:'application/vnd.github+json','x-github-api-version':'2022-11-28',...(token?{authorization:'Bearer '+token}:{})},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error(`HTTP ${response.status} for ${url.replace(API,'')}`);
 return response.json();
}

async function paged(fetchImpl,url,token,key){
 const rows=[];
 for(let page=1;page<=10;page++){
  const body=await getJson(fetchImpl,url+(url.includes('?')?'&':'?')+'per_page=100&page='+page,token);
  const batch=Array.isArray(body)?body:body?.[key]||[];
  rows.push(...batch);
  if(batch.length<100)break;
 }
 return rows;
}

// Reads repository-level runners, then organization runner groups this repository may use.
// Throws when nothing could be read, so the caller falls back to the hosted image. A source that fails is
// recorded and skipped while another readable source can still supply runners.
export async function fetchInventory({repository,token,fetchImpl=fetch,isPrivate=false}){
 const [owner]=String(repository||'').split('/');
 if(!owner||!repository.includes('/'))throw Error('repository is not owner/name');
 if(!token)throw Error('no token available');
 const sources=[],runners=[];
 try{
  const rows=await paged(fetchImpl,`${API}/repos/${repository}/actions/runners`,token,'runners');
  runners.push(...rows);sources.push({source:'repository',ok:true,count:rows.length});
 }catch(error){sources.push({source:'repository',ok:false,error:error.message});}
 try{
  const groups=await paged(fetchImpl,`${API}/orgs/${owner}/actions/runner-groups`,token,'runner_groups');
  let usable=0;
  for(const group of groups){
   if(!isPrivate&&group.allows_public_repositories===false)continue;
   if(group.visibility==='selected'){
    const repos=await paged(fetchImpl,`${API}/orgs/${owner}/actions/runner-groups/${group.id}/repositories`,token,'repositories');
    if(!repos.some(repo=>repo.full_name===repository))continue;
   }else if(group.visibility==='private'&&!isPrivate)continue;
   const rows=await paged(fetchImpl,`${API}/orgs/${owner}/actions/runner-groups/${group.id}/runners`,token,'runners');
   runners.push(...rows);usable++;
  }
  sources.push({source:'organization-groups',ok:true,groups:groups.length,usableGroups:usable});
 }catch(error){sources.push({source:'organization-groups',ok:false,error:error.message});}
 if(!sources.some(source=>source.ok))throw Error(sources.map(source=>`${source.source}: ${source.error}`).join('; '));
 const seen=new Set(),unique=runners.filter(runner=>{const key=runner?.id??runner?.name;if(seen.has(key))return false;seen.add(key);return true;});
 return {runners:unique,sources};
}

export function renderSummary(decision){
 const lines=['## Runner selection',''];
 lines.push(`- Decision: **${decision.kind}**`,`- Runner: \`${JSON.stringify(decision.runner)}\``,`- Reason: ${decision.reason}`);
 lines.push(`- Required labels: ${decision.requiredLabels.map(label=>'`'+label+'`').join(', ')}`,`- Hosted fallback image: \`${decision.hostedLabel}\``,`- Runners inventoried: ${decision.inventoryCount}; idle and matching: ${decision.idle??0}`);
 for(const source of decision.sources||[])lines.push(`- Source ${source.source}: ${source.ok?'read':'unavailable ('+source.error+')'}`);
 if(decision.considered?.length){lines.push('','| Runner | Status | Busy | Skipped because |','| --- | --- | --- | --- |');for(const row of decision.considered)lines.push(`| ${row.name} | ${row.status} | ${row.busy} | ${row.skipped||'selected candidate'} |`);}
 lines.push('','Runner choice is a capacity decision only and is not a verification verdict.','');
 return lines.join('\n');
}

export async function decide({env=process.env,fetchImpl=fetch}={}){
 const requiredLabels=parseLabels(env.RUNNER_REQUIRED_LABELS);
 const hostedLabel=env.RUNNER_HOSTED_FALLBACK||HOSTED_FALLBACK;
 try{
  const {runners,sources}=await fetchInventory({repository:env.GITHUB_REPOSITORY,token:env.RUNNER_INVENTORY_TOKEN,fetchImpl,isPrivate:env.REPOSITORY_PRIVATE==='true'});
  return selectRunner({runners,requiredLabels,hostedLabel,sources});
 }catch(error){
  return selectRunner({requiredLabels,hostedLabel,inventoryError:error.message});
 }
}

async function main(){
 const decision=await decide();
 const output=process.env.GITHUB_OUTPUT,summary=process.env.GITHUB_STEP_SUMMARY;
 if(output)fs.appendFileSync(output,`runner=${JSON.stringify(decision.runner)}\nkind=${decision.kind}\n`);
 if(summary)fs.appendFileSync(summary,renderSummary(decision));
 const evidenceDirectory=process.env.RUNNER_EVIDENCE_DIRECTORY;
 if(evidenceDirectory){fs.mkdirSync(evidenceDirectory,{recursive:true});fs.writeFileSync(path.join(evidenceDirectory,'runner-selection.json'),JSON.stringify({recordedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID||null,sha:process.env.GITHUB_SHA||null,...decision},null,2));}
 console.log(renderSummary(decision));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main().catch(error=>{console.error(error.message);process.exitCode=1;});
