import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const digest=content=>createHash('sha256').update(content).digest('hex');
export async function stageWorkspace(root=process.cwd(),destination=path.join(root,'out/site')) {
 root=await fs.realpath(root);destination=path.resolve(destination);
 await fs.access(path.join(destination,'index.html'));
 const catalog=JSON.parse(await fs.readFile(path.join(destination,'workspace-catalog.json'),'utf8'));
 if(!Array.isArray(catalog.documents)||!Array.isArray(catalog.changelog))throw Error('A reviewed workspace documentation catalog is required.');
 for(const item of catalog.documents)if(typeof item.id!=='string'||typeof item.markdown!=='string'||!Array.isArray(item.headings))throw Error('Invalid workspace documentation record.');
 const cache=path.join(root,'.cache','workspace-bundle-'+randomUUID());
 await fs.mkdir(cache,{recursive:true});
 const sources=[];
 async function clone(relative){
  const source=path.join(root,relative);const info=await fs.lstat(source);if(info.isSymbolicLink())throw Error('Workspace source links are not accepted.');
  if(info.isDirectory()){for(const name of (await fs.readdir(source)).sort())await clone(path.join(relative,name));return;}
  if(!/\.(?:js|css)$/i.test(relative))return;
  const bytes=await fs.readFile(source);sources.push({path:relative.replaceAll('\\','/'),sha256:digest(bytes)});
  const target=path.join(cache,relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
 }
 await clone('src/renderer');await clone('src/shared');
 for(const file of ['workspace.js','local-adapter.js','personal-vocabulary.js'])await clone(path.join('docs/site',file));
 const required=['src/renderer/features/ollama/index.js','src/renderer/features/converter/index.js','src/renderer/features/personalization/index.js','src/renderer/features/access/index.js','src/renderer/features/documentation/index.js'];
 for(const file of required)await fs.access(path.join(cache,file));
 const workers=new Map();
 for(const file of sources.filter(file=>file.path.endsWith('.js'))){
  const absolute=path.join(cache,file.path);const source=await fs.readFile(absolute,'utf8');
  const next=source.replace(/new URL\((['"])(\.[^'"]+\.js)\1,\s*import\.meta\.url\)/g,(match,quote,relative)=>{
   const resolved=path.resolve(path.dirname(absolute),relative);
   if(!resolved.startsWith(cache+path.sep))throw Error('Worker URL escapes the source cache.');
   const relativeSource=path.relative(cache,resolved).replaceAll('\\','/');
   const output=`workspace-workers/${digest(relativeSource).slice(0,16)}.js`;
   workers.set(relativeSource,output);return `new URL('${output}',import.meta.url)`;
  });
  if(next!==source)await fs.writeFile(absolute,next);
 }
 await fs.mkdir(path.join(cache,'dist','workspace-workers'),{recursive:true});
 const build=(entry,output)=>{
  const args=['exec','--yes','--package=esbuild@0.25.11','--','esbuild',entry,'--bundle','--format=esm','--target=es2022','--legal-comments=inline',`--outfile=dist/${output}`];
  const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{cwd:cache,stdio:'inherit',shell:process.platform==='win32'});
  if(result.status!==0)throw Error(`Workspace bundle failed with exit code ${result.status??'unavailable'}.`);
 };
 build('docs/site/workspace.js','workspace.js');
 for(const [entry,output]of workers)build(entry,output);
 let css=await fs.readFile(path.join(root,'docs/site/workspace.css'),'utf8');
 for(const relative of ['src/renderer/features/access/access.css','src/renderer/features/personalization/personalization.css','src/renderer/features/personalization/appearance.css','src/renderer/features/ollama/ollama.css']){
  try{css+='\n'+await fs.readFile(path.join(root,relative),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 await fs.writeFile(path.join(cache,'dist/workspace.css'),css);
 await fs.copyFile(path.join(root,'docs/site/workspace.html'),path.join(cache,'dist/workspace.html'));
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const sourceDirty=!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim();
 const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const provenance={schemaVersion:1,version,builtAt:new Date().toISOString(),sourceCommit,sourceDirty,sourceFiles:sources};
 await fs.writeFile(path.join(cache,'dist/workspace-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
 await fs.cp(path.join(cache,'dist'),destination,{recursive:true,force:true});
 return{sourceCommit,sourceDirty,workers:workers.size,documents:catalog.documents.length,entry:'workspace.html'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(JSON.stringify(await stageWorkspace(process.cwd(),process.argv[2]),null,2));
