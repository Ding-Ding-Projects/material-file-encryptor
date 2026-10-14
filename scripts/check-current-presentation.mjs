import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {inflateSync} from 'node:zlib';

// Immutable original-byte bindings reviewed at baseline 96ea35e. The editable
// replacement inventory cannot redefine which old bytes are forbidden.
export const BASELINE_HASHES=Object.freeze({
 'linux-locked':'32e094af6b113302868ec7b72e9d04faabe835dec03e4212d739ef95316512b2',
 'linux-create':'d0b0a15f63ede89b44af929d0e0ef551c8d98c8e4c7544f6e34db1b871eeca04',
 'linux-key-file-choice':'416d4812a2a4796f59121a2990cfebc7c39dc2ec6371f0c0a38595897f16414f',
 'linux-settings-dark':'32f9800e39c0df2c3e3095ba9b0ca97b2f193338ca661799e45519521973ff59',
 'linux-help':'a02fd3f5c74f2c8737949f6a4c3c276a9adde5c9482bb888b9d910b6d268e52e',
 'windows-locked':'13e57820eff14a3dffac727ccd879b9cfe46ecee58bcc33a2a515d7de05247e7',
 'windows-create':'14d16d03df62fa3e40c1baf961b960f360e26c2ac4cde1b58196d51a6725b225',
 'windows-keyfile-choice':'1e7181b307bcd872f3cac709c54505ae8e3cf15837ad140db645ea4a04325480',
 'windows-settings-dark':'1a265c9736bf38f908e0b549f5db5b2d2867d725049642e36f9eeeda5406d8ee',
 'windows-help':'79d2b260758f82ec73d6b100dfeed4a62242d4018e55cf2947ed5b37fe0e171c',
 'history-preview':'01bfaec0707df62eeaf2ab72dc123f9c1a7369fc27af37c60eebfeccd6d4a4f6',
 'recycle-preview':'cc8bb0501a386226f0e4750657ab96e1b069ec283d0c4b3785e5c7a7b878c852',
 'descendant-preview':'893bec80cc965b618fca80603aa5d9f0a003b7a3c8f444921bc65bfc1426043d',
 'dark-settings-preview':'7a28deb679398b6521156d179c8ce7a7fcc643840de34cf5bdd0afa0905904ab',
 'drive-light-en':'2db466fd4da82ef74e7e39071ccee3640d5bba9da6b3a830262f29da7bbf2472',
 'converter-dark-en':'b57f0af7bce88fe4175817b2e2cfece0cad6eb74d659cae6bdf5d9be8e2572d3',
 'workflow-light-yue':'ae0cb8eb2d05780eabd78ae192a7bf74aa40f5f7eac6762e6a2450e3a8064b5f',
 'converter-light-bilingual':'cf54deb49bd40faedc90bd7aad3ea3a34ee7e8fccdb7cc835d57d296deaa0762',
 'dialog-consent-light-en':'a8595fed1676b3c17f7b9fa8a2b1afb5f22faa99e0f7397a77a53a47d7309026',
 'dialog-consent-dark-en':'9e44ce0dd21480c5255e22f835e8b54ab0c33ee60274df740ed6299e85fa9b5c',
 'models-connected-light-en':'b13f1a78797717b909170813643ff8952361b1c9a263e4a55e6028712dd81e7a',
 'models-chat-light-en':'91635571627c8f40f91926348124d3ef46335d5f9a0b5c3471d605fc10a01973',
 'site-guidance-normal-83e14d86':'78701c8aea8f8db63db13da2d11cf342817f8a841769efdc2f063ec8038a1f89',
 'site-guidance-narrow-83e14d86':'5db524e0a6375aa4ee7385b5014a39f43e10b6bc1076a5af6d110bc2b0bacf99'
});

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
  if(row.old?.path!==requiredOldPath(row.id)||row.old.sha256!==BASELINE_HASHES[row.id]||oldPaths.has(row.old.path))fail('OLD_IMAGE_BINDING');
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
 let offset=8,ended=false,header=null,idatEnded=false;const compressed=[];
 while(offset+12<=bytes.length){
  const size=bytes.readUInt32BE(offset),kind=bytes.toString('ascii',offset+4,offset+8),body=bytes.subarray(offset+8,offset+8+size);
  if(offset+size+12>bytes.length)fail('TRUNCATED_PNG');
  if(crc32(bytes.subarray(offset+4,offset+8+size))!==bytes.readUInt32BE(offset+8+size))fail('PNG_CRC');
  if(['tEXt','zTXt','iTXt'].includes(kind))fail('PNG_TEXT_METADATA');
  if(kind==='IHDR'){if(header||offset!==8||size!==13)fail('PNG_HEADER');header=body;}
  else if(kind==='IDAT'){if(!header||idatEnded)fail('PNG_IDAT_ORDER');compressed.push(body);}
  else if(kind==='IEND'){if(size!==0)fail('PNG_END');ended=true;offset+=12;break;}
  else{if(compressed.length)idatEnded=true;if(/^[A-Z]/.test(kind))fail('UNSUPPORTED_PNG_CHUNK');}
  offset+=size+12;
 }
 if(!ended||offset!==bytes.length)fail('INCOMPLETE_PNG');
 const width=header.readUInt32BE(0),height=header.readUInt32BE(4),channels=header[9]===2?3:header[9]===6?4:0;
 if(!width||!height||width>16384||height>16384||width*height>64000000||header[8]!==8||!channels||header[10]!==0||header[11]!==0||header[12]!==0)fail('UNSUPPORTED_PNG_FORMAT');
 if(!compressed.length)fail('PNG_IDAT_MISSING');
 const stride=width*channels,expected=(stride+1)*height;let inflated;
 try{const data=Buffer.concat(compressed),decoded=inflateSync(data,{maxOutputLength:expected,info:true});if(decoded.engine.bytesWritten!==data.length)fail('PNG_IDAT_TRAILING');inflated=decoded.buffer;}catch{fail('PNG_IDAT_DECODE');}
 if(inflated.length!==expected)fail('PNG_SCANLINE_LENGTH');
 const pixels=Buffer.alloc(stride*height);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=inflated[y*(stride+1)];if(filter>4)fail('PNG_FILTER');for(let x=0;x<stride;x++){const at=y*stride+x,a=x>=channels?pixels[at-channels]:0,b=y?pixels[at-stride]:0,c=y&&x>=channels?pixels[at-stride-channels]:0;pixels[at]=(inflated[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}}
 return {width,height};
}
export function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function validateGeometry(geometry,receipt,target,dimensions,expectedSource){
 if(geometry?.schemaVersion!==1||geometry.sourceCommit!==expectedSource||geometry.hwnd!==receipt.runtime?.hwnd||geometry.method!=='observed-native-client-and-browser-geometry')fail('GEOMETRY_PROVENANCE');
 const v=geometry.viewportCss,dpr=geometry.devicePixelRatio,client=geometry.nativeClientPixels,capture=geometry.capturePixels;
 if(v?.width!==target.viewport.width||v.height!==target.viewport.height||!Number.isFinite(dpr)||dpr<=0||!Number.isFinite(geometry.rendererZoom)||geometry.rendererZoom<=0||client?.width!==Math.round(v.width*dpr)||client.height!==Math.round(v.height*dpr)||capture?.width!==dimensions.width||capture.height!==dimensions.height)fail('GEOMETRY_PIXEL_BINDING');
 if(!['page','window'].includes(receipt.state.captureKind)||receipt.state.captureKind==='page'&&(capture.width!==client.width||capture.height!==client.height)||capture.width<client.width||capture.height<client.height)fail('GEOMETRY_CAPTURE_RECT');
 if(geometry.scaleKind==='physical-display'){if(geometry.physicalDisplayScale!==target.viewport.scale||geometry.physicalDisplayScaleObserved!==true)fail('PHYSICAL_SCALE_UNVERIFIED');}
 else if(geometry.scaleKind==='device-pixel-ratio'){if(dpr!==target.viewport.scale)fail('DPR_BINDING');}
 else fail('GEOMETRY_SCALE_KIND');
 const observed=Date.parse(geometry.observedAt),start=Date.parse(receipt.capture.startedAt),end=Date.parse(receipt.capture.capturedAt);
 if(!Number.isFinite(observed)||observed<start||observed>end)fail('GEOMETRY_TIME_BINDING');
}
export function embeddedOldImages(text){return [...String(text).matchAll(/data:image\/png;base64,([A-Za-z0-9+/]+=*)/g)].flatMap(match=>{const hash=sha(Buffer.from(match[1],'base64'));return Object.entries(BASELINE_HASHES).filter(([,value])=>value===hash).map(([id])=>id);});}
export function hasCurrentImage(text,route,caption){
 const visible=String(text).replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g,'');
 const paths=[...visible.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)|<img\b[^>]*\ssrc\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(match=>match[1]||match[2]);
 const normalize=value=>value.replace(/^(?:\.\.?\/)+/,'');
 return paths.some(value=>normalize(value)===normalize(route))&&visible.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").includes(caption);
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
 const geometry=JSON.parse((await verifiedBytes(evidenceRoot,r.geometryReceiptPath,r.geometryReceiptSha256)).toString('utf8'));
 validateGeometry(geometry,receipt,row.target,dimensions,expectedSource);
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
  if(!hasCurrentImage(text,reference,row.caption))fail('CURRENT_CONSUMER_OR_CAPTION_MISSING');
 }catch(error){errors.push(row.id+': '+error.message);}
 if(!presentationRoot)errors.push('PRESENTATION_ROOT_REQUIRED: validate actual generated output separately');
 else {
  const files=await walk(presentationRoot);
  for(const file of files){
   if(/\.(html|css|md|js|json|mjs)$/i.test(file)){const text=await fs.readFile(path.join(presentationRoot,file),'utf8');for(const id of staleReferences(text,records))errors.push(file+': stale rendered '+id);for(const id of embeddedOldImages(text))errors.push(file+': old embedded capture '+id);}
   if(/\.png$/i.test(file)){const hash=sha(await fs.readFile(path.join(presentationRoot,file)));if(records.some(row=>row.old.sha256===hash))errors.push(file+': old capture bytes in current output');}
  }
  for(const row of records.filter(row=>row.status==='accepted')){
   const route=row.replacement.path.replace(/^docs\//,'');
   if(!files.includes(route))errors.push(row.id+': delivered image missing');
   else try{await verifiedBytes(presentationRoot,route,row.replacement.sha256);}catch(error){errors.push(row.id+': delivered '+error.message);}
   const page=row.currentConsumers.includes('README.md')?'articles/README.html':'index.html';
   try{const html=await fs.readFile(await contained(presentationRoot,page),'utf8');if(!hasCurrentImage(html,route,row.caption))errors.push(row.id+': delivered consumer or caption missing');}catch(error){errors.push(row.id+': delivered consumer '+error.message);}
   if(row.currentConsumers.includes('docs/site/gallery-review.json')){
    try{
     const html=await fs.readFile(await contained(presentationRoot,'gallery.html'),'utf8');
     if(!hasCurrentImage(html,route,row.caption))fail('DELIVERED_GALLERY_CAPTION');
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
