const copy=value=>JSON.parse(JSON.stringify(value));
const safe=value=>typeof value==='string'&&value.length<=2000&&!/[{};<>]|url\s*\(|expression\s*\(|@import|javascript\s*:/i.test(value);
const finite=value=>String(value).trim()!==''&&Number.isFinite(Number(value));
const dateValid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
function easing(value,x){
 if(value==='linear')return x;
 const presets={ease:[.25,.1,.25,1],'ease-in':[.42,0,1,1],'ease-out':[0,0,.58,1],'ease-in-out':[.42,0,.58,1]},match=/^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/.exec(value),points=presets[value]||(match?match.slice(1).map(Number):null);
 if(points){const[a,b,c,d]=points;if(!points.every(Number.isFinite)||a<0||a>1||c<0||c>1)return null;const curve=(t,p,q)=>3*(1-t)**2*t*p+3*(1-t)*t*t*q+t**3;let lo=0,hi=1;for(let i=0;i<50;i++){const mid=(lo+hi)/2;if(curve(mid,a,c)<x)lo=mid;else hi=mid;}return curve((lo+hi)/2,b,d);}
 const steps=/^steps\((\d+),\s*(jump-end|end|jump-start|start)\)$/.exec(value);if(steps&&Number(steps[1])>0){const n=Number(steps[1]);return Math.min(1,(Math.floor(x*n)+(['jump-start','start'].includes(steps[2])?1:0))/n);}
 if(value==='linear(0, 0.4 50%, 1)')return x<=.5?x*.8:.4+(x-.5)*1.2;
 return null;
}
function scheduleResult(rule,instant){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:rule.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).filter(row=>row.type!=='literal').map(row=>[row.type,row.value])),localDate=`${parts.year}-${parts.month}-${parts.day}`,clock=Number(parts.hour)*60+Number(parts.minute),minutes=text=>Number(text.slice(0,2))*60+Number(text.slice(3)),start=minutes(rule.start),end=minutes(rule.end),overnight=start>end,inTime=start===end||overnight?(start===end||clock>=start||clock<end):(clock>=start&&clock<end),owner=new Date(localDate+'T12:00:00Z');if(overnight&&clock<end)owner.setUTCDate(owner.getUTCDate()-1);const ownerDate=owner.toISOString().slice(0,10),weekday=owner.getUTCDay();return{localDate,clock,ownerDate,weekday,matched:rule.enabled&&inTime&&rule.weekdays.includes(weekday)&&(!rule.startDate||ownerDate>=rule.startDate)&&(!rule.endDate||ownerDate<=rule.endDate)};
}
function samplePlaybackPosition(position,start,end,loop){
 if(position<=start||end===start)return start;
 if(!loop)return Math.min(position,end);
 return position<end?position:start+(position-start)%(end-start);
}
export function evaluateMotionPractice(fixture,state){
 const record=copy(fixture.record),key=fixture.key,input=state.value,invalid=message=>({valid:false,message}),result={};let value=input;
 try{
  if(fixture.control==='select'){if(!fixture.choices.some(row=>row.value===value))return invalid('Choose one of the authored sample options.');if(['true','false'].includes(value))value=value==='true';}
  if(fixture.numeric){if(fixture.optional&&value==='')value=null;else if(fixture.special?.includes(value)){}else{if(!finite(value)||Number(value)<fixture.min||Number(value)>fixture.max||fixture.integer&&!Number.isInteger(Number(value)))return invalid('Enter a valid sample motion value within the authored bounds.');value=Number(value);}}
  if(typeof value==='string'&&(!safe(value)||value.length>(fixture.maxLength||2000)))return invalid('Enter a valid sample motion value within the authored bounds.');
  const timingKeys={duration:'duration','start-delay':'delay','end-delay':'endDelay','repeat-count':'iterations','iteration-start':'iterationStart','playback-rate':'playbackRate','repeat-delay':'repeatDelay',direction:'direction',fill:'fill','global-easing':'easing'};
  if(timingKeys[key])record.timing[timingKeys[key]]=value;
  const trackKeys={'animated-property':'property','after-track':'after','track-name':'name','parallel-group':'group','sequence-offset':'offset','stagger-offset':'stagger','target-scope':'scope','target-state':'state',composition:'composition','iteration-composition':'iterationComposite'};
  if(trackKeys[key])record[trackKeys[key]]=value;
  if(key==='animated-property'&&(!/^(?:--[a-zA-Z_][\w-]*|[a-zA-Z][\w-]*)$/.test(value)||/^(?:animation|transition|behavior|content|src)/i.test(value)||value.startsWith('--appearance-rainbow')))return invalid('Enter a valid sample motion value within the authored bounds.');
  if(key==='after-track'&&!['','sample-fade'].includes(value))return invalid('The sample predecessor is missing or creates a cycle.');
  const triggerKeys={trigger:'kind','from-state':'from','to-state':'to','progress-threshold':'threshold',debounce:'debounce',retrigger:'retrigger','cancel-on-exit':'cancelOnExit','trigger-priority':'priority'};
  if(triggerKeys[key])record.trigger[triggerKeys[key]]=value;
  const timelineKeys={'timeline-source':'type','timeline-element':'source','timeline-axis':'axis','view-inset':'inset','attachment-start':'rangeStart','attachment-end':'rangeEnd'};
  if(timelineKeys[key])record.timeline[timelineKeys[key]]=value;
  if(key==='keyframe-offset')record.frame.offset=value;
  if(key==='absolute-keyframe-time'){record.frame.time=value;record.frame.offset=value===null?.5:record.timing.duration===0?0:value/record.timing.duration;}
  if(key==='relative-keyframe-time'){record.frame.relativeTime=value;record.frame.offset=value===null?.5:(75+value)/record.timing.duration;}
  if(record.frame.offset!==null&&(record.frame.offset<0||record.frame.offset>1))return invalid('Sample frame offsets must remain between zero and one.');
  if(key==='keyframe-value')record.frame.value=value;
  if(key==='segment-easing')record.frame.easing=value;
  if(key==='keyframe-composition')record.frame.composite=value;
  if(key==='hold-segment')record.frame.hold=value;
  const previewKeys={'timeline-zoom':'zoom','timeline-snapping':'snap','playback-range-start':'rangeStart','playback-range-end':'rangeEnd','preview-frame-rate':'fps','loop-preview':'loop','preview-playback-speed':'rate'};
  if(previewKeys[key])record.preview[previewKeys[key]]=value;
  if(record.preview.rangeStart>record.preview.rangeEnd)return invalid('The sample playback range is reversed.');
  if(key==='playhead')record.preview.playhead=value;
  const scheduleKeys={'schedule-name':'label','schedule-enabled':'enabled','scheduled-preset':'preset','schedule-start-time':'start','schedule-end-time':'end','schedule-first-date':'startDate','schedule-last-date':'endDate','schedule-timezone':'timezone','schedule-priority':'priority','schedule-weekdays':'weekdays'};
  if(scheduleKeys[key]){
   if(key==='schedule-weekdays'){value=JSON.parse(value);if(!Array.isArray(value)||!value.length||value.some(day=>!Number.isInteger(day)||day<0||day>6)||new Set(value).size!==value.length)return invalid('Choose distinct sample weekdays from zero through six.');}
   if(['schedule-start-time','schedule-end-time'].includes(key)&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))return invalid('Use HH:MM within one day.');
   if(['schedule-first-date','schedule-last-date'].includes(key)&&value&&!dateValid(value))return invalid('Choose a real sample calendar date.');
   record.schedule[scheduleKeys[key]]=value;if(record.schedule.startDate&&record.schedule.endDate&&record.schedule.startDate>record.schedule.endDate)return invalid('The sample calendar boundaries are reversed.');
   const match=scheduleResult(record.schedule,fixture.instant);result.schedule={...match,winningPreset:match.matched&&record.schedule.priority>=0?record.schedule.preset:'Sample active'};
  }
  const t=record.timing,start=record.offset+record.stagger+(record.after?300:0)+t.delay,active=t.duration==='auto'?null:t.iterations==='infinite'?'infinite':t.duration*t.iterations,end=typeof active==='number'?start+active+t.endDelay:null,elapsed=150-start;
  let progress=null;if(t.duration!=='auto'&&t.iterations!==0){const position=t.duration===0?1:Math.max(0,Math.min(typeof active==='number'?active:Infinity,elapsed))/t.duration+t.iterationStart;let iteration=Math.floor(position),fraction=position%1;if((t.duration===0||typeof active==='number'&&elapsed>=active)&&fraction===0){iteration=Math.max(0,iteration-1);fraction=1;}const reverse=t.direction==='reverse'||t.direction==='alternate'&&iteration%2===1||t.direction==='alternate-reverse'&&iteration%2===0;progress=reverse?1-fraction:fraction;}
  let opacity=progress===null?null:easing(t.easing,progress);if(elapsed<0&&!['backwards','both'].includes(t.fill)||typeof active==='number'&&elapsed>=active&&!['forwards','both'].includes(t.fill))opacity=null;const unavailable=[];if(t.duration==='auto')unavailable.push('auto-duration');if(t.repeatDelay!==0)unavailable.push('repeat-delay');if(progress!==null&&easing(t.easing,progress)===null)unavailable.push('easing');if(record.property!=='opacity')unavailable.push('property-interpolation');if(record.timeline.type!=='document'||record.timeline.inset!=='auto'||record.timeline.rangeStart!=='normal'||record.timeline.rangeEnd!=='normal')unavailable.push('progress-timeline');
  if(key==='segment-easing')opacity=easing(record.frame.easing,.5);if(key==='hold-segment')opacity=record.frame.hold?0:.5;if(key==='keyframe-value'){opacity=record.frame.value==='computed'?.25:finite(record.frame.value)&&Number(record.frame.value)>=0&&Number(record.frame.value)<=1?Number(record.frame.value):null;if(opacity===null)unavailable.push('opacity-value');}
  const event=fixture.event,trigger=record.trigger,matched=trigger.kind===event.kind&&(trigger.from==='any'||trigger.from===event.from)&&trigger.to===event.to&&event.progress>=trigger.threshold&&event.now-event.last>=trigger.debounce;
  const preview=record.preview,snapped=preview.snap?Math.round(preview.playhead/preview.snap)*preview.snap:preview.playhead;
  Object.assign(result,{track:record,timing:{start,active,end,progress,opacity,rateOffsetAt100ms:100*t.playbackRate,beforeFill:['backwards','both'].includes(t.fill)?0:null,afterFill:['forwards','both'].includes(t.fill)?1:null},trigger:{matched,reaction:matched?trigger.retrigger:'none',cancelOnExit:trigger.cancelOnExit,winningId:trigger.priority>=0?'sample-track':'sample-other'},targetIds:record.scope==='element'?['sample-element']:['sample-layer'],composition:{base:10,effect:20,result:record.composition==='replace'?20:30,secondIteration:record.iterationComposite==='accumulate'?40:20},frame:{...record.frame,atMilliseconds:record.frame.offset===null?null:record.frame.offset*300,midpointEasing:record.frame.hold?'steps(1, jump-end)':record.frame.easing},preview:{...preview,snapped,stepMilliseconds:1000/preview.fps,positionAfter1100:samplePlaybackPosition(1100,preview.rangeStart,preview.rangeEnd,preview.loop),sampleCanvasWidth:300*preview.zoom,elapsedAt100ms:100*preview.rate},unavailable,nativePlaybackStarted:false});
  const messages={'auto-duration':'Automatic duration requires native timeline support.','repeat-delay':'Native repeat-delay playback is unavailable.','easing':'This easing has no authored sample interpolation.','progress-timeline':'Native progress and attachment playback is unavailable in this sample.','opacity-value':'This value has no authored sample opacity interpolation.','property-interpolation':'This property has no authored sample interpolation.'};return{valid:true,text:JSON.stringify(result,null,2),motion:result,notices:unavailable.map(code=>messages[code])};
 }catch{return invalid('Enter a valid sample motion value within the authored bounds.');}
}
