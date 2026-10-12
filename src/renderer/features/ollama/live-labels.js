/** Update presentation nodes without rebuilding controls or their user state. */
export function createLiveLabels(root,translate){
 const textBindings=new Map(),attributeBindings=new Map();
 const owned=node=>{for(let current=node;current;current=current.parentNode)if(current===root)return true;return false;};
 const value=source=>translate(typeof source==='function'?source():source);
 function text(target,source){const node=target.ownerDocument.createTextNode(value(source));target.append(node);textBindings.set(node,source);return node;}
 function attribute(target,name,source){let bindings=attributeBindings.get(target);if(!bindings){bindings=new Map();attributeBindings.set(target,bindings);}bindings.set(name,source);apply(target,name,value(source));}
 function apply(target,name,next){target.setAttribute(name,next);if(name==='label')target.label=next;}
 function prune(){for(const node of textBindings.keys())if(!owned(node))textBindings.delete(node);for(const target of attributeBindings.keys())if(!owned(target))attributeBindings.delete(target);}
 function refresh(){
  for(const [node,source]of textBindings){if(owned(node))node.nodeValue=value(source);else textBindings.delete(node);}
  for(const [target,bindings]of attributeBindings){if(!owned(target)){attributeBindings.delete(target);continue;}for(const [name,source]of bindings)apply(target,name,value(source));}
 }
 return{text,attribute,refresh,prune,destroy(){textBindings.clear();attributeBindings.clear();}};
}
