export const IMAGE_SOURCE_LIMITS=Object.freeze({bytes:4*1024*1024,normalizedBytes:1024*1024,dimension:4096,pixels:8_000_000,chunks:4096});
const SIGNATURE=[137,80,78,71,13,10,26,10];
const invalid=()=>new Error('Invalid static PNG image.');
export function inspectPngSource(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.byteLength>IMAGE_SOURCE_LIMITS.bytes)throw new Error('PNG exceeds 4 MiB.');
 if(bytes.length<45||SIGNATURE.some((v,i)=>bytes[i]!==v))throw invalid();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=8,width=0,height=0,chunks=0,seenData=false,ended=false;
 while(offset<bytes.length){
  if(++chunks>IMAGE_SOURCE_LIMITS.chunks||offset+12>bytes.length)throw invalid();
  const size=view.getUint32(offset);if(size>bytes.length-offset-12)throw invalid();
  const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));if(!/^[A-Za-z]{4}$/.test(type))throw invalid();
  if(chunks===1){if(type!=='IHDR'||size!==13)throw invalid();width=view.getUint32(offset+8);height=view.getUint32(offset+12);
   if(!width||!height||width>IMAGE_SOURCE_LIMITS.dimension||height>IMAGE_SOURCE_LIMITS.dimension||width*height>IMAGE_SOURCE_LIMITS.pixels)throw new Error('PNG dimensions exceed the supported bounds.');
   const depth=bytes[offset+16],color=bytes[offset+17],allowed={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
   if(!allowed[color]?.includes(depth)||bytes[offset+18]!==0||bytes[offset+19]!==0||bytes[offset+20]>1)throw invalid();
  }else if(type==='IHDR')throw invalid();
  if(type==='acTL'||type==='fcTL'||type==='fdAT')throw new Error('Animated PNG images are unsupported.');
  if(type==='IDAT'){if(!size)throw invalid();seenData=true;}
  if(type==='IEND'){if(size!==0||!seenData||offset+12!==bytes.length)throw invalid();ended=true;break;}
  offset+=size+12;
 }
 if(!ended)throw invalid();return Object.freeze({width,height,bytes:bytes.byteLength,mime:'image/png'});
}
function decodeDataUrl(dataUrl){
 if(typeof dataUrl!=='string'||dataUrl.length>IMAGE_SOURCE_LIMITS.bytes*4/3+64||!/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(dataUrl))throw invalid();
 const encoded=dataUrl.slice(22);if(!encoded.length||encoded.length%4)throw invalid();let binary;try{binary=atob(encoded);}catch{throw invalid();}
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(btoa(binary)!==encoded)throw invalid();return bytes;
}
export function validateImageSource(value){
 if(!value||value.version!==1||value.mime!=='image/png')throw invalid();const metadata=inspectPngSource(decodeDataUrl(value.dataUrl));
 if(metadata.bytes>IMAGE_SOURCE_LIMITS.normalizedBytes)throw new Error('Normalized PNG exceeds 1 MiB.');
 if(value.width!==metadata.width||value.height!==metadata.height||value.bytes!==metadata.bytes)throw new Error('PNG source metadata does not match the image.');
 return Object.freeze({version:1,mime:'image/png',dataUrl:value.dataUrl,...metadata});
}
export async function normalizePngSource(file,environment={}){
 if(!file||typeof file.arrayBuffer!=='function'||Number(file.size)>IMAGE_SOURCE_LIMITS.bytes)throw new Error('PNG exceeds 4 MiB.');
 const bytes=new Uint8Array(await file.arrayBuffer()),metadata=inspectPngSource(bytes),decode=environment.createImageBitmap||globalThis.createImageBitmap;
 if(typeof decode!=='function')throw new Error('Image decoding is unavailable.');
 const bitmap=await decode(new Blob([bytes],{type:'image/png'}));
 try{
  if(bitmap.width!==metadata.width||bitmap.height!==metadata.height)throw new Error('Decoded PNG dimensions do not match its header.');
  const canvas=environment.createCanvas?environment.createCanvas(metadata.width,metadata.height):globalThis.document?.createElement('canvas');if(!canvas)throw new Error('Canvas conversion is unavailable.');canvas.width=metadata.width;canvas.height=metadata.height;
  const context=canvas.getContext('2d');if(!context)throw new Error('Canvas conversion is unavailable.');context.drawImage(bitmap,0,0);
  const dataUrl=canvas.toDataURL('image/png'),output=inspectPngSource(decodeDataUrl(dataUrl));if(output.width!==metadata.width||output.height!==metadata.height)throw new Error('Normalized PNG dimensions changed.');
  return validateImageSource({version:1,mime:'image/png',dataUrl,...output});
 }finally{bitmap.close?.();}
}
/** Portable exports keep metadata while omitting local pixels at every nested source. */
export function sanitizeImageSources(value){
 if(Array.isArray(value))return value.map(sanitizeImageSources);
 if(!value||typeof value!=='object')return value;
 const output={};for(const [key,item]of Object.entries(value)){
  if(['__proto__','constructor','prototype'].includes(key))throw new Error('Unsafe export key.');
  if(key==='imageSource'&&item&&typeof item==='object'){output.imageSourceOmitted=true;}
  else if(key==='source'&&item&&typeof item==='object'&&('dataUrl' in item||item.mime==='image/png')){output.imageSourceOmitted=true;}
  else if(key==='dataUrl'&&typeof item==='string'&&item.startsWith('data:image/'))continue;
  else output[key]=sanitizeImageSources(item);
 }return output;
}
export async function normalizeImageFile(file,document,{processImage,normalizeImage}={}){if(!file||typeof file.arrayBuffer!=='function'||file.size>IMAGE_SOURCE_LIMITS.bytes)throw Error('PNG exceeds 4 MiB.');const bytes=new Uint8Array(await file.arrayBuffer());inspectPngSource(bytes);if(normalizeImage){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return validateImageSource(await normalizeImage({dataUrl:'data:image/png;base64,'+btoa(binary)}));}const process=processImage||(await import('./appearance-raster.js')).runRasterOperation;return validateImageSource(await process({operation:'normalize',bytes}));}
export const sanitizeImageExport=sanitizeImageSources;
