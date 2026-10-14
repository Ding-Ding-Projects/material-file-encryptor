import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function compileExtensionSource({root,entry,output}){
 const relative=path.relative(root,output).replaceAll('\\','/');if(relative.startsWith('../')||path.isAbsolute(relative)||/[\s&|<>^%!"'`$\x00-\x1f]/.test(relative)||!['scripts/browser-extension-search-entry.js','src/shared/surface/regex-worker.js','scripts/browser-extension-language-entry.js'].includes(entry))throw new Error('Extension compiler requires a bounded internal output path.');
 const args=['exec','--yes','--package=esbuild@0.25.11','--','esbuild',entry,'--bundle','--format=esm','--target=es2022','--legal-comments=inline','--outfile='+relative];
 const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{cwd:root,stdio:'inherit',shell:process.platform==='win32'});if(result.status!==0)throw new Error('Local browser extension bundle did not complete.');
}
/** Parses the release changelog into bounded entries the extension can show offline. */
export function changelogEntries(markdown){
 const entries=[];let current=null;
 for(const raw of String(markdown).replace(/\r\n?/g,'\n').split('\n')){
  const line=raw.trimEnd(),heading=/^#{1,2} (.+?)(?:(?:, | - )(\d{4}-\d{2}-\d{2}))?$/.exec(line);
  if(heading){current={title:heading[1].slice(0,200),date:heading[2]||'',items:[],yue:''};entries.push(current);continue;}
  if(!current||!line)continue;
  if(line.startsWith('- '))current.items.push(line.slice(2,2002));
  else if(/[㐀-鿿]/.test(line)&&!current.yue)current.yue=line.slice(0,2000);
 }
 return entries.slice(0,400);
}
/** Source commit of the staged bundle, or null when it cannot be read. */
function sourceCommit(root){const result=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});const value=(result.stdout||'').trim();return /^[0-9a-f]{40}$/.test(value)?value:null;}
/** Whether tracked extension inputs differ from that commit; null when it cannot be read. */
function sourceModified(root){const result=spawnSync('git',['status','--porcelain','--untracked-files=no','--','browser-extension','scripts','src/shared','CHANGELOG.md'],{cwd:root,encoding:'utf8'});return result.status===0?result.stdout.trim().length>0:null;}
export async function stageBrowserExtension({root=process.cwd(),destination=path.join(root,'out/browser-extension'),compile=compileExtensionSource}={}){
 root=await fs.realpath(root);destination=path.resolve(destination);const parent=path.dirname(destination);await fs.mkdir(parent,{recursive:true});const stage=path.join(parent,'.browser-extension-stage-'+randomUUID());await fs.mkdir(path.join(stage,'vendor'),{recursive:true});const sourceFiles=[];
 try{
  const manifest=JSON.parse(await fs.readFile(path.join(root,'browser-extension/manifest.json'),'utf8'));if(manifest.manifest_version!==3||manifest.action?.default_popup!=='popup.html'||manifest.background?.service_worker!=='background.js'||JSON.stringify([...manifest.permissions].sort())!==JSON.stringify(['contextMenus','nativeMessaging'].sort())||manifest.host_permissions?.length||(manifest.optional_host_permissions&&JSON.stringify(manifest.optional_host_permissions)!==JSON.stringify(['http://127.0.0.1/*']))||manifest.options_ui&& (manifest.options_ui.page!=='options.html'||manifest.options_ui.open_in_tab!==true))throw new Error('Unsupported browser extension permissions or entrypoints.');
  manifest.content_security_policy={extension_pages:"script-src 'self'; object-src 'none'; worker-src 'self'; connect-src https://raw.githubusercontent.com https://api.github.com http://127.0.0.1:*; base-uri 'none';"};
  await fs.writeFile(path.join(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const extensionFiles=['background.js','popup.html','popup.js','popup.css','preferences.js','accent.js','local-records.js',...(manifest.options_ui?['options.html','options.js','options.css','exports.js','history.js','notes.js','schedules.js','vocabulary.js','narration.js','tickets.js','dimsum.js','local-models.js','rich-text.js']:[])];
  // Icons come from the manifest; only icons/icon-<size>.png files with a PNG signature are staged.
  const iconFiles=[...new Set([...Object.values(manifest.icons||{}),...Object.values(manifest.action?.default_icon||{})])];
  for(const icon of iconFiles){if(!/^icons\/icon-\d{2,3}\.png$/.test(icon))throw new Error('Unsupported extension icon path.');const bytes=await fs.readFile(path.join(root,'browser-extension',icon));if(bytes.length>65536||bytes.readUInt32BE(0)!==0x89504e47)throw new Error('Extension icons must be small PNG files.');await fs.mkdir(path.join(stage,'icons'),{recursive:true});await fs.writeFile(path.join(stage,icon),bytes);sourceFiles.push({path:'browser-extension/'+icon,sha256:digest(bytes)});}
  for(const name of extensionFiles){const file=path.join(root,'browser-extension',name);try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw new Error();const bytes=await fs.readFile(file);if(name.endsWith('.html')&&(/<(?:script|link)[^>]+(?:src|href)\s*=\s*["'](?:https?:|\/\/)/i.test(bytes.toString())||/\son\w+\s*=/i.test(bytes.toString())))throw new Error('Popup contains external or inline executable content.');await fs.writeFile(path.join(stage,name),bytes);sourceFiles.push({path:'browser-extension/'+name,sha256:digest(bytes)});}catch(error){if(name==='popup.css'&&error.code==='ENOENT')continue;throw error;}}
  const material=await fs.readFile(path.join(root,'src/shared/surface/material.js'));if(!material.toString('utf8',0,256).includes('Vendor source: @material/web 2.5.0; esbuild 0.25.11.'))throw new Error('Pinned local Material bundle provenance is unavailable.');await fs.writeFile(path.join(stage,'vendor/material.js'),material);
  await compile({root,entry:'scripts/browser-extension-search-entry.js',output:path.join(stage,'vendor/search.js')});await compile({root,entry:'src/shared/surface/regex-worker.js',output:path.join(stage,'vendor/regex-worker.js')});
  if(manifest.options_ui)await compile({root,entry:'scripts/browser-extension-language-entry.js',output:path.join(stage,'vendor/language.js')});
  // The Latin Noto Sans face and its licence ship inside the extension, checked against the font receipt.
  // The Hong Kong CJK face is too large for an extension; Chinese text uses the system font instead.
  let fontFiles=[];
  if(manifest.options_ui){const receipt=(await import(pathToFileURL(path.join(root,'src/renderer/fonts/receipt.mjs')).href)).default;await fs.mkdir(path.join(stage,'fonts'),{recursive:true});for(const name of ['NotoSans-VF.ttf','NotoSans-LICENSE.txt']){const expected=receipt.assets.find(asset=>asset.name===name);const bytes=await fs.readFile(path.join(root,'src/renderer/fonts/assets',name));if(!expected||digest(bytes)!==expected.sha256)throw new Error('Bundled font does not match its receipt.');await fs.writeFile(path.join(stage,'fonts',name),bytes);fontFiles.push('fonts/'+name);}}
  // The complete documentation catalogue and the DOM-only Markdown renderer ship inside the extension for offline reading.
  let docsFiles=[];
  if(manifest.options_ui){const {buildDocumentationCatalog}=await import(pathToFileURL(path.join(root,'src/features/documentation/catalog.mjs')).href);const catalog=await buildDocumentationCatalog(root);await fs.writeFile(path.join(stage,'vendor/docs-catalog.js'),'export default '+JSON.stringify(catalog)+';\n');const renderer=await fs.readFile(path.join(root,'src/renderer/features/documentation/markdown.js'));if(/^\s*import\s/m.test(renderer.toString()))throw new Error('The Markdown renderer must stay free of imports.');await fs.writeFile(path.join(stage,'vendor/markdown.js'),renderer);sourceFiles.push({path:'src/renderer/features/documentation/markdown.js',sha256:digest(renderer)});docsFiles=['vendor/docs-catalog.js','vendor/markdown.js'];}
  // The workspace reads the changelog and its own provenance as modules, because the page policy blocks fetch.
  if(manifest.options_ui){const markdown=await fs.readFile(path.join(root,'CHANGELOG.md'),'utf8');sourceFiles.push({path:'CHANGELOG.md',sha256:digest(markdown)});await fs.writeFile(path.join(stage,'vendor/changelog.js'),'export default '+JSON.stringify({schemaVersion:1,entries:changelogEntries(markdown)})+';\n');await fs.writeFile(path.join(stage,'vendor/provenance.js'),'export default '+JSON.stringify({schemaVersion:1,version:manifest.version,sourceCommit:sourceCommit(root),sourceModified:sourceModified(root),stagedAtUtc:new Date().toISOString()})+';\n');}
  const files=[];for(const relative of ['manifest.json',...iconFiles,...fontFiles,...docsFiles,...extensionFiles.filter(name=>sourceFiles.some(row=>row.path==='browser-extension/'+name)),'vendor/material.js','vendor/search.js','vendor/regex-worker.js',...(manifest.options_ui?['vendor/language.js','vendor/changelog.js','vendor/provenance.js']:[])]){const bytes=await fs.readFile(path.join(stage,relative));if(!bytes.length)throw new Error('An extension output is empty.');files.push({path:relative,sha256:digest(bytes),bytes:bytes.length});}
  const search=await fs.readFile(path.join(stage,'vendor/search.js'),'utf8');if(!search.includes('regex-worker.js'))throw new Error('The shared regex worker route was not retained.');
  for(const relative of ['browser-extension/manifest.json','scripts/browser-extension-search-entry.js','scripts/browser-extension-language-entry.js','src/shared/surface/search.js','src/shared/surface/regex-worker.js','src/shared/surface/regex-workbench.js','src/shared/surface/workbench-tools.js','src/shared/surface/registry.js','src/shared/surface/controls.js','src/shared/surface/localization.js','src/shared/local-ux/language.js','src/shared/local-ux/message-styles.js','src/shared/local-ux/local-copy.js','src/renderer/features/access/copy.js','src/renderer/features/personalization/appearance-copy.js']){try{sourceFiles.push({path:relative,sha256:digest(await fs.readFile(path.join(root,relative)))});}catch(error){if(compile===compileExtensionSource)throw error;}}
  const receipt={schemaVersion:1,materialVersion:'2.5.0',bundlerVersion:'0.25.11',materialSourceSha256:digest(material),sourceFiles,files,signature:'not-produced',installation:'not-performed',runtimeVerification:'not-performed'};await fs.writeFile(path.join(stage,'bundle-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  let previous;try{await fs.lstat(destination);previous=destination+'.previous-'+randomUUID();await fs.rename(destination,previous);}catch(error){if(error.code!=='ENOENT')throw error;}try{await fs.rename(stage,destination);}catch(error){if(previous)await fs.rename(previous,destination);throw error;}return receipt;
 }catch(error){await fs.rm(stage,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){await stageBrowserExtension();console.log('Staged local browser extension source and bundles. Signing and installation were not performed.');}
