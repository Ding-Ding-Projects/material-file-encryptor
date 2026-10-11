export const SETTINGS_CONTROL_KINDS=Object.freeze({text:'md-outlined-text-field',password:'md-outlined-text-field',url:'md-outlined-text-field',number:'md-outlined-text-field',checkbox:'md-checkbox',select:'native-unfinished',date:'native-unfinished',time:'native-unfinished',range:'native-unfinished',color:'native-unfinished',file:'native-unfinished',search:'native-unfinished'});
export function createSettingsControl(doc,kind,{label,value}={}){
 const tag=SETTINGS_CONTROL_KINDS[kind];if(!tag)throw Error('Unsupported settings control kind');
 const control=doc.createElement(tag==='native-unfinished'?'input':tag);control.dataset.settingsKind=kind;
 if(kind==='checkbox')control.checked=Boolean(value);else{control.type=kind;control.value=value??'';}
 if(tag==='md-outlined-text-field'){control.label=label;control.setAttribute('label',label);}
 control.setAttribute('aria-label',label);return control;
}
export function bindSettingsChange(control,{kind,onChange,isAvailable=()=>true,onError=()=>{}}){
 let disposed=false,flight=null;
 const available=()=>!disposed&&control.isConnected!==false&&!control.disabled&&!control.readOnly&&isAvailable();
 const listener=event=>{if(event.defaultPrevented||!available())return;flight=Promise.resolve().then(()=>{if(event.defaultPrevented||!available())throw Error('This control is unavailable. Review its adjacent explanation.');return onChange(kind==='checkbox'?control.checked:control.value);});flight.catch(onError);};
 control.addEventListener('change',listener);
 return{getFlight:()=>flight,resetFlight:()=>{flight=null;},destroy(){disposed=true;control.removeEventListener('change',listener);}};
}
