// Helpers for the optional browser pairing code. Nothing here stores a code or a camera frame.
export const PAIRING_CODE_PATTERN=/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
export const SCAN_TIMEOUT_MS=60000;
const POLL_MS=250;

/** Accepts what a person types or pastes: any case, with spaces or hyphens between groups. */
export function normalizePairingCode(value){
 if(typeof value!=='string'||value.length>32)return '';
 return value.replace(/[\s-]/g,'').toUpperCase();
}
export function validPairingCode(value){return typeof value==='string'&&PAIRING_CODE_PATTERN.test(value);}
export function scanSupported(scope=globalThis){return typeof scope.BarcodeDetector==='function'&&typeof scope.navigator?.mediaDevices?.getUserMedia==='function';}

/**
 * Opens the camera only when start() is called, and stops every track on
 * success, cancel, error, timeout, tab hide and page close.
 */
export function createPairingScanner({scope=globalThis,video,onCode,onState=()=>{},setTimer=globalThis.setTimeout,clearTimer=globalThis.clearTimeout,now=Date.now}={}){
 let stream=null,timer=null,generation=0,active=false,deadline=0;
 const doc=scope.document;
 function release(){
  if(timer!==null){clearTimer(timer);timer=null;}
  const held=stream;stream=null;
  if(held)for(const track of held.getTracks())track.stop();
  if(video){try{video.pause?.();}catch{}video.srcObject=null;video.hidden=true;}
  active=false;
 }
 function finish(state){generation++;release();onState(state);}
 const hidden=()=>{if(active)finish('stopped');};
 const visibility=()=>{if(doc?.visibilityState==='hidden')hidden();};
 scope.addEventListener?.('pagehide',hidden);doc?.addEventListener?.('visibilitychange',visibility);
 return{
  get active(){return active;},
  async start(){
   if(active)return;
   if(!scanSupported(scope)){onState('unsupported');return;}
   const own=++generation;active=true;onState('starting');
   try{
    const detector=new scope.BarcodeDetector({formats:['qr_code']});
    const opened=await scope.navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480}}});
    if(own!==generation||!active){for(const track of opened.getTracks())track.stop();return;}
    stream=opened;video.srcObject=opened;video.hidden=false;await video.play?.();
    if(own!==generation)return;
    deadline=now()+SCAN_TIMEOUT_MS;onState('scanning');
    const look=async()=>{
     timer=null;if(own!==generation||!active)return;
     if(now()>=deadline){finish('timeout');return;}
     try{
      const found=video.videoWidth&&video.videoHeight?await detector.detect(video):[];
      if(own!==generation||!active)return;
      for(const item of found){const code=normalizePairingCode(item?.rawValue);if(validPairingCode(code)){finish('found');onCode(code);return;}}
     }catch{if(own===generation)finish('error');return;}
     if(own===generation&&active)timer=setTimer(look,POLL_MS);
    };
    timer=setTimer(look,POLL_MS);
   }catch{if(own===generation)finish('error');}
  },
  stop(){if(active)finish('stopped');},
  destroy(){generation++;release();scope.removeEventListener?.('pagehide',hidden);doc?.removeEventListener?.('visibilitychange',visibility);},
 };
}
