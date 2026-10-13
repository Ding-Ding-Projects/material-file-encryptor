import {parseColorEntry,parseColor,colorRepresentations,contrastRatio,rainbowDuration} from '../../renderer/features/personalization/color.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const decimal=value=>String(Number(value.toFixed(8)));
export function sampleColorNotation(color,space){
 const value=parseColorEntry(color),r=colorRepresentations(value),suffix=' / '+decimal(parseColor(value)[3]),list=(name,values)=>name+'('+values.map(decimal).join(' ')+suffix+')';
 const representations={named:r.name??null,hex:value.length===7?value+'ff':value,rgb:r.rgb,hsl:r.hsl,hsv:list('hsv',[r.hsv[0],r.hsv[1]*100,r.hsv[2]*100]),hsb:list('hsb',[r.hsv[0],r.hsv[1]*100,r.hsv[2]*100]),hwb:list('hwb',[r.hwb[0],r.hwb[1]*100,r.hwb[2]*100]),lab:list('lab',r.lab.slice(0,3)),lch:list('lch',r.lch.slice(0,3)),oklab:list('oklab',r.oklab.slice(0,3)),oklch:list('oklch',r.oklch.slice(0,3)),cmyk:'cmyk('+r.cmyk.slice(0,4).map(value=>decimal(value*100)+'%').join(' ')+suffix+')'};
 return representations[space];
}
export function evaluateColorPractice(fixture,state){
 const record=copy(fixture.record),key=fixture.key,value=state.value,invalid=message=>({valid:false,message}),cleared=fixture.control==='clear'&&state.applied;
 try{
  if(!cleared){
   if(fixture.channel!==undefined){const n=Number(value);if(String(value).trim()===''||!Number.isFinite(n)||n<fixture.min||n>fixture.max)return invalid('Enter a value within the sample bounds.');const hsv=colorRepresentations(record.draft).hsv;hsv[fixture.channel]=n/([1,2].includes(fixture.channel)?100:1);record.draft=parseColorEntry(`hsv(${hsv[0]} ${hsv[1]*100} ${hsv[2]*100} / ${hsv[3]})`);}
   if(key==='entry')record.draft=parseColorEntry(String(value));
   if(key==='name'||key==='save'){const name=String(value).trim();if(!name||name.length>100||/[\u0000-\u001f\u007f]/.test(name))return invalid('Enter a sample name from 1 to 100 characters.');record.name=name;}
   if(key==='speed'){const n=Number(value);if(String(value).trim()===''||!Number.isInteger(n)||n<1||n>10)return invalid('Enter a whole sample speed level from 1 to 10.');record.level=n;record.duration=rainbowDuration(n);}
  }
  if(key==='space'){if(!fixture.choices.some(row=>row.value===value))return invalid('Choose one of the authored sample options.');record.space=value;record.representation=sampleColorNotation(record.draft,value);}
  if(key==='swatch'){const option=fixture.choices.find(row=>row.value===value);if(!option)return invalid('Choose one of the authored sample options.');record.draft=parseColorEntry(option.color);}
  if(state.applied&&!cleared)switch(key){
   case 'apply':record.target=record.draft;record.recent=[record.draft,...record.recent.filter(row=>row!==record.draft)];break;
   case 'copy':record.copiedText=sampleColorNotation(record.draft,record.space);record.osCopyPerformed=false;break;
   case 'eyedropper':record.draft=fixture.pixel.slice(0,7)+parseColorEntry(record.draft).slice(7);record.screenSampled=false;break;
   case 'save':record.palette.push({id:'sample-new',name:record.name,value:record.draft});break;
   case 'remove':record.palette=record.palette.filter(row=>row.id!=='sample-violet');break;
   case 'rainbow':record.draft={kind:'rainbow'};record.animationStarted=false;break;
   case 'reset':record.target=record.inherited;record.override=false;break;
  }
  const color=key==='reset'&&state.applied?record.inherited:key==='rainbow'&&state.applied?fixture.record.draft:record.draft,contrast=key==='rainbow'&&state.applied?null:contrastRatio(color,'#ffffffff');
  return{valid:true,text:cleared?'The sample draft is empty; the accepted color is unchanged.':JSON.stringify({...record,contrast},null,2),record,color,emptyDraft:cleared,rainbow:key==='rainbow'&&state.applied};
 }catch{return invalid('Enter valid color notation within the sRGB gamut.');}
}
