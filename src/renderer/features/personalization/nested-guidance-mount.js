import {mountControlGuidance} from '../../../shared/surface/control-guidance.js';
import {nestedAppearanceGuidance,invokeNestedAppearanceControl} from '../../../shared/local-ux/nested-appearance-guidance.js';

/** The original event owns admission, validation and the recorded consumer. */
export function bindNestedConsumer(target,action,{eventType='click',available=()=>true,onError=()=>{}}={}){
 let flight=null,disposed=false;
 const listener=event=>{if(event.defaultPrevented||disposed||target.disabled||target.readOnly||!available())return;
  try{flight=Promise.resolve(action(event)).then(value=>{if(value===false)throw Error('The original control could not complete this action.');return value;});}
  catch(error){flight=Promise.reject(error);}
  flight.catch(onError);
 };
 target.addEventListener(eventType,listener);
 return {run:()=>invokeNestedAppearanceControl(target,{eventType,resetFlight:()=>flight=null,getFlight:()=>flight}),getFlight:()=>flight,destroy(){disposed=true;target.removeEventListener(eventType,listener);}};
}
export function mountNestedGuidance(target,key,binding,{t=value=>value,services={},instance='default'}={}){
 const descriptor=nestedAppearanceGuidance(key,{language:target.ownerDocument.documentElement?.lang?.startsWith('yue')?'yue':'en',instance});
 descriptor.help=(services.guidanceHelpBase?.replace('settings-guidance','nested-appearance-guidance')||descriptor.help.split('#')[0])+'#'+descriptor.concept;
 return mountControlGuidance(target,{descriptor,t,run:binding.run,openHelp:services.openGuidanceHelp,registerHelp:services.registerHelp,registerCommands:services.registerCommands});
}
