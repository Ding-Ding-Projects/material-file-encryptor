import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

// Each order runs in a fresh process so the JSON module cache is genuinely fresh.
for(const order of ['before','after'])test('shared JSON mutation '+order+' validator import cannot shrink acquisition authority',()=>{
 const inventoryUrl=new URL('../contracts/gui-states.json',import.meta.url).href;
 const validatorUrl=new URL('../scripts/gui-acceptance-acquire.mjs',import.meta.url).href;
 const matrixUrl=new URL('../scripts/gui-acceptance.mjs',import.meta.url).href;
 const source=`
 import assert from 'node:assert/strict';
 import fs from 'node:fs/promises';
 const inventoryUrl=${JSON.stringify(inventoryUrl)},validatorUrl=${JSON.stringify(validatorUrl)};
 const original=await fs.readFile(new URL(inventoryUrl));
 const shared=(await import(inventoryUrl,{with:{type:'json'}})).default;
 let validator;
 if(${JSON.stringify(order)}==='after')validator=await import(validatorUrl);
 shared.states.pop();shared.states[0].actions.splice(0,1);
 if(${JSON.stringify(order)}==='before')validator=await import(validatorUrl);
 const {matrixFor}=await import(${JSON.stringify(matrixUrl)});
 assert.equal(shared.states.length,88);const shortened=matrixFor(shared);assert.equal(shortened.length,4224);
 for(const mode of ['full','diagnostic-subset'])assert.throws(()=>validator.validateAcquisitionRequest({inventory:shared,tuples:shortened,mode}),/Complete current state inventory/);
 let failure;try{validator.validateAcquisitionRequest({inventory:shared,tuples:shortened});}catch(error){failure=error;}
 assert.ok(Object.isFrozen(failure.expected));assert.ok(Object.isFrozen(failure.expected.states));assert.ok(Object.isFrozen(failure.expected.states[0].actions));
 assert.throws(()=>failure.expected.states.pop(),TypeError);assert.throws(()=>failure.expected.states[0].actions.pop(),TypeError);
 const canonical=JSON.parse(original);const result=validator.validateAcquisitionRequest({inventory:canonical,tuples:matrixFor(canonical)});
 assert.equal(result.expected,4272);assert.equal(result.requested,4272);assert.equal(result.complete,true);assert.equal(result.accepted,false);
 canonical.states[0].actions.pop();assert.throws(()=>validator.validateAcquisitionRequest({inventory:canonical,tuples:matrixFor(canonical)}),/Complete current state inventory/);
 assert.deepEqual(await fs.readFile(new URL(inventoryUrl)),original,'Canonical file bytes changed');
 console.log('authority remains 89 states / 4272 tuples; disk unchanged');
 `;
 const result=spawnSync(process.execPath,['--input-type=module'],{input:source,encoding:'utf8',timeout:30000,windowsHide:true});
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr||result.stdout);assert.match(result.stdout,/authority remains 89 states/);
});
