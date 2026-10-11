/** Retains transient controls while localized component chrome is reconstructed. */
export function captureSurfaceState(root){
 const entries=[];
 function visit(scope,prefix=''){
  [...scope.querySelectorAll('*')].forEach((node,index)=>{
   const key=`${prefix}/${index}:${node.localName}`;
   const state={key};
   for(const name of ['value','checked','selected','query','regex','flags','hidden','open','scrollTop','scrollLeft'])if(name in node&&['string','number','boolean'].includes(typeof node[name]))state[name]=node[name];
   if(typeof node.selectionStart==='number'){state.selectionStart=node.selectionStart;state.selectionEnd=node.selectionEnd;}
   state.focused=node===node.getRootNode().activeElement;
   entries.push(state);if(node.shadowRoot)visit(node.shadowRoot,key);
  });
 }
 visit(root);return entries;
}
export function restoreSurfaceState(root,entries){
 const saved=new Map(entries.map(entry=>[entry.key,entry]));
 function visit(scope,prefix=''){
  [...scope.querySelectorAll('*')].forEach((node,index)=>{
   const key=`${prefix}/${index}:${node.localName}`,state=saved.get(key);
   if(state){
    for(const name of ['query','regex','flags'])if(name in state&&name in node)node[name]=state[name];
    if('query'in state&&typeof node.render==='function')node.render();
    for(const name of ['value','checked','selected','hidden','scrollTop','scrollLeft'])if(name in state&&name in node)try{node[name]=state[name];}catch{}
    if(state.open&&node.localName==='md-dialog'&&!node.open)node.show();
    if(typeof state.selectionStart==='number'&&typeof node.setSelectionRange==='function')try{node.setSelectionRange(state.selectionStart,state.selectionEnd);}catch{}
    if(state.focused)node.focus?.({preventScroll:true});
   }
   if(node.shadowRoot)visit(node.shadowRoot,key);
  });
 }
 visit(root);
}
