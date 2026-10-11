import {bindNestedConsumer,mountNestedGuidance} from './nested-guidance-mount.js';
import {appearanceTranslator} from './appearance-copy.js';
export const LOGO_LIMITS = Object.freeze({bytes:4*1024*1024,pixels:16000000,dimension:8192});
export function inspectLogoBytes(buffer) {
 const b=new Uint8Array(buffer); if(b.length>LOGO_LIMITS.bytes)throw new Error('Image exceeds 4 MiB.');
 const ascii=(at,n)=>String.fromCharCode(...b.slice(at,at+n));
 if(b[0]===137&&ascii(1,3)==='PNG'&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10){if(ascii(12,4)!=='IHDR'||b.length<24)throw new Error('Malformed PNG.'); for(let i=8;i+12<=b.length;){const n=new DataView(b.buffer,b.byteOffset+i,4).getUint32(0);if(ascii(i+4,4)==='acTL')throw new Error('Animated images are unsupported.');if(n>b.length-i-12)throw new Error('Malformed PNG.');i+=n+12;} return 'image/png';}
 if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){if(ascii(12,4)==='VP8X'&&(b[20]&2))throw new Error('Animated images are unsupported.');return 'image/webp';}
 throw new Error('Only static PNG, JPEG and WebP images are supported.');
}
export async function convertLogo(file,options={}) {
 const bytes=await file.arrayBuffer(),type=inspectLogoBytes(bytes);
 if(typeof createImageBitmap!=='function')throw new Error('Isolated image decoding is unavailable.');
 const bitmap=await createImageBitmap(new Blob([bytes],{type}));
 try{if(!bitmap.width||!bitmap.height||bitmap.width>LOGO_LIMITS.dimension||bitmap.height>LOGO_LIMITS.dimension||bitmap.width*bitmap.height>LOGO_LIMITS.pixels)throw new Error('Decoded image exceeds size bounds.');
 const size=128,canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas conversion unavailable.');
 if(options.background){ctx.fillStyle=options.background;ctx.fillRect(0,0,size,size);}
 const scale=options.fit==='contain'?Math.min(size/bitmap.width,size/bitmap.height):Math.max(size/bitmap.width,size/bitmap.height);
 const width=bitmap.width*scale,height=bitmap.height*scale, x=Math.max(0,Math.min(1,Number(options.x) || .5)),y=Math.max(0,Math.min(1,Number(options.y)||.5));
 ctx.drawImage(bitmap,(size-width)*x,(size-height)*y,width,height); const data=canvas.toDataURL('image/png'); if(!data.startsWith('data:image/png;base64,'))throw new Error('PNG conversion failed.');return {data,width:size,height:size,type:'image/png'};
 }finally{bitmap.close();}
}
export function mountLogoEditor(root,services={}) {
 const doc=root.ownerDocument,t=appearanceTranslator(services.translate),message=source=>t(source,{message:true});
 const storage=services.storage||globalThis.localStorage,key='m4e.logo.private.v1',bindings=[],guides=[];let disposed=false,generation=0;
 const box=doc.createElement('section');box.className='appearance-logo';
 const title=doc.createElement('h3');title.textContent=t('Application logo');const input=doc.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.setAttribute('aria-label',t('Choose a local logo'));
 const preview=doc.createElement('img');preview.alt=t('Logo preview');preview.width=preview.height=64;const status=doc.createElement('p');status.setAttribute('role','status');
 const fit=doc.createElement('button');fit.textContent=`${t('Fit')}: ${t('contain')}`;let mode='contain',source;
 const x=doc.createElement('input'),y=doc.createElement('input');for(const [control,label]of [[x,'Horizontal focal point'],[y,'Vertical focal point']]){control.type='range';control.min='0';control.max='1';control.step='.01';control.value='.5';control.setAttribute('aria-label',t(label));}
 const publish=async data=>{await services.onChange?.(data);preview.src=data;};
 async function update(){if(!source)throw Error('Choose a local logo first.');const epoch=++generation;status.textContent=message('Converting locally…');const result=await convertLogo(source,{fit:mode,x:x.value,y:y.value});if(disposed||epoch!==generation)throw Error('This control is unavailable.');storage?.setItem(key,result.data);await publish(result.data);if(disposed||epoch!==generation)throw Error('This control is unavailable.');status.textContent=message('Converted to 128 × 128 PNG locally. Metadata and color profile are flattened.');return result;}
 const reset=doc.createElement('button');reset.textContent=t('Reset logo');
 box.append(title,input,fit,x,y,preview,reset,status);root.append(box);
 const wire=(control,name,action,eventType='click')=>{const binding=bindNestedConsumer(control,action,{eventType,available:()=>!disposed,onError:error=>status.textContent=message(error.message)});bindings.push(binding);guides.push(mountNestedGuidance(control,name,binding,{t,services,instance:name}));};
 wire(input,'logo-file',()=>{source=input.files?.[0];return update();},'change');
 wire(fit,'logo-fit',()=>{mode=mode==='contain'?'cover':'contain';fit.textContent=`${t('Fit')}: ${t(mode)}`;return update();});
 for(const [control,name]of [[x,'logo-x'],[y,'logo-y']])wire(control,name,()=>{const value=Number(control.value);if(!Number.isFinite(value)||value<0||value>1)throw Error('A required value is invalid. Correct the original control before continuing.');return update();},'change');
 wire(reset,'logo-reset',async()=>{generation++;storage?.removeItem(key);source=undefined;input.value='';await services.onChange?.(null);if(disposed)throw Error('This control is unavailable.');preview.removeAttribute('src');status.textContent=message('Original logo restored.');});
 try{const saved=storage?.getItem(key);if(saved?.startsWith('data:image/png;base64,')&&saved.length<LOGO_LIMITS.bytes*2)publish(saved).catch(error=>{if(!disposed)status.textContent=message(error.message);});}catch{status.textContent=message('Saved logo unavailable.');}
 return{destroy(){disposed=true;generation++;guides.forEach(guide=>guide.destroy());bindings.forEach(binding=>binding.destroy());box.remove();},reset:()=>reset.click()};
}
