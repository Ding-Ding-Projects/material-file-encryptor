export const SETTINGS_CONTROL_KINDS=Object.freeze({text:'md-outlined-text-field',password:'md-outlined-text-field',url:'md-outlined-text-field',number:'md-outlined-text-field',checkbox:'md-checkbox',select:'md-outlined-select',date:'native-unfinished',time:'native-unfinished',range:'md-slider',color:'native-unfinished',file:'native-unfinished',search:'native-unfinished'});
export function createSettingsControl(doc,kind,{label,value,options=[]}={}){
 const tag=SETTINGS_CONTROL_KINDS[kind];if(!tag)throw Error('Unsupported settings control kind');
 const control=doc.createElement(tag==='native-unfinished'?'input':tag);control.dataset.settingsKind=kind;
 if(kind==='checkbox')control.checked=Boolean(value);else if(kind==='select'){for(const [offered,title]of options){const option=doc.createElement('md-select-option');option.value=String(offered);option.dataset.settingsLabel=title;option.setAttribute('value',String(offered));option.selected=String(offered)===String(value);const headline=doc.createElement('span');headline.setAttribute('slot','headline');headline.textContent=title;option.append(headline);control.append(option);}control.value=String(value??'');}else if(kind==='range')control.value=Number(value);else{control.type=kind;control.value=value??'';}
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
