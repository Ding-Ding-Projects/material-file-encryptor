import {appearanceTranslator} from './appearance-copy.js';
import {mountWorkbenchGuidance,WORKBENCH_GUIDANCE_COPY} from './workbench-guidance.js';

export function normalizePoint(x,y){return [x,y].map(n=>Math.round(Math.max(0,Math.min(100,Number(n)||0))*100)/100);}
export function snapPoint(point,guides=[],distance=2){return point.map((v,i)=>{const matches=guides.filter(g=>g.axis===(i===0?'x':'y')&&Math.abs(g.value-v)<=distance).sort((a,b)=>Math.abs(a.value-v)-Math.abs(b.value-v));return matches.length?matches[0].value:v;});}
export function freehandSelection(points){
 if(!Array.isArray(points)||points.length<3)throw new Error('Draw at least three points.');
 const step=Math.max(1,Math.ceil(points.length/32)),sample=points.filter((_,i)=>i%step===0).slice(0,32).map(p=>normalizePoint(...p));
 if(sample.length<3)throw new Error('Draw at least three points.');return {kind:'polygon',values:sample.flat()};
}
export function validateGuides(guides){if(!Array.isArray(guides)||guides.length>20)throw new Error('Use at most twenty guides.');return guides.map(g=>{if(!g||!['x','y'].includes(g.axis)||!Number.isFinite(Number(g.value))||Number(g.value)<0||Number(g.value)>100)throw new Error('Invalid guide.');return {axis:g.axis,value:Number(g.value)};});}

/** Local geometry surface. Original consumers own authorization and persistence. */
function workbenchContext(host,options){
 const doc=host.ownerDocument,base=appearanceTranslator(options.translate),disposers=[],guidance=[];let alive=true;
 const t=(text,settings={})=>{const language=settings.language||options.getLanguage?.();const translated=base(text,settings);if(translated!==text)return translated;const yue=WORKBENCH_GUIDANCE_COPY[text];return yue&&language==='yue'?yue:yue&&language==='bilingual'?`${text} / ${yue}`:text;};
 const available=()=>alive&&host.isConnected!==false&&options.isAvailable?.()!==false;
 const listen=(node,type,callback)=>{node.addEventListener(type,callback);disposers.push(()=>node.removeEventListener(type,callback));};
 function help(target,key,run,validate,context=''){
  const mounted=mountWorkbenchGuidance(target,{key,context,options,t,run:async()=>{if(!available()||target.isConnected===false||target.disabled||target.readOnly)throw Error(t('This workbench is no longer available.'));return run();},validate:async()=>{if(!available()||target.isConnected===false)throw Error(t('This workbench is no longer available.'));await validate?.();}});guidance.push(mounted);return mounted;
 }
 function action(parent,label,key,operation,validate,context=''){
  const row=doc.createElement('div');if(!['tool-search','preview-search','tool-search-clear','preview-search-clear'].includes(key))row.className='local-ux-field';parent.append(row);const button=doc.createElement('md-outlined-button');button.type='button';button.textContent=t(label);button.setAttribute('aria-label',t(label));row.append(button);let flight=null;
  listen(button,'click',()=>{if(!available()||button.disabled||flight)return;flight=Promise.resolve().then(operation);flight.then(accepted=>{if(accepted!==true&&available()){const status=host.querySelector('[role="status"]');if(status)status.textContent=t('The original control did not confirm a change.');}},error=>{if(available()){const status=host.querySelector('[role="status"]');if(status)status.textContent=t(error.message);options.onError?.(error);}});flight.finally(()=>{flight=null;}).catch(()=>{});});
  help(button,key,async()=>{if(flight)throw Error(t('The original control did not confirm a change.'));button.click();if(!flight)throw Error(t('The original control did not confirm a change.'));const admitted=await flight;if(admitted!==true)throw Error(t('The original control did not confirm a change.'));},validate,context);
  return button;
 }
 function search(parent,label,key){
  const field=doc.createElement('md-outlined-text-field');field.type='search';field.label=t(label);field.setAttribute('aria-label',t(label));parent.append(field);
  const cleanup=options.attachSearch?.(field,parent);if(typeof cleanup==='function')disposers.push(cleanup);
  if(!options.attachSearch){field.disabled=true;field.title=t('The application search adapter is unavailable.');const reason=doc.createElement('p');reason.textContent=field.title;parent.append(reason);}
  const preceding=Array.from(parent.children)[Array.from(parent.children).indexOf(field)-1];const target=preceding?.tagName?.toLowerCase()==='mfe-search'?preceding:field;
  help(target,key,()=>{(target.input||target).focus();return true;});
  const clear=action(parent,key==='tool-search'?'Clear drawing tool search':'Clear state preview search',key+'-clear',()=>{if(field.disabled||field.readOnly||target.disabled||target.readOnly||target.input?.disabled||target.input?.readOnly)return false;field.value='';const EventType=doc.defaultView?.Event||globalThis.Event;if(target!==field){if(!target.input||typeof target.emitChange!=='function')return false;target.input.value='';target.query='';target.emitChange();target.input.focus();}else{field.dispatchEvent(new EventType('input',{bubbles:true,composed:true}));field.focus();}return true;},undefined,'clear-query');clear.disabled=field.disabled;
  return field;
 }
 return {doc,t,available,listen,help,action,search,guidance,destroy(){if(!alive)return;alive=false;guidance.splice(0).forEach(item=>item.destroy());disposers.splice(0).forEach(dispose=>dispose());}};
}
export function mountSelectionWorkbench(host,options={}){
 const ctx=workbenchContext(host,options),{doc,t}=ctx,ns='http://www.w3.org/2000/svg';let points=[],cursor=[50,50],guides=validateGuides(options.guides||[]),drawing=false,busy=false,revision=0;const rowDisposers=[];
 const section=doc.createElement('section');section.className='appearance-workbench';const title=doc.createElement('h3');title.textContent=t('Selection workbench');section.append(title);host.append(section);
 ctx.search(section,'Search drawing tools','tool-search');
 const status=doc.createElement('p');status.setAttribute('role','status');status.textContent=t('Draw with a pointer, or use arrows and Space to add points. Enter applies the selection; Escape clears it.');section.append(status);
 const svg=doc.createElementNS(ns,'svg');svg.setAttribute('viewBox','-8 -8 116 116');svg.setAttribute('role','application');svg.setAttribute('aria-label',t('Selection drawing surface'));svg.setAttribute('tabindex','0');svg.classList.add('appearance-drawing');
 const base=doc.createElementNS(ns,'rect');base.setAttribute('width','100');base.setAttribute('height','100');base.setAttribute('fill','var(--md-sys-color-surface,var(--surface,#fff))');base.setAttribute('stroke','currentColor');svg.append(base);
 for(let n=0;n<=100;n+=10)for(const axis of ['x','y']){const tick=doc.createElementNS(ns,'text');tick.setAttribute('x',axis==='x'?String(n):'-7');tick.setAttribute('y',axis==='x'?'-2':String(n));tick.setAttribute('font-size','3');tick.textContent=String(n);svg.append(tick);}
 const guideGroup=doc.createElementNS(ns,'g'),path=doc.createElementNS(ns,'polyline'),cross=doc.createElementNS(ns,'circle');path.setAttribute('fill','none');path.setAttribute('stroke','var(--md-sys-color-primary,var(--primary,#6750a4))');path.setAttribute('stroke-width','.7');cross.setAttribute('r','1');cross.setAttribute('fill','currentColor');svg.append(guideGroup,path,cross);section.append(svg);
 ctx.help(svg,'drawing',()=>{svg.focus();status.textContent=t('Selection draft is ready; use Apply to save it.');return true;});
 function redraw(){if(!ctx.available())return;path.setAttribute('points',points.map(p=>p.join(',')).join(' '));cross.setAttribute('cx',cursor[0]);cross.setAttribute('cy',cursor[1]);guideGroup.replaceChildren();for(const g of guides){const line=doc.createElementNS(ns,'line');line.setAttribute('x1',g.axis==='x'?g.value:0);line.setAttribute('x2',g.axis==='x'?g.value:100);line.setAttribute('y1',g.axis==='y'?g.value:0);line.setAttribute('y2',g.axis==='y'?g.value:100);line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width','.3');line.setAttribute('stroke-dasharray','1 1');guideGroup.append(line);}}
 function point(event){const rect=svg.getBoundingClientRect();if(!rect.width||!rect.height)throw Error(t('This workbench is no longer available.'));return snapPoint(normalizePoint((event.clientX-rect.left)/rect.width*116-8,(event.clientY-rect.top)/rect.height*116-8),guides);}
 function add(p){if(points.length<1024&&(!points.length||Math.hypot(p[0]-points.at(-1)[0],p[1]-points.at(-1)[1])>.3))points.push(p);cursor=p;redraw();}
 async function commit(consumer,value,onSuccess,message){if(!ctx.available()||busy||typeof consumer!=='function')return false;busy=true;try{const accepted=await consumer(value);if(accepted!==true)return false;if(!ctx.available())return true;onSuccess();status.textContent=t(message);return true;}catch(error){if(ctx.available())status.textContent=t(error.message);throw error;}finally{busy=false;}}
 async function apply(){if(!ctx.available()||busy)return false;const selection=freehandSelection(points);const accepted=await commit(options.onSelection,selection,()=>{},'Selection applied.');if(!accepted&&ctx.available())status.textContent=t('The original control did not confirm a change.');return accepted;}
 function clear(){if(!ctx.available()||busy)return false;drawing=false;points=[];redraw();status.textContent=t('Drawing cleared.');return true;}
 ctx.listen(svg,'pointerdown',event=>{if(event.button!==0||busy||!ctx.available())return;event.preventDefault();drawing=true;points=[];svg.setPointerCapture?.(event.pointerId);add(point(event));});
 ctx.listen(svg,'pointermove',event=>{if(drawing&&!busy&&ctx.available())add(point(event));});ctx.listen(svg,'pointerup',event=>{if(drawing&&ctx.available()){add(point(event));drawing=false;svg.releasePointerCapture?.(event.pointerId);}});ctx.listen(svg,'pointercancel',()=>{if(!busy){drawing=false;points=[];redraw();}});
 ctx.listen(svg,'keydown',event=>{if(!ctx.available()||busy)return;const delta=event.shiftKey?10:1;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter','Escape'].includes(event.key))event.preventDefault();if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){cursor=normalizePoint(cursor[0]+(event.key==='ArrowRight'?delta:event.key==='ArrowLeft'?-delta:0),cursor[1]+(event.key==='ArrowDown'?delta:event.key==='ArrowUp'?-delta:0));cursor=snapPoint(cursor,guides);redraw();}else if(event.key===' ')add([...cursor]);else if(event.key==='Enter')return apply().catch(error=>{if(ctx.available())status.textContent=t(error.message);});else if(event.key==='Escape')clear();});
 ctx.action(section,'Apply freehand selection','apply',apply,()=>freehandSelection(points));ctx.action(section,'Clear drawing','clear',clear);
 const guideList=doc.createElement('div');section.append(guideList);
 async function saveGuides(next){const valid=validateGuides(next);return commit(options.onGuides,valid.map(g=>({...g})),()=>{guides=valid;revision++;redraw();renderGuides();},'Guides saved.');}
 function renderGuides(){rowDisposers.splice(0).forEach(fn=>fn());guideList.replaceChildren();for(const [i,g]of guides.entries()){
  const current=revision,row=doc.createElement('div'),input=doc.createElement('md-outlined-text-field');row.className='local-ux-field';const rowCtx=workbenchContext(row,options);rowDisposers.push(()=>rowCtx.destroy());input.type='number';input.min='0';input.max='100';input.step='.1';input.value=String(g.value);input.label=t(g.axis==='x'?'Vertical guide':'Horizontal guide')+' '+(i+1);input.setAttribute('aria-label',input.label);row.append(input);guideList.append(row);
  const validate=()=>{if(current!==revision||input.isConnected===false||busy)throw Error(t('This workbench is no longer available.'));const value=Number(input.value);if(input.value.trim()===''||!Number.isFinite(value)||value<0||value>100)throw Error(t('Invalid guide.'));return value;};let flight=null;
  const change=()=>{if(!ctx.available())return;try{const value=validate();input.setCustomValidity?.('');const next=guides.map((guide,index)=>index===i?{...guide,value}:({...guide}));flight=saveGuides(next);flight.catch(error=>{if(ctx.available())status.textContent=t(error.message);});}catch(error){input.setCustomValidity?.(t(error.message));input.reportValidity?.();status.textContent=t(error.message);}};
  input.addEventListener('change',change);rowDisposers.push(()=>input.removeEventListener('change',change));
  const mounted=rowCtx.help(input,'guide-edit',async()=>{flight=null;const EventType=doc.defaultView?.Event||globalThis.Event;input.dispatchEvent(new EventType('change',{bubbles:true,cancelable:true,composed:true}));if(!flight||await flight!==true)throw Error(t('The original control did not confirm a change.'));},validate,`${g.axis}:${i}`);if(mounted)rowDisposers.push(()=>mounted.destroy());
  const remove=rowCtx.action(row,'Remove guide','guide-remove',()=>{if(current!==revision)return false;return saveGuides(guides.filter((_,index)=>index!==i));},()=>{if(current!==revision)throw Error(t('This workbench is no longer available.'));},`${g.axis}:${i}`);rowDisposers.push(()=>{remove.disabled=true;});
 }}
 for(const axis of ['x','y'])ctx.action(section,axis==='x'?'Add vertical guide':'Add horizontal guide',axis==='x'?'guide-x':'guide-y',()=>{if(guides.length>=20)throw Error(t('Use at most twenty guides.'));return saveGuides([...guides,{axis,value:50}]);});
 redraw();renderGuides();return {destroy(){drawing=false;rowDisposers.splice(0).forEach(fn=>fn());ctx.destroy();section.remove();},getGuides:()=>guides.map(g=>({...g})),guidance:ctx.guidance};
}
let previewSequence=0;
export function mountStatePreviews(host,options={}){
 const ctx=workbenchContext(host,options),{doc,t}=ctx,id=`appearance-preview-${++previewSequence}`,section=doc.createElement('section');section.id=id;section.className='appearance-preview-grid';const rules=[];host.append(section);
 const title=doc.createElement('h3');title.textContent=t('State previews');section.append(title);ctx.search(section,'Search state previews','preview-search');const note=doc.createElement('p');note.textContent=t('Appearance samples only. Actions and private field values are not copied.');section.append(note);
 const text=options.target?.getAttribute('aria-label')||t('Sample text');
 for(const [index,state]of (options.states||[]).entries()){const card=doc.createElement('figure'),label=doc.createElement('figcaption'),sample=doc.createElement('div');label.textContent=t(state.name);card.className='local-ux-field';sample.className=`appearance-sample sample-${index}`;sample.textContent=text;sample.setAttribute('role','img');sample.setAttribute('tabindex','0');sample.setAttribute('aria-label',`${t(state.name)}: ${t('Sample text')}`);card.append(label,sample);section.append(card);ctx.help(sample,'preview',()=>{sample.scrollIntoView?.({block:'nearest'});return true;},undefined,state.name);const props=Object.entries(state.properties).filter(([key,value])=>/^[a-zA-Z][a-zA-Z0-9-]*$/.test(key)&&typeof value==='string'&&!/[{}<>;]|url\s*\(/i.test(value)).map(([key,value])=>`${key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}:${value} !important`).join(';');rules.push(`#${id} .sample-${index}{${props}}`);}
 const sheet=new (doc.defaultView?.CSSStyleSheet||globalThis.CSSStyleSheet)();sheet.replaceSync(rules.join('\n'));doc.adoptedStyleSheets=[...doc.adoptedStyleSheets,sheet];return{guidance:ctx.guidance,destroy(){ctx.destroy();section.remove();doc.adoptedStyleSheets=doc.adoptedStyleSheets.filter(s=>s!==sheet);}};
}
