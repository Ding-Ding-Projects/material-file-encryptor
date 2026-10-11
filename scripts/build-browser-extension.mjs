import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function compileExtensionSource({root,entry,output}){
 const relative=path.relative(root,output).replaceAll('\\','/');if(relative.startsWith('../')||path.isAbsolute(relative)||/[\s&|<>^%!"'`$\x00-\x1f]/.test(relative)||!['scripts/browser-extension-search-entry.js','src/shared/surface/regex-worker.js'].includes(entry))throw new Error('Extension compiler requires a bounded internal output path.');
 const args=['exec','--yes','--package=esbuild@0.25.11','--','esbuild',entry,'--bundle','--format=esm','--target=es2022','--legal-comments=inline','--outfile='+relative];
 const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{cwd:root,stdio:'inherit',shell:process.platform==='win32'});if(result.status!==0)throw new Error('Local browser extension bundle did not complete.');
}
export async function stageBrowserExtension({root=process.cwd(),destination=path.join(root,'out/browser-extension'),compile=compileExtensionSource}={}){
 root=await fs.realpath(root);destination=path.resolve(destination);const parent=path.dirname(destination);await fs.mkdir(parent,{recursive:true});const stage=path.join(parent,'.browser-extension-stage-'+randomUUID());await fs.mkdir(path.join(stage,'vendor'),{recursive:true});const sourceFiles=[];
 try{
  const manifest=JSON.parse(await fs.readFile(path.join(root,'browser-extension/manifest.json'),'utf8'));if(manifest.manifest_version!==3||manifest.action?.default_popup!=='popup.html'||manifest.background?.service_worker!=='background.js'||JSON.stringify([...manifest.permissions].sort())!==JSON.stringify(['contextMenus','nativeMessaging'].sort())||manifest.host_permissions?.length)throw new Error('Unsupported browser extension permissions or entrypoints.');
  manifest.content_security_policy={extension_pages:"script-src 'self'; object-src 'none'; worker-src 'self'; connect-src 'none'; base-uri 'none';"};
  await fs.writeFile(path.join(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  for(const name of ['background.js','popup.html','popup.js','popup.css']){const file=path.join(root,'browser-extension',name);try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw new Error();const bytes=await fs.readFile(file);if(name==='popup.html'&&(/<(?:script|link)[^>]+(?:src|href)\s*=\s*["'](?:https?:|\/\/)/i.test(bytes.toString())||/\son\w+\s*=/i.test(bytes.toString())))throw new Error('Popup contains external or inline executable content.');await fs.writeFile(path.join(stage,name),bytes);sourceFiles.push({path:'browser-extension/'+name,sha256:digest(bytes)});}catch(error){if(name==='popup.css'&&error.code==='ENOENT')continue;throw error;}}
  const material=await fs.readFile(path.join(root,'src/shared/surface/material.js'));if(!material.toString('utf8',0,256).includes('Vendor source: @material/web 2.5.0; esbuild 0.25.11.'))throw new Error('Pinned local Material bundle provenance is unavailable.');await fs.writeFile(path.join(stage,'vendor/material.js'),material);
  await compile({root,entry:'scripts/browser-extension-search-entry.js',output:path.join(stage,'vendor/search.js')});await compile({root,entry:'src/shared/surface/regex-worker.js',output:path.join(stage,'vendor/regex-worker.js')});
  const files=[];for(const relative of ['manifest.json','background.js','popup.html','popup.js',...(sourceFiles.some(row=>row.path.endsWith('popup.css'))?['popup.css']:[]),'vendor/material.js','vendor/search.js','vendor/regex-worker.js']){const bytes=await fs.readFile(path.join(stage,relative));if(!bytes.length)throw new Error('An extension output is empty.');files.push({path:relative,sha256:digest(bytes),bytes:bytes.length});}
  const search=await fs.readFile(path.join(stage,'vendor/search.js'),'utf8');if(!search.includes('regex-worker.js'))throw new Error('The shared regex worker route was not retained.');
  for(const relative of ['browser-extension/manifest.json','scripts/browser-extension-search-entry.js','src/shared/surface/search.js','src/shared/surface/regex-worker.js','src/shared/surface/regex-workbench.js','src/shared/surface/workbench-tools.js','src/shared/surface/registry.js','src/shared/surface/controls.js','src/shared/surface/localization.js']){try{sourceFiles.push({path:relative,sha256:digest(await fs.readFile(path.join(root,relative)))});}catch(error){if(compile===compileExtensionSource)throw error;}}
  const receipt={schemaVersion:1,materialVersion:'2.5.0',bundlerVersion:'0.25.11',materialSourceSha256:digest(material),sourceFiles,files,signature:'not-produced',installation:'not-performed',runtimeVerification:'not-performed'};await fs.writeFile(path.join(stage,'bundle-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  let previous;try{await fs.lstat(destination);previous=destination+'.previous-'+randomUUID();await fs.rename(destination,previous);}catch(error){if(error.code!=='ENOENT')throw error;}try{await fs.rename(stage,destination);}catch(error){if(previous)await fs.rename(previous,destination);throw error;}return receipt;
 }catch(error){await fs.rm(stage,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){await stageBrowserExtension();console.log('Staged local browser extension source and bundles. Signing and installation were not performed.');}
