import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {refreshRouteInventory} from '../scripts/refresh-public-route-contracts.mjs';
import {REQUIRED_FEATURE_IDS} from '../src/features/documentation/required-features.mjs';
const inventory=JSON.parse(fs.readFileSync(new URL('../docs/features/platform/public-route-contracts.json',import.meta.url)));
const catalog=JSON.parse(fs.readFileSync(new URL('../docs/site/content-catalog.json',import.meta.url)));
test('route refresh restores missing declarations without changing the input or inventing acceptance',()=>{
 const input=structuredClone(inventory);input.routes.pop();input.features.pop();const before=structuredClone(input);
 const result=refreshRouteInventory(input,catalog);assert.deepEqual(input,before);assert.equal(result.routes.length,inventory.routes.length);
 assert.deepEqual(result.features.map(row=>row.id),[...REQUIRED_FEATURE_IDS]);
 for(const row of [...result.features,...result.routes]){assert.equal(row.status,'unverified');assert.deepEqual(row.browserEvidence,[]);}
 assert.deepEqual(refreshRouteInventory(result,catalog),result);
});
test('route refresh preserves explicitly retained nested surfaces',()=>{
 const input=structuredClone(inventory);input.routes[0].nestedSurfaces.push('owned-existing-surface');
 assert.ok(refreshRouteInventory(input,catalog).routes[0].nestedSurfaces.includes('owned-existing-surface'));
});
test('route refresh rejects evidence-bearing rows before replacing declarations',()=>{
 for(const mutate of [v=>v.routes[0].status='verified',v=>v.routes[0].browserEvidence.push('receipt'),v=>v.features[0].status='verified',v=>v.features[0].browserEvidence.push('receipt'),v=>delete v.routes[0].browserEvidence]){
  const value=structuredClone(inventory);mutate(value);const before=structuredClone(value);assert.throws(()=>refreshRouteInventory(value,catalog),/Evidence-bearing/);assert.deepEqual(value,before);
 }
});
test('route refresh rejects duplicate existing and generated declarations',()=>{
 for(const key of ['routes','features']){const value=structuredClone(inventory);value[key].push(structuredClone(value[key][0]));assert.throws(()=>refreshRouteInventory(value,catalog),/Duplicate existing/);}
 const duplicate=structuredClone(catalog);duplicate.articles.push(duplicate.articles[0]);assert.throws(()=>refreshRouteInventory(inventory,duplicate),/Duplicate generated/);
});
