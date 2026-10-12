import {createHash} from 'node:crypto';

// Inspection only. This module is not a native admission capability and accepts
// no generated-default, loader or consumer proof supplied by a renderer.
export const PROPERTIES_LIMITS=Object.freeze({bytes:1024*1024,entries:4096,logicalCharacters:65536,naturalLines:32768});
export const PROPERTIES_PROFILES=Object.freeze(['java-inputstream-latin1','utf8-reader-strict']);
export class PropertiesInspectionError extends Error {
  constructor(code){super(code);this.name='PropertiesInspectionError';this.code=code;}
}
const fail=code=>{throw new PropertiesInspectionError(code);};
const whitespace=character=>character===' '||character==='\t'||character==='\f';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function boundedBytes(bytes){
  if(!(bytes instanceof Uint8Array))fail('BYTE_INPUT_REQUIRED');
  if(bytes.byteLength>PROPERTIES_LIMITS.bytes)fail('BYTE_LIMIT');
  // Snapshot after the bound, before hashing and decoding, so caller mutation
  // cannot bind one byte sequence to another parse result.
  return Buffer.from(bytes);
}
function unescape(text){
  let result='';
  for(let index=0;index<text.length;index++){
    let character=text[index];
    if(character!=='\\'){result+=character;continue;}
    if(++index>=text.length)fail('UNSUPPORTED_TRAILING_ESCAPE');
    character=text[index];
    if(character==='u'){
      const hex=text.slice(index+1,index+5);
      if(hex.length!==4||!/^[0-9a-fA-F]{4}$/.test(hex))fail('MALFORMED_UNICODE_ESCAPE');
      result+=String.fromCharCode(Number.parseInt(hex,16));index+=4;
    }else result+=({t:'\t',n:'\n',r:'\r',f:'\f'})[character]??character;
  }
  return result;
}
function entry(line,lineNumber){
  let index=0;while(whitespace(line[index]))index++;
  const start=index;let escaped=false;
  while(index<line.length){
    const character=line[index];
    if(!escaped&&(character==='='||character===':'||whitespace(character)))break;
    if(character==='\\')escaped=!escaped;else escaped=false;
    index++;
  }
  const key=unescape(line.slice(start,index));
  while(whitespace(line[index]))index++;
  if(line[index]==='='||line[index]===':')index++;
  while(whitespace(line[index]))index++;
  return Object.freeze({key,value:unescape(line.slice(index)),line:lineNumber});
}
export function parseJavaProperties(bytes,{profile}={}){
  const snapshot=boundedBytes(bytes);
  if(!PROPERTIES_PROFILES.includes(profile))fail('UNSUPPORTED_ENCODING_PROFILE');
  let text;
  if(profile==='java-inputstream-latin1')text=snapshot.toString('latin1');
  else{
    try{
      // Reader receives characters, not BOM removal. Preserve U+FEFF as data.
      // Malformed UTF-8 is rejected by this deliberately strict profile.
      text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(snapshot);
    }catch{fail('MALFORMED_UTF8');}
  }
  const lines=text.split(/\r\n|\r|\n/);
  if(lines.length>PROPERTIES_LIMITS.naturalLines)fail('NATURAL_LINE_LIMIT');
  const entries=[],seen=new Set();let logical='',continued=false,start=0;
  for(let number=0;number<lines.length;number++){
    let natural=lines[number];
    if(!continued){
      let index=0;while(whitespace(natural[index]))index++;
      if(index===natural.length||natural[index]==='#'||natural[index]==='!')continue;
      natural=natural.slice(index);start=number+1;
    }else{let index=0;while(whitespace(natural[index]))index++;natural=natural.slice(index);}
    if(logical.length+natural.length>PROPERTIES_LIMITS.logicalCharacters)fail('LOGICAL_LINE_LIMIT');
    let slashes=0;for(let index=natural.length-1;index>=0&&natural[index]==='\\';index--)slashes++;
    const nextContinued=slashes%2===1;
    if(nextContinued&&number===lines.length-1)fail('UNSUPPORTED_TRAILING_ESCAPE');
    // Empty continuation chains have special comment/EOF behavior in Java's
    // line reader. Keep that boundary unsupported rather than invent a key.
    if(nextContinued&&logical.length+natural.length===1)fail('UNSUPPORTED_EMPTY_CONTINUATION');
    logical+=nextContinued?natural.slice(0,-1):natural;
    continued=nextContinued;
    if(continued)continue;
    const parsed=entry(logical,start);logical='';
    // Java can replace prior keys. Admission inspection deliberately rejects
    // ambiguity, including decoded aliases and identical repeated values.
    if(seen.has(parsed.key))fail('DUPLICATE_DECODED_KEY');
    if(entries.length>=PROPERTIES_LIMITS.entries)fail('ENTRY_LIMIT');
    seen.add(parsed.key);entries.push(parsed);
  }
  return Object.freeze({status:'parsed',profile,rawSha256:hash(snapshot),byteCount:snapshot.byteLength,entries:Object.freeze(entries)});
}
const missing=Object.freeze(['exact-distribution-generated-defaults','exact-version-loader-profile','exact-version-network-consumers','complete-loading-tree-isolation']);
export function inspectJava1219Configuration(bytes,binding){
  try{
    const keys=['edition','version','distributionSha256','propertiesSha256','profile'];
    if(!binding||Object.keys(binding).length!==keys.length||Object.keys(binding).some(key=>!keys.includes(key)))fail('INVALID_INSPECTION_BINDING');
    if(binding.edition!=='java'||binding.version!=='1.21.9')fail('UNSUPPORTED_VERSION');
    if(!/^[a-f0-9]{64}$/.test(binding.distributionSha256)||!/^[a-f0-9]{64}$/.test(binding.propertiesSha256))fail('INVALID_INSPECTION_BINDING');
    const parsed=parseJavaProperties(bytes,{profile:binding.profile});
    if(parsed.rawSha256!==binding.propertiesSha256)fail('SOURCE_BYTE_BINDING_MISMATCH');
    return Object.freeze({status:'parsed-unadmitted',configurationAdmitted:false,binding:Object.freeze({...binding}),parsed,missingEvidence:missing});
  }catch(error){
    if(!(error instanceof PropertiesInspectionError))throw error;
    return Object.freeze({status:'unavailable',configurationAdmitted:false,reason:error.code});
  }
}
