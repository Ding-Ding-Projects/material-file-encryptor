import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseJavaManifest,resolveJavaDistribution,catalogueState,readOfficialBytes,BEDROCK_CATALOGUE} from '../src/features/server-manager/catalog.js';
import {validateDescriptors,applyConfigurationPatch} from '../src/features/server-manager/configuration.js';
import {targetCapabilities,assertTargetInventory} from '../src/features/server-manager/targets.js';
import {mountConfigurationControls} from '../src/renderer/features/server-manager/configuration-controls.js';

const timestamp='2026-10-11T00:00:00Z';
const metadata={id:'historic',downloads:{server:{url:'https://piston-data.mojang.com/v1/objects/'+ 'b'.repeat(40)+'/server.jar',sha1:'b'.repeat(40),size:1234}}};
const bytes=Buffer.from(JSON.stringify(metadata));
const row={id:'historic',type:'old_alpha',url:'https://piston-meta.mojang.com/v1/packages/'+ 'a'.repeat(40)+'/historic.json',sha1:createHash('sha1').update(bytes).digest('hex'),releaseTime:timestamp,time:timestamp};
const manifest=()=>Buffer.from(JSON.stringify({latest:{release:'historic',snapshot:'historic'},versions:[row]}));
const response=data=>async()=>new Response(data);
test('authoritative catalogue retains historical channels without claiming distribution/runtime completeness',()=>{
  const snapshot=parseJavaManifest(manifest(),timestamp);
  assert.equal(snapshot.versions[0].channel,'old_alpha');assert.equal(snapshot.catalogueComplete,true);assert.equal(snapshot.distributionComplete,false);assert.equal(snapshot.runtimeVerified,false);
  assert.equal(catalogueState(snapshot,{now:Date.parse(timestamp)+86400001}).state,'stale');
  assert.equal(catalogueState(snapshot,{offline:true,now:Date.parse(timestamp)}).state,'offline');
  assert.equal(catalogueState(null).state,'unavailable');assert.equal(BEDROCK_CATALOGUE.catalogueComplete,false);
});
test('catalogue rejects duplicated, omitted-latest and untrusted metadata identities',()=>{
  for(const change of [v=>v.versions.push(row),v=>v.latest.release='missing',v=>v.versions[0].url='https://evil.example/file']) {
    const v=JSON.parse(manifest());change(v);assert.throws(()=>parseJavaManifest(Buffer.from(JSON.stringify(v)),timestamp));
  }
});
test('distribution resolves only digest-matching selected metadata and does not invent historical runtime',async()=>{
  const selected=parseJavaManifest(manifest(),timestamp).versions[0];
  const result=await resolveJavaDistribution(selected,{fetchImpl:response(bytes)});
  assert.equal(result.state,'resolved');assert.equal(result.runtime.state,'unresolved');assert.equal(result.bytesVerified,false);assert.equal(result.eulaAccepted,false);
  await assert.rejects(resolveJavaDistribution(selected,{fetchImpl:response(Buffer.from('{}'))}),/integrity/);
  const missing=Buffer.from(JSON.stringify({id:'historic'}));
  assert.equal((await resolveJavaDistribution({...selected,metadataSha1:createHash('sha1').update(missing).digest('hex')},{fetchImpl:response(missing)})).state,'unavailable');
});
test('network metadata is bounded and redirects cannot silently change authority',async()=>{
  let options;await readOfficialBytes(row.url,{fetchImpl:async(url,o)=>{options=o;return new Response('ok');}});assert.equal(options.redirect,'error');
  await assert.rejects(readOfficialBytes(row.url,{maxBytes:1,fetchImpl:response('too large')}),/limit/);
  await assert.rejects(readOfficialBytes('https://evil.example/x',{fetchImpl:()=>{throw Error('must not fetch');}}),/Untrusted/);
});
const binding={edition:'java',version:'historic',distributionSha256:'a'.repeat(64)};
const descriptor=(id,type,extra={})=>({id,type,...binding,sourceUrl:'https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-9',sourceRevision:'pinned-source',helpId:'server.'+id,permission:'server.configure',consumer:'server-properties',applyMode:'restart',...extra});
test('typed controls are source/version bound and cannot collapse into a generic editor',()=>{
  const inventory=validateDescriptors([descriptor('enabled','boolean'),descriptor('mode','enum',{choices:['a','b']}),descriptor('port','integer',{min:1,max:65535}),descriptor('name','string')],binding);
  assert.deepEqual(inventory.map(x=>x.control),['switch','searchable-select','numeric-stepper','text']);
  assert.throws(()=>validateDescriptors([{...inventory[0],version:'other'}],binding),/binding/);
  assert.throws(()=>validateDescriptors([{...inventory[0],consumer:''}],binding),/incomplete/);
  assert.throws(()=>validateDescriptors([descriptor('raw','json')],binding),/binding/);
});
test('configuration patches preserve unknown extensions and reject invalid/unknown edits atomically',()=>{
  const original={enabled:false,extension:{opaque:[1,2]}};const descriptors=[descriptor('enabled','boolean')];
  const next=applyConfigurationPatch(original,{enabled:true},descriptors,binding);
  assert.deepEqual(next.extension,original.extension);assert.equal(original.enabled,false);assert.equal(next.enabled,true);
  assert.throws(()=>applyConfigurationPatch(original,{enabled:'yes'},descriptors,binding));
  assert.throws(()=>applyConfigurationPatch(original,{extension:{}},descriptors,binding));
  assert.deepEqual(original,{enabled:false,extension:{opaque:[1,2]}});
});
test('all four target boundaries remain unavailable and omitted target/proof mutations turn red',()=>{
  const rows=targetCapabilities();assert.equal(assertTargetInventory(rows),true);
  assert.equal(rows.find(row=>row.id==='local-process').lifecycle,'implemented-unverified');
  assert.ok(rows.filter(row=>row.id!=='local-process').every(row=>row.lifecycle==='not-implemented'));
  for(let i=0;i<4;i++)assert.throws(()=>assertTargetInventory(rows.filter((_,j)=>j!==i)),/incomplete/);
  const changed=structuredClone(rows);changed[2].requiredProofs=[];assert.throws(()=>assertTargetInventory(changed),/proof/);
  const fake=structuredClone(rows);fake[0].available=true;assert.throws(()=>assertTargetInventory(fake),/misrepresented/);
});
function mountFixture({mountBinding=binding,onChange}={}) {
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.events={};this.attributes={};this.ownerDocument=document;}
    append(...children){this.children.push(...children);}
    setAttribute(key,value){this.attributes[key]=value;}
    addEventListener(name,handler){this.events[name]=handler;}
    remove(){this.removed=true;}
    get options(){return this.children;}
  }
  const document={createElement:tag=>new Element(tag)};
  const root=new Element('root');
  const mounted=mountConfigurationControls(root,{descriptors:[descriptor('enabled','boolean')],binding:mountBinding,values:{enabled:false},translate:key=>key,onChange});
  const section=root.children[0],row=section.children[0],control=row.children[0].children[0],status=row.children[2];
  return {mounted,section,control,status};
}
test('actual configuration mount uses typed controls and cannot report an unconfirmed write as applied',async()=>{
  let receipt;
  const {mounted,section,control,status}=mountFixture({onChange:async input=>{receipt=input;return {applied:false};}});
  assert.equal(control.type,'checkbox');assert.equal(control.attributes.role,'switch');control.checked=true;await control.events.change();
  assert.equal(control.checked,false);
  assert.equal(status.textContent,'server.configuration.notApplied');assert.equal(receipt.id,'enabled');assert.equal(receipt.signal.aborted,false);
  mounted.destroy();assert.equal(receipt.signal.aborted,true);assert.equal(section.removed,true);
});
test('rejected and throwing writes restore the last confirmed value rather than an attempted value',async()=>{
  for(const reject of [async()=>({applied:false}),async()=>{throw new Error('Write rejected');}]) {
    let calls=0;
    const {mounted,control}=mountFixture({onChange:async()=>++calls===1?{applied:true}:reject()});
    control.checked=true;await control.events.change();assert.equal(control.checked,true);
    control.checked=false;await control.events.change();assert.equal(control.checked,true);
    mounted.destroy();
  }
});
test('configuration submissions retain validated mount identity despite external and callback mutations',async()=>{
  const mutableBinding=structuredClone(binding);const submissions=[];
  const {mounted,control}=mountFixture({mountBinding:mutableBinding,onChange:async input=>{submissions.push(structuredClone(input.binding));input.binding.version='callback-change';return {applied:true};}});
  mutableBinding.version='externally-changed';mutableBinding.distributionSha256='b'.repeat(64);
  control.checked=true;await control.events.change();control.checked=false;await control.events.change();
  assert.deepEqual(submissions,[binding,binding]);mounted.destroy();
});
