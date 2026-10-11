const text=(en,yue)=>({en,yue});
const clamp=(value,min,max)=>Math.min(Math.max(Number(value)||0,min),Math.max(min,max));
export function normalizePanelLayout(value={},bounds={width:1200,height:800}){
 const width=clamp(value.width||bounds.width,Math.min(240,bounds.width),bounds.width);
 const height=clamp(value.height||Math.min(600,bounds.height),Math.min(160,bounds.height),bounds.height);
 return {x:clamp(value.x,0,bounds.width-width),y:clamp(value.y,0,bounds.height-44),width,height};
}
export function createPanelLayoutModel({storage,key,bounds=()=>({width:1200,height:800})}){
 let state=null;try{const raw=storage?.getItem(key);if(raw)state=normalizePanelLayout(JSON.parse(raw),bounds());}catch{}
 const save=()=>{try{if(state)storage?.setItem(key,JSON.stringify(state));else storage?.removeItem(key);}catch{}};
 return{get:()=>state?normalizePanelLayout(state,bounds()):null,change(patch){state=normalizePanelLayout({...state,...patch},bounds());save();return{...state};},reset(){state=null;save();}};
}

/** Layout editing is contextual; ordinary workspace content has no helper strips. */
export function mountPanelLayout(panel,{id,storage,language='en',registerContextActions=()=>()=>{}}={}){
 if(!id)throw new TypeError('A stable panel id is required.');
 if(!panel?.ownerDocument?.defaultView||!panel.style)return{available:false,reason:'Panel element unavailable',model:null,setLanguage(){},reset(){},destroy(){}};
 const win=panel.ownerDocument.defaultView,original={width:panel.style.width,height:panel.style.height,transform:panel.style.transform,overflow:panel.style.overflow};
 const bounds=()=>({width:Math.max(1,panel.parentElement?.clientWidth||win.innerWidth),height:Math.max(1,panel.parentElement?.clientHeight||win.innerHeight-120)});
 const model=createPanelLayoutModel({storage,key:'mfe.panel-layout.v1:'+id,bounds});let mode=null;
 const apply=()=>{const state=model.get();if(!state){Object.assign(panel.style,original);return;}panel.style.width=state.width+'px';panel.style.height=state.height+'px';panel.style.overflow='auto';panel.style.transform='translate('+state.x+'px,'+state.y+'px)';};
 const enter=value=>{mode=value;panel.tabIndex=-1;panel.focus();panel.setAttribute('aria-description',language==='yue'?'使用方向鍵調整，Shift 每次 40 像素，Escape 完成。':'Use arrow keys to adjust, Shift for 40 pixels, Escape to finish.');};
 const key=event=>{if(!mode||event.target!==panel)return;if(event.key==='Escape'){mode=null;panel.removeAttribute('aria-description');return;}const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta)return;event.preventDefault();const state=model.get()||normalizePanelLayout({width:panel.clientWidth,height:panel.clientHeight},bounds()),step=event.shiftKey?40:10;model.change(mode==='move'?{...state,x:state.x+delta[0]*step,y:state.y+delta[1]*step}:{...state,width:state.width+delta[0]*step,height:state.height+delta[1]*step});apply();};
 const actions=()=>[
 {id:'layout-move',label:text('Move panel with keyboard','以鍵盤移動面板'),run:()=>enter('move')},
 {id:'layout-resize',label:text('Resize panel with keyboard','以鍵盤調整面板大小'),run:()=>enter('resize')},
 {id:'layout-reset',label:text('Reset panel layout','重設面板版面'),run:()=>{model.reset();apply();}}
 ];
 const unregister=registerContextActions(panel,({target})=>({target,anchor:target,language,items:actions()}));
 panel.addEventListener('keydown',key);win.addEventListener('resize',apply);apply();
 return{available:true,model,actions,setLanguage(value){language=value;},reset(){model.reset();apply();},destroy(){mode=null;unregister();panel.removeEventListener('keydown',key);win.removeEventListener('resize',apply);Object.assign(panel.style,original);}};
}
