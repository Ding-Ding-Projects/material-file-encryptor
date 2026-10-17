import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {inflateSync} from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sizes = [16,20,24,32,40,48,64,128,256];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const source = 'browser-extension/icons/icon.svg';
const destination = 'assets/branding';
const sourceBytes = base => Buffer.from(fs.readFileSync(path.join(base,source),'utf8').replace(/\r\n/g,'\n'));

// Decode RGBA PNG scanlines, including all five PNG row filters. This checks
// actual alpha pixels rather than trusting the filename or PNG header alone.
export function inspectPng(bytes, size) {
  if (!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) throw Error('ICON_PNG_SIGNATURE');
  let offset=8, header, ended=false; const data=[];
  while(offset<bytes.length) {
    const length=bytes.readUInt32BE(offset), type=bytes.toString('ascii',offset+4,offset+8);
    if(offset+12+length>bytes.length)throw Error('ICON_PNG_TRUNCATED');
    const chunk=bytes.subarray(offset+8,offset+8+length);
    if(type==='IHDR')header=chunk;
    if(type==='IDAT')data.push(chunk);
    offset+=12+length;
    if(type==='IEND'){ended=true;break;}
  }
  if(!ended||offset!==bytes.length||header?.length!==13||header.readUInt32BE(0)!==size||header.readUInt32BE(4)!==size||header[8]!==8||header[9]!==6||header[10]!==0||header[11]!==0||header[12]!==0)throw Error('ICON_PNG_RGBA_DIMENSIONS');
  const raw=inflateSync(Buffer.concat(data)), stride=size*4;
  if(raw.length!==(stride+1)*size)throw Error('ICON_PNG_PIXELS');
  const pixels=Buffer.alloc(stride*size);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<size;y++) {
    const filter=raw[y*(stride+1)];if(filter>4)throw Error('ICON_PNG_FILTER');
    for(let x=0;x<stride;x++) {
      const i=y*stride+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-stride]:0,c=y&&x>=4?pixels[i-stride-4]:0;
      pixels[i]=(raw[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;
    }
  }
  let transparent=false,opaque=false,white=false;
  for(let i=0;i<pixels.length;i+=4){transparent ||= pixels[i+3]===0;opaque ||= pixels[i+3]===255;white ||= pixels[i]>210&&pixels[i+1]>210&&pixels[i+2]>210&&pixels[i+3]>200;}
  if(!transparent||!opaque||!white)throw Error('ICON_PNG_ALPHA_OR_MARK');
  return pixels;
}

export function inspectIco(bytes) {
  if(bytes.length<6||bytes.readUInt16LE(0)!==0||bytes.readUInt16LE(2)!==1||bytes.readUInt16LE(4)!==sizes.length)throw Error('ICON_ICO_DIRECTORY');
  let expected=6+16*sizes.length;
  for(let i=0;i<sizes.length;i++) {
    const p=6+16*i,size=sizes[i],length=bytes.readUInt32LE(p+8),offset=bytes.readUInt32LE(p+12);
    if((bytes[p]||256)!==size||(bytes[p+1]||256)!==size||bytes[p+2]!==0||bytes[p+3]!==0||bytes.readUInt16LE(p+4)!==1||bytes.readUInt16LE(p+6)!==32||offset!==expected||offset+length>bytes.length)throw Error('ICON_ICO_FRAME');
    inspectPng(bytes.subarray(offset,offset+length),size);expected+=length;
  }
  if(expected!==bytes.length)throw Error('ICON_ICO_TRAILING');
}

export function checkIcons(base=root) {
  const manifest=JSON.parse(fs.readFileSync(path.join(base,destination,'manifest.json')));
  if(manifest.schemaVersion!==1||manifest.source!==source||manifest.renderer!=='@resvg/resvg-js@2.6.2'||JSON.stringify(manifest.sizes)!==JSON.stringify(sizes))throw Error('ICON_MANIFEST');
  if(digest(sourceBytes(base))!==manifest.sourceSha256)throw Error('ICON_SOURCE_CHANGED');
  for(const name of ['app.ico','app.png'])if(digest(fs.readFileSync(path.join(base,destination,name)))!==manifest.files[name])throw Error('ICON_ASSET_CHANGED');
  inspectIco(fs.readFileSync(path.join(base,destination,'app.ico')));
  inspectPng(fs.readFileSync(path.join(base,destination,'app.png')),256);
  return manifest;
}

async function generate(toolRoot) {
  if(!toolRoot)throw Error('Supply the directory containing a pinned @resvg/resvg-js@2.6.2 installation.');
  const require=createRequire(path.resolve(toolRoot,'package.json'));
  if(require('@resvg/resvg-js/package.json').version!=='2.6.2')throw Error('ICON_RENDERER_VERSION');
  const {Resvg}=require('@resvg/resvg-js'), svg=sourceBytes(root);
  const frames=sizes.map(size=>Buffer.from(new Resvg(svg,{fitTo:{mode:'width',value:size},font:{loadSystemFonts:false}}).render().asPng()));
  const directory=Buffer.alloc(6+16*sizes.length);directory.writeUInt16LE(1,2);directory.writeUInt16LE(sizes.length,4);
  let offset=directory.length;
  frames.forEach((frame,i)=>{inspectPng(frame,sizes[i]);const p=6+i*16;directory[p]=directory[p+1]=sizes[i]%256;directory.writeUInt16LE(1,p+4);directory.writeUInt16LE(32,p+6);directory.writeUInt32LE(frame.length,p+8);directory.writeUInt32LE(offset,p+12);offset+=frame.length;});
  const ico=Buffer.concat([directory,...frames]);inspectIco(ico);
  fs.mkdirSync(path.join(root,destination),{recursive:true});
  fs.writeFileSync(path.join(root,destination,'app.ico'),ico);
  fs.writeFileSync(path.join(root,destination,'app.png'),frames.at(-1));
  fs.writeFileSync(path.join(root,destination,'manifest.json'),JSON.stringify({schemaVersion:1,source,sourceSha256:digest(svg),renderer:'@resvg/resvg-js@2.6.2',sizes,files:{'app.ico':digest(ico),'app.png':digest(frames.at(-1))}},null,2)+'\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv[2]==='generate')await generate(process.argv[3]);
  else if(process.argv[2]!=='check')throw Error('Use check or generate <tool-directory>.');
  checkIcons();console.log('Desktop icons: source, hashes, nine ICO frames and RGBA pixels verified.');
}
