import {element} from './registry.js';
import {canConfirm} from './workflow-model.js';
import {destructiveAction, localizedPair} from '../destructive-actions.js';

const reducedMotion = doc => {
  try { return Boolean(doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
};

/** Animate a node once, unless the person asked the platform for reduced motion. */
function animateOnce(doc, node, frames) {
  if (reducedMotion(doc) || typeof node?.animate !== 'function') return;
  try { node.animate(frames, {duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)'}); } catch { /* animation is decoration only */ }
}

/** Registered copy follows the translator when the caller gives no explicit language: the known key comes back plain, doubled or translated. */
const inferLanguage = t => {
  try {
    const probe = String(t('Emergency exit'));
    if (probe === 'Emergency exit') return 'en';
    return probe.includes('Emergency exit') ? 'bilingual' : 'yue';
  } catch { return 'en'; }
};

/** Operation mode invokes run only after confirmation. Approval mode resolves at
 * the final confirmation and never claims that the caller operation completed.
 *
 * Optional behaviour:
 *   destructiveId  registry id from src/shared/destructive-actions.js. An id that is not registered is refused, and the
 *                  registered bilingual title and consequence are shown in the selected language.
 *   getLanguage    returns 'en', 'yue' or 'bilingual' for registered copy.
 *   anchor         a control. The confirmation then opens beside it instead of as a modal dialog.
 */
export function requestSuperConfirmation(host,{action,affected,run,translate=t=>t,signal,confirmationOnly=false,validateConfirmation,destructiveId,getLanguage,anchor}={}){
 const registered=destructiveId===undefined?null:destructiveAction(destructiveId);
 if(destructiveId!==undefined&&!registered)return Promise.reject(new Error(`Unregistered destructive action: ${destructiveId}`));
 if(signal?.aborted)return Promise.resolve({confirmed:false});
 const doc=host.ownerDocument,t=translate,origin=doc.activeElement;
 const language=typeof getLanguage==='function'?getLanguage():inferLanguage(t);
 const actionText=registered?localizedPair(registered.title,language):t(action);
 const consequence=registered?localizedPair(registered.affected,language):'';
 const affectedText=affected&&consequence&&affected!==consequence?`${affected}. ${consequence}`:(affected||consequence);
 return new Promise(resolve=>{
  const inline=Boolean(anchor);
  const headline=t('Confirm destructive action');
  const dialog=inline?element('section',{role:'alertdialog','aria-label':headline,'data-super-confirmation':''}):element('md-dialog',{'aria-label':headline});
  if(registered)dialog.setAttribute?.('data-destructive-id',registered.id);
  const content=inline?element('div'):element('div',{slot:'content'}),status=element('p',{role:'status','aria-live':'polite'});
  const guidance=t(confirmationOnly?'Operate both keys, then move the slider fully right and choose Confirm.':'This action changes the named data. Operate both keys, then move the slider fully right and choose Execute.');
  content.append(element('p',{text:`${actionText}: ${affectedText}`}),element('p',{text:`${guidance} ${t('Press Escape or choose Emergency exit to leave without changes.')}`}));
  const first=element('md-switch',{'aria-label':t('First confirmation key')}),second=element('md-switch',{'aria-label':t('Second confirmation key')});
  const slider=element('md-slider',{min:0,max:100,value:0,disabled:true,'aria-label':t('Confirmation progress')});
  const progress=element('md-linear-progress',{value:0,max:1,'aria-label':t('Confirmation progress')});
  const slot=name=>inline?{}:{slot:name};
  const execute=element('md-filled-button',{...slot('actions'),text:t(confirmationOnly?'Confirm':'Execute'),disabled:true}),cancel=element('md-text-button',{...slot('actions'),text:t('Emergency exit')});
  let running=false,closed=false,completion=null;const controller=new AbortController();
  const update=()=>{slider.disabled=!(first.selected&&second.selected);if(slider.disabled)slider.value=0;execute.disabled=running||!canConfirm({firstKey:first.selected,secondKey:second.selected,amount:slider.value});status.textContent=`${t('Confirmation progress')}: ${slider.value}%`;if(!running&&!completion){progress.indeterminate=false;progress.value=Math.max(0,Math.min(100,Number(slider.value)||0))/100;}};
  const close=result=>{if(closed)return;closed=true;controller.abort();doc.removeEventListener('keydown',escape);doc.defaultView?.removeEventListener?.('popstate',back);signal?.removeEventListener('abort',abort);dialog.remove();origin?.focus?.();resolve(completion||result);};
  const abort=()=>close({confirmed:false});
  signal?.addEventListener('abort',abort,{once:true});
  const escape=event=>{if(event.key==='Escape'){event.preventDefault();close({confirmed:false});}};
  const back=()=>close({confirmed:false});
  first.addEventListener('change',update);second.addEventListener('change',update);slider.addEventListener('input',update);slider.addEventListener('change',update);
  execute.addEventListener('click',async()=>{if(closed)return;if(completion){close(completion);return;}if(running||!canConfirm({firstKey:first.selected,secondKey:second.selected,amount:slider.value}))return;if(confirmationOnly){if(signal?.aborted){close({confirmed:false});return;}try{validateConfirmation?.();if(signal?.aborted){close({confirmed:false});return;}progress.value=1;animateOnce(doc,progress,[{opacity:.6},{opacity:1}]);close({confirmed:true});}catch(error){status.textContent=String(error.message||error);}return;}running=true;update();progress.indeterminate=true;status.textContent=t('Operation in progress.');try{const result=await run({signal:controller.signal});if(!closed){completion={confirmed:true,result};progress.indeterminate=false;progress.value=1;status.textContent=t('Operation completed.');animateOnce(doc,status,[{opacity:0,transform:'scale(0.96)'},{opacity:1,transform:'scale(1)'}]);execute.textContent=t('Done');execute.disabled=false;first.disabled=true;second.disabled=true;slider.disabled=true;}}catch(error){if(!closed){running=false;progress.indeterminate=false;update();status.textContent=String(error.message||error);}}});
  cancel.addEventListener('click',()=>close({confirmed:false}));dialog.addEventListener('cancel',event=>{event.preventDefault();close({confirmed:false});});
  content.append(first,second,slider,status,progress);
  if(inline){const actions=element('div',{class:'super-confirmation-actions'});actions.append(cancel,execute);dialog.append(element('strong',{text:headline}),content,actions);}
  else dialog.append(element('span',{slot:'headline',text:headline}),content,cancel,execute);
  if(inline&&typeof anchor.after==='function')anchor.after(dialog);else host.append(dialog);
  doc.addEventListener('keydown',escape);doc.defaultView?.addEventListener?.('popstate',back);
  if(inline){animateOnce(doc,dialog,[{opacity:0,transform:'translateY(-4px)'},{opacity:1,transform:'translateY(0)'}]);first.focus?.();}else dialog.show();
  update();
 });
}

/** Two-key confirmation for a registered destructive action. Resolves true only after both keys and the full slider.
 * Pass run to execute the action inside the confirmation, or omit it and perform the action after a true result. */
export async function confirmDestructiveAction(host,destructiveId,{affected,translate,signal,anchor,getLanguage,validateConfirmation,run}={}){
 const result=await requestSuperConfirmation(host,{destructiveId,affected,translate,signal,anchor,getLanguage,validateConfirmation,run,confirmationOnly:typeof run!=='function'});
 return result.confirmed===true;
}
