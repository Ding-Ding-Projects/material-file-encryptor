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

/** Adds explicit pointer and keyboard layout controls without moving panel content. */
export function mountPanelLayout(panel,{id,storage,language='en'}={}){
 if(!id)throw new TypeError('A stable panel id is required.');
 const doc=panel.ownerDocument,win=doc.defaultView;
 const original={width:panel.style.width,height:panel.style.height,transform:panel.style.transform,overflow:panel.style.overflow};
 const bounds=()=>({width:Math.max(1,panel.parentElement?.clientWidth||win.innerWidth),height:Math.max(1,win.innerHeight-32)});
 const model=createPanelLayoutModel({storage,key:`mfe.panel-layout.v1:${id}`,bounds});
 const controls=doc.createElement('mfe-panel-layout');const shadow=controls.attachShadow({mode:'open'});
 const sheet=new CSSStyleSheet();sheet.replaceSync(':host{display:block;margin-bottom:8px}.tools{display:flex;gap:8px;flex-wrap:wrap}button{font:inherit;color:inherit;background:transparent;border:1px solid currentColor;border-radius:16px;min-height:36px;padding:6px 12px;cursor:pointer;touch-action:none}button:focus-visible{outline:3px solid var(--md-sys-color-primary);outline-offset:2px}p{font-size:12px;margin:4px 0}');shadow.adoptedStyleSheets=[sheet];
 const bar=doc.createElement('div');bar.className='tools';const help=doc.createElement('p');
 const buttons=['move','resize','reset'].map(kind=>{const button=doc.createElement('button');button.type='button';bar.append(button);return button;});shadow.append(bar,help);panel.prepend(controls);
 let pointer=null;
 const apply=()=>{const state=model.get();if(!state){Object.assign(panel.style,original);return;}panel.style.width=`${state.width}px`;panel.style.height=`${state.height}px`;panel.style.overflow='auto';panel.style.transform=`translate(${state.x}px,${state.y}px)`;};
 const current=()=>model.get()||normalizePanelLayout({width:panel.getBoundingClientRect().width,height:panel.getBoundingClientRect().height},bounds());
 const change=(kind,dx,dy)=>{const state=current();model.change(kind==='move'?{...state,x:state.x+dx,y:state.y+dy}:{...state,width:state.width+dx,height:state.height+dy});apply();};
 function setLanguage(value){language=value;const t=(en,yue)=>language==='yue'?yue:language==='bilingual'?`${en} · ${yue}`:en;[buttons[0].textContent,buttons[1].textContent,buttons[2].textContent]=[t('Move panel','移動面板'),t('Resize panel','調整面板大小'),t('Reset layout','重設版面')];help.textContent=t('Drag the move or resize control, or focus it and use arrow keys. Shift moves by 40 pixels.','拖曳移動或調整大小按鈕，亦可聚焦後按方向鍵。按住 Shift 每次移動 40 像素。');}
 const key=(kind,event)=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta)return;event.preventDefault();const step=event.shiftKey?40:10;change(kind,delta[0]*step,delta[1]*step);};
 for(const [index,kind]of ['move','resize'].entries()){
  buttons[index].addEventListener('keydown',event=>key(kind,event));
  buttons[index].addEventListener('pointerdown',event=>{if(event.button!==0)return;pointer={kind,x:event.clientX,y:event.clientY,id:event.pointerId};buttons[index].setPointerCapture(event.pointerId);event.preventDefault();});
  buttons[index].addEventListener('pointermove',event=>{if(!pointer||pointer.id!==event.pointerId)return;change(pointer.kind,event.clientX-pointer.x,event.clientY-pointer.y);pointer.x=event.clientX;pointer.y=event.clientY;});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])buttons[index].addEventListener(name,()=>{pointer=null;});
 }
 buttons[2].addEventListener('click',()=>{model.reset();apply();});
 const resize=()=>apply();win.addEventListener('resize',resize);setLanguage(language);apply();
 return{model,setLanguage,reset(){model.reset();apply();},destroy(){pointer=null;win.removeEventListener('resize',resize);controls.remove();Object.assign(panel.style,original);}};
}
