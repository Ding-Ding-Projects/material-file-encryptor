import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createForgeToolResolver} from './startup-photo-tools.js';

const execute=promisify(execFile);
export const PHOTO_SOURCE='https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json';
const REPOSITORY='Ding-Ding-Projects/dim-sum-photos',MAX_IMAGE=4*1024*1024,MAX_METADATA=16*1024*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const validName=value=>typeof value==='string'&&value.length>0&&value.length<=180&&!/[\x00-\x1f\x7f]/.test(value);
function imageFormat(bytes){
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR')return{mime:'image/png',width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
 if(bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
  const kind=bytes.toString('ascii',12,16);
  if(kind==='VP8X')return{mime:'image/webp',width:1+bytes.readUIntLE(24,3),height:1+bytes.readUIntLE(27,3)};
  if(kind==='VP8 '&&bytes[23]===0x9d&&bytes[24]===1&&bytes[25]===0x2a)return{mime:'image/webp',width:bytes.readUInt16LE(26)&16383,height:bytes.readUInt16LE(28)&16383};
  if(kind==='VP8L'&&bytes[20]===0x2f){const bits=bytes.readUInt32LE(21);return{mime:'image/webp',width:(bits&16383)+1,height:((bits>>>14)&16383)+1};}
 }
 if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){let cursor=2;while(cursor+4<=bytes.length){if(bytes[cursor++]!==255)return null;while(bytes[cursor]===255)cursor++;const marker=bytes[cursor++];if(marker===0xda||marker===0xd9)break;if(marker===1||marker>=0xd0&&marker<=0xd7)continue;const length=bytes.readUInt16BE(cursor);if(length<2||cursor+length>bytes.length)return null;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7)return{mime:'image/jpeg',height:bytes.readUInt16BE(cursor+3),width:bytes.readUInt16BE(cursor+5)};cursor+=length;}}
 return null;
}
async function inspectNative(bytes){const {nativeImage}=await import('electron');const image=nativeImage.createFromBuffer(bytes);return image.isEmpty()?null:image.getSize();}
export function readRuntimeAccessibility(runtime){try{const enabled=runtime.accessibilitySupportEnabled;return{known:typeof enabled==='boolean',enabled:enabled===true,source:'runtime'};}catch{return{known:false,enabled:false,source:'runtime'};}}
export function createStartupPhotoService({dataDirectory,toolsDirectory,resolveTool=createForgeToolResolver(toolsDirectory),executeFile=execute,run,inspectImage=inspectNative,random=Math.random}={}){
 const runCommand=run||async function(args,options){const executable=await resolveTool('gh');return(await executeFile(executable,args,{...options,windowsHide:true,timeout:15000,encoding:'buffer'})).stdout;};
 let closed=false,inflight;const controller=new AbortController();
 const api=async(endpoint,{raw=false,limit=MAX_METADATA}={})=>{
  if(closed)throw Error('Photo lookup is closed.');
  const output=await runCommand(['api',endpoint,...(raw?['-H','Accept: application/vnd.github.raw+json']:[])],{signal:controller.signal,maxBuffer:limit});
  const bytes=Buffer.from(output);if(bytes.length>limit)throw Error('Public source exceeds the allowed size.');return raw?bytes:JSON.parse(bytes.toString('utf8'));
 };
 async function resolve(){
  try{
   if(closed)return null;
   const head=await api(`repos/${REPOSITORY}/commits/main`);if(!/^[a-f0-9]{40}$/.test(head.sha))return null;
   const catalogBytes=await api(`repos/${REPOSITORY}/contents/catalog/index.json?ref=${head.sha}`,{raw:true});const catalog=JSON.parse(catalogBytes.toString('utf8'));if(!Array.isArray(catalog.dishes)||catalog.dishes.length>10000)return null;
   const releases=[];for(let page=1;page<=3;page++){const rows=await api(`repos/${REPOSITORY}/releases?per_page=100&page=${page}`);if(!Array.isArray(rows))return null;releases.push(...rows);if(rows.length<100)break;}
   const assets=new Map();
   for(const release of releases){if(release.draft||release.prerelease||!/^catalog-v1(?:[A-Za-z0-9._-]*)$/.test(release.tag_name)||!Array.isArray(release.assets))continue;
    for(const asset of release.assets){if(!Number.isSafeInteger(asset.id)||asset.id<1||!Number.isSafeInteger(asset.size)||asset.size<24||asset.size>MAX_IMAGE||asset.state!=='uploaded'||!/^sha256:[a-f0-9]{64}$/.test(asset.digest||'')||!/^[-a-zA-Z0-9_.]+\.(png|jpe?g|webp)$/i.test(asset.name))continue;
     const expected=`https://github.com/${REPOSITORY}/releases/download/${release.tag_name}/${asset.name}`;if(asset.browser_download_url!==expected)continue;assets.set(asset.name,{...asset,tag:release.tag_name});
    }
   }
   const candidates=catalog.dishes.filter(dish=>validName(dish.name?.en)&&validName(dish.name?.zhHant)&&typeof dish.image?.path==='string'&&/^images\/[-a-zA-Z0-9_.]+\.(png|jpe?g|webp)$/i.test(dish.image.path)&&assets.has(dish.image.path.slice(7)));
   if(!candidates.length)return null;const draw=random();if(!Number.isFinite(draw)||draw<0||draw>=1)return null;const dish=candidates[Math.floor(draw*candidates.length)],asset=assets.get(dish.image.path.slice(7)),expectedDigest=asset.digest.slice(7);
   let bytes=null;const cache=dataDirectory?path.join(dataDirectory,'startup-photo-cache'):null;
   if(cache){try{const stat=await fs.lstat(path.join(cache,'image'));if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size===asset.size){const candidate=await fs.readFile(path.join(cache,'image'));if(digest(candidate)===expectedDigest)bytes=candidate;}}catch{}}
   if(!bytes){const output=await runCommand(['api',`repos/${REPOSITORY}/releases/assets/${asset.id}`,'-H','Accept: application/octet-stream'],{signal:controller.signal,maxBuffer:MAX_IMAGE,windowsHide:true,timeout:15000});bytes=Buffer.from(output);}
   if(closed||bytes.length!==asset.size||bytes.length>MAX_IMAGE||digest(bytes)!==expectedDigest)return null;
   const format=imageFormat(bytes);if(!format||format.width<1||format.height<1||format.width>4096||format.height>4096||format.width*format.height>16777216)return null;
   const decoded=await inspectImage(bytes);if(!decoded||decoded.width!==format.width||decoded.height!==format.height)return null;
   if(closed)return null;
   if(cache){try{await fs.mkdir(cache,{recursive:true,mode:0o700});const stat=await fs.lstat(cache);if(!stat.isDirectory()||stat.isSymbolicLink())return null;const suffix=randomUUID(),temporary=path.join(cache,`image-${suffix}`);await fs.writeFile(temporary,bytes,{flag:'wx',mode:0o600});await fs.rename(temporary,path.join(cache,'image'));const receiptTemporary=path.join(cache,`receipt-${suffix}`);await fs.writeFile(receiptTemporary,JSON.stringify({source:PHOTO_SOURCE,revision:head.sha,catalogSha256:digest(catalogBytes),imageUrl:asset.browser_download_url,release:asset.tag,sha256:expectedDigest,bytes:bytes.length,width:format.width,height:format.height,mime:format.mime}),{flag:'wx',mode:0o600});await fs.rename(receiptTemporary,path.join(cache,'receipt.json'));}catch{/* A private cache is optional; a verified public image is still usable. */}}
   if(closed)return null;
   return{name:{en:dish.name.en,zhHant:dish.name.zhHant},imageUrl:asset.browser_download_url,published:true,imageDataUrl:`data:${format.mime};base64,${bytes.toString('base64')}`};
  }catch{return null;}
 }
 return{resolvePublishedDish(){if(closed)return Promise.resolve(null);return inflight??=(resolve());},close(){closed=true;controller.abort();}};
}
