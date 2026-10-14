import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// Independent hand-written identities: do not derive this list from the inventory.
export const REQUIRED = Object.freeze([
 'linux-locked','linux-create','linux-key-file-choice','linux-settings-dark','linux-help',
 'windows-locked','windows-create','windows-keyfile-choice','windows-settings-dark','windows-help',
 'history-preview','recycle-preview','descendant-preview','dark-settings-preview',
 'drive-light-en','converter-dark-en','workflow-light-yue','converter-light-bilingual',
 'dialog-consent-light-en','dialog-consent-dark-en','models-connected-light-en','models-chat-light-en',
 'site-guidance-normal-83e14d86','site-guidance-narrow-83e14d86'
]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = message => {throw Error(message);};
export function requiredOldPath(id) {
 if(id.startsWith('linux-')||id.startsWith('windows-'))return 'docs/images/captures/'+(id.startsWith('windows-')?'windows/':'')+'desktop-'+id.replace(/^(linux|windows)-/,'').replace('key-file-choice','keyfile-choice')+'.png';
 if(['history-preview','recycle-preview','descendant-preview','dark-settings-preview'].includes(id))return 'docs/images/captures/preview/'+id+'.png';
 if(id.startsWith('site-guidance-'))return 'docs/images/captures/'+id+'.png';
 if(id.startsWith('models-'))return 'docs/images/captures/extension-models-45ccb91/'+id+'.png';
 return 'docs/images/captures/material-2a9cb388/'+id+'.png';
}
export function requiredConsumers(id) {
 const legacy=id.startsWith('linux-')||id.startsWith('windows-')||['history-preview','recycle-preview','descendant-preview','dark-settings-preview'].includes(id);
 return legacy?['docs/site/index.html','docs/site/gallery-review.json','docs/site/publication.mjs -> gallery.html','docs/site/publication.mjs -> gallery-inventory.json']:['README.md','docs/site/public-images.mjs','docs/site/publication.mjs -> articles/README.html','src/features/documentation/catalog.mjs -> desktop documentation README','scripts/build-browser-extension.mjs -> vendor/docs-catalog.js README'];
}
export function validateInventory(value, expectedSource) {
 if(!/^[a-f0-9]{40}$/.test(expectedSource || ''))fail('EXPECTED_SOURCE_REQUIRED');
 if(value?.schemaVersion!==1||value.intendedSource!==expectedSource||!Array.isArray(value.records))fail('INVENTORY_SOURCE_OR_SCHEMA');
 const ids=value.records.map(row=>row.id);
 if(new Set(ids).size!==ids.length||JSON.stringify([...ids].sort())!==JSON.stringify([...REQUIRED].sort()))fail('REQUIRED_IDENTITIES');
 const oldPaths=new Set(),dedup=new Map();
 for(const row of value.records){
  if(row.old?.path!==requiredOldPath(row.id)||!digest(row.old.sha256)||oldPaths.has(row.old.path))fail('OLD_IMAGE_BINDING');
  oldPaths.add(row.old.path);
  if(!Array.isArray(row.currentConsumers)||JSON.stringify([...row.currentConsumers].sort())!==JSON.stringify(requiredConsumers(row.id).sort()))fail('REQUIRED_CONSUMERS');
  if(!['pending','accepted','unavailable'].includes(row.status))fail('INVALID_STATUS');
  if(row.target?.platform!=='windows'||!['en','yue','bilingual'].includes(row.target.language)||!['light','dark'].includes(row.target.theme)||!row.target.screen||!row.target.state||!row.target.surface||!row.caption)fail('TARGET_TUPLE');
  for(const key of ['width','height','scale'])if(!Number.isFinite(row.target.viewport?.[key])||row.target.viewport[key]<=0)fail('TARGET_VIEWPORT');
  if(typeof row.dedupKey!=='string'||!row.dedupKey)fail('DEDUP_IDENTITY');
  const tuple=JSON.stringify({target:row.target,caption:row.caption});
  if(dedup.has(row.dedupKey)&&dedup.get(row.dedupKey)!==tuple)fail('INCOMPATIBLE_DEDUP_CAPTION');
  dedup.set(row.dedupKey,tuple);
  if(row.status==='pending'&&row.replacement!==null)fail('PENDING_HAS_PROOF');
  if(row.status==='unavailable'&&(!row.reason||row.replacement!==null))fail('UNAVAILABLE_WITHOUT_REASON');
 }
 return value.records;
}

// A read is accepted only after every path component and the final realpath stay
// inside its declared root. No symlink traversal or absolute caller path.
export async function contained(root, relative) {
 if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(part=>!part||part==='.'||part==='..'))fail('UNSAFE_EVIDENCE_PATH');
 const base=await fs.realpath(root);let filename=base;
 for(const part of relative.split('/')){filename=path.join(filename,part);if((await fs.lstat(filename)).isSymbolicLink())fail('SYMLINK_EVIDENCE');}
 const real=await fs.realpath(filename),distance=path.relative(base,real);
 if(distance.startsWith('..')||path.isAbsolute(distance))fail('EVIDENCE_ESCAPES_ROOT');
 return real;
}
async function verifiedBytes(root, relative, hash) {
 if(!digest(hash))fail('MISSING_EVIDENCE_HASH');
 const bytes=await fs.readFile(await contained(root,relative));if(sha(bytes)!==hash)fail('EVIDENCE_HASH_MISMATCH');return bytes;
}
export function validateRootBuild(build,expectedSource,artifactSha256) {
 if(build?.command!=='build.bat /s'||build.sourceCommit!==expectedSource||build.sourceCommitAtCompletion!==expectedSource||build.sourceDirtyAtStart!==false||build.sourceDirtyAtCompletion!==false||build.exitCode!==0||build.executableSha256!==artifactSha256||!digest(build.archiveSha256)||!digest(build.nativeHostSha256))fail('ROOT_BUILD_BINDING');
 return build;
}
export async function validateBuildReceipt(build,source,evidenceRoot,expectedSource) {
 let original=build;
 if(!Object.hasOwn(build,'sourceCommitAtCompletion')){
  if(build.sourceCommit!==expectedSource||build.sourceEndCommit!==expectedSource||build.sourceClean!==true||build.buildExitCode!==0||build.artifactSha256!==source.artifactSha256||!digest(build.asarSha256)||build.normalization?.derivedReceipt!==true)fail('NORMALIZED_BUILD_BINDING');
  // The supplied original path must resolve inside the private run root, even
  // when an established producer recorded an absolute path during normalization.
  const originalPath=build.normalization.originalPath;
  const relative=typeof originalPath==='string'&&path.isAbsolute(originalPath)?path.relative(await fs.realpath(evidenceRoot),originalPath).split(path.sep).join('/'):originalPath;
  original=JSON.parse((await verifiedBytes(evidenceRoot,relative,build.normalization.originalSha256)).toString('utf8'));
  if(original.archiveSha256!==build.asarSha256||original.executableSha256!==build.artifactSha256)fail('NORMALIZED_ORIGINAL_MISMATCH');
 }
 validateRootBuild(original,expectedSource,source.artifactSha256);
 if(source.rendererAsarSha256!==original.archiveSha256||source.nativeHostSha256!==original.nativeHostSha256)fail('BUILD_PAYLOAD_BINDING');
 await verifiedBytes(evidenceRoot,source.rendererAsarPath,source.rendererAsarSha256);
 await verifiedBytes(evidenceRoot,source.nativeHostPath,source.nativeHostSha256);
 return original;
}
export function pngDimensions(bytes) {
 if(bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR')fail('INVALID_PNG');
 let offset=8,ended=false;
 while(offset+12<=bytes.length){const size=bytes.readUInt32BE(offset),kind=bytes.toString('ascii',offset+4,offset+8);if(offset+size+12>bytes.length)fail('TRUNCATED_PNG');if(['tEXt','zTXt','iTXt'].includes(kind))fail('PNG_TEXT_METADATA');offset+=size+12;if(kind==='IEND'){ended=true;break;}}
 if(!ended||offset!==bytes.length)fail('INCOMPLETE_PNG');
 return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
}
export async function verifyReplacement(row,{root,evidenceRoot,expectedSource,now=Date.now(),maxAgeHours=168}) {
 const replacement=row.replacement;
 if(row.status!=='accepted'||!replacement||!evidenceRoot)fail('REPLACEMENT_NOT_ACCEPTED');
 const receipt=JSON.parse((await verifiedBytes(evidenceRoot,replacement.receipt,replacement.receiptSha256)).toString('utf8'));
 if(receipt.version!==1||receipt.route!=='cheap-lowlevel-headless'||receipt.source?.startCommit!==expectedSource||receipt.source?.endCommit!==expectedSource)fail('RECEIPT_SOURCE_OR_ROUTE');
 if(receipt.inventory?.path!=='contracts/current-presentation-images.json'||receipt.inventory?.recordId!==row.dedupKey)fail('RECEIPT_INVENTORY');
 const s=receipt.state,t=row.target;
 if(s?.surface!==t.surface||s.screen!==t.screen||s.state!==t.state||s.theme!==t.theme||s.language!==t.language||JSON.stringify(s.viewport)!==JSON.stringify(t.viewport))fail('RECEIPT_TUPLE');
 const c=receipt.capture;
 if(c?.promotedPath!==replacement.path||c.sha256!==replacement.sha256||c.rawSha256!==c.sha256||c.mimeType!=='image/png')fail('RECEIPT_IMAGE');
 const bytes=await verifiedBytes(root,replacement.path,replacement.sha256),raw=await verifiedBytes(evidenceRoot,c.rawPath,c.rawSha256);
 if(!bytes.equals(raw))fail('ALTERED_CAPTURE');
 const dimensions=pngDimensions(bytes);if(dimensions.width!==c.width||dimensions.height!==c.height)fail('CAPTURE_DIMENSIONS');
 await verifiedBytes(evidenceRoot,receipt.source.artifactPath,receipt.source.artifactSha256);
 const build=JSON.parse((await verifiedBytes(evidenceRoot,receipt.source.buildReceiptPath,receipt.source.buildReceiptSha256)).toString('utf8'));
 const rootBuild=await validateBuildReceipt(build,receipt.source,evidenceRoot,expectedSource);
 const start=Date.parse(c.startedAt),end=Date.parse(c.capturedAt),built=Date.parse(receipt.source.artifactBuiltAt);
 if(![start,end,built].every(Number.isFinite)||built>start||start>end||end>now||now-end>maxAgeHours*3600000||!receipt.capture.timeZone)fail('CAPTURE_TIME');
 if(rootBuild.completionObservedAtUtc!==undefined&&(!Number.isFinite(Date.parse(rootBuild.completionObservedAtUtc))||Date.parse(rootBuild.completionObservedAtUtc)>start))fail('BUILD_COMPLETED_AFTER_CAPTURE');
 try{new Intl.DateTimeFormat('en',{timeZone:c.timeZone});}catch{fail('CAPTURE_TIME_ZONE');}
 const p=receipt.privacy,i=receipt.inspection,r=receipt.runtime;
 if(p?.visibleDesktopUntouched!==true||p.expectedSurfaceOnly!==true||p.sensitiveDataReviewed!==true||p.unrelatedTargetsObserved!==false||p.mocked!==false||p.handEdited!==false)fail('PRIVACY_NOT_REVIEWED');
 if(i?.decoded!==true||i.pixelsInspected!==true||i.targetVisible!==true||i.expectedStateVisible!==true||!i.reviewer)fail('PIXELS_NOT_INSPECTED');
 if(r?.hwndResolvedLive!==true||!Number.isInteger(r.launchPid)||r.launchPid<=0||!r.hwnd||r.cleanupCompleted!==true||r.cleanupOwnedOnly!==true||!r.interactionProofId)fail('RUNTIME_RECEIPT');
 await verifiedBytes(evidenceRoot,r.interactionReceiptPath,r.interactionReceiptSha256);
 await verifiedBytes(evidenceRoot,r.privacyScanPath,r.privacyScanSha256);
 return {path:replacement.path,sha256:replacement.sha256};
}

export function staleReferences(text, records) {
 // Ignore plain historical prose. Inspect rendered image sources, CSS image URLs,
 // and Markdown images; archive files themselves are allowed to remain present.
 const references=[...String(text).matchAll(/!\[[^\]]*\]\(([^)]+)\)|<(?:img|source)\b[^>]*>|url\([^)]*\)/gi)].map(match=>{
  let value=match[0].replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,number)=>{const point=number[0].toLowerCase()==='x'?parseInt(number.slice(1),16):Number(number);return point<=0x10ffff?String.fromCodePoint(point):'';}).replace(/&sol;/gi,'/');
  try{value=decodeURIComponent(value);}catch{/* Preserve malformed text for the literal scan. */}return value;
 });
 return records.filter(row=>references.some(ref=>ref.includes(row.old.path)||ref.includes(row.old.path.replace(/^docs\//,'')))).map(row=>row.id);
}
async function walk(root,relative='') {
 const files=[];for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})){
  const item=relative?relative+'/'+entry.name:entry.name;
  if(entry.isSymbolicLink())fail('SYMLINK_PRESENTATION');
  if(entry.isDirectory())files.push(...await walk(root,item));else files.push(item);
 }return files;
}
export async function checkCurrentPresentation({root=process.cwd(),expectedSource,evidenceRoot,presentationRoot,desktopRoot,extensionRoot}={}) {
 const inventory=JSON.parse(await fs.readFile(path.join(root,'contracts/current-presentation-images.json'),'utf8'));
 const records=validateInventory(inventory,expectedSource),errors=[];
 for(const row of records)try{await verifiedBytes(root,row.old.path,row.old.sha256);}catch(error){errors.push(row.id+': historical original '+error.message);}
 for(const row of records)if(row.status!=='accepted')errors.push(row.id+': '+row.status+(row.reason?' ('+row.reason+')':''));
 // Use the actual production parsers, not a second approximation of their manifests.
 const {galleryRecords}=await import(pathToFileURL(path.join(root,'docs/site/publication.mjs')).href);
 const {publicImages}=await import(pathToFileURL(path.join(root,'docs/site/public-images.mjs')).href);
 const gallery=await galleryRecords(root);
 const admitted=[...gallery,...publicImages].map(row=>({path:row.path?('docs/'+row.path):row.source,hash:row.sha256}));
 for(const old of records)if(admitted.some(row=>row.path===old.old.path||row.hash===old.old.sha256))errors.push(old.id+': old image admitted by current publication');
 for(const file of ['README.md','docs/site/index.html'])for(const id of staleReferences(await fs.readFile(path.join(root,file),'utf8'),records))errors.push(file+': stale rendered '+id);
 const accepted=new Map();
 for(const row of records.filter(row=>row.status==='accepted'))try{
  const proof=await verifyReplacement(row,{root,evidenceRoot,expectedSource});
  if(records.some(old=>old.old.sha256===proof.sha256))fail('OLD_BYTES_AS_NEW_CAPTURE');
  const previous=accepted.get(proof.sha256);if(previous&&previous!==row.dedupKey)fail('INCOMPATIBLE_IMAGE_REUSE');accepted.set(proof.sha256,row.dedupKey);
  if(!admitted.some(item=>item.path===proof.path&&item.hash===proof.sha256))fail('REPLACEMENT_NOT_PUBLISHED');
  if(row.currentConsumers.includes('docs/site/gallery-review.json')){
   const record=gallery.find(item=>('docs/'+item.path)===proof.path&&item.sha256===proof.sha256);
   if(!record||record.historical!==false||record.sourceCommit!==expectedSource||record.scope!==row.caption||!record.promotionReceiptSha256)fail('CURRENT_GALLERY_CONSUMER');
  }else if(!publicImages.some(item=>item.source===proof.path&&item.sha256===proof.sha256))fail('PUBLIC_IMAGE_CONSUMER');
  const consumer=row.currentConsumers.includes('README.md')?'README.md':'docs/site/index.html';
  const text=await fs.readFile(path.join(root,consumer),'utf8'),reference=consumer==='README.md'?proof.path:proof.path.replace(/^docs\//,'');
  if(!text.includes(reference)||!text.includes(row.caption))fail('CURRENT_CONSUMER_OR_CAPTION_MISSING');
 }catch(error){errors.push(row.id+': '+error.message);}
 if(!presentationRoot)errors.push('PRESENTATION_ROOT_REQUIRED: validate actual generated output separately');
 else {
  const files=await walk(presentationRoot);
  for(const file of files){
   if(/\.(html|css|md|js|json)$/i.test(file)){const text=await fs.readFile(path.join(presentationRoot,file),'utf8');for(const id of staleReferences(text,records))errors.push(file+': stale rendered '+id);}
   if(/\.png$/i.test(file)){const hash=sha(await fs.readFile(path.join(presentationRoot,file)));if(records.some(row=>row.old.sha256===hash))errors.push(file+': old capture bytes in current output');}
  }
  for(const row of records.filter(row=>row.status==='accepted')){
   const route=row.replacement.path.replace(/^docs\//,'');
   if(!files.includes(route))errors.push(row.id+': delivered image missing');
   else try{await verifiedBytes(presentationRoot,route,row.replacement.sha256);}catch(error){errors.push(row.id+': delivered '+error.message);}
   const page=row.currentConsumers.includes('README.md')?'articles/README.html':'index.html';
   try{const html=await fs.readFile(await contained(presentationRoot,page),'utf8');if(!html.includes(route)||!html.includes(row.caption))errors.push(row.id+': delivered consumer or caption missing');}catch(error){errors.push(row.id+': delivered consumer '+error.message);}
   if(row.currentConsumers.includes('docs/site/gallery-review.json')){
    try{
     const html=await fs.readFile(await contained(presentationRoot,'gallery.html'),'utf8');
     if(!html.includes(route)||!html.includes(row.caption))fail('DELIVERED_GALLERY_CAPTION');
     const value=JSON.parse(await fs.readFile(await contained(presentationRoot,'gallery-inventory.json'),'utf8'));
     if(!value.records?.some(item=>item.path===route&&item.sha256===row.replacement.sha256&&item.sourceCommit===expectedSource&&item.historical===false&&item.scope===row.caption))fail('DELIVERED_GALLERY_INVENTORY');
    }catch(error){errors.push(row.id+': '+error.message);}
   }
  }
 }
 // Inspect unpacked shipped documentation payloads too. Rebuilding the website
 // alone cannot prove that an old embedded data URL left the desktop or extension.
 for(const [kind,directory]of [['desktop',desktopRoot],['extension',extensionRoot]]){
  if(!directory){errors.push(kind.toUpperCase()+'_ROOT_REQUIRED');continue;}
  const files=await walk(directory);let textCount=0;
  for(const file of files){
   if(/\.(html|css|md|js|json|mjs)$/i.test(file)){
    textCount++;const text=await fs.readFile(path.join(directory,file),'utf8');
    for(const id of staleReferences(text,records))errors.push(kind+'/'+file+': stale rendered '+id);
    for(const match of text.matchAll(/data:image\/png;base64,([A-Za-z0-9+/]+=*)/g)){const hash=sha(Buffer.from(match[1],'base64'));if(records.some(row=>row.old.sha256===hash))errors.push(kind+'/'+file+': old embedded capture bytes');}
   }
   if(/\.png$/i.test(file)){const hash=sha(await fs.readFile(path.join(directory,file)));if(records.some(row=>row.old.sha256===hash))errors.push(kind+'/'+file+': old capture bytes in shipped payload');}
  }
  if(!textCount)errors.push(kind+': no inspectable documentation payload');
  const required=kind==='extension'?'vendor/docs-catalog.js':'README.md';
  if(!files.includes(required))errors.push(kind+': expected documentation payload missing');
  else {
   const text=await fs.readFile(path.join(directory,required),'utf8');
   for(const row of records.filter(item=>item.status==='accepted'&&item.currentConsumers.includes('README.md'))){
    if(!text.includes(row.caption)||!text.includes(row.replacement.path))errors.push(kind+': '+row.id+' consumer or caption missing');
    if(kind==='desktop')try{await verifiedBytes(directory,row.replacement.path,row.replacement.sha256);}catch(error){errors.push(kind+': '+row.id+' '+error.message);}
    else if(![...text.matchAll(/data:image\/png;base64,([A-Za-z0-9+/]+=*)/g)].some(match=>sha(Buffer.from(match[1],'base64'))===row.replacement.sha256))errors.push(kind+': '+row.id+' embedded replacement missing');
   }
  }
 }
 return {ok:errors.length===0,records:records.length,errors};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2),option=name=>{const at=args.indexOf(name);return at<0?undefined:args[at+1];};
 try{const result=await checkCurrentPresentation({root:option('--repo-root')||process.cwd(),expectedSource:option('--expected-source'),evidenceRoot:option('--evidence-root'),presentationRoot:option('--presentation-root'),desktopRoot:option('--desktop-root'),extensionRoot:option('--extension-root')});console.log(JSON.stringify(result,null,2));process.exitCode=result.ok?0:1;}catch(error){console.error(error.message);process.exitCode=1;}
}
