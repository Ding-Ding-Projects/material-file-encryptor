import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {createScheduleSource,isPublicAddress} from '../src/main/schedule-source.js';
function transport(body,{status=200,headers={},onRequest=()=>{},hang=false}={}){
  return (options,callback)=>{onRequest(options);const req=new EventEmitter();let stopped=false,res;req.destroy=()=>{stopped=true;res?.destroy();};req.end=()=>queueMicrotask(()=>{if(stopped)return;res=hang?new Readable({read(){}}):Readable.from([Buffer.from(typeof body==='string'?body:JSON.stringify(body))]);res.statusCode=status;res.headers={'content-type':'application/json',...headers};callback(res);});return req;};
}
const lookup=async()=>[{address:'93.184.216.34',family:4}];
test('public address policy rejects private, special, link-local, loopback and mapped targets',()=>{
  for(const ip of ['0.0.0.0','10.0.0.1','100.64.1.2','127.0.0.1','169.254.169.254','172.16.4.1','192.168.1.1','192.0.2.1','198.18.0.1','203.0.113.1','224.1.1.1','::1','fc00::1','fe80::1','::ffff:8.8.8.8','::ffff:127.0.0.1','2001:db8::1','2002:808:808::1'])assert.equal(isPublicAddress(ip),false,ip);
  assert.equal(isPublicAddress('93.184.216.34'),true);assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
});
test('DNS is resolved once and pinned to validated address while TLS retains source hostname',async()=>{
  let dnsCalls=0,options;
  const source=createScheduleSource({lookup:async()=>{dnsCalls++;return [{address:'93.184.216.34',family:4}];},request:transport({version:1,settings:{theme:'dark',funnyEnglish:5}},{onRequest:o=>options=o})});
  const result=await source.fetch({type:'api',url:'https://schedule.example/settings'},{id:'one'});
  assert.equal(dnsCalls,1);assert.equal(options.hostname,'schedule.example');assert.equal(options.servername,'schedule.example');assert.equal(options.agent,false);assert.equal(options.rejectUnauthorized,true);
  options.lookup('schedule.example',{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'93.184.216.34');assert.equal(family,4);});
  assert.deepEqual(result.settings,{theme:'dark',funnyEnglish:5});assert.ok(result.checkedAt);assert.equal(result.provenance.host,'schedule.example');assert.ok(!JSON.stringify(result).includes('/settings'));await source.dispose();
});
test('DNS mixtures and disallowed URL forms are rejected before any request',async()=>{
  let calls=0;const request=()=>{calls++;throw new Error('should not run');};
  for(const url of ['http://schedule.example','https://user:pass@schedule.example','https://127.0.0.1','https://[::ffff:127.0.0.1]','https://schedule.example/#fragment','https://schedule.example/?token=synthetic']){
    const source=createScheduleSource({lookup,request});await assert.rejects(source.fetch({type:'api',url},{id:'one'}));await source.dispose();
  }
  const source=createScheduleSource({lookup:async()=>[{address:'93.184.216.34',family:4},{address:'10.0.0.1',family:4}],request});await assert.rejects(source.fetch({type:'api',url:'https://schedule.example'},{id:'one'}),/private/);assert.equal(calls,0);
});
test('loopback development accepts only exact literal addresses and remains opt-in',async()=>{
  for(const url of ['http://localhost:8123','http://127.1:8123','http://127.0.0.2:8123','http://[0:0:0:0:0:0:0:1]:8123']){
    const source=createScheduleSource({allowLoopbackDevelopment:true,lookup,request:transport({})});await assert.rejects(source.fetch({type:'api',url},{id:'one'}));
  }
  for(const url of ['http://127.0.0.1:8123','http://[::1]:8123']){
    const source=createScheduleSource({allowLoopbackDevelopment:true,request:transport({version:1,settings:{emoji:true}})});assert.equal((await source.fetch({type:'api',url},{id:'one'})).settings.emoji,true);await source.dispose();
  }
});
test('redirects, oversized bodies, encodings and invalid schemas fail closed',async()=>{
  const cases=[transport({}, {status:302}),transport('x'.repeat(32769)),transport({}, {headers:{'content-encoding':'gzip'}}),transport({version:2,settings:{theme:'dark'}}),transport({version:1,settings:{theme:'invented'}}),transport({version:1,settings:{credentials:'no'}}),transport('{"version":1,"version":1,"settings":{}}')];
  for(const request of cases){const source=createScheduleSource({lookup,request});await assert.rejects(source.fetch({type:'api',url:'https://schedule.example'},{id:'one'}));await source.dispose();}
});
test('Home Assistant reads protected credential and returns only boolean state plus safe provenance',async()=>{
  let key,options;const source=createScheduleSource({lookup,credentials:{get:async k=>{key=k;return {token:'synthetic-test-value',origin:'https://ha.example'};}},request:transport({entity_id:'binary_sensor.work',state:'on',attributes:{private:'discard'}},{onRequest:o=>options=o})});
  const result=await source.fetch({type:'home-assistant',url:'https://ha.example',entityId:'binary_sensor.work'},{id:'work'});
  assert.equal(key,'schedule:work');assert.equal(options.path,'/api/states/binary_sensor.work');assert.equal(options.headers.Authorization,'Bearer synthetic-test-value');assert.equal(result.active,true);assert.equal(result.state,'on');assert.ok(!JSON.stringify(result).includes('synthetic-test-value'));assert.ok(!JSON.stringify(result).includes('discard'));await source.dispose();
  const missing=createScheduleSource({lookup,credentials:{get:async()=>null},request:transport({})});await assert.rejects(missing.fetch({type:'home-assistant',url:'https://ha.example',entityId:'input_boolean.work'},{id:'work'}),/protected/);
});
test('credential mutations require native authorization and return no credential',async()=>{
  const entries=new Map(),credentials={set:async(k,v)=>entries.set(k,v),delete:async k=>entries.delete(k)};
  const source=createScheduleSource({credentials,authorizeCredentialMutation:async context=>context?.native===true});
  await assert.rejects(source.registerToken('work','synthetic-test-value',{}),/authorization/);
  assert.deepEqual(await source.registerToken('work','synthetic-test-value',{native:true,source:{type:'home-assistant',url:'https://ha.example',entityId:'binary_sensor.work'}}),{id:'work',stored:true});assert.ok(entries.has('schedule:work'));
  await source.deleteToken('work',{native:true});assert.equal(entries.size,0);
});
test('existing editor entity field is supported and conflicting aliases are rejected',async()=>{
  const source=createScheduleSource({lookup,credentials:{get:async()=>({token:'synthetic-test-value',origin:'https://ha.example'})},request:transport({entity_id:'input_boolean.work',state:'off'})});
  const result=await source.fetch({type:'home-assistant',url:'https://ha.example',entity:'input_boolean.work',id:'work'});assert.equal(result.active,false);
  await assert.rejects(source.fetch({type:'home-assistant',url:'https://ha.example',entity:'input_boolean.work',entityId:'input_boolean.other'},{id:'other'}),/Conflicting/);await source.dispose();
});
test('protected Home Assistant credentials cannot follow a source to another origin',async()=>{
  let calls=0;const source=createScheduleSource({lookup,credentials:{get:async()=>({token:'synthetic-test-value',origin:'https://ha.example'})},request:()=>{calls++;throw new Error('must not send');}});
  await assert.rejects(source.fetch({type:'home-assistant',url:'https://another.example',entity:'binary_sensor.work'},{id:'work'}),/bound to this origin/);assert.equal(calls,0);await source.dispose();
});
test('refresh throttling and timeout bound asynchronous requests',async()=>{
  const source=createScheduleSource({lookup,request:transport({version:1,settings:{}}),minInterval:1000});const config={type:'api',url:'https://schedule.example'};await source.fetch(config,{id:'one'});await assert.rejects(source.fetch(config,{id:'one'}),/rate limited/);await source.dispose();
  const stalled=createScheduleSource({lookup,request:transport({}, {hang:true}),timeout:100});await assert.rejects(stalled.fetch(config,{id:'one'}),/timed out|cancelled/);await stalled.dispose();
});
