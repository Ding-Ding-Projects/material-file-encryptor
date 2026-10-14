import {mountAccess} from '../../src/renderer/features/access/index.js';
import {ACCESS_COPY} from '../../src/renderer/features/access/copy.js';
import {createWaitBudget} from '../../src/renderer/features/access/wait-budget.js';
import {createPrivateHistory} from '../../src/shared/local-ux/history.js';
import {requestSuperConfirmation} from '../../src/shared/surface/workflow-confirm.js';
import {COPY as LOCAL_COPY} from '../../src/shared/local-ux/language.js';
import {WORKFLOW_COPY} from '../../src/shared/surface/workflow-copy.js';
import {passwordVerifier,verifyPassword} from '../../src/renderer/features/access/crypto.js';
import {createVisitorRecords,VISITOR_ACCESS_PREFIX} from './visitor-records.js';

const HISTORY_PREFIX='material-file-encryptor.visitor.access-history.';
const COPY={
  'Visitor local access':'訪客本機存取',
  'This profile exists only in this browser. It does not sign in to a server or unlock a desktop drive.':'此設定只存在於呢個瀏覽器，不會登入伺服器或解鎖桌面磁碟。',
  'Authenticator secrets and lock records are encrypted with your local profile password. Private history has its own password. Browser scripts running on this origin can still access an unlocked session; this is not protection against a compromised page.':'驗證器秘密及鎖定記錄會用本機設定密碼加密。私人記錄另設密碼。同源網頁程式仍可存取已解鎖時段，不能防禦已被入侵的網頁。',
  'Forgotten password recovery: clear this browser’s storage for this website, then register a new local profile. Encrypted records cannot be recovered without their passwords. No server reset or email recovery is available.':'忘記密碼時，請清除此瀏覽器對呢個網站的儲存資料，再建立本機設定。冇密碼就不能復原加密記錄，亦冇伺服器重設或電郵復原。',
  'Support tickets here are session-only. Export any ticket you want to keep before locking or closing this page. Nothing is sent automatically.':'此處支援單只限今次使用。鎖定或關閉網頁前，請匯出要保留的支援單，不會自動傳送任何資料。',
  'Reset visitor records':'重設訪客記錄',
  'Local profile, authenticator secrets, locks, and private history in this browser':'此瀏覽器的本機設定、驗證器秘密、鎖定及私人記錄',
  'Local records reset. Register a new profile to continue.':'本機記錄已重設，請建立新設定。',
  'Local protected records could not be loaded. Lock the profile and review browser storage.':'未能載入本機受保護記錄，請鎖定設定並檢查瀏覽器儲存資料。',
  'Resolved locally: use Reset visitor records or clear this website’s browser storage to start over.':'已於本機處理：如要重新開始，請使用重設訪客記錄或清除此網站的瀏覽器儲存資料。',
};

export function mountVisitorAccess(container,{storage=globalThis.localStorage,foundation,onAuthentication=()=>{},onHistoryAccess=()=>{},language='en',schoolMode=()=>false,withLock,confirmDestructive,notify=()=>{},eventTarget=globalThis.window}={}) {
  const doc=container.ownerDocument,root=doc.createElement('section');root.className='visitor-access';container.append(root);
  let access=null,destroyed=false,rebuilding=false,authenticated=false,generation=0;
  const ownBindings=new Map();
  const translate=source=>{if(source==='Resolved: open the application data folder to reset local data')source='Resolved locally: use Reset visitor records or clear this website’s browser storage to start over.';const yue=COPY[source]||ACCESS_COPY[source]||LOCAL_COPY[source]||WORKFLOW_COPY[source]||source;const mode=schoolMode()?'en':language;return mode==='yue'?yue:mode==='bilingual'&&yue!==source?`${source} · ${yue}`:source;};
  function bind(node,source){ownBindings.set(node,source);node.textContent=translate(source);return node;}
  const records=createVisitorRecords({storage,withLock,profile:()=>access});
  const requireAuthenticated=()=>{if(!authenticated)throw Error('Unlock the local profile first.');records.assertSession();};
  const historyStorage={getItem:key=>storage.getItem(HISTORY_PREFIX+key),setItem:(key,value)=>{requireAuthenticated();storage.setItem(HISTORY_PREFIX+key,value);},removeItem:key=>{requireAuthenticated();storage.removeItem(HISTORY_PREFIX+key);}};
  const historyCredentialStore={get:()=>records.get('history:verifier'),set:(_id,value)=>records.set('history:verifier',value)};
  const historyManager=createPrivateHistory({storage:historyStorage,credentialStore:historyCredentialStore});
  const sessionData=new Map();
  const sessionStorage={getItem:key=>sessionData.get(key)??null,setItem:(key,value)=>sessionData.set(key,String(value)),removeItem:key=>sessionData.delete(key)};
  const waitStorage={getItem:key=>storage.getItem(VISITOR_ACCESS_PREFIX+'wait.'+key),setItem:(key,value)=>storage.setItem(VISITOR_ACCESS_PREFIX+'wait.'+key,value)};
  const abort=new AbortController();
  function endAuthentication(){generation++;records.invalidate();authenticated=false;historyManager.lock();onAuthentication(false);onHistoryAccess({authenticated:false,historyManager,historyCredentialStore});}
  function rebuild(){
    if(destroyed||rebuilding)return;rebuilding=true;
    access?.controller.records.clear();access?.destroy();access=null;sessionData.clear();ownBindings.clear();root.replaceChildren();
    const heading=bind(doc.createElement('h2'),'Visitor local access');root.append(heading);
    for(const copy of Object.keys(COPY).slice(1,5)){const note=bind(doc.createElement('p'),copy);root.append(note);}
    const host=doc.createElement('div');root.append(host);
    access=mountAccess(host,{storage:sessionStorage,credentialStore:records.authenticationStore,deferAuthenticatorLoad:true,waitBudget:createWaitBudget({storage:waitStorage,withLock,now:Date.now}),schoolMode,translate:source=>translate(source),notify,
      onAuthenticatedChange(value){
        if(rebuilding||destroyed)return;
        if(!value){endAuthentication();queueMicrotask(rebuild);return;}
        try{records.assertSession();}catch(error){endAuthentication();queueMicrotask(rebuild);notify(error.message);return;}
        authenticated=true;const current=++generation;onAuthentication(true);onHistoryAccess({authenticated:true,historyManager,historyCredentialStore});
        for(const fieldset of host.querySelectorAll('fieldset'))if(fieldset.dataset.visitorHidden==='true'){fieldset.hidden=false;delete fieldset.dataset.visitorHidden;}
        queueMicrotask(async()=>{try{await access.loadAuthenticators();if(current!==generation||!authenticated)return;await access.load(records.ids('element-lock:').map(id=>id.slice('element-lock:'.length)));access.bind(foundation?.shell||container);}catch{if(current===generation)notify(translate('Local protected records could not be loaded. Lock the profile and review browser storage.'));}});
      },
      history:{record:record=>historyManager.unlocked?historyManager.append(record.action,{target:record.target}).catch(()=>{}):undefined},
      dataPath:translate('Support tickets here are session-only. Export any ticket you want to keep before locking or closing this page. Nothing is sent automatically.'),
    });
    for(const button of host.querySelectorAll('button'))if(button.textContent===translate('Open application data folder'))button.remove();
    const fieldsets=host.querySelectorAll('fieldset');for(const fieldset of Array.from(fieldsets).slice(1))if(!fieldset.hidden){fieldset.hidden=true;fieldset.dataset.visitorHidden='true';}
    const reset=bind(doc.createElement('button'),'Reset visitor records');reset.type='button';root.append(reset);
    reset.addEventListener('click',async()=>{
      if(reset.disabled)return;reset.disabled=true;let resetPerformed=false,accessDestroyed=false,resetError=null;
      const confirm=confirmDestructive||((options)=>requestSuperConfirmation(root,options));
      try{await confirm({action:'Reset visitor records',affected:translate('Local profile, authenticator secrets, locks, and private history in this browser'),translate,signal:abort.signal,run:async({signal}={})=>{
        if(signal?.aborted)return;endAuthentication();rebuilding=true;access?.destroy();access=null;accessDestroyed=true;rebuilding=false;
        try{await records.resetOwned({confirmed:true});const keys=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(HISTORY_PREFIX))keys.push(key);}keys.forEach(key=>storage.removeItem(key));}catch(error){resetError=error;throw error;}
        resetPerformed=true;
      }});}finally{if(!destroyed&&(resetPerformed||accessDestroyed)){rebuild();if(resetPerformed)notify(translate('Local records reset. Register a new profile to continue.'));else if(resetError)notify(resetError.message);}else reset.disabled=false;}
    });
    rebuilding=false;
  }
  const storageChanged=event=>{if(event.key===null||event.key?.startsWith(VISITOR_ACCESS_PREFIX)||event.key?.startsWith(HISTORY_PREFIX)){endAuthentication();rebuild();}};
  eventTarget?.addEventListener?.('storage',storageChanged);
  const pageHidden=()=>{endAuthentication();rebuild();};eventTarget?.addEventListener?.('pagehide',pageHidden);
  rebuild();onAuthentication(false);
  const credentialCapabilities={async setSharedCredential(password){if(!authenticated)throw Error('Unlock the local profile first.');await records.set('profile:shared-mode',await passwordVerifier(password));},async verifySharedCredential(password){if(!authenticated)throw Error('Unlock the local profile first.');const verifier=await records.get('profile:shared-mode');return verifier?verifyPassword(password,verifier):false;}};
  return {get authenticated(){return authenticated;},credentialStore:records,historyCredentialStore,historyManager,credentialCapabilities,
    encryptPrivateCache:async(value,purpose)=>{requireAuthenticated();return records.encryptPrivateCache(value,purpose);},decryptPrivateCache:async(value,purpose)=>{requireAuthenticated();return records.decryptPrivateCache(value,purpose);},
    lock(){endAuthentication();rebuild();},refresh(){for(const [node,source]of ownBindings)node.textContent=translate(source);access?.refresh();},setLanguage(value){if(!['en','yue','bilingual'].includes(value))throw Error('Unsupported visitor language.');language=value;for(const [node,source]of ownBindings)node.textContent=translate(source);access?.refresh();},
    openLockWizard:(id,origin)=>{if(!authenticated)throw Error('Unlock the local profile first.');access.openLockWizard(id,origin);},
    bind:node=>access.bind(node),guard:(...args)=>{if(!authenticated)throw Error('Unlock the local profile first.');return access.guard(...args);},guardControl:(...args)=>{if(!authenticated)throw Error('Unlock the local profile first.');return access.guardControl(...args);},guardEvent:(...args)=>{if(!authenticated)throw Error('Unlock the local profile first.');return access.guardEvent(...args);},
    destroy(){if(destroyed)return;endAuthentication();destroyed=true;abort.abort();rebuilding=true;access?.destroy();historyManager.destroy();sessionData.clear();eventTarget?.removeEventListener?.('storage',storageChanged);eventTarget?.removeEventListener?.('pagehide',pageHidden);root.remove();},
  };
}
