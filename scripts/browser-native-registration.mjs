import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseStrictJson} from '../src/shared/personal-vocabulary.js';

export const NATIVE_HOST='org.dingding.material_file_encryptor.downloads';
const digest=value=>createHash('sha256').update(value).digest('hex');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export function extensionId(publicKey){return digest(publicKey).slice(0,32).replace(/[0-9a-f]/g,char=>String.fromCharCode(97+parseInt(char,16)));}
function fields(bytes){
 let offset=0;const rows=[];
 const integer=()=>{let value=0,multiple=1;for(let count=0;count<5;count++){if(offset>=bytes.length)throw Error('Truncated CRX3 header.');const byte=bytes[offset++];value+=(byte&127)*multiple;if(!(byte&128))return value;multiple*=128;}throw Error('Invalid CRX3 integer.');};
 while(offset<bytes.length){const tag=integer(),number=Math.floor(tag/8);if((tag&7)!==2||!number)throw Error('Unsupported CRX3 header field.');const length=integer();if(length>bytes.length-offset)throw Error('Truncated CRX3 field.');rows.push([number,bytes.subarray(offset,offset+length)]);offset+=length;}
 return rows;
}
/** Verify package bytes, rather than trusting a receipt's success declaration. */
export function verifyExtensionIdentity(packageBytes,receipt){
 if(!Buffer.isBuffer(packageBytes)||packageBytes.length<16||packageBytes.length>32*1024*1024||packageBytes.toString('ascii',0,4)!=='Cr24'||packageBytes.readUInt32LE(4)!==3)throw Error('A bounded CRX3 package is required.');
 if(!exact(receipt,['schemaVersion','format','signatureVerified','extensionId','publicKeyDerBase64','packageSha256','publicKeySha256'])||receipt.schemaVersion!==1||receipt.format!=='CRX3'||receipt.signatureVerified!==true||!/^[a-p]{32}$/.test(receipt.extensionId)||typeof receipt.publicKeyDerBase64!=='string'||receipt.publicKeyDerBase64.length>8192||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(receipt.publicKeyDerBase64)||!/^[a-f0-9]{64}$/.test(receipt.packageSha256)||!/^[a-f0-9]{64}$/.test(receipt.publicKeySha256))throw Error('A complete reviewed identity receipt is required.');
 const key=Buffer.from(receipt.publicKeyDerBase64,'base64');if(!key.length||key.toString('base64')!==receipt.publicKeyDerBase64||digest(key)!==receipt.publicKeySha256||digest(packageBytes)!==receipt.packageSha256||extensionId(key)!==receipt.extensionId)throw Error('Extension identity receipt does not match the package.');
 const headerLength=packageBytes.readUInt32LE(8);if(!headerLength||headerLength>1024*1024||12+headerLength+4>packageBytes.length)throw Error('Invalid CRX3 header length.');
 const header=fields(packageBytes.subarray(12,12+headerLength));if(header.some(([number])=>![2,3,10000].includes(number)))throw Error('Unsupported CRX3 header field.');
 const signedHeaders=header.filter(([number])=>number===10000);if(signedHeaders.length!==1)throw Error('CRX3 signed identity is missing.');const signed=signedHeaders[0][1],identityFields=fields(signed);
 if(identityFields.length!==1||identityFields[0][0]!==1||identityFields[0][1].length!==16||!identityFields[0][1].equals(createHash('sha256').update(key).digest().subarray(0,16)))throw Error('CRX3 signed identity does not match.');
 const payload=packageBytes.subarray(12+headerLength);if(payload.readUInt32LE(0)!==0x04034b50)throw Error('CRX3 ZIP payload is missing.');const length=Buffer.alloc(4);length.writeUInt32LE(signed.length);
 const signedBytes=Buffer.concat([Buffer.from('CRX3 SignedData\0','ascii'),length,signed,payload]);
 const publicKey=createPublicKey({key,format:'der',type:'spki'});
 const matched=header.filter(([number])=>number===2||number===3).some(([number,proof])=>{
  const entries=fields(proof);if(entries.length!==2||entries.filter(([tag])=>tag===1).length!==1||entries.filter(([tag])=>tag===2).length!==1)return false;
  const proofKey=entries.find(([tag])=>tag===1)[1],signature=entries.find(([tag])=>tag===2)[1];
  return proofKey.equals(key)&&(number===2&&publicKey.asymmetricKeyType==='rsa'||number===3&&publicKey.asymmetricKeyType==='ec')&&verify('sha256',signedBytes,publicKey,signature);
 });if(!matched)throw Error('CRX3 signature verification failed.');
 return{extensionId:receipt.extensionId,origin:`chrome-extension://${receipt.extensionId}/`,packageSha256:receipt.packageSha256,publicKeySha256:receipt.publicKeySha256};
}
export function createRegistrationPlan({packageBytes,receipt,hostPath,manifestPath}){
 const identity=verifyExtensionIdentity(packageBytes,receipt);
 for(const target of [hostPath,manifestPath])if(typeof target!=='string'||target.length>1024||!path.win32.isAbsolute(target)||! /^[A-Za-z]:\\/.test(target)||/[\x00-\x1f"\r\n]/.test(target)||/[<>|?*:]/.test(target.slice(2))||target.split(/[\\/]/).some(piece=>piece==='.'||piece==='..'||/[ .]$/.test(piece)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(piece))||path.win32.normalize(target)!==target)throw Error('Use normalized absolute installed Windows paths.');
 if(path.win32.basename(hostPath)!=='MaterialFileEncryptor.BrowserHost.exe'||path.win32.extname(manifestPath)!=='.json')throw Error('Native host paths do not name the expected installed files.');
 const manifest={name:NATIVE_HOST,description:'Material File Encryptor download handoff',path:hostPath,type:'stdio',allowed_origins:[identity.origin]};
 const config={schemaVersion:1,host:NATIVE_HOST,allowedOrigins:[identity.origin],identity:{extensionId:identity.extensionId,packageSha256:identity.packageSha256,publicKeySha256:identity.publicKeySha256}};
 return{schemaVersion:1,identity,manifest,config,registration:[`HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST}`,`HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST}`].map(key=>({key,valueName:'',value:manifestPath})),installation:'not-performed',registryMutation:'not-performed'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [packageFile,receiptFile,hostPath,manifestPath,outputDirectory]=process.argv.slice(2);
 if(!outputDirectory)throw Error('Usage: browser-native-registration.mjs <reviewed.crx> <identity.json> <installed-host.exe> <installed-manifest.json> <output-directory>');
 const stat=await fs.stat(packageFile);if(!stat.isFile()||stat.size>32*1024*1024)throw Error('CRX3 package exceeds 32 MiB.');const receiptBytes=await fs.readFile(receiptFile);if(receiptBytes.length>16384)throw Error('Identity receipt exceeds its limit.');
 const plan=createRegistrationPlan({packageBytes:await fs.readFile(packageFile),receipt:parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(receiptBytes)),hostPath,manifestPath});await fs.mkdir(outputDirectory,{recursive:true});
 for(const [name,value]of [['registration-plan.json',plan],['browser-host-config.json',plan.config],[`${NATIVE_HOST}.json`,plan.manifest]])await fs.writeFile(path.join(outputDirectory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('Verified native host manifest and HKCU registration plan generated. Installation and registry changes were not performed.');
}
