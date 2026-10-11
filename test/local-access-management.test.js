import test from 'node:test';
import assert from 'node:assert/strict';
import {exportAuthenticatorMetadata,diagnoseClockSkew,exportTickets,selectRecords,TICKET_PRIVACY_DISCLOSURE} from '../src/renderer/features/access/management.js';
import {totp} from '../src/renderer/features/access/crypto.js';
const entry={id:'one',issuer:'Example',account:'sample@example.test',group:'Work',secret:'JBSWY3DPEHPK3PXP',algorithm:'SHA1',digits:6,period:30};
test('authenticator metadata export requires explicit authentication and omits all extra fields',()=>{
  const records=[{...entry,code:'123456',password:'private',nested:{secret:'private'}}];
  assert.throws(()=>exportAuthenticatorMetadata(records,['one']),/Unlock/);
  assert.throws(()=>exportAuthenticatorMetadata(records,['one'],{authenticated:'true'}),/Unlock/);
  const exported=exportAuthenticatorMetadata(records,['one'],{authenticated:true});
  assert.equal(exported.secretsIncluded,false);assert.equal(JSON.stringify(exported).includes(entry.secret),false);
  assert.deepEqual(Object.keys(exported.entries[0]),['id','issuer','account','group','algorithm','digits','period']);
});
test('selection rejects duplicates, unknown identifiers and excessive records',()=>{
  assert.throws(()=>selectRecords([entry],['one','one']),/duplicate/);
  assert.throws(()=>selectRecords([entry],['missing']),/unknown/);
  assert.throws(()=>selectRecords([entry,entry],['one']),/Duplicate/);
  assert.throws(()=>selectRecords(Array(1001).fill(entry),[]),/Too many/);
  assert.deepEqual(selectRecords([entry],[]),[]);
});
test('clock diagnostic returns bounded offsets without codes or secrets',async()=>{
  const now=1234567890000,code=await totp(entry,now+60000);
  const result=await diagnoseClockSkew(entry,code,{now,maxPeriods:4});assert.equal(result.status,'offset-detected');assert.equal(result.offsetPeriods,2);assert.equal(result.offsetSeconds,60);assert.equal(JSON.stringify(result).includes(code),false);assert.equal(JSON.stringify(result).includes(entry.secret),false);
  assert.equal((await diagnoseClockSkew(entry,await totp(entry,now),{now})).status,'aligned');
  await assert.rejects(diagnoseClockSkew(entry,code,{now,maxPeriods:11}),/bounds/);
  await assert.rejects(diagnoseClockSkew(entry,'not a code',{now}),/code/);
});
test('ticket export is selected, bounded, allowlisted and carries local privacy disclosure',()=>{
  const ticket={id:'ticket',category:'Reset',description:'Local question',status:'Created locally',stage:0,secret:'must not export'};
  const result=exportTickets([ticket],['ticket']);assert.equal(result.privacyDisclosure,TICKET_PRIVACY_DISCLOSURE);assert.equal(result.tickets.length,1);assert.equal('secret' in result.tickets[0],false);
  assert.throws(()=>exportTickets([{...ticket,description:'x'.repeat(2001)}],['ticket']),/description/);
});
