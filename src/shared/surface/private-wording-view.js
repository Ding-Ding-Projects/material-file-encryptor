/** Display-only wording projection. Callers retain canonical state and exports. */
export function createPrivateWordingView({root=globalThis.document?.body,replace=value=>value,isActive=()=>false,maxNodes=20000}={}){
 if(!root)throw new TypeError('A projection root is required.');
 const document=root.ownerDocument||root;
 const Observer=document.defaultView?.MutationObserver||globalThis.MutationObserver;
 const originals=new WeakMap(),attributes=new WeakMap(),observers=new Map(),tracked=new Set();
 maxNodes=Math.max(1,Math.min(100000,Number(maxNodes)||20000));
 const excluded='script,style,code,pre,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-private-wording-ignore]';
 let queued=false,destroyed=false;
 const belongs=scope=>{let node=scope.host||scope;while(node){if(node===root||root.contains(node))return true;node=node.getRootNode?.().host;}return false;};
 function restore(node){
  const record=originals.get(node);
  if(record&&node.nodeValue===record.rendered){node.nodeValue=record.canonical;record.rendered=record.canonical;}
  for(const [name,record]of attributes.get(node)||[])if(node.getAttribute(name)===record.rendered){node.setAttribute(name,record.canonical);record.rendered=record.canonical;}
 }
 function schedule(){if(queued||destroyed)return;queued=true;queueMicrotask(()=>{queued=false;if(!destroyed)refresh();});}
 function refresh(){
  if(destroyed)return {projected:false,reason:'destroyed'};
  for(const observer of observers.values())observer.disconnect();
  for(const scope of observers.keys())if(!belongs(scope))observers.delete(scope);
  for(const node of tracked)if(!belongs(node)){restore(node);tracked.delete(node);}
  const scopes=[root],textNodes=[],elements=[];let count=0,overflow=false;
  // Discover the complete bounded update before changing any displayed value.
  while(scopes.length&&!overflow){
   const scope=scopes.shift();if(!observers.has(scope)&&Observer)observers.set(scope,new Observer(schedule));
   const walker=document.createTreeWalker(scope,4);
   while(walker.nextNode()){
    if(++count>maxNodes){overflow=true;break;}
    const node=walker.currentNode;if(!node.parentElement?.closest(excluded))textNodes.push(node);
   }
   if(overflow)break;
   for(const node of scope.querySelectorAll('*')){
    if(++count>maxNodes){overflow=true;break;}
    if(!node.closest('script,style,code,pre,[data-private-wording-ignore]'))elements.push(node);
    if(node.shadowRoot&&!node.closest(excluded))scopes.push(node.shadowRoot);
   }
  }
  let active=false;try{active=!overflow&&Boolean(isActive());}catch{}
  const updates=[];
  function prepare(node,name,current,record){
   const canonical=record&&current===record.rendered?record.canonical:current;
   updates.push({node,name,record:{canonical,rendered:active?String(replace(canonical)):canonical}});
  }
  try{
   if(active){
    for(const node of textNodes)prepare(node,null,node.nodeValue,originals.get(node));
    for(const node of elements)for(const name of ['aria-label','aria-description','title','placeholder','alt'])if(node.hasAttribute(name))prepare(node,name,node.getAttribute(name),attributes.get(node)?.get(name));
    active=Boolean(isActive());
   }
  }catch{active=false;}
  if(!active){for(const node of tracked)restore(node);tracked.clear();}
  else for(const {node,name,record}of updates){
   tracked.add(node);
   if(name===null){originals.set(node,record);if(node.nodeValue!==record.rendered)node.nodeValue=record.rendered;}
   else{let records=attributes.get(node);if(!records){records=new Map();attributes.set(node,records);}records.set(name,record);if(node.getAttribute(name)!==record.rendered)node.setAttribute(name,record.rendered);}
  }
  for(const [scope,observer]of observers)if(belongs(scope))observer.observe(scope,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','aria-description','title','placeholder','alt']});
  return {projected:active,reason:overflow?'node-budget':active?'active':'inactive'};
 }
 function destroy(){
  if(destroyed)return;
  for(const observer of observers.values())observer.disconnect();
  for(const node of tracked)restore(node);
  destroyed=true;queued=false;observers.clear();tracked.clear();
 }
 refresh();return{refresh,destroy};
}
