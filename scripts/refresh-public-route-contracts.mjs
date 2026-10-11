import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {REQUIRED_FEATURE_IDS} from '../src/features/documentation/required-features.mjs';
import {route} from '../docs/site/publication.mjs';

// Refresh declarations only. Never erase or manufacture accepted browser evidence.
export function refreshRouteInventory(inventory, catalog) {
 const nested=['preferences','local-access','language','appearance','schedules','attention','private-history','page-search','settings-search','regex-builder','command-palette','notifications','context-menu','confirmation'];
 const definitions=[['index.html','home'],['library.html','library'],['wiki.html','wiki-index'],['gallery.html','gallery'],['workspace.html','workspace'],...catalog.categories.map(id=>[`categories/${id}.html`,'category']),...catalog.articles.map(source=>[route(source),'article']),...catalog.wiki.files.map(file=>[route('wiki/'+file),'wiki-article'])];
 if(new Set(definitions.map(([name])=>name)).size!==definitions.length)throw Error('Duplicate generated route.');
 for(const row of [...inventory.features,...inventory.routes])if(row.status!=='unverified'||!Array.isArray(row.browserEvidence)||row.browserEvidence.length)throw Error('Evidence-bearing inventory requires explicit reviewed reconciliation.');
 if(new Set(inventory.features.map(row=>row.id)).size!==inventory.features.length||new Set(inventory.routes.map(row=>row.path)).size!==inventory.routes.length)throw Error('Duplicate existing declaration.');
 const features=new Map(inventory.features.map(row=>[row.id,row]));
 const routes=new Map(inventory.routes.map(row=>[row.path,row]));
 return {...inventory,features:REQUIRED_FEATURE_IDS.map(id=>features.get(id)||{id,status:'unverified',reason:'Requires feature-specific implementation review and actual-route evidence; enumeration is not delivery.',browserEvidence:[]}),routes:definitions.map(([name,family])=>({...routes.get(name),path:name,family,shell:family==='workspace'?'workspace.js':'site.js',contracts:[...REQUIRED_FEATURE_IDS],status:'unverified',browserEvidence:[],nestedSurfaces:[...new Set([...nested,...(routes.get(name)?.nestedSurfaces||[])])]}))};
}

export async function refreshPublicRouteContracts(root,{check=false}={}) {
 const filename=path.join(root,'docs/features/platform/public-route-contracts.json');
 const original=await fs.readFile(filename,'utf8');
 const catalog=JSON.parse(await fs.readFile(path.join(root,'docs/site/content-catalog.json'),'utf8'));
 const result=refreshRouteInventory(JSON.parse(original),catalog),text=JSON.stringify(result,null,2)+'\n';
 if(check&&original.replaceAll('\r\n','\n')!==text)throw Error('Public route inventory is stale. Run node scripts/refresh-public-route-contracts.mjs.');
 if(!check)await fs.writeFile(filename,text);
 return {features:result.features.length,routes:result.routes.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const root=fileURLToPath(new URL('../',import.meta.url));
 console.log(JSON.stringify(await refreshPublicRouteContracts(root,{check:process.argv.includes('--check')})));
}
