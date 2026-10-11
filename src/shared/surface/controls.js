/** Material Web 2.5.0 controls, with explicit compatibility at the host boundary. */
const nativeCreate = (tag, doc = document) => doc.createElement(tag);
const define = (tag, Type) => { if (globalThis.customElements && !customElements.get(tag)) customElements.define(tag, Type); };
export const CONTROL_PROVENANCE = Object.freeze({
  button: '@material/web/button', input: '@material/web/textfield', select: '@material/web/select',
  checkbox: '@material/web/checkbox', radio: '@material/web/radio', range: '@material/web/slider',
  'mfe-date-field': 'Material outlined field, icon button and platform date/time picker composition',
  'mfe-file-picker': 'Material outlined button and private platform file chooser composition',
  'mfe-dialog': '@material/web/dialog with slotted form lifecycle'
});
export const CONTROL_SELECTOR = 'md-filled-button,md-filled-tonal-button,md-outlined-button,md-text-button,md-icon-button,md-outlined-text-field,md-outlined-select,md-checkbox,md-radio,md-switch,md-slider,mfe-date-field,mfe-file-picker';
export function controlKind(node){const tag=String(node.localName||node.tagName||'').toLowerCase();if(tag==='md-outlined-select'||tag==='select')return 'select';if(tag==='md-switch')return 'switch';if(tag==='md-checkbox')return 'checkbox';if(tag==='md-radio')return 'radio';if(tag==='md-slider')return 'range';if(tag==='button'||/^md-.*button$/.test(tag))return 'button';if(tag==='mfe-file-picker')return 'file';return node.type||'text';}
function alias(node, name, target) { if (!(name in node)) Object.defineProperty(node,name,{configurable:true,get(){return this[target];},set(value){this[target]=value;}}); }
export function prepareControl(node) {
  if (node.localName === 'md-switch') alias(node,'checked','selected');
  if (node.localName === 'md-outlined-select') {
    if (!('options' in node)) Object.defineProperty(node,'options',{get(){return [...this.querySelectorAll('md-select-option')];}});
    if (!('selectedIndex' in node)) Object.defineProperty(node,'selectedIndex',{get(){return this.options.findIndex(option=>option.value===this.value);},set(index){this.value=this.options[index]?.value??'';}});
  }
  if (node.localName === 'md-outlined-text-field') {
    for (const name of ['selectionStart','selectionEnd']) if (!(name in node)) Object.defineProperty(node,name,{get(){return this.shadowRoot?.querySelector('input,textarea')?.[name]??0;},set(value){const input=this.shadowRoot?.querySelector('input,textarea');if(input)input[name]=value;}});
    if (!node.setSelectionRange) node.setSelectionRange=(...args)=>node.shadowRoot?.querySelector('input,textarea')?.setSelectionRange(...args);
  }
  if(node.localName==='md-outlined-text-field')queueMicrotask(()=>{if(node.isConnected)connectFieldClear(node);});
  if(node.dataset)node.dataset.materialPrimitive=node.localName;
  return node;
}
export function control(tag, props = {}, children = [], doc = document) {
  const type=String(props.type||'text').toLowerCase();
  const mapped=tag==='button'?(String(props.class||props.className||'').includes('primary')?'md-filled-button':String(props.class||props.className||'').includes('outlined')?'md-outlined-button':'md-text-button'):
    tag==='input'?({checkbox:'md-checkbox',radio:'md-radio',range:'md-slider',date:'mfe-date-field',time:'mfe-date-field','datetime-local':'mfe-date-field',file:'mfe-file-picker'}[type]||'md-outlined-text-field'):
    tag==='textarea'?'md-outlined-text-field':tag==='select'?'md-outlined-select':tag==='option'?'md-select-option':tag==='dialog'?'mfe-dialog':tag;
  const node=prepareControl(nativeCreate(mapped,doc));
  if((tag==='button'||/^md-.*button$/.test(mapped))&&!Object.hasOwn(props,'type'))node.type='button';
  for(const [key,value] of Object.entries(props)) {
    if(key==='text')node.textContent=value;
    else if(key==='class'||key==='className')node.className=value;
    else if(key.startsWith('on')&&typeof value==='function')node.addEventListener(key.slice(2).toLowerCase(),value);
    else if(key in node)node[key]=value;
    else if(value!==false&&value!==undefined&&value!==null)node.setAttribute(key,value===true?'':value);
  }
  if(tag==='option'&&children.length===0&&props.text!==undefined){node.textContent='';const headline=doc.createElement('span');headline.slot='headline';headline.textContent=props.text;node.append(headline);}
  if(tag==='textarea')node.type='textarea';
  if(tag==='input'&&!['checkbox','radio','range','file'].includes(type))node.type=type==='search'?'search':type;
  if(tag==='option'&&children.length){const headline=doc.createElement('span');headline.slot='headline';headline.append(...children);node.append(headline);}else node.append(...children);
  if(mapped==='md-outlined-select')queueMicrotask(()=>{if(node.isConnected)connectSelectSearch(node);});
  return node;
}
class PlatformField extends (globalThis.HTMLElement||class{}) {
  static observedAttributes=['label','aria-label','disabled','required','value','type','min','max','step','accept','multiple','readonly','picker-label'];
  constructor(){super();this.attachShadow({mode:'open'});this.pending={};}
  connectedCallback(){if(this.input)return;const sheet=new CSSStyleSheet();sheet.replaceSync(':host{display:inline-flex;min-width:0;max-width:100%;align-items:center;gap:8px}:host([hidden]){display:none!important}md-outlined-text-field{min-width:0;flex:1}input{position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden}md-outlined-button{min-height:44px}');this.shadowRoot.adoptedStyleSheets=[sheet];this.input=nativeCreate('input');this.input.tabIndex=-1;this.input.type=this.localName==='mfe-file-picker'?'file':this.getAttribute('type')||'date';this.field=nativeCreate('md-outlined-text-field');this.field.readOnly=true;this.button=nativeCreate('md-outlined-button');this.button.type='button';this.button.addEventListener('click',()=>this.showPicker());this.shadowRoot.append(this.field,this.button,this.input);for(const name of this.constructor.observedAttributes)this.attributeChangedCallback(name,null,this.getAttribute(name));for(const [name,value]of Object.entries(this.pending))this[name]=value;this.pending={};if(this.customValidity)this.input.setCustomValidity(this.customValidity);for(const name of ['input','change'])this.input.addEventListener(name,event=>{event.stopPropagation();this.sync();this.dispatchEvent(new Event(name,{bubbles:true,composed:true}));});this.sync();}
  attributeChangedCallback(name,old,value){if(!this.input)return;if(name==='type')this.input.type=this.type;else if(['disabled','required','multiple'].includes(name))this.input[name]=value!==null;else if(value!==null)this.input.setAttribute(name,value);else this.input.removeAttribute(name);this.sync();}
  sync(){if(!this.input)return;const label=this.getAttribute('label')||this.getAttribute('aria-label')||(this.localName==='mfe-file-picker'?'Choose file':'Date or time');this.field.label=label;this.field.value=this.input.type==='file'?[...this.input.files].map(file=>file.name).join(', '):this.input.value;this.field.disabled=this.button.disabled=this.input.disabled;this.button.textContent=this.getAttribute('picker-label')||'Choose';this.button.setAttribute('aria-label',label);}
  get value(){return this.input?.value??this.pending.value??'';} set value(value){if(this.input){this.input.value=value;this.sync();}else this.pending.value=value;}
  get files(){return this.input?.files??[];}
  get disabled(){return this.hasAttribute('disabled');} set disabled(value){this.toggleAttribute('disabled',!!value);}
  get required(){return this.hasAttribute('required');} set required(value){this.toggleAttribute('required',!!value);}
  get type(){return this.localName==='mfe-file-picker'?'file':this.getAttribute('type')||'date';} set type(value){this.setAttribute('type',value);}
  get validity(){return this.input?.validity;} get validationMessage(){return this.input?.validationMessage??'';}
  checkValidity(){return this.input?.checkValidity()??true;} reportValidity(){const valid=this.checkValidity();if(!valid){this.field.error=true;this.field.errorText=this.validationMessage;this.focus();}return valid;}
  setCustomValidity(value){this.customValidity=String(value);this.input?.setCustomValidity(this.customValidity);} focus(){this.button?.focus();} click(){this.showPicker();}
  showPicker(){if(this.disabled)return;try{this.input.showPicker();}catch{this.input.click();}}
}
for(const key of ['accept','min','max','step','label','picker-label'])Object.defineProperty(PlatformField.prototype,key,{get(){return this.getAttribute(key)||'';},set(value){if(value===undefined||value===null)this.removeAttribute(key);else this.setAttribute(key,String(value));}});
for(const key of ['multiple','readOnly'])Object.defineProperty(PlatformField.prototype,key,{get(){return this.hasAttribute(key.toLowerCase());},set(value){this.toggleAttribute(key.toLowerCase(),!!value);if(this.input)this.input[key]=!!value;}});
class MaterialDialog extends (globalThis.HTMLElement||class{}) {
  constructor(){super();this.attachShadow({mode:'open'});this.dialog=nativeCreate('md-dialog');this.dialog.append(nativeCreate('slot'));this.dialog.firstChild.slot='content';const sheet=new CSSStyleSheet();sheet.replaceSync('md-dialog{max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);--md-dialog-container-shape:28px;--md-dialog-container-color:var(--md-sys-color-surface)}');this.shadowRoot.adoptedStyleSheets=[sheet];this.shadowRoot.append(this.dialog);this.returnValue='';this.dialog.addEventListener('closed',()=>{this.removeAttribute('open');this.dispatchEvent(new Event('close'));});this.dialog.addEventListener('cancel',event=>{const cancel=new Event('cancel',{cancelable:true});if(!this.dispatchEvent(cancel))event.preventDefault();});this.addEventListener('submit',event=>{if(event.target?.getAttribute('method')==='dialog'){event.preventDefault();this.close(event.submitter?.value||'');}});}
  get open(){return this.hasAttribute('open');} showModal(){this.setAttribute('open','');this.dialog.open=true;} show(){this.showModal();} close(value=this.returnValue){this.returnValue=value;this.dialog.close();}
}
define('mfe-date-field',class extends PlatformField{});define('mfe-file-picker',class extends PlatformField{});define('mfe-dialog',MaterialDialog);
/** Explicit migration before host listeners are bound; never monkey-patches DOM constructors. */
export function upgradeControls(root) {
  for(const old of [...root.querySelectorAll('button,input,textarea,select,dialog')]) {
    if(!old.isConnected||old.closest('[data-native-internal]'))continue;
    const props=Object.fromEntries([...old.attributes].map(a=>[a.name,a.value]));
    if(old.localName==='input'){props.type=old.type;props.value=old.value;props.checked=old.checked;}
    if(old.localName==='textarea')props.value=old.value;
    for(const key of ['disabled','required','multiple','readOnly'])if(key in old)props[key]=old[key];
    if(old.localName==='select'){props.value=old.value;for(const option of [...old.options]){const next=control('option',{value:option.value,text:option.textContent,selected:option.selected,disabled:option.disabled});for(const a of option.attributes)if(a.name.startsWith('data-'))next.setAttribute(a.name,a.value);option.replaceWith(next);}}
    const label=root.querySelector('label[for="'+old.id+'"]');if(label&&!props.label)props.label=label.textContent.trim();
    const next=control(old.localName,props,[...old.childNodes],old.ownerDocument);old.replaceWith(next);
    if(next.localName==='md-outlined-select')next.value=props.value;
  }
}
const fieldClearOwners=new WeakSet();
function connectFieldClear(field){if(fieldClearOwners.has(field)||field.readOnly||field.querySelector('[slot="trailing-icon"]'))return;fieldClearOwners.add(field);const button=field.ownerDocument.createElement('md-icon-button');button.type='button';button.slot='trailing-icon';button.textContent='×';const refresh=()=>{const label=field.label||field.getAttribute('aria-label')||'Text field';button.setAttribute('aria-label',((field.ownerDocument.documentElement.lang||'').startsWith('zh')?'清除欄位：':'Clear field: ')+label);button.disabled=!!(field.disabled||field.readOnly);};refresh();button.addEventListener('pointerdown',refresh);field.addEventListener('focusin',refresh);button.addEventListener('click',()=>{if(field.disabled||field.readOnly||!requestControlAdmission(field))return;field.value='';field.setCustomValidity?.('');field.dispatchEvent(new Event('input',{bubbles:true,composed:true}));field.dispatchEvent(new Event('change',{bubbles:true,composed:true}));field.focus();});field.append(button);}
export function requestControlAdmission(target){return target.dispatchEvent(new CustomEvent('mfe-action-request',{bubbles:true,composed:true,cancelable:true,detail:{target}}));}
const selectSearchOwners=new WeakMap();
/** Adjacent choice search uses the shared menu and its full regex workbench. */
export function connectSelectSearch(select,{language='en'}={}) {
  if(selectSearchOwners.has(select))return selectSearchOwners.get(select);
  if(!select.parentNode)return()=>{};
  const button=select.ownerDocument.createElement('md-icon-button');button.type='button';button.setAttribute('data-choice-search','');button.textContent='⌕';const label=select.label||select.getAttribute('aria-label')||'Choices';button.setAttribute('aria-label',(language==='yue'?'搜尋選項：':'Search choices: ')+label);button.title=button.getAttribute('aria-label');button.disabled=!!select.disabled;button.hidden=!!select.hidden;
  const observer=typeof MutationObserver==='undefined'?null:new MutationObserver(()=>{button.disabled=!!select.disabled;button.hidden=!!select.hidden;});observer?.observe(select,{attributes:true,attributeFilter:['disabled','hidden']});
  const open=async event=>{if(select.disabled||!requestControlAdmission(select))return;const {openContextMenu}=await import('./overlay.js');if(!select.isConnected)return;const options=[...select.querySelectorAll('md-select-option')];openContextMenu({anchor:button,event,target:select,language,items:options.map(option=>({id:option.value,label:option.textContent,disabled:option.disabled,run:()=>{if(select.disabled||!select.isConnected||option.disabled||!requestControlAdmission(select))return;select.value=option.value;select.dispatchEvent(new Event('input',{bubbles:true,composed:true}));select.dispatchEvent(new Event('change',{bubbles:true,composed:true}));select.focus();}}))});};
  button.addEventListener('click',open);select.after(button);const dispose=()=>{observer?.disconnect();button.removeEventListener('click',open);button.remove();selectSearchOwners.delete(select);};selectSearchOwners.set(select,dispose);return dispose;
}
if(typeof document!=='undefined'&&typeof MutationObserver!=='undefined'){
  const mount=()=>{if(!document.body)return;const scan=node=>{if(node.localName==='md-outlined-select')connectSelectSearch(node);if(node.localName==='md-outlined-text-field')connectFieldClear(node);for(const select of node.querySelectorAll?.('md-outlined-select')||[])connectSelectSearch(select);for(const field of node.querySelectorAll?.('md-outlined-text-field')||[])connectFieldClear(field);};scan(document.body);const observer=new MutationObserver(records=>{for(const record of records){for(const node of record.addedNodes)if(node.nodeType===1)scan(node);for(const node of record.removedNodes)if(node.nodeType===1&&!node.isConnected){if(node.localName==='md-outlined-select')selectSearchOwners.get(node)?.();for(const select of node.querySelectorAll?.('md-outlined-select')||[])selectSearchOwners.get(select)?.();}};});observer.observe(document.body,{subtree:true,childList:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else queueMicrotask(mount);
}
