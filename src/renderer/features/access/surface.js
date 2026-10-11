/** Local navigation keeps credential state in its owning panel without rebuilding it. */
export function createAccessNavigation(root,{document,t,onChange=()=>{}}) {
  const tabs=document.createElement('md-tabs');tabs.className='access-tabs';tabs.setAttribute('aria-label',t('access.workflows','Access workflows'));root.append(tabs);
  const panels=new Map();let active='profile';
  function activate(id){if(!panels.has(id))return;const previous=active;active=id;if(previous!==id)onChange(id,previous);for(const [key,{panel,tab}]of panels){panel.hidden=key!==id;tab.active=key===id;tab.setAttribute('aria-selected',String(key===id));tab.tabIndex=key===id?0:-1;}}
  return {element:tabs,add(id,label,panel){const tab=document.createElement('md-primary-tab');tab.id='access-tab-'+id;tab.setAttribute('aria-controls','access-panel-'+id);tab.textContent=label();tab.addEventListener('click',()=>activate(id));tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const keys=[...panels.keys()],at=keys.indexOf(id),next=event.key==='Home'?0:event.key==='End'?keys.length-1:(at+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length;activate(keys[next]);panels.get(keys[next]).tab.focus();});panel.id='access-panel-'+id;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);panels.set(id,{panel,tab,label});tabs.append(tab);activate(active);},activate,refresh(){tabs.setAttribute('aria-label',t('access.workflows','Access workflows'));for(const item of panels.values())item.tab.textContent=item.label();activate(active);},destroy(){tabs.remove();panels.clear();}};
}

/** Each collection owns a complete registered workbench and isolated query state. */
export function createAccessSearch(parent,{document,label,scope,language}) {
  const host=document.createElement('div');host.className='access-search';const search=document.createElement('mfe-search');search.setAttribute('label',label());search.setAttribute('scope',scope);search.language=language();host.append(search);const status=document.createElement('p');status.setAttribute('role','status');host.append(status);parent.append(host);
  let rows=[],generation=0,disposed=false;
  async function apply(){const current=++generation;if(disposed)return;for(const row of rows)row.node.hidden=true;const selected=typeof search.filter==='function'?await search.filter(rows.filter(row=>!row.allowed||row.allowed()).map(({id,text})=>({id,text}))):rows.filter(row=>!row.allowed||row.allowed());if(disposed||current!==generation||selected===null)return;const ids=new Set(selected.map(row=>row.id));for(const row of rows)row.node.hidden=!ids.has(row.id);status.textContent=String(ids.size)+' / '+String(rows.length);host.dataset.resultCount=String(ids.size);}
  const changed=()=>{apply().catch(()=>{if(!disposed){for(const row of rows)row.node.hidden=true;status.textContent='0 / '+String(rows.length);}});};search.addEventListener('search-change',changed);
  return {element:search,setRows(value){rows=value;changed();},refresh(){search.setAttribute('label',label());if(search.language!==language())search.setLanguage?.(language());return apply();},destroy(){disposed=true;generation++;search.removeEventListener('search-change',changed);host.remove();rows=[];}};
}

/** Non-modal panels use their own surface and remain bounded by the current viewport. */
export function anchorAccessPanel(panel,origin) {
  const view=panel.ownerDocument.defaultView;if(!view||!panel.style)return;
  const rect=origin?.getBoundingClientRect?.(),margin=12,width=Math.min(640,view.innerWidth-margin*2);
  const left=rect&&rect.width?Math.min(Math.max(margin,rect.left),view.innerWidth-width-margin):margin;
  const availableBelow=rect&&rect.height?view.innerHeight-rect.bottom-margin:0;
  const top=availableBelow>=240?rect.bottom+8:margin;
  Object.assign(panel.style,{position:'fixed',inset:'auto',left:left+'px',top:top+'px',width:width+'px',maxWidth:'calc(100vw - 24px)',maxHeight:Math.max(120,view.innerHeight-top-margin)+'px',overflow:'auto',zIndex:'1200'});
}
