import {control as materialControl} from '../../../shared/surface/controls.js';
export const SETTINGS_CONTROL_KINDS=Object.freeze({text:'md-outlined-text-field',password:'md-outlined-text-field',url:'md-outlined-text-field',number:'md-outlined-text-field',checkbox:'md-checkbox',select:'md-outlined-select',date:'mfe-date-field',time:'mfe-date-field',range:'md-slider',color:'md-outlined-text-field',file:'mfe-file-picker',search:'md-outlined-text-field'});
export function createSettingsControl(doc,kind,{label,value,options=[]}={}){
 const tag=SETTINGS_CONTROL_KINDS[kind];if(!tag)throw Error('Unsupported settings control kind');
 const type=kind==='color'?'text':kind;
 const control=materialControl(kind==='select'?'select':'input',{type,label,'aria-label':label},[],doc);control.dataset.settingsKind=kind;
 if(kind==='checkbox')control.checked=Boolean(value);else if(kind==='select'){for(const [offered,title]of options){const option=materialControl('option',{value:String(offered)},[title],doc);option.dataset.settingsLabel=title;option.selected=String(offered)===String(value);control.append(option);}control.value=String(value??'');}else if(kind==='range')control.value=Number(value);else control.value=value??'';
 if(['md-outlined-text-field','md-outlined-select'].includes(tag)){control.label=label;control.setAttribute('label',label);}

 control.setAttribute('aria-label',label);return control;
}
export function bindSettingsChange(control,{kind,onChange,isAvailable=()=>true,onError=()=>{}}){
 let disposed=false,flight=null;
 const available=()=>!disposed&&control.isConnected!==false&&!control.disabled&&!control.readOnly&&isAvailable();
 const listener=event=>{if(event.defaultPrevented||!available())return;flight=Promise.resolve().then(()=>{if(event.defaultPrevented||!available())throw Error('This control is unavailable. Review its adjacent explanation.');return onChange(kind==='checkbox'?control.checked:control.value);});flight.catch(onError);};
 control.addEventListener('change',listener);
 return{getFlight:()=>flight,resetFlight:()=>{flight=null;},destroy(){disposed=true;control.removeEventListener('change',listener);}};
}
