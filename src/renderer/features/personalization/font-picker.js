export function validateFontAxes(face,values){
 const result={};for(const axis of face.axes||[]){const value=values[axis.tag]??axis.default;if(typeof value!=='number'||!Number.isFinite(value)||value<axis.min||value>axis.max)throw Error(`Axis ${axis.tag} must be between ${axis.min} and ${axis.max}.`);result[axis.tag]=value;}
 for(const key of Object.keys(values))if(!face.axes.some(axis=>axis.tag===key))throw Error('Unknown font axis.');return result;
}
export function fontVariationCSS(values){return Object.entries(values).map(([key,value])=>{if(!/^[\x20-\x7e]{4}$/.test(key)||/["\\]/.test(key)||!Number.isFinite(value))throw Error('Invalid font variation value.');return `"${key}" ${value}`;}).join(', ')||'normal';}
export function validateFontFaceSelection(face,catalog){
 if(!/^(regular|normal)$/i.test(face.style||''))throw Error('This font style needs an exact face mapping before it can be applied.');
 const identity=value=>value.replace(/[A-Z]/g,letter=>letter.toLowerCase());
 if(face.axes?.length&&(catalog?.faces||[]).filter(candidate=>identity(candidate.family)===identity(face.family)).length!==1)throw Error('Variable axes cannot be applied to an ambiguous font family. Choose a uniquely mapped regular face.');
 return {fontStyle:'normal',fontWeight:'400'};
}
export const FONT_PICKER_COPY={
 'This font style needs an exact face mapping before it can be applied.':'呢個字型樣式要先有明確字型對應，先可以套用。',
 'Variable axes cannot be applied to an ambiguous font family. Choose a uniquely mapped regular face.':'字型家族對應唔明確，唔可以套用可變軸，請選只有一個明確對應嘅標準字型。',
 'Font family search':'搜尋字型家族','Installed font faces':'已安裝字型','Variable font axes':'可變字型軸','Font preview':'字型預覽','Reset axes to defaults':'將字型軸重設為預設值','Named font instance':'字型命名實例','Variable axes are unavailable for this static font.':'呢個靜態字型冇可變軸。','Font metadata is unavailable.':'字型中繼資料無法使用。','Choose a font face before adjusting axes.':'請先選字型，再調整字型軸。','No matching font faces.':'冇符合搜尋嘅字型。','Apply axis values':'套用字型軸數值',
};
/** Caller mutation remains the single permission, validation and history route.
 * Metadata does not contain font bytes and is not installed by this component. */
export function mountFontPicker(host,{catalog,getCurrent=()=>({}),mutate,translate=value=>value,attachSearch,registerHelp,disabled=()=>false}={}){
 if(typeof mutate!=='function')throw Error('The original appearance mutation callback is required.');
 const doc=host.ownerDocument,t=translate,disposers=[];let alive=true,selected=null,values={},busy=false;
 const box=doc.createElement('section'),search=doc.createElement('input'),list=doc.createElement('div'),axes=doc.createElement('fieldset'),sample=doc.createElement('p'),status=doc.createElement('p');
 search.type='search';search.setAttribute('aria-label',t('Font family search'));list.setAttribute('aria-label',t('Installed font faces'));sample.setAttribute('aria-label',t('Font preview'));sample.textContent='Aa 0123 香港文字';status.setAttribute('role','status');box.append(search,list,axes,sample,status);host.append(box);
 const off=attachSearch?.(box,list);if(typeof off==='function')disposers.push(off);
 const message=error=>{if(alive)status.textContent=t(error.message||String(error));};
 async function apply(nextFace,nextValues){if(!alive||busy||disabled())throw Error('This font control is unavailable.');const identity=validateFontFaceSelection(nextFace,catalog),validated=validateFontAxes(nextFace,nextValues);busy=true;try{await mutate({...identity,fontFamily:JSON.stringify(nextFace.family)+', system-ui, sans-serif',fontVariationSettings:fontVariationCSS(validated)});if(!alive)return;selected=nextFace;values=validated;renderAxes();sample.style.fontFamily=JSON.stringify(nextFace.family)+', system-ui, sans-serif';sample.style.fontStyle=identity.fontStyle;sample.style.fontWeight=identity.fontWeight;sample.style.fontVariationSettings=fontVariationCSS(validated);}finally{busy=false;}}
 function button(label,run){const node=doc.createElement('button');node.type='button';node.textContent=t(label);node.addEventListener('click',()=>Promise.resolve().then(run).catch(message));return node;}
 function renderAxes(){axes.replaceChildren();const legend=doc.createElement('legend');legend.textContent=t('Variable font axes');axes.append(legend);if(!selected){status.textContent=t('Choose a font face before adjusting axes.');return;}if(!selected.axes.length){status.textContent=t('Variable axes are unavailable for this static font.');return;}status.textContent='';const draft={...values},inputs=new Map();
  for(const axis of selected.axes){const label=doc.createElement('label'),input=doc.createElement('input'),bounds=doc.createElement('span');label.textContent=`${axis.name} (${axis.tag})`;input.type='number';input.min=String(axis.min);input.max=String(axis.max);input.step='any';input.value=String(values[axis.tag]);input.disabled=disabled();input.setAttribute('aria-label',`${axis.name} (${axis.tag})`);bounds.textContent=`${axis.min} / ${axis.default} / ${axis.max}`;input.addEventListener('change',()=>{try{if(input.value.trim()==='')throw Error('A numeric axis value is required.');const next=Number(input.value);validateFontAxes(selected,{...draft,[axis.tag]:next});draft[axis.tag]=next;input.setCustomValidity('');}catch(error){input.setCustomValidity(error.message);input.reportValidity();}});label.append(input,bounds);axes.append(label);const dispose=registerHelp?.({id:`font-axis:${selected.id}:${axis.tag}`,min:axis.min,default:axis.default,max:axis.max},input);if(typeof dispose==='function')axisDisposers.push(dispose);}
  for(const input of axes.querySelectorAll('input'))inputs.set(input.getAttribute('aria-label'),input);
  axes.append(button('Apply axis values',()=>{const next={};for(const axis of selected.axes){const input=inputs.get(`${axis.name} (${axis.tag})`);if(!input||input.value.trim()==='')throw Error('A numeric axis value is required.');next[axis.tag]=Number(input.value);}return apply(selected,next);}),button('Reset axes to defaults',()=>apply(selected,{})));
  for(const instance of selected.instances||[])axes.append(button(instance.name,()=>apply(selected,instance.values)));
 }
 const axisDisposers=[];const originalRender=renderAxes;renderAxes=()=>{axisDisposers.splice(0).forEach(dispose=>dispose());originalRender();};
 function renderList(){list.replaceChildren();const query=search.value.toLocaleLowerCase(),faces=(catalog?.faces||[]).filter(face=>`${face.family} ${face.style}`.toLocaleLowerCase().includes(query));for(const face of faces){const control=button(`${face.family} (${face.style})`,()=>apply(face,{}));control.style.fontFamily=JSON.stringify(face.family)+', system-ui, sans-serif';control.disabled=disabled();list.append(control);}if(!faces.length)status.textContent=t(catalog?.faces?'No matching font faces.':'Font metadata is unavailable.');}
 search.addEventListener('input',renderList);renderList();const current=getCurrent();selected=catalog?.faces?.find(face=>face.id===current.faceId)||null;if(selected)values=validateFontAxes(selected,current.axes||{});renderAxes();
 return {applyFace:(id,axisValues={})=>{const face=catalog?.faces?.find(face=>face.id===id);if(!face)throw Error('Font face is unavailable.');return apply(face,axisValues);},getSelection:()=>selected?{faceId:selected.id,axes:{...values}}:null,destroy(){if(!alive)return;alive=false;axisDisposers.splice(0).forEach(dispose=>dispose());disposers.forEach(dispose=>dispose());box.remove();}};
}
