/** Main-process-only capability. Nothing in this interface is renderer supplied. */
export function createServerProcessAdmission({nativeRequest}={}) {
 let initialized=false,closing=false,active=0;
 const unavailable=()=>({available:false,reason:'Protected native server supervision is unavailable.'});
 async function request(method,params){if(typeof nativeRequest!=='function')throw Error(unavailable().reason);active++;try{return await nativeRequest('server.'+method,params);}finally{active--;}}
 return {
  async initialize(baseRoot){if(closing)throw Error('Server supervision is closing.');const result=await request('initialize',{baseRoot});initialized=result?.initialized===true;if(!initialized)throw Error('Native server initialization was not verified.');},
  async capabilities(){if(!initialized)return unavailable();return request('capabilities',{});},
  async register({id,distribution,distributionSha256}){if(!initialized||closing)throw Error('Native server admission is unavailable.');return request('register',{id,version:distribution.version,majorVersion:distribution.runtime?.state==='specified'?distribution.runtime.majorVersion:0,distributionSha256});},
  async start(id){if(!initialized||closing)throw Error('Native server admission is unavailable.');return request('start',{id});},
  async status(id){if(!initialized)throw Error('Native server admission is unavailable.');return request('status',{id});},
  async stop(id){if(!initialized)throw Error('Native server admission is unavailable.');return request('stop',{id});},
  get pending(){return active;},
  async close(){closing=true;if(!initialized)return {closed:true,verified:true};return request('close',{});}
 };
}
