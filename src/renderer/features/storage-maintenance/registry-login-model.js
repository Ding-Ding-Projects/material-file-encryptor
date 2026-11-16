export const REGISTRY_ACTIVATION_URL='https://login.docker.com/activate';
export const REGISTRY_LOGIN_METHODS=['registryLoginStatus','recheckRegistryLogin','startRegistryLogin','cancelRegistryLogin','openRegistryLoginPage'];
export const REGISTRY_LOGIN_ACTIVE=['checking','authorizing','verifying'];
const states=['idle',...REGISTRY_LOGIN_ACTIVE,'signed-in','cancelled','expired','failed','unavailable','stale'];
// Reasons the main process may report. Anything else is dropped so raw host text never reaches the page.
export const REGISTRY_LOGIN_REASONS=Object.freeze(['docker-not-installed','docker-not-running','config-missing','config-unreadable','credential-store-missing','credential-store-unsupported','credential-store-unavailable','protected-store-unavailable','unsupported-platform','device-flow-unavailable','device-login-expired','device-login-incomplete','invalid-cli-output','stored-sign-in-unverified','identity-token-unsupported','provider-unavailable']);
const ACCOUNT=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/;
const CHECK_AGAIN=['docker-not-installed','docker-not-running','config-missing','config-unreadable','credential-store-missing','credential-store-unsupported','credential-store-unavailable','protected-store-unavailable','unsupported-platform','provider-unavailable'];

const reasonOf=value=>REGISTRY_LOGIN_REASONS.includes(value?.reason)?value.reason:null;
const accountOf=value=>typeof value?.account==='string'&&ACCOUNT.test(value.account)?value.account:null;

// Only this bounded, ephemeral view enters the component. Raw host output,
// credentials and device codes outside the authorizing state are never retained by the renderer helper.
export function registryLoginSnapshot(value,now=Date.now()) {
 if(!value||!states.includes(value.state)||typeof value.canOpenPage!=='boolean')throw Error('loginUnavailable');
 const reason=reasonOf(value),account=value.state==='signed-in'?accountOf(value):null;
 if(value.state!=='authorizing')return{state:value.state,deviceCode:null,canOpenPage:false,expiresAt:null,reason,account};
 if(typeof value.deviceCode!=='string'||!/[A-Z0-9]/.test(value.deviceCode)||!/^[A-Z0-9-]{4,32}$/.test(value.deviceCode))throw Error('loginUnavailable');
 const expires=typeof value.expiresAt==='string'?Date.parse(value.expiresAt):NaN;
 if(!Number.isFinite(expires)||expires-now>3600000)throw Error('loginUnavailable');
 if(expires<=now)return{state:'expired',deviceCode:null,canOpenPage:false,expiresAt:null,reason:'device-login-expired',account:null};
 return{state:value.state,deviceCode:value.deviceCode,canOpenPage:value.canOpenPage,expiresAt:value.expiresAt,reason:null,account:null};
}

/** The one clear next step for a state. `run` names what the primary button does; `label` is its copy key. */
export function registryLoginAction(state,reason=null) {
 switch(state){
  case 'signed-in':return{label:'loginChooseDrives',run:'choose'};
  case 'cancelled':return{label:'loginStartAgain',run:'start'};
  case 'expired':return{label:'loginNewCode',run:'start'};
  case 'stale':return{label:'loginSignInAgain',run:'start'};
  case 'failed':return{label:'loginRetry',run:'start'};
  case 'unavailable':
   if(reason==='device-flow-unavailable')return{label:'loginCheckAgainUpdated',run:'recheck'};
   return CHECK_AGAIN.includes(reason)?{label:'loginCheckAgain',run:'recheck'}:{label:'loginRetry',run:'start'};
  case 'idle':return{label:'loginStart',run:'start'};
  default:return{label:'loginStart',run:null};
 }
}

/** Copy key for the status line: a reason-specific message when one is known, otherwise the state message. */
export function registryLoginMessageKey(state,reason){
 if(reason&&['unavailable','stale','failed','expired'].includes(state))return 'loginReason-'+reason;
 return 'login-'+state;
}
