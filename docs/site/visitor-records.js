export const VISITOR_ACCESS_PREFIX='material-file-encryptor.visitor.access.';
const allowed=/^(?:local-profile:v1|profile:shared-mode|authenticator:[a-zA-Z0-9:_.-]{1,160}|element-lock:[^\x00-\x1f\x7f]{1,256}|history:verifier)$/;

export function createVisitorRecords({storage=globalThis.localStorage,profile,withLock}={}) {
  let epoch=0,authenticatedVerifier=null;
  const locking=withLock||((name,run)=>{
    if(!globalThis.navigator?.locks?.request)throw Error('Protected local storage requires browser Web Locks support.');
    return navigator.locks.request(name,run);
  });
  const key=id=>{if(typeof id!=='string'||!allowed.test(id))throw Error('Unsupported visitor credential record.');return VISITOR_ACCESS_PREFIX+id;};
  const requireSession=()=>{if(!profile()?.authenticated)throw Error('Unlock the local profile first.');if(authenticatedVerifier===null||storage.getItem(key('local-profile:v1'))!==authenticatedVerifier)throw Error('The local profile changed in another window. Lock and authenticate again.');};
  const parse=raw=>{if(raw===null)return null;if(raw.length>2*1024*1024)throw Error('Visitor record exceeds its limit.');return JSON.parse(raw);};
  function validateVerifier(value){if(value?.version!==2||value.purpose!=='password-verifier'||value.iterations!==310000||typeof value.salt!=='string'||value.salt.length!==24||typeof value.hash!=='string'||value.hash.length!==44||Object.keys(value).some(k=>!['version','purpose','iterations','salt','hash'].includes(k)))throw Error('Unsupported visitor profile verifier.');}
  const api={
    async get(id){const raw=storage.getItem(key(id));if(id==='local-profile:v1'){const value=parse(raw);if(value)validateVerifier(value);return value;}requireSession();const value=parse(raw);if(!value)return null;const result=await profile().decryptPrivateCache(value,id);requireSession();return result;},
    async set(id,value){
      const destination=key(id),currentEpoch=epoch;
      return locking(VISITOR_ACCESS_PREFIX+'write',async()=>{
        if(currentEpoch!==epoch)throw Error('Visitor record write was cancelled by a session change.');
        if(id==='local-profile:v1'){
          validateVerifier(value);
          if(storage.getItem(destination)!==null)throw Error('A local profile already exists. Unlock it instead.');
          const serialized=JSON.stringify(value);storage.setItem(destination,serialized);return;
        }
        requireSession();const serialized=JSON.stringify(value);
        if(typeof serialized!=='string'||new TextEncoder().encode(serialized).length>262144)throw Error('Visitor credential record exceeds its limit.');
        const current=profile(),sealed=await current.encryptPrivateCache(value,id);
        if(currentEpoch!==epoch||current!==profile()||!current.authenticated)throw Error('Local profile locked before the record was saved.');
        requireSession();
        storage.setItem(destination,JSON.stringify(sealed));
      });
    },
    async delete(id){key(id);requireSession();const currentEpoch=epoch;if(id==='local-profile:v1')throw Error('Use the confirmed visitor reset to remove the profile.');return locking(VISITOR_ACCESS_PREFIX+'write',()=>{requireSession();if(currentEpoch!==epoch)throw Error('Visitor record deletion was cancelled by a session change.');storage.removeItem(key(id));});},
    ids(prefix=''){requireSession();const result=[];for(let i=0;i<storage.length;i++){const name=storage.key(i);if(name?.startsWith(VISITOR_ACCESS_PREFIX)){const id=name.slice(VISITOR_ACCESS_PREFIX.length);if(allowed.test(id)&&id.startsWith(prefix))result.push(id);}}return result;},
    assertSession:requireSession,
    async encryptPrivateCache(value,purpose){requireSession();if(typeof purpose!=='string'||!purpose.length||purpose.length>160||/[\x00-\x1f\x7f]/.test(purpose))throw Error('Use a bounded private cache purpose.');const currentEpoch=epoch,current=profile(),result=await current.encryptPrivateCache(value,purpose);if(currentEpoch!==epoch||current!==profile())throw Error('Private cache operation was cancelled.');requireSession();return result;},
    async decryptPrivateCache(value,purpose){requireSession();if(typeof purpose!=='string'||!purpose.length||purpose.length>160||/[\x00-\x1f\x7f]/.test(purpose))throw Error('Use a bounded private cache purpose.');const currentEpoch=epoch,current=profile(),result=await current.decryptPrivateCache(value,purpose);if(currentEpoch!==epoch||current!==profile())throw Error('Private cache operation was cancelled.');requireSession();return result;},
    invalidate(){epoch++;authenticatedVerifier=null;},
    async resetOwned({confirmed=false}={}){if(!confirmed)throw Error('Confirm visitor record reset first.');epoch++;return locking(VISITOR_ACCESS_PREFIX+'write',()=>{const keys=[];for(let i=0;i<storage.length;i++){const name=storage.key(i);if(name?.startsWith(VISITOR_ACCESS_PREFIX))keys.push(name);}keys.forEach(name=>storage.removeItem(name));return keys.length;});},
  };
  api.authenticationStore={
    async get(id){if(id!=='local-profile:v1')return api.get(id);const raw=storage.getItem(key(id)),value=parse(raw);if(value)validateVerifier(value);authenticatedVerifier=raw;return value;},
    async set(id,value){await api.set(id,value);if(id==='local-profile:v1')authenticatedVerifier=JSON.stringify(value);},delete:(...args)=>api.delete(...args),
  };
  return api;
}
