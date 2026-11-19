/** Display-only, cooperatively scheduled wording projection. Canonical state stays outside the view. */
export function createPrivateWordingView({root=globalThis.document?.body,replace=value=>value,isActive=()=>false,maxNodes=500,scheduleTask=callback=>setTimeout(callback,0),cancelTask=id=>clearTimeout(id)}={}){
 if(!root)throw new TypeError('A projection root is required.');
 const document=root.ownerDocument||root,Observer=document.defaultView?.MutationObserver||globalThis.MutationObserver;
 const originals=new WeakMap(),attributes=new WeakMap(),observers=new Map(),tracked=new Set();
 const limit=Math.max(1,Math.min(2000,Number(maxNodes)||500));
 const excluded='script,style,code,pre,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-private-wording-ignore]';
 let mutationQueued=false,pendingMutations=[],destroyed=false,task=null,work=null,queue=[],queued=new Set(),resolve=null,settled=Promise.resolve({projected:false,reason:'inactive'});
 const belongs=scope=>{let node=scope.host||scope.parentElement||scope;while(node){if(node===root)return true;node=node.parentNode||node.parentElement||node.host||node.getRootNode?.().host;}return false;};
 // A real DOM node answers isConnected cheaply; anything else falls back to walking its ancestry.
 const wholeDocument=root===document||root===document.body||root===document.documentElement;
 const attached=node=>typeof node.isConnected==='boolean'&&!node.host?(node.isConnected&&(wholeDocument||belongs(node))):belongs(node);
 const active=()=>{try{return !destroyed&&Boolean(isActive());}catch{return false;}};
 function restore(node){
  const record=originals.get(node);
  if(record&&node.nodeValue===record.rendered){node.nodeValue=record.canonical;record.rendered=record.canonical;}
  for(const [name,record]of attributes.get(node)||[])if(node.getAttribute(name)===record.rendered){node.setAttribute(name,record.canonical);record.rendered=record.canonical;}
 }
 function restoreAll(){for(const node of tracked)restore(node);tracked.clear();}
 function finish(result){work=null;queue=[];queued.clear();if(resolve){resolve(result);resolve=null;}return result;}
 function stop(reason){if(task!==null)cancelTask(task);task=null;return finish({projected:false,reason});}
 function observe(scope){if(!Observer||observers.has(scope))return;const observer=new Observer(changed);observers.set(scope,observer);observer.observe(scope,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','aria-description','title','placeholder','alt','label','supporting-text','error-text','headline','data-private-wording-ignore','contenteditable']});}
 function* visit(node){
  yield node;
  // Iterating live child links avoids eagerly materializing a whole document.
  if(node.firstChild!==undefined){for(let child=node.firstChild;child;){const next=child.nextSibling;yield*visit(child);child=next;}}
  else for(const child of node.children||[])yield*visit(child);
  if(node.shadowRoot&&!node.closest?.(excluded)){observe(node.shadowRoot);yield*visit(node.shadowRoot);}
 }
 function project(node){
  const element=node.nodeType===1||node.tag;
  if(!element&&typeof node.nodeValue==='string'){
   if(node.parentElement?.closest(excluded)){restore(node);tracked.delete(node);return;}
   const current=node.nodeValue,prior=originals.get(node),canonical=prior&&current===prior.rendered?prior.canonical:current;
   const rendered=String(replace(canonical));originals.set(node,{canonical,rendered});if(current!==rendered)tracked.add(node);if(current!==rendered)node.nodeValue=rendered;
  }else if(element){
   if(node.closest('script,style,code,pre,[data-private-wording-ignore]')){restore(node);tracked.delete(node);return;}
   for(const name of ['aria-label','aria-description','title','placeholder','alt','label','supporting-text','error-text','headline'])if(node.hasAttribute(name)){
    const current=node.getAttribute(name),prior=attributes.get(node)?.get(name),canonical=prior&&current===prior.rendered?prior.canonical:current;
    const rendered=String(replace(canonical));let records=attributes.get(node);if(!records){records=new Map();attributes.set(node,records);}records.set(name,{canonical,rendered});if(current!==rendered)tracked.add(node);if(current!==rendered)node.setAttribute(name,rendered);
   }
  }
 }
 function slice(){
  task=null;if(!active()){restoreAll();return stop(destroyed?'destroyed':'inactive');}
  try{
   let count=0;
   // Roots are checked once when they are queued; everything visited under a root belongs with it.
   while(count++<limit){if(!work){const next=queue.shift();if(!next)return finish({projected:true,reason:'active'});queued.delete(next);work=visit(next);}const item=work.next();if(item.done){work=null;continue;}project(item.value);}
   if(!active()){restoreAll();return stop('inactive');}
  }catch{restoreAll();return stop('replacement-failed');}
  finally{for(const observer of observers.values())observer.takeRecords?.();}
  task=scheduleTask(slice);return{projected:false,reason:'pending'};
 }
 function enqueue(nodes){
  if(destroyed)return{projected:false,reason:'destroyed'};
  if(!active()){restoreAll();return stop('inactive');}
  // A flat queue of roots: nesting a new generator around the previous one on every change made each step slower.
  for(const node of nodes)if(node&&!queued.has(node)&&belongs(node)){queued.add(node);queue.push(node);}
  if(!resolve)settled=new Promise(done=>{resolve=done;});
  if(task===null)return slice();return{projected:false,reason:'pending'};
 }
 function changed(records){
  pendingMutations.push(...(records||[]));if(mutationQueued||destroyed)return;mutationQueued=true;queueMicrotask(()=>{mutationQueued=false;const batch=pendingMutations;pendingMutations=[];if(!destroyed)processChanges(batch);});
 }
 function processChanges(records){
  // Detached nodes are released only after a removal, and isConnected is checked first: walking the ancestry of every
  // replaced node on every change was the largest cost while the app was idle.
  if((records||[]).some(record=>record.removedNodes?.length)||!records?.length){
   for(const node of tracked)if(!attached(node)){restore(node);tracked.delete(node);}
   for(const [scope,observer]of observers)if(!attached(scope)){observer.disconnect();observers.delete(scope);}
  }
  const nodes=[];
  // A changed text or attribute only needs that one node projected; only added nodes need their subtree walked.
  const direct=new Set();
  for(const record of records||[]){if(record.type==='childList')nodes.push(...record.addedNodes);else if(record.target)direct.add(record.target);}
  if(direct.size&&active()){try{for(const node of direct)if(!queued.has(node)&&belongs(node))project(node);}catch{restoreAll();stop('replacement-failed');return;}finally{for(const observer of observers.values())observer.takeRecords?.();}}
  if(!nodes.length&&direct.size)return;
  // Some observer adapters provide only a notification, not mutation records.
  enqueue(nodes.length?nodes:[root]);
 }
 function refresh(){stop('superseded');for(const node of tracked)if(!belongs(node)){restore(node);tracked.delete(node);}for(const [scope,observer]of observers)if(!belongs(scope)){observer.disconnect();observers.delete(scope);}observe(root);return enqueue([root]);}
 function destroy(){if(destroyed)return;destroyed=true;stop('destroyed');for(const observer of observers.values())observer.disconnect();restoreAll();observers.clear();}
 refresh();return{refresh,destroy,whenSettled:()=>settled};
}
