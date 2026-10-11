import {createLocalSnapshotRegistry} from './local-snapshots.js';
import {inspectPngSource} from './image-source.js';
import {mountColorPicker,validateColorPalette} from './color-picker.js';
import {mountControlGuidance} from '../../../shared/surface/control-guidance.js';
import {control as materialControl,connectSelectSearch} from '../../../shared/surface/controls.js';
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
export function logoGeometry(width,height,options={}){
 const number=(key,fallback,min,max)=>{if(options[key]!==undefined&&String(options[key]).trim()==='')throw Error('Logo crop and safe area values are invalid.');const value=options[key]===undefined?fallback:Number(options[key]);if(!Number.isFinite(value)||value<min||value>max)throw Error('Logo crop and safe area values are invalid.');return value;};
 const cropX=number('cropX',0,0,0.99),cropY=number('cropY',0,0,0.99),cropWidth=number('cropWidth',1,0.01,1),cropHeight=number('cropHeight',1,0.01,1),safe=number('safeArea',0,0,0.25),x=number('x',0.5,0,1),y=number('y',0.5,0,1);
 if(cropX+cropWidth>1.000001||cropY+cropHeight>1.000001)throw Error('The crop rectangle must stay inside the image.');
 const sw=width*cropWidth,sh=height*cropHeight,space=128*(1-2*safe),scale=options.fit==='cover'?Math.max(space/sw,space/sh):Math.min(space/sw,space/sh),dw=sw*scale,dh=sh*scale;
 return{source:[width*cropX,height*cropY,sw,sh],destination:[128*safe+(space-dw)*x,128*safe+(space-dh)*y,dw,dh],clip:[128*safe,128*safe,space,space]};
}
export async function convertLogo(file,options={}) {
 if(file.size>LOGO_LIMITS.bytes)throw new Error('Image exceeds 4 MiB.');
 const bytes=await file.arrayBuffer(),type=inspectLogoBytes(bytes);
 if(file.size>LOGO_LIMITS.bytes)throw new Error('Image exceeds 4 MiB.');
 if(typeof createImageBitmap!=='function')throw new Error('Isolated image decoding is unavailable.');
 const bitmap=await createImageBitmap(new Blob([bytes],{type}));
 try{if(!bitmap.width||!bitmap.height||bitmap.width>LOGO_LIMITS.dimension||bitmap.height>LOGO_LIMITS.dimension||bitmap.width*bitmap.height>LOGO_LIMITS.pixels)throw new Error('Decoded image exceeds size bounds.');
 const size=128,canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas conversion unavailable.');
 if(options.background){ctx.fillStyle=options.background;ctx.fillRect(0,0,size,size);}
 const geometry=logoGeometry(bitmap.width,bitmap.height,options);ctx.save?.();if(ctx.rect){ctx.beginPath();ctx.rect(...geometry.clip);ctx.clip();}ctx.drawImage(bitmap,...geometry.source,...geometry.destination);ctx.restore?.(); const data=canvas.toDataURL('image/png'); if(!data.startsWith('data:image/png;base64,'))throw new Error('PNG conversion failed.');return {data,width:size,height:size,type:'image/png'};
 }finally{bitmap.close();}
}
export function validateLogoSnapshot(value){
 if(!value||value.version!==1||Object.keys(value).some(key=>!['version','dataUrl'].includes(key)))throw Error('Invalid local logo snapshot.');
 if(value.dataUrl===null)return{version:1,dataUrl:null};
 const data=value.dataUrl;if(typeof data!=='string'||data.length>1024*1024*4/3+64||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))throw Error('Invalid local logo snapshot.');
 const encoded=data.slice(22);let binary;try{binary=atob(encoded);}catch{throw Error('Invalid local logo snapshot.');}if(btoa(binary)!==encoded)throw Error('Invalid local logo snapshot.');const metadata=inspectPngSource(Uint8Array.from(binary,c=>c.charCodeAt(0)));if(metadata.width!==128||metadata.height!==128)throw Error('Local logo snapshots require a normalized 128 by 128 PNG.');return{version:1,dataUrl:data};
}
/** Display overrides are ephemeral. The editor remains the only base-storage writer. */
export function createLogoPresentation({storage=globalThis.localStorage,onChange=()=>{},onError=()=>{}}={}){
 let base={version:1,dataUrl:null},active=null,disposed=false,generation=0;
 const snapshots=createLocalSnapshotRegistry({storage,key:'m4e.logo.snapshots.v1',validate:validateLogoSnapshot});
 try{base=validateLogoSnapshot({version:1,dataUrl:storage.getItem('m4e.logo.private.v1')||null});}catch(error){onError(error);}
 const show=async next=>{if(disposed)throw Error('This control is unavailable.');const epoch=++generation;const result=await onChange(next.dataUrl);if(disposed||epoch!==generation)throw Error('This control is unavailable.');if(result===false)throw Error('The original control could not complete this action.');return true;};
 return{
  getBase:()=>structuredClone(base),getEffective:()=>structuredClone(active||base),
  resolve:reference=>snapshots.resolve(reference),registerSnapshot:(reference,snapshot=base,label=reference)=>snapshots.register(reference,snapshot,label),listSnapshots:()=>snapshots.list(),removeSnapshot:reference=>snapshots.remove(reference),
  async updateBase(dataUrl){const next=validateLogoSnapshot({version:1,dataUrl});if(active){base=next;return true;}await show(next);base=next;return true;},
  async applyTransient(snapshot){const next=validateLogoSnapshot(snapshot);await show(next);active=next;return true;},
  async clearTransient(){await show(base);active=null;return true;},
  destroy(){disposed=true;generation++;active=null;}
 };
}
export function mountLogoEditor(root,services={}) {
 const doc=root.ownerDocument,t=appearanceTranslator(services.translate),message=source=>t(source,{message:true});
 const storage=services.storage||globalThis.localStorage,key='m4e.logo.private.v1',bindings=[],guides=[];let disposed=false,generation=0;
 const box=doc.createElement('section');box.className='appearance-logo';
 const title=doc.createElement('h3');title.textContent=t('Application logo');const input=materialControl('input',{type:'file'},[],doc);input.accept='image/png,image/jpeg,image/webp';input.setAttribute('aria-label',t('Choose a local logo'));
 const preview=doc.createElement('img');preview.alt=t('Logo preview');preview.width=preview.height=64;const status=doc.createElement('p');status.setAttribute('role','status');
 const fit=doc.createElement('md-outlined-button');fit.type='button';fit.textContent=`${t('Fit')}: ${t('contain')}`;let mode='contain',source;const draft={cropX:0,cropY:0,cropWidth:1,cropHeight:1,safeArea:0,background:''};
 const x=materialControl('input',{type:'range'},[],doc),y=materialControl('input',{type:'range'},[],doc);for(const [control,label]of [[x,'Horizontal focal point'],[y,'Vertical focal point']]){control.type='range';control.min='0';control.max='1';control.step='.01';control.value='.5';control.setAttribute('aria-label',t(label));}
 let acceptedLogo=null;let application=Promise.resolve();
 const commitLogo=(data,expected=generation)=>{const operation=application.catch(()=>{}).then(async()=>{if(disposed||expected!==generation)throw Error('This control is unavailable.');const previous=acceptedLogo;await publish(data);if(disposed||expected!==generation){await services.onChange?.(previous);throw Error('This control is unavailable.');}try{if(data===null)storage?.removeItem(key);else storage?.setItem(key,data);}catch(error){await publish(previous);throw error;}acceptedLogo=data;services.onCommit?.(data);});application=operation;return operation;};
 const publish=async data=>{const accepted=await services.onChange?.(data);if(accepted===false)throw Error('The original control could not complete this action.');if(data===null)preview.removeAttribute('src');else preview.src=data;};
 async function update(){if(!source)throw Error('Choose a local logo first.');const epoch=++generation;status.textContent=message('Converting locally…');const result=await convertLogo(source,{fit:mode,x:x.value,y:y.value,...draft});if(disposed||epoch!==generation)throw Error('This control is unavailable.');await commitLogo(result.data,epoch);if(disposed||epoch!==generation)throw Error('This control is unavailable.');status.textContent=message('Converted to 128 × 128 PNG locally. Metadata and color profile are flattened.');return result;}
 const reset=doc.createElement('md-outlined-button');reset.type='button';reset.textContent=t('Reset logo');
 const notice=doc.createElement('p');notice.textContent=message('Logo output is a static 128 × 128 PNG. Cropping removes outside pixels; a background replaces transparency. Metadata and color profiles are flattened before applying.');box.append(title,notice,input,fit,x,y,preview,reset,status);root.append(box);
 const wire=(control,name,action,eventType='click')=>{const binding=bindNestedConsumer(control,action,{eventType,available:()=>!disposed&&control.isConnected!==false,onError:error=>status.textContent=message(error.message)});bindings.push(binding);guides.push(mountNestedGuidance(control,name,binding,{t,services,instance:name}));};
 wire(input,'logo-file',()=>{source=input.files?.[0];return update();},'change');
 wire(fit,'logo-fit',()=>{mode=mode==='contain'?'cover':'contain';fit.textContent=`${t('Fit')}: ${t(mode)}`;return update();});
 for(const [control,name]of [[x,'logo-x'],[y,'logo-y']])wire(control,name,()=>{const value=Number(control.value);if(!Number.isFinite(value)||value<0||value>1)throw Error('A required value is invalid. Correct the original control before continuing.');return update();},'change');
 wire(reset,'logo-reset',async()=>{generation++;await commitLogo(null);source=undefined;input.value='';if(disposed)throw Error('This control is unavailable.');preview.removeAttribute('src');status.textContent=message('Original logo restored.');});
 const advanced=doc.createElement('details'),summary=doc.createElement('summary');summary.textContent=t('Crop and background');advanced.append(summary);y.after(advanced);
 const extra=(control,label,run,eventType='change')=>{const binding=bindNestedConsumer(control,run,{eventType,available:()=>!disposed&&control.isConnected!==false,onError:error=>status.textContent=message(error.message)});bindings.push(binding);const descriptor={id:'logo.authoring.'+label.toLowerCase().replace(/[^a-z]+/g,'-'),label,sourceId:'docs/features/interface/local-personalization.md',help:'docs/features/interface/local-personalization.md#logo-authoring',concept:'logo-authoring',purpose:label,options:'Use normalized values from zero to one.',default:'Full image with transparent background',effects:'The local logo is converted after a valid change.',example:'Keep a safe area around the mark.',validation:'Crop bounds must stay inside the source image.',recovery:'Restore valid bounds or choose another local image.',steps:['Review the local preview and conversion notice.','Adjust the selected logo control.','Check the resulting mark.']};guides.push(mountControlGuidance(control,{descriptor,t,run:binding.run,openHelp:services.openGuidanceHelp,registerHelp:services.registerHelp,registerCommands:services.registerCommands}));};
 for(const [name,label,min,max,initial]of [['cropX','Crop left',0,.99,0],['cropY','Crop top',0,.99,0],['cropWidth','Crop width',.01,1,1],['cropHeight','Crop height',.01,1,1],['safeArea','Logo safe area',0,.25,0]]){const control=materialControl('input',{type:'number',label:t(label),value:String(initial),min:String(min),max:String(max),step:'.01'},[],doc);advanced.append(control);extra(control,label,async()=>{if(!String(control.value).trim())throw Error('Logo crop and safe area values are invalid.');const previous=draft[name];draft[name]=Number(control.value);try{return await update();}catch(error){draft[name]=previous;throw error;}});}
 const preset=materialControl('select',{label:t('Logo preset')},[],doc);for(const [value,label]of [['','Custom image'],['lock','Lock emblem'],['key','Key emblem']])preset.append(materialControl('option',{value},[t(label)],doc));preset.value='';notice.after(preset);const presetSearch=connectSelectSearch(preset,{language:doc.documentElement?.lang?.startsWith('yue')?'yue':'en'});if(typeof presetSearch==='function')bindings.push({destroy:presetSearch});
 extra(preset,'Logo preset',async()=>{if(!['lock','key'].includes(preset.value))throw Error('Choose a local logo first.');const canvas=doc.createElement('canvas');canvas.width=canvas.height=128;const context=canvas.getContext('2d');if(!context)throw Error('Canvas conversion unavailable.');context.fillStyle='#6750a4';context.strokeStyle='#6750a4';context.lineWidth=12;context.lineCap='round';if(preset.value==='lock'){context.beginPath();context.arc(64,48,24,Math.PI,0);context.stroke();context.fillRect(28,48,72,60);context.clearRect(59,70,10,20);}else{context.beginPath();context.arc(44,44,22,0,Math.PI*2);context.stroke();context.beginPath();context.moveTo(60,60);context.lineTo(103,103);context.moveTo(82,82);context.lineTo(94,70);context.stroke();}const data=canvas.toDataURL('image/png');source={arrayBuffer:async()=>Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0)).buffer};return update();});
 const backgroundHost=doc.createElement('div'),backgroundTitle=doc.createElement('h4');backgroundTitle.textContent=t('Logo background');advanced.append(backgroundTitle,backgroundHost);const readPalette=()=>{const raw=storage?.getItem('m4e.logo.palette.v1');return validateColorPalette(raw?JSON.parse(raw):{custom:[],recent:[]});};const backgroundPicker=mountColorPicker(backgroundHost,{getPalette:readPalette,setPalette:value=>storage?.setItem('m4e.logo.palette.v1',JSON.stringify(validateColorPalette(value))),getCurrent:()=>draft.background||'#00000000',mutate:async value=>{if(typeof value!=='string')throw Error('A static logo requires a solid background color.');const previous=draft.background;draft.background=value;try{await update();}catch(error){draft.background=previous;throw error;}},reset:async()=>{const previous=draft.background;draft.background='';try{await update();}catch(error){draft.background=previous;throw error;}},translate:t,services,allowRainbow:false,instance:'logo-background'});bindings.push(backgroundPicker);
 try{const saved=storage?.getItem(key);if(saved){validateLogoSnapshot({version:1,dataUrl:saved});acceptedLogo=saved;publish(saved).catch(error=>{if(!disposed)status.textContent=message(error.message);});}}catch{status.textContent=message('Saved logo unavailable.');}
 return{destroy(){disposed=true;generation++;guides.forEach(guide=>guide.destroy());bindings.forEach(binding=>binding.destroy());box.remove();},reset:()=>reset.click()};
}
