/** The host supplies authoritative public metadata and bounded, verified image bytes. */
export function createStartupSurprise({random=Math.random,getState,show,resolvePublishedDish,clock=Date.now}={}){
 let attempted=false;const startedAt=clock();
 const expired=()=>clock()-startedAt>=15000;
 const ineligible=state=>expired()||state.school?.enabled||state.firstRun||state.busy||state.error||state.updating||state.quiet||state.interacted||state.modalOpen;
 return {async attempt(){if(attempted)return {shown:false,reason:'already evaluated'};const state=getState();if(!expired()&&state.updateChecking&&!state.firstRun&&!state.school?.enabled&&!state.quiet&&!state.error&&!state.busy&&!state.interacted&&!state.modalOpen)return{shown:false,reason:'startup update check pending',deferred:true};attempted=true;if(ineligible(state))return{shown:false,reason:'ineligible startup state'};if(random()>=.1)return{shown:false,reason:'startup draw'};if(!resolvePublishedDish)return{shown:false,reason:'verified public catalogue adapter unavailable'};const dish=await resolvePublishedDish();if(!dish?.name?.en||!dish?.name?.zhHant||!dish?.imageUrl||!dish?.published)return{shown:false,reason:'published image unavailable'};const url=new URL(dish.imageUrl);if(url.protocol!=='https:'||!['github.com','objects.githubusercontent.com','release-assets.githubusercontent.com'].includes(url.hostname))return{shown:false,reason:'unapproved image source'};if(ineligible(getState()))return{shown:false,reason:"startup state changed"};const presented=await show({name:`${dish.name.en} · ${dish.name.zhHant}`,imageUrl:dish.imageUrl,imageDataUrl:dish.imageDataUrl,alt:`${dish.name.en} · ${dish.name.zhHant}`,timeout:5000,focus:false,motion:!state.reducedMotion});return presented===false?{shown:false,reason:"presentation unavailable"}:{shown:true};}};
}

/** Trusted interaction closes the startup opportunity, including in-flight photo lookup. */
export function observeStartupInteraction(target,onInteraction){
 const listener=event=>{if(event.isTrusted)onInteraction();};
 const types=['pointerdown','keydown','input'];
 for(const type of types)target.addEventListener(type,listener,true);
 return()=>{for(const type of types)target.removeEventListener(type,listener,true);};
}
