import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createConverterService} from '../src/features/converter/service.mjs';
import {convertBuiltin} from '../src/features/converter/registry.mjs';
import {createBrowserConverterAdapter,createBrowserConverterMediation,validateBrowserConverterRequest} from '../src/main/browser-converter.js';
const session='s'.repeat(43),origin='chrome-extension://'+'a'.repeat(32)+'/';
const message=(type,fields={})=>({type,session,language:'en',...fields});
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'browser-converter-')),source=path.join(root,'private-source.txt'),destination=path.join(root,'private-output.txt'),queue=path.join(root,'queue');await fs.writeFile(source,'private contents');let launches=0;
 const service=createConverterService({stateDirectory:queue,resolveGrant:async id=>id==='source'?source:destination,sandboxProvider:{verifiedOsIsolation:true,launch({inputs,adapterId}){launches++;return {result:Promise.resolve(convertBuiltin(adapterId,inputs[0])),terminate:async()=>{}};}}});
 return {root,queue,source,destination,service,get launches(){return launches;},async close(){await service.close();await fs.rm(root,{recursive:true,force:true});}};
}
test('native converter admission rejects cancellation before atomic queue publication',async()=>{
 const f=await fixture();try{let checks=0;await assert.rejects(f.service.enqueue({sourceIds:['source'],destinationId:'destination',adapterId:'base64'},{owner:randomUUID(),checkAdmission(){if(++checks===2)throw Error('revoked');}}),/revoked/);assert.equal(checks,2);assert.equal(f.launches,0);assert.deepEqual(await fs.readdir(f.queue),[]);await assert.rejects(fs.access(f.destination));}finally{await f.close();}
});
test('accepted durable conversion continues without an ephemeral browser admission check',async()=>{
 const f=await fixture();try{let checks=0;const owner=randomUUID(),other=randomUUID();const row=await f.service.enqueue({sourceIds:['source'],destinationId:'destination',adapterId:'base64'},{owner,checkAdmission(){checks++;}});assert.equal(checks,2);await f.service.run();for(let i=0;i<30&&(await f.service.list({}, {owner}))[0]?.state!=='completed';i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal((await f.service.list({}, {owner}))[0].state,'completed');assert.equal(checks,2);assert.deepEqual(await f.service.list({}, {owner:other}),[]);await assert.rejects(f.service.control({id:row.id,action:'cancel'},{owner:other}),/outside/);assert.equal(await fs.readFile(f.destination,'utf8'),Buffer.from('private contents').toString('base64'));}finally{await f.close();}
});
test('native browser adapter exposes type and size, fixed formats and only owned job state',async()=>{
 const f=await fixture();try{const confirmations=[],adapter=createBrowserConverterAdapter({getService:async()=>f.service,pickSource:async()=> 'source',pickDestination:async()=> 'destination',confirm:async value=>{confirmations.push(value.kind);return true;},releaseGrant:async()=>{}}),pair={},context={pair,check(){},signal:new AbortController().signal};
 const catalog=await adapter(message('converter-catalog'),context);assert.equal(catalog.formats.filter(row=>row.enabled).length,4);assert.ok(catalog.formats.some(row=>row.category==='Video'&&!row.enabled));
 const selected=await adapter(message('converter-prepare'),context);assert.deepEqual(Object.keys(selected).sort(),['bytes','outcome','schemaVersion','selection','sourceType','type']);assert.equal(selected.sourceType,'text');
 const result=await adapter(message('converter-enqueue',{selection:selected.selection,adapterId:'base64'}),context);assert.equal(result.outcome,'accepted');assert.deepEqual(Object.keys(result.job).sort(),['adapterId','id','progress','state']);assert.deepEqual(confirmations,['prepare','enqueue']);
 const own=await adapter(message('converter-list',{cursor:null}),context),other=await adapter(message('converter-list',{cursor:null}),{...context,pair:{}});assert.equal(own.rows.length,1);assert.equal(other.rows.length,0);const encoded=JSON.stringify([selected,result,own]);assert.ok(!encoded.includes('private'));assert.ok(!encoded.includes('outputs'));assert.ok(!encoded.includes('sha256'));
 }finally{await f.close();}
});
test('converter messages reject paths, options, invalid identifiers and language',()=>{
 for(const row of [message('converter-enqueue',{selection:randomUUID(),adapterId:'base64',path:'private'}),message('converter-enqueue',{selection:[randomUUID()],adapterId:'base64'}),message('converter-enqueue',{selection:randomUUID(),adapterId:'pdf-merge'}),message('converter-list',{cursor:-1}),{...message('converter-prepare'),language:'unknown'},message('converter-control',{id:randomUUID(),action:'delete'})])assert.throws(()=>validateBrowserConverterRequest(row));
});
test('native converter mediation revokes delayed selection and requires a current connection',async()=>{
 let pair={session,expires:Date.now()+100000},resume,continued=false;const service=createBrowserConverterMediation({getPair:()=>pair,isUnlocked:()=>true,adapter:async(_message,{check})=>{await new Promise(resolve=>resume=resolve);check();continued=true;return {};}});
 const request=service.receive(origin,message('converter-prepare'),()=>{}),rejected=assert.rejects(request);await new Promise(resolve=>setImmediate(resolve));service.revoke();resume();await rejected;assert.equal(continued,false);
 await assert.rejects(service.receive(origin,message('converter-catalog'),()=>{throw Error('Disconnected');}),/Disconnected/);service.close();
});
