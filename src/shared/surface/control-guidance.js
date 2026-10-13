import {IMAGE_PRACTICE_COPY} from '../local-ux/image-practice.js';
import {WORKBENCH_PRACTICE_COPY} from '../local-ux/workbench-practice.js';
import {SERVER_PRACTICE_COPY} from '../local-ux/server-preparation-practice.js';
import {SETTINGS_TAB_COPY} from '../local-ux/settings-tab-guidance.js';
import {FRAME_PRACTICE_COPY} from '../local-ux/frame-practice.js';
import {APPEARANCE_PRACTICE_COPY} from '../local-ux/appearance-practice.js';
import {mountGuidancePlayground,PRACTICE_COPY} from './guidance-playground.js';


export const GUIDANCE_COPY={
 ...PRACTICE_COPY,...APPEARANCE_PRACTICE_COPY,...FRAME_PRACTICE_COPY,...SETTINGS_TAB_COPY,...SERVER_PRACTICE_COPY,...WORKBENCH_PRACTICE_COPY,...IMAGE_PRACTICE_COPY, 'Help for':'說明：','Close information':'關閉說明','Open guided operation':'開啟逐步操作','Full explanation':'完整解說','Guide':'指引','Explain':'解說',
 'Guide this control':'逐步了解這個控制項','Explain this control':'解釋這個控制項','Back':'上一步','Next':'下一步','Apply through the direct control':'透過原有控制項套用','Cancel guidance':'取消指引','Return to control':'返回控制項','Guidance cancelled. Completed effects are retained.':'指引已取消，已完成的修改會保留。','Ready. Review the original control and its result.':'準備就緒，請檢查原有控制項及其結果。','Working through the original action.':'正在執行原有操作。','Purpose':'用途','Options':'選項','Default':'預設值','Effects':'影響','Example':'例子','Validation':'驗證','Recovery':'復原方法','Authoritative documentation':'完整說明文件','Review the value at the original control.':'請檢查原有控制項的數值。','Review the consequences before continuing.':'繼續前請檢查操作的影響。','A required value is invalid. Correct the original control before continuing.':'必填數值無效，請先修正原有控制項。','This control is unavailable. Review its adjacent explanation.':'這個控制項目前無法使用，請查看旁邊的解釋。',
};

export function registerOwnedCommands({get,set,refresh},value){
 const owned=[...value];set([...get(),...owned]);refresh();let active=true;
 return()=>{if(!active)return;active=false;const identities=new Set(owned);set(get().filter(command=>!identities.has(command)));refresh();};
}
export function resolveGuidanceArticle(catalog,descriptor,{language='en',restricted=false}={}){
 const declared=descriptor.sourceId||'docs/features/interface/settings-guidance.md';
 if(typeof declared!=='string'||!declared.startsWith('docs/features/')||!declared.endsWith('.md')||declared.includes('..'))throw Error('Guidance documentation is unavailable.');
 const base=declared.replace(/\.zh-HK\.md$/,'.md'),source=!restricted&&language==='yue'?base.replace(/\.md$/,'.zh-HK.md'):base;
 const row=catalog?.documents?.find(row=>row.source===source);if(!row)throw Error('Guidance documentation is unavailable.');return row;
}

/** One invocation owns one target, draft and cancellation lifetime. */
export function createGuidanceSession({steps,validate=()=>{},run=()=>{},available=()=>true}={}){
 if(!Array.isArray(steps)||!steps.length)throw Error('Guidance requires explicit steps.');
 let index=0,state='ready';const controller=new AbortController();
 return {get index(){return index;},get state(){return state;},get signal(){return controller.signal;},
  back(){if(state==='ready')index=Math.max(0,index-1);},
  async next(){if(state!=='ready')return;state='validating';try{if(!available())throw Error('This control is unavailable. Review its adjacent explanation.');await validate(index,controller.signal);if(controller.signal.aborted)return;if(!available())throw Error('This control is unavailable. Review its adjacent explanation.');if(index<steps.length-1){index++;state='ready';return;}state='running';await run({signal:controller.signal});state=controller.signal.aborted?'cancelled':'finished';}catch(error){if(!controller.signal.aborted)state='ready';throw error;}},
  cancel(){controller.abort();state='cancelled';},
 };
}

/** Preserve the target event, including capture-phase element locks, and await
 * the actual consumer promise admitted by that event. */
export async function clearGuidedField(target,{eventType='change',getFlight=()=>null,resetFlight=()=>{}}={}){
 if(target.disabled||target.readOnly)throw Error('This control is unavailable. Review its adjacent explanation.');
 const before=target.value;resetFlight();target.value='';
 const EventType=target.ownerDocument?.defaultView?.Event||globalThis.Event;
 const admitted=target.dispatchEvent(new EventType(eventType,{bubbles:true,cancelable:true,composed:true})),flight=getFlight();
 if(!admitted||!flight){target.value=before;throw Error('This control is unavailable. Review its adjacent explanation.');}
 try{await flight;}catch(error){if(target.isConnected!==false)target.value=before;throw error;}finally{target.focus?.();}
}



/** A registered non-modal Material component immediately precedes its target.
 * It never clones a secret, unlocks a target or substitutes an operation. */
export function mountControlGuidance(target,{descriptor,t=s=>s,run,validate=()=>{},registerHelp,registerCommands,openHelp,provenance,getDetails,inlineGridColumn,onOpen}={}){
 if(!descriptor?.id||!descriptor.help||!descriptor.steps?.length)throw Error('A registered guidance descriptor is required.');
 if(!target.parentNode)throw Error('Attach the guidance target before mounting guidance.');
 if(target.closest?.('[data-guidance-sandbox]'))throw Error('Guidance cannot be mounted inside sample practice.');
 const doc=target.ownerDocument,win=doc.defaultView;
 if(!win.customElements.get('mfe-control-guidance'))win.customElements.define('mfe-control-guidance',class extends win.HTMLElement{constructor(){super();this.attachShadow({mode:'open'});}initialize(css){const sheet=new win.CSSStyleSheet();sheet.replaceSync(':host{display:block;min-width:0;font-family:var(--local-ux-font,"MFE Noto Sans Regular","MFE Noto Sans CJK HK",sans-serif);--md-ref-typeface-plain:var(--local-ux-font,"MFE Noto Sans Regular","MFE Noto Sans CJK HK",sans-serif);--md-ref-typeface-brand:var(--md-ref-typeface-plain)} [hidden]{display:none!important} :focus-visible{outline:3px solid var(--md-sys-color-primary);outline-offset:3px} md-text-button,md-filled-button,md-outlined-button{min-height:48px;max-width:100%}'+css);this.shadowRoot.adoptedStyleSheets=[sheet];}});
 const listeners=[],wizardListeners=[],detailListeners=[],disposers=[];let listenerScope=listeners;
 const clearListeners=list=>list.splice(0).forEach(fn=>fn());
 const listen=(node,type,fn)=>{node.addEventListener(type,fn);listenerScope.push(()=>node.removeEventListener(type,fn));};
 const element=(tag,props={})=>{const node=doc.createElement(tag);for(const[key,value]of Object.entries(props)){if(key==='text')node.textContent=value;else if(key.startsWith('on'))listen(node,key.slice(2),value);else if(key in node)node[key]=value;else node.setAttribute(key,value);}if(tag.includes('button'))node.type='button';return node;};
 const icon=path=>{const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','24');svg.setAttribute('height','24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');const shape=doc.createElementNS('http://www.w3.org/2000/svg','path');shape.setAttribute('fill','currentColor');shape.setAttribute('d',path);svg.append(shape);return svg;};
 const host=doc.createElement('mfe-control-guidance');host.dataset.guidanceId=descriptor.id;target.before(host);
 host.initialize(':host{margin-block:4px}.panel{box-sizing:border-box;min-width:0;max-width:100%;padding:16px;border:1px solid var(--md-sys-color-outline-variant);border-radius:16px;background:var(--md-sys-color-surface-container);color:var(--md-sys-color-on-surface);overflow-wrap:anywhere}.heading{display:flex;align-items:start;gap:8px}.heading h4{flex:1;min-width:0;margin:12px 0}.entry,md-icon-button{width:48px;height:48px;flex:0 0 48px}.tooltip{box-sizing:border-box;max-width:100%;padding:8px;border-radius:8px;background:var(--md-sys-color-inverse-surface);color:var(--md-sys-color-inverse-on-surface);overflow-wrap:anywhere}.actions,.practice-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px}md-outlined-text-field,md-outlined-select{min-width:0;max-width:100%;flex:1 1 180px}.practice-controls label{display:inline-flex;align-items:center;gap:8px;min-height:48px;max-width:100%;overflow-wrap:anywhere}.status{min-height:1.5em}');
 if(Number.isInteger(inlineGridColumn)&&inlineGridColumn>0&&inlineGridColumn<=20){const layoutSheet=new win.CSSStyleSheet();layoutSheet.replaceSync(`:host{display:contents}.entry{grid-row:1;grid-column:${inlineGridColumn}}.panel,.tooltip{grid-column:1/-1;grid-row:2}`);host.shadowRoot.adoptedStyleSheets=[...host.shadowRoot.adoptedStyleSheets,layoutSheet];}
 const root=host.shadowRoot,helpName=`${t('Help for')} ${t(descriptor.label)}`;
 const entry=element('md-icon-button',{'aria-label':helpName,'aria-controls':'information','aria-expanded':'false',class:'entry'});entry.append(icon('M11 17h2v-6h-2v6zm1-15a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-11h2V7h-2v2z'));
 const tooltip=element('span',{id:'information-tooltip',role:'tooltip',class:'tooltip',text:helpName,hidden:true});
 const panel=element('section',{id:'information',class:'panel',hidden:true,'aria-labelledby':'information-title'}),title=element('h4',{id:'information-title',tabIndex:-1,text:t(descriptor.label)}),status=element('p',{class:'status',role:'status','aria-live':'polite'});
 const heading=element('div',{class:'heading'}),dismiss=element('md-icon-button',{'aria-label':t('Close information')});dismiss.append(icon('M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z'));heading.append(title,dismiss);
 const purpose=element('p',{text:t(descriptor.purpose)}),availability=element('p'),practice=element('section'),wizard=element('section',{hidden:true,'aria-label':t('Guide this control')}),details=element('section',{hidden:true,'aria-label':t('Full explanation')}),detailsButton=element('md-text-button',{text:t('Full explanation'),'aria-expanded':'false','aria-controls':'full-explanation'});details.id='full-explanation';
 const start=element('md-filled-button',{text:t('Open guided operation')}),focus=element('md-text-button',{text:t('Return to control'),onclick:()=>target.focus?.()}),actions=element('div',{class:'actions'});actions.append(start,focus,detailsButton);panel.append(heading,purpose,availability,practice,actions,wizard,details,status);root.append(entry,tooltip,panel);
 let session=null,sample=null,disposed=false;
 const available=()=>!target.disabled&&!target.readOnly&&target.isConnected!==false;
 const hideTooltip=()=>{tooltip.hidden=true;entry.removeAttribute('aria-describedby');};
 const refreshAvailability=()=>{start.disabled=!available();availability.textContent=available()?'':t(descriptor.unavailableReason||'This control is unavailable. Review its adjacent explanation.');};
 const renderDetails=()=>{clearListeners(detailListeners);listenerScope=detailListeners;const live={...descriptor,...getDetails?.()};details.replaceChildren();for(const key of ['purpose','options','default','effects','example','validation','recovery'])details.append(element('p',{text:`${t(key[0].toUpperCase()+key.slice(1))}: ${t(live[key])}`}));const origin=live.provenance??provenance?.();if(origin)details.append(element('p',{text:String(origin)}));const article=element('a',{text:t('Authoritative documentation'),href:descriptor.help});if(openHelp)listen(article,'click',event=>{event.preventDefault();Promise.resolve(openHelp(descriptor)).catch(error=>{if(!disposed)status.textContent=t(error.message);});});details.append(article);listenerScope=listeners;};
 const close=()=>{clearListeners(wizardListeners);clearListeners(detailListeners);session?.cancel();session=null;sample?.destroy();sample=null;panel.hidden=true;wizard.hidden=true;wizard.replaceChildren();details.hidden=true;detailsButton.setAttribute('aria-expanded','false');entry.setAttribute('aria-expanded','false');hideTooltip();if(entry.isConnected!==false)entry.focus?.();};
 const paint=()=>{if(disposed||!session)return;clearListeners(wizardListeners);listenerScope=wizardListeners;wizard.replaceChildren();const step=element('h4',{tabIndex:-1,text:`${session.index+1}/${descriptor.steps.length}: ${t(descriptor.label)}`});wizard.append(step,element('p',{text:t(descriptor.steps[session.index])}));
  const back=element('md-text-button',{text:t('Back'),disabled:session.index===0||session.state!=='ready',onclick:()=>{session.back();paint();}}),next=element('md-filled-button',{text:t(session.index===descriptor.steps.length-1?'Apply through the direct control':'Next'),disabled:session.state!=='ready'}),cancel=element('md-text-button',{text:t('Cancel guidance'),onclick:()=>{session?.cancel();session=null;clearListeners(wizardListeners);wizard.hidden=true;wizard.replaceChildren();status.textContent=t('Guidance cancelled. Completed effects are retained.');start.focus?.();}});
  listen(next,'click',async()=>{const current=session;if(!current||current.state!=='ready')return;next.disabled=true;back.disabled=true;try{status.textContent=t('Working through the original action.');await current.next();if(disposed||current!==session||current.state==='cancelled')return;status.textContent=t(current.state==='finished'?'Ready. Review the original control and its result.':'');paint();}catch(error){if(disposed||current!==session||current.state==='cancelled')return;status.textContent=t(error.message);paint();target.focus?.();}});const footer=element('div',{class:'actions'});footer.append(back,next,cancel);wizard.append(footer);listenerScope=listeners;step.focus?.();
 };
 const open=()=>{if(disposed)return;onOpen?.();hideTooltip();clearListeners(wizardListeners);session?.cancel();session=null;wizard.hidden=true;wizard.replaceChildren();sample?.destroy();sample=null;practice.replaceChildren();if(descriptor.practice)sample=mountGuidancePlayground(practice,{fixture:descriptor.practice,t});else practice.append(element('p',{text:t('Practice is unavailable for this control. Its specific fixture has not been implemented.')}));refreshAvailability();panel.hidden=false;entry.setAttribute('aria-expanded','true');status.textContent='';title.focus?.();};
 const openWizard=()=>{if(disposed||!available()){refreshAvailability();return;}if(panel.hidden)open();session?.cancel();session=createGuidanceSession({steps:descriptor.steps,available,validate:async(index,signal)=>{if(target.checkValidity&&!target.checkValidity())throw Error('A required value is invalid. Correct the original control before continuing.');await validate(index,signal);},run:run||(()=>target.focus?.())});wizard.hidden=false;status.textContent='';paint();};
 listen(entry,'click',()=>panel.hidden?open():close());listen(dismiss,'click',close);listen(start,'click',openWizard);listen(detailsButton,'click',()=>{if(details.hidden)renderDetails();details.hidden=!details.hidden;detailsButton.setAttribute('aria-expanded',String(!details.hidden));});
 const showTooltip=()=>{if(panel.hidden){tooltip.hidden=false;entry.setAttribute('aria-describedby','information-tooltip');}};
 listen(entry,'pointerenter',showTooltip);listen(entry,'focusin',showTooltip);listen(entry,'pointerleave',hideTooltip);listen(entry,'focusout',hideTooltip);
 listen(root,'keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented){hideTooltip();if(!panel.hidden){event.preventDefault();close();}}});
 const help={...descriptor,open:openWizard,explain:()=>{if(panel.hidden)open();renderDetails();details.hidden=false;detailsButton.setAttribute('aria-expanded','true');host.scrollIntoView?.({block:'nearest'});title.focus?.();}};
 const off=registerHelp?.(help,target);if(typeof off==='function')disposers.push(off);
 const commands=registerCommands?.([{id:`guidance:${descriptor.id}`,label:{en:`Guide: ${descriptor.label}`,yue:`指引：${descriptor.labelYue||descriptor.label}`},run:openWizard},{id:`explanation:${descriptor.id}`,label:{en:`Explain: ${descriptor.label}`,yue:`解釋：${descriptor.labelYue||descriptor.label}`},run:help.explain}]);if(typeof commands==='function')disposers.push(commands);
 return {host,open,openWizard,close,explain:help.explain,destroy(){if(disposed)return;disposed=true;session?.cancel();sample?.destroy();clearListeners(listeners);clearListeners(wizardListeners);clearListeners(detailListeners);disposers.forEach(fn=>fn());host.remove();}};
}

export function assertGuidanceCoverage(required,registered){
 const ids=new Set(registered.map(row=>row.id));for(const row of required){if(!row.id||!ids.has(row.id))throw Error(`Missing guidance: ${row.id}`);if(!row.capable&&!row.reason)throw Error(`Missing capability reason: ${row.id}`);if(row.capable&&(!row.help||!row.steps?.length))throw Error(`Missing optional wizard: ${row.id}`);for(const field of ['purpose','options','default','effects','example','validation','recovery'])if(!row[field])throw Error(`Missing explanation ${field}: ${row.id}`);}
 const purposes=required.map(row=>row.purpose);if(new Set(purposes).size!==purposes.length)throw Error('Duplicate generic guidance purpose.');return true;
}
