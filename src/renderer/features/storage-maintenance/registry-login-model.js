export const REGISTRY_ACTIVATION_URL='https://login.docker.com/activate';
export const REGISTRY_LOGIN_METHODS=['registryLoginStatus','startRegistryLogin','cancelRegistryLogin','openRegistryLoginPage'];
export const REGISTRY_LOGIN_ACTIVE=['checking','authorizing','verifying'];
const states=['idle',...REGISTRY_LOGIN_ACTIVE,'signed-in','cancelled','expired','failed','unavailable','stale'];

// Only this bounded, ephemeral view enters the component. Raw host output,
// account records and credentials are never retained by the renderer helper.
export function registryLoginSnapshot(value,now=Date.now()) {
 if(!value||!states.includes(value.state)||typeof value.canOpenPage!=='boolean')throw Error('loginUnavailable');
 if(value.state!=='authorizing')return{state:value.state,deviceCode:null,canOpenPage:false,expiresAt:null};
 if(typeof value.deviceCode!=='string'||!/[A-Z0-9]/.test(value.deviceCode)||!/^[A-Z0-9-]{4,32}$/.test(value.deviceCode))throw Error('loginUnavailable');
 const expires=typeof value.expiresAt==='string'?Date.parse(value.expiresAt):NaN;
 if(!Number.isFinite(expires)||expires-now>3600000)throw Error('loginUnavailable');
 if(expires<=now)return{state:'expired',deviceCode:null,canOpenPage:false,expiresAt:null};
 return{state:value.state,deviceCode:value.deviceCode,canOpenPage:value.canOpenPage,expiresAt:value.expiresAt};
}
