const copy=value=>JSON.parse(JSON.stringify(value));
const text=(value,max=160)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const numeric=value=>String(value).trim()!==''&&Number.isFinite(Number(value));
const cubic=(t,a,b)=>3*(1-t)**2*t*a+3*(1-t)*t*t*b+t**3;
const markerList=value=>{const list=JSON.parse(value);if(!Array.isArray(list)||list.length>20)throw Error('invalid');return list.map(row=>{if(!row||!text(row.name)||typeof row.time!=='number'||!Number.isFinite(row.time)||row.time<0||row.time>1000)throw Error('invalid');return{name:row.name,time:row.time};});};
export function evaluateMotionUtility(fixture,state){
 const record=copy(fixture.record),key=fixture.key,value=fixture.variant==='reset'&&state.applied?fixture.fallback:state.value,invalid=()=>({valid:false,message:'Enter a valid bounded sample utility value.'});let graph=null,notice=null;
 try{
  if(fixture.min!==null&&fixture.min!==undefined&&(!numeric(value)||Number(value)<fixture.min||Number(value)>fixture.max))return invalid();
  if(fixture.choices&&!fixture.choices.some(row=>row.value===value))return invalid();
  const bezier={'bezier-x1':0,'bezier-y1':1,'bezier-x2':2,'bezier-y2':3};
  if(Object.hasOwn(bezier,key))record.curve[bezier[key]]=Number(value);
  if(key.startsWith('bezier-')){const[a,b,c,d]=record.curve;let lo=0,hi=1;for(let i=0;i<50;i++){const middle=(lo+hi)/2;if(cubic(middle,a,c)<.5)lo=middle;else hi=middle;}record.easing='cubic-bezier('+record.curve.join(', ')+')';record.halfwayProgress=cubic((lo+hi)/2,b,d);graph=Array.from({length:33},(_,i)=>[cubic(i/32,a,c),cubic(i/32,b,d)]);}
  if(key==='step-count')record.steps.count=Math.max(1,Math.round(Number(value)));
  if(key==='step-jump')record.steps.jump=value;
  if(fixture.domain==='steps'){const {count,jump}=record.steps;const evaluate=x=>{if(['jump-start','start'].includes(jump))return Math.min(1,(Math.floor(x*count)+1)/count);if(jump==='jump-both')return Math.min(1,(Math.floor(x*count)+1)/(count+1));if(jump==='jump-none')return Math.min(1,Math.floor(x*count)/(count-1));return Math.floor(x*count)/count;};if(jump==='jump-none'&&count<2)return invalid();record.easing=`steps(${count}, ${jump})`;record.halfwayProgress=evaluate(.5);graph=Array.from({length:101},(_,i)=>[i/100,evaluate(i/100)]);}
  if(key==='linear-stops'){const stops=JSON.parse(value);if(!Array.isArray(stops)||stops.length<2||stops.length>16||stops.some((row,i)=>!Array.isArray(row)||row.length!==2||!row.every(Number.isFinite)||Math.abs(row[0])>2||row[1]<0||row[1]>100||i>0&&row[1]<stops[i-1][1]))return invalid();record.linear=stops;record.easing='linear('+stops.map(([v,p])=>v+' '+p+'%').join(', ')+')';graph=stops.map(([v,p])=>[p/100,v]);}
  const springKeys={'spring-mass':'mass','spring-stiffness':'stiffness','spring-damping':'damping','spring-velocity':'initialVelocity'};
  if(springKeys[key])record.spring[springKeys[key]]=Number(value);
  if(key==='spring-clear'&&state.applied)delete record.spring;
  if(fixture.domain==='spring'&&record.spring){const {mass,stiffness,damping}=record.spring;record.naturalFrequency=Math.sqrt(stiffness/mass);record.dampingRatio=stiffness===0?null:damping/(2*Math.sqrt(mass*stiffness));record.nativePlaybackAvailable=false;notice='Native spring playback is unavailable. The sample retains metadata only.';}
  if(key==='track-markers')record.trackMarkers=markerList(value);
  if(key==='timeline-markers')record.markers=markerList(value);
  if(key==='marker-name'){if(!text(value))return invalid();record.markers[0].name=value;}
  if(key==='marker-time')record.markers[0].time=Number(value);
  if(state.applied){if(key==='marker-add')record.markers.push({name:'Sample added',time:record.playhead});if(key==='marker-remove')record.markers.splice(0,1);if(key==='marker-seek'){record.playhead=record.markers[0].time;record.nativeSeekPerformed=false;}}
  if(key==='preset-name'||key==='preset-save'){if(!text(value))return invalid();record.presetName=value;}
  if(key==='preset-save'&&state.applied){const snapshot=copy(record.model);delete snapshot.unknown.presets;delete snapshot.unknown.schedules;record.presets[record.presetName||'Motion']=snapshot;record.storageWritten=false;}
  if(key==='preset-apply'&&state.applied){const {presets,schedules}=record.model.unknown;record.model=copy(record.presets['Sample quiet']);record.model.unknown={...record.model.unknown,presets:copy(presets),schedules:copy(schedules)};record.storageWritten=false;}
  return{valid:true,text:JSON.stringify(record,null,2),utility:{record,graph,markers:fixture.domain==='markers'?(key==='track-markers'?record.trackMarkers:record.markers):null},notices:notice?[notice]:[]};
 }catch{return invalid();}
}
