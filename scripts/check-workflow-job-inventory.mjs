import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Deliberately bounded workflow syntax. Unsupported job syntax fails closed.
export function discoverJobs(source){
 const lines=source.split(/\r?\n/),starts=lines.flatMap((line,index)=>/^jobs:\s*(?:#.*)?$/.test(line)?[index]:[]);
 if(starts.length!==1)throw Error('ONE_EXPLICIT_JOBS_SECTION_REQUIRED');
 let end=lines.length;for(let index=starts[0]+1;index<lines.length;index++)if(/^\S/.test(lines[index])&&!/^#/.test(lines[index])){end=index;break;}
 const headings=[];for(let index=starts[0]+1;index<end;index++){const line=lines[index];if(/^\s*#|^\s*$/.test(line))continue;if(/^\t/.test(line))throw Error('UNSUPPORTED_JOB_INDENT');if(/^  \S/.test(line)){const match=/^  ([A-Za-z_][A-Za-z0-9_-]*):\s*(?:#.*)?$/.exec(line);if(!match)throw Error('UNSUPPORTED_JOB_DECLARATION');headings.push({id:match[1],index});}}
 if(!headings.length||new Set(headings.map(row=>row.id)).size!==headings.length)throw Error('MISSING_OR_DUPLICATE_JOBS');
 return new Map(headings.map((row,index)=>[row.id,lines.slice(row.index,headings[index+1]?.index??end).join('\n')]));
}
export function validateInventory(workflows,manifest,readInventory){
 if(manifest.schemaVersion!==1||!Array.isArray(manifest.jobs))throw Error('INVALID_JOB_INVENTORY');
 const discovered=new Map();for(const [file,source]of workflows)for(const [job,body]of discoverJobs(source))discovered.set(file+'#'+job,body);
 const listed=manifest.jobs.map(row=>row.workflow+'#'+row.job);if(new Set(listed).size!==listed.length||listed.length!==discovered.size||listed.some(key=>!discovered.has(key)))throw Error('WORKFLOW_JOB_INVENTORY_MISMATCH');
 for(const row of manifest.jobs){const body=discovered.get(row.workflow+'#'+row.job);
  if(row.bootstrapApplicable===false){if(row.workflow!=='.github/workflows/release-verified-windows.yml'||row.job!=='explain'||!row.reason||row.onlyRun!=="echo 'Preview publication runs once in windows.yml. This retired route never publishes.'"||body.match(/^\s+- run:/gm)?.length!==1||!body.includes('- run: '+row.onlyRun)||/uses:/.test(body))throw Error('INVALID_BOOTSTRAP_NONAPPLICABILITY');continue;}
  if(typeof row.inventory!=='string'||!row.inventory.startsWith('scripts/')&&!row.inventory.startsWith('.github/workflows/')||row.inventory.includes('..'))throw Error('MISSING_DEPENDENCY_INVENTORY');
  const inventory=readInventory(row.inventory);if(inventory.schemaVersion!==1||inventory.workflow!==row.workflow)throw Error('WRONG_DEPENDENCY_INVENTORY');
  const record=row.record==='.'?inventory:row.record.split('.').reduce((value,key)=>value?.[key],inventory);
  const tools=record?.tools||record?.dependencies;if(!Array.isArray(tools)||!tools.length||!Array.isArray(record?.bootstrapMarkers)||!record.bootstrapMarkers.length)throw Error('MISSING_DEPENDENCY_OR_BOOTSTRAP_RECORD');
  if(row.record==='.'&&inventory.job!==row.job)throw Error('WRONG_JOB_RECORD');
  for(const marker of record.bootstrapMarkers)if(typeof marker!=='string'||!marker.trim()||!body.includes(marker))throw Error('JOB_BOOTSTRAP_MISSING');
 }
 return discovered.size;
}
async function main(){
 const directory='.github/workflows',files=(await fs.readdir(directory)).filter(file=>/\.ya?ml$/.test(file));const workflows=new Map(await Promise.all(files.map(async file=>[directory+'/'+file,await fs.readFile(directory+'/'+file,'utf8')])));
 const manifest=JSON.parse(await fs.readFile(directory+'/jobs.inventory.json','utf8')),inventories=new Map();for(const row of manifest.jobs)if(row.inventory&&!inventories.has(row.inventory))inventories.set(row.inventory,JSON.parse(await fs.readFile(row.inventory,'utf8')));
 const read=file=>{if(!inventories.has(file))throw Error('DEPENDENCY_INVENTORY_ABSENT');return inventories.get(file);};const count=validateInventory(workflows,manifest,read);
 if(process.argv.includes('--self-test')){
  const omitted=structuredClone(manifest);omitted.jobs.pop();assert.throws(()=>validateInventory(workflows,omitted,read));
  const unknown=structuredClone(manifest);unknown.jobs[0].job='unknown';assert.throws(()=>validateInventory(workflows,unknown,read));
  const missing=structuredClone(manifest);missing.jobs[0].inventory='scripts/missing-inventory.json';assert.throws(()=>validateInventory(workflows,missing,read));
  const noBootstrap=structuredClone(inventories.get(manifest.jobs[0].inventory));noBootstrap.jobs.windows.bootstrapMarkers=[];assert.throws(()=>validateInventory(workflows,manifest,file=>file===manifest.jobs[0].inventory?noBootstrap:read(file)));
  const changed=new Map(workflows);changed.set('.github/workflows/pages.yml',changed.get('.github/workflows/pages.yml').replace('actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020','removed-node-bootstrap'));assert.throws(()=>validateInventory(changed,manifest,read),/JOB_BOOTSTRAP_MISSING/);assert.equal(validateInventory(workflows,manifest,read),count);
  const extra=new Map(workflows);extra.set('.github/workflows/unknown.yml','jobs:\n  extra:\n    runs-on: ubuntu-24.04\n');assert.throws(()=>validateInventory(extra,manifest,read));
  console.log('PASS: actual workflow discovery rejects omitted/unknown jobs, absent inventories and removed bootstrap, then accepts restored input.');
 }
 console.log(`PASS: ${count} actual workflow jobs have explicit dependency/bootstrap records or exact retired-job nonapplicability. Fresh-cloud execution remains separate.`);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main().catch(error=>{console.error(error.message);process.exitCode=1;});
