import {element} from './registry.js';
import {canConfirm} from './workflow-model.js';

/** An in-surface confirmation. The callback is invoked only by the final action. */
export function requestSuperConfirmation(host,{action,affected,run,translate=t=>t,signal}={}){
 if(signal?.aborted)return Promise.resolve({confirmed:false});
 const doc=host.ownerDocument,t=translate,origin=doc.activeElement;
 return new Promise(resolve=>{
  const dialog=element('md-dialog',{'aria-label':t('Confirm destructive action')});
  const content=element('div',{slot:'content'}),status=element('p',{role:'status','aria-live':'polite'});
  content.append(element('p',{text:`${t(action)}: ${affected}`}),element('p',{text:t('This action changes the named data. Operate both keys, then move the slider fully right and choose Execute.')}));
  const first=element('md-switch',{'aria-label':t('First confirmation key')}),second=element('md-switch',{'aria-label':t('Second confirmation key')});
  const slider=element('md-slider',{min:0,max:100,value:0,disabled:true,'aria-label':t('Confirmation progress')});
  const execute=element('md-filled-button',{slot:'actions',text:t('Execute'),disabled:true}),cancel=element('md-text-button',{slot:'actions',text:t('Emergency exit')});
  let running=false,closed=false,completion=null;const controller=new AbortController();
  const update=()=>{slider.disabled=!(first.selected&&second.selected);if(slider.disabled)slider.value=0;execute.disabled=running||!canConfirm({firstKey:first.selected,secondKey:second.selected,amount:slider.value});status.textContent=`${t('Confirmation progress')}: ${slider.value}%`;};
  const close=result=>{if(closed)return;closed=true;controller.abort();doc.removeEventListener('keydown',escape);signal?.removeEventListener('abort',abort);dialog.remove();origin?.focus?.();resolve(completion||result);};
  const abort=()=>close({confirmed:false});
  signal?.addEventListener('abort',abort,{once:true});
  const escape=event=>{if(event.key==='Escape'){event.preventDefault();close({confirmed:false});}};
  first.addEventListener('change',update);second.addEventListener('change',update);slider.addEventListener('input',update);slider.addEventListener('change',update);
  execute.addEventListener('click',async()=>{if(closed)return;if(completion){close(completion);return;}if(running||!canConfirm({firstKey:first.selected,secondKey:second.selected,amount:slider.value}))return;running=true;update();status.textContent=t('Operation in progress.');try{const result=await run({signal:controller.signal});if(!closed){completion={confirmed:true,result};status.textContent=t('Operation completed.');execute.textContent=t('Done');execute.disabled=false;first.disabled=true;second.disabled=true;slider.disabled=true;}}catch(error){if(!closed){running=false;update();status.textContent=String(error.message||error);}}});
  cancel.addEventListener('click',()=>close({confirmed:false}));dialog.addEventListener('cancel',event=>{event.preventDefault();close({confirmed:false});});
  content.append(first,second,slider,status);dialog.append(element('span',{slot:'headline',text:t('Confirm destructive action')}),content,cancel,execute);host.append(dialog);doc.addEventListener('keydown',escape);dialog.show();update();
 });
}
