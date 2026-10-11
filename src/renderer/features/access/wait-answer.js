/** Structured waiting answers must contain explicit data at every index.
 * Array iteration alone skips holes and may evaluate inherited/accessor values. */
export function denseAnswerArray(value,limit=128){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>limit||Reflect.ownKeys(value).length!==value.length+1)return false;
 for(let i=0;i<value.length;i++){const item=Object.getOwnPropertyDescriptor(value,String(i));if(!item||!Object.hasOwn(item,'value'))return false;}
 return true;
}
export function waitingAnswer(value){
 if(Number.isInteger(value))return true;
 if(!denseAnswerArray(value))return false;
 for(let i=0;i<value.length;i++){
  const item=Object.getOwnPropertyDescriptor(value,String(i)).value;
  if(Number.isFinite(item))continue;
  if(!item||Object.getPrototypeOf(item)!==Object.prototype||Reflect.ownKeys(item).length!==2)return false;
  const cell=Object.getOwnPropertyDescriptor(item,'cell'),time=Object.getOwnPropertyDescriptor(item,'time');
  if(!cell||!time||!Object.hasOwn(cell,'value')||!Object.hasOwn(time,'value')||!Number.isInteger(cell.value)||cell.value<0||cell.value>=9||!Number.isFinite(time.value)||time.value<0||time.value>120000)return false;
 }
 return true;
}
