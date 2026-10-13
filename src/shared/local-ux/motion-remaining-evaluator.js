const copy=value=>JSON.parse(JSON.stringify(value));
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function document(value){
 const row=typeof value==='string'?JSON.parse(value):copy(value);
 if(!plain(row)||row.version!==1||!Array.isArray(row.tracks)||row.tracks.length>8||!Array.isArray(row.transitions)||row.transitions.length!==0||!plain(row.unknown))throw Error('invalid');
 const ids=new Set();for(const track of row.tracks){if(!plain(track)||typeof track.id!=='string'||!track.id.startsWith('sample-')||ids.has(track.id)||typeof track.name!=='string'||track.name.length>80||!plain(track.timing)||!Number.isFinite(track.timing.duration)||track.timing.duration<0||track.timing.duration>1000||['enabled','muted','solo'].some(key=>typeof track[key]!=='boolean'))throw Error('invalid');ids.add(track.id);}
 return row;
}
/** Bounded authored records only. This evaluator never receives the editor model. */
export function evaluateMotionRemaining(fixture,state){
 const record=copy(fixture.record),key=fixture.key,value=state.value,notices=[],invalid=()=>({valid:false,message:'Enter a valid value for the authored motion sample.'});
 const tracks=record.model.tracks,index=tracks.findIndex(row=>row.id===record.selected),selected=tracks[index];
 if(!state.applied&&key==='reset-portable')selected.unknown={note:'Edited sample note'};
 if(!state.applied&&key==='reset-document')record.model=copy(record.copied);
 try{
  if(key==='portable'){if(typeof value!=='string'||value.length>2048)throw Error('invalid');const row=JSON.parse(value);if(!plain(row))throw Error('invalid');selected.unknown=row;}
  if(key==='document'){if(typeof value!=='string'||value.length>4096)throw Error('invalid');record.model=document(value);}
  if(key.startsWith('track-')&&fixture.control==='switch'){if(typeof value!=='boolean')throw Error('invalid');selected[key.slice(6)]=value;}
  if(key==='scrub'){if(String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>1000)throw Error('invalid');record.playback.position=Number(value);}
  if(key==='import'&&!['valid','invalid'].includes(value))throw Error('invalid');
  if(state.applied){
   if(key==='track-add'){tracks.push({id:'sample-new',name:'Sample new track',enabled:true,muted:false,solo:false,timing:{duration:300}});record.selected='sample-new';}
   if(key==='transition-add')record.model.transitions.push({id:'sample-transition',property:'opacity',duration:300});
   if(key==='track-duplicate'){tracks.push({...copy(selected),id:'sample-duplicate',name:selected.name+' copy'});record.selected='sample-duplicate';}
   if(key==='track-up'&&index>0)[tracks[index-1],tracks[index]]=[tracks[index],tracks[index-1]];
   if(key==='track-down'&&index<tracks.length-1)[tracks[index],tracks[index+1]]=[tracks[index+1],tracks[index]];
   if(key==='track-remove'){tracks.splice(index,1);record.selected=tracks[0]?.id||null;}
   if(key==='track-reset')tracks[index]={id:selected.id,name:'Animation',enabled:true,muted:false,solo:false,timing:{duration:300},unknown:{}};
   if(key==='motion-reset'){record.model={version:1,tracks:[],transitions:[],unknown:{}};record.selected=null;}
   if(key==='motion-copy')record.buffer=copy(record.model);
   if(key==='motion-paste'){record.model=copy(record.copied);record.selected=record.model.tracks[0].id;}
   if(key==='undo'||key==='redo'){record.historyIndex+=key==='undo'?-1:1;record.model.tracks[index].timing.duration=record.history[record.historyIndex].duration;}
   if(key==='reset-portable')selected.unknown=copy(fixture.record.model.tracks[index].unknown);
   if(key==='reset-document')record.model=copy(fixture.record.model);
   if(key==='export')record.serialized=JSON.stringify(record.model,null,2);
   if(key==='import'){record.model=document(value==='valid'?record.copied:{...record.copied,version:99});record.selected=record.model.tracks[0].id;}
   if(key==='schedule-add')record.schedules.push({id:'sample-rule-new',preset:record.presets[0]});
   if(key==='schedule-remove')record.schedules=record.schedules.filter(row=>row.id!=='sample-rule-a');
   const playback=record.playback;
   if(key==='playback-play'||key==='playback-resume')playback.phase='running';
   if(key==='playback-pause')playback.phase='paused';
   if(key==='playback-stop'){playback.phase='stopped';playback.position=0;}
   if(key==='playback-restart'){playback.phase='running';playback.position=0;}
   if(key==='playback-reverse'){playback.rate=-playback.rate;playback.phase='running';}
   if(key==='playback-before'){playback.phase='before';playback.position=0;}
   if(key==='playback-after'){playback.phase='after';playback.position=1000;}
   if(key==='playback-previous'||key==='playback-next')playback.position=Math.max(0,Math.min(1000,playback.position+(key==='playback-previous'?-1:1)*1000/playback.fps));
   if(key==='explicit-trigger')record.requestedEvent='command';
  }
 }catch{return invalid();}
 const eligible=record.model.tracks.filter(row=>row.enabled&&!row.muted),solo=eligible.some(row=>row.solo);record.eligibleTracks=eligible.filter(row=>!solo||row.solo).map(row=>row.id);
 if(fixture.native)notices.push('Native playback is unavailable in this practice. Only the simulated state is shown.');
 if(['portable','document','import'].includes(key))notices.push('Only the bounded authored sample schema is checked here. The original editor validates real documents.');
 if(key==='import')notices.push('No file chooser opens and no file is read.');
 if(key==='export')notices.push('Sample text is displayed only. No file is downloaded.');
 const text=JSON.stringify(record,null,2);
 return{valid:true,text,record,notices,...(fixture.native?{utility:{record:{playhead:record.playback.position},markers:[{name:'Start',time:0},{name:'End',time:1000}]}}:{})};
}
