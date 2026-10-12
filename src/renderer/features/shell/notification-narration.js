/** Routes canonical notification state to the existing, user-enabled narrator. */
export function createNotificationNarration({getNarrator,getSettings,translate=(text)=>text,isScreenReaderActive=()=>true,now=()=>Date.now(),onUnavailable=()=>{}}={}) {
 const seen=new Map();let destroyed=false,reported=false;
 const quiet=()=>{const settings=getSettings()||{};return !settings.narrator?.enabled||settings.attention?.lowStimulation===true||Number(settings.attention?.snoozedUntil)>now()||settings.quiet===true||isScreenReaderActive();};
 const cancel=()=>getNarrator()?.cancel?.();
 const unavailable=()=>{if(!destroyed&&!reported){reported=true;onUnavailable();}};
 return {
  unavailable,
  changed(){if(quiet())cancel();},
  notify(record,{narrate=true}={}){
   if(destroyed||!record||!narrate)return {spoken:false,reason:'excluded'};
   const identity=record.id||'notification',signature=JSON.stringify([record.title,record.message,record.level,record.recovery]);
   if(seen.get(identity)===signature)return {spoken:false,reason:'unchanged'};seen.set(identity,signature);if(seen.size>200)seen.delete(seen.keys().next().value);
   if(quiet()){cancel();return {spoken:false,reason:'quiet or assistive state'};}
   const narrator=getNarrator();if(!narrator)return {spoken:false,reason:'narrator not mounted'};
   if(narrator.available===false){unavailable();return {spoken:false,reason:'speech unavailable'};}
   const settings=getSettings(),localized=language=>[translate(record.title,{language,factual:true}),translate(record.message,{language,message:true}),...(record.recovery||[]).map(action=>translate(action.label,{language,factual:true}))].filter(Boolean).join('. ');
   try {const spoken=narrator.speak({english:localized('en'),cantonese:settings.school?.enabled?null:localized('yue'),category:record.level==='error'?'error:'+identity:record.progress?'operation':'notification',urgent:record.level==='error'});return{spoken:spoken===true,reason:spoken?'accepted by narrator':'narrator cooldown'};}
   catch {cancel();unavailable();return{spoken:false,reason:'speech unavailable'};}
  },
  destroy(){destroyed=true;seen.clear();cancel();}
 };
}
