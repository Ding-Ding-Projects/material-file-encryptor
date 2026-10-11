import fs from 'node:fs/promises';
import path from 'node:path';

const abort=signal=>signal?.throwIfAborted();
const bounded=(offset,length,size)=>{if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset>size-length)throw Error('Font table exceeds file bounds.');};
const fixed=(buffer,offset)=>buffer.readInt32BE(offset)/65536;
const tag=(buffer,offset)=>buffer.toString('ascii',offset,offset+4);

/** Read only directory, naming and variation tables. Resource limits reject an
 * unsupported table explicitly, without truncating the inventory. */
export async function readFontMetadata(read,size,{signal}={}){
 const bytes=async(offset,length)=>{abort(signal);bounded(offset,length,size);const result=await read(offset,length);if(result.length!==length)throw Error('Font changed or ended during read.');abort(signal);return result;};
 const head=await bytes(0,12);let offsets=[0];
 if(tag(head,0)==='ttcf'){const version=head.readUInt32BE(4);if(![0x10000,0x20000].includes(version))throw Error('Unsupported collection version.');const count=head.readUInt32BE(8);if(!count||count>4096)throw Error('Unsupported collection directory size.');const table=await bytes(12,count*4);offsets=Array.from({length:count},(_,i)=>table.readUInt32BE(i*4));}
 const faces=[];let metadataBytes=0;
 for(const [faceIndex,offset]of offsets.entries()){
  const header=await bytes(offset,12),signature=header.readUInt32BE(0);if(![0x10000,0x4f54544f,0x74727565].includes(signature))throw Error('Unsupported font outline format.');
  const count=header.readUInt16BE(4);if(!count||count>4096)throw Error('Unsupported font table directory size.');
  const directory=await bytes(offset+12,count*16),tables=new Map();
  for(let i=0;i<count;i++){const at=i*16,key=tag(directory,at),start=directory.readUInt32BE(at+8),length=directory.readUInt32BE(at+12);bounded(start,length,size);if(tables.has(key))throw Error('Duplicate font table.');tables.set(key,{start,length});}
  const table=async key=>{const record=tables.get(key);if(!record)return null;if(record.length>4*1024*1024)throw Error(`Unsupported ${key} table size.`);return bytes(record.start,record.length);};
  const names=await table('name');if(!names||names.length<6)throw Error('Font naming table is unavailable.');
  const format=names.readUInt16BE(0);if(format>1)throw Error('Unsupported naming table format.');
  const nameCount=names.readUInt16BE(2),strings=names.readUInt16BE(4);bounded(6,nameCount*12,names.length);const nameMap=new Map();
  for(let i=0;i<nameCount;i++){
   const at=6+i*12,platform=names.readUInt16BE(at),encoding=names.readUInt16BE(at+2),language=names.readUInt16BE(at+4),id=names.readUInt16BE(at+6),length=names.readUInt16BE(at+8),start=strings+names.readUInt16BE(at+10);bounded(start,length,names.length);
   if(![0,3].includes(platform)||(platform===3&&![0,1,10].includes(encoding)))continue;
   if(length%2)throw Error('Invalid Unicode font name.');let value='';for(let n=start;n<start+length;n+=2)value+=String.fromCharCode(names.readUInt16BE(n));value=value.replace(/[\x00-\x1f\x7f]/g,'').trim();
   if(value&&value.length<=1024){const rank=language===0x409?3:platform===0?2:1;if(!nameMap.has(id)||nameMap.get(id).rank<rank)nameMap.set(id,{value,rank});}
  }
  const name=id=>nameMap.get(id)?.value;const family=name(16)||name(1);if(!family)throw Error('No supported Unicode family name.');
  const axes=[],instances=[],variation=await table('fvar');
  if(variation){
   if(variation.length<16||variation.readUInt32BE(0)!==0x10000)throw Error('Unsupported variation table version.');
   const start=variation.readUInt16BE(4),axisCount=variation.readUInt16BE(8),axisSize=variation.readUInt16BE(10),instanceCount=variation.readUInt16BE(12),instanceSize=variation.readUInt16BE(14);
   if(axisCount>64||instanceCount>4096)throw Error('Unsupported variation metadata size.');
   if(start<16||axisSize<20||instanceSize<4+axisCount*4)throw Error('Invalid variation record size.');bounded(start,axisCount*axisSize+instanceCount*instanceSize,variation.length);
   const seen=new Set();for(let i=0;i<axisCount;i++){
    const at=start+i*axisSize,key=tag(variation,at),min=fixed(variation,at+4),defaultValue=fixed(variation,at+8),max=fixed(variation,at+12);
    if(!/^[\x20-\x7e]{4}$/.test(key)||seen.has(key)||min>defaultValue||defaultValue>max)throw Error('Invalid variable font axis.');seen.add(key);
    axes.push({tag:key,name:name(variation.readUInt16BE(at+18))||key,min,default:defaultValue,max,hidden:!!(variation.readUInt16BE(at+16)&1)});
   }
   for(let i=0;i<instanceCount;i++){const at=start+axisCount*axisSize+i*instanceSize,values={};axes.forEach((axis,n)=>{const value=fixed(variation,at+4+n*4);if(value<axis.min||value>axis.max)throw Error('Named instance exceeds axis bounds.');values[axis.tag]=value;});instances.push({name:name(variation.readUInt16BE(at))||`Instance ${i+1}`,values});}
  }
  const face={faceIndex,family,style:name(17)||name(2)||'Regular',axes,instances,variationStatus:variation?'available':'static-font'};metadataBytes+=Buffer.byteLength(JSON.stringify(face));if(metadataBytes>4*1024*1024)throw Error('Unsupported font metadata output size.');faces.push(face);
 }
 return faces;
}

export function parseFontBuffer(buffer,options){return readFontMetadata(async(offset,length)=>buffer.subarray(offset,offset+length),buffer.length,options);}
const inside=(root,candidate)=>{const relative=path.relative(root,candidate);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};

/** Standard Windows locations only. No registry traversal, font mutation,
 * network access, raw font export or arbitrary caller path is supported. */
export async function collectInstalledFontMetadata({signal,onProgress=()=>{},platform=process.platform,environment=process.env,io=fs}={}){
 if(platform!=='win32')return {status:'unavailable',reason:'Installed font metadata is available only on Windows.',faces:[],unavailable:[],scanned:0};
 const requested=[environment.WINDIR&&path.join(environment.WINDIR,'Fonts'),environment.LOCALAPPDATA&&path.join(environment.LOCALAPPDATA,'Microsoft','Windows','Fonts')].filter(Boolean);
 const faces=[],unavailable=[],seen=new Set();let scanned=0;
 for(const [location,requestedRoot]of requested.entries()){
  abort(signal);let root;try{const info=await io.lstat(requestedRoot);if(info.isSymbolicLink())throw Error('Linked font location is unsupported.');root=await io.realpath(requestedRoot);}catch(error){unavailable.push({location,reason:error.code||error.message});continue;}
  async function walk(directory){
   abort(signal);const entries=await io.readdir(directory,{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name));
   for(const entry of entries){abort(signal);const candidate=path.join(directory,entry.name);let info;try{info=await io.lstat(candidate);if(info.isSymbolicLink()){unavailable.push({location,file:entry.name,reason:'Linked entry skipped.'});continue;}const resolved=await io.realpath(candidate);if(!inside(root,resolved))throw Error('Font path escapes its location.');if(info.isDirectory()){await walk(resolved);continue;}if(!info.isFile()||! /\.(ttf|otf|ttc|otc|fon|fnt|woff2?)$/i.test(entry.name))continue;if(seen.has(resolved.toLowerCase()))continue;seen.add(resolved.toLowerCase());scanned++;
    if(!/\.(ttf|otf|ttc|otc)$/i.test(entry.name))throw Error('Unsupported installed font file format.');
    const handle=await io.open(resolved,'r');try{const before=await handle.stat();if(!before.isFile()||before.dev!==info.dev||before.ino!==info.ino)throw Error('Font identity changed before open.');const metadata=await readFontMetadata(async(offset,length)=>{const buffer=Buffer.alloc(length);const {bytesRead}=await handle.read(buffer,0,length,offset);return buffer.subarray(0,bytesRead);},before.size,{signal});const after=await handle.stat();if(after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw Error('Font changed during metadata read.');for(const face of metadata)faces.push({...face,id:`${location}:${path.relative(root,resolved).split(path.sep).join('/')}:${face.faceIndex}`,location});}finally{await handle.close();}
   }catch(error){abort(signal);unavailable.push({location,file:entry.name,reason:error.code||error.message});}onProgress({scanned,faces:faces.length,unavailable:unavailable.length});}
  }
  try{await walk(root);}catch(error){abort(signal);unavailable.push({location,reason:error.code||error.message});}
 }
 return {status:unavailable.length?'partial':'available',faces,unavailable,scanned};
}
