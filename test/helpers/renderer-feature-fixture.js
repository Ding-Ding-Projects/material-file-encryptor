// Explicit empty/unavailable feature snapshots for the source renderer fixture.
// This is not a replacement for packaged or native acceptance.
export function createRendererFeatureFixture({responses:overrides={},record=async()=>{}}={}) {
 const unavailable='Unavailable in the isolated renderer fixture.';
 const responses={
  'access/displayNameRead':{value:null},'access/dataFolder':'Synthetic local profile',
  'access/credentialList':[],'access/credentialGet':null,'access/historyLock':true,
  'personalization/accessibilityState':{known:false,enabled:false,source:'runtime'},
  'personalization/sharedRead':null,'personalization/listFonts':[],
  'updates/status':{state:'unavailable',reason:unavailable,desktopAvailable:false,canInstall:false},
  'converter/catalog':[],'converter/list':[],
  'workflow/documents':[],'workflow/templates':[],'workflow/editors':[],
  'workflow/accountState':[],'workflow/downloads':[],'workflow/browserProposals':[],
  'ollama/models':{models:[]},'ollama/catalog':{lastSuccessfulRefresh:null,familyCount:0,variants:[],pageCount:0,stale:true},
  'ollama/profiles':[],'ollama/cart':[],'ollama/sessions':[],
  'ollama/status':{state:'unavailable',reason:unavailable,installed:false,ownedManaged:false,actions:{install:false,start:false,stop:false,locate:false,registerProfile:false}},
  'ollama/runtimeInstallStatus':{phase:'idle',operationId:null,installed:false,cancellable:false,outcome:'unavailable'},
  'documentation/catalog':{documents:[]},'documentation/changelog':[],
  'server-manager/snapshot':{schemaVersion:1,catalogue:{state:'unavailable',sourceSha256:null,retrievedAt:null,total:0},operations:[],targets:[{id:'local-process',available:false},{id:'local-container',available:false},{id:'ssh-process',available:false},{id:'ssh-container',available:false}],startAvailable:false,startReason:unavailable,licenseAcceptanceAvailable:false},
  'status/status':{state:'unavailable'},
 };
 const clone=value=>JSON.parse(JSON.stringify(value));
 function shape(value,expected,where){
  if(expected===null){if(value!==null)throw Error('Invalid fixture response: '+where);return;}
  if(Array.isArray(expected)){if(!Array.isArray(value)||value.length!==expected.length)throw Error('Invalid fixture array: '+where);expected.forEach((item,index)=>shape(value[index],item,where+'.'+index));return;}
  if(typeof value!==typeof expected||value===null)throw Error('Invalid fixture response: '+where);
  if(typeof expected==='object'){if(JSON.stringify(Object.keys(value).sort())!==JSON.stringify(Object.keys(expected).sort()))throw Error('Invalid fixture fields: '+where);for(const key of Object.keys(expected))shape(value[key],expected[key],where+'.'+key);}
 }
 const supplied=clone(responses);for(const [key,value]of Object.entries(overrides)){if(!Object.hasOwn(responses,key))throw Error('Unknown fixture response pair');shape(value,responses[key],key);supplied[key]=clone(value);}
 const pairs=Object.keys(responses),features=new Set(pairs.map(key=>key.split('/')[0])),listeners=new Map();
 const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(Object.keys(value).sort())!==JSON.stringify(keys.sort()))throw Error('Unsupported fixture request payload');};
 function payloadFor(pair,payload){
  if(pair==='updates/status'){exact(payload,['language']);if(!['en','yue','bilingual'].includes(payload.language))throw Error('Unsupported fixture language');}
  else if(pair==='converter/list'){exact(payload,['offset','limit']);if(payload.offset!==0||payload.limit!==50)throw Error('Unsupported fixture conversion page');}
  else if(pair==='access/credentialList'){exact(payload,['prefix']);if(payload.prefix!=='element-lock:')throw Error('Unsupported fixture record prefix');}
  else if(pair==='access/credentialGet'){exact(payload,['key']);if(!['authenticator:index:v1','local-profile:v1'].includes(payload.key))throw Error('Unsupported fixture record key');}
  else exact(payload,[]);
 }
 const bridge={
  async featureRequest(feature,action,payload={}){
   const pair=feature+'/'+action;await record({kind:'request',state:'started',pair:Object.hasOwn(responses,pair)?pair:'unknown'});
   if(!Object.hasOwn(responses,pair))throw Error('Unsupported renderer fixture feature/action pair');
   payloadFor(pair,payload);const value=clone(supplied[pair]);shape(value,responses[pair],pair);
   await record({kind:'request',state:'completed',pair});return value;
  },
  onFeatureEvent(feature,callback){if(!features.has(feature)||typeof callback!=='function')throw TypeError('Known fixture feature and callback required');const set=listeners.get(feature)||new Set();listeners.set(feature,set);set.add(callback);let active=true;return()=>{if(active){active=false;set.delete(callback);}};},
 };
 // No timers, native events or publication operations exist in this fixture.
 // The only authored event is the accessibility snapshot already read at mount.
 function emitAccessibility(){const event={type:'accessibilityState',state:clone(supplied['personalization/accessibilityState'])};for(const callback of listeners.get('personalization')||[])callback(clone(event));}
 return{bridge,pairs:Object.freeze(pairs),emitAccessibility};
}
export function assertRendererFeatureBridge(bridge){
 for(const method of ['featureRequest','onFeatureEvent'])if(typeof bridge?.[method]!=='function')throw TypeError('Required renderer fixture method missing: '+method);
 const off=bridge.onFeatureEvent('personalization',()=>{});if(typeof off!=='function')throw TypeError('Feature subscription must return a disposer');off();
}
export function rendererFeatureFixtureScript(initialize){
 return `(()=>{const featureFixture=(${createRendererFeatureFixture.toString()})({record:row=>window.__recordRendererFixture(row)});(${assertRendererFeatureBridge.toString()})(featureFixture.bridge);(${initialize.toString()})(featureFixture);})();`;
}

export function createRendererFixtureProgress(persist){
 let sequence=0,queue=Promise.resolve();const state={version:1,lastStarted:null,lastCompleted:null,phase:{lastStarted:null,lastCompleted:null},request:{lastStarted:null,lastCompleted:null},recent:[]};
 const record=row=>{
  if(!row||!['phase','request'].includes(row.kind)||!['started','completed'].includes(row.state))throw Error('Invalid fixture progress row');
  const key=row.kind==='phase'?'phase':'pair';if(Object.keys(row).sort().join(',')!==['kind',key,'state'].sort().join(',')||typeof row[key]!=='string'||!row[key]||row[key].length>160)throw Error('Invalid fixture progress identity');
  const entry={...row,sequence:++sequence};state[row.state==='started'?'lastStarted':'lastCompleted']=entry;state[row.kind][row.state==='started'?'lastStarted':'lastCompleted']=entry;state.recent.push(entry);state.recent=state.recent.slice(-128);
  const snapshot=JSON.parse(JSON.stringify(state));queue=queue.then(()=>persist(snapshot));return queue;
 };
 return{record,snapshot:()=>JSON.parse(JSON.stringify(state))};
}

export async function verifyRendererFeatureFixture(bridge){
 assertRendererFeatureBridge(bridge);
 const requireValue=(condition,pair)=>{if(!condition)throw TypeError('Invalid mounted-consumer fixture response: '+pair);};
 for(const [feature,action,payload,valid]of [
  ['access','displayNameRead',{},value=>value&&Object.hasOwn(value,'value')&&(value.value===null||typeof value.value==='string')],
  ['access','dataFolder',{},value=>typeof value==='string'&&value.length>0],
  ['access','credentialList',{prefix:'element-lock:'},Array.isArray],
  ['access','credentialGet',{key:'authenticator:index:v1'},value=>value===null||Array.isArray(value)],
  ['personalization','accessibilityState',{},value=>value&&typeof value.known==='boolean'&&typeof value.enabled==='boolean'],
  ['personalization','sharedRead',{},value=>value===null],
  ['updates','status',{language:'en'},value=>value?.state==='unavailable'&&value.canInstall===false],
  ['documentation','catalog',{},value=>Array.isArray(value?.documents)],
  ['ollama','models',{},value=>Array.isArray(value?.models)],
  ['ollama','catalog',{},value=>Array.isArray(value?.variants)&&typeof value.familyCount==='number'&&typeof value.stale==='boolean'],
  ['ollama','status',{},value=>value?.state==='unavailable'&&value.installed===false&&value.actions?.start===false],
  ['ollama','runtimeInstallStatus',{},value=>value?.phase==='idle'&&value.operationId===null],
  ['server-manager','snapshot',{},value=>value?.schemaVersion===1&&Array.isArray(value.operations)&&value.targets?.length===4&&value.targets.every(row=>row.available===false)&&value.startAvailable===false],
  ['status','status',{},value=>value?.state==='unavailable'],
 ])requireValue(valid(await bridge.featureRequest(feature,action,payload)),feature+'/'+action);
 for(const pair of ['personalization/listFonts','converter/catalog','converter/list','workflow/documents','workflow/templates','workflow/editors','workflow/accountState','workflow/downloads','workflow/browserProposals','ollama/profiles','ollama/cart','ollama/sessions','documentation/changelog']){const [feature,action]=pair.split('/');requireValue(Array.isArray(await bridge.featureRequest(feature,action,pair==='converter/list'?{offset:0,limit:50}:{})),pair);}
 requireValue(await bridge.featureRequest('access','historyLock',{})===true,'access/historyLock');
}
