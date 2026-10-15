const phases=new Set(['renderer-entry','shell-mounted','status-rendered','feature-mount','startup-settled','locked-drive-ready','navigation']);
const views=new Set(['drive','offline','history','recycle','settings','help','details','converter','ollama','access','personalization','documentation','changelog','status','workflow','updates','storage','server-manager','browser-pairing']);
const outcomes=new Set(['ready','settled','failed','unavailable','unmeasured','superseded','disposed']);

/** Local bounded measurements contain fixed identifiers, never application data. */
export function createRendererTiming({now=()=>performance.now(),limit=128}={}) {
 if(!Number.isSafeInteger(limit)||limit<1||limit>256)throw TypeError('Invalid timing limit.');
 const records=[],pending=new Map();let sequence=0,closed=false,navigation=null;
 const clock=()=>{const value=now();if(!Number.isFinite(value)||value<0)throw TypeError('Invalid timing clock.');return value;};
 function finish(handle,outcome){if(!outcomes.has(outcome))throw TypeError('Invalid timing outcome.');const start=pending.get(handle);if(!pending.has(handle))return false;pending.delete(handle);if(navigation===handle)navigation=null;const end=clock();records.push(Object.freeze({...handle,outcome,startTime:start,duration:Math.max(0,end-start)}));if(records.length>limit)records.shift();return true;}
 function begin(phase,view=null){if(!phases.has(phase)||view!==null&&!views.has(view))throw TypeError('Invalid timing identifier.');if(closed)return null;if(phase==='navigation'&&navigation)finish(navigation,'superseded');if(pending.size>=32)finish(pending.keys().next().value,'superseded');const handle=Object.freeze({phase,view,sequence:++sequence});pending.set(handle,clock());if(phase==='navigation')navigation=handle;return handle;}
 return Object.freeze({begin,finish,isCurrent:handle=>pending.has(handle)&&!closed,snapshot:()=>Object.freeze({schemaVersion:1,closed,records:Object.freeze([...records]),pending:Object.freeze([...pending.keys()])}),dispose(){if(closed)return;closed=true;for(const handle of [...pending.keys()])finish(handle,'disposed');}});
}

/** Observe actual component, stylesheet and font completion without delaying startup. */
export async function observeTaskPresentation(root,{document=root?.ownerDocument,registry=document?.defaultView?.customElements,timeoutMs=5000,signal}={}) {
 if(!root?.isConnected||root.hidden||!document||!registry||signal?.aborted)return 'unavailable';
 let timer,abort;const cleanups=[];const work=(async()=>{
  const links=[...document.querySelectorAll('link[rel="stylesheet"]')].filter(link=>!link.dataset?.featureStyle);
  await Promise.all(links.map(link=>link.sheet?Promise.resolve():new Promise((resolve,reject)=>{link.addEventListener('load',resolve,{once:true});link.addEventListener('error',reject,{once:true});cleanups.push(()=>{link.removeEventListener('load',resolve);link.removeEventListener('error',reject);});})));
  if(document.fonts?.ready)await document.fonts.ready;
  const components=[root,...root.querySelectorAll('*')].filter(node=>node.localName?.includes('-'));
  await Promise.all(components.map(async node=>{await registry.whenDefined(node.localName);if(node.updateComplete)await node.updateComplete;}));
  return root.isConnected&&!root.hidden&&!signal?.aborted?'ready':'unavailable';
 })();
 try{return await Promise.race([work.catch(()=> 'failed'),new Promise(resolve=>{timer=setTimeout(()=>resolve('unavailable'),timeoutMs);abort=()=>resolve('disposed');signal?.addEventListener('abort',abort,{once:true});})]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);for(const cleanup of cleanups)cleanup();}
}
