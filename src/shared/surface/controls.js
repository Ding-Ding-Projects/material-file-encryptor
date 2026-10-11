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
  if(node.dataset)node.dataset.materialPrimitive=node.localName;
  return node;
}
export function control(tag, props = {}, children = [], doc = document) {
  const type=String(props.type||'text').toLowerCase();
  const mapped=tag==='button'?(String(props.class||props.className||'').includes('primary')?'md-filled-button':String(props.class||props.className||'').includes('outlined')?'md-outlined-button':'md-text-button'):
    tag==='input'?({checkbox:'md-checkbox',radio:'md-radio',range:'md-slider',date:'mfe-date-field',time:'mfe-date-field','datetime-local':'mfe-date-field',file:'mfe-file-picker'}[type]||'md-outlined-text-field'):
    tag==='textarea'?'md-outlined-text-field':tag==='select'?'md-outlined-select':tag==='option'?'md-select-option':tag==='dialog'?'mfe-dialog':tag;
  const node=prepareControl(nativeCreate(mapped,doc));
  for(const [key,value] of Object.entries(props)) {
    if(key==='text')node.textContent=value;
    else if(key==='class'||key==='className')node.className=value;
    else if(key.startsWith('on')&&typeof value==='function')node.addEventListener(key.slice(2).toLowerCase(),value);
    else if(key in node)node[key]=value;
    else if(value!==false&&value!==undefined&&value!==null)node.setAttribute(key,value===true?'':value);
  }
  if(tag==='textarea')node.type='textarea';
  if(tag==='input'&&!['checkbox','radio','range','file'].includes(type))node.type=type==='search'?'search':type;
  node.append(...children);
  return node;
}
class PlatformField extends HTMLElement {
  static observedAttributes=['label','aria-label','disabled','required','value','type','min','max','step','accept','multiple'];
  constructor(){super();this.attachShadow({mode:'open'});this.pending={};}
  connectedCallback(){if(this.input)return;const sheet=new CSSStyleSheet();sheet.replaceSync(':host{display:inline-flex;min-width:0;max-width:100%;align-items:center;gap:8px}:host([hidden]){display:none!important}md-outlined-text-field{min-width:0;flex:1}input{position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden}md-outlined-button{min-height:44px}');this.shadowRoot.adoptedStyleSheets=[sheet];this.input=nativeCreate('input');this.input.tabIndex=-1;this.input.type=this.localName==='mfe-file-picker'?'file':this.getAttribute('type')||'date';this.field=nativeCreate('md-outlined-text-field');this.field.readOnly=true;this.button=nativeCreate('md-outlined-button');this.button.addEventListener('click',()=>this.showPicker());this.shadowRoot.append(this.field,this.button,this.input);for(const name of this.constructor.observedAttributes)this.attributeChangedCallback(name,null,this.getAttribute(name));for(const [name,value]of Object.entries(this.pending))this[name]=value;this.pending={};for(const name of ['input','change'])this.input.addEventListener(name,event=>{event.stopPropagation();this.sync();this.dispatchEvent(new Event(name,{bubbles:true,composed:true}));});this.sync();}
  attributeChangedCallback(name,old,value){if(!this.input)return;if(['disabled','required','multiple'].includes(name))this.input[name]=value!==null;else if(value!==null)this.input.setAttribute(name,value);else this.input.removeAttribute(name);this.sync();}
  sync(){if(!this.input)return;const label=this.getAttribute('label')||this.getAttribute('aria-label')||(this.localName==='mfe-file-picker'?'Choose file':'Date or time');this.field.label=label;this.field.value=this.input.type==='file'?[...this.input.files].map(file=>file.name).join(', '):this.input.value;this.field.disabled=this.button.disabled=this.input.disabled;this.button.textContent=this.getAttribute('picker-label')||'Choose';this.button.setAttribute('aria-label',label);}
  get value(){return this.input?.value??this.pending.value??'';} set value(value){if(this.input){this.input.value=value;this.sync();}else this.pending.value=value;}
  get files(){return this.input?.files??[];}
  get disabled(){return this.hasAttribute('disabled');} set disabled(value){this.toggleAttribute('disabled',!!value);}
  get required(){return this.hasAttribute('required');} set required(value){this.toggleAttribute('required',!!value);}
  get type(){return this.getAttribute('type')||'date';} set type(value){this.setAttribute('type',value);}
  get validity(){return this.input?.validity;} get validationMessage(){return this.input?.validationMessage??'';}
  checkValidity(){return this.input?.checkValidity()??true;} reportValidity(){const valid=this.checkValidity();if(!valid){this.field.error=true;this.field.errorText=this.validationMessage;this.focus();}return valid;}
  setCustomValidity(value){this.input?.setCustomValidity(value);} focus(){this.button?.focus();} click(){this.showPicker();}
  showPicker(){if(this.disabled)return;try{this.input.showPicker();}catch{this.input.click();}}
}
class MaterialDialog extends HTMLElement {
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
export function connectSelectSearch(select,{language='en'}={}) {
  let search;const open=()=>{if(search)return;search=nativeCreate('mfe-search');search.language=language;search.setAttribute('label',language==='yue'?'篩選選項':'Filter choices');search.slot='headline';select.prepend(search);search.addEventListener('search-change',async()=>{const options=[...select.querySelectorAll('md-select-option')],rows=await search.filter(options.map((option,id)=>({id:String(id),text:option.textContent})));if(rows)for(const [id,option]of options.entries())option.hidden=!rows.some(row=>row.id===String(id));});};select.addEventListener('opening',open);return()=>{select.removeEventListener('opening',open);search?.remove();};
}
