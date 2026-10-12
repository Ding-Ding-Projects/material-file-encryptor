import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseJavaProperties as parse,inspectJava1219Configuration as inspect,PROPERTIES_LIMITS} from '../src/features/server-manager/java-properties-evidence.js';
const latin='java-inputstream-latin1',utf8='utf8-reader-strict';
const bytes=text=>Buffer.from(text,'latin1');
const pairs=result=>result.entries.map(({key,value})=>[key,value]);
const binding=(data,profile=latin)=>({edition:'java',version:'1.21.9',distributionSha256:'a'.repeat(64),propertiesSha256:createHash('sha256').update(data).digest('hex'),profile});
const code=(action,expected)=>assert.throws(action,error=>error.code===expected);

test('Properties lexical inspection handles natural lines, comments, separators and empty values',()=>{
  assert.deepEqual(pairs(parse(bytes(' #ignore\\\r\n !ignore\rkey value\ncolon:second\r\nempty\n=blank-key\ntruth = true  '),{profile:latin})),[['key','value'],['colon','second'],['empty',''],['','blank-key'],['truth','true  ']]);
});
test('odd continuation and even backslash endings use logical line semantics',()=>{
  const slash=String.fromCharCode(92);
  const input='odd=first'+slash+'\r\n\t second\neven=two'+slash.repeat(2)+'\nmixed=one'+slash.repeat(3)+'\r next\n';
  assert.deepEqual(pairs(parse(bytes(input),{profile:latin})),[['odd','firstsecond'],['even','two\\'],['mixed','one\\next']]);
  assert.deepEqual(pairs(parse(bytes('key=first\\\n #this-is-value'),{profile:latin})),[['key','first#this-is-value']]);
  code(()=>parse(bytes('key=tail\\'),{profile:latin}),'UNSUPPORTED_TRAILING_ESCAPE');
  code(()=>parse(bytes('\\\n#comment'),{profile:latin}),'UNSUPPORTED_EMPTY_CONTINUATION');
});
test('escape processing follows single Unicode escapes and drops unknown escape prefixes',()=>{
  assert.deepEqual(pairs(parse(bytes(String.raw`escaped\ key\:\==\t\n\r\f\z\b\u0041`),{profile:latin})),[['escaped key:=','\t\n\r\fzbA']]);
  for(const value of [String.raw`k=\uu0041`,String.raw`k=\u041`,String.raw`k=\uQQQQ`])code(()=>parse(bytes(value),{profile:latin}),'MALFORMED_UNICODE_ESCAPE');
  assert.equal(parse(bytes(String.raw`k=\uD800`),{profile:latin}).entries[0].value.charCodeAt(0),0xD800);
});
test('decoded duplicate keys reject replacement and identical values',()=>{
  for(const value of ['a=1\na=1',String.raw`a=1`+'\n'+String.raw`\u0061=2`,String.raw`a\ b=1`+'\n'+String.raw`a\u0020b=2`])code(()=>parse(bytes(value),{profile:latin}),'DUPLICATE_DECODED_KEY');
  assert.deepEqual(pairs(parse(bytes('__proto__=preserved\nconstructor=preserved\nprototype=preserved'),{profile:latin})),[['__proto__','preserved'],['constructor','preserved'],['prototype','preserved']]);
});
test('encoding profiles never guess or remove a byte-order mark',()=>{
  const input=Buffer.from('name=廣東話','utf8');
  assert.equal(parse(input,{profile:utf8}).entries[0].value,'廣東話');
  assert.notEqual(parse(input,{profile:latin}).entries[0].value,'廣東話');
  assert.equal(parse(Buffer.from([0x6b,0x3d,0x80]),{profile:latin}).entries[0].value.charCodeAt(0),0x80);
  code(()=>parse(Buffer.from([0x6b,0x3d,0xc3]),{profile:utf8}),'MALFORMED_UTF8');
  const bom=Buffer.from([0xef,0xbb,0xbf,0x6b,0x3d,0x76]);
  assert.equal(parse(bom,{profile:utf8}).entries[0].key,'\uFEFFk');
  assert.equal(parse(bom,{profile:latin}).entries[0].key,'ï»¿k');
  code(()=>parse(input,{profile:'autodetect'}),'UNSUPPORTED_ENCODING_PROFILE');
});
test('bounds reject bytes before profile decoding and cap entries, lines and logical characters',()=>{
  code(()=>parse(Buffer.alloc(PROPERTIES_LIMITS.bytes+1),{profile:'unsupported'}),'BYTE_LIMIT');
  code(()=>parse('not bytes',{profile:latin}),'BYTE_INPUT_REQUIRED');
  code(()=>parse(bytes('k='+ 'v'.repeat(PROPERTIES_LIMITS.logicalCharacters)),{profile:latin}),'LOGICAL_LINE_LIMIT');
  code(()=>parse(bytes(Array.from({length:PROPERTIES_LIMITS.entries+1},(_,i)=>`k${i}=v`).join('\n')),{profile:latin}),'ENTRY_LIMIT');
  code(()=>parse(bytes('\n'.repeat(PROPERTIES_LIMITS.naturalLines)),{profile:latin}),'NATURAL_LINE_LIMIT');
});
test('exact byte binding retains original bytes without manufacturing defaults or admission',()=>{
  const data=bytes('server-ip=127.0.0.1\nenable-query=false\n');const result=inspect(data,binding(data));
  assert.equal(result.status,'parsed-unadmitted');assert.equal(result.configurationAdmitted,false);assert.equal(result.parsed.rawSha256,binding(data).propertiesSha256);
  assert.equal(result.parsed.byteCount,data.length);assert.deepEqual(result.missingEvidence,['exact-distribution-generated-defaults','exact-version-loader-profile','exact-version-network-consumers','complete-loading-tree-isolation']);
  assert.ok(Object.isFrozen(result.binding)&&Object.isFrozen(result.parsed.entries));
  data.fill(0);assert.equal(result.parsed.entries[0].value,'127.0.0.1');
  const missing=inspect(bytes(''),binding(bytes('')));assert.equal(missing.status,'parsed-unadmitted');assert.deepEqual(missing.parsed.entries,[]);
});
test('unsupported states are precise, bounded and cannot accept caller proof flags',()=>{
  const data=bytes('k=v');const original=binding(data);
  for(const [change,reason] of [[{version:'1.21.8'},'UNSUPPORTED_VERSION'],[{edition:'bedrock'},'UNSUPPORTED_VERSION'],[{propertiesSha256:'b'.repeat(64)},'SOURCE_BYTE_BINDING_MISMATCH'],[{generatedVerified:true},'INVALID_INSPECTION_BINDING'],[{profile:'autodetect'},'UNSUPPORTED_ENCODING_PROFILE']]){
    const result=inspect(data,{...original,...change});assert.deepEqual(result,{status:'unavailable',configurationAdmitted:false,reason});
  }
  const broker=readFileSync('native/MaterialFileEncryptor.Host/ServerLeaseBroker.cs','utf8');assert.match(broker,/ConfigurationAdmitted\(Entry entry\) => false/);
  assert.throws(()=>assert.match(broker.replace('ConfigurationAdmitted(Entry entry) => false','ConfigurationAdmitted(Entry entry) => true'),/ConfigurationAdmitted\(Entry entry\) => false/));
});
test('binding accessors and proxies cannot change the retained source identity',()=>{
  const data=bytes('k=v'),original=binding(data);let reads=0;
  const changing={...original};Object.defineProperty(changing,'propertiesSha256',{enumerable:true,get(){return ++reads<=2?original.propertiesSha256:'b'.repeat(64);}});
  assert.deepEqual(inspect(data,changing),{status:'unavailable',configurationAdmitted:false,reason:'INVALID_INSPECTION_BINDING'});assert.equal(reads,0);
  let traps=0;const proxy=new Proxy(original,{get(){traps++;throw Error('must not read');},ownKeys(){traps++;throw Error('must not enumerate');}});
  assert.equal(inspect(data,proxy).reason,'INVALID_INSPECTION_BINDING');assert.equal(traps,0);
  const result=inspect(data,original);original.propertiesSha256='b'.repeat(64);assert.equal(result.binding.propertiesSha256,result.parsed.rawSha256);
});
test('intrinsic byte bounds reject oversized subclasses and unsupported storage',()=>{
  class HiddenByteLength extends Uint8Array{get byteLength(){return 0;}}
  const oversized=new HiddenByteLength(PROPERTIES_LIMITS.bytes+1);oversized.fill(32);
  code(()=>parse(oversized,{profile:latin}),'BYTE_LIMIT');
  let reads=0;class HiddenLength extends Uint8Array{get byteLength(){reads++;return 0;}get length(){reads++;return 0;}[Symbol.iterator](){throw Error('must not iterate');}}
  code(()=>parse(new HiddenLength(PROPERTIES_LIMITS.bytes+1),{profile:latin}),'BYTE_LIMIT');assert.equal(reads,0);
  const data=new HiddenLength([0x6b,0x3d,0x76]);assert.deepEqual(pairs(parse(data,{profile:latin})),[['k','v']]);assert.equal(reads,0);
  code(()=>parse(new Proxy(bytes('k=v'),{}),{profile:latin}),'BYTE_INPUT_REQUIRED');
  // Use a dedicated transferable array buffer, without Buffer pool storage.
  const owned=new Uint8Array(new ArrayBuffer(3));owned.set([0x6b,0x3d,0x76]);structuredClone(owned.buffer,{transfer:[owned.buffer]});
  code(()=>parse(owned,{profile:latin}),'UNSUPPORTED_BYTE_STORAGE');
});
