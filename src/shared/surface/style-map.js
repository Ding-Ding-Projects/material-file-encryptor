import {noChange} from 'lit-html';
import {Directive,PartType,directive} from 'lit-html/directive.js';

/** Lit-compatible style maps applied through CSSOM, including the first update.
 * Returning noChange prevents an inline style attribute commit under strict CSP.
 */
export class CssomStyleMapDirective extends Directive {
 constructor(part){
  super(part);
  if(part.type!==PartType.ATTRIBUTE||part.name!=='style'||part.strings?.length>2)throw new Error('styleMap requires one style attribute binding.');
  this.properties=new Set();
 }
 render(){return noChange;}
 update(part,[values]){
  const style=part.element.style;
  for(const property of this.properties)if(values[property]==null){
   this.properties.delete(property);
   if(property.includes('-'))style.removeProperty(property);else style[property]=null;
  }
  for(const [property,value]of Object.entries(values))if(value!=null){
   this.properties.add(property);
   const important=typeof value==='string'&&value.endsWith(' !important');
   if(property.includes('-')||important){
    const name=property.includes('-')?property:property.replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g,'-$&').toLowerCase();
    style.setProperty(name,important?value.slice(0,-11):value,important?'important':'');
   }else style[property]=value;
  }
  return noChange;
 }
}
export const styleMap=directive(CssomStyleMapDirective);
