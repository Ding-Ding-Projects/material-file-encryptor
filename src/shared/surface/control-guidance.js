

export const GUIDANCE_COPY={
 'Guide this control':'逐步了解這個控制項','Explain this control':'解釋這個控制項','Back':'上一步','Next':'下一步','Apply through the direct control':'透過原有控制項套用','Cancel guidance':'取消指引','Return to control':'返回控制項','Guidance cancelled. Completed effects are retained.':'指引已取消，已完成的修改會保留。','Ready. Review the original control and its result.':'準備就緒，請檢查原有控制項及其結果。','Working through the original action.':'正在執行原有操作。','Purpose':'用途','Options':'選項','Default':'預設值','Effects':'影響','Example':'例子','Validation':'驗證','Recovery':'復原方法','Authoritative documentation':'完整說明文件','Review the value at the original control.':'請檢查原有控制項的數值。','Review the consequences before continuing.':'繼續前請檢查操作的影響。','A required value is invalid. Correct the original control before continuing.':'必填數值無效，請先修正原有控制項。','This control is unavailable. Review its adjacent explanation.':'這個控制項目前無法使用，請查看旁邊的解釋。',
};

export function registerOwnedCommands({get,set,refresh},value){
 const owned=[...value];set([...get(),...owned]);refresh();let active=true;
 return()=>{if(!active)return;active=false;const identities=new Set(owned);set(get().filter(command=>!identities.has(command)));refresh();};
}

/** One invocation owns one target, draft and cancellation lifetime. */
export function createGuidanceSession({steps,validate=()=>{},run=()=>{},available=()=>true}={}){
 if(!Array.isArray(steps)||!steps.length)throw Error('Guidance requires explicit steps.');
 let index=0,state='ready';const controller=new AbortController();
 return {get index(){return index;},get state(){return state;},get signal(){return controller.signal;},
  back(){if(state==='ready')index=Math.max(0,index-1);},
  async next(){if(state!=='ready')return;if(!available())throw Error('This control is unavailable. Review its adjacent explanation.');await validate(index,controller.signal);if(controller.signal.aborted)return;if(index<steps.length-1){index++;return;}state='running';try{await run({signal:controller.signal});state=controller.signal.aborted?'cancelled':'finished';}catch(error){if(!controller.signal.aborted)state='ready';throw error;}},
  cancel(){controller.abort();state='cancelled';},
 };
}



/** A registered non-modal Material component immediately precedes its target.
 * It never clones a secret, unlocks a target or substitutes an operation. */
export function mountControlGuidance(target,{descriptor,t=s=>s,run,validate=()=>{},registerHelp,registerCommands,openHelp,provenance}={}){
 if(!descriptor?.id||!descriptor.help||!descriptor.steps?.length)throw Error('A registered guidance descriptor is required.');
 if(!target.parentNode)throw Error('Attach the guidance target before mounting guidance.');
 const doc=target.ownerDocument,win=doc.defaultView;
 if(!win.customElements.get('mfe-control-guidance'))win.customElements.define('mfe-control-guidance',class extends win.HTMLElement{constructor(){super();this.attachShadow({mode:'open'});}initialize(css){const style=doc.createElement('style');style.textContent=':host{display:block;min-width:0} [hidden]{display:none!important} :focus-visible{outline:3px solid var(--md-sys-color-primary);outline-offset:3px} md-text-button,md-filled-button{min-height:40px;max-width:100%}'+css;this.shadowRoot.append(style);}});
 const element=(tag,props={})=>{const node=doc.createElement(tag);for(const[key,value]of Object.entries(props)){if(key==='text')node.textContent=value;else if(key.startsWith('on'))node.addEventListener(key.slice(2),value);else if(key in node)node[key]=value;else node.setAttribute(key,value);}return node;};
 const host=doc.createElement('mfe-control-guidance');host.dataset.guidanceId=descriptor.id;target.before(host);
 host.initialize(':host{margin-block:4px}.panel{padding:12px;border:1px solid var(--md-sys-color-outline);border-radius:12px;overflow-wrap:anywhere}.status{min-height:1.5em}');
 const root=host.shadowRoot,entry=element('md-text-button',{text:t('Guide this control'),'aria-label':`${t('Guide this control')}: ${t(descriptor.label)}`}),explain=element('md-text-button',{text:t('Explain this control'),'aria-label':`${t('Explain this control')}: ${t(descriptor.label)}`}),panel=element('section',{class:'panel',hidden:true,'aria-label':t(descriptor.label)}),status=element('p',{role:'status','aria-live':'polite'});
 const details=element('section',{hidden:true,'aria-label':`${t('Explain this control')}: ${t(descriptor.label)}`});
 for(const key of ['purpose','options','default','effects','example','validation','recovery'])details.append(element('p',{text:`${t(key[0].toUpperCase()+key.slice(1))}: ${t(descriptor[key])}`}));
 if(provenance)details.append(element('p',{text:String(provenance())}));
 const article=element('a',{text:t('Authoritative documentation'),href:descriptor.help});if(openHelp)article.addEventListener('click',event=>{event.preventDefault();Promise.resolve(openHelp(descriptor)).catch(error=>{status.textContent=t(error.message);details.append(status);});});details.append(article);
 let session=null,disposed=false;const disposers=[];
 const close=()=>{session?.cancel();panel.hidden=true;entry.setAttribute('aria-expanded','false');target.focus?.();};
 const paint=()=>{if(disposed||!session)return;panel.replaceChildren();const step=descriptor.steps[session.index];panel.append(element('h4',{text:`${session.index+1}/${descriptor.steps.length}: ${t(descriptor.label)}`}),element('p',{text:t(step)}),status);
  const back=element('md-text-button',{text:t('Back'),disabled:session.index===0||session.state==='running',onclick:()=>{session.back();paint();}}),next=element('md-filled-button',{text:t(session.index===descriptor.steps.length-1?'Apply through the direct control':'Next'),disabled:session.state==='running'||session.state==='finished'}),cancel=element('md-text-button',{text:t('Cancel guidance'),onclick:()=>{status.textContent=t('Guidance cancelled. Completed effects are retained.');close();}}),focus=element('md-text-button',{text:t('Return to control'),onclick:()=>target.focus?.()});
  next.addEventListener('click',async()=>{try{status.textContent=t('Working through the original action.');await session.next();if(disposed){if(target.id)doc.getElementById?.(target.id)?.focus?.();return;}status.textContent=t(session.state==='finished'?'Ready. Review the original control and its result.':descriptor.steps[session.index]);paint();}catch(error){status.textContent=t(error.message);paint();}});panel.append(back,next,cancel,focus);
 };
 const open=()=>{if(disposed)return;session?.cancel();session=createGuidanceSession({steps:descriptor.steps,available:()=>!target.disabled&&!target.readOnly&&target.isConnected!==false,validate:async(index,signal)=>{if(target.checkValidity&&!target.checkValidity())throw Error('A required value is invalid. Correct the original control before continuing.');await validate(index,signal);},run:run||(()=>target.focus?.())});panel.hidden=false;entry.setAttribute('aria-expanded','true');status.textContent='';paint();panel.querySelector('md-filled-button')?.focus();};
 entry.setAttribute('aria-expanded','false');entry.addEventListener('click',open);explain.addEventListener('click',()=>{details.hidden=!details.hidden;explain.setAttribute('aria-expanded',String(!details.hidden));});panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}});root.append(entry,explain,details,panel);
 const help={...descriptor,open,explain:()=>{details.hidden=false;host.scrollIntoView?.({block:'nearest'});explain.focus?.();}};
 const off=registerHelp?.(help,target);if(typeof off==='function')disposers.push(off);
 const commands=registerCommands?.([{id:`guidance:${descriptor.id}`,label:{en:`Guide: ${descriptor.label}`,yue:`指引：${descriptor.labelYue||descriptor.label}`},run:open},{id:`explanation:${descriptor.id}`,label:{en:`Explain: ${descriptor.label}`,yue:`解釋：${descriptor.labelYue||descriptor.label}`},run:help.explain}]);if(typeof commands==='function')disposers.push(commands);
 return {host,open,explain:help.explain,destroy(){if(disposed)return;disposed=true;session?.cancel();disposers.forEach(fn=>fn());host.remove();}};
}

export function assertGuidanceCoverage(required,registered){
 const ids=new Set(registered.map(row=>row.id));for(const row of required){if(!row.id||!ids.has(row.id))throw Error(`Missing guidance: ${row.id}`);if(!row.capable&&!row.reason)throw Error(`Missing capability reason: ${row.id}`);if(row.capable&&(!row.help||!row.steps?.length))throw Error(`Missing optional wizard: ${row.id}`);for(const field of ['purpose','options','default','effects','example','validation','recovery'])if(!row[field])throw Error(`Missing explanation ${field}: ${row.id}`);}
 const purposes=required.map(row=>row.purpose);if(new Set(purposes).size!==purposes.length)throw Error('Duplicate generic guidance purpose.');return true;
}
