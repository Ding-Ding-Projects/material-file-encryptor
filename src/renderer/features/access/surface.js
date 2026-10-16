import {placeMenu} from '../../../shared/surface/menu-placement.js';

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

/**
 * Pure placement maths for non-modal access panels. It reuses the shared menu placement, then guarantees the
 * panel never leaves the viewport: below the origin when it fits, above when that fits, otherwise pinned to the
 * top inset and scrolling internally.
 * @returns {{left:number,top:number,width:number,maxHeight:number}}
 */
export function placeAccessPanel(originRect, viewport, panelHeight = 0, {margin = 12, maxWidth = 640, gap = 8} = {}) {
  const width = Math.max(0, Math.floor(Math.min(maxWidth, viewport.width - margin * 2)));
  const availableHeight = Math.max(0, Math.floor(viewport.height - margin * 2));
  const wanted = Math.min(panelHeight > 0 ? panelHeight : 320, availableHeight);
  if (!originRect || !(originRect.right - originRect.left > 0 || originRect.bottom - originRect.top > 0)) {
    return {left: margin, top: margin, width, maxHeight: availableHeight};
  }
  const placed = placeMenu(originRect, viewport, {inset: margin, gap, menuWidth: width, comfortHeight: wanted, minHeight: wanted});
  if (placed.maxHeight < wanted) return {left: placed.x, top: margin, width, maxHeight: availableHeight};
  const height = Math.min(wanted, placed.maxHeight);
  const top = placed.flip ? placed.y - height : placed.y;
  return {left: placed.x, top: Math.max(margin, top), width, maxHeight: placed.flip ? height : placed.maxHeight};
}

/**
 * Promote a non-modal panel to the browser top layer. Panels are authored inside the Local access view, whose
 * reveal animation leaves a transform on an ancestor (that ancestor becomes the containing block for fixed
 * positioning) and whose content region scrolls and clips. Without promotion the panel is cropped by that
 * region at the default window size, hiding its action row. The top layer positions against the viewport and
 * ignores ancestor clipping while the panel keeps its place in the DOM for styling, focus order and queries.
 * The panel's own hidden attribute keeps controlling visibility.
 */
export function promoteAccessPanelToTopLayer(panel) {
  if (typeof panel.showPopover !== 'function' || typeof panel.hidePopover !== 'function') return;
  const sync = () => {
    if (panel.isConnected === false) return;
    const open = typeof panel.matches === 'function' && panel.matches(':popover-open');
    try {
      if (panel.hidden) { if (open) panel.hidePopover(); }
      else if (!open) panel.showPopover();
    } catch { /* A panel that cannot enter the top layer stays in flow and scrolls inside its own bounds. */ }
  };
  if (!panel.__accessTopLayer) {
    panel.__accessTopLayer = true;
    panel.setAttribute('popover', 'manual');
    if (typeof MutationObserver === 'function') new MutationObserver(sync).observe(panel, {attributes: true, attributeFilter: ['hidden']});
  }
  sync();
}

/** Non-modal panels use their own surface and remain bounded by the current viewport. */
export function anchorAccessPanel(panel,origin) {
  const view=panel.ownerDocument.defaultView;if(!view||!panel.style)return;
  promoteAccessPanelToTopLayer(panel);
  panel.__accessOrigin=origin;
  const apply=()=>{
    if(panel.isConnected===false||panel.hidden)return;
    const viewport={width:view.innerWidth,height:view.innerHeight},originRect=panel.__accessOrigin?.getBoundingClientRect?.()||null;
    const measure=()=>panel.getBoundingClientRect?.()||{left:0,top:0,height:0};
    const place=height=>{const next=placeAccessPanel(originRect,viewport,height);Object.assign(panel.style,{position:'fixed',inset:'auto',left:next.left+'px',top:next.top+'px',width:next.width+'px',maxWidth:'calc(100vw - 24px)',maxHeight:next.maxHeight+'px',overflow:'auto',zIndex:'1200'});return next;};
    // Measure the panel's natural height first, then place it, then correct for any transformed ancestor
    // that makes fixed positioning relative to something other than the viewport.
    panel.style.maxHeight='none';const natural=measure().height;let next=place(natural);
    const actual=measure();const shiftX=actual.left-next.left,shiftY=actual.top-next.top;
    if(Number.isFinite(shiftX)&&Number.isFinite(shiftY)&&(Math.abs(shiftX)>1||Math.abs(shiftY)>1)){panel.style.left=(next.left-shiftX)+'px';panel.style.top=(next.top-shiftY)+'px';}
  };
  apply();
  if(!panel.__accessPlacementBound){panel.__accessPlacementBound=true;const again=()=>{if(panel.isConnected===false){view.removeEventListener('resize',again);panel.__accessPlacementBound=false;return;}apply();};panel.__accessReplace=apply;view.addEventListener('resize',again);}
  else panel.__accessReplace=apply;
}
