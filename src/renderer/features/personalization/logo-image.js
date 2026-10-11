import {inspectPngSource} from './image-source.js';
export const LOGO_LIMITS = Object.freeze({bytes:4*1024*1024,pixels:16000000,dimension:8192});
export function inspectLogoBytes(buffer) {
 const b=new Uint8Array(buffer); if(b.length>LOGO_LIMITS.bytes)throw new Error('Image exceeds 4 MiB.');
 const ascii=(at,n)=>String.fromCharCode(...b.slice(at,at+n));
 if(b[0]===137&&ascii(1,3)==='PNG'&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10){if(ascii(12,4)!=='IHDR'||b.length<24)throw new Error('Malformed PNG.'); for(let i=8;i+12<=b.length;){const n=new DataView(b.buffer,b.byteOffset+i,4).getUint32(0);if(['acTL','fcTL','fdAT'].includes(ascii(i+4,4)))throw new Error('Animated images are unsupported.');if(n>b.length-i-12)throw new Error('Malformed PNG.');i+=n+12;} return 'image/png';}
 if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){if(ascii(12,4)==='VP8X'&&(b[20]&2))throw new Error('Animated images are unsupported.');return 'image/webp';}
 throw new Error('Only static PNG, JPEG and WebP images are supported.');
}
export function logoGeometry(width,height,options={}){
 const number=(key,fallback,min,max)=>{if(options[key]!==undefined&&String(options[key]).trim()==='')throw Error('Logo crop and safe area values are invalid.');const value=options[key]===undefined?fallback:Number(options[key]);if(!Number.isFinite(value)||value<min||value>max)throw Error('Logo crop and safe area values are invalid.');return value;};
 const cropX=number('cropX',0,0,0.99),cropY=number('cropY',0,0,0.99),cropWidth=number('cropWidth',1,0.01,1),cropHeight=number('cropHeight',1,0.01,1),safe=number('safeArea',0,0,0.25),x=number('x',0.5,0,1),y=number('y',0.5,0,1);
 if(cropX+cropWidth>1.000001||cropY+cropHeight>1.000001)throw Error('The crop rectangle must stay inside the image.');
 const sw=width*cropWidth,sh=height*cropHeight,space=128*(1-2*safe),scale=options.fit==='cover'?Math.max(space/sw,space/sh):Math.min(space/sw,space/sh),dw=sw*scale,dh=sh*scale;
 return{source:[width*cropX,height*cropY,sw,sh],destination:[128*safe+(space-dw)*x,128*safe+(space-dh)*y,dw,dh],clip:[128*safe,128*safe,space,space]};
}
export function validateLogoSnapshot(value){
 if(!value||value.version!==1||Object.keys(value).some(key=>!['version','dataUrl'].includes(key)))throw Error('Invalid local logo snapshot.');
 if(value.dataUrl===null)return{version:1,dataUrl:null};
 const data=value.dataUrl;if(typeof data!=='string'||data.length>1024*1024*4/3+64||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))throw Error('Invalid local logo snapshot.');
 const encoded=data.slice(22);let binary;try{binary=atob(encoded);}catch{throw Error('Invalid local logo snapshot.');}if(btoa(binary)!==encoded)throw Error('Invalid local logo snapshot.');const metadata=inspectPngSource(Uint8Array.from(binary,c=>c.charCodeAt(0)));if(metadata.width!==128||metadata.height!==128)throw Error('Local logo snapshots require a normalized 128 by 128 PNG.');return{version:1,dataUrl:data};
}
export function inspectLogoDimensions(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input),type=inspectLogoBytes(bytes),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width=0,height=0;
 const ascii=(at,count)=>String.fromCharCode(...bytes.subarray(at,at+count)),u24=at=>bytes[at]|bytes[at+1]<<8|bytes[at+2]<<16;
 if(type==='image/png'){if(bytes.length<33)throw Error('Malformed PNG.');width=view.getUint32(16);height=view.getUint32(20);}
 else if(type==='image/jpeg'){let offset=2,segments=0;while(offset<bytes.length){if(++segments>4096||bytes[offset++]!==255)throw Error('Malformed JPEG.');while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;if(offset+2>bytes.length)throw Error('Malformed JPEG.');const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)throw Error('Malformed JPEG.');if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<8)throw Error('Malformed JPEG.');height=view.getUint16(offset+3);width=view.getUint16(offset+5);break;}offset+=length;}}
 else{if(bytes.length<20||view.getUint32(4,true)+8!==bytes.length)throw Error('Malformed WebP.');let offset=12,chunks=0;while(offset+8<=bytes.length){if(++chunks>4096)throw Error('Malformed WebP.');const kind=ascii(offset,4),length=view.getUint32(offset+4,true),data=offset+8;if(data+length>bytes.length)throw Error('Malformed WebP.');if(['ANIM','ANMF'].includes(kind))throw Error('Animated images are unsupported.');if(kind==='VP8X'){if(length!==10||(bytes[data]&2))throw Error('Animated or malformed WebP.');width=u24(data+4)+1;height=u24(data+7)+1;}else if(kind==='VP8 '&&!width){if(length<10||ascii(data+3,3)!=='\x9d\x01\x2a')throw Error('Malformed WebP.');width=view.getUint16(data+6,true)&16383;height=view.getUint16(data+8,true)&16383;}else if(kind==='VP8L'&&!width){if(length<5||bytes[data]!==47)throw Error('Malformed WebP.');const bits=view.getUint32(data+1,true);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}offset=data+length+(length%2);}if(offset!==bytes.length)throw Error('Malformed WebP.');}
 if(!width||!height||width>LOGO_LIMITS.dimension||height>LOGO_LIMITS.dimension||width*height>LOGO_LIMITS.pixels)throw Error('Decoded image exceeds size bounds.');return{type,width,height};
}
