import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {REQUIRED_FEATURE_IDS} from '../src/features/documentation/required-features.mjs';
import {route} from '../docs/site/publication.mjs';
const inventory=JSON.parse(fs.readFileSync(new URL('../docs/features/platform/public-route-contracts.json',import.meta.url)));
const catalog=JSON.parse(fs.readFileSync(new URL('../docs/site/content-catalog.json',import.meta.url)));
const expected=['index.html','library.html','wiki.html','gallery.html','workspace.html',...catalog.categories.map(id=>`categories/${id}.html`),...catalog.articles.map(route),...catalog.wiki.files.map(file=>route('wiki/'+file))].sort();
function validate(value){
 assert.deepEqual(value.features.map(row=>row.id),[...REQUIRED_FEATURE_IDS]);
 assert.deepEqual(value.routes.map(row=>row.path).sort(),expected);
 for(const row of [...value.features,...value.routes]){assert.equal(row.status,'unverified');assert.deepEqual(row.browserEvidence,[]);}
 for(const row of value.routes){assert.deepEqual(row.contracts,[...REQUIRED_FEATURE_IDS]);assert.ok(row.nestedSurfaces.includes('regex-builder'));assert.ok(row.nestedSurfaces.includes('private-history'));assert.equal(row.shell,row.family==='workspace'?'workspace.js':'site.js');}
}
test('every generated route carries the complete independent canonical inventory with honest pending evidence',()=>validate(inventory));
test('omitted route, omitted contract and fabricated browser acceptance fail the inventory check',()=>{
 for(const mutate of [v=>v.routes.pop(),v=>v.features.pop(),v=>v.routes[0].contracts.pop(),v=>v.routes[0].nestedSurfaces=v.routes[0].nestedSurfaces.filter(id=>id!=='regex-builder'),v=>v.routes[0].status='verified',v=>v.routes[0].browserEvidence.push('invented')]){const value=structuredClone(inventory);mutate(value);assert.throws(()=>validate(value));}
});
