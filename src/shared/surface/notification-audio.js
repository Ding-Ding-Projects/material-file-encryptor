/** Audio starts only after the user enables it through an explicit control. */
export function createNotificationAudio({Context=globalThis.AudioContext||globalThis.webkitAudioContext}={}){
 let context,enabled=false;
 return{async enable(value){enabled=value===true;if(!enabled)return false;if(!Context){enabled=false;return false;}try{context??=new Context();await context.resume();return enabled&&context.state==='running';}catch{enabled=false;return false;}},
 play(){if(!enabled||context?.state!=='running')return false;const oscillator=context.createOscillator(),gain=context.createGain();gain.gain.value=.04;oscillator.frequency.value=660;oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+.12);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};return true;},
 destroy(){enabled=false;context?.close();context=null;}};
}
