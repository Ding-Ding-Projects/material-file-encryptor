import {validateDescriptors,validateConfigurationValue} from '../../../features/server-manager/configuration.js';

// The caller supplies localized copy and the real permission/confirmation/write action.
export function mountConfigurationControls(root,{descriptors,binding,values,onChange,translate}) {
  if(typeof translate!=='function'||typeof onChange!=='function') throw new Error('Localized copy and a real configuration action are required.');
  const mountBinding=Object.freeze(structuredClone(binding));
  const inventory=validateDescriptors(descriptors,mountBinding);
  const document=root.ownerDocument;
  const lifetime=new AbortController();
  const container=document.createElement('section');
  container.setAttribute('aria-label',translate('server.configuration'));
  for(const descriptor of inventory) {
    const row=document.createElement('div');
    const label=document.createElement('label');
    label.textContent=translate(descriptor.helpId+'.label');
    const help=document.createElement('p');
    help.textContent=translate(descriptor.helpId+'.description');
    const control=document.createElement(descriptor.type==='enum'?'select':'input');
    if(descriptor.type==='enum') {
      const search=document.createElement('input');search.type='search';search.setAttribute('aria-label',translate(descriptor.helpId+'.search'));
      for(const choice of descriptor.choices) {const option=document.createElement('option');option.value=choice;option.textContent=translate(descriptor.helpId+'.choice.'+choice);control.append(option);}
      search.addEventListener('input',()=>{for(const option of control.options)option.hidden=!option.textContent.toLocaleLowerCase().includes(search.value.toLocaleLowerCase());},{signal:lifetime.signal});
      row.append(search);
    } else {
      control.type=descriptor.type==='boolean'?'checkbox':['integer','number'].includes(descriptor.type)?'number':'text';
      if(control.type==='number'){control.step=descriptor.type==='integer'?'1':'any';for(const bound of ['min','max'])if(descriptor[bound]!==undefined)control[bound]=String(descriptor[bound]);}
      if(descriptor.type==='boolean')control.setAttribute('role','switch');
    }
    const value=Object.hasOwn(values,descriptor.id)?values[descriptor.id]:descriptor.default;
    if(value!==undefined) {validateConfigurationValue(descriptor,value);if(descriptor.type==='boolean')control.checked=value;else control.value=String(value);}
    let confirmedValue=descriptor.type==='boolean'?control.checked:control.value;
    let pending=false;
    const restoreConfirmed=()=>{if(descriptor.type==='boolean')control.checked=confirmedValue;else control.value=confirmedValue;};
    const status=document.createElement('p');status.setAttribute('role','status');
    control.addEventListener('change',async()=>{
      if(pending||lifetime.signal.aborted)return;
      const value=descriptor.type==='boolean'?control.checked:['integer','number'].includes(descriptor.type)?(control.value===''?NaN:Number(control.value)):control.value;
      try {validateConfigurationValue(descriptor,value);pending=true;control.disabled=true;const result=await onChange({id:descriptor.id,value,binding:structuredClone(mountBinding),signal:lifetime.signal});if(result?.applied!==true)throw new Error('Configuration write was not confirmed.');confirmedValue=descriptor.type==='boolean'?value:String(value);if(!lifetime.signal.aborted){restoreConfirmed();status.textContent=translate('server.configuration.applied');}}
      catch {if(!lifetime.signal.aborted){restoreConfirmed();status.textContent=translate('server.configuration.notApplied');}}
      finally {pending=false;if(!lifetime.signal.aborted)control.disabled=false;}
    },{signal:lifetime.signal});
    label.append(control);row.append(label,help,status);container.append(row);
  }
  root.append(container);
  return {destroy(){lifetime.abort();container.remove();}};
}
