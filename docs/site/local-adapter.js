// Public companion mediation is restricted before any network request.
export const COMPANION_FEATURE_ACTIONS = Object.freeze({
 personalization: Object.freeze(['sharedRead','sharedWrite','verifySharedCredential','setSharedCredential','fetchScheduleSource','listFonts']),
 status: Object.freeze(['status']),
 converter: Object.freeze(['catalog','inspect','enqueue','list','control','pickSources','pickDestination','pickDestinationDirectory']),
 ollama: Object.freeze(['status','catalog','refreshCatalog','models','show','deleteModel','copyModel','generate','hardware','cart','addToCart','removeFromCart','retryPull','startPulls','cancel','sessions','session','renameSession','deleteSession','exportSession','chat','profiles','preflight','launch','snapshots','restore','events','runtimeInstall','runtimeStart','chooseRuntimeExecutable','registerProfile']),
});
export function assertCompanionRequest(action, params) {
 const object=value=>value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
 if(action!=='featureRequest'||!object(params)||Reflect.ownKeys(params).length!==3||Reflect.ownKeys(params).some(key=>!['feature','action','payload'].includes(key))||
    !Object.hasOwn(COMPANION_FEATURE_ACTIONS,params.feature)||!COMPANION_FEATURE_ACTIONS[params.feature].includes(params.action)||
    !object(params.payload)||Reflect.ownKeys(params.payload).some(key=>typeof key!=='string')||new TextEncoder().encode(JSON.stringify(params.payload)).byteLength>262144) throw Error('This documentation workspace supports preferences, status and local tools only. Use the installed application for encrypted-drive operations.');
 if(params.feature==='personalization'&&params.action==='fetchScheduleSource'){
  const payload=params.payload;
  if(Object.keys(payload).some(key=>!['source','id'].includes(key))||!object(payload.source)||(payload.id!==undefined&&(typeof payload.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(payload.id))))throw Error('A schedule source and its stable identifier are required.');
 }
}
// A paired, local-only connection. Credentials are never placed in browser storage.
export function mountLocalAdapter(root, { onAuthenticatedChange = () => {}, translate = value => value } = {}) {
  const document = root.ownerDocument;
  const panel = document.createElement('section');
  panel.className = 'local-adapter';
  const heading = document.createElement('h3'); heading.textContent = translate('Connect your desktop');
  const explanation = document.createElement('p'); explanation.textContent = translate('Start the local adapter in the desktop app, unlock your profile, and enter its address and one-use code. Approve the connection in the desktop app. This connection stays on this computer.');
  const form = document.createElement('form');
  const addressLabel = document.createElement('label'); addressLabel.className = 'local-adapter-field';
  const addressInput = document.createElement('md-outlined-text-field'); addressInput.label = translate('Local desktop address'); addressInput.type = 'url'; addressInput.required = true; addressInput.placeholder = 'http://127.0.0.1:12345'; addressInput.autocomplete = 'off'; addressInput.spellcheck = false;
  addressLabel.append(addressInput);
  const codeLabel = document.createElement('label'); codeLabel.className = 'local-adapter-field';
  const codeInput = document.createElement('md-outlined-text-field'); codeInput.label = translate('One-use pairing code'); codeInput.type = 'password'; codeInput.required = true; codeInput.autocomplete = 'off'; codeInput.spellcheck = false; codeInput.maxLength = 24;
  codeLabel.append(codeInput);
  const connect = document.createElement('md-filled-button'); connect.type = 'submit'; connect.textContent = translate('Pair desktop');
  const disconnect = document.createElement('md-outlined-button'); disconnect.type = 'button'; disconnect.textContent = translate('Disconnect'); disconnect.disabled = true;
  const message = document.createElement('p'); message.setAttribute('role','status'); message.setAttribute('aria-live','polite'); message.textContent = translate('Not connected.');
  form.append(addressLabel,codeLabel,connect,disconnect); panel.append(heading,explanation,form,message); root.append(panel);
  let address = null, token = null, authenticated = false, generation = 0, timer = null, disposed = false;
  const controllers = new Set();
  onAuthenticatedChange(false);
  const notify = next => { if (authenticated !== next) { authenticated = next; onAuthenticatedChange(next); } };
  const clear = text => {
    generation++; token = null; address = null;
    for (const controller of controllers) controller.abort(); controllers.clear();
    clearInterval(timer); timer = null; codeInput.value = ''; disconnect.disabled = true; connect.disabled = false;
    notify(false); if (text) message.textContent = translate(text);
  };
  const post = async (endpoint, payload, target = address, bearer = token) => {
    const controller = new AbortController(); controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(target + endpoint, { method:'POST', mode:'cors', credentials:'omit', cache:'no-store', redirect:'error', referrerPolicy:'no-referrer', headers:{'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`}:{})}, body:JSON.stringify(payload), signal:controller.signal });
      if (!response.ok) throw new Error('Desktop request rejected.');
      const text = await response.text();
      if (text.length > 1024 * 1024) throw new Error('Desktop response too large.');
      return JSON.parse(text);
    } finally { clearTimeout(timeout); controllers.delete(controller); }
  };
  const readStatus = async () => {
    if (!token || !address || disposed) return { authenticated:false };
    const current = generation;
    try {
      const result = await post('/status', {});
      if (current !== generation) return { authenticated:false };
      if (result.authenticated !== true || !Array.isArray(result.actions)) throw new Error('Desktop profile locked.');
      notify(true); return result;
    } catch { if (current === generation) clear('Connection ended. Unlock the desktop and pair again.'); return {authenticated:false}; }
  };
  form.addEventListener('submit', async event => {
    event.preventDefault(); const submittedCode = codeInput.value; clear();
    let target;
    try {
      const parsed = new URL(addressInput.value);
      if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error();
      target = parsed.origin;
      if (!/^[a-f0-9]{24}$/u.test(submittedCode)) throw new Error();
    } catch { message.textContent = translate('Enter the exact local address and current pairing code shown by the desktop.'); return; }
    // Copy once, then clear the sensitive control even if pairing is rejected.
    const code = submittedCode; codeInput.value = '';
    const current = generation; connect.disabled = true; message.textContent = translate('Waiting for desktop approval.');
    try {
      const result = await post('/pair', {code}, target, null);
      if (current !== generation || disposed) return;
      if (typeof result.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(result.token)) throw new Error();
      token = result.token; address = target;
      const status = await readStatus();
      if (current !== generation || !status.authenticated) return;
      disconnect.disabled = false; connect.disabled = false; message.textContent = translate('Connected to the authenticated local desktop.');
      timer = setInterval(() => { void readStatus(); }, 5000);
    } catch { if (current === generation) clear('Pairing failed. Check the desktop address, code and approval, then try again.'); }
  });
  disconnect.addEventListener('click', () => clear('Disconnected.'));
  const onPageHide = () => clear();
  document.defaultView?.addEventListener('pagehide', onPageHide);
  return {
    status: readStatus,
    async featureRequest(action, params = {}) {
      try { assertCompanionRequest(action, params); } catch(error) { throw new Error(translate(error.message)); }
      // Own the reviewed request across the asynchronous session readback.
      const requestParams=JSON.parse(JSON.stringify(params));
      assertCompanionRequest(action,requestParams);
      const requestedGeneration = generation;
      const status = await readStatus();
      if (disposed || requestedGeneration !== generation || !status.authenticated || !status.actions.includes(action)) throw new Error('Connect and unlock the desktop before using this action.');
      const current = generation;
      try { const result = await post('/request', {action,params:requestParams}); if (current !== generation) throw new Error(); return result.result; }
      catch { if (current === generation) clear('Desktop action failed or the profile was locked. Pair again if needed.'); throw new Error('Desktop action could not be completed.'); }
    },
    disconnect: () => clear('Disconnected.'),
    dispose() { disposed = true; clear(); document.defaultView?.removeEventListener('pagehide', onPageHide); panel.remove(); },
  };
}

/** Supported preference bridge. Desktop-only capabilities never cross the browser allowlist. */
export const COMPANION_PREFERENCE_CAPABILITIES=Object.freeze({
 sharedSettings:true,savedScheduleSources:true,installedFontNames:true,
 protectedScheduleCredentials:false,nativeImageNormalization:false,nativeFontMetadata:false,runtimeConfiguration:false,
 accessibilitySupport:Object.freeze({known:false,enabled:false})
});
export function createCompanionPreferences(request) {
 const call=(action,payload={})=>request('personalization',action,payload);
 return {
  // Unknown browser assistive-technology state requires conservative suppression.
  // This admission callback does not claim that a screen reader is detected.
  isScreenReaderActive:()=>!COMPANION_PREFERENCE_CAPABILITIES.accessibilitySupport.known||COMPANION_PREFERENCE_CAPABILITIES.accessibilitySupport.enabled,
  fetchScheduleSource:(source,{id}={})=>call('fetchScheduleSource',{source,id}),
  listFonts:()=>call('listFonts'),
  verifySharedCredential:password=>call('verifySharedCredential',{password}),
  setSharedCredential:password=>call('setSharedCredential',{password}),
 };
}

/** Generation-bound snapshots emulate subscriptions without adding a privileged event route. */
export function createCompanionSharedSettings({request,isConnected=()=>false,onError=()=>{}}) {
 const listeners=new Set();let generation=0,pending=null,last,disposed=false;
 const connected=epoch=>{if(disposed||!isConnected()||epoch!==generation)throw Error('The paired desktop session is unavailable or changed.');};
 const read=async()=>{const epoch=generation;connected(epoch);const value=await request('personalization','sharedRead');connected(epoch);return value;};
 return {
  read,
  async write(value){const epoch=generation;connected(epoch);const result=await request('personalization','sharedWrite',{value});connected(epoch);last=undefined;return result;},
  subscribe(callback){if(disposed)throw Error('Shared settings bridge is disposed.');if(typeof callback!=='function')throw TypeError('A callback is required.');listeners.add(callback);return()=>listeners.delete(callback);},
  invalidate(){generation++;pending=null;last=undefined;},
  async refresh(){
   if(disposed||!isConnected()||pending)return;
   const current=generation,flight={};pending=flight;
   try{
    const value=await read();if(current!==generation||!isConnected())return;
    const serialized=JSON.stringify(value);
    if(serialized===last)return;last=serialized;
    if(value!==null&&value!==undefined)for(const listener of listeners)listener(value);
   }catch(error){if(current===generation&&isConnected())onError(error);}
   finally{if(pending===flight)pending=null;}
  },
  destroy(){disposed=true;generation++;pending=null;listeners.clear();},
 };
}
