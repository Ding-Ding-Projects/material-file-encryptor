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
 const storage=services.storage||globalThis.localStorage,key='m4e.logo.private.v1';const box=document.createElement('section');box.className='appearance-logo';
 const title=document.createElement('h3');title.textContent='Application logo';const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.setAttribute('aria-label','Choose a local logo');
 const preview=document.createElement('img');preview.alt='Logo preview';preview.width=preview.height=64;const status=document.createElement('p');status.setAttribute('role','status');
 const fit=document.createElement('button');fit.textContent='Fit: contain';let mode='contain',source;fit.onclick=()=>{mode=mode==='contain'?'cover':'contain';fit.textContent=`Fit: ${mode}`;if(source)update();};
 const x=document.createElement('input'),y=document.createElement('input');for(const [control,label]of [[x,'Horizontal focal point'],[y,'Vertical focal point']]){control.type='range';control.min='0';control.max='1';control.step='.01';control.value='.5';control.setAttribute('aria-label',label);control.onchange=()=>source&&update();}
 const publish=data=>{preview.src=data;services.onChange?.(data);};
 async function update(){status.textContent='Converting locally…';try{const result=await convertLogo(source,{fit:mode,x:x.value,y:y.value});storage?.setItem(key,result.data);publish(result.data);status.textContent='Converted to 128 × 128 PNG locally. Metadata and color profile are flattened.';}catch(error){status.textContent=error.message;}}
 input.onchange=()=>{source=input.files?.[0];if(source)update();};const reset=document.createElement('button');reset.textContent='Reset logo';reset.onclick=()=>{storage?.removeItem(key);preview.removeAttribute('src');source=undefined;input.value='';services.onChange?.(null);status.textContent='Original logo restored.';};
 try{const saved=storage?.getItem(key);if(saved?.startsWith('data:image/png;base64,')&&saved.length<LOGO_LIMITS.bytes*2)publish(saved);}catch{status.textContent='Saved logo unavailable.';}
 box.append(title,input,fit,x,y,preview,reset,status);root.append(box);return{destroy:()=>box.remove(),reset:()=>reset.click()};
}
