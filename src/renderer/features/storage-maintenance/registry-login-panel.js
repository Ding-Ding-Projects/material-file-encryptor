import {element} from '../../../shared/surface/registry.js';
import {REGISTRY_ACTIVATION_URL,REGISTRY_LOGIN_METHODS,REGISTRY_LOGIN_ACTIVE,registryLoginSnapshot} from './registry-login-model.js';

export class RegistryLoginPanel {
 constructor({translate=value=>value,clipboard=()=>globalThis.navigator?.clipboard,now=Date.now,onSignedIn=()=>{}}={}) {
  this.t=translate;this.clipboard=clipboard;this.now=now;this.onSignedIn=onSignedIn;this.services={};this.value=null;this.generation=0;this.codeGeneration=0;this.pending=null;this.timer=null;this.expiryTimer=null;this.disposed=false;this.owned=false;this.notice='';
  this.heading=element('h3');this.introduction=element('p');this.steps=[element('li'),element('li'),element('li')];
  this.status=element('p',{role:'status','aria-live':'polite'});this.detail=element('p');
  this.codeLabel=element('span');this.code=element('output',{id:'registry-device-code',tabIndex:0,'data-sensitive':'registry-login-device-code',style:'font-family:monospace;user-select:text;overflow-wrap:anywhere'});
  this.expiry=element('p');this.link=element('a',{href:REGISTRY_ACTIVATION_URL,rel:'noopener noreferrer'});
  this.link.addEventListener('click',event=>{event.preventDefault();void this.open();});
  this.codeBlock=element('div',{class:'registry-login-code'},[this.codeLabel,this.code,this.link,this.expiry]);
  this.buttons={};for(const key of ['start','refresh','copy','open','cancel']){const node=element(key==='start'?'md-filled-button':'md-outlined-button',{type:'button'});node.addEventListener('click',()=>{if(!node.disabled)void this[key]();});this.buttons[key]=node;}
  this.root=element('div',{class:'registry-signin'},[this.heading,this.introduction,element('ol',{},this.steps),this.status,this.detail,this.codeBlock,element('div',{class:'actions'},Object.values(this.buttons))]);this.render();
 }
 available(){return REGISTRY_LOGIN_METHODS.every(name=>typeof this.services[name]==='function');}
 configure(services){this.services=services;void this.refresh();return this;}
 active(){return REGISTRY_LOGIN_ACTIVE.includes(this.value?.state);}
 clearCode(){this.codeGeneration++;this.value=this.value?{...this.value,deviceCode:null,canOpenPage:false,expiresAt:null}:null;this.code.textContent='';clearTimeout(this.expiryTimer);this.expiryTimer=null;}
 accept(raw){
  const previous=this.value?.state;this.clearCode();this.value=registryLoginSnapshot(raw,this.now());
  if(this.value.state==='authorizing'){
   const generation=this.codeGeneration,remaining=Date.parse(this.value.expiresAt)-this.now();
   this.expiryTimer=setTimeout(()=>{if(this.disposed||generation!==this.codeGeneration)return;this.clearCode();this.value={state:'expired',deviceCode:null,canOpenPage:false,expiresAt:null};this.owned=false;this.render();},Math.max(0,remaining));
  }
  if(!this.active())this.owned=false;
  if(this.value.state==='signed-in'&&previous!=='signed-in')this.onSignedIn();
 }
 schedule(){clearTimeout(this.timer);this.timer=null;if(!this.disposed&&this.active()&&!this.pending)this.timer=setTimeout(()=>{this.timer=null;void this.refresh();},1000);}
 async request(method,kind){
  if(this.disposed||!this.available()||this.pending&&kind!=='cancel')return;
  const generation=++this.generation;this.pending=kind;this.notice='';clearTimeout(this.timer);this.timer=null;
  if(kind==='start'||kind==='cancel')this.clearCode();this.render();
  try{const result=await this.services[method]();if(this.disposed||generation!==this.generation)return;this.accept(result);}
  catch{if(!this.disposed&&generation===this.generation){this.clearCode();this.value={state:'unavailable',deviceCode:null,canOpenPage:false,expiresAt:null};this.notice='loginUnavailable';}}
  finally{if(!this.disposed&&generation===this.generation){this.pending=null;this.render();this.schedule();}}
 }
 async start(){if(this.pending||this.active())return;this.owned=true;await this.request('startRegistryLogin','start');}
 async refresh(){await this.request('registryLoginStatus','refresh');}
 async cancel(){if(!this.active()&&this.pending!=='start'&&!this.owned)return;await this.request('cancelRegistryLogin','cancel');}
 async open(){
  if(this.disposed||!this.value?.canOpenPage||this.value.state!=='authorizing')return;
  if(Date.parse(this.value.expiresAt)<=this.now()){this.clearCode();this.value={state:'expired',deviceCode:null,canOpenPage:false,expiresAt:null};this.render();return;}
  try{await this.services.openRegistryLoginPage();}catch{if(!this.disposed){this.notice='loginOpenUnavailable';this.render();}}
 }
 async copy(){
  if(this.disposed||this.value?.state!=='authorizing'||!this.value.deviceCode)return;
  if(Date.parse(this.value.expiresAt)<=this.now()){this.clearCode();this.value={state:'expired',deviceCode:null,canOpenPage:false,expiresAt:null};this.render();return;}
  const generation=this.generation;
  try{const clipboard=this.clipboard();if(typeof clipboard?.writeText!=='function')throw Error();await clipboard.writeText(this.value.deviceCode);if(!this.disposed&&generation===this.generation)this.notice='loginCopied';}
  catch{if(!this.disposed&&generation===this.generation)this.notice='loginCopyUnavailable';}
  if(!this.disposed)this.render();
 }
 render(){
  const available=this.available(),state=this.value?.state||'idle',active=this.active(),hasCode=state==='authorizing'&&Boolean(this.value?.deviceCode);
  this.heading.textContent=this.t('loginTitle');this.introduction.textContent=this.t('loginIntroduction');this.steps.forEach((node,index)=>{node.textContent=this.t('loginStep'+(index+1));});
  this.status.textContent=this.t(!available?'loginUnavailable':this.pending==='start'?'login-checking':this.pending==='cancel'?'loginCancelling':'login-'+state);
  this.detail.textContent=this.notice?this.t(this.notice):this.t('loginPrivacy');
  this.codeBlock.hidden=!hasCode;this.codeLabel.textContent=this.t('loginCode');this.code.setAttribute('aria-label',this.t('loginCode'));this.code.textContent=hasCode?this.value.deviceCode:'';
  this.link.textContent=REGISTRY_ACTIVATION_URL;this.link.setAttribute('aria-label',this.t('loginOpen'));this.link.setAttribute('aria-disabled',String(!this.value?.canOpenPage));this.link.tabIndex=this.value?.canOpenPage?0:-1;
  this.expiry.textContent=hasCode?`${this.t('loginExpires')} ${new Date(this.value.expiresAt).toLocaleTimeString()}`:'';
  for(const key of Object.keys(this.buttons))this.buttons[key].textContent=this.t(key==='start'&&['failed','expired','cancelled','unavailable'].includes(state)?'loginRetry':'login'+key[0].toUpperCase()+key.slice(1));
  this.buttons.start.disabled=!available||Boolean(this.pending)||active||state==='signed-in';this.buttons.refresh.disabled=!available||Boolean(this.pending);
  this.buttons.copy.disabled=!hasCode;this.buttons.open.disabled=!hasCode||!this.value?.canOpenPage;this.buttons.cancel.disabled=!available||this.pending==='cancel'||!active&&this.pending!=='start'&&!this.owned;
 }
 destroy(){
  const cancelOwned=this.owned;this.disposed=true;this.generation++;clearTimeout(this.timer);clearTimeout(this.expiryTimer);this.timer=this.expiryTimer=null;this.clearCode();this.value=null;
  if(cancelOwned&&typeof this.services.cancelRegistryLogin==='function')Promise.resolve(this.services.cancelRegistryLogin()).catch(()=>{});
  this.root.remove();
 }
}
