import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildDocumentation,buildGallery} from '../docs/site/publication.mjs';
import { buildDocumentationCatalog } from '../src/features/documentation/catalog.mjs';
import { stageWorkspace } from './build-site-workspace.mjs';
import { addSocialMetadata } from '../docs/site/social-metadata.mjs';
import { currentRelease, publishedDownload } from '../docs/site/release.js';

// Publish only reviewed browser assets. Source snapshots and raw receipts stay outside output.
const staticAssets=['index.html','site.css','site.js','preferences.js','personal-vocabulary.js','local-adapter.js','locales.js','release.js','explainer.js','favicon.svg'];
const illustrationAssets=['images/drive-workflow.png','images/offline-workflow.png'];
async function htmlPages(directory,prefix=''){
 const found=[];
 for(const entry of await fs.readdir(directory,{withFileTypes:true})){
  if(entry.isDirectory())found.push(...await htmlPages(path.join(directory,entry.name),prefix+entry.name+'/'));
  else if(entry.name.endsWith('.html'))found.push(prefix+entry.name);
 }
 return found;
}
// The release record comes from the latest normal release (scripts/generate-release-record.mjs). Without one the committed snapshot is used.
async function readReleaseRecord(recordPath){
 if(!recordPath)return currentRelease;
 const record=JSON.parse(await fs.readFile(recordPath,'utf8'));
 if(!publishedDownload(record))throw new Error('RELEASE_RECORD_INVALID');
 return record;
}
export function applyReleaseRecord(html,record){
 const output=html.replaceAll(currentRelease.tag,record.tag).replaceAll(currentRelease.sourceCommit,record.sourceCommit).replaceAll(currentRelease.sourceCommit.slice(0,12),record.sourceCommit.slice(0,12));
 const embedded=JSON.stringify(record).replaceAll('<','\u003c');
 return output.replace('</body>','<script type="application/json" id="release-record">'+embedded+'</script></body>');
}
export async function stageSite(root=process.cwd(),destination=path.join(root,'out/site')) {
 const target=path.resolve(destination),parent=path.dirname(target);
 await fs.mkdir(parent,{recursive:true});
 const temporary=path.join(parent,'.site-stage-'+randomUUID());
 await fs.mkdir(temporary);
 try {
 for(const file of staticAssets)await fs.copyFile(path.join(root,'docs/site',file),path.join(temporary,file));
 const home=await fs.readFile(path.join(root,'docs/site/index.html'),'utf8');
 const articles=await buildDocumentation(root,temporary,home);
 const images=await buildGallery(root,temporary,home);
 for(const file of [...illustrationAssets,...images.map(image=>image.path)]){
 const output=path.join(temporary,file);await fs.mkdir(path.dirname(output),{recursive:true});await fs.copyFile(path.join(root,'docs',file),output);
 }
 await fs.writeFile(path.join(temporary,'workspace-catalog.json'),JSON.stringify(await buildDocumentationCatalog(root)));
 await stageWorkspace(root,temporary);
 const record=await readReleaseRecord(process.env.RELEASE_RECORD_PATH);
 const homePath=path.join(temporary,'index.html');
 await fs.writeFile(homePath,applyReleaseRecord(await fs.readFile(homePath,'utf8'),record));
 for(const page of await htmlPages(temporary)){
  const file=path.join(temporary,page);
  await fs.writeFile(file,addSocialMetadata(await fs.readFile(file,'utf8'),page));
 }
 const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const builtAt=new Date().toISOString();
 await fs.writeFile(path.join(temporary,'site-provenance.json'),JSON.stringify({schemaVersion:1,version,builtAt,sourceCommit,sourceDirty:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()},null,2)+'\n');
 // Preserve any prior stage rather than discarding unique verification evidence.
 let preservedPrevious=null;
 try{await fs.lstat(target);preservedPrevious=path.join(parent,'.site-previous-'+randomUUID());await fs.rename(target,preservedPrevious);}catch(error){if(error.code!=='ENOENT')throw error;}
 try{await fs.rename(temporary,target);}catch(error){if(preservedPrevious)await fs.rename(preservedPrevious,target);throw error;}
 return {articles:articles.length,images:images.length,preservedPrevious};
 }catch(error){await fs.rm(temporary,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const result=await stageSite();
 console.log(`Staged ${result.articles} complete documentation/wiki articles and ${result.images} reviewed original capture records.`);
 console.log('Staged GitHub Pages site in out/site. Previous output is retained separately when present.');
}
