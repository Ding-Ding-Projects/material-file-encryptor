import {requestControlAdmission} from './controls.js';
import { SurfaceElement, element, register, localized } from './registry.js';
import './search.js';
import {placeMenu,menuCorner} from './menu-placement.js';
import {icon as menuIcon} from '../../renderer/icons.js';
// Per-event action ownership is private metadata, not a mutable provider item field.
const actionTargets=new WeakMap();
export function bindContextActionTarget(item,target){const bound={...item};actionTargets.set(bound,target);return bound;}
/** One Material menu. The host is transparent plumbing, never a second dialog. */
export class ContextMenu extends SurfaceElement {
  constructor(){super();this.epoch=0;this.controller=null;}
  connectedCallback(){this.hidden=true;this.render();}
  disconnectedCallback(){this.close('teardown',{restoreFocus:false});}
  render(){
    this.style(':host{position:fixed;inset:0;margin:0;padding:0;border:0;background:transparent;width:auto;height:auto;z-index:10000;pointer-events:none}:host([hidden]){display:none!important}.point{position:fixed;width:1px;height:1px;pointer-events:none}md-menu{pointer-events:auto;max-width:min(440px,calc(100vw - 24px));--md-menu-container-color:var(--md-sys-color-surface-container-high,var(--md-sys-color-surface-container));--md-menu-container-shape:12px}mfe-search{display:block;box-sizing:border-box;position:sticky;inset-block-start:0;z-index:1;padding:8px 12px;width:min(400px,calc(100vw - 32px));background:var(--md-sys-color-surface-container-high,var(--md-sys-color-surface-container,#fff))}md-menu-item{max-width:420px}.empty{padding:12px 16px}.shortcut{margin-inline-start:20px;font-weight:500;color:var(--md-sys-color-on-surface-variant)}.header{display:flex;align-items:center;gap:12px;padding:8px 20px 12px;margin-bottom:8px;border-bottom:1px solid var(--md-sys-color-outline-variant);min-width:240px}.header-icon{flex:0 0 auto;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container)}.header-icon svg,.item-icon{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.header-text{min-width:0}.header-title{font-size:16px;line-height:24px;font-weight:500;color:var(--md-sys-color-on-surface);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.header-sub{font-size:12px;line-height:16px;color:var(--md-sys-color-on-surface-variant)}.divider{height:1px;margin:8px 0;background:var(--md-sys-color-outline-variant)}.item-icon{color:var(--md-sys-color-on-surface-variant)}md-menu-item.danger{--md-menu-item-label-text-color:var(--md-sys-color-error);--md-menu-item-leading-icon-color:var(--md-sys-color-error);--md-menu-item-trailing-supporting-text-color:var(--md-sys-color-error)}md-menu-item.danger .item-icon,md-menu-item.danger .shortcut{color:var(--md-sys-color-error)}md-menu{--md-menu-item-one-line-container-height:48px;--md-menu-item-top-space:0;--md-menu-item-bottom-space:0;--md-menu-item-leading-space:12px;--md-menu-item-trailing-space:12px;--md-menu-item-hover-state-layer-color:var(--md-sys-color-on-surface);--md-menu-item-focus-state-layer-color:var(--md-sys-color-on-surface);--md-menu-item-hover-state-layer-opacity:.08;--md-menu-item-focus-state-layer-opacity:.12;--md-menu-container-shape:16px;--md-menu-container-shadow-color:var(--md-sys-color-shadow,#000);--md-menu-container-color:var(--md-sys-color-surface-container,var(--md-sys-color-surface-container-high))}@keyframes menu-pop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}md-menu[open]{animation:menu-pop 200ms cubic-bezier(.05,.7,.1,1) both}@media (prefers-reduced-motion:reduce){md-menu[open]{animation:none}}');
    this.point=element('span',{class:'point','aria-hidden':'true'});this.menu=element('md-menu',{positioning:'fixed',quick:true,'aria-label':this.t('Context actions','操作選單')});
    this.menu.noNavigationWrap=false;this.menu.typeaheadActive=false;this.menu.stayOpenOnOutsideClick=true;this.menu.stayOpenOnFocusout=true;
    this.search=element('mfe-search',{label:this.t('Filter actions','篩選操作')});this.search.language=this.language;this.search.setAttribute('data-menu-search','');
    this.itemsHost=this.menu;this.menu.append(this.search);this.shadowRoot.append(this.point,this.menu);
    this.search.addEventListener('search-change',()=>this.renderItems());this.search.addEventListener('keydown',event=>event.stopPropagation());
    const ownedMenu=this.menu;this.menu.addEventListener('closed',()=>{if(this.hidden||this.menu!==ownedMenu||this.menu.open)return;this.close('dismiss');});
  }
  open({items=[],anchor,event,target,language='en',align='start',header,onClose,onError}={}) {
    this.close('replace',{restoreFocus:false});this.language=language;this.render();this.items=items.slice();this.header=header||null;this.target=target||anchor||event?.composedPath?.().find(node=>node instanceof Element);this.anchor=anchor||this.target;this.returnFocus=this.ownerDocument.activeElement;this.onClose=onClose;this.onError=onError;this.hidden=false;this.setAttribute('popover','manual');this.showPopover?.();const epoch=++this.epoch;
    const rect=this.anchor?.getBoundingClientRect?.();const pointer=event&&event.type==='contextmenu'&&(event.clientX||event.clientY);
    const anchorRect=pointer?{left:event.clientX,right:event.clientX,top:event.clientY,bottom:event.clientY}:rect?{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}:{left:12,right:12,top:12,bottom:12};
    const placement=placeMenu(anchorRect,{width:innerWidth,height:innerHeight},{align:pointer?'start':align,gap:pointer?0:undefined});this.placement=placement;
    this.point.style.left=placement.x+'px';this.point.style.top=placement.y+'px';
    if(this.menu.style){this.menu.style.maxHeight=placement.maxHeight+'px';this.menu.style.maxWidth=placement.maxWidth+'px';}
    this.menu.anchorCorner='start-start';this.menu.menuCorner=menuCorner(placement);this.menu.anchorElement=this.point;
    this.controller=new AbortController();const options={capture:true,signal:this.controller.signal};
    this.ownerDocument.addEventListener('pointerdown',e=>{if(!e.composedPath().includes(this))this.close('outside');},options);
    this.ownerDocument.addEventListener('keydown',e=>this.handleKey(e),options);
    this.ownerDocument.addEventListener('focusin',e=>{if(!e.composedPath().includes(this))this.close('focusout',{restoreFocus:false});},options);
    this.ownerDocument.defaultView.addEventListener('resize',()=>this.close('resize'),{signal:this.controller.signal});
    this.observer=new MutationObserver(()=>{if(this.target instanceof Element&&!this.target.isConnected)this.close('target-removed',{restoreFocus:false});});this.observer.observe(this.ownerDocument,{subtree:true,childList:true});
    this.renderItems().then(()=>{if(this.hidden||epoch!==this.epoch)return;this.menu.open=true;this.menu.updateComplete?.then(()=>{if(!this.hidden&&epoch===this.epoch)this.search.input?.focus();});});
  }
  close(reason='dismiss',{restoreFocus=true}={}) {
    const wasOpen=!this.hidden;try{this.hidePopover?.();}catch{}this.hidden=true;this.epoch++;this.controller?.abort();this.controller=null;this.observer?.disconnect();this.observer=null;this.search?.closeBuilder?.();if(this.menu)this.menu.open=false;
    if(wasOpen&&restoreFocus){const focus=this.anchor?.isConnected?this.anchor:this.returnFocus?.isConnected?this.returnFocus:null;focus?.focus?.();}
    if(wasOpen)this.onClose?.(reason);this.onClose=null;
  }
  handleKey(event){
    if(this.hidden)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();this.close('escape');return;}
    const path=event.composedPath();if(!path.includes(this))return;
    if(event.key==='Tab')return;
    const nodes=[...this.itemsHost.querySelectorAll('md-menu-item')].filter(node=>!node.disabled&&!node.hidden);if(!nodes.length)return;
    const active=nodes.findIndex(node=>path.includes(node));const inSearch=path.includes(this.search),searching=inSearch&&path.includes(this.search.input);
    if(inSearch&&!searching)return;
    if(searching&&!['ArrowDown','ArrowUp'].includes(event.key))return;
    let index=active;
    if(event.key==='ArrowDown')index=(active+1)%nodes.length;
    else if(event.key==='ArrowUp')index=active<0?nodes.length-1:(active-1+nodes.length)%nodes.length;
    else if(event.key==='Home')index=0;
    else if(event.key==='End')index=nodes.length-1;
    else if((event.key==='Enter'||event.key===' ')&&active>=0){event.preventDefault();event.stopImmediatePropagation();nodes[active].click();return;}
    else return;
    event.preventDefault();event.stopImmediatePropagation();nodes[index].focus();
  }
  buildHeader({icon:name,title,subtitle}={}){const box=element('div',{class:'header',role:'presentation'});const badge=element('span',{class:'header-icon','aria-hidden':'true'});if(name&&typeof menuIcon==='function')badge.append(menuIcon(name));const text=element('div',{class:'header-text'});text.append(element('div',{class:'header-title',text:String(title??'')}));if(subtitle)text.append(element('div',{class:'header-sub',text:String(subtitle)}));box.append(badge,text);return box;}
  async renderItems(){
    const epoch=this.epoch,items=this.items||[];const list=await this.search.filter(items.map((item,index)=>({id:String(index),text:localized(item.label,this.language)})));if(!list||epoch!==this.epoch)return;
    // Actions on the thing clicked come first. Layout and appearance tools (group "customize") wait behind one Customize
    // row until it is opened; typing to filter still reaches them directly.
    if(this.customizeEpoch!==epoch){this.customizeEpoch=epoch;this.customizeOpen=false;}
    const folded=!this.search?.query&&list.some(row=>items[Number(row.id)]?.group==='customize');
    const rows=folded?[...list.filter(row=>items[Number(row.id)]?.group!=='customize'),{customize:true},...(this.customizeOpen?list.filter(row=>items[Number(row.id)]?.group==='customize'):[])]:list;
    for(const child of [...this.itemsHost.children])if(child!==this.search)child.remove();if(this.header)this.itemsHost.append(this.buildHeader(this.header));let lastSection;for(const row of rows){if(!row.customize){const section=items[Number(row.id)]?.section;if(lastSection!==undefined&&section!==undefined&&section!==lastSection)this.itemsHost.append(element('div',{class:'divider',role:'separator'}));if(section!==undefined)lastSection=section;}if(row.customize){const label=localized(this.customizeOpen?{en:'Customize ▾',yue:'自訂 ▾'}:{en:'Customize ▸',yue:'自訂 ▸'},this.language);const toggle=element('md-menu-item',{keepOpen:true,class:'customize-toggle','aria-label':label,'aria-expanded':String(Boolean(this.customizeOpen))});toggle.append(element('span',{slot:'headline',text:label}));toggle.addEventListener('click',event=>{event.stopPropagation();if(this.hidden||epoch!==this.epoch)return;this.customizeOpen=!this.customizeOpen;void this.renderItems();},{capture:true});this.itemsHost.append(toggle);continue;}const item=items[Number(row.id)],capturedTarget=actionTargets.has(item)?actionTargets.get(item):this.target;const button=element('md-menu-item',{disabled:!!item.disabled,keepOpen:true,'aria-label':row.text});if(item.danger)button.classList.add('danger');if(item.icon){const glyph=menuIcon(item.icon);glyph.setAttribute('class','item-icon');glyph.setAttribute('slot','start');button.append(glyph);}button.append(element('span',{slot:'headline',text:row.text}));if(item.description){const detail=localized(item.description,this.language);button.setAttribute('aria-description',detail);button.append(element('span',{slot:'supporting-text',text:detail}));}if(item.shortcut){button.setAttribute('aria-keyshortcuts',item.shortcut);button.append(element('span',{slot:'end',class:'shortcut','aria-hidden':'true',text:item.shortcut}));}
      button.addEventListener('click',()=>{if(item.disabled||button.disabled||this.hidden||epoch!==this.epoch||!button.isConnected)return;if(capturedTarget instanceof Element&&(!capturedTarget.isConnected||!requestControlAdmission(capturedTarget))){this.close('admission');return;}const onError=this.onError;this.close('selection',{restoreFocus:true});Promise.resolve().then(()=>item.run?.(capturedTarget)).catch(error=>onError?onError(error):this.emit('context-action-error',{error}));},{capture:true});this.itemsHost.append(button);}
    if(!list.length)this.itemsHost.append(element('div',{class:'empty',role:'status',text:this.t('No matching actions','沒有相符操作')}));
  }
}
register('mfe-context-menu',ContextMenu);
