import {totp,validateOtp} from './crypto.js';

const MAX_RECORDS=1000;
export const TICKET_PRIVACY_DISCLOSURE='Nothing is sent anywhere. No ticket exists outside this machine, no network request is made, no data is collected, and nobody is reading it.';

function text(value,limit,label){if(typeof value!=='string'||value.length>limit)throw new Error(`Invalid ${label}.`);return value;}
function recordsById(records){
  if(!Array.isArray(records)||records.length>MAX_RECORDS)throw new Error('Too many records.');
  const index=new Map();for(const record of records){if(!record||typeof record!=='object')throw new Error('Invalid record.');const id=text(record.id,128,'record identifier');if(!id||index.has(id))throw new Error('Duplicate or empty record identifier.');index.set(id,record);}return index;
}
export function selectRecords(records,selectedIds){
  const index=recordsById(records);
  if(!Array.isArray(selectedIds)||selectedIds.length>MAX_RECORDS)throw new Error('Invalid selection.');
  const selected=new Set();return selectedIds.map(id=>{text(id,128,'selected identifier');if(selected.has(id)||!index.has(id))throw new Error('Selection contains an unknown or duplicate identifier.');selected.add(id);return index.get(id);});
}

/** Exports an explicit allowlist only; secret-bearing fields never cross this boundary. */
export function exportAuthenticatorMetadata(records,selectedIds,{authenticated=false}={}){
  if(authenticated!==true)throw new Error('Unlock the local profile first.');
  const selected=selectRecords(records,selectedIds);
  return {version:1,type:'authenticator-metadata',secretsIncluded:false,omissions:['Secrets and generated codes are omitted.'],entries:selected.map(record=>{
    if(!['SHA1','SHA256','SHA512'].includes(record.algorithm)||![6,7,8].includes(record.digits)||!Number.isSafeInteger(record.period)||record.period<1||record.period>86400)throw new Error('Invalid authenticator parameters.');
    return {id:record.id,issuer:text(record.issuer??'',256,'issuer'),account:text(record.account??'',256,'account'),group:text(record.group??'',128,'group'),algorithm:record.algorithm,digits:record.digits,period:record.period};
  })};
}

/** Local, bounded diagnostic. The result contains offsets, never input or generated codes. */
export async function diagnoseClockSkew(entry,observedCode,{now=Date.now(),maxPeriods=4}={}){
  validateOtp(entry);
  if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(maxPeriods)||maxPeriods<0||maxPeriods>10)throw new Error('Invalid clock diagnostic bounds.');
  if(typeof observedCode!=='string'||!new RegExp(`^\\d{${entry.digits}}$`).test(observedCode))throw new Error('Invalid authenticator code.');
  const matchingOffsets=[];
  for(let offset=-maxPeriods;offset<=maxPeriods;offset++){
    const time=now+offset*entry.period*1000;if(time<0)continue;
    if(await totp(entry,time)===observedCode)matchingOffsets.push(offset);
  }
  if(matchingOffsets.length!==1)return {status:matchingOffsets.length?'ambiguous':'no-match',offsetPeriods:null,offsetSeconds:null,searchedPeriods:maxPeriods};
  const offsetPeriods=matchingOffsets[0];return {status:offsetPeriods===0?'aligned':'offset-detected',offsetPeriods,offsetSeconds:offsetPeriods*entry.period,searchedPeriods:maxPeriods};
}

export function exportTickets(records,selectedIds){
  return {version:1,type:'local-support-tickets',privacyDisclosure:TICKET_PRIVACY_DISCLOSURE,tickets:selectRecords(records,selectedIds).map(record=>{
    if(!Number.isInteger(record.stage)||record.stage<0||record.stage>2)throw new Error('Invalid ticket stage.');
    return {id:record.id,category:text(record.category,100,'ticket category'),description:text(record.description,2000,'ticket description'),status:text(record.status,120,'ticket status'),stage:record.stage};
  })};
}
