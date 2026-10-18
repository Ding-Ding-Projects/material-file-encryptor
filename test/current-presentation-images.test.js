import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';
import {REQUIRED,validateInventory,staleReferences,contained,pngDimensions,verifyReplacement,checkCurrentPresentation,validateRootBuild,validateBuildReceipt,crc32,validateGeometry,embeddedOldImages,hasCurrentImage} from '../scripts/check-current-presentation.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const original=JSON.parse(await fs.readFile(new URL('../contracts/current-presentation-images.json',import.meta.url),'utf8'));
const fresh=()=>structuredClone(original),source=original.intendedSource;

test('independent inventory names all 24 displayed originals, not synthetic occurrence fixtures',()=>{
 assert.equal(REQUIRED.length,24);assert.equal(validateInventory(fresh(),source).length,24);
 assert.equal(original.records.filter(row=>row.currentConsumers.includes('README.md')).length,10);
 assert.equal(original.records.filter(row=>row.currentConsumers.includes('docs/site/index.html')).length,14);
});
test('omission, duplicate and renamed identity cannot pass the inventory',()=>{
 for(const mutate of [value=>value.records.pop(),value=>value.records.push(value.records[0]),value=>value.records[0].id+='-replacement']){
  const value=fresh();mutate(value);assert.throws(()=>validateInventory(value,source),/REQUIRED_IDENTITIES/);
 }
});
test('source substitution and swapped old paths fail closed',()=>{
 assert.throws(()=>validateInventory(fresh(),'0'.repeat(40)),/SOURCE/);
 const value=fresh();[value.records[0].old,value.records[1].old]=[value.records[1].old,value.records[0].old];assert.throws(()=>validateInventory(value,source),/OLD_IMAGE_BINDING/);
});
test('editable inventory cannot redefine an original image hash',()=>{
 const value=fresh();value.records[0].old.sha256='a'.repeat(64);assert.throws(()=>validateInventory(value,source),/OLD_IMAGE_BINDING/);
});
test('each consumer is independently required, not a caller-selected subset',()=>{
 for(const mutate of [row=>row.currentConsumers.pop(),row=>row.currentConsumers=['README.md'],row=>row.currentConsumers.push('invented consumer')]){
  const value=fresh();mutate(value.records[0]);assert.throws(()=>validateInventory(value,source),/REQUIRED_CONSUMERS/);
 }
});
test('commented or inert image markup cannot satisfy a required rendered consumer',()=>{
 const image='<img src="images/new.png" alt="New capture">';
 assert.equal(hasCurrentImage(image,'images/new.png','New capture'),true);
 for(const text of [`<!-- ${image} -->`,`<script>${image}</script>`,`<template>${image}</template>`,`\x60\x60\x60html\n${image}\n\x60\x60\x60`,'images/new.png New capture'])assert.equal(hasCurrentImage(text,'images/new.png','New capture'),false);
});
test('root build receipt rejects successful-looking JSON without the real root command and clean bookends',()=>{
 const build={command:'build.bat /s',sourceCommit:source,sourceCommitAtCompletion:source,sourceDirtyAtStart:false,sourceDirtyAtCompletion:false,exitCode:0,executableSha256:'1'.repeat(64),archiveSha256:'2'.repeat(64),nativeHostSha256:'3'.repeat(64)};
 // This is a validator input fixture only, not a runtime or delivery attestation.
 for(const delta of [{command:'npm run build'},{sourceCommitAtCompletion:'0'.repeat(40)},{sourceDirtyAtStart:true},{sourceDirtyAtCompletion:true},{exitCode:1},{executableSha256:'4'.repeat(64)}])assert.throws(()=>validateRootBuild({...build,...delta},source,build.executableSha256),/ROOT_BUILD_BINDING/);
 assert.throws(()=>validateRootBuild({},source,build.executableSha256),/ROOT_BUILD_BINDING/);
});
test('normalized receipt without a hashed original root receipt cannot pass',async()=>{
 await assert.rejects(validateBuildReceipt({sourceCommit:source,sourceEndCommit:source,sourceClean:true,buildExitCode:0,artifactSha256:'1'.repeat(64),asarSha256:'2'.repeat(64)}, {artifactSha256:'1'.repeat(64)},root,source),/NORMALIZED_BUILD_BINDING/);
});
test('pending rows cannot carry invented accepted proof and unavailable rows require a reason',()=>{
 let value=fresh();value.records[0].replacement={path:'fake.png'};assert.throws(()=>validateInventory(value,source),/PENDING_HAS_PROOF/);
 value=fresh();value.records[0].status='unavailable';assert.throws(()=>validateInventory(value,source),/UNAVAILABLE_WITHOUT_REASON/);
});
test('deduplicated references require exactly compatible target tuples and captions',()=>{
 const value=fresh();value.records[1].dedupKey=value.records[0].dedupKey;assert.throws(()=>validateInventory(value,source),/INCOMPATIBLE_DEDUP_CAPTION/);
});
test('historical labels do not exempt currently rendered old screenshots',()=>{
 const row=original.records[0],short=row.old.path.replace(/^docs\//,'');
 for(const text of [`![Historical original](${row.old.path})`,`<figure data-gallery-role="historical"><img src="${short}"></figure>`,`<source srcset="${short} 1x">`,`background:url(${short})`])assert.deepEqual(staleReferences(text,[row]),[row.id]);
 assert.deepEqual(staleReferences(`<img src="${short.replaceAll('/','%2F')}">`,[row]),[row.id]);
 assert.deepEqual(staleReferences(`Preserved historical path: ${row.old.path}`,[row]),[]);
});
test('receipt declaration alone cannot establish a replacement',async()=>{
 const row=structuredClone(original.records[0]);row.status='accepted';row.replacement={path:'new.png'};
 await assert.rejects(verifyReplacement(row,{root,expectedSource:source}),/REPLACEMENT_NOT_ACCEPTED/);
});
test('evidence containment rejects traversal and absolute locations',async()=>{
 for(const name of ['../image.png','/image.png','C:\\image.png','a/../image.png'])await assert.rejects(contained(root,name),/UNSAFE_EVIDENCE_PATH/);
});
test('image parser rejects non-PNG and incomplete image data',()=>{
 assert.throws(()=>pngDimensions(Buffer.from('not a screenshot')),/INVALID_PNG/);
 const truncated=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(truncated);truncated.write('IHDR',12);truncated.writeUInt32BE(13,8);assert.throws(()=>pngDimensions(truncated),/PNG_CRC/);
});
test('PNG decoding rejects forged CRC, invalid IDAT and impossible scanline filters',()=>{
 const chunk=(kind,data)=>{const body=Buffer.concat([Buffer.from(kind),data]),out=Buffer.alloc(body.length+8);out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE(crc32(body),out.length-4);return out;};
 const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
 const png=(compressed)=>Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',Buffer.alloc(0))]);
 // Decoder fixture only. Never a capture, promotion receipt or runtime evidence.
 assert.deepEqual(pngDimensions(png(deflateSync(Buffer.from([0,1,2,3,255])))),{width:1,height:1});
 const corrupt=png(deflateSync(Buffer.from([0,1,2,3,255])));corrupt[29]^=1;assert.throws(()=>pngDimensions(corrupt),/PNG_CRC/);
 assert.throws(()=>pngDimensions(png(Buffer.from('invalid deflate'))),/PNG_IDAT_DECODE/);
 assert.throws(()=>pngDimensions(png(deflateSync(Buffer.from([5,1,2,3,255])))),/PNG_FILTER/);
 assert.throws(()=>pngDimensions(png(deflateSync(Buffer.from([0,1])))),/PNG_SCANLINE_LENGTH/);
});
test('PNG dimensions must match independent geometry, not matching invented receipt dimensions',()=>{
 const receipt={runtime:{hwnd:'fixture'},state:{captureKind:'page'},capture:{startedAt:'2026-10-14T00:00:00Z',capturedAt:'2026-10-14T00:00:01Z'}},target={viewport:{width:100,height:80,scale:1}};
 const geometry={schemaVersion:1,sourceCommit:source,hwnd:'fixture',method:'observed-native-client-and-browser-geometry',viewportCss:{width:100,height:80},devicePixelRatio:1,rendererZoom:1.5,nativeClientPixels:{width:100,height:80},capturePixels:{width:100,height:80},scaleKind:'device-pixel-ratio',observedAt:'2026-10-14T00:00:00.500Z'};
 assert.throws(()=>validateGeometry(geometry,receipt,target,{width:1,height:1},source),/GEOMETRY_PIXEL_BINDING/);
 assert.throws(()=>validateGeometry({...geometry,nativeClientPixels:{width:150,height:120}},receipt,target,{width:100,height:80},source),/GEOMETRY_PIXEL_BINDING/);
 assert.throws(()=>validateGeometry({...geometry,scaleKind:'physical-display',physicalDisplayScale:1,physicalDisplayScaleObserved:false},receipt,target,{width:100,height:80},source),/PHYSICAL_SCALE_UNVERIFIED/);
});
test('generated markup and scripts cannot embed old PNG bytes without the old path',async()=>{
 const bytes=await fs.readFile(path.join(root,original.records[0].old.path)),url='data:image/png;base64,'+bytes.toString('base64');
 for(const content of [`<img src="${url}">`,`x{background:url(${url})}`,JSON.stringify({image:url}),`export default ${JSON.stringify(url)}`])assert.deepEqual(embeddedOldImages(content),[original.records[0].id]);
});
test('forged receipt source is rejected before accepting any pixels',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'presentation-rejection-'));
 try{
  const {createHash}=await import('node:crypto'),bytes=Buffer.from(JSON.stringify({version:1,route:'cheap-lowlevel-headless',source:{startCommit:'0'.repeat(40),endCommit:'0'.repeat(40)}}));
  await fs.writeFile(path.join(directory,'receipt.json'),bytes);
  const row=structuredClone(original.records[0]);row.status='accepted';row.replacement={receipt:'receipt.json',receiptSha256:createHash('sha256').update(bytes).digest('hex')};
  await assert.rejects(verifyReplacement(row,{root,evidenceRoot:directory,expectedSource:source}),/RECEIPT_SOURCE_OR_ROUTE/);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('actual pending delivery stays red while rejection regressions pass',async()=>{
 const result=await checkCurrentPresentation({root,expectedSource:source});
 assert.equal(result.ok,false);assert.equal(result.records,24);
 assert.ok(result.errors.some(error=>error.includes('PRESENTATION_ROOT_REQUIRED')));
 assert.ok(result.errors.some(error=>error.includes('pending')));
 assert.ok(result.errors.some(error=>error.includes('old image admitted')));
});
