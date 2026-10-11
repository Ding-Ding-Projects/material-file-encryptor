// Live image state is target-local. Editing a state's controls never selects
// that state on unrelated targets. State order follows the generated CSS rules.
const safeMatch=(target,selector)=>{try{return target.matches(selector);}catch{return false;}};
export function targetImageStates(target,{pressed=false,dragged=false}={}) {
 const attr=(name,value)=>target.getAttribute(name)===value;
 return new Set(['normal',...(safeMatch(target,':hover')?['hover']:[]),...(safeMatch(target,':focus')||safeMatch(target,':focus-visible')?['focus']:[]),...(pressed||safeMatch(target,':active')?['active']:[]),...(attr('aria-selected','true')?['selected']:[]),...(safeMatch(target,':disabled')||attr('aria-disabled','true')?['disabled']:[]),...(dragged||attr('aria-grabbed','true')?['dragged']:[]),...(safeMatch(target,':invalid')||attr('aria-invalid','true')?['invalid']:[]),...(attr('aria-busy','true')?['loading']:[]),...(['success','warning','error'].filter(name=>attr('data-state',name)))]);
}
export function resolveTargetImageLayers(model,id,active) {
 const states=model.elements[id]||{};
 const resolve=(name,visited=new Set())=>{
  if(visited.has(name))throw Error('State inheritance cycle.');visited.add(name);
  const source=model.inheritance?.[id]?.[name]??(name==='normal'?'none':'normal');
  return [...(source==='none'?[]:resolve(source,visited)),...(states[name]||[])];
 };
 // As with equally specific CSS rules, later authored matching states win.
 const selected=Object.keys(states).filter(name=>name!=='normal'&&active.has(name)).at(-1)||'normal';
 return resolve(selected);
}
export function createImageStateController(root,onChange,{MutationObserverClass=root.ownerDocument?.defaultView?.MutationObserver||globalThis.MutationObserver}={}) {
 const targets=new Map(),pressed=new Set(),dragged=new Set(),doc=root.ownerDocument||root,view=doc.defaultView;let disposed=false,queued=false;
 const contains=(parent,child)=>parent===child||!!parent.contains?.(child)||(()=>{for(let n=child;n;n=n.parentElement)if(n===parent)return true;return false;})();
 const states=target=>targetImageStates(target,{pressed:pressed.has(target),dragged:dragged.has(target)});
 const signature=target=>[...states(target)].join('|');
 const flush=()=>{queued=false;if(disposed)return;let changed=false;for(const [target,previous]of targets){if(!target.isConnected||!contains(root,target)){targets.delete(target);pressed.delete(target);dragged.delete(target);changed=true;}else{const next=signature(target);if(next!==previous){targets.set(target,next);changed=true;}}}if(changed)onChange();};
 const schedule=()=>{if(!disposed&&!queued){queued=true;queueMicrotask(flush);}};
 const event=event=>{
  if(event.type==='pointerdown'||event.type==='keydown'&&[' ','Enter'].includes(event.key)&&!event.repeat){for(const target of targets.keys())if(contains(target,event.target)&&!states(target).has('disabled'))pressed.add(target);}
  if(['pointerup','pointercancel','keyup','blur'].includes(event.type))pressed.clear();
  if(event.type==='dragstart')for(const target of targets.keys())if(contains(target,event.target))dragged.add(target);
  if(['dragend','drop','blur'].includes(event.type))dragged.clear();
  schedule();
 };
 const events=['pointerover','pointerout','pointerdown','pointerup','pointercancel','focusin','focusout','keydown','keyup','dragstart','dragend','drop','input','change'];
 for(const name of events)doc.addEventListener?.(name,event,true);view?.addEventListener?.('blur',event);
 const observer=typeof MutationObserverClass==='function'?new MutationObserverClass(schedule):null;
 observer?.observe(doc.documentElement?.nodeType===1?doc.documentElement:root,{subtree:true,attributes:true,childList:true,attributeFilter:['disabled','aria-disabled','aria-selected','aria-grabbed','aria-invalid','aria-busy','data-state','class','type','required','value','min','max','pattern']});
 return {states,sync(next){const set=new Set(next);for(const target of targets.keys())if(!set.has(target)){targets.delete(target);pressed.delete(target);dragged.delete(target);}for(const target of set)targets.set(target,signature(target));},destroy(){disposed=true;observer?.disconnect();for(const name of events)doc.removeEventListener?.(name,event,true);view?.removeEventListener?.('blur',event);targets.clear();pressed.clear();dragged.clear();}};
}
